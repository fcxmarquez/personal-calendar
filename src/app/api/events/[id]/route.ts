import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  deleteGoogleEvent,
  getGoogleAccount,
  getValidAccessToken,
  updateGoogleEvent,
} from "@/lib/google/calendar-client";

const EVENT_COLORS = ["blue", "red", "green", "yellow", "purple", "pink"] as const;

const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  color: z.enum(EVENT_COLORS).optional(),
});

const eventFields = {
  id: events.id,
  title: events.title,
  description: events.description,
  startAt: events.startAt,
  endAt: events.endAt,
  allDay: events.allDay,
  color: events.color,
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Fetch current event to validate cross-field constraints and get googleEventId
  const [current] = await db
    .select({
      startAt: events.startAt,
      endAt: events.endAt,
      allDay: events.allDay,
      title: events.title,
      description: events.description,
      googleEventId: events.googleEventId,
    })
    .from(events)
    .where(and(eq(events.id, id), eq(events.userId, session.user.id)));

  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const newStartAt = parsed.data.startAt ? new Date(parsed.data.startAt) : current.startAt;
  const newEndAt = parsed.data.endAt ? new Date(parsed.data.endAt) : current.endAt;

  if (newEndAt <= newStartAt) {
    return NextResponse.json({ error: "End must be after start" }, { status: 400 });
  }

  const [event] = await db
    .update(events)
    .set({ ...parsed.data, startAt: newStartAt, endAt: newEndAt, updatedAt: new Date() })
    .where(and(eq(events.id, id), eq(events.userId, session.user.id)))
    .returning(eventFields);

  // Best-effort: push update to Google Calendar
  const userId = session.user.id;
  if (current.googleEventId) {
    void (async () => {
      try {
        const account = await getGoogleAccount(userId);
        if (!account) return;
        const accessToken = await getValidAccessToken(account);
        if (!accessToken) return;
        await updateGoogleEvent(accessToken, current.googleEventId!, {
          title: parsed.data.title ?? current.title,
          description: parsed.data.description ?? current.description,
          startAt: newStartAt,
          endAt: newEndAt,
          allDay: parsed.data.allDay ?? current.allDay,
        });
      } catch (err) {
        console.error("Google Calendar update failed", id, err);
      }
    })();
  }

  return NextResponse.json(event);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const [event] = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, session.user.id)))
    .returning({ id: events.id, googleEventId: events.googleEventId });

  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Best-effort: delete from Google Calendar
  const userId = session.user.id;
  if (event.googleEventId) {
    void (async () => {
      try {
        const account = await getGoogleAccount(userId);
        if (!account) return;
        const accessToken = await getValidAccessToken(account);
        if (!accessToken) return;
        await deleteGoogleEvent(accessToken, event.googleEventId!);
      } catch (err) {
        console.error("Google Calendar delete failed", id, err);
      }
    })();
  }

  return NextResponse.json({ success: true });
}

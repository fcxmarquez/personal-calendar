import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  createGoogleEvent,
  getGoogleAccount,
  getValidAccessToken,
} from "@/lib/google/calendar-client";

const EVENT_COLORS = ["blue", "red", "green", "yellow", "purple", "pink"] as const;

const createEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    allDay: z.boolean().optional().default(false),
    color: z.enum(EVENT_COLORS).optional().default("blue"),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: "End must be after start",
    path: ["endAt"],
  });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const conditions = [eq(events.userId, session.user.id)];

  if (from) {
    const fromDate = new Date(from);
    if (isNaN(fromDate.getTime()))
      return NextResponse.json({ error: "Invalid 'from' date" }, { status: 400 });
    conditions.push(gte(events.startAt, fromDate));
  }
  if (to) {
    const toDate = new Date(to);
    if (isNaN(toDate.getTime()))
      return NextResponse.json({ error: "Invalid 'to' date" }, { status: 400 });
    conditions.push(lte(events.endAt, toDate));
  }

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      description: events.description,
      startAt: events.startAt,
      endAt: events.endAt,
      allDay: events.allDay,
      color: events.color,
    })
    .from(events)
    .where(and(...conditions))
    .orderBy(events.startAt);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { title, description, startAt, endAt, allDay, color } = parsed.data;

  const [event] = await db
    .insert(events)
    .values({
      userId: session.user.id,
      title,
      description,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      allDay,
      color,
    })
    .returning({
      id: events.id,
      title: events.title,
      description: events.description,
      startAt: events.startAt,
      endAt: events.endAt,
      allDay: events.allDay,
      color: events.color,
    });

  // Best-effort: push to Google Calendar and save the googleEventId back
  const userId = session.user.id;
  void (async () => {
    try {
      const account = await getGoogleAccount(userId);
      if (!account) return;
      const accessToken = await getValidAccessToken(account);
      if (!accessToken) return;
      const googleEventId = await createGoogleEvent(accessToken, {
        title: event.title,
        description: event.description,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
      });
      if (googleEventId) {
        await db
          .update(events)
          .set({ googleEventId })
          .where(eq(events.id, event.id));
      }
    } catch (err) {
      console.error("Google Calendar push failed for new event", err);
    }
  })();

  return NextResponse.json(event, { status: 201 });
}

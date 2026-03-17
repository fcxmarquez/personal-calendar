import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const EVENT_COLORS = ["blue", "red", "green", "yellow", "purple", "pink"] as const;

const updateEventSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    allDay: z.boolean().optional(),
    color: z.enum(EVENT_COLORS).optional(),
  })
  .refine(
    (data) =>
      !data.startAt ||
      !data.endAt ||
      new Date(data.endAt) > new Date(data.startAt),
    { message: "End must be after start", path: ["endAt"] }
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.startAt) updates.startAt = new Date(parsed.data.startAt);
  if (parsed.data.endAt) updates.endAt = new Date(parsed.data.endAt);

  const [event] = await db
    .update(events)
    .set(updates)
    .where(and(eq(events.id, id), eq(events.userId, session.user.id)))
    .returning();

  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const [event] = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, session.user.id)))
    .returning();

  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

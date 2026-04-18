import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/require-user";
import { createEventInput } from "@/lib/events/schemas";
import { createEvent, listEvents } from "@/lib/events/service";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  let from: Date | undefined;
  let to: Date | undefined;

  if (fromParam) {
    from = new Date(fromParam);
    if (isNaN(from.getTime())) {
      return NextResponse.json({ error: "Invalid 'from' date" }, { status: 400 });
    }
  }
  if (toParam) {
    to = new Date(toParam);
    if (isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid 'to' date" }, { status: 400 });
    }
  }

  const rows = await listEvents(auth.userId, { from, to });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = createEventInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const event = await createEvent(auth.userId, parsed.data);
  return NextResponse.json(event, { status: 201 });
}

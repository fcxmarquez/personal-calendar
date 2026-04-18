import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/require-user";
import { updateEventInput } from "@/lib/events/schemas";
import {
  deleteEvent,
  EventNotFoundError,
  EventValidationError,
  updateEvent,
} from "@/lib/events/service";

function validateId(id: string): NextResponse | null {
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }
  return null;
}

function handleServiceError(err: unknown): NextResponse {
  if (err instanceof EventNotFoundError) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (err instanceof EventValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  throw err;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const invalid = validateId(id);
  if (invalid) return invalid;

  const body = await req.json();
  const parsed = updateEventInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const event = await updateEvent(auth.userId, id, parsed.data);
    return NextResponse.json(event);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const invalid = validateId(id);
  if (invalid) return invalid;

  try {
    await deleteEvent(auth.userId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleServiceError(err);
  }
}

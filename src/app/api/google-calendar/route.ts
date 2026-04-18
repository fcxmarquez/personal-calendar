import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/require-user";
import {
  EventValidationError,
  syncFromGoogle,
} from "@/lib/events/service";

export async function POST() {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  try {
    const result = await syncFromGoogle(auth.userId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EventValidationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Google Calendar sync failed", err);
    return NextResponse.json(
      { error: "Failed to sync Google Calendar" },
      { status: 502 }
    );
  }
}

import { NextResponse } from "next/server";
import { auth } from "./config";

export type RequireUserResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requireUserId(): Promise<RequireUserResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId: session.user.id };
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { accounts, events } from "@/db/schema";
import { eq, and } from "drizzle-orm";

async function getValidAccessToken(account: {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  provider: string;
  providerAccountId: string;
}): Promise<string | null> {
  // Token still valid (with 60s buffer)
  if (
    account.access_token &&
    account.expires_at &&
    account.expires_at * 1000 > Date.now() + 60_000
  ) {
    return account.access_token;
  }

  if (!account.refresh_token) return null;

  // Refresh the token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: account.refresh_token,
    }),
  });

  if (!res.ok) return null;

  const tokens = await res.json();
  if (!tokens.access_token || typeof tokens.expires_in !== "number") return null;

  const newAccessToken: string = tokens.access_token;
  const newExpiresAt: number = Math.floor(Date.now() / 1000) + tokens.expires_in;

  await db
    .update(accounts)
    .set({ access_token: newAccessToken, expires_at: newExpiresAt })
    .where(
      and(
        eq(accounts.provider, account.provider),
        eq(accounts.providerAccountId, account.providerAccountId)
      )
    );

  return newAccessToken;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));

  if (!account) {
    return NextResponse.json({ error: "No Google account linked" }, { status: 400 });
  }

  const accessToken = await getValidAccessToken(account);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Google access token unavailable. Please sign in again." },
      { status: 401 }
    );
  }

  // Fetch events from Google Calendar (next 30 days)
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    console.error("Google Calendar API error", res.status);
    return NextResponse.json(
      { error: "Failed to fetch Google Calendar events" },
      { status: 502 }
    );
  }

  const data = await res.json();
  const googleEvents: Array<{
    id: string;
    summary?: string;
    description?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }> = data.items ?? [];

  const validEvents = googleEvents.filter((e) => e.start && e.end && e.summary);

  if (validEvents.length === 0) {
    return NextResponse.json({ synced: 0, total: 0 });
  }

  const rows = validEvents.map((gEvent) => ({
    userId,
    title: gEvent.summary!.slice(0, 200),
    description: gEvent.description ? gEvent.description.slice(0, 5000) : null,
    startAt: new Date(gEvent.start!.dateTime ?? gEvent.start!.date!),
    endAt: new Date(gEvent.end!.dateTime ?? gEvent.end!.date!),
    allDay: !!gEvent.start!.date,
    color: "green",
    googleEventId: gEvent.id,
  }));

  let synced = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const result = await db
        .insert(events)
        .values(row)
        .onConflictDoNothing({ target: [events.googleEventId, events.userId] })
        .returning({ id: events.id });
      if (result.length > 0) synced++;
    } catch (err) {
      errors.push(row.googleEventId ?? row.title);
      console.error("Failed to insert event", row.googleEventId, err);
    }
  }

  return NextResponse.json({
    synced,
    total: validEvents.length,
    ...(errors.length > 0 && { errors }),
  });
}

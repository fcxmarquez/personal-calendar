import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { accounts, events } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Get the user's Google access token
  const [account] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.provider, "google")
      )
    );

  if (!account?.access_token) {
    return NextResponse.json(
      { error: "No Google account linked" },
      { status: 400 }
    );
  }

  // Fetch events from Google Calendar (next 30 days)
  const timeMin = new Date().toISOString();
  const timeMax = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
    {
      headers: { Authorization: `Bearer ${account.access_token}` },
    }
  );

  if (!res.ok) {
    const error = await res.text();
    return NextResponse.json(
      { error: "Google Calendar API error", details: error },
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

  const validEvents = googleEvents.filter((e) => e.start && e.summary);

  if (validEvents.length === 0) {
    return NextResponse.json({ synced: 0, total: 0 });
  }

  // Batch insert, skip duplicates per user using conflict target
  const rows = validEvents.map((gEvent) => ({
    userId,
    title: gEvent.summary!,
    description: gEvent.description ?? null,
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

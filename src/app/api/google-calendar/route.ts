import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { events } from "@/db/schema";
import {
  getGoogleAccount,
  getValidAccessToken,
} from "@/lib/google/calendar-client";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const account = await getGoogleAccount(userId);
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
    // Google all-day end is exclusive (e.g. event on Mar 17 → end.date = "2026-03-18").
    // Store inclusive end to match locally-created events.
    endAt: (() => {
      if (gEvent.start!.date && gEvent.end!.date) {
        const d = new Date(gEvent.end!.date);
        d.setUTCDate(d.getUTCDate() - 1);
        return d;
      }
      return new Date(gEvent.end!.dateTime!);
    })(),
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
        .onConflictDoUpdate({
          target: [events.googleEventId, events.userId],
          set: {
            title: row.title,
            description: row.description,
            startAt: row.startAt,
            endAt: row.endAt,
            allDay: row.allDay,
            updatedAt: new Date(),
          },
        })
        .returning({ id: events.id });
      if (result.length > 0) synced++;
    } catch (err) {
      errors.push(row.googleEventId ?? row.title);
      console.error("Failed to upsert event", row.googleEventId, err);
    }
  }

  return NextResponse.json({
    synced,
    total: validEvents.length,
    ...(errors.length > 0 && { errors }),
  });
}

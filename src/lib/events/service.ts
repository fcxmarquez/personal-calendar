import { db } from "@/db";
import { events, syncState } from "@/db/schema";
import { eq, and, gte, lte, type SQL } from "drizzle-orm";
import {
  createGoogleEvent,
  deleteGoogleEvent,
  getGoogleAccessTokenForUser,
  listGoogleEvents,
  updateGoogleEvent,
} from "@/lib/google/calendar-client";
import type { CreateEventInput, UpdateEventInput } from "./schemas";
import { parseGoogleEventDates } from "./dates";
import {
  GOOGLE_SYNC_WINDOW_DAYS,
  MAX_EVENTS_PER_QUERY,
} from "@/lib/constants";
import type { EventColor } from "./colors";

const PUBLIC_FIELDS = {
  id: events.id,
  title: events.title,
  description: events.description,
  startAt: events.startAt,
  endAt: events.endAt,
  allDay: events.allDay,
  color: events.color,
} as const;

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  color: string;
}

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}

export class EventNotFoundError extends Error {
  constructor() {
    super("Event not found");
    this.name = "EventNotFoundError";
  }
}

export async function listEvents(
  userId: string,
  opts: { from?: Date; to?: Date } = {}
): Promise<EventRow[]> {
  const conditions: SQL[] = [eq(events.userId, userId)];
  if (opts.from) conditions.push(gte(events.startAt, opts.from));
  if (opts.to) conditions.push(lte(events.endAt, opts.to));

  return db
    .select(PUBLIC_FIELDS)
    .from(events)
    .where(and(...conditions))
    .orderBy(events.startAt)
    .limit(MAX_EVENTS_PER_QUERY);
}

export async function createEvent(
  userId: string,
  input: CreateEventInput
): Promise<EventRow> {
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);

  // Push to Google BEFORE the local insert so googleEventId is persisted
  // atomically. Inserting locally first and patching googleEventId afterwards
  // leaves a window where a concurrent syncFromGoogle could fetch the same
  // event from Google and upsert a duplicate row (the unique index on
  // (googleEventId, userId) doesn't catch it because our row's googleEventId
  // is still NULL). Google failures are non-fatal — we fall back to local-only.
  let googleEventId: string | null = null;
  const accessToken = await getGoogleAccessTokenForUser(userId);
  if (accessToken) {
    googleEventId = await createGoogleEvent(accessToken, {
      title: input.title,
      description: input.description ?? null,
      startAt,
      endAt,
      allDay: input.allDay,
    });
  }

  const [event] = await db
    .insert(events)
    .values({
      userId,
      title: input.title,
      description: input.description ?? null,
      startAt,
      endAt,
      allDay: input.allDay,
      color: input.color,
      googleEventId,
    })
    .returning(PUBLIC_FIELDS);

  return event;
}

export async function updateEvent(
  userId: string,
  id: string,
  input: UpdateEventInput
): Promise<EventRow> {
  if (Object.keys(input).length === 0) {
    throw new EventValidationError("No fields to update");
  }

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
    .where(and(eq(events.id, id), eq(events.userId, userId)));

  if (!current) throw new EventNotFoundError();

  const newStartAt = input.startAt ? new Date(input.startAt) : current.startAt;
  const newEndAt = input.endAt ? new Date(input.endAt) : current.endAt;

  if (newEndAt <= newStartAt) {
    throw new EventValidationError("End must be after start");
  }

  const updates: Partial<typeof events.$inferInsert> = {
    startAt: newStartAt,
    endAt: newEndAt,
    updatedAt: new Date(),
  };
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.allDay !== undefined) updates.allDay = input.allDay;
  if (input.color !== undefined) updates.color = input.color;

  const [event] = await db
    .update(events)
    .set(updates)
    .where(and(eq(events.id, id), eq(events.userId, userId)))
    .returning(PUBLIC_FIELDS);

  if (current.googleEventId) {
    const accessToken = await getGoogleAccessTokenForUser(userId);
    if (accessToken) {
      await updateGoogleEvent(accessToken, current.googleEventId, {
        title: input.title ?? current.title,
        description: input.description ?? current.description,
        startAt: newStartAt,
        endAt: newEndAt,
        allDay: input.allDay ?? current.allDay,
      });
    }
  }

  return event;
}

export async function deleteEvent(userId: string, id: string): Promise<void> {
  const [deleted] = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, userId)))
    .returning({
      id: events.id,
      googleEventId: events.googleEventId,
    });

  if (!deleted) throw new EventNotFoundError();

  if (deleted.googleEventId) {
    const accessToken = await getGoogleAccessTokenForUser(userId);
    if (accessToken) {
      await deleteGoogleEvent(accessToken, deleted.googleEventId);
    }
  }
}

export interface SyncResult {
  synced: number;
  total: number;
  errors?: string[];
  fullResync?: boolean;
}

/**
 * Pulls events from the user's primary Google calendar and upserts them.
 *
 * Strategy:
 *   - First run (no stored sync token) → window-based sync over the next
 *     GOOGLE_SYNC_WINDOW_DAYS. Google returns a sync token we persist.
 *   - Subsequent runs → incremental sync using the stored token. Google
 *     returns only events that changed since the last sync.
 *   - If the token is expired (410 Gone), we clear it and retry as a full
 *     window sync, returning fullResync: true so callers can notice.
 *
 * Events marked "cancelled" by Google are deleted locally when encountered
 * through incremental sync — this is how deletions propagate.
 */
export async function syncFromGoogle(userId: string): Promise<SyncResult> {
  const accessToken = await getGoogleAccessTokenForUser(userId);
  if (!accessToken) {
    throw new EventValidationError(
      "Google access token unavailable. Please sign in again."
    );
  }

  const [state] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.userId, userId));

  const storedToken = state?.googleSyncToken ?? null;
  const timeMin = new Date().toISOString();
  const timeMax = new Date(
    Date.now() + GOOGLE_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  let result = await listGoogleEvents(
    accessToken,
    storedToken ? { syncToken: storedToken } : { timeMin, timeMax }
  );

  let fullResync = false;
  if (result?.syncTokenExpired) {
    fullResync = true;
    result = await listGoogleEvents(accessToken, { timeMin, timeMax });
  }

  if (!result) {
    throw new Error("Failed to fetch Google Calendar events");
  }

  let synced = 0;
  let deletions = 0;
  const errors: string[] = [];

  for (const gEvent of result.items) {
    try {
      if (gEvent.status === "cancelled") {
        const res = await db
          .delete(events)
          .where(
            and(
              eq(events.googleEventId, gEvent.id),
              eq(events.userId, userId)
            )
          )
          .returning({ id: events.id });
        if (res.length > 0) deletions++;
        continue;
      }

      if (!gEvent.start || !gEvent.end || !gEvent.summary) continue;

      const { startAt, endAt, allDay } = parseGoogleEventDates(
        gEvent.start,
        gEvent.end
      );

      const res = await db
        .insert(events)
        .values({
          userId,
          title: gEvent.summary.slice(0, 200),
          description: gEvent.description
            ? gEvent.description.slice(0, 5000)
            : null,
          startAt,
          endAt,
          allDay,
          color: "green" as EventColor,
          googleEventId: gEvent.id,
        })
        .onConflictDoUpdate({
          target: [events.googleEventId, events.userId],
          set: {
            title: gEvent.summary.slice(0, 200),
            description: gEvent.description
              ? gEvent.description.slice(0, 5000)
              : null,
            startAt,
            endAt,
            allDay,
            updatedAt: new Date(),
          },
        })
        .returning({ id: events.id });
      if (res.length > 0) synced++;
    } catch (err) {
      errors.push(gEvent.id);
      console.error("Failed to upsert event", gEvent.id, err);
    }
  }

  if (result.nextSyncToken) {
    await db
      .insert(syncState)
      .values({
        userId,
        googleSyncToken: result.nextSyncToken,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: syncState.userId,
        set: {
          googleSyncToken: result.nextSyncToken,
          lastSyncedAt: new Date(),
        },
      });
  }

  return {
    synced: synced + deletions,
    total: result.items.length,
    ...(errors.length > 0 && { errors }),
    ...(fullResync && { fullResync: true }),
  };
}

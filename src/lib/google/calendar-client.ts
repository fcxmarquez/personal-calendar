import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/lib/env";
import { TOKEN_REFRESH_BUFFER_MS } from "@/lib/constants";
import {
  inclusiveToExclusiveEnd,
  toGoogleDateOnly,
} from "@/lib/events/dates";

// ── Token management ──────────────────────────────────────────────────────────

type AccountRow = typeof accounts.$inferSelect;

export async function getGoogleAccount(userId: string): Promise<AccountRow | null> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));
  return account ?? null;
}

/**
 * Two concurrent requests can each refresh the token; the last DB write wins.
 * Both tokens stay valid briefly with Google, and subsequent calls will read
 * whichever was persisted last. Serializing refresh would need a lock — not
 * worth it for a single-user app.
 */
export async function getValidAccessToken(account: AccountRow): Promise<string | null> {
  if (
    account.access_token &&
    account.expires_at &&
    account.expires_at * 1000 > Date.now() + TOKEN_REFRESH_BUFFER_MS
  ) {
    return account.access_token;
  }

  if (!account.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: account.refresh_token,
    }),
  });

  if (!res.ok) return null;

  const tokens = await res.json();
  if (!tokens.access_token || typeof tokens.expires_in !== "number") return null;

  const newAccessToken: string = tokens.access_token;
  const newExpiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

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

/**
 * Resolves the Google access token for a user. Returns null if the user has
 * no linked Google account or the token cannot be refreshed — callers should
 * treat null as "skip Google sync" rather than a hard error, since local
 * state is the source of truth.
 */
export async function getGoogleAccessTokenForUser(userId: string): Promise<string | null> {
  const account = await getGoogleAccount(userId);
  if (!account) return null;
  return getValidAccessToken(account);
}

// ── Event payload builder ─────────────────────────────────────────────────────

interface EventPayload {
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
}

function buildGoogleEventBody(event: EventPayload) {
  const base = {
    summary: event.title,
    description: event.description ?? undefined,
  };

  if (event.allDay) {
    return {
      ...base,
      start: { date: toGoogleDateOnly(event.startAt) },
      end: { date: toGoogleDateOnly(inclusiveToExclusiveEnd(event.endAt)) },
    };
  }

  return {
    ...base,
    start: { dateTime: event.startAt.toISOString() },
    end: { dateTime: event.endAt.toISOString() },
  };
}

// ── Google Calendar API wrappers ──────────────────────────────────────────────

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export async function createGoogleEvent(
  accessToken: string,
  event: EventPayload
): Promise<string | null> {
  try {
    const res = await fetch(CALENDAR_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGoogleEventBody(event)),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id ?? null;
  } catch (err) {
    console.error("createGoogleEvent failed", err);
    return null;
  }
}

export async function updateGoogleEvent(
  accessToken: string,
  googleEventId: string,
  event: EventPayload
): Promise<boolean> {
  try {
    const res = await fetch(`${CALENDAR_BASE}/${googleEventId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGoogleEventBody(event)),
    });
    return res.ok;
  } catch (err) {
    console.error("updateGoogleEvent failed", err);
    return false;
  }
}

export async function deleteGoogleEvent(
  accessToken: string,
  googleEventId: string
): Promise<boolean> {
  try {
    const res = await fetch(`${CALENDAR_BASE}/${googleEventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok || res.status === 404;
  } catch (err) {
    console.error("deleteGoogleEvent failed", err);
    return false;
  }
}

// ── Listing & sync ─────────────────────────────────────────────────────────────

export interface GoogleEventItem {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export interface ListGoogleEventsResult {
  items: GoogleEventItem[];
  nextSyncToken: string | null;
  /** True if Google returned 410 Gone — caller must fall back to a full sync. */
  syncTokenExpired: boolean;
}

/**
 * Lists primary-calendar events. Pass `syncToken` for incremental sync, or
 * `timeMin`/`timeMax` for a window-based sync. When Google returns 410 Gone
 * (sync token expired), we signal the caller to restart with a full sync.
 */
export async function listGoogleEvents(
  accessToken: string,
  opts: { syncToken?: string; timeMin?: string; timeMax?: string }
): Promise<ListGoogleEventsResult | null> {
  const params = new URLSearchParams({ singleEvents: "true" });
  if (opts.syncToken) {
    params.set("syncToken", opts.syncToken);
  } else {
    if (opts.timeMin) params.set("timeMin", opts.timeMin);
    if (opts.timeMax) params.set("timeMax", opts.timeMax);
    params.set("orderBy", "startTime");
  }

  const items: GoogleEventItem[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    if (pageToken) params.set("pageToken", pageToken);
    else params.delete("pageToken");
    const res = await fetch(`${CALENDAR_BASE}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 410) {
      return { items: [], nextSyncToken: null, syncTokenExpired: true };
    }
    if (!res.ok) {
      console.error("listGoogleEvents failed", res.status);
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data.items)) items.push(...data.items);
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  return { items, nextSyncToken, syncTokenExpired: false };
}

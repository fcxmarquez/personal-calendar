import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// ── Token management ──────────────────────────────────────────────────────────

type AccountRow = typeof accounts.$inferSelect;

export async function getGoogleAccount(userId: string): Promise<AccountRow | null> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));
  return account ?? null;
}

export async function getValidAccessToken(account: AccountRow): Promise<string | null> {
  // Token still valid (with 60s buffer)
  if (
    account.access_token &&
    account.expires_at &&
    account.expires_at * 1000 > Date.now() + 60_000
  ) {
    return account.access_token;
  }

  if (!account.refresh_token) return null;

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
    // Google all-day events use exclusive end dates (end = last day + 1)
    const endExclusive = new Date(event.endAt);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return {
      ...base,
      start: { date: event.startAt.toISOString().split("T")[0] },
      end: { date: endExclusive.toISOString().split("T")[0] },
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

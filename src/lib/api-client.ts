import type { CalendarEvent } from "@/components/calendar/types";
import type { CreateEventInput, UpdateEventInput } from "@/lib/events/schemas";

export interface SyncResult {
  synced: number;
  total: number;
  errors?: string[];
}

export const eventKeys = {
  all: ["events"] as const,
  month: (year: number, month: number) =>
    ["events", "month", year, month] as const,
};

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export async function fetchEvents(
  from: Date,
  to: Date
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return handle(await fetch(`/api/events?${params.toString()}`));
}

export async function createEventRequest(
  input: CreateEventInput
): Promise<CalendarEvent> {
  return handle(
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function updateEventRequest(
  id: string,
  input: UpdateEventInput
): Promise<CalendarEvent> {
  return handle(
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function deleteEventRequest(id: string): Promise<void> {
  const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export async function syncGoogleCalendarRequest(): Promise<SyncResult> {
  return handle(await fetch("/api/google-calendar", { method: "POST" }));
}

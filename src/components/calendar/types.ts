import type { EventColor } from "@/lib/events/colors";

/**
 * Event as seen by the client. Dates are ISO 8601 strings (UTC) because
 * JSON has no Date type — the server serializes dates to ISO strings and the
 * client consumes them as strings. Parse to Date only where needed (rendering,
 * comparisons) to keep the shape predictable.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: EventColor;
}

export type CalendarView = "month" | "week" | "day";

/**
 * Google Calendar all-day events use exclusive end dates: an event on Mar 17
 * arrives as `end.date = "2026-03-18"`. We store the inclusive end (the last
 * day the event covers) to match locally-created events.
 *
 * All-day dates are anchored to **local** midnight, not UTC midnight. The
 * calendar grid is built from local-timezone day arithmetic, so using UTC
 * midnight causes off-by-one rendering in any non-UTC timezone (an event on
 * "2026-03-17" could land in the Mar 16 cell for users west of UTC).
 */

function parseDateOnlyLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function exclusiveToInclusiveEnd(exclusiveDateStr: string): Date {
  const [y, m, d] = exclusiveDateStr.split("-").map(Number);
  return new Date(y, m - 1, d - 1);
}

export function inclusiveToExclusiveEnd(inclusiveDate: Date): Date {
  const d = new Date(inclusiveDate);
  d.setDate(d.getDate() + 1);
  return d;
}

export function toGoogleDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseGoogleEventDates(
  start: { dateTime?: string; date?: string },
  end: { dateTime?: string; date?: string }
): { startAt: Date; endAt: Date; allDay: boolean } {
  const allDay = !!start.date;
  if (allDay) {
    return {
      startAt: parseDateOnlyLocal(start.date!),
      endAt: exclusiveToInclusiveEnd(end.date!),
      allDay: true,
    };
  }
  return {
    startAt: new Date(start.dateTime!),
    endAt: new Date(end.dateTime!),
    allDay: false,
  };
}

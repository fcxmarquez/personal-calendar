export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  startAt: string | Date;
  endAt: string | Date;
  allDay: boolean;
  color: string;
}

export type CalendarView = "month" | "week" | "day";

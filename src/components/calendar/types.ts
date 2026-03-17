export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  startAt: string | Date;
  endAt: string | Date;
  allDay: boolean;
  color: string;
  googleEventId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type CalendarView = "month" | "week" | "day";

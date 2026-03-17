"use client";

import { useState } from "react";
import { addMonths, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { CalendarHeader } from "./calendar-header";
import { MonthView } from "./month-view";
import { EventDialog } from "./event-dialog";
import type { CalendarEvent } from "./types";

async function fetchEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
  const res = await fetch(
    `/api/events?from=${from.toISOString()}&to=${to.toISOString()}`
  );
  if (!res.ok) throw new Error("Failed to fetch events");
  return res.json();
}

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | undefined>();

  const from = startOfMonth(subMonths(currentDate, 1));
  const to = endOfMonth(addMonths(currentDate, 1));

  const { data: events = [], error } = useQuery({
    queryKey: ["events", from.toISOString(), to.toISOString()],
    queryFn: () => fetchEvents(from, to),
  });

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setSelectedEvent(undefined);
    setDialogOpen(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setSelectedDate(undefined);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelectedEvent(undefined);
      setSelectedDate(undefined);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">
        Failed to load events. Please refresh the page.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <CalendarHeader
        currentDate={currentDate}
        onPrev={() => setCurrentDate((d) => subMonths(d, 1))}
        onNext={() => setCurrentDate((d) => addMonths(d, 1))}
        onToday={() => setCurrentDate(new Date())}
      />
      <MonthView
        currentDate={currentDate}
        events={events}
        onDayClick={handleDayClick}
        onEventClick={handleEventClick}
      />
      <EventDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        defaultDate={selectedDate}
        event={selectedEvent}
      />
    </div>
  );
}

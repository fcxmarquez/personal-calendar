"use client";

import { useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  startOfDay,
  endOfDay,
  format,
} from "date-fns";
import { cn } from "@/lib/utils";
import { getColorClass } from "@/lib/events/colors";
import type { CalendarEvent } from "./types";

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

interface ParsedEvent extends CalendarEvent {
  startDate: Date;
  endDate: Date;
}

export function MonthView({
  currentDate,
  events,
  onDayClick,
  onEventClick,
}: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const parsed = useMemo<ParsedEvent[]>(
    () =>
      events.map((e) => ({
        ...e,
        startDate: new Date(e.startAt),
        endDate: new Date(e.endAt),
      })),
    [events]
  );

  const getEventsForDay = (day: Date) => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    return parsed.filter(
      (e) => e.startDate <= dayEnd && e.endDate >= dayStart
    );
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="grid grid-cols-7 border-b">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1">
        {days.map((day) => {
          const dayEvents = getEventsForDay(day);
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-24 border-b border-r p-1 cursor-pointer hover:bg-accent/50 transition-colors",
                !inMonth && "bg-muted/30"
              )}
              onClick={() => onDayClick(day)}
            >
              <div className="flex justify-end mb-1">
                <span
                  className={cn(
                    "text-sm w-7 h-7 flex items-center justify-center rounded-full",
                    today &&
                      "bg-primary text-primary-foreground font-semibold",
                    !inMonth && "text-muted-foreground",
                    !today && inMonth && "text-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    className={cn(
                      "w-full text-left text-xs px-1.5 py-0.5 rounded truncate",
                      getColorClass(event.color)
                    )}
                  >
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-xs text-muted-foreground px-1">
                    +{dayEvents.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { eventKeys, syncGoogleCalendarRequest } from "@/lib/api-client";

interface CalendarHeaderProps {
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function CalendarHeader({
  currentDate,
  onPrev,
  onNext,
  onToday,
}: CalendarHeaderProps) {
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: syncGoogleCalendarRequest,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
      toast.success(`Synced ${data.synced} events from Google Calendar`);
    },
    onError: () => {
      toast.error("Failed to sync Google Calendar");
    },
  });

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <Button variant="ghost" size="icon" onClick={onPrev}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNext}>
          <ChevronRight className="size-4" />
        </Button>
        <h2 className="text-lg font-semibold ml-2">
          {format(currentDate, "MMMM yyyy")}
        </h2>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => syncMutation.mutate()}
        disabled={syncMutation.isPending}
      >
        <RefreshCw
          className={`size-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`}
        />
        Sync Google Calendar
      </Button>
    </div>
  );
}

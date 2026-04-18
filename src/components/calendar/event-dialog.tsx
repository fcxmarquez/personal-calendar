"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CalendarEvent } from "./types";
import {
  COLOR_OPTIONS,
  DEFAULT_EVENT_COLOR,
  EVENT_COLORS,
  type EventColor,
} from "@/lib/events/colors";
import { DEFAULT_EVENT_DURATION_MS } from "@/lib/constants";
import {
  createEventRequest,
  deleteEventRequest,
  eventKeys,
  updateEventRequest,
} from "@/lib/api-client";

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

const formSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    startAt: z.string().min(1, "Start time is required"),
    endAt: z.string().min(1, "End time is required"),
    color: z.enum(EVENT_COLORS),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: "End must be after start",
    path: ["endAt"],
  });

type FormValues = z.infer<typeof formSchema>;

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  event?: CalendarEvent;
}

export function EventDialog({
  open,
  onOpenChange,
  defaultDate,
  event,
}: EventDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!event;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const defaultStart = defaultDate ?? new Date();
  const defaultEnd = new Date(
    defaultStart.getTime() + DEFAULT_EVENT_DURATION_MS
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      startAt: format(defaultStart, DATETIME_LOCAL_FORMAT),
      endAt: format(defaultEnd, DATETIME_LOCAL_FORMAT),
      color: DEFAULT_EVENT_COLOR,
    },
  });

  // Reset form whenever the dialog opens with a different event or date.
  // defaultDate/event are the only true inputs — form is deliberately omitted.
  useEffect(() => {
    if (!open) {
      setConfirmingDelete(false);
      return;
    }
    const start = event ? new Date(event.startAt) : (defaultDate ?? new Date());
    const end = event
      ? new Date(event.endAt)
      : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);
    form.reset({
      title: event?.title ?? "",
      description: event?.description ?? "",
      startAt: format(start, DATETIME_LOCAL_FORMAT),
      endAt: format(end, DATETIME_LOCAL_FORMAT),
      color: event?.color ?? DEFAULT_EVENT_COLOR,
    });
    setConfirmingDelete(false);
    // form identity is stable; excluding it avoids resetting on every re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event, defaultDate]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        title: values.title,
        description: values.description || undefined,
        startAt: new Date(values.startAt).toISOString(),
        endAt: new Date(values.endAt).toISOString(),
        color: values.color satisfies EventColor,
      };
      return isEditing
        ? updateEventRequest(event!.id, payload)
        : createEventRequest({ ...payload, allDay: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
      toast.success(isEditing ? "Event updated" : "Event created");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Failed to save event");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteEventRequest(event!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
      toast.success("Event deleted");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Failed to delete event");
      setConfirmingDelete(false);
    },
  });

  const handleDeleteClick = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    deleteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          className="space-y-4"
        >
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...form.register("title")} autoFocus />
            {form.formState.errors.title && (
              <p className="text-destructive text-sm">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              {...form.register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="startAt">Start</Label>
              <Input
                id="startAt"
                type="datetime-local"
                {...form.register("startAt")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endAt">End</Label>
              <Input
                id="endAt"
                type="datetime-local"
                {...form.register("endAt")}
              />
              {form.formState.errors.endAt && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.endAt.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Color</Label>
            <Select
              value={form.watch("color")}
              onValueChange={(val) =>
                form.setValue("color", val as EventColor)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: c.value }}
                      />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2">
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteClick}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending
                  ? "Deleting…"
                  : confirmingDelete
                    ? "Confirm delete?"
                    : "Delete"}
              </Button>
            )}
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? "Saving…"
                : isEditing
                  ? "Update"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

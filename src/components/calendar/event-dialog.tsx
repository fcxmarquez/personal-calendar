"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect } from "react";
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

const eventSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    startAt: z.string().min(1, "Start time is required"),
    endAt: z.string().min(1, "End time is required"),
    color: z.string().min(1),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: "End must be after start",
    path: ["endAt"],
  });

type EventFormValues = z.infer<typeof eventSchema>;

const COLORS = [
  { value: "blue", label: "Blue" },
  { value: "red", label: "Red" },
  { value: "green", label: "Green" },
  { value: "yellow", label: "Yellow" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
];

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

  const defaultStart = defaultDate ?? new Date();
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      description: "",
      startAt: format(defaultStart, "yyyy-MM-dd'T'HH:mm"),
      endAt: format(defaultEnd, "yyyy-MM-dd'T'HH:mm"),
      color: "blue",
    },
  });

  // Reset form whenever the dialog opens with a different event or date
  useEffect(() => {
    if (!open) return;
    const start = event ? new Date(event.startAt) : (defaultDate ?? new Date());
    const end = event
      ? new Date(event.endAt)
      : new Date(start.getTime() + 60 * 60 * 1000);
    form.reset({
      title: event?.title ?? "",
      description: event?.description ?? "",
      startAt: format(start, "yyyy-MM-dd'T'HH:mm"),
      endAt: format(end, "yyyy-MM-dd'T'HH:mm"),
      color: event?.color ?? "blue",
    });
  }, [open, event, defaultDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: async (values: EventFormValues) => {
      const url = isEditing ? `/api/events/${event.id}` : "/api/events";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          startAt: new Date(values.startAt).toISOString(),
          endAt: new Date(values.endAt).toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to save event");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success(isEditing ? "Event updated" : "Event created");
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast.error("Failed to save event");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/events/${event!.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event deleted");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Failed to delete event");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
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
            </div>
          </div>

          <div className="space-y-1">
            <Label>Color</Label>
            <Select
              defaultValue={(event?.color ?? "blue") || "blue"}
              onValueChange={(val) => val && form.setValue("color", val)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLORS.map((c) => (
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
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            )}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

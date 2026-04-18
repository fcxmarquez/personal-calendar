import { z } from "zod";
import { eventColorSchema, DEFAULT_EVENT_COLOR } from "./colors";

export const createEventInput = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    allDay: z.boolean().optional().default(false),
    color: eventColorSchema.optional().default(DEFAULT_EVENT_COLOR),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: "End must be after start",
    path: ["endAt"],
  });

export type CreateEventInput = z.infer<typeof createEventInput>;

export const updateEventInput = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  color: eventColorSchema.optional(),
});

export type UpdateEventInput = z.infer<typeof updateEventInput>;

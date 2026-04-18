import { z } from "zod";

export const EVENT_COLORS = [
  "blue",
  "red",
  "green",
  "yellow",
  "purple",
  "pink",
] as const;

export type EventColor = (typeof EVENT_COLORS)[number];

export const DEFAULT_EVENT_COLOR: EventColor = "blue";

export const eventColorSchema = z.enum(EVENT_COLORS);

export const COLOR_OPTIONS: ReadonlyArray<{ value: EventColor; label: string }> =
  EVENT_COLORS.map((c) => ({
    value: c,
    label: c.charAt(0).toUpperCase() + c.slice(1),
  }));

export const COLOR_CLASS_MAP: Record<EventColor, string> = {
  blue: "bg-blue-500 text-white",
  red: "bg-red-500 text-white",
  green: "bg-green-500 text-white",
  yellow: "bg-yellow-400 text-black",
  purple: "bg-purple-500 text-white",
  pink: "bg-pink-500 text-white",
};

export function getColorClass(color: string): string {
  return COLOR_CLASS_MAP[color as EventColor] ?? COLOR_CLASS_MAP[DEFAULT_EVENT_COLOR];
}

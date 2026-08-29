import type { Hours, MealKind } from "@/types/workspace";

/** Default full-day planning window: 09:00 to 20:30. */
export const DAY_START_MINUTES = 9 * 60;
export const DAY_END_MINUTES = 20 * 60 + 30;

export function toMinutes(clock: string): number {
  const [h, m] = clock.split(":");
  return Number(h) * 60 + Number(m);
}

export function toClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type OpenCheck = "open" | "closed" | "unknown";

/**
 * Whether an attraction is open for the whole visit.
 *
 * `unknown` is returned rather than assumed open: unresolved hours carry a
 * scoring penalty, while a known closure is a hard exclusion. Collapsing the
 * two would silently schedule visits to shut attractions.
 */
export function openDuring(
  hours: Hours | undefined,
  startMinutes: number,
  endMinutes: number,
): OpenCheck {
  if (!hours || hours.status === "unknown") return "unknown";
  if (hours.status === "closed") return "closed";
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  return startMinutes >= open && endMinutes <= close ? "open" : "closed";
}

export function fitsInDay(startMinutes: number, durationMinutes: number): boolean {
  return (
    startMinutes >= DAY_START_MINUTES &&
    startMinutes + durationMinutes <= DAY_END_MINUTES
  );
}

interface MealWindow {
  target: [number, number];
  acceptable: [number, number];
}

export const MEAL_WINDOWS: Record<MealKind, MealWindow> = {
  lunch: {
    target: [toMinutes("12:00"), toMinutes("13:00")],
    acceptable: [toMinutes("11:30"), toMinutes("13:45")],
  },
  dinner: {
    target: [toMinutes("18:00"), toMinutes("19:30")],
    acceptable: [toMinutes("17:30"), toMinutes("20:15")],
  },
};

export function inMealWindow(
  kind: MealKind,
  minutes: number,
  band: "target" | "acceptable",
): boolean {
  const [start, end] = MEAL_WINDOWS[kind][band];
  return minutes >= start && minutes <= end;
}

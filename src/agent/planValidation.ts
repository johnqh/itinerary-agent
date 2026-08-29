import type {
  Attraction,
  PlanDay,
  Restaurant,
  TripRequest,
} from "@/types/workspace";
import { DAY_END_MINUTES, DAY_START_MINUTES, openDuring, toMinutes } from "@/planner/time";

/**
 * Checks an agent-produced schedule against the rules that make an itinerary
 * followable at all.
 *
 * The optimizer runs as code the agent wrote, so its output is checked rather
 * than trusted. These are not quality preferences: each one makes the day
 * impossible to actually walk. A schedule that breaks any of them is rejected
 * and the deterministic planner answers instead, which is worse but real.
 *
 * Every violation is collected rather than failing at the first, so a rejected
 * plan can be diagnosed in one pass.
 */

export interface ValidationContext {
  trip: TripRequest;
  dates: string[];
  attractions: Attraction[];
  restaurants: Restaurant[];
}

export type ValidationResult =
  | { ok: true; violations: [] }
  | { ok: false; violations: string[] };

export function validateAgentPlan(
  days: PlanDay[],
  context: ValidationContext,
): ValidationResult {
  const violations: string[] = [];
  const attractionById = new Map(context.attractions.map((a) => [a.id, a]));
  const restaurantIds = new Set(context.restaurants.map((r) => r.id));
  const scheduledAttractions = new Map<string, string>();

  for (const day of days) {
    if (!context.dates.includes(day.date)) {
      violations.push(`${day.date} is not a date of this trip.`);
    }

    let previousEnd = -1;
    day.items.forEach((item, index) => {
      const start = toMinutes(item.startTime);
      const end = toMinutes(item.endTime);
      const label = `${item.refId} on ${day.date}`;

      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
        violations.push(`${label} has no usable start and end time.`);
        return;
      }

      if (start < DAY_START_MINUTES || end > DAY_END_MINUTES) {
        violations.push(`${label} falls outside the day window.`);
      }

      if (start < previousEnd) {
        violations.push(`${label} breaks the day's chronological order.`);
      }
      previousEnd = end;

      if (item.kind === "attraction") {
        const attraction = attractionById.get(item.refId);
        if (!attraction) {
          violations.push(`${label} refers to an attraction that was not discovered.`);
          return;
        }

        const seenOn = scheduledAttractions.get(item.refId);
        if (seenOn) {
          violations.push(
            `${item.refId} is scheduled more than once, on ${seenOn} and ${day.date}.`,
          );
        } else {
          scheduledAttractions.set(item.refId, day.date);
        }

        if (openDuring(attraction.hoursByDate[day.date], start, end) === "closed") {
          violations.push(`${label} is scheduled while it is closed.`);
        }
      } else if (!restaurantIds.has(item.refId)) {
        violations.push(`${label} refers to a restaurant that was not discovered.`);
      }

      void index;
    });

    for (const leg of day.legs) {
      const from = day.items[leg.fromIndex];
      const to = day.items[leg.toIndex];
      if (!from || !to) {
        violations.push(`A leg on ${day.date} points at an item that is not there.`);
        continue;
      }

      if (leg.mode === "transit" && (leg.transferCount ?? 0) > 0) {
        violations.push(
          `A transit leg on ${day.date} needs ${leg.transferCount} transfer(s); only direct transit is allowed.`,
        );
      }

      if (day.isCarDay && leg.mode === "transit") {
        violations.push(`A car day on ${day.date} cannot also use transit.`);
      }

      // The gap between two stops has to hold the journey between them.
      const gap = toMinutes(to.startTime) - toMinutes(from.endTime);
      if (leg.durationMinutes > gap) {
        violations.push(
          `Travel time on ${day.date} does not fit: ${leg.durationMinutes} min of travel into a ${gap} min gap.`,
        );
      }
    }
  }

  return violations.length === 0
    ? { ok: true, violations: [] }
    : { ok: false, violations };
}

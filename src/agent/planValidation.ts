import type {
  Attraction,
  ExclusionReason,
  LatLng,
  MealKind,
  PlanDay,
  Restaurant,
  TripRequest,
} from "@/types/workspace";
import {
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  inMealWindow,
  openDuring,
  parseClock,
} from "@/planner/time";
import { estimateTravel } from "@/planner/geo";
import { selectMode } from "@/planner/transport";

/**
 * Checks an agent-produced schedule against the rules that make an itinerary
 * followable at all.
 *
 * The optimizer runs as code the agent wrote, so its output is checked rather
 * than trusted. These are not quality preferences: each one makes the day
 * impossible to actually walk. A schedule that breaks any of them is rejected
 * and the deterministic planner answers instead, which is worse but real.
 *
 * The rule that took the most getting right is travel. Comparing the schedule's
 * gap against the solver's own leg duration checks nothing, because the solver
 * writes both numbers: a zero-minute leg makes any two stops adjacent. So the
 * journey is recomputed here from the discovered coordinates and the same mode
 * rules the deterministic planner obeys, and the solver's leg has to be at
 * least that long. Reserving more time than the model asks for is allowed;
 * reserving less is a claim about the world that nothing retrieved supports.
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

/** A stop, once its times have been read and its place resolved. */
interface Stop {
  start: number;
  end: number;
  location?: LatLng;
}

export function validateAgentPlan(
  days: PlanDay[],
  context: ValidationContext,
  excluded: ExclusionReason[],
): ValidationResult {
  const violations: string[] = [];
  const attractionById = new Map(context.attractions.map((a) => [a.id, a]));
  const restaurantById = new Map(context.restaurants.map((r) => [r.id, r]));
  const scheduledAttractions = new Map<string, string>();

  // One day per requested date, no more and no fewer. Checking only the days
  // that came back accepts an empty answer: the workspace renders day tabs from
  // the returned days, so a missing date is invisible rather than reported.
  const dayCount = new Map<string, number>();
  for (const day of days) {
    dayCount.set(day.date, (dayCount.get(day.date) ?? 0) + 1);
  }
  for (const date of context.dates) {
    const count = dayCount.get(date) ?? 0;
    if (count === 0) {
      violations.push(`The schedule has no day for ${date}.`);
    } else if (count > 1) {
      violations.push(`${date} appears ${count} times in the schedule.`);
    }
  }

  for (const day of days) {
    if (!context.dates.includes(day.date)) {
      violations.push(`${day.date} is not a date of this trip.`);
    }

    // A car day is only available to a traveller who has a car. The solver
    // declaring one otherwise returns an itinerary nobody can drive.
    if (day.isCarDay && !context.trip.hasRentalCar) {
      violations.push(
        `${day.date} is planned as a car day, but this trip has no rental car.`,
      );
    }

    const stops: (Stop | undefined)[] = new Array(day.items.length);
    const mealsSeen = new Set<MealKind>();
    let previousEnd = -1;

    day.items.forEach((item, index) => {
      const start = parseClock(item.startTime);
      const end = parseClock(item.endTime);
      const label = `${item.refId} on ${day.date}`;

      if (start === null || end === null || end <= start) {
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
        stops[index] = { start, end, location: attraction.location };

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

        // The visit duration is discovered, not negotiable. A one-minute slot
        // for an hour-long museum wins the same objective weight as the real
        // visit and packs a day with stops nobody can make.
        if (end - start < attraction.estimatedVisitMinutes) {
          violations.push(
            `${label} is given ${end - start} min but needs ${attraction.estimatedVisitMinutes} min.`,
          );
        }
        return;
      }

      const restaurant = restaurantById.get(item.refId);
      if (!restaurant) {
        violations.push(`${label} refers to a restaurant that was not discovered.`);
        return;
      }
      stops[index] = { start, end, location: restaurant.location };

      const meal = item.meal;
      if (meal !== "lunch" && meal !== "dinner") {
        violations.push(`${label} is a meal that is neither lunch nor dinner.`);
      } else {
        // A day gets at most one of each. A missing meal is not checked here:
        // an unseatable meal is a degraded result the workspace names, and
        // rejecting the whole schedule over it would discard a usable trip.
        if (mealsSeen.has(meal)) {
          violations.push(`${day.date} seats ${meal} twice.`);
        }
        mealsSeen.add(meal);

        if (!inMealWindow(meal, start, "acceptable")) {
          violations.push(
            `${label} seats ${meal} at ${item.startTime}, outside the ${meal} window.`,
          );
        }
      }

      if (openDuring(restaurant.hoursByDate[day.date], start, end) === "closed") {
        violations.push(`${label} is scheduled while it is closed.`);
      }
    });

    for (const leg of day.legs) {
      const from = stops[leg.fromIndex];
      const to = stops[leg.toIndex];
      if (!day.items[leg.fromIndex] || !day.items[leg.toIndex]) {
        violations.push(`A leg on ${day.date} points at an item that is not there.`);
        continue;
      }

      if (leg.toIndex !== leg.fromIndex + 1) {
        violations.push(
          `A leg on ${day.date} runs from stop ${leg.fromIndex + 1} to stop ${leg.toIndex + 1}, which are not consecutive stops.`,
        );
      }

      // No routing provider ran, so a transit line and its transfer count are
      // facts nothing retrieved. Emitting one would invent them.
      if (leg.mode === "transit") {
        violations.push(
          `A leg on ${day.date} travels by transit, but no transit data was retrieved on this run.`,
        );
      }

      if (leg.mode === "transit" && (leg.transferCount ?? 0) > 0) {
        violations.push(
          `A transit leg on ${day.date} needs ${leg.transferCount} transfer(s); only direct transit is allowed.`,
        );
      }

      if (day.isCarDay && leg.mode === "transit") {
        violations.push(`A car day on ${day.date} cannot also use transit.`);
      }

      if (!day.isCarDay && leg.mode === "car") {
        violations.push(`A leg on ${day.date} goes by car, but that day is not a car day.`);
      }

      // The gap between two stops has to hold the journey between them.
      if (from && to) {
        const gap = to.start - from.end;
        if (leg.durationMinutes > gap) {
          violations.push(
            `Travel time on ${day.date} does not fit: ${leg.durationMinutes} min of travel into a ${gap} min gap.`,
          );
        }
      }
    }

    // Every consecutive pair needs exactly one leg, and that leg is checked
    // against the coordinates rather than believed.
    for (let index = 0; index + 1 < day.items.length; index++) {
      const matching = day.legs.filter(
        (leg) => leg.fromIndex === index && leg.toIndex === index + 1,
      );
      if (matching.length === 0) {
        violations.push(
          `No leg on ${day.date} connects stop ${index + 1} to stop ${index + 2}.`,
        );
        continue;
      }
      if (matching.length > 1) {
        violations.push(
          `${matching.length} legs on ${day.date} connect stop ${index + 1} to stop ${index + 2}.`,
        );
      }

      const from = stops[index];
      const to = stops[index + 1];
      if (!from?.location || !to?.location) continue;

      const modelled = selectMode(estimateTravel(from.location, to.location), {
        isCarDay: day.isCarDay,
        pace: context.trip.pace,
      });

      for (const leg of matching) {
        if (leg.mode !== modelled.mode) {
          violations.push(
            `A leg on ${day.date} travels by ${leg.mode} where the travel model gives ${modelled.mode}.`,
          );
        }
        if (leg.durationMinutes < modelled.durationMinutes) {
          violations.push(
            `A leg on ${day.date} understates the journey: ${leg.durationMinutes} min for a trip the travel model puts at ${modelled.durationMinutes} min.`,
          );
        }
      }
    }
  }

  // Scheduled and excluded together have to account for every discovered
  // attraction exactly once. The excluded list drives both the map's excluded
  // pins and the diagnostics panel, so a gap or an overlap shows the traveller
  // an attraction that is somehow in the trip and out of it at the same time.
  const excludedCount = new Map<string, number>();
  for (const entry of excluded) {
    excludedCount.set(entry.attractionId, (excludedCount.get(entry.attractionId) ?? 0) + 1);

    if (!attractionById.has(entry.attractionId)) {
      violations.push(`${entry.attractionId} is excluded but was never discovered.`);
    } else if (scheduledAttractions.has(entry.attractionId)) {
      violations.push(`${entry.attractionId} is both scheduled and excluded.`);
    }

    if (!entry.reason.trim()) {
      violations.push(`${entry.attractionId} is excluded with no reason given.`);
    }
  }
  for (const [id, count] of excludedCount) {
    if (count > 1) violations.push(`${id} is excluded ${count} times.`);
  }
  for (const attraction of context.attractions) {
    if (
      !scheduledAttractions.has(attraction.id) &&
      !excludedCount.has(attraction.id)
    ) {
      violations.push(`${attraction.id} is neither scheduled nor accounted for as excluded.`);
    }
  }

  return violations.length === 0
    ? { ok: true, violations: [] }
    : { ok: false, violations };
}

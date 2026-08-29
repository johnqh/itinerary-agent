import { haversineMeters } from "@/planner/geo";
import type { LatLng, MealKind, Restaurant, TripRequest } from "@/types/workspace";

/**
 * The meal rules the deterministic planner and the agent-plan validator have to
 * agree on.
 *
 * They live here rather than inside the day builder because two callers now
 * depend on them meaning the same thing. The builder uses them to place a meal;
 * the validator uses them to decide whether an agent-placed meal is one. If the
 * two drifted apart, the validator would either reject the fallback the product
 * answers with, or wave through a meal the planner would have refused to seat.
 */

/**
 * How long a sitting takes.
 *
 * A meal is a block of the day, not a checkbox. Without a floor a scheduler can
 * seat a one-minute lunch, clear the missing-meal warning it would otherwise
 * have earned, and hand nearly the whole meal block back to stops that score.
 */
export const MEAL_DURATIONS: Record<MealKind, number> = { lunch: 60, dinner: 75 };

/** Whether a restaurant serves any of the cuisines the traveller asked for. */
export function matchesCuisine(restaurant: Restaurant, cuisines: string[]): boolean {
  return restaurant.cuisine.some((c) =>
    cuisines.some((want) => c.toLowerCase() === want.toLowerCase()),
  );
}

/**
 * Whether the cuisine preference forbids this restaurant outright.
 *
 * Only `strong` is a constraint. `flexible` never detours for cuisine and
 * `prefer` settles for the nearest alternative and says so, so for both of them
 * a non-matching restaurant is a choice, not a violation. Under `strong` the
 * planner would rather report the meal unplaced than serve the wrong one, and a
 * meal seated wrongly is worse than a meal named as missing: it also silences
 * the degraded-state warning the traveller would otherwise see.
 */
export function violatesCuisineConstraint(
  restaurant: Restaurant,
  meals: TripRequest["meals"],
): boolean {
  if (meals.strictness !== "strong" || meals.cuisines.length === 0) return false;
  return !matchesCuisine(restaurant, meals.cuisines);
}

/**
 * The restaurant that adds least to the journey.
 *
 * A meal sits between two stops, so the cost of choosing it is the detour it
 * introduces — the way round through the restaurant, less the direct hop.
 * Measuring only the distance from the previous stop is what sends a traveller
 * backwards: somewhere beside the morning can be a long way from where the
 * afternoon begins.
 *
 * With no next stop — the last meal of a day — there is nothing to come back
 * from, so plain proximity is the right measure.
 */
export function leastDetour(
  pool: Restaurant[],
  before: LatLng,
  after: LatLng | null,
): Restaurant | null {
  if (pool.length === 0) return null;

  const cost = (spot: Restaurant): number => {
    const out = haversineMeters(before, spot.location);
    if (!after) return out;
    return out + haversineMeters(spot.location, after) - haversineMeters(before, after);
  };

  return pool.reduce((best, candidate) =>
    cost(candidate) < cost(best) ? candidate : best,
  );
}

/**
 * How far out of the way a cuisine preference may drag a meal.
 *
 * Roughly ten minutes of extra walking, there and back. "Prefer" has to mean
 * prefer when it is reasonable, not at any cost: without a ceiling it filters
 * to matching restaurants first and then picks the nearest of those, which can
 * put lunch on the wrong side of the city from both the stop before it and the
 * stop after.
 */
const PREFERENCE_DETOUR_BUDGET_METRES = 800;

function detourMetres(spot: Restaurant, before: LatLng, after: LatLng | null): number {
  const out = haversineMeters(before, spot.location);
  if (!after) return out;
  return out + haversineMeters(spot.location, after) - haversineMeters(before, after);
}

/**
 * Whether taking the preferred cuisine costs more walking than it is worth,
 * measured against the best option regardless of cuisine.
 */
export function worthTheDetour(
  preferred: Restaurant,
  bestOverall: Restaurant | null,
  before: LatLng,
  after: LatLng | null,
): boolean {
  if (!bestOverall) return true;
  const extra =
    detourMetres(preferred, before, after) - detourMetres(bestOverall, before, after);
  return extra <= PREFERENCE_DETOUR_BUDGET_METRES;
}

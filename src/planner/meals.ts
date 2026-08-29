import type { MealKind, Restaurant, TripRequest } from "@/types/workspace";

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

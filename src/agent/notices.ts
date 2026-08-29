import type { Plan, TripRequest } from "@/types/workspace";
import { SEED_DESTINATION } from "@/data/seed-tokyo";

/**
 * User-facing degraded-mode copy.
 *
 * Section 4.8 of the plan allows any amount of degradation and no silence: a
 * fallback the traveller cannot see is indistinguishable from a wrong answer.
 * These are pure so the wording is testable without mounting the workspace.
 */

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Whether the committed seed dataset actually covers this destination. */
export function hasSeedData(destination: string): boolean {
  const wanted = normalize(destination);
  if (!wanted) return false;
  const seed = normalize(SEED_DESTINATION);
  return wanted === seed || wanted === seed.split(",")[0]!.trim();
}

/**
 * Why the candidates on screen are what they are.
 *
 * Discovery is offline until the research tools land, so a destination the
 * seed dataset does not cover gets the seed city's attractions. Saying that
 * outright is the difference between a known limitation and a wrong itinerary.
 */
export function seedDiscoveryNotice(destination: string): string {
  if (hasSeedData(destination)) {
    return `Offline seed dataset for ${SEED_DESTINATION}. Live research tools are not connected yet, so these facts were not retrieved just now.`;
  }
  return `Live research tools are not connected yet, so only ${SEED_DESTINATION} has data. These candidates are the offline ${SEED_DESTINATION} seed dataset and are not in ${destination.trim()}.`;
}

/**
 * The labelled units of work discovery reports.
 *
 * The progress counter's denominator is this list's length, so every declared
 * unit is one the run actually completes and the bar always reaches its total.
 */
export function discoverySteps(dates: string[]): string[] {
  return [
    "Finding candidate attractions",
    "Collecting restaurant candidates",
    ...dates.map((date) => `Resolving opening hours for ${date}`),
  ];
}

/** What the planner could not do about meals, or null when there is nothing to say. */
export function mealNotice(plan: Plan | null, meals: TripRequest["meals"]): string | null {
  const parts: string[] = [];

  const unplaced = plan?.diagnostics.unplacedMeals ?? [];
  if (unplaced.length > 0) {
    const reasons = [...new Set(unplaced.map((m) => m.reason))];
    parts.push(
      `${unplaced.length} meal${unplaced.length === 1 ? "" : "s"} could not be seated. ${reasons.join(" ")}`,
    );
  }

  const notes = meals.notes?.trim();
  if (notes) {
    parts.push(
      `Dietary notes are recorded but not yet enforced when choosing restaurants: “${notes}”. Check the restaurant before you rely on it.`,
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

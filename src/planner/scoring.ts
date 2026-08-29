import type { Attraction, Rating } from "@/types/workspace";

/**
 * Attraction scoring and hard exclusion.
 *
 * Exclusion is a separate decision from scoring: a rating of 0 or a confirmed
 * closure removes an attraction outright, while everything else is expressed as
 * a weight the optimizer trades off.
 */

const INTEREST_WEIGHTS: Record<Rating, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 4,
  4: 7,
};

/** Unrated sits deliberately below "interested" but above "maybe". */
export const UNRATED_WEIGHT = 1.5;

export function interestWeight(rating: Rating | undefined): number {
  return rating === undefined ? UNRATED_WEIGHT : INTEREST_WEIGHTS[rating];
}

export const WEIGHTS = {
  confidence: 2,
  hoursKnownOpen: 2,
  unknownHoursPenalty: 1,
  travelPenaltyPerMinute: 0.05,
  duplicateCategoryPenalty: 0.75,
  ticketFrictionPenalty: 0.5,
} as const;

/**
 * Returns why an attraction cannot be scheduled at all, or null if it can.
 *
 * Unknown hours are never an exclusion. Refusing to schedule everything an
 * imperfect source could not resolve would empty most itineraries.
 */
export function excludeReason(
  attraction: Attraction,
  rating: Rating | undefined,
  tripDates: string[],
): string | null {
  if (rating === 0) {
    return "Rated not interested.";
  }

  const statuses = tripDates.map((date) => attraction.hoursByDate[date]);
  const everyDateKnownClosed =
    statuses.length > 0 &&
    statuses.every((hours) => hours?.status === "closed");
  if (everyDateKnownClosed) {
    return "Closed on every date of the trip.";
  }

  return null;
}

export interface ScoreContext {
  date: string;
  /** Travel time to reach this attraction from the previous stop. */
  travelMinutes: number;
  /** How many attractions of the same category are already in the day. */
  sameCategoryCount: number;
}

export function scoreAttraction(
  attraction: Attraction,
  rating: Rating | undefined,
  context: ScoreContext,
): number {
  let score = interestWeight(rating);

  score += attraction.confidence * WEIGHTS.confidence;

  const hours = attraction.hoursByDate[context.date];
  if (hours?.status === "open") {
    score += WEIGHTS.hoursKnownOpen;
  } else if (!hours || hours.status === "unknown") {
    score -= WEIGHTS.unknownHoursPenalty;
  }

  score -= context.travelMinutes * WEIGHTS.travelPenaltyPerMinute;
  score -= context.sameCategoryCount * WEIGHTS.duplicateCategoryPenalty;

  if (attraction.ticketRequired) {
    score -= WEIGHTS.ticketFrictionPenalty;
  }

  return score;
}

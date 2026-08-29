import type { Pace, TransportMode } from "@/types/workspace";

/**
 * Mode selection for a single leg.
 *
 * The rules are deliberately strict and deterministic. A violated transport
 * rule still produces a plausible-looking itinerary, so these decisions are
 * never left to a language model.
 */

export interface TransitOption {
  minutes: number;
  transferCount: number;
  lines: string[];
}

export interface TravelOption {
  walkMinutes: number;
  driveMinutes: number;
  driveMeters: number;
  transit?: TransitOption | null;
}

export interface ModeContext {
  isCarDay: boolean;
  pace: Pace;
}

export interface ModeDecision {
  mode: TransportMode;
  durationMinutes: number;
  fallbackReason?: string;
  transitLines?: string[];
  transferCount?: number;
}

/** No leg is ever walked beyond this, whatever the pace. */
export const WALK_ABSOLUTE_CAP_MINUTES = 25;

const WALK_THRESHOLDS: Record<Pace, number> = {
  relaxed: 12,
  balanced: 15,
  packed: 20,
};

export function walkThresholdMinutes(pace: Pace): number {
  return Math.min(WALK_THRESHOLDS[pace], WALK_ABSOLUTE_CAP_MINUTES);
}

/**
 * How much slower than a taxi a transit journey may be before it is rejected.
 *
 * A taxi is the wrong baseline for a traveller who declined a rental car: they
 * are not taking five taxis a day, so a journey being slower than driving is
 * expected rather than disqualifying. Measured San Francisco journeys came in
 * at roughly 2.1 to 2.4 times the driving time, which is ordinary city
 * transit; a limit of 2 rejected all of them and planned a transit-rich city
 * entirely by taxi. Three still rejects the genuinely bad recommendation — the
 * 46-minute ride against a 13-minute drive.
 */
export const TRANSIT_SLOWNESS_LIMIT = 3;

/**
 * How many changes a transit journey may ask of a traveller.
 *
 * One change is how a city is normally crossed; refusing it rejects most real
 * journeys and leaves a transit-rich city planned entirely by taxi. Two or
 * more turns a journey into an errand, and the itinerary's timing gets less
 * trustworthy with each connection that can be missed.
 *
 * Every consumer reads this constant rather than testing the count directly,
 * so the estimator, the live router, the validator and the agent's brief
 * cannot drift apart on what the rule is.
 */
export const MAX_TRANSIT_TRANSFERS = 1;

export function selectMode(
  option: TravelOption,
  ctx: ModeContext,
): ModeDecision {
  if (option.walkMinutes <= walkThresholdMinutes(ctx.pace)) {
    return { mode: "walk", durationMinutes: option.walkMinutes };
  }

  if (ctx.isCarDay) {
    return { mode: "car", durationMinutes: option.driveMinutes };
  }

  const rideshare = (fallbackReason: string): ModeDecision => ({
    mode: "rideshare",
    durationMinutes: option.driveMinutes,
    fallbackReason,
  });

  const transit = option.transit;
  if (!transit) {
    return rideshare("Transit data unavailable for this leg.");
  }

  if (transit.transferCount > MAX_TRANSIT_TRANSFERS) {
    return rideshare(
      `Transit needs ${transit.transferCount} changes; at most ${MAX_TRANSIT_TRANSFERS} is allowed.`,
    );
  }

  if (transit.minutes > TRANSIT_SLOWNESS_LIMIT * option.driveMinutes) {
    return rideshare(
      `Transit takes more than ${TRANSIT_SLOWNESS_LIMIT} times the rideshare estimate (${transit.minutes} vs ${option.driveMinutes} min).`,
    );
  }

  return {
    mode: "transit",
    durationMinutes: transit.minutes,
    transitLines: transit.lines,
    transferCount: transit.transferCount,
  };
}

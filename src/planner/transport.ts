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

/** Transit is rejected when it costs more than this multiple of driving. */
export const TRANSIT_SLOWNESS_LIMIT = 2;

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

  if (transit.transferCount > 0) {
    return rideshare(
      `Direct transit unavailable; the only route needs ${transit.transferCount} transfer(s).`,
    );
  }

  if (transit.minutes > TRANSIT_SLOWNESS_LIMIT * option.driveMinutes) {
    return rideshare(
      `Transit takes more than twice the rideshare estimate (${transit.minutes} vs ${option.driveMinutes} min).`,
    );
  }

  return {
    mode: "transit",
    durationMinutes: transit.minutes,
    transitLines: transit.lines,
    transferCount: transit.transferCount,
  };
}

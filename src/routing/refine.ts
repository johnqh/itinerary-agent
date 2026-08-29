import type { LatLng, Pace, RouteLeg, TransportMode } from "@/types/workspace";
import { estimateTravel } from "@/planner/geo";
import {
  MAX_TRANSIT_TRANSFERS,
  selectMode,
  TRANSIT_SLOWNESS_LIMIT,
  walkThresholdMinutes,
} from "@/planner/transport";
import {
  cacheKey,
  resolveRoute,
  type ResolvedRoute,
  type RouteRequest,
} from "@/routing/googleRoutes";

/**
 * Chooses a mode for one leg using measured travel, not modelled travel.
 *
 * The rules are unchanged — they are the ones documented in the plan — but the
 * numbers behind them are now real, which is what finally makes the
 * no-transfer rule mean something: until a provider reports transfer counts,
 * the rule can only ever reject routes we invented.
 *
 * Calls are made in the order the rules resolve, so a short walk costs one
 * request and only a genuinely ambiguous leg costs three.
 */

export type RouteResolver = (request: RouteRequest) => Promise<ResolvedRoute>;

export interface LegContext {
  isCarDay: boolean;
  pace: Pace;
}

export type ResolvedLeg = Omit<RouteLeg, "fromIndex" | "toIndex">;

async function tryResolve(
  resolve: RouteResolver,
  request: RouteRequest,
): Promise<ResolvedRoute | null> {
  try {
    return await resolve(request);
  } catch {
    return null;
  }
}

function toLeg(
  mode: TransportMode,
  route: ResolvedRoute,
  fallbackReason?: string,
): ResolvedLeg {
  return {
    mode,
    durationMinutes: route.durationMinutes,
    distanceMeters: route.distanceMeters,
    polyline: route.polyline,
    transitLines: mode === "transit" ? route.transitLines : undefined,
    transferCount: mode === "transit" ? route.transferCount : undefined,
    fallbackReason,
    estimated: false,
  };
}

/**
 * The last resort: keep the straight-line estimate and say it is one.
 *
 * Never returns transit. A line name or transfer count we did not retrieve
 * would be a fabricated fact, which is worse than an admitted estimate.
 */
function estimatedLeg(from: LatLng, to: LatLng, ctx: LegContext, reason: string): ResolvedLeg {
  const option = estimateTravel(from, to);
  const decision = selectMode(option, ctx);
  return {
    mode: decision.mode,
    durationMinutes: decision.durationMinutes,
    distanceMeters: option.driveMeters,
    transitLines: undefined,
    transferCount: undefined,
    fallbackReason: `${reason} Travel time is a straight-line estimate.`,
    estimated: true,
  };
}

export async function resolveLeg(
  from: LatLng,
  to: LatLng,
  ctx: LegContext,
  resolve: RouteResolver = resolveRoute,
): Promise<ResolvedLeg> {
  const walk = await tryResolve(resolve, { from, to, mode: "walk" });

  if (walk && walk.durationMinutes <= walkThresholdMinutes(ctx.pace)) {
    return toLeg("walk", walk);
  }

  if (ctx.isCarDay) {
    const car = await tryResolve(resolve, { from, to, mode: "car" });
    return car
      ? toLeg("car", car)
      : estimatedLeg(from, to, ctx, "Driving directions were unavailable.");
  }

  const [transit, drive] = await Promise.all([
    tryResolve(resolve, { from, to, mode: "transit" }),
    tryResolve(resolve, { from, to, mode: "rideshare" }),
  ]);

  if (!drive) {
    // Without a driving time there is nothing to judge transit against, and
    // nothing to fall back to either.
    return transit && transit.transferCount <= MAX_TRANSIT_TRANSFERS
      ? toLeg("transit", transit)
      : estimatedLeg(from, to, ctx, "Routing was unavailable for this leg.");
  }

  if (!transit) {
    return toLeg("rideshare", drive, "No transit route was available for this leg.");
  }

  if (transit.transferCount > MAX_TRANSIT_TRANSFERS) {
    return toLeg(
      "rideshare",
      drive,
      `Transit needs ${transit.transferCount} changes; at most ${MAX_TRANSIT_TRANSFERS} is allowed.`,
    );
  }

  if (transit.durationMinutes > TRANSIT_SLOWNESS_LIMIT * drive.durationMinutes) {
    return toLeg(
      "rideshare",
      drive,
      `Transit takes more than ${TRANSIT_SLOWNESS_LIMIT} times the rideshare estimate (${transit.durationMinutes} vs ${drive.durationMinutes} min).`,
    );
  }

  return toLeg("transit", transit);
}

/**
 * A per-session route cache. Replanning re-resolves the same legs constantly,
 * and a leg's travel time does not change between two clicks.
 */
export function createCachedResolver(inner: RouteResolver = resolveRoute): RouteResolver {
  const cache = new Map<string, Promise<ResolvedRoute>>();
  return (request) => {
    const key = cacheKey(request);
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = inner(request);
    cache.set(key, pending);
    // A failure must not be cached: the next attempt may be after the key is
    // fixed or the network returns.
    void pending.catch(() => cache.delete(key));
    return pending;
  };
}

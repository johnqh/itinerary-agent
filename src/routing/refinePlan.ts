import type {
  Attraction,
  LatLng,
  Plan,
  PlanDay,
  Restaurant,
  RouteLeg,
  TripRequest,
} from "@/types/workspace";
import { createCachedResolver, resolveLeg, type RouteResolver } from "@/routing/refine";
import { resolveRoute } from "@/routing/googleRoutes";

/**
 * Replaces a plan's estimated legs with measured ones.
 *
 * Only the legs the planner actually chose are resolved — never every candidate
 * pair — which is the single largest cost saving in the system: routing all
 * pairs is quadratic in the number of attractions, while routing the itinerary
 * is linear in its stops.
 *
 * The itinerary's times are left untouched. Re-timing a day from measured
 * travel is the scheduler's job, not this one's; changing arrival times here
 * would silently disagree with the schedule the traveller already read.
 */

export interface RefineContext {
  trip: TripRequest;
  attractions: Attraction[];
  restaurants: Restaurant[];
}

export interface RefineResult {
  plan: Plan;
  /** Null when routing answered; a user-facing reason when it did not. */
  degraded: string | null;
}

function positionsFor(context: RefineContext): Map<string, LatLng> {
  const positions = new Map<string, LatLng>();
  for (const a of context.attractions) positions.set(a.id, a.location);
  for (const r of context.restaurants) positions.set(r.id, r.location);
  return positions;
}

export async function refinePlanRoutes(
  plan: Plan,
  context: RefineContext,
  resolver: RouteResolver = createCachedResolver(resolveRoute),
): Promise<RefineResult> {
  const positions = positionsFor(context);
  let routeCalls = 0;
  let transitAccepted = 0;
  let transitRejected = 0;
  let firstFailure: string | null = null;

  const countingResolver: RouteResolver = async (request) => {
    routeCalls += 1;
    return resolver(request);
  };

  const days: PlanDay[] = [];
  for (const day of plan.days) {
    const legs: RouteLeg[] = [];

    for (const leg of day.legs) {
      const from = positions.get(day.items[leg.fromIndex]?.refId ?? "");
      const to = positions.get(day.items[leg.toIndex]?.refId ?? "");
      if (!from || !to) {
        legs.push(leg);
        continue;
      }

      const resolved = await resolveLeg(
        from,
        to,
        { isCarDay: day.isCarDay, pace: context.trip.pace },
        countingResolver,
      );

      if (resolved.estimated) {
        firstFailure ??= resolved.fallbackReason ?? "Routing was unavailable.";
      }
      if (resolved.mode === "transit") transitAccepted += 1;
      else if (resolved.fallbackReason?.match(/transit|transfer/i)) transitRejected += 1;

      legs.push({ ...resolved, fromIndex: leg.fromIndex, toIndex: leg.toIndex });
    }

    days.push({ ...day, legs });
  }

  const transportMinutes = days
    .flatMap((d) => d.legs)
    .reduce((sum, l) => sum + l.durationMinutes, 0);

  return {
    plan: {
      ...plan,
      days,
      diagnostics: {
        ...plan.diagnostics,
        routeCalls,
        transitAccepted,
        transitRejected,
        transportMinutes,
      },
    },
    degraded: firstFailure
      ? `${firstFailure} Travel times and modes are estimates for at least one leg.`
      : null,
  };
}

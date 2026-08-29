import type {
  Attraction,
  Hours,
  LatLng,
  Plan,
  PlanDay,
  PlanItem,
  Restaurant,
  RouteLeg,
  TripRequest,
} from "@/types/workspace";
import { DAY_END_MINUTES, openDuring, parseClock, toClock } from "@/planner/time";
import { createCachedResolver, resolveLeg, type RouteResolver } from "@/routing/refine";
import { resolveRoute } from "@/routing/googleRoutes";
import { departureInstant } from "@/routing/departure";

/**
 * Replaces a plan's estimated legs with measured ones.
 *
 * Only the legs the planner actually chose are resolved — never every candidate
 * pair — which is the single largest cost saving in the system: routing all
 * pairs is quadratic in the number of attractions, while routing the itinerary
 * is linear in its stops.
 *
 * The clock follows the measurement. Measured travel runs longer than modelled
 * travel more often than it runs shorter, and the schedule was written against
 * the model: committing the one and keeping the other left the traveller
 * reading a thirty-minute gap with a fifty-minute journey drawn across it,
 * arriving somewhere before they had left. Stops are pushed later only as far
 * as the journey in front of them demands, never pulled earlier — a journey
 * that turns out quicker buys slack, not a rewritten morning.
 *
 * Re-timing can push a day past the hour it was scheduled to end, or past the
 * hour a stop shuts. This does not re-plan the day for that: choosing what to
 * drop is the scheduler's job. It says so instead, because a plan the traveller
 * can see is broken beats one that is broken quietly.
 */

export interface RefineContext {
  trip: TripRequest;
  attractions: Attraction[];
  restaurants: Restaurant[];
  /**
   * The destination's IANA zone, when it is known. The itinerary is written in
   * the traveller's wall clock and the provider wants an instant, so without
   * this there is no honest way to ask about the right moment — and asking
   * about the wrong one is what made a spring trip come back described by this
   * afternoon's trains.
   */
  timeZone?: string;
}

export interface RefineResult {
  plan: Plan;
  /** Null when routing answered; a user-facing reason when it did not. */
  degraded: string | null;
}

/**
 * When the traveller leaves the stop this leg starts from.
 *
 * That is the moment the transit answer has to be about, and it is the end of
 * the previous stop rather than the start of the next: the gap between them is
 * the journey being asked about.
 *
 * Null whenever it cannot be established honestly — no zone, an unreadable
 * clock, or a departure already in the past, which the provider refuses. An
 * undated request falls back to being answered for now, which is the behaviour
 * this replaced; a wrongly dated one would put a real line name against a
 * service that is not running.
 */
function legDeparture(day: PlanDay, fromIndex: number, timeZone: string | undefined): string | undefined {
  const leaves = day.items[fromIndex]?.endTime;
  if (!leaves) return undefined;

  const instant = departureInstant(day.date, leaves, timeZone);
  if (!instant) return undefined;
  return Date.parse(instant) > Date.now() ? instant : undefined;
}

function positionsFor(context: RefineContext): Map<string, LatLng> {
  const positions = new Map<string, LatLng>();
  for (const a of context.attractions) positions.set(a.id, a.location);
  for (const r of context.restaurants) positions.set(r.id, r.location);
  return positions;
}

interface Retimed {
  items: PlanItem[];
  /** What the measured legs broke, in the traveller's words. Empty when nothing. */
  problems: string[];
}

/**
 * Re-lays the day's clock over its measured legs.
 *
 * Each stop keeps the length it was given and is moved to the first moment the
 * journey in front of it can actually deliver the traveller. An item whose
 * clock cannot be read is left exactly as it is, and breaks the chain rather
 * than letting a guess propagate down the rest of the day.
 */
function retimeDay(day: PlanDay, legs: RouteLeg[], context: RefineContext): Retimed {
  const arrivalTravel = new Map<number, number>();
  for (const leg of legs) {
    arrivalTravel.set(leg.toIndex, Math.max(arrivalTravel.get(leg.toIndex) ?? 0, leg.durationMinutes));
  }

  const named = new Map<string, { name: string; hours: Hours | undefined }>();
  for (const a of context.attractions) {
    named.set(a.id, { name: a.name, hours: a.hoursByDate[day.date] });
  }
  for (const r of context.restaurants) {
    named.set(r.id, { name: r.name, hours: r.hoursByDate[day.date] });
  }

  const items: PlanItem[] = [];
  const problems: string[] = [];
  let previousEnd: number | null = null;

  for (const [index, item] of day.items.entries()) {
    const start = parseClock(item.startTime);
    const end = parseClock(item.endTime);
    if (start === null || end === null) {
      items.push(item);
      previousEnd = null;
      continue;
    }

    const stay = Math.max(0, end - start);
    const earliest = previousEnd === null ? start : previousEnd + (arrivalTravel.get(index) ?? 0);
    const nextStart = Math.max(start, earliest);
    const nextEnd = nextStart + stay;
    previousEnd = nextEnd;

    const place = named.get(item.refId);
    const label = place?.name ?? item.refId;
    if (nextEnd > DAY_END_MINUTES) {
      problems.push(`${label} now runs past the end of the day`);
    } else if (openDuring(place?.hours, nextStart, nextEnd) === "closed") {
      problems.push(`${label} is closed by the time the measured journey arrives`);
    }

    items.push(
      nextStart === start
        ? item
        : { ...item, startTime: toClock(nextStart), endTime: toClock(nextEnd) },
    );
  }

  return { items, problems };
}

/**
 * One cache for the life of the module, which in a browser is the life of the
 * session. Building it per call would give every replan a cold cache and pay
 * Google again for legs whose travel time cannot have changed between two
 * clicks — which is the whole point of caching them.
 */
const sessionResolver: RouteResolver = createCachedResolver(resolveRoute);

export async function refinePlanRoutes(
  plan: Plan,
  context: RefineContext,
  resolver: RouteResolver = sessionResolver,
): Promise<RefineResult> {
  const positions = positionsFor(context);
  let routeCalls = 0;
  let transitAccepted = 0;
  let transitRejected = 0;
  let firstFailure: string | null = null;
  const infeasible: string[] = [];

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
        {
          isCarDay: day.isCarDay,
          pace: context.trip.pace,
          departureTime: legDeparture(day, leg.fromIndex, context.timeZone),
        },
        countingResolver,
      );

      if (resolved.estimated) {
        firstFailure ??= resolved.fallbackReason ?? "Routing was unavailable.";
      }
      if (resolved.mode === "transit") transitAccepted += 1;
      else if (resolved.fallbackReason?.match(/transit|transfer/i)) transitRejected += 1;

      legs.push({ ...resolved, fromIndex: leg.fromIndex, toIndex: leg.toIndex });
    }

    const retimed = retimeDay(day, legs, context);
    infeasible.push(...retimed.problems);
    days.push({ ...day, legs, items: retimed.items });
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
    degraded: [
      firstFailure && `${firstFailure} Travel times and modes are estimates for at least one leg.`,
      infeasible.length > 0 &&
        `Measured travel pushed the schedule later than planned: ${infeasible.join("; ")}. Plan again to have the days rebuilt around the real journeys.`,
    ]
      .filter((line): line is string => typeof line === "string")
      .join(" ") || null,
  };
}

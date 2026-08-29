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
import { DAY_END_MINUTES, inMealWindow, openDuring, parseClock, toClock } from "@/planner/time";
import { resolveLeg, type RouteResolver } from "@/routing/refine";
import { resolveRoute } from "@/routing/googleRoutes";
import { departureInstant } from "@/routing/departure";
import { browserCacheStorage, createPersistentRouteCache } from "@/routing/routeCache";

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

/**
 * One cache for the life of the page, not one per plan.
 *
 * Built here rather than as a default argument: a default is evaluated on every
 * call, so each replan was getting an empty cache and paying for every leg
 * again.
 */
const sharedResolver: RouteResolver = createPersistentRouteCache(
  resolveRoute,
  browserCacheStorage(),
);

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
 * the journey being asked about. The end used is the corrected one, after the
 * legs already measured have pushed the morning about.
 *
 * Undefined whenever it cannot be established honestly — no zone, no readable
 * clock, or a departure already in the past, which the provider refuses. An
 * undated request falls back to being answered for now, which is the behaviour
 * this replaced; a wrongly dated one would put a real line name against a
 * service that is not running.
 */
function legDeparture(
  date: string,
  leavesMinutes: number | null,
  timeZone: string | undefined,
): string | undefined {
  if (leavesMinutes === null) return undefined;

  const instant = departureInstant(date, toClock(leavesMinutes), timeZone);
  if (!instant) return undefined;
  return Date.parse(instant) > Date.now() ? instant : undefined;
}

function positionsFor(context: RefineContext): Map<string, LatLng> {
  const positions = new Map<string, LatLng>();
  for (const a of context.attractions) positions.set(a.id, a.location);
  for (const r of context.restaurants) positions.set(r.id, r.location);
  return positions;
}

function placesFor(day: PlanDay, context: RefineContext): Map<string, { name: string; hours: Hours | undefined }> {
  const places = new Map<string, { name: string; hours: Hours | undefined }>();
  for (const a of context.attractions) {
    places.set(a.id, { name: a.name, hours: a.hoursByDate[day.date] });
  }
  for (const r of context.restaurants) {
    places.set(r.id, { name: r.name, hours: r.hoursByDate[day.date] });
  }
  return places;
}


/** 23:59. The clock grammar has no way to write a later minute of the same day. */
const LAST_MINUTE_OF_DAY = 23 * 60 + 59;

export async function refinePlanRoutes(
  plan: Plan,
  context: RefineContext,
  resolver: RouteResolver = sharedResolver,
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
    const places = placesFor(day, context);
    const legByFrom = new Map<number, RouteLeg>();
    for (const leg of day.legs) legByFrom.set(leg.fromIndex, leg);

    const resolvedByFrom = new Map<number, RouteLeg>();
    const items: PlanItem[] = [];

    // The day is walked in order because the two corrections depend on each
    // other: a leg's departure is the corrected end of the stop it leaves,
    // and a stop's corrected start is the arrival the leg before it measured.
    // Resolving every leg first and re-timing afterwards asked the provider
    // about departures the re-timing then moved.
    let previousEnd: number | null = null;
    let travelIn = 0;

    for (const [index, item] of day.items.entries()) {
      const start = parseClock(item.startTime);
      const end = parseClock(item.endTime);

      let leaves: number | null = null;
      if (start === null || end === null) {
        // An unreadable clock is not a time to reason from. The item is left
        // exactly as written and the chain restarts at the next one rather
        // than propagating a guess through the rest of the day.
        items.push(item);
      } else {
        const stay = Math.max(0, end - start);
        const earliest = previousEnd === null ? start : previousEnd + travelIn;
        const nextStart = Math.max(start, earliest);
        const nextEnd = nextStart + stay;
        leaves = nextEnd;

        const place = places.get(item.refId);
        const label = place?.name ?? item.refId;
        if (nextEnd > DAY_END_MINUTES) {
          infeasible.push(`${label} now runs past the end of the day`);
        } else if (openDuring(place?.hours, nextStart, nextEnd) === "closed") {
          infeasible.push(`${label} is closed by the time the measured journey arrives`);
        } else if (item.meal && !inMealWindow(item.meal, nextStart, "acceptable")) {
          // A meal is not just a stop with a name: the plan validator rejects a
          // lunch seated after 13:45 outright, so refinement must not hand back
          // one it pushed there as though the day were still sound.
          infeasible.push(
            `${item.meal} at ${label} is now outside the hours it can be eaten in`,
          );
        }

        // Past midnight there is no hour of this day left to move the stop
        // into, and the clock grammar has no way to write one: "24:20" fails
        // the app's own parser and would reach the traveller as a time that
        // does not exist. The stop keeps what the scheduler gave it, and the
        // day is already reported as running past its end — a schedule visibly
        // beyond repair beats a schedule quietly outside its own contract.
        const writable = nextStart <= LAST_MINUTE_OF_DAY && nextEnd <= LAST_MINUTE_OF_DAY;
        items.push(
          nextStart === start || !writable
            ? item
            : { ...item, startTime: toClock(nextStart), endTime: toClock(nextEnd) },
        );
      }
      previousEnd = leaves;

      const leg = legByFrom.get(index);
      if (!leg) {
        travelIn = 0;
        continue;
      }

      const from = positions.get(day.items[leg.fromIndex]?.refId ?? "");
      const to = positions.get(day.items[leg.toIndex]?.refId ?? "");
      if (!from || !to) {
        resolvedByFrom.set(leg.fromIndex, leg);
        travelIn = leg.durationMinutes;
        continue;
      }

      const resolved = await resolveLeg(
        from,
        to,
        {
          isCarDay: day.isCarDay,
          pace: context.trip.pace,
          departureTime: legDeparture(day.date, leaves, context.timeZone),
        },
        countingResolver,
      );

      if (resolved.estimated) {
        firstFailure ??= resolved.fallbackReason ?? "Routing was unavailable.";
      }
      if (resolved.mode === "transit") transitAccepted += 1;
      else if (resolved.fallbackReason?.match(/transit|transfer/i)) transitRejected += 1;

      resolvedByFrom.set(leg.fromIndex, {
        ...resolved,
        fromIndex: leg.fromIndex,
        toIndex: leg.toIndex,
      });
      travelIn = resolved.durationMinutes;
    }

    // Rebuilt in the order the day already had them, so nothing downstream has
    // to care that they were resolved by walking the items.
    const legs = day.legs.map((leg) => resolvedByFrom.get(leg.fromIndex) ?? leg);
    days.push({ ...day, legs, items });
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

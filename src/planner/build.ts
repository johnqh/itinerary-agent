import type {
  Attraction,
  ExclusionReason,
  LatLng,
  MealKind,
  Pace,
  Plan,
  PlanDay,
  PlanItem,
  Rating,
  Restaurant,
  RouteLeg,
  TripRequest,
} from "@/types/workspace";
import { centroid, clusterByGeography, estimateTravel } from "@/planner/geo";
import { excludeReason, scoreAttraction } from "@/planner/scoring";
import { selectMode } from "@/planner/transport";
import {
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  MEAL_WINDOWS,
  openDuring,
  toClock,
  toMinutes,
} from "@/planner/time";

/**
 * The deterministic day builder.
 *
 * This is the greedy pass. It is also the fallback used whenever the sandbox
 * optimizer is unavailable, so it must always produce a feasible itinerary on
 * its own: worse ordering is acceptable, an infeasible schedule is not.
 *
 * Meals are placed as fixed anchors and attractions are filled around them.
 * Inserting meals afterwards makes it easy to produce a day that is chronologic
 * ally valid but has lunch at 16:00; anchoring makes that unrepresentable.
 */

export interface BuildPlanInput {
  trip: TripRequest;
  attractions: Attraction[];
  restaurants: Restaurant[];
  ratings: Record<string, Rating>;
}

const MEAL_DURATIONS: Record<MealKind, number> = { lunch: 60, dinner: 75 };

const MAX_ATTRACTIONS_PER_DAY: Record<Pace, number> = {
  relaxed: 4,
  balanced: 6,
  packed: 8,
};

export function tripDates(trip: TripRequest): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${trip.startDate}T00:00:00Z`);
  const end = new Date(`${trip.endDate}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

interface Segment {
  start: number;
  end: number;
}

interface FilledSegment {
  items: PlanItem[];
  endPosition: LatLng | null;
  endTime: number;
}

export function buildPlan(input: BuildPlanInput): Plan {
  const { trip, attractions, restaurants, ratings } = input;
  const dates = tripDates(trip);

  const excluded: ExclusionReason[] = [];
  const candidates: Attraction[] = [];
  for (const attraction of attractions) {
    const reason = excludeReason(attraction, ratings[attraction.id], dates);
    if (reason) {
      excluded.push({ attractionId: attraction.id, reason });
    } else {
      candidates.push(attraction);
    }
  }

  const clusters = clusterByGeography(candidates, dates.length);
  // Order clusters west-to-east so day assignment is stable across replans.
  const orderedClusters = [...clusters].sort(
    (a, b) => centroid(a.map((x) => x.location)).lng - centroid(b.map((x) => x.location)).lng,
  );

  const scheduled = new Set<string>();
  const days: PlanDay[] = [];

  dates.forEach((date, index) => {
    const pool = (orderedClusters[index] ?? []).filter((a) => !scheduled.has(a.id));
    const day = buildDay({ date, trip, pool, restaurants, ratings });
    for (const item of day.items) {
      if (item.kind === "attraction") scheduled.add(item.refId);
    }
    days.push(day);
  });

  for (const attraction of candidates) {
    if (!scheduled.has(attraction.id)) {
      excluded.push({
        attractionId: attraction.id,
        reason: "Did not fit the available time on any day.",
      });
    }
  }

  const attractionMinutes = days
    .flatMap((d) => d.items)
    .filter((i) => i.kind === "attraction")
    .reduce((sum, i) => sum + (toMinutes(i.endTime) - toMinutes(i.startTime)), 0);
  const transportMinutes = days
    .flatMap((d) => d.legs)
    .reduce((sum, l) => sum + l.durationMinutes, 0);
  const includedCount = days
    .flatMap((d) => d.items)
    .filter((i) => i.kind === "attraction").length;

  return {
    id: `plan-${dates[0] ?? "unknown"}`,
    version: 1,
    days,
    excludedAttractionIds: excluded.map((e) => e.attractionId),
    summary: `${includedCount} stops across ${days.length} day${days.length === 1 ? "" : "s"} in ${trip.destination}.`,
    diagnostics: {
      considered: attractions.length,
      included: includedCount,
      excluded,
      routeCalls: 0,
      cacheHits: 0,
      transitAccepted: 0,
      transitRejected: 0,
      attractionMinutes,
      transportMinutes,
      score: 0,
    },
  };
}

interface BuildDayInput {
  date: string;
  trip: TripRequest;
  pool: Attraction[];
  restaurants: Restaurant[];
  ratings: Record<string, Rating>;
}

function buildDay(input: BuildDayInput): PlanDay {
  const { date, trip, pool, restaurants, ratings } = input;
  const isCarDay = trip.hasRentalCar;
  const budget = MAX_ATTRACTIONS_PER_DAY[trip.pace];

  const lunchStart = MEAL_WINDOWS.lunch.target[0] + 30;
  const dinnerStart = MEAL_WINDOWS.dinner.target[0] + 30;
  const lunchEnd = lunchStart + MEAL_DURATIONS.lunch;
  const dinnerEnd = dinnerStart + MEAL_DURATIONS.dinner;

  const segments: Segment[] = [
    { start: DAY_START_MINUTES, end: lunchStart },
    { start: lunchEnd, end: dinnerStart },
    { start: dinnerEnd, end: DAY_END_MINUTES },
  ];

  const remaining = [...pool];
  const used: string[] = [];
  const filled: FilledSegment[] = [];
  let position: LatLng | null = null;

  for (const segment of segments) {
    const result = fillSegment({
      segment,
      date,
      pool: remaining,
      ratings,
      isCarDay,
      pace: trip.pace,
      startPosition: position,
      remainingBudget: budget - used.length,
    });
    for (const item of result.items) used.push(item.refId);
    for (const id of result.items.map((i) => i.refId)) {
      const index = remaining.findIndex((a) => a.id === id);
      if (index >= 0) remaining.splice(index, 1);
    }
    position = result.endPosition ?? position;
    filled.push(result);
  }

  const clusterCenter = centroid(pool.map((a) => a.location));
  const lunchSpot = pickRestaurant(
    restaurants,
    filled[0]?.endPosition ?? clusterCenter,
    date,
    { start: lunchStart, end: lunchEnd },
    trip.meals.cuisines,
    [],
  );
  const dinnerSpot = pickRestaurant(
    restaurants,
    filled[1]?.endPosition ?? filled[0]?.endPosition ?? clusterCenter,
    date,
    { start: dinnerStart, end: dinnerEnd },
    trip.meals.cuisines,
    lunchSpot ? [lunchSpot.id] : [],
  );

  const items: PlanItem[] = [...(filled[0]?.items ?? [])];
  if (lunchSpot) {
    items.push({
      kind: "meal",
      refId: lunchSpot.id,
      meal: "lunch",
      startTime: toClock(lunchStart),
      endTime: toClock(lunchEnd),
    });
  }
  items.push(...(filled[1]?.items ?? []));
  if (dinnerSpot) {
    items.push({
      kind: "meal",
      refId: dinnerSpot.id,
      meal: "dinner",
      startTime: toClock(dinnerStart),
      endTime: toClock(dinnerEnd),
    });
  }
  items.push(...(filled[2]?.items ?? []));

  const positions = new Map<string, LatLng>();
  for (const attraction of pool) positions.set(attraction.id, attraction.location);
  for (const spot of [lunchSpot, dinnerSpot]) {
    if (spot) positions.set(spot.id, spot.location);
  }

  const legs = buildLegs(items, positions, isCarDay, trip.pace);

  return {
    date,
    isCarDay,
    items,
    legs,
    summary: summarize(items, isCarDay),
  };
}

interface FillSegmentInput {
  segment: Segment;
  date: string;
  pool: Attraction[];
  ratings: Record<string, Rating>;
  isCarDay: boolean;
  pace: Pace;
  startPosition: LatLng | null;
  remainingBudget: number;
}

function fillSegment(input: FillSegmentInput): FilledSegment {
  const { segment, date, pool, ratings, isCarDay, pace, remainingBudget } = input;
  const items: PlanItem[] = [];
  const taken = new Set<string>();
  const categoryCounts = new Map<string, number>();
  let clock = segment.start;
  let position = input.startPosition;

  while (items.length < remainingBudget) {
    let best: { attraction: Attraction; start: number; end: number; score: number } | null = null;

    for (const attraction of pool) {
      if (taken.has(attraction.id)) continue;

      const travel = position
        ? selectMode(estimateTravel(position, attraction.location), { isCarDay, pace })
            .durationMinutes
        : 0;
      const arrival = clock + travel;
      const hours = attraction.hoursByDate[date];
      const opensAt = hours?.status === "open" ? toMinutes(hours.open) : arrival;
      const start = Math.max(arrival, opensAt);
      const end = start + attraction.estimatedVisitMinutes;

      if (end > segment.end || end > DAY_END_MINUTES) continue;
      if (openDuring(hours, start, end) === "closed") continue;

      const score = scoreAttraction(attraction, ratings[attraction.id], {
        date,
        travelMinutes: travel,
        sameCategoryCount: categoryCounts.get(attraction.category) ?? 0,
      });

      if (!best || score > best.score) best = { attraction, start, end, score };
    }

    if (!best) break;

    items.push({
      kind: "attraction",
      refId: best.attraction.id,
      startTime: toClock(best.start),
      endTime: toClock(best.end),
    });
    taken.add(best.attraction.id);
    categoryCounts.set(
      best.attraction.category,
      (categoryCounts.get(best.attraction.category) ?? 0) + 1,
    );
    clock = best.end;
    position = best.attraction.location;
  }

  return { items, endPosition: position, endTime: clock };
}

function pickRestaurant(
  restaurants: Restaurant[],
  near: LatLng,
  date: string,
  window: { start: number; end: number },
  cuisines: string[],
  excludeIds: string[],
): Restaurant | null {
  // Being open on the date is not enough: the restaurant must be open for the
  // meal itself, or the itinerary seats lunch at a place that opens for dinner.
  const open = restaurants.filter(
    (r) =>
      !excludeIds.includes(r.id) &&
      openDuring(r.hoursByDate[date], window.start, window.end) !== "closed",
  );
  if (open.length === 0) return null;

  const preferred = open.filter((r) =>
    cuisines.length === 0
      ? true
      : r.cuisine.some((c) => cuisines.some((want) => c.toLowerCase() === want.toLowerCase())),
  );
  const pool = preferred.length > 0 ? preferred : open;

  return pool.reduce((closest, candidate) => {
    const a = estimateTravel(near, candidate.location).driveMeters;
    const b = estimateTravel(near, closest.location).driveMeters;
    return a < b ? candidate : closest;
  }, pool[0]!);
}

function buildLegs(
  items: PlanItem[],
  positions: Map<string, LatLng>,
  isCarDay: boolean,
  pace: Pace,
): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const from = positions.get(items[i]!.refId);
    const to = positions.get(items[i + 1]!.refId);
    if (!from || !to) continue;

    const option = estimateTravel(from, to);
    const decision = selectMode(option, { isCarDay, pace });
    legs.push({
      fromIndex: i,
      toIndex: i + 1,
      mode: decision.mode,
      durationMinutes: decision.durationMinutes,
      distanceMeters: option.driveMeters,
      transitLines: decision.transitLines,
      transferCount: decision.transferCount,
      fallbackReason: decision.fallbackReason,
      estimated: true,
    });
  }
  return legs;
}

function summarize(items: PlanItem[], isCarDay: boolean): string {
  const stops = items.filter((i) => i.kind === "attraction").length;
  const mode = isCarDay ? "by car" : "on foot and by transit";
  return `${stops} stop${stops === 1 ? "" : "s"} ${mode}, with lunch and dinner.`;
}

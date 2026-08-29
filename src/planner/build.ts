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
  UnplacedMeal,
} from "@/types/workspace";
import { centroid, clusterByGeography, estimateTravel } from "@/planner/geo";
import {
  leastDetour,
  matchesCuisine,
  MEAL_DURATIONS,
  worthTheDetour,
} from "@/planner/meals";
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

const MAX_ATTRACTIONS_PER_DAY: Record<Pace, number> = {
  relaxed: 4,
  balanced: 6,
  packed: 8,
};

/**
 * The longest trip the planner will expand.
 *
 * Every date materializes a day, and every day runs the greedy builder, so an
 * unbounded range is a synchronous browser freeze rather than a slow answer.
 * A month of full days is well past any itinerary this planner is useful for.
 */
export const MAX_TRIP_DAYS = 30;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses `YYYY-MM-DD` as a UTC midnight, rejecting anything that is not that. */
function parseTripDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // `Date` silently rolls 2026-02-30 forward; a round trip catches that.
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

/**
 * Why a trip's date range cannot be planned, or null when it can.
 *
 * The form and the planner share this so the two can never disagree. Lexical
 * comparison alone is not enough: two empty strings compare as ordered and
 * would otherwise expand to a plausible-looking zero-day itinerary.
 */
export function validateTripDates(startDate: string, endDate: string): string | null {
  if (!startDate.trim()) return "Choose a first day for the trip.";
  if (!endDate.trim()) return "Choose a last day for the trip.";

  const start = parseTripDate(startDate);
  const end = parseTripDate(endDate);
  if (!start || !end) {
    return "Enter both days as real calendar dates (YYYY-MM-DD).";
  }

  if (end.getTime() < start.getTime()) {
    return "The last day cannot fall before the first.";
  }

  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > MAX_TRIP_DAYS) {
    return `Trips are limited to ${MAX_TRIP_DAYS} days; this range covers ${days}.`;
  }

  return null;
}

export function tripDates(trip: TripRequest): string[] {
  if (validateTripDates(trip.startDate, trip.endDate)) return [];

  const dates: string[] = [];
  const cursor = new Date(`${trip.startDate}T00:00:00Z`);
  const end = new Date(`${trip.endDate}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime() && dates.length < MAX_TRIP_DAYS) {
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

interface MealPlacement {
  spot: Restaurant | null;
  /** Set when the choice satisfied the preference only partially. */
  note?: string;
  /** Set when no restaurant could be seated at all. */
  reason?: string;
}

interface DayResult {
  day: PlanDay;
  unplacedMeals: UnplacedMeal[];
}

/**
 * Splits the candidates the planner will actually work with from the ones it
 * has already ruled out.
 *
 * Exported because it is not only the planner's business: anything that wants
 * to know where the days will be — the nearby meal search, for one — has to
 * cluster the same set, or it aims at a geography the itinerary never visits.
 */
export function partitionCandidates(
  attractions: Attraction[],
  ratings: Record<string, Rating>,
  dates: string[],
): { candidates: Attraction[]; excluded: ExclusionReason[] } {
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
  return { candidates, excluded };
}

export function buildPlan(input: BuildPlanInput): Plan {
  const { trip, attractions, restaurants, ratings } = input;

  // Fail loudly at the boundary. A zero-day "ready" plan reads as a successful
  // answer to a question the traveller never got to ask.
  const invalid = validateTripDates(trip.startDate, trip.endDate);
  if (invalid) throw new Error(invalid);

  const dates = tripDates(trip);

  const { candidates, excluded } = partitionCandidates(attractions, ratings, dates);

  const clusters = clusterByGeography(candidates, dates.length);
  // Order clusters west-to-east so day assignment is stable across replans.
  const orderedClusters = [...clusters].sort(
    (a, b) => centroid(a.map((x) => x.location)).lng - centroid(b.map((x) => x.location)).lng,
  );

  // Pass one keeps each cluster on its own date, which is what makes a day
  // geographically coherent. Pass two exists because a cluster's date is not a
  // verdict: an attraction shut on that date, or squeezed out by it, is still
  // open and reachable on another one. Anything left over after pass one is
  // offered to every day as spillover, behind that day's own cluster.
  const firstPass = assembleDays({
    dates,
    clustersByDate: orderedClusters,
    spillover: [],
    trip,
    restaurants,
    ratings,
  });

  const stranded = candidates.filter((a) => !firstPass.scheduled.has(a.id));
  const assembled =
    stranded.length === 0
      ? firstPass
      : assembleDays({
          dates,
          clustersByDate: orderedClusters,
          spillover: stranded,
          trip,
          restaurants,
          ratings,
        });

  const { days, scheduled, unplacedMeals } = assembled;

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
      unplacedMeals,
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

interface AssembleInput {
  dates: string[];
  clustersByDate: Attraction[][];
  /** Candidates no day claimed yet. Every day may take them after its own. */
  spillover: Attraction[];
  trip: TripRequest;
  restaurants: Restaurant[];
  ratings: Record<string, Rating>;
}

function assembleDays(input: AssembleInput): {
  days: PlanDay[];
  scheduled: Set<string>;
  unplacedMeals: UnplacedMeal[];
} {
  const scheduled = new Set<string>();
  const days: PlanDay[] = [];
  const unplacedMeals: UnplacedMeal[] = [];
  const usedRestaurants = new Set<string>();

  input.dates.forEach((date, index) => {
    const pool = (input.clustersByDate[index] ?? []).filter((a) => !scheduled.has(a.id));
    const poolIds = new Set(pool.map((a) => a.id));
    const spillover = input.spillover.filter(
      (a) => !scheduled.has(a.id) && !poolIds.has(a.id),
    );

    const result = buildDay({
      date,
      trip: input.trip,
      pool,
      spillover,
      restaurants: input.restaurants,
      ratings: input.ratings,
      usedRestaurantIds: [...usedRestaurants],
    });

    for (const item of result.day.items) {
      if (item.kind === "attraction") scheduled.add(item.refId);
      if (item.kind === "meal") usedRestaurants.add(item.refId);
    }
    unplacedMeals.push(...result.unplacedMeals);
    days.push(result.day);
  });

  return { days, scheduled, unplacedMeals };
}

interface BuildDayInput {
  date: string;
  trip: TripRequest;
  /**
   * Restaurants already used earlier in the trip. Eating at the same place
   * twice is a worse itinerary than eating somewhere merely nearer, so these
   * are avoided — but only while there is an alternative, since a repeat venue
   * still beats a day with no dinner.
   */
  usedRestaurantIds: string[];
  /** This day's own cluster. Always filled before spillover. */
  pool: Attraction[];
  spillover: Attraction[];
  restaurants: Restaurant[];
  ratings: Record<string, Rating>;
}

/** How many times a segment is refilled while the meal that follows it settles. */
const MEAL_SETTLE_PASSES = 3;

function buildDay(input: BuildDayInput): DayResult {
  const { date, trip, pool, spillover, restaurants, ratings, usedRestaurantIds } = input;
  const isCarDay = trip.hasRentalCar;
  const budget = MAX_ATTRACTIONS_PER_DAY[trip.pace];

  const lunchStart = MEAL_WINDOWS.lunch.target[0] + 30;
  const dinnerStart = MEAL_WINDOWS.dinner.target[0] + 30;
  const lunchEnd = lunchStart + MEAL_DURATIONS.lunch;
  const dinnerEnd = dinnerStart + MEAL_DURATIONS.dinner;

  const clusterCenter = centroid([...pool, ...spillover].map((a) => a.location));
  const taken = new Set<string>();
  const unplacedMeals: UnplacedMeal[] = [];

  const fill = (
    segment: Segment,
    startPosition: LatLng | null,
    exitTo: LatLng | null,
  ): FilledSegment =>
    fillSegment({
      segment,
      date,
      primary: pool,
      spillover,
      taken,
      ratings,
      isCarDay,
      pace: trip.pace,
      startPosition,
      exitTo,
      remainingBudget: budget - taken.size,
    });

  /**
   * Fills a segment and chooses the meal that closes it together.
   *
   * The two decisions are circular: where the morning ends decides which
   * restaurant is nearest, and which restaurant is chosen decides how much
   * travel the morning has to reserve. Settling them by alternating a bounded
   * number of times keeps the builder deterministic, and the final fill always
   * reserves travel to the restaurant actually chosen, so the result is
   * feasible whether or not the loop converged.
   */
  const fillThenMeal = (
    segment: Segment,
    startPosition: LatLng | null,
    meal: MealKind,
    window: Segment,
    excludeIds: string[],
    onwardTo: LatLng | null,
  ): { filled: FilledSegment; placement: MealPlacement } => {
    let filled = fill(segment, startPosition, null);
    let placement: MealPlacement = { spot: null };

    for (let pass = 0; pass < MEAL_SETTLE_PASSES; pass++) {
      const near = filled.endPosition ?? startPosition ?? clusterCenter;
      const next = pickRestaurant({
        restaurants,
        near,
        date,
        meal,
        window,
        meals: trip.meals,
        excludeIds,
        onwardTo,
      });
      const settled = next.spot?.id === placement.spot?.id;
      placement = next;
      filled = fill(segment, startPosition, next.spot?.location ?? null);
      if (settled) break;
    }

    return { filled, placement };
  };

  // Where the afternoon begins, worked out before lunch is chosen so the meal
  // can be judged on the detour it adds rather than on how near it is to the
  // morning. This fill is provisional and commits nothing.
  const morningOnly = fill({ start: DAY_START_MINUTES, end: lunchStart }, null, null);
  const provisionalAfternoon = fill(
    { start: lunchEnd, end: dinnerStart },
    morningOnly.endPosition,
    null,
  );
  const afternoonStart =
    provisionalAfternoon.items[0]
      ? ([...pool, ...spillover].find(
          (a) => a.id === provisionalAfternoon.items[0]!.refId,
        )?.location ?? null)
      : null;

  const morning = fillThenMeal(
    { start: DAY_START_MINUTES, end: lunchStart },
    null,
    "lunch",
    { start: lunchStart, end: lunchEnd },
    usedRestaurantIds,
    afternoonStart,
  );
  commit(taken, morning.filled);

  const afternoon = fillThenMeal(
    { start: lunchEnd, end: dinnerStart },
    morning.placement.spot?.location ?? morning.filled.endPosition,
    "dinner",
    { start: dinnerStart, end: dinnerEnd },
    morning.placement.spot
      ? [...usedRestaurantIds, morning.placement.spot.id]
      : usedRestaurantIds,
    null,
  );
  commit(taken, afternoon.filled);

  const evening = fill(
    { start: dinnerEnd, end: DAY_END_MINUTES },
    afternoon.placement.spot?.location ?? afternoon.filled.endPosition,
    null,
  );
  commit(taken, evening);

  const items: PlanItem[] = [...morning.filled.items];
  items.push(
    ...mealItems(date, "lunch", lunchStart, lunchEnd, morning.placement, unplacedMeals),
  );
  items.push(...afternoon.filled.items);
  items.push(
    ...mealItems(date, "dinner", dinnerStart, dinnerEnd, afternoon.placement, unplacedMeals),
  );
  items.push(...evening.items);

  const positions = new Map<string, LatLng>();
  for (const attraction of [...pool, ...spillover]) {
    positions.set(attraction.id, attraction.location);
  }
  for (const placement of [morning.placement, afternoon.placement]) {
    if (placement.spot) positions.set(placement.spot.id, placement.spot.location);
  }

  // The day is settled now, so each meal is judged again against the stops it
  // actually sits between rather than the guess it was chosen against.
  const repicked = repickMeals(items, restaurants, positions, trip, date, usedRestaurantIds);
  const legs = buildLegs(repicked.items, positions, isCarDay, trip.pace);

  return {
    day: {
      date,
      isCarDay,
      items: repicked.items,
      legs,
      summary: summarize(repicked.items, isCarDay),
    },
    unplacedMeals,
  };
}

function commit(taken: Set<string>, filled: FilledSegment): void {
  for (const item of filled.items) taken.add(item.refId);
}

function mealItems(
  date: string,
  meal: MealKind,
  start: number,
  end: number,
  placement: MealPlacement,
  unplaced: UnplacedMeal[],
): PlanItem[] {
  if (!placement.spot) {
    unplaced.push({
      date,
      meal,
      reason: placement.reason ?? `No restaurant could be seated for ${meal}.`,
    });
    return [];
  }
  return [
    {
      kind: "meal",
      refId: placement.spot.id,
      meal,
      startTime: toClock(start),
      endTime: toClock(end),
      notes: placement.note,
    },
  ];
}

interface FillSegmentInput {
  segment: Segment;
  date: string;
  primary: Attraction[];
  spillover: Attraction[];
  taken: Set<string>;
  ratings: Record<string, Rating>;
  isCarDay: boolean;
  pace: Pace;
  startPosition: LatLng | null;
  /** Where the segment must be able to travel to before `segment.end`. */
  exitTo: LatLng | null;
  remainingBudget: number;
}

function fillSegment(input: FillSegmentInput): FilledSegment {
  const { segment, date, primary, spillover, ratings, isCarDay, pace } = input;
  const items: PlanItem[] = [];
  const taken = new Set(input.taken);
  const categoryCounts = new Map<string, number>();
  let clock = segment.start;
  let position = input.startPosition;

  const travelTo = (from: LatLng, to: LatLng): number =>
    selectMode(estimateTravel(from, to), { isCarDay, pace }).durationMinutes;

  while (items.length < input.remainingBudget) {
    // Tiers, not one pool: this day's cluster is always exhausted before an
    // attraction another day could not place is allowed to take its time.
    let best: { attraction: Attraction; start: number; end: number; score: number } | null =
      null;

    for (const tier of [primary, spillover]) {
      for (const attraction of tier) {
        if (taken.has(attraction.id)) continue;

        const travel = position ? travelTo(position, attraction.location) : 0;
        const arrival = clock + travel;
        const hours = attraction.hoursByDate[date];
        const opensAt = hours?.status === "open" ? toMinutes(hours.open) : arrival;
        const start = Math.max(arrival, opensAt);
        const end = start + attraction.estimatedVisitMinutes;

        // Reserve the leg out of this stop as well as the leg into it. Without
        // it the schedule reads fine and cannot be walked: the traveller is
        // still at the last museum when the restaurant expects them.
        const exit = input.exitTo ? travelTo(attraction.location, input.exitTo) : 0;
        if (end + exit > segment.end || end > DAY_END_MINUTES) continue;
        if (openDuring(hours, start, end) === "closed") continue;

        const score = scoreAttraction(attraction, ratings[attraction.id], {
          date,
          travelMinutes: travel,
          sameCategoryCount: categoryCounts.get(attraction.category) ?? 0,
        });

        if (!best || score > best.score) best = { attraction, start, end, score };
      }
      if (best) break;
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

interface PickRestaurantInput {
  restaurants: Restaurant[];
  near: LatLng;
  /**
   * Where the day goes after the meal, when that is known. A meal sits between
   * two stops, so what it costs is the detour it adds — measuring only the
   * stop before it sends the traveller backwards.
   */
  onwardTo: LatLng | null;
  date: string;
  meal: MealKind;
  window: Segment;
  meals: TripRequest["meals"];
  excludeIds: string[];
}

/**
 * Chooses where a meal is eaten, or says why it cannot be.
 *
 * The three strictness settings are three different questions, so they get
 * three different answers: `flexible` asks for the nearest open table and does
 * not detour for cuisine, `prefer` detours when a match is open and says so
 * when it settles, and `strong` treats the cuisine as a constraint and would
 * rather report a missing meal than serve the wrong one.
 *
 * Hours come before all of that. A restaurant confirmed open for the meal is
 * always preferred over one whose hours nobody resolved, however near or well
 * matched the unresolved one is; an unresolved one is seated only when it is
 * that or no meal, and then the item says the hours were never confirmed.
 * Unknown is not a licence to invent an opening time, and it is not a closure
 * either — treating it as one would leave most live-researched days with no
 * lunch at all.
 */
function pickRestaurant(input: PickRestaurantInput): MealPlacement {
  const { restaurants, date, meal, window, excludeIds } = input;

  // Somewhere new is preferred, but a city with few restaurants must still be
  // able to feed the traveller: if excluding what the trip already used leaves
  // nothing, the exclusion is dropped rather than the meal.
  const withoutExclusions = { ...input, excludeIds: [] as string[] };

  // Being open on the date is not enough: the restaurant must be open for the
  // meal itself, or the itinerary seats lunch at a place that opens for dinner.
  const usable = restaurants.filter(
    (r) =>
      !excludeIds.includes(r.id) &&
      openDuring(r.hoursByDate[date], window.start, window.end) !== "closed",
  );
  if (usable.length === 0) {
    // Nothing left once the trip's earlier meals are excluded. A repeat venue
    // is a worse itinerary; a missing dinner is a gap in the day. Take the
    // repeat.
    if (excludeIds.length > 0) return pickRestaurant(withoutExclusions);
    return {
      spot: null,
      reason: `No restaurant is known to be open for ${meal} on ${date}.`,
    };
  }

  const confirmed = usable.filter(
    (r) => openDuring(r.hoursByDate[date], window.start, window.end) === "open",
  );

  const preferred = chooseRestaurant(confirmed, input);
  if (preferred.spot) return preferred;

  const fallback = chooseRestaurant(usable, input);
  if (!fallback.spot) {
    return excludeIds.length > 0 ? pickRestaurant(withoutExclusions) : fallback;
  }

  const unconfirmed = `Opening hours for ${fallback.spot.name} on ${date} were never confirmed; check before you go.`;
  return {
    ...fallback,
    note: fallback.note ? `${fallback.note} ${unconfirmed}` : unconfirmed,
  };
}

/** The cuisine half of the decision, over whichever pool it is handed. */
function chooseRestaurant(
  pool: Restaurant[],
  input: PickRestaurantInput,
): MealPlacement {
  const { near, onwardTo, date, meal, meals } = input;
  if (pool.length === 0) {
    return {
      spot: null,
      reason: `No restaurant is known to be open for ${meal} on ${date}.`,
    };
  }

  const wanted = meals.cuisines;
  if (wanted.length === 0) return { spot: leastDetour(pool, near, onwardTo) };

  const matching = pool.filter((r) => matchesCuisine(r, wanted));
  const wantedLabel = wanted.join(" or ");

  if (meals.strictness === "strong") {
    if (matching.length === 0) {
      return {
        spot: null,
        reason: `No ${wantedLabel} restaurant is open for ${meal} on ${date}, and the cuisine preference is set to strong.`,
      };
    }
    return { spot: leastDetour(matching, near, onwardTo) };
  }

  if (meals.strictness === "prefer") {
    const bestOverall = leastDetour(pool, near, onwardTo);
    const bestMatch = leastDetour(matching, near, onwardTo);

    // Prefer means prefer when it is reasonable. Without this, a matching
    // restaurant on the far side of the city beats one directly between the
    // stop before the meal and the stop after it.
    if (bestMatch && worthTheDetour(bestMatch, bestOverall, near, onwardTo)) {
      return { spot: bestMatch };
    }
    return {
      spot: bestOverall,
      note: bestMatch
        ? `The nearest ${wantedLabel} option was too far out of the way for ${meal}; this one is on the route.`
        : `No ${wantedLabel} option was open for ${meal} nearby; this is the closest alternative.`,
    };
  }

  // flexible: cuisine is a nice-to-have and never worth a detour.
  return { spot: leastDetour(pool, near, onwardTo) };
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
  const meals = items.filter((i) => i.kind === "meal").map((i) => i.meal);
  const mealText =
    meals.length === 2
      ? ", with lunch and dinner"
      : meals.length === 1
        ? `, with ${meals[0]}`
        : ", with no meal stop the available restaurant data could support";
  return `${stops} stop${stops === 1 ? "" : "s"} ${mode}${mealText}.`;
}

export interface RepickResult {
  items: PlanItem[];
  usedIds: string[];
}

/**
 * Chooses each meal again, now that the day around it is settled.
 *
 * A meal has to be picked before the rest of the day exists, so it is judged
 * against a guess at where the afternoon will start — and inserting the meal
 * changes that afternoon, so the guess is often wrong. The result was lunch
 * more than a kilometre off the line between the stops it actually sits
 * between, while somewhere twenty metres away went unused.
 *
 * Times are not touched. Meals are fixed anchors, so swapping which restaurant
 * fills one does not move anything; only the travel either side changes, and
 * that is resolved afterwards.
 */
export function repickMeals(
  items: PlanItem[],
  restaurants: Restaurant[],
  positions: Map<string, LatLng>,
  trip: TripRequest,
  date: string,
  alreadyUsedIds: string[],
): RepickResult {
  const chosen = new Set(alreadyUsedIds);
  /** Restaurants an earlier meal of this same day has just taken. */
  const claimedToday = new Set<string>();
  const next = items.map((item) => ({ ...item }));

  const travelMinutes = (from: LatLng, to: LatLng): number =>
    selectMode(estimateTravel(from, to), {
      isCarDay: trip.hasRentalCar,
      pace: trip.pace,
    }).durationMinutes;

  next.forEach((item, index) => {
    if (item.kind !== "meal" || !item.meal) return;

    const previous = next[index - 1];
    const following = next[index + 1];
    const before = positions.get(previous?.refId ?? "");
    const onward = positions.get(following?.refId ?? "") ?? null;
    if (!before || !previous) {
      chosen.add(item.refId);
      claimedToday.add(item.refId);
      return;
    }

    const window = { start: toMinutes(item.startTime), end: toMinutes(item.endTime) };

    // The clock does not move when the restaurant does. The first pass reserved
    // travel to the restaurant it chose, so a replacement is only an option if
    // it fits the same two gaps: a smaller total detour can still hide a leg
    // that no longer fits, which reads as a day the traveller cannot walk.
    const gapBefore = window.start - toMinutes(previous.endTime);
    const gapAfter = following ? toMinutes(following.startTime) - window.end : null;
    const reachable = (spot: Restaurant): boolean => {
      if (travelMinutes(before, spot.location) > gapBefore) return false;
      if (onward && gapAfter !== null) {
        if (travelMinutes(spot.location, onward) > gapAfter) return false;
      }
      return true;
    };

    // Nothing reachable means the first pass's choice is the only one that
    // fits, so it stays; a feasible day beats a marginally shorter one.
    const withinReach = restaurants.filter(reachable);
    if (withinReach.length === 0) {
      chosen.add(item.refId);
      claimedToday.add(item.refId);
      return;
    }

    const placement = pickRestaurant({
      restaurants: withinReach,
      near: before,
      onwardTo: onward,
      date,
      meal: item.meal,
      window,
      meals: trip.meals,
      // This meal's own restaurant is not an exclusion for itself — unless the
      // other meal of the day has already taken it, in which case keeping it
      // here would seat the traveller in the same room twice.
      excludeIds: [...chosen].filter(
        (id) => id !== item.refId || claimedToday.has(id),
      ),
    });

    if (placement.spot) {
      item.refId = placement.spot.id;
      // Assigned rather than merged: the note describes the restaurant that
      // was chosen, so a note earned by the one it replaces is simply false.
      item.notes = placement.note;
      positions.set(placement.spot.id, placement.spot.location);
    }
    chosen.add(item.refId);
    claimedToday.add(item.refId);
  });

  return { items: next, usedIds: [...chosen] };
}

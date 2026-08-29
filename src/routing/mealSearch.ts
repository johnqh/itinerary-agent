import type {
  Attraction,
  LatLng,
  MealKind,
  Restaurant,
  TripRequest,
} from "@/types/workspace";
import { centroid, clusterByGeography, haversineMeters } from "@/planner/geo";
import { MEAL_DURATIONS, violatesCuisineConstraint } from "@/planner/meals";
import { MEAL_WINDOWS, openDuring } from "@/planner/time";
import { findRestaurantsNear, NEARBY_RADIUS_METERS } from "@/routing/nearbyRestaurants";

/**
 * Looks for restaurants where the days are, rather than where the city is.
 *
 * Asking research for a city's restaurants up front means choosing them before
 * the itinerary exists, so the pool is arbitrary relative to the route and
 * adding more of them does not help: the traveller ends up sent across town
 * for dinner because that is where the one open place happened to be.
 *
 * The attractions are clustered the same way the planner will cluster them, so
 * each search happens around a centre a day will actually be built around.
 */

export type NearbyFinder = (near: LatLng) => Promise<Restaurant[]>;

/**
 * Where each day will be centred, clustered exactly as the planner clusters,
 * and paired with the date the planner will give it.
 *
 * The west-to-east ordering is the planner's own, so the date beside a centre
 * is the date whose opening hours actually decide whether a restaurant there
 * can seat anybody.
 */
function dayCentres(
  attractions: Attraction[],
  dates: string[],
): { centre: LatLng; date: string }[] {
  if (attractions.length === 0 || dates.length === 0) return [];
  return clusterByGeography(attractions, dates.length)
    .filter((cluster) => cluster.length > 0)
    .map((cluster) => centroid(cluster.map((a) => a.location)))
    .sort((a, b) => a.lng - b.lng)
    .map((centre, index) => ({ centre, date: dates[index] ?? dates[dates.length - 1]! }));
}

/** Searches every centre at once, letting one failure cost only its own day. */
async function searchAround(centres: LatLng[], find: NearbyFinder): Promise<Restaurant[]> {
  const results = await Promise.all(
    centres.map(async (centre) => {
      try {
        return await find(centre);
      } catch {
        // One area failing must not cost the traveller the other days'
        // options; the planner can still seat meals from what came back.
        return [];
      }
    }),
  );

  // Neighbouring clusters overlap, so the same restaurant can come back twice.
  const byId = new Map<string, Restaurant>();
  for (const restaurant of results.flat()) {
    if (!byId.has(restaurant.id)) byId.set(restaurant.id, restaurant);
  }
  return [...byId.values()];
}

export async function gatherRestaurantsNearDays(
  attractions: Attraction[],
  dates: string[],
  find: NearbyFinder,
): Promise<Restaurant[]> {
  return searchAround(
    dayCentres(attractions, dates).map((day) => day.centre),
    find,
  );
}

/**
 * Whether this restaurant could seat this meal on this date.
 *
 * The rules are the planner's own, so that a day counted as fed is a day the
 * planner will actually be able to feed. Unknown hours stay eligible, as they
 * do downstream: an unconfirmed opening time is not a closure, and treating it
 * as one would send the search out after every live-researched day.
 */
function couldSeat(
  restaurant: Restaurant,
  date: string,
  meal: MealKind,
  meals: TripRequest["meals"],
): boolean {
  if (violatesCuisineConstraint(restaurant, meals)) return false;
  const [start] = MEAL_WINDOWS[meal].target;
  const hours = restaurant.hoursByDate[date];
  return openDuring(hours, start, start + MEAL_DURATIONS[meal]) !== "closed";
}

/**
 * Whether a day already has meals, rather than merely restaurants.
 *
 * Counting places within walking distance is not the question: a place shut
 * that day, or ruled out by a cuisine the traveller said they would not
 * compromise on, cannot seat them. Both meals need somewhere, and preferably
 * not the same somewhere twice, so the day needs two distinct venues between
 * which lunch and dinner are both covered.
 */
function alreadyFed(
  centre: LatLng,
  date: string,
  have: Restaurant[],
  meals: TripRequest["meals"],
): boolean {
  const withinReach = have.filter(
    (r) => haversineMeters(centre, r.location) <= NEARBY_RADIUS_METERS,
  );
  const forLunch = withinReach.filter((r) => couldSeat(r, date, "lunch", meals));
  const forDinner = withinReach.filter((r) => couldSeat(r, date, "dinner", meals));
  const venues = new Set([...forLunch, ...forDinner].map((r) => r.id));
  return forLunch.length > 0 && forDinner.length > 0 && venues.size >= 2;
}

/**
 * Asks again, once the days are known, only where the pool cannot feed them.
 *
 * Discovery has to search before the traveller has rated anything, so it
 * clusters every candidate found. The planner clusters what survives rating
 * and opening hours, which is a different geography: an outlying attraction
 * the traveller rejects can consume a day's search and leave the day that gets
 * built with nothing within walking distance.
 *
 * Only centres that cannot already be fed are searched, so an itinerary whose
 * clusters barely moved costs nothing, and a rating that genuinely redraws a
 * day pays for exactly that day.
 *
 * Returns only what is new. Merging is the caller's, because a restaurant
 * already in the pool may be the same venue under another source's id.
 */
export async function fillMealGapsNearDays(
  attractions: Attraction[],
  dates: string[],
  have: Restaurant[],
  meals: TripRequest["meals"],
  find: NearbyFinder,
): Promise<Restaurant[]> {
  const uncovered = dayCentres(attractions, dates)
    .filter((day) => !alreadyFed(day.centre, day.date, have, meals))
    .map((day) => day.centre);
  if (uncovered.length === 0) return [];

  const known = new Set(have.map((r) => r.id));
  return (await searchAround(uncovered, find)).filter((r) => !known.has(r.id));
}

/** The finder used in the app: a real nearby search around one point. */
export function createNearbyFinder(dates: string[]): NearbyFinder {
  return (near) => findRestaurantsNear(near, dates);
}

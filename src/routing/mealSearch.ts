import type { Attraction, LatLng, Restaurant } from "@/types/workspace";
import { centroid, clusterByGeography, haversineMeters } from "@/planner/geo";
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

/** Where each day will be centred, clustered exactly as the planner clusters. */
function dayCentres(attractions: Attraction[], dayCount: number): LatLng[] {
  if (attractions.length === 0 || dayCount === 0) return [];
  return clusterByGeography(attractions, dayCount)
    .filter((cluster) => cluster.length > 0)
    .map((cluster) => centroid(cluster.map((a) => a.location)));
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
  if (dates.length === 0) return [];
  return searchAround(dayCentres(attractions, dates.length), find);
}

/**
 * A day eats twice, and not twice in the same place if it can help it, so one
 * restaurant beside a centre is not the same as that day being catered for.
 */
const MEALS_PER_DAY = 2;

/**
 * Asks again, once the days are known, only where the pool does not reach.
 *
 * Discovery has to search before the traveller has rated anything, so it
 * clusters every candidate found. The planner clusters what survives rating
 * and opening hours, which is a different geography: an outlying attraction
 * the traveller rejects can consume a day's search and leave the day that gets
 * built with nothing within walking distance.
 *
 * Only centres the existing pool cannot feed are searched, so an itinerary
 * whose clusters barely moved costs nothing, and a rating that genuinely
 * redraws a day pays for exactly that day.
 *
 * Returns only what is new. Merging is the caller's, because a restaurant
 * already in the pool may be the same venue under another source's id.
 */
export async function fillMealGapsNearDays(
  attractions: Attraction[],
  dayCount: number,
  have: Restaurant[],
  find: NearbyFinder,
): Promise<Restaurant[]> {
  const uncovered = dayCentres(attractions, dayCount).filter(
    (centre) =>
      have.filter(
        (r) => haversineMeters(centre, r.location) <= NEARBY_RADIUS_METERS,
      ).length < MEALS_PER_DAY,
  );
  if (uncovered.length === 0) return [];

  const known = new Set(have.map((r) => r.id));
  return (await searchAround(uncovered, find)).filter((r) => !known.has(r.id));
}

/** The finder used in the app: a real nearby search around one point. */
export function createNearbyFinder(dates: string[]): NearbyFinder {
  return (near) => findRestaurantsNear(near, dates);
}

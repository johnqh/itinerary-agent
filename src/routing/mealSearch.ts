import type { Attraction, LatLng, Restaurant } from "@/types/workspace";
import { centroid, clusterByGeography } from "@/planner/geo";
import { findRestaurantsNear } from "@/routing/nearbyRestaurants";

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

export async function gatherRestaurantsNearDays(
  attractions: Attraction[],
  dates: string[],
  find: NearbyFinder,
): Promise<Restaurant[]> {
  if (attractions.length === 0 || dates.length === 0) return [];

  const clusters = clusterByGeography(attractions, dates.length).filter(
    (cluster) => cluster.length > 0,
  );

  const results = await Promise.all(
    clusters.map(async (cluster) => {
      try {
        return await find(centroid(cluster.map((a) => a.location)));
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

/** The finder used in the app: a real nearby search around one point. */
export function createNearbyFinder(dates: string[]): NearbyFinder {
  return (near) => findRestaurantsNear(near, dates);
}

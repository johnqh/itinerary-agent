import { describe, expect, test, vi } from "vitest";
import { fillMealGapsNearDays, gatherRestaurantsNearDays } from "@/routing/mealSearch";
import type { Attraction, LatLng, Restaurant } from "@/types/workspace";

/**
 * Restaurants are looked for where the days are.
 *
 * Asking research for a city's restaurants up front means guessing where the
 * traveller will be before the itinerary exists. Clustering the attractions
 * the way the planner will, and searching around each cluster, asks the same
 * question at a point where it has an answer.
 */

function attraction(id: string, lat: number, lng: number): Attraction {
  return {
    id, name: id, category: "landmark", location: { lat, lng },
    description: "", hoursByDate: {}, estimatedVisitMinutes: 60,
    ticketRequired: false, photoUrls: [], sources: [], confidence: 0.6,
  };
}

function restaurant(id: string): Restaurant {
  return {
    id, name: id, cuisine: [], location: { lat: 0, lng: 0 },
    hoursByDate: {}, sources: [], confidence: 0.7,
  };
}

// Two clearly separate parts of a city.
const attractions = [
  attraction("north-1", 37.80, -122.41),
  attraction("north-2", 37.803, -122.413),
  attraction("south-1", 37.75, -122.42),
  attraction("south-2", 37.753, -122.423),
];

describe("gatherRestaurantsNearDays", () => {
  test("searches once per day rather than once per attraction", async () => {
    const find = vi.fn(async () => [restaurant("r1")]);
    await gatherRestaurantsNearDays(attractions, ["d1", "d2"], find);
    expect(find).toHaveBeenCalledTimes(2);
  });

  test("searches near where each day's attractions actually are", async () => {
    const centres: { lat: number; lng: number }[] = [];
    const find = vi.fn(async (near: { lat: number; lng: number }) => {
      centres.push(near);
      return [restaurant(`r-${centres.length}`)];
    });
    await gatherRestaurantsNearDays(attractions, ["d1", "d2"], find);
    // One centre in each half of the city, not one average in the middle.
    expect(centres.some((c) => c.lat > 37.79)).toBe(true);
    expect(centres.some((c) => c.lat < 37.76)).toBe(true);
  });

  test("returns every restaurant it found across the days", async () => {
    let n = 0;
    const find = vi.fn(async () => [restaurant(`r${++n}`)]);
    const result = await gatherRestaurantsNearDays(attractions, ["d1", "d2"], find);
    expect(result.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  test("never returns the same restaurant twice when days overlap", async () => {
    const find = vi.fn(async () => [restaurant("shared")]);
    const result = await gatherRestaurantsNearDays(attractions, ["d1", "d2"], find);
    expect(result).toHaveLength(1);
  });

  test("a day whose search fails does not lose the other days", async () => {
    let call = 0;
    const find = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error("nearby unavailable");
      return [restaurant("survivor")];
    });
    const result = await gatherRestaurantsNearDays(attractions, ["d1", "d2"], find);
    expect(result.map((r) => r.id)).toEqual(["survivor"]);
  });

  test("returns nothing rather than throwing when every search fails", async () => {
    const find = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(
      gatherRestaurantsNearDays(attractions, ["d1"], find),
    ).resolves.toEqual([]);
  });

  test("does nothing when there is nowhere to search around", async () => {
    const find = vi.fn(async () => [restaurant("r1")]);
    expect(await gatherRestaurantsNearDays([], ["d1"], find)).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});

/**
 * Discovery searches before the traveller has rated anything, so it clusters
 * every candidate it found. The planner clusters only what survives rating and
 * opening hours, and those are not the same geography: an outlying attraction
 * the traveller rejects can take a whole day's search with it and leave the
 * day that is actually built with nothing to eat near it.
 *
 * This asks the question again once the answer is known, and only where the
 * pool does not already reach — so an itinerary whose clusters barely moved
 * costs no calls at all.
 */
describe("fillMealGapsNearDays", () => {
  function at(id: string, location: LatLng): Restaurant {
    return { ...restaurant(id), location };
  }

  // Two restaurants beside each cluster: enough for the day's two meals.
  const nearNorth = [
    at("north-a", { lat: 37.8015, lng: -122.4115 }),
    at("north-b", { lat: 37.8016, lng: -122.4116 }),
  ];
  const nearSouth = [
    at("south-a", { lat: 37.7515, lng: -122.4215 }),
    at("south-b", { lat: 37.7516, lng: -122.4216 }),
  ];

  test("spends nothing when every day already has somewhere to eat", async () => {
    const find = vi.fn(async () => [restaurant("new")]);
    const found = await fillMealGapsNearDays(attractions, 2, [...nearNorth, ...nearSouth], find);
    expect(find).not.toHaveBeenCalled();
    expect(found).toEqual([]);
  });

  test("searches only the day the existing pool does not reach", async () => {
    const centres: LatLng[] = [];
    const find = vi.fn(async (near: LatLng) => {
      centres.push(near);
      return [restaurant("late-find")];
    });
    const found = await fillMealGapsNearDays(attractions, 2, nearNorth, find);
    expect(find).toHaveBeenCalledTimes(1);
    expect(centres[0]!.lat).toBeLessThan(37.76);
    expect(found.map((r) => r.id)).toEqual(["late-find"]);
  });

  test("one meal beside a day is not enough for a day that eats twice", async () => {
    const find = vi.fn(async () => [restaurant("late-find")]);
    await fillMealGapsNearDays(attractions, 2, [nearNorth[0]!, ...nearSouth], find);
    expect(find).toHaveBeenCalledTimes(1);
  });

  test("never returns a restaurant the pool already holds", async () => {
    const find = vi.fn(async () => [at("north-a", { lat: 37.7515, lng: -122.4215 })]);
    const found = await fillMealGapsNearDays(attractions, 2, nearNorth, find);
    expect(found).toEqual([]);
  });

  test("a failed search costs the trip nothing it already had", async () => {
    const find = vi.fn(async () => {
      throw new Error("nearby unavailable");
    });
    await expect(fillMealGapsNearDays(attractions, 2, nearNorth, find)).resolves.toEqual([]);
  });
});

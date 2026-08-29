import { describe, expect, test, vi } from "vitest";
import { gatherRestaurantsNearDays } from "@/routing/mealSearch";
import type { Attraction, Restaurant } from "@/types/workspace";

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

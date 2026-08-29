import { describe, expect, test } from "vitest";
import { repickMeals } from "@/planner/build";
import type { PlanItem, Restaurant, TripRequest } from "@/types/workspace";

/**
 * A meal is chosen before the day around it is settled, so the stop it was
 * judged against is not always the stop it ends up between. Once the day is
 * assembled the real neighbours are known, and the choice is worth making
 * again against them.
 */

const DATE = "2026-09-12";
const OPEN = { status: "open", open: "08:00", close: "22:00" } as const;

function restaurant(id: string, lat: number, lng: number, cuisine: string[] = []): Restaurant {
  return {
    id, name: id, cuisine, location: { lat, lng },
    hoursByDate: { [DATE]: OPEN }, sources: [], confidence: 0.7,
  };
}

const trip: TripRequest = {
  destination: "Testville", startDate: DATE, endDate: DATE,
  hasRentalCar: false, pace: "balanced",
  meals: { cuisines: [], strictness: "flexible" },
};

// Two stops a short hop apart, with the meal sitting between them.
const items: PlanItem[] = [
  { kind: "attraction", refId: "before", startTime: "10:00", endTime: "11:00" },
  { kind: "meal", refId: "far", meal: "lunch", startTime: "12:30", endTime: "13:30" },
  { kind: "attraction", refId: "after", startTime: "14:00", endTime: "15:00" },
];

const positions = new Map([
  ["before", { lat: 37.8021, lng: -122.4187 }],
  ["after", { lat: 37.8080, lng: -122.4177 }],
]);

describe("repickMeals", () => {
  test("moves a meal onto the line between its actual neighbours", () => {
    const pool = [
      restaurant("far", 37.7897, -122.4216),
      restaurant("between", 37.8050, -122.4182),
    ];
    const result = repickMeals(items, pool, positions, trip, DATE, []);
    expect(result.items[1]!.refId).toBe("between");
  });

  test("leaves a meal alone when it is already the best choice", () => {
    const pool = [
      restaurant("far", 37.8050, -122.4182),
      restaurant("worse", 37.7500, -122.4500),
    ];
    const result = repickMeals(items, pool, positions, trip, DATE, []);
    expect(result.items[1]!.refId).toBe("far");
  });

  test("does not seat a meal somewhere shut at that hour", () => {
    const closed: Restaurant = {
      ...restaurant("closer-but-shut", 37.8050, -122.4182),
      hoursByDate: { [DATE]: { status: "closed" } },
    };
    const pool = [restaurant("far", 37.7897, -122.4216), closed];
    const result = repickMeals(items, pool, positions, trip, DATE, []);
    expect(result.items[1]!.refId).toBe("far");
  });

  test("will not reuse a restaurant the trip has already visited", () => {
    const pool = [
      restaurant("far", 37.7897, -122.4216),
      restaurant("between", 37.8050, -122.4182),
    ];
    const result = repickMeals(items, pool, positions, trip, DATE, ["between"]);
    expect(result.items[1]!.refId).toBe("far");
  });

  test("reports which restaurants the day ended up using", () => {
    const pool = [restaurant("between", 37.8050, -122.4182)];
    const result = repickMeals(items, pool, positions, trip, DATE, []);
    expect(result.usedIds).toContain("between");
  });

  test("leaves a day with no meals untouched", () => {
    const onlyStops = items.filter((i) => i.kind === "attraction");
    const result = repickMeals(onlyStops, [], positions, trip, DATE, []);
    expect(result.items).toEqual(onlyStops);
  });
});

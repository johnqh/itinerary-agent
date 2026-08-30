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

  test("drops a note the replacement restaurant does not earn", () => {
    const preferItalian: TripRequest = {
      ...trip,
      meals: { cuisines: ["italian"], strictness: "prefer" },
    };
    const withNote: PlanItem[] = items.map((item) =>
      item.kind === "meal"
        ? {
            ...item,
            notes:
              "The nearest italian option was too far out of the way for lunch; this one is on the route.",
          }
        : item,
    );
    const pool = [
      restaurant("far", 37.7897, -122.4216),
      restaurant("between", 37.805, -122.4182, ["Italian"]),
    ];
    const result = repickMeals(withNote, pool, positions, preferItalian, DATE, []);
    expect(result.items[1]!.refId).toBe("between");
    expect(result.items[1]!.notes).toBeUndefined();
  });

  test("keeps a note the replacement restaurant does earn", () => {
    const preferItalian: TripRequest = {
      ...trip,
      meals: { cuisines: ["italian"], strictness: "prefer" },
    };
    const pool = [
      restaurant("far", 37.7897, -122.4216),
      restaurant("between", 37.805, -122.4182),
    ];
    const result = repickMeals(items, pool, positions, preferItalian, DATE, []);
    expect(result.items[1]!.refId).toBe("between");
    expect(result.items[1]!.notes).toMatch(/italian/i);
  });
});

/**
 * Repicking swaps the restaurant but not the clock. The stop before a meal and
 * the stop after it keep the times the first pass gave them, so a replacement
 * has to be reachable inside the gaps that already exist — a nearer total
 * detour is no use if one of its two legs no longer fits.
 */
describe("repickMeals and the time it has to work in", () => {
  const A = { lat: 37.8, lng: -122.4 };
  const B = { lat: 37.809, lng: -122.4 };
  // Off the midpoint of A→B: a longer way round, but both legs are short.
  const ON_ROUTE = { lat: 37.8045, lng: -122.4034 };
  // Beside B: a shorter total detour, but an hour's stroll from A in ten minutes.
  const BESIDE_AFTER = { lat: 37.809, lng: -122.40114 };

  // Ten minutes either side of the meal, which is what the first pass reserved.
  const tightDay: PlanItem[] = [
    { kind: "attraction", refId: "before", startTime: "12:00", endTime: "12:20" },
    { kind: "meal", refId: "on-route", meal: "lunch", startTime: "12:30", endTime: "13:30" },
    { kind: "attraction", refId: "after", startTime: "13:40", endTime: "14:40" },
  ];

  const tightPositions = new Map([
    ["before", A],
    ["after", B],
  ]);

  test("will not take a shorter detour it cannot reach in time", () => {
    const pool = [
      restaurant("on-route", ON_ROUTE.lat, ON_ROUTE.lng),
      restaurant("beside-after", BESIDE_AFTER.lat, BESIDE_AFTER.lng),
    ];
    const result = repickMeals(
      tightDay,
      pool,
      new Map(tightPositions),
      trip,
      DATE,
      [],
    );
    expect(result.items[1]!.refId).toBe("on-route");
  });

  test("still moves a meal when the replacement fits the gaps", () => {
    const pool = [
      restaurant("on-route", ON_ROUTE.lat, ON_ROUTE.lng),
      // Directly between the two stops: shorter detour and both legs short.
      restaurant("straight-through", 37.8045, -122.4),
    ];
    const day: PlanItem[] = tightDay.map((item) =>
      item.kind === "meal" ? { ...item, refId: "on-route" } : item,
    );
    const result = repickMeals(day, pool, new Map(tightPositions), trip, DATE, []);
    expect(result.items[1]!.refId).toBe("straight-through");
  });
});

/**
 * Two meals in a day are two different restaurants whenever the city can
 * supply two. Repicking must not lose track of what the earlier meal took.
 */
describe("repickMeals across both meals of a day", () => {
  const A = { lat: 37.8, lng: -122.4 };
  const B = { lat: 37.802, lng: -122.4 };
  const C = { lat: 37.804, lng: -122.4 };

  const twoMealDay: PlanItem[] = [
    { kind: "attraction", refId: "a", startTime: "10:00", endTime: "11:00" },
    { kind: "meal", refId: "far", meal: "lunch", startTime: "12:30", endTime: "13:30" },
    { kind: "attraction", refId: "b", startTime: "14:00", endTime: "15:00" },
    { kind: "meal", refId: "shared", meal: "dinner", startTime: "18:00", endTime: "19:15" },
    { kind: "attraction", refId: "c", startTime: "20:00", endTime: "21:00" },
  ];

  const twoMealPositions = new Map([
    ["a", A],
    ["b", B],
    ["c", C],
  ]);

  test("does not seat both meals at the same restaurant when another is free", () => {
    const pool = [
      restaurant("far", 37.75, -122.45),
      // Between b and c, so it wins dinner outright — and it beats the other
      // candidate for lunch as well, so lunch takes it first.
      restaurant("shared", 37.803, -122.4),
      restaurant("spare", 37.8035, -122.4005),
    ];
    const result = repickMeals(
      twoMealDay,
      pool,
      new Map(twoMealPositions),
      trip,
      DATE,
      [],
    );
    expect(result.items[1]!.refId).toBe("shared");
    expect(result.items[3]!.refId).not.toBe("shared");
  });

  test("does not reuse a meal it could not repick for want of a stop before it", () => {
    // A day whose morning filled nothing opens on lunch, so there is no stop to
    // judge that meal against and it keeps what it was given. Dinner still has
    // to know the table is taken.
    const openingOnLunch: PlanItem[] = [
      { kind: "meal", refId: "shared", meal: "lunch", startTime: "12:30", endTime: "13:30" },
      { kind: "attraction", refId: "b", startTime: "14:00", endTime: "15:00" },
      { kind: "meal", refId: "shared", meal: "dinner", startTime: "18:00", endTime: "19:15" },
      { kind: "attraction", refId: "c", startTime: "20:00", endTime: "21:00" },
    ];
    const pool = [
      restaurant("shared", 37.803, -122.4),
      restaurant("spare", 37.8035, -122.4005),
    ];
    const result = repickMeals(
      openingOnLunch,
      pool,
      new Map(twoMealPositions),
      trip,
      DATE,
      [],
    );
    expect(result.items[0]!.refId).toBe("shared");
    expect(result.items[2]!.refId).toBe("spare");
  });

  test("a retained meal is still a stop the next meal can be judged against", () => {
    // Morning and afternoon both empty, so dinner's previous stop is lunch
    // itself. A meal kept as it was is still somewhere the traveller will be,
    // and the meal after it has to be able to measure the walk from there.
    const backToBack: PlanItem[] = [
      { kind: "meal", refId: "shared", meal: "lunch", startTime: "12:30", endTime: "13:30" },
      { kind: "meal", refId: "shared", meal: "dinner", startTime: "18:00", endTime: "19:15" },
      { kind: "attraction", refId: "c", startTime: "20:00", endTime: "21:00" },
    ];
    const pool = [
      restaurant("shared", 37.803, -122.4),
      restaurant("spare", 37.8035, -122.4005),
    ];
    const result = repickMeals(
      backToBack,
      pool,
      new Map([["c", C]]),
      trip,
      DATE,
      [],
    );
    expect(result.items[0]!.refId).toBe("shared");
    expect(result.items[1]!.refId).toBe("spare");
  });
});

import { describe, expect, test } from "vitest";
import { buildPlan } from "@/planner/build";
import { toMinutes } from "@/planner/time";
import type { Attraction, Plan, Restaurant, TripRequest } from "@/types/workspace";

/**
 * Feasibility is the property the greedy builder exists to guarantee: it is the
 * fallback whenever the sandbox optimizer is unavailable, so a schedule nobody
 * can actually follow is worse than a sparse one.
 */

const OPEN_ALL_DAY = { status: "open", open: "08:00", close: "22:00" } as const;

function hours(dates: string[]) {
  return Object.fromEntries(dates.map((d) => [d, OPEN_ALL_DAY]));
}

function attraction(
  id: string,
  lat: number,
  lng: number,
  dates: string[],
  extra: Partial<Attraction> = {},
): Attraction {
  return {
    id,
    name: `Attraction ${id}`,
    category: "museum",
    location: { lat, lng },
    description: "",
    hoursByDate: hours(dates),
    estimatedVisitMinutes: 30,
    ticketRequired: false,
    photoUrls: [],
    sources: [],
    confidence: 0.8,
    ...extra,
  };
}

function restaurant(id: string, lat: number, lng: number, dates: string[]): Restaurant {
  return {
    id,
    name: `Restaurant ${id}`,
    cuisine: ["local"],
    location: { lat, lng },
    hoursByDate: hours(dates),
    sources: [],
    confidence: 0.7,
  };
}

/** Every emitted leg must fit in the gap the schedule leaves for it. */
function expectEveryLegFits(plan: Plan) {
  let checked = 0;
  for (const day of plan.days) {
    for (const leg of day.legs) {
      const from = day.items[leg.fromIndex]!;
      const to = day.items[leg.toIndex]!;
      const gap = toMinutes(to.startTime) - toMinutes(from.endTime);
      expect(
        gap,
        `${from.refId} → ${to.refId} on ${day.date}: ${gap} min available, ${leg.durationMinutes} min needed`,
      ).toBeGreaterThanOrEqual(leg.durationMinutes);
      checked += 1;
    }
  }
  expect(checked).toBeGreaterThan(0);
}

describe("travel time around meal anchors", () => {
  const DATES = ["2026-09-01"];
  // A tight cluster of short stops, so the morning runs right up to the lunch
  // anchor, and the only restaurants sit a real drive away.
  const attractions = Array.from({ length: 8 }, (_, i) =>
    attraction(`a${i}`, 35.72 + i * 0.002, 139.77 + i * 0.002, DATES),
  );
  const restaurants = [
    restaurant("r-lunch", 35.7, 139.73, DATES),
    restaurant("r-dinner", 35.699, 139.729, DATES),
  ];

  const trip: TripRequest = {
    destination: "Testville",
    startDate: DATES[0]!,
    endDate: DATES[0]!,
    hasRentalCar: false,
    pace: "packed",
    meals: { cuisines: [], strictness: "flexible" },
  };

  const plan = buildPlan({ trip, attractions, restaurants, ratings: {} });

  test("still seats lunch and dinner", () => {
    const meals = plan.days[0]!.items.filter((i) => i.kind === "meal");
    expect(meals.map((m) => m.meal).sort()).toEqual(["dinner", "lunch"]);
  });

  test("leaves room to travel into and out of the meal stops", () => {
    expectEveryLegFits(plan);
  });
});

describe("attractions stranded by their cluster's date", () => {
  const DATES = ["2026-09-01", "2026-09-02"];
  // Two clusters far enough apart that k-means separates them cleanly. The
  // eastern cluster is planned on the second date, so an eastern attraction
  // that is shut on that date has to be retried on the first.
  const attractions: Attraction[] = [
    attraction("west-1", 35.7, 139.6, DATES),
    attraction("west-2", 35.702, 139.602, DATES),
    attraction("east-1", 35.7, 139.8, DATES),
    attraction("east-2", 35.702, 139.802, DATES),
    attraction("east-shut-on-its-day", 35.701, 139.801, DATES, {
      hoursByDate: {
        "2026-09-01": OPEN_ALL_DAY,
        "2026-09-02": { status: "closed" },
      },
    }),
  ];
  const restaurants = [
    restaurant("r-west", 35.701, 139.601, DATES),
    restaurant("r-west-2", 35.703, 139.603, DATES),
    restaurant("r-east", 35.701, 139.801, DATES),
    restaurant("r-east-2", 35.703, 139.803, DATES),
  ];

  const trip: TripRequest = {
    destination: "Testville",
    startDate: DATES[0]!,
    endDate: DATES[1]!,
    hasRentalCar: false,
    pace: "balanced",
    meals: { cuisines: [], strictness: "flexible" },
  };

  const plan = buildPlan({ trip, attractions, restaurants, ratings: {} });

  test("retries a candidate on a date where it is actually open", () => {
    const scheduled = plan.days.flatMap((d) =>
      d.items.filter((i) => i.kind === "attraction").map((i) => i.refId),
    );
    expect(scheduled).toContain("east-shut-on-its-day");
  });

  test("does not schedule it on the date it is closed", () => {
    const closedDay = plan.days.find((d) => d.date === "2026-09-02")!;
    expect(closedDay.items.map((i) => i.refId)).not.toContain("east-shut-on-its-day");
  });

  test("keeps every attraction on exactly one day", () => {
    const ids = plan.days.flatMap((d) =>
      d.items.filter((i) => i.kind === "attraction").map((i) => i.refId),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("does not claim a scheduled attraction never fit", () => {
    expect(plan.excludedAttractionIds).not.toContain("east-shut-on-its-day");
  });

  test("stays feasible while doing it", () => {
    expectEveryLegFits(plan);
  });
});

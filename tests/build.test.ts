import { beforeAll, describe, expect, test } from "vitest";
import { buildPlan } from "@/planner/build";
import { openDuring, toMinutes } from "@/planner/time";
import type { Attraction, Plan, Restaurant, TripRequest } from "@/types/workspace";

const DATES = ["2026-09-01", "2026-09-02"];
const OPEN = { status: "open", open: "09:00", close: "19:00" } as const;
// Restaurants keep later hours than attractions, or dinner is never seatable.
const RESTAURANT_OPEN = { status: "open", open: "09:00", close: "22:00" } as const;
const allOpen = Object.fromEntries(DATES.map((d) => [d, OPEN]));
const allOpenLate = Object.fromEntries(DATES.map((d) => [d, RESTAURANT_OPEN]));

function attraction(id: string, lat: number, lng: number, extra: Partial<Attraction> = {}): Attraction {
  return {
    id,
    name: `Attraction ${id}`,
    category: "museum",
    location: { lat, lng },
    description: "",
    hoursByDate: { ...allOpen },
    estimatedVisitMinutes: 60,
    ticketRequired: false,
    photoUrls: [],
    sources: [],
    confidence: 0.8,
    ...extra,
  };
}

function restaurant(id: string, lat: number, lng: number): Restaurant {
  return {
    id,
    name: `Restaurant ${id}`,
    cuisine: ["local"],
    location: { lat, lng },
    hoursByDate: { ...allOpenLate },
    sources: [],
    confidence: 0.7,
  };
}

const trip: TripRequest = {
  destination: "Testville",
  startDate: DATES[0]!,
  endDate: DATES[1]!,
  hasRentalCar: false,
  pace: "balanced",
  meals: { cuisines: ["local"], strictness: "flexible" },
};

// Two geographic clusters so the planner has a real assignment decision.
const attractions: Attraction[] = [
  attraction("north-1", 35.72, 139.77),
  attraction("north-2", 35.723, 139.774),
  attraction("north-3", 35.726, 139.771, { category: "garden" }),
  attraction("south-1", 35.63, 139.71),
  attraction("south-2", 35.634, 139.714, { category: "temple" }),
  attraction("south-3", 35.637, 139.708),
  attraction("skipme", 35.70, 139.75),
  attraction("shut", 35.71, 139.76, {
    hoursByDate: Object.fromEntries(DATES.map((d) => [d, { status: "closed" as const }])),
  }),
];

const restaurants: Restaurant[] = [
  restaurant("r-north", 35.724, 139.772),
  restaurant("r-north-2", 35.721, 139.769),
  restaurant("r-south", 35.635, 139.712),
  restaurant("r-south-2", 35.632, 139.709),
];

const ratings = {
  "north-1": 4,
  "north-2": 3,
  "north-3": 2,
  "south-1": 4,
  "south-2": 3,
  "south-3": 2,
  skipme: 0,
} as const;

describe("buildPlan", () => {
  let plan: Plan;
  beforeAll(() => {
    plan = buildPlan({ trip, attractions, restaurants, ratings });
  });

  test("produces one day per trip date", () => {
    expect(plan.days.map((d) => d.date)).toEqual(DATES);
  });

  test("never schedules the same attraction twice across the trip", () => {
    const ids = plan.days.flatMap((d) =>
      d.items.filter((i) => i.kind === "attraction").map((i) => i.refId),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("excludes an attraction rated not interested and records why", () => {
    expect(plan.excludedAttractionIds).toContain("skipme");
    const reason = plan.diagnostics.excluded.find((e) => e.attractionId === "skipme");
    expect(reason?.reason).toMatch(/not interested/i);
  });

  test("excludes an attraction closed on every trip date", () => {
    expect(plan.excludedAttractionIds).toContain("shut");
  });

  test("schedules every attraction inside its opening hours", () => {
    for (const day of plan.days) {
      for (const item of day.items) {
        if (item.kind !== "attraction") continue;
        const source = attractions.find((a) => a.id === item.refId)!;
        const check = openDuring(
          source.hoursByDate[day.date],
          toMinutes(item.startTime),
          toMinutes(item.endTime),
        );
        expect(check).not.toBe("closed");
      }
    }
  });

  test("keeps every item inside the day window", () => {
    for (const day of plan.days) {
      for (const item of day.items) {
        expect(toMinutes(item.startTime)).toBeGreaterThanOrEqual(toMinutes("09:00"));
        expect(toMinutes(item.endTime)).toBeLessThanOrEqual(toMinutes("20:30"));
      }
    }
  });

  test("orders each day chronologically", () => {
    for (const day of plan.days) {
      const starts = day.items.map((i) => toMinutes(i.startTime));
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    }
  });

  test("inserts one lunch and one dinner on each day", () => {
    for (const day of plan.days) {
      const meals = day.items.filter((i) => i.kind === "meal");
      expect(meals.filter((m) => m.meal === "lunch")).toHaveLength(1);
      expect(meals.filter((m) => m.meal === "dinner")).toHaveLength(1);
    }
  });

  test("produces one route leg between each adjacent pair of items", () => {
    for (const day of plan.days) {
      expect(day.legs).toHaveLength(Math.max(0, day.items.length - 1));
    }
  });

  test("never emits a transit leg with a transfer", () => {
    for (const day of plan.days) {
      for (const leg of day.legs) {
        if (leg.mode === "transit") expect(leg.transferCount).toBe(0);
      }
    }
  });

  test("marks legs as estimated when no routing provider supplied them", () => {
    const legs = plan.days.flatMap((d) => d.legs);
    expect(legs.length).toBeGreaterThan(0);
    expect(legs.every((l) => l.estimated)).toBe(true);
  });

  test("includes both must-see attractions", () => {
    const ids = plan.days.flatMap((d) => d.items.map((i) => i.refId));
    expect(ids).toContain("north-1");
    expect(ids).toContain("south-1");
  });

  test("reports diagnostics consistent with the itinerary", () => {
    const scheduled = plan.days.flatMap((d) =>
      d.items.filter((i) => i.kind === "attraction"),
    ).length;
    expect(plan.diagnostics.included).toBe(scheduled);
    expect(plan.diagnostics.considered).toBe(attractions.length);
  });
});

describe("car days", () => {
  test("a car trip never mixes transit into a day", () => {
    const carPlan = buildPlan({
      trip: { ...trip, hasRentalCar: true },
      attractions,
      restaurants,
      ratings,
    });
    for (const day of carPlan.days) {
      expect(day.isCarDay).toBe(true);
      expect(day.legs.some((l) => l.mode === "transit")).toBe(false);
    }
  });
});

describe("meal opening hours", () => {
  test("does not seat lunch at a restaurant that only opens for dinner", () => {
    // The only nearby restaurant opens at 17:00; a distant one is open at noon.
    const dinnerOnly: Restaurant = {
      ...restaurant("r-dinner-only", 35.7205, 139.7715),
      hoursByDate: Object.fromEntries(
        DATES.map((d) => [d, { status: "open" as const, open: "17:00", close: "23:00" }]),
      ),
    };
    const allDay: Restaurant = {
      ...restaurant("r-all-day", 35.60, 139.65),
      hoursByDate: Object.fromEntries(
        DATES.map((d) => [d, { status: "open" as const, open: "08:00", close: "22:00" }]),
      ),
    };

    const plan = buildPlan({
      trip,
      attractions,
      restaurants: [dinnerOnly, allDay],
      ratings,
    });

    const lunches = plan.days.flatMap((d) =>
      d.items.filter((i) => i.kind === "meal" && i.meal === "lunch"),
    );
    expect(lunches.length).toBeGreaterThan(0);
    for (const lunch of lunches) {
      expect(lunch.refId).not.toBe("r-dinner-only");
    }
  });
});

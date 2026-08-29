import { describe, expect, test } from "vitest";
import { buildPlan, tripDates } from "@/planner/build";
import { validateAgentPlan } from "@/agent/planValidation";
import { openDuring, toMinutes } from "@/planner/time";
import { seedAttractions, seedRestaurants, SEED_DESTINATION } from "@/data/seed-tokyo";
import type { Rating, TripRequest } from "@/types/workspace";

// A Monday start, so the seed data's Monday closures are exercised.
const trip: TripRequest = {
  destination: SEED_DESTINATION,
  startDate: "2026-09-07",
  endDate: "2026-09-09",
  hasRentalCar: false,
  pace: "balanced",
  meals: { cuisines: ["japanese", "local"], strictness: "prefer" },
};

const dates = tripDates(trip);
const attractions = seedAttractions(dates);
const restaurants = seedRestaurants(dates);
const ratings: Record<string, Rating> = {
  sensoji: 4,
  skytree: 3,
  "ueno-park": 2,
  "tokyo-national-museum": 3,
  akihabara: 1,
  "imperial-gardens": 3,
  ginza: 1,
  "tsukiji-outer": 4,
  "teamlab-planets": 4,
  "shibuya-crossing": 3,
  "meiji-jingu": 4,
  "shinjuku-gyoen": 2,
  "tmg-observation": 2,
  harajuku: 0,
};

const plan = buildPlan({ trip, attractions, restaurants, ratings });

describe("seed dataset", () => {
  test("provides at least twelve candidate attractions", () => {
    expect(attractions.length).toBeGreaterThanOrEqual(12);
  });

  test("marks Monday-closed attractions as closed on the Monday", () => {
    const museum = attractions.find((a) => a.id === "tokyo-national-museum")!;
    expect(museum.hoursByDate["2026-09-07"]).toEqual({ status: "closed" });
    expect(museum.hoursByDate["2026-09-08"]?.status).toBe("open");
  });
});

describe("golden itinerary from seed data", () => {
  test("plans all three days", () => {
    expect(plan.days).toHaveLength(3);
  });

  test("schedules a useful number of stops", () => {
    expect(plan.diagnostics.included).toBeGreaterThanOrEqual(8);
  });

  test("excludes the attraction rated not interested", () => {
    expect(plan.excludedAttractionIds).toContain("harajuku");
  });

  test("never schedules an attraction on a date it is closed", () => {
    for (const day of plan.days) {
      for (const item of day.items) {
        if (item.kind !== "attraction") continue;
        const source = attractions.find((a) => a.id === item.refId)!;
        expect(source.hoursByDate[day.date]?.status).not.toBe("closed");
      }
    }
  });

  test("never schedules a meal at a restaurant that is shut at that hour", () => {
    for (const day of plan.days) {
      for (const item of day.items) {
        if (item.kind !== "meal") continue;
        const source = restaurants.find((r) => r.id === item.refId)!;
        const check = openDuring(
          source.hoursByDate[day.date],
          toMinutes(item.startTime),
          toMinutes(item.endTime),
        );
        expect(check, `${source.name} at ${item.startTime} on ${day.date}`).not.toBe("closed");
      }
    }
  });

  test("visits each attraction at most once across the whole trip", () => {
    const ids = plan.days.flatMap((d) =>
      d.items.filter((i) => i.kind === "attraction").map((i) => i.refId),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("leaves enough time between stops to actually travel between them", () => {
    let checked = 0;
    for (const day of plan.days) {
      for (const leg of day.legs) {
        const from = day.items[leg.fromIndex]!;
        const to = day.items[leg.toIndex]!;
        const gap = toMinutes(to.startTime) - toMinutes(from.endTime);
        expect(
          gap,
          `${from.refId} \u2192 ${to.refId} on ${day.date}: ${gap} min available, ${leg.durationMinutes} min needed`,
        ).toBeGreaterThanOrEqual(leg.durationMinutes);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("seats lunch and dinner on every day of the seed trip", () => {
    expect(plan.diagnostics.unplacedMeals).toEqual([]);
    for (const day of plan.days) {
      const meals = day.items.filter((i) => i.kind === "meal");
      expect(meals.filter((m) => m.meal === "lunch")).toHaveLength(1);
      expect(meals.filter((m) => m.meal === "dinner")).toHaveLength(1);
    }
  });

  test("emits no transit leg with a transfer", () => {
    for (const leg of plan.days.flatMap((d) => d.legs)) {
      if (leg.mode === "transit") expect(leg.transferCount).toBe(0);
    }
  });
});

/**
 * The validator is the trust boundary for an agent-written schedule, and the
 * deterministic planner is what answers when that schedule is rejected. If the
 * reference implementation cannot satisfy the boundary, the boundary is wrong:
 * it would reject every honest schedule and leave the product with nothing to
 * fall back to.
 */
describe("the deterministic planner satisfies the agent trust boundary", () => {
  test("its own itinerary passes the checks an agent plan must pass", () => {
    const result = validateAgentPlan(
      plan.days,
      { trip, dates, attractions, restaurants },
      plan.diagnostics.excluded,
    );
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

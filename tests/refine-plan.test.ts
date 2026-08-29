import { describe, expect, test, vi } from "vitest";
import { refinePlanRoutes } from "@/routing/refinePlan";
import { RoutingUnavailable, type ResolvedRoute } from "@/routing/googleRoutes";
import type { Attraction, Plan, Restaurant, TripRequest } from "@/types/workspace";

const DATES = ["2026-09-12"];
const OPEN = { status: "open", open: "08:00", close: "22:00" } as const;

const attractions: Attraction[] = ["a1", "a2"].map((id, i) => ({
  id, name: id, category: "landmark",
  location: { lat: 37.78 + i * 0.01, lng: -122.41 - i * 0.01 },
  description: "", hoursByDate: { [DATES[0]!]: OPEN }, estimatedVisitMinutes: 60,
  ticketRequired: false, photoUrls: [], sources: [], confidence: 0.6,
}));

const restaurants: Restaurant[] = [{
  id: "r1", name: "R1", cuisine: ["local"], location: { lat: 37.79, lng: -122.4 },
  hoursByDate: { [DATES[0]!]: OPEN }, sources: [], confidence: 0.6,
}];

const trip: TripRequest = {
  destination: "San Francisco, USA", startDate: DATES[0]!, endDate: DATES[0]!,
  hasRentalCar: false, pace: "balanced", meals: { cuisines: [], strictness: "flexible" },
};

function plan(): Plan {
  return {
    id: "p1", version: 1, summary: "", excludedAttractionIds: [],
    days: [{
      date: DATES[0]!, isCarDay: false,
      items: [
        { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
        { kind: "meal", refId: "r1", meal: "lunch", startTime: "12:30", endTime: "13:30" },
        { kind: "attraction", refId: "a2", startTime: "14:00", endTime: "15:00" },
      ],
      legs: [
        { fromIndex: 0, toIndex: 1, mode: "rideshare", durationMinutes: 9, distanceMeters: 2000, estimated: true },
        { fromIndex: 1, toIndex: 2, mode: "rideshare", durationMinutes: 9, distanceMeters: 2000, estimated: true },
      ],
      summary: "",
    }],
    diagnostics: {
      considered: 2, included: 2, excluded: [], routeCalls: 0, cacheHits: 0,
      transitAccepted: 0, transitRejected: 0, attractionMinutes: 120,
      transportMinutes: 18, score: 0, unplacedMeals: [],
    },
  };
}

function route(over: Partial<ResolvedRoute> = {}): ResolvedRoute {
  return { durationMinutes: 12, distanceMeters: 2400, transitLines: [], transferCount: 0, ...over };
}

describe("with routing available", () => {
  test("replaces estimated legs with measured ones", async () => {
    const resolve = vi.fn(async ({ mode }: { mode: string }) =>
      mode === "walk" ? route({ durationMinutes: 40 })
      : mode === "transit" ? route({ durationMinutes: 14, transitLines: ["N"] })
      : route({ durationMinutes: 11 }),
    );
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, resolve);
    const legs = result.plan.days[0]!.legs;
    expect(legs.every((l) => l.estimated === false)).toBe(true);
    expect(legs[0]!.mode).toBe("transit");
    expect(legs[0]!.transitLines).toEqual(["N"]);
    expect(result.degraded).toBeNull();
  });

  test("counts the transit legs it accepted and rejected", async () => {
    const resolve = vi.fn(async ({ mode }: { mode: string }) =>
      mode === "walk" ? route({ durationMinutes: 40 })
      : mode === "transit" ? route({ durationMinutes: 14, transitLines: ["N", "38"], transferCount: 1 })
      : route({ durationMinutes: 11 }),
    );
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, resolve);
    expect(result.plan.diagnostics.transitRejected).toBe(2);
    expect(result.plan.diagnostics.transitAccepted).toBe(0);
  });

  test("keeps the itinerary's times untouched", async () => {
    const resolve = vi.fn(async () => route());
    const before = plan().days[0]!.items.map((i) => i.startTime);
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, resolve);
    expect(result.plan.days[0]!.items.map((i) => i.startTime)).toEqual(before);
  });

  test("records how many route calls were made", async () => {
    const resolve = vi.fn(async () => route({ durationMinutes: 5 }));
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, resolve);
    expect(result.plan.diagnostics.routeCalls).toBeGreaterThan(0);
  });
});

describe("with routing unavailable", () => {
  test("keeps the plan and says routing is degraded", async () => {
    const resolve = vi.fn(async () => {
      throw new RoutingUnavailable("The Google Maps key was rejected.");
    });
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, resolve);
    expect(result.plan.days[0]!.legs.every((l) => l.estimated)).toBe(true);
    expect(result.degraded).toMatch(/rejected|estimate/i);
  });

  test("never leaves a transit leg behind when it could not check transfers", async () => {
    const resolve = vi.fn(async () => {
      throw new RoutingUnavailable("down");
    });
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, resolve);
    expect(result.plan.days[0]!.legs.some((l) => l.mode === "transit")).toBe(false);
  });
});

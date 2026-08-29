import { describe, expect, test, vi } from "vitest";
import { refinePlanRoutes } from "@/routing/refinePlan";
import { RoutingUnavailable, type ResolvedRoute } from "@/routing/googleRoutes";
import { parseClock } from "@/planner/time";
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
      : mode === "transit" ? route({ durationMinutes: 14, transitLines: ["N", "38", "J"], transferCount: 2 })
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

/**
 * Measured travel is longer than modelled travel more often than not, and the
 * schedule was written against the model. Committing the measurement and
 * leaving the clock alone produced an itinerary that contradicted itself: a
 * thirty-minute gap with a fifty-minute journey drawn across it, arriving
 * before it left.
 */
describe("keeping the schedule true to the measured legs", () => {
  const slow = (minutes: number) =>
    vi.fn(async ({ mode }: { mode: string }) =>
      mode === "walk" ? route({ durationMinutes: 400 }) : route({ durationMinutes: minutes }),
    );

  test("pushes the stops a longer journey no longer fits in front of", async () => {
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, slow(200));
    // The first stop ends at 10:00, so a 200-minute journey lands at 13:20;
    // the meal keeps its hour and the last stop follows the same way.
    expect(result.plan.days[0]!.items.map((i) => i.startTime)).toEqual([
      "09:00",
      "13:20",
      "17:40",
    ]);
    expect(result.plan.days[0]!.items.map((i) => i.endTime)).toEqual([
      "10:00",
      "14:20",
      "18:40",
    ]);
  });

  test("leaves slack as slack when the journey turns out to be quicker", async () => {
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, slow(5));
    expect(result.plan.days[0]!.items.map((i) => i.startTime)).toEqual([
      "09:00",
      "12:30",
      "14:00",
    ]);
  });

  test("says so when the measured legs push the day past its end", async () => {
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, slow(400));
    expect(result.degraded).toMatch(/past the end of the day/i);
  });

  test("says so when a meal is pushed out of the hour it can be eaten in", async () => {
    // Lunch is acceptable until 13:45. A 250-minute first leg lands the
    // traveller at the restaurant at 14:10, which the plan validator would
    // reject outright — so refinement must not return it as if it were fine.
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, slow(250));
    expect(result.plan.days[0]!.items[1]!.startTime).toBe("14:10");
    expect(result.degraded).toMatch(/lunch/i);
  });

  test("never writes a clock the app cannot read back", async () => {
    // 400-minute legs run the last stop past midnight, and there is no hour of
    // this day left to move it to. A "24:20" would fail the app's own parser
    // and reach the traveller as a time that does not exist.
    const result = await refinePlanRoutes(plan(), { trip, attractions, restaurants }, slow(400));
    for (const day of result.plan.days) {
      for (const item of day.items) {
        expect(parseClock(item.startTime), `${item.refId} starts at ${item.startTime}`).not.toBeNull();
        expect(parseClock(item.endTime), `${item.refId} ends at ${item.endTime}`).not.toBeNull();
      }
    }
    expect(result.degraded).toMatch(/past the end of the day/i);
  });

  test("says so when a stop is shut by the time the traveller gets there", async () => {
    const closesEarly = attractions.map((a) =>
      a.id === "a2"
        ? { ...a, hoursByDate: { [DATES[0]!]: { status: "open", open: "08:00", close: "16:00" } as const } }
        : a,
    );
    const result = await refinePlanRoutes(
      plan(),
      { trip, attractions: closesEarly, restaurants },
      slow(200),
    );
    expect(result.degraded).toMatch(/a2/);
    expect(result.degraded).toMatch(/closed/i);
  });
});

describe("the moment each leg is asked about", () => {
  test("asks about the departure the itinerary actually schedules", async () => {
    const resolve = vi.fn(async ({ mode }: { mode: string }) =>
      mode === "walk" ? route({ durationMinutes: 40 }) : route({ durationMinutes: 11 }),
    );
    await refinePlanRoutes(
      plan(),
      { trip, attractions, restaurants, timeZone: "America/Los_Angeles" },
      resolve,
    );

    const transitAt = resolve.mock.calls
      .map(([r]) => r as { mode: string; departureTime?: string })
      .filter((r) => r.mode === "transit")
      .map((r) => r.departureTime);
    // The first stop ends at 10:00 and the meal at 13:30, local to the
    // destination, which is UTC-7 on that date.
    expect(transitAt).toEqual(["2026-09-12T17:00:00Z", "2026-09-12T20:30:00Z"]);
  });

  test("asks about the departure as re-timed, not the one it replaced", async () => {
    const resolve = vi.fn(async ({ mode }: { mode: string }) =>
      mode === "walk" ? route({ durationMinutes: 400 }) : route({ durationMinutes: 200 }),
    );
    await refinePlanRoutes(
      plan(),
      { trip, attractions, restaurants, timeZone: "America/Los_Angeles" },
      resolve,
    );

    const transitAt = resolve.mock.calls
      .map(([r]) => r as { mode: string; departureTime?: string })
      .filter((r) => r.mode === "transit")
      .map((r) => r.departureTime);
    // A 200-minute first leg moves the meal from 12:30 to 13:20, so the
    // traveller leaves it at 14:20 rather than the 13:30 originally written.
    expect(transitAt).toEqual(["2026-09-12T17:00:00Z", "2026-09-12T21:20:00Z"]);
  });

  test("asks about no particular moment when the zone is unknown", async () => {
    const resolve = vi.fn(async ({ mode }: { mode: string }) =>
      mode === "walk" ? route({ durationMinutes: 40 }) : route({ durationMinutes: 11 }),
    );
    await refinePlanRoutes(plan(), { trip, attractions, restaurants }, resolve);

    const transit = resolve.mock.calls
      .map(([r]) => r as { mode: string; departureTime?: string })
      .filter((r) => r.mode === "transit");
    expect(transit.length).toBeGreaterThan(0);
    for (const request of transit) expect(request.departureTime).toBeUndefined();
  });

  test("does not ask about a moment that has already passed", async () => {
    const resolve = vi.fn(async ({ mode }: { mode: string }) =>
      mode === "walk" ? route({ durationMinutes: 40 }) : route({ durationMinutes: 11 }),
    );
    const past = plan();
    past.days[0]!.date = "2020-03-04";
    await refinePlanRoutes(
      past,
      {
        trip: { ...trip, startDate: "2020-03-04", endDate: "2020-03-04" },
        attractions,
        restaurants,
        timeZone: "America/Los_Angeles",
      },
      resolve,
    );

    const transit = resolve.mock.calls
      .map(([r]) => r as { mode: string; departureTime?: string })
      .filter((r) => r.mode === "transit");
    expect(transit.length).toBeGreaterThan(0);
    for (const request of transit) expect(request.departureTime).toBeUndefined();
  });
});

describe("the default resolver", () => {
  test("caches across refinements so a replan re-routes nothing", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ routes: [{ duration: "600s", distanceMeters: 2400 }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await refinePlanRoutes(plan(), { trip, attractions, restaurants });
      const afterFirst = fetchMock.mock.calls.length;
      expect(afterFirst).toBeGreaterThan(0);

      await refinePlanRoutes(plan(), { trip, attractions, restaurants });
      expect(fetchMock.mock.calls.length).toBe(afterFirst);
    } finally {
      vi.unstubAllGlobals();
    }
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

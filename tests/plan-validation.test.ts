import { describe, expect, test } from "vitest";
import { validateAgentPlan } from "@/agent/planValidation";
import type { Attraction, PlanDay, Restaurant, TripRequest } from "@/types/workspace";

/**
 * The optimizer's output is agent-produced, so it is checked against the same
 * hard rules the local planner obeys. A schedule that violates one of these is
 * not a worse itinerary, it is an unfollowable one, and it must be rejected
 * rather than shown.
 */

const DATES = ["2026-09-12", "2026-09-13"];
const OPEN = { status: "open", open: "09:00", close: "19:00" } as const;

const attractions: Attraction[] = ["a1", "a2", "a3"].map((id, i) => ({
  id,
  name: `A${i}`,
  category: "museum",
  location: { lat: 35.7 + i * 0.01, lng: 139.7 + i * 0.01 },
  description: "",
  hoursByDate: Object.fromEntries(DATES.map((d) => [d, OPEN])),
  estimatedVisitMinutes: 60,
  ticketRequired: false,
  photoUrls: [],
  sources: [],
  confidence: 0.8,
}));

const restaurants: Restaurant[] = [
  {
    id: "r1",
    name: "R1",
    cuisine: ["japanese"],
    location: { lat: 35.705, lng: 139.705 },
    hoursByDate: Object.fromEntries(
      DATES.map((d) => [d, { status: "open", open: "09:00", close: "22:00" } as const]),
    ),
    sources: [],
    confidence: 0.7,
  },
];

const trip: TripRequest = {
  destination: "Testville",
  startDate: DATES[0]!,
  endDate: DATES[1]!,
  hasRentalCar: false,
  pace: "balanced",
  meals: { cuisines: [], strictness: "flexible" },
};

function day(overrides: Partial<PlanDay> = {}): PlanDay {
  return {
    date: DATES[0]!,
    isCarDay: false,
    items: [
      { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
      { kind: "meal", refId: "r1", meal: "lunch", startTime: "12:30", endTime: "13:30" },
    ],
    legs: [
      { fromIndex: 0, toIndex: 1, mode: "walk", durationMinutes: 10, distanceMeters: 800 },
    ],
    summary: "",
    ...overrides,
  };
}

function check(days: PlanDay[]) {
  return validateAgentPlan(days, { trip, dates: DATES, attractions, restaurants });
}

describe("accepting a sound schedule", () => {
  test("accepts a day that breaks no rule", () => {
    expect(check([day()]).ok).toBe(true);
  });
});

describe("rejecting an unfollowable schedule", () => {
  test("rejects an attraction scheduled on two days", () => {
    const result = check([day(), day({ date: DATES[1]! })]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/more than once|twice/i);
  });

  test("rejects an item that runs past the end of the day", () => {
    const result = check([
      day({
        items: [{ kind: "attraction", refId: "a1", startTime: "20:00", endTime: "21:30" }],
        legs: [],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/day window/i);
  });

  test("rejects an attraction scheduled while it is closed", () => {
    const shut = attractions.map((a) =>
      a.id === "a1"
        ? { ...a, hoursByDate: { ...a.hoursByDate, [DATES[0]!]: { status: "closed" as const } } }
        : a,
    );
    const result = validateAgentPlan([day()], {
      trip,
      dates: DATES,
      attractions: shut,
      restaurants,
    });
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/closed/i);
  });

  test("rejects a transit leg that requires a transfer", () => {
    const result = check([
      day({
        legs: [
          {
            fromIndex: 0,
            toIndex: 1,
            mode: "transit",
            durationMinutes: 10,
            distanceMeters: 800,
            transferCount: 1,
          },
        ],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/transfer/i);
  });

  test("rejects a car day that also uses transit", () => {
    const result = check([
      day({
        isCarDay: true,
        legs: [
          {
            fromIndex: 0,
            toIndex: 1,
            mode: "transit",
            durationMinutes: 10,
            distanceMeters: 800,
            transferCount: 0,
          },
        ],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/car day/i);
  });

  test("rejects items that are not in chronological order", () => {
    const result = check([
      day({
        items: [
          { kind: "attraction", refId: "a1", startTime: "14:00", endTime: "15:00" },
          { kind: "meal", refId: "r1", meal: "lunch", startTime: "12:30", endTime: "13:30" },
        ],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/order/i);
  });

  test("rejects a leg that cannot fit in the gap between its stops", () => {
    // 10:00 to 12:30 is 150 minutes; a 200-minute leg does not fit.
    const result = check([
      day({
        legs: [
          { fromIndex: 0, toIndex: 1, mode: "car", durationMinutes: 200, distanceMeters: 90000 },
        ],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/travel time|does not fit/i);
  });

  test("rejects a reference to something that was never discovered", () => {
    const result = check([
      day({
        items: [{ kind: "attraction", refId: "ghost", startTime: "09:00", endTime: "10:00" }],
        legs: [],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/unknown|not discovered/i);
  });

  test("rejects a date that is not part of the trip", () => {
    const result = check([day({ date: "2027-01-01" })]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/date/i);
  });

  test("reports every violation, not just the first", () => {
    const result = check([
      day({
        items: [{ kind: "attraction", refId: "ghost", startTime: "22:00", endTime: "23:00" }],
        legs: [],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(1);
  });
});

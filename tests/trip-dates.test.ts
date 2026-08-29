import { describe, expect, test } from "vitest";
import { MAX_TRIP_DAYS, buildPlan, tripDates, validateTripDates } from "@/planner/build";
import type { TripRequest } from "@/types/workspace";

const trip: TripRequest = {
  destination: "Testville",
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  hasRentalCar: false,
  pace: "balanced",
  meals: { cuisines: [], strictness: "flexible" },
};

describe("validateTripDates", () => {
  test("accepts a well-formed range", () => {
    expect(validateTripDates("2026-09-01", "2026-09-03")).toBeNull();
  });

  test("accepts a single-day trip", () => {
    expect(validateTripDates("2026-09-01", "2026-09-01")).toBeNull();
  });

  test("rejects an empty first day", () => {
    expect(validateTripDates("", "2026-09-03")).toMatch(/first day/i);
  });

  test("rejects an empty last day", () => {
    expect(validateTripDates("2026-09-01", "")).toMatch(/last day/i);
  });

  test("rejects two empty dates rather than treating them as equal", () => {
    expect(validateTripDates("", "")).not.toBeNull();
  });

  test("rejects a date that is not a real calendar date", () => {
    expect(validateTripDates("2026-02-30", "2026-03-02")).toMatch(/real date|calendar/i);
  });

  test("rejects a malformed date string", () => {
    expect(validateTripDates("next tuesday", "2026-03-02")).not.toBeNull();
  });

  test("rejects an end date before the start date", () => {
    expect(validateTripDates("2026-09-05", "2026-09-01")).toMatch(/before the first/i);
  });

  test("rejects a range longer than the supported maximum", () => {
    const start = "2026-01-01";
    const end = "2027-06-01";
    expect(validateTripDates(start, end)).toMatch(new RegExp(String(MAX_TRIP_DAYS)));
  });

  test("accepts a range exactly at the maximum", () => {
    const end = new Date(Date.UTC(2026, 0, MAX_TRIP_DAYS));
    expect(validateTripDates("2026-01-01", end.toISOString().slice(0, 10))).toBeNull();
  });
});

describe("tripDates", () => {
  test("expands an inclusive range", () => {
    expect(tripDates(trip)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  test("returns nothing for an unusable range instead of looping", () => {
    expect(tripDates({ ...trip, startDate: "", endDate: "" })).toEqual([]);
  });

  test("never expands beyond the supported maximum", () => {
    const dates = tripDates({ ...trip, startDate: "2026-01-01", endDate: "2030-01-01" });
    expect(dates.length).toBeLessThanOrEqual(MAX_TRIP_DAYS);
  });
});

describe("buildPlan input validation", () => {
  test("refuses an empty date range instead of returning a zero-day plan", () => {
    expect(() =>
      buildPlan({
        trip: { ...trip, startDate: "", endDate: "" },
        attractions: [],
        restaurants: [],
        ratings: {},
      }),
    ).toThrow(/first day/i);
  });

  test("refuses an unbounded date range", () => {
    expect(() =>
      buildPlan({
        trip: { ...trip, startDate: "2026-01-01", endDate: "2036-01-01" },
        attractions: [],
        restaurants: [],
        ratings: {},
      }),
    ).toThrow(new RegExp(String(MAX_TRIP_DAYS)));
  });
});

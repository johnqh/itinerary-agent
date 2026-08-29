import { describe, expect, test } from "vitest";
import { selectMode, walkThresholdMinutes } from "@/planner/transport";
import type { TravelOption } from "@/planner/transport";

const base: TravelOption = {
  walkMinutes: 40,
  driveMinutes: 15,
  driveMeters: 6000,
  transit: null,
};

describe("walking", () => {
  test("chooses walking when the walk is within the pace threshold", () => {
    const decision = selectMode(
      { ...base, walkMinutes: 12 },
      { isCarDay: false, pace: "balanced" },
    );
    expect(decision.mode).toBe("walk");
    expect(decision.durationMinutes).toBe(12);
  });

  test("does not walk beyond the pace threshold", () => {
    const decision = selectMode(
      { ...base, walkMinutes: 22 },
      { isCarDay: false, pace: "balanced" },
    );
    expect(decision.mode).not.toBe("walk");
  });

  test("a packed pace tolerates a longer walk than a relaxed one", () => {
    expect(walkThresholdMinutes("packed")).toBeGreaterThan(
      walkThresholdMinutes("relaxed"),
    );
  });

  test("walks a short leg even on a car day", () => {
    const decision = selectMode(
      { ...base, walkMinutes: 8 },
      { isCarDay: true, pace: "balanced" },
    );
    expect(decision.mode).toBe("walk");
  });
});

describe("car days", () => {
  test("uses car for every non-walking leg on a car day", () => {
    const decision = selectMode(
      {
        ...base,
        transit: { minutes: 16, transferCount: 0, lines: ["Ginza Line"] },
      },
      { isCarDay: true, pace: "balanced" },
    );
    expect(decision.mode).toBe("car");
  });
});

describe("transit acceptance", () => {
  test("accepts direct transit and reports its lines", () => {
    const decision = selectMode(
      {
        ...base,
        transit: { minutes: 18, transferCount: 0, lines: ["Ginza Line"] },
      },
      { isCarDay: false, pace: "balanced" },
    );
    expect(decision.mode).toBe("transit");
    expect(decision.transitLines).toEqual(["Ginza Line"]);
    expect(decision.transferCount).toBe(0);
  });

  test("rejects a transit route that requires a transfer", () => {
    const decision = selectMode(
      {
        ...base,
        transit: { minutes: 18, transferCount: 1, lines: ["A", "B"] },
      },
      { isCarDay: false, pace: "balanced" },
    );
    expect(decision.mode).toBe("rideshare");
    expect(decision.fallbackReason).toMatch(/transfer/i);
  });

  test("rejects transit that takes more than twice the rideshare estimate", () => {
    const decision = selectMode(
      {
        ...base,
        driveMinutes: 10,
        transit: { minutes: 45, transferCount: 0, lines: ["Slow Line"] },
      },
      { isCarDay: false, pace: "balanced" },
    );
    expect(decision.mode).toBe("rideshare");
    expect(decision.fallbackReason).toMatch(/slower|twice/i);
  });

  test("falls back to rideshare when no transit data exists", () => {
    const decision = selectMode(base, { isCarDay: false, pace: "balanced" });
    expect(decision.mode).toBe("rideshare");
    expect(decision.fallbackReason).toMatch(/unavailable/i);
  });
});

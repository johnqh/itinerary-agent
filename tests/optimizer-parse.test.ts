import { describe, expect, test } from "vitest";
import { toPlanDays } from "@/agent/optimizer";
import { optimizerSchema } from "@/agent/optimizerAgent";

/**
 * The scheduler's JSON is agent-produced. Malformed pieces are dropped rather
 * than coerced into something plausible, because a leg with a missing mode or
 * an item with no end time is not a smaller problem than a wrong one: the
 * validator can only reject what it can see.
 */

function payload(overrides: Record<string, unknown> = {}) {
  return {
    summary: "Two days in Testville.",
    days: [
      {
        date: "2026-09-12",
        isCarDay: false,
        summary: "Day one.",
        items: [
          { kind: "attraction", refId: "a1", meal: null, startTime: "09:00", endTime: "10:00", notes: null },
          { kind: "meal", refId: "r1", meal: "lunch", startTime: "12:30", endTime: "13:30", notes: null },
        ],
        legs: [
          { fromIndex: 0, toIndex: 1, mode: "walk", durationMinutes: 12, distanceMeters: 900, fallbackReason: null },
        ],
      },
    ],
    excluded: [{ attractionId: "a9", reason: "Closed all trip." }],
    ...overrides,
  };
}

describe("the shape the scheduler is asked for", () => {
  /**
   * No routing provider runs on this path, so a transit line or a transfer
   * count would be invented rather than retrieved. The mode is withheld at the
   * schema, not just rejected afterwards, so the model is never offered it.
   */
  test("offers no transit mode, because no transit data was retrieved", () => {
    const schema = optimizerSchema(["2026-09-12"]);
    const leg =
      schema.schema.properties.days.items.properties.legs.items.properties;
    expect(leg.mode.enum).toEqual(["walk", "rideshare", "car"]);
  });

  /**
   * OpenAI's strict structured outputs reject several JSON Schema keywords,
   * `minItems` among them, and a schema carrying one fails every turn. Counts
   * and cardinality are stated in the instructions instead.
   */
  test("uses no schema keyword strict structured outputs would reject", () => {
    const banned = ["minItems", "maxItems", "minimum", "maximum", "pattern", "format"];
    const json = JSON.stringify(optimizerSchema(["2026-09-12"]));
    for (const keyword of banned) {
      expect(json).not.toContain(`"${keyword}"`);
    }
  });
});

describe("well-formed output", () => {
  test("reshapes days, items and legs", () => {
    const { days, summary } = toPlanDays(payload());
    expect(summary).toBe("Two days in Testville.");
    expect(days).toHaveLength(1);
    expect(days[0]!.items).toHaveLength(2);
    expect(days[0]!.legs[0]!.mode).toBe("walk");
  });

  test("keeps the meal kind only on meal items", () => {
    const { days } = toPlanDays(payload());
    expect(days[0]!.items[0]!.meal).toBeUndefined();
    expect(days[0]!.items[1]!.meal).toBe("lunch");
  });

  test("marks legs as estimated, since no routing provider supplied them", () => {
    const { days } = toPlanDays(payload());
    expect(days[0]!.legs[0]!.estimated).toBe(true);
  });

  test("carries exclusions across with their reasons", () => {
    const { excluded } = toPlanDays(payload());
    expect(excluded).toEqual([{ attractionId: "a9", reason: "Closed all trip." }]);
  });
});

describe("malformed output", () => {
  test("returns nothing usable when the payload is not an object", () => {
    expect(toPlanDays("nope").days).toEqual([]);
  });

  test("drops a day with no date", () => {
    const bad = payload({ days: [{ isCarDay: false, items: [], legs: [] }] });
    expect(toPlanDays(bad).days).toEqual([]);
  });

  test("drops an item missing its times rather than inventing them", () => {
    const bad = payload({
      days: [{ date: "2026-09-12", isCarDay: false, summary: "", legs: [],
        items: [{ kind: "attraction", refId: "a1", startTime: "09:00" }] }],
    });
    expect(toPlanDays(bad).days[0]!.items).toEqual([]);
  });

  test("drops a leg whose mode is not a real transport mode", () => {
    const bad = payload({
      days: [{ date: "2026-09-12", isCarDay: false, summary: "", items: [],
        legs: [{ fromIndex: 0, toIndex: 1, mode: "teleport", durationMinutes: 5, distanceMeters: 10 }] }],
    });
    expect(toPlanDays(bad).days[0]!.legs).toEqual([]);
  });

  test("never emits a negative duration or distance", () => {
    const bad = payload({
      days: [{ date: "2026-09-12", isCarDay: false, summary: "", items: [],
        legs: [{ fromIndex: 0, toIndex: 1, mode: "walk", durationMinutes: -30, distanceMeters: -5 }] }],
    });
    const leg = toPlanDays(bad).days[0]!.legs[0]!;
    expect(leg.durationMinutes).toBe(0);
    expect(leg.distanceMeters).toBe(0);
  });

  test("gives an exclusion with no reason a placeholder rather than blank", () => {
    const bad = payload({ excluded: [{ attractionId: "a9" }] });
    expect(toPlanDays(bad).excluded[0]!.reason).toMatch(/\w/);
  });

  test("drops an exclusion that names nothing", () => {
    expect(toPlanDays(payload({ excluded: [{ reason: "why" }] })).excluded).toEqual([]);
  });
});

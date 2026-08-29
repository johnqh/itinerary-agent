import { describe, expect, test } from "vitest";
import { excludeReason, interestWeight, scoreAttraction } from "@/planner/scoring";
import type { Attraction, Hours } from "@/types/workspace";

const DATES = ["2026-09-01", "2026-09-02"];
const OPEN: Hours = { status: "open", open: "09:00", close: "18:00" };

function attraction(overrides: Partial<Attraction> = {}): Attraction {
  return {
    id: "a1",
    name: "Example",
    category: "museum",
    location: { lat: 35.7, lng: 139.7 },
    description: "",
    hoursByDate: { "2026-09-01": OPEN, "2026-09-02": OPEN },
    estimatedVisitMinutes: 90,
    ticketRequired: false,
    photoUrls: [],
    sources: [],
    confidence: 0.8,
    ...overrides,
  };
}

const context = {
  date: "2026-09-01",
  travelMinutes: 10,
  sameCategoryCount: 0,
};

describe("interest weight", () => {
  test("a must-see outranks strong interest", () => {
    expect(interestWeight(4)).toBeGreaterThan(interestWeight(3));
  });

  test("an unrated attraction sits between maybe and interested", () => {
    expect(interestWeight(undefined)).toBeGreaterThan(interestWeight(1));
    expect(interestWeight(undefined)).toBeLessThan(interestWeight(2));
  });
});

describe("exclusion", () => {
  test("excludes an attraction rated not interested", () => {
    expect(excludeReason(attraction(), 0, DATES)).toMatch(/not interested/i);
  });

  test("excludes an attraction closed on every trip date", () => {
    const closed = attraction({
      hoursByDate: { "2026-09-01": { status: "closed" }, "2026-09-02": { status: "closed" } },
    });
    expect(excludeReason(closed, 3, DATES)).toMatch(/closed/i);
  });

  test("keeps an attraction open on at least one trip date", () => {
    const partly = attraction({
      hoursByDate: { "2026-09-01": { status: "closed" }, "2026-09-02": OPEN },
    });
    expect(excludeReason(partly, 3, DATES)).toBeNull();
  });

  test("keeps an attraction whose hours are simply unknown", () => {
    const unknown = attraction({ hoursByDate: {} });
    expect(excludeReason(unknown, 2, DATES)).toBeNull();
  });
});

describe("scoring", () => {
  test("a higher rating scores higher", () => {
    const low = scoreAttraction(attraction(), 1, context);
    const high = scoreAttraction(attraction(), 4, context);
    expect(high).toBeGreaterThan(low);
  });

  test("unknown hours score lower than confirmed open hours", () => {
    const known = scoreAttraction(attraction(), 3, context);
    const unknown = scoreAttraction(attraction({ hoursByDate: {} }), 3, context);
    expect(unknown).toBeLessThan(known);
  });

  test("a longer travel leg lowers the score", () => {
    const near = scoreAttraction(attraction(), 3, { ...context, travelMinutes: 5 });
    const far = scoreAttraction(attraction(), 3, { ...context, travelMinutes: 55 });
    expect(far).toBeLessThan(near);
  });

  test("repeating a category within a day lowers the score", () => {
    const first = scoreAttraction(attraction(), 3, context);
    const fourth = scoreAttraction(attraction(), 3, { ...context, sameCategoryCount: 3 });
    expect(fourth).toBeLessThan(first);
  });

  test("weaker source confidence scores lower", () => {
    const strong = scoreAttraction(attraction({ confidence: 0.9 }), 3, context);
    const weak = scoreAttraction(attraction({ confidence: 0.2 }), 3, context);
    expect(weak).toBeLessThan(strong);
  });

  test("needing a ticket lowers the score slightly", () => {
    const free = scoreAttraction(attraction(), 3, context);
    const ticketed = scoreAttraction(attraction({ ticketRequired: true }), 3, context);
    expect(ticketed).toBeLessThan(free);
  });

  test("a must-see still outscores a neutral attraction that is closer", () => {
    const mustSee = scoreAttraction(attraction(), 4, { ...context, travelMinutes: 30 });
    const neutral = scoreAttraction(attraction(), 2, { ...context, travelMinutes: 5 });
    expect(mustSee).toBeGreaterThan(neutral);
  });
});

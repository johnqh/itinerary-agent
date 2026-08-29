import { describe, expect, test } from "vitest";
import { discoveryFallbackNotice, discoverySteps, hasSeedData, liveDiscoveryNotice, mealNotice, seedDiscoveryNotice } from "@/agent/notices";
import { SEED_DESTINATION } from "@/data/seed-tokyo";
import type { Plan, TripRequest } from "@/types/workspace";

function planWith(unplaced: Plan["diagnostics"]["unplacedMeals"]): Plan {
  return {
    id: "plan-test",
    version: 1,
    days: [],
    excludedAttractionIds: [],
    summary: "",
    diagnostics: {
      considered: 0,
      included: 0,
      excluded: [],
      unplacedMeals: unplaced,
      routeCalls: 0,
      cacheHits: 0,
      transitAccepted: 0,
      transitRejected: 0,
      attractionMinutes: 0,
      transportMinutes: 0,
      score: 0,
    },
  };
}

const flexible: TripRequest["meals"] = { cuisines: [], strictness: "flexible" };

describe("hasSeedData", () => {
  test("recognises the seed city", () => {
    expect(hasSeedData(SEED_DESTINATION)).toBe(true);
    expect(hasSeedData("  tokyo  ")).toBe(true);
  });

  test("does not claim data for anywhere else", () => {
    expect(hasSeedData("Lisbon, Portugal")).toBe(false);
    expect(hasSeedData("")).toBe(false);
  });
});

describe("seedDiscoveryNotice", () => {
  test("names seed mode for the seed city", () => {
    const notice = seedDiscoveryNotice(SEED_DESTINATION);
    expect(notice).toContain(SEED_DESTINATION);
    expect(notice).toMatch(/seed/i);
  });

  test("says plainly that another city has no data", () => {
    const notice = seedDiscoveryNotice("Lisbon, Portugal");
    expect(notice).toContain("Lisbon, Portugal");
    expect(notice).toContain(SEED_DESTINATION);
    expect(notice).toMatch(/not|only/i);
  });
});

describe("discoverySteps", () => {
  test("declares one step per unit of work it will actually do", () => {
    const steps = discoverySteps(["2026-09-01", "2026-09-02"]);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps).toEqual([...new Set(steps)]);
    expect(steps.filter((s) => s.includes("2026-09-01"))).toHaveLength(1);
    expect(steps.filter((s) => s.includes("2026-09-02"))).toHaveLength(1);
  });

  test("grows with the trip so the counter can reach its own total", () => {
    expect(discoverySteps(["2026-09-01"]).length).toBeLessThan(
      discoverySteps(["2026-09-01", "2026-09-02"]).length,
    );
  });

  test("still has work to report for a trip with no resolved dates", () => {
    expect(discoverySteps([]).length).toBeGreaterThan(0);
  });
});

describe("mealNotice", () => {
  test("is silent when every meal was seated and nothing was asked for", () => {
    expect(mealNotice(planWith([]), flexible)).toBeNull();
  });

  test("names the meals that could not be seated", () => {
    const notice = mealNotice(
      planWith([
        { date: "2026-09-01", meal: "lunch", reason: "No vegan restaurant is open." },
        { date: "2026-09-01", meal: "dinner", reason: "No vegan restaurant is open." },
      ]),
      { cuisines: ["vegan"], strictness: "strong" },
    );
    expect(notice).toMatch(/2 meals/i);
    expect(notice).toContain("No vegan restaurant is open.");
  });

  test("says dietary notes are recorded but not yet enforced", () => {
    const notice = mealNotice(planWith([]), {
      cuisines: [],
      strictness: "flexible",
      notes: "no shellfish",
    });
    expect(notice).toContain("no shellfish");
    expect(notice).toMatch(/not|yet/i);
  });

  test("handles a workspace with no plan at all", () => {
    expect(mealNotice(null, flexible)).toBeNull();
    expect(mealNotice(null, { cuisines: [], strictness: "flexible", notes: "vegan" })).toContain(
      "vegan",
    );
  });
});

describe("liveDiscoveryNotice", () => {
  test("is silent when live research produced a healthy candidate set", () => {
    expect(liveDiscoveryNotice({ attractionCount: 14, restaurantCount: 7, rejected: [] })).toBeNull();
  });

  test("warns when too few attractions came back to plan a trip", () => {
    const notice = liveDiscoveryNotice({ attractionCount: 3, restaurantCount: 6, rejected: [] });
    expect(notice).toMatch(/3 attractions/i);
  });

  test("warns when there are too few restaurants to seat meals", () => {
    const notice = liveDiscoveryNotice({ attractionCount: 14, restaurantCount: 1, rejected: [] });
    expect(notice).toMatch(/restaurant/i);
  });

  test("reports records that were discarded as unusable", () => {
    const notice = liveDiscoveryNotice({
      attractionCount: 14,
      restaurantCount: 7,
      rejected: [{ name: "Somewhere", reason: "No usable coordinates were returned." }],
    });
    expect(notice).toMatch(/1 result/i);
  });
});

describe("discoveryFallbackNotice", () => {
  test("says why live research was not used and what is on screen instead", () => {
    const notice = discoveryFallbackNotice(
      "The agent harness is not reachable.",
      "Lisbon, Portugal",
    );
    expect(notice).toMatch(/not reachable/i);
    expect(notice).toMatch(/Tokyo/i);
  });
});

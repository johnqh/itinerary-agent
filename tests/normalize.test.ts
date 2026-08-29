import { describe, expect, test } from "vitest";
import { normalizeDiscovery } from "@/agent/normalize";

const DATES = ["2026-09-07", "2026-09-08"];

function raw(overrides: Record<string, unknown> = {}) {
  return {
    name: "Sensō-ji",
    category: "temple",
    lat: 35.7148,
    lng: 139.7967,
    description: "Tokyo's oldest temple.",
    hoursByDate: {
      "2026-09-07": { status: "open", open: "06:00", close: "17:00" },
      "2026-09-08": { status: "open", open: "06:00", close: "17:00" },
    },
    estimatedVisitMinutes: 75,
    ticketRequired: false,
    sources: [{ url: "https://www.senso-ji.jp/", title: "Official site" }],
    confidence: 0.8,
    ...overrides,
  };
}

function run(attractions: unknown[], restaurants: unknown[] = []) {
  return normalizeDiscovery({ attractions, restaurants }, DATES);
}

describe("well-formed input", () => {
  test("accepts a complete record", () => {
    const result = run([raw()]);
    expect(result.attractions).toHaveLength(1);
    expect(result.attractions[0]!.name).toBe("Sensō-ji");
    expect(result.attractions[0]!.location).toEqual({ lat: 35.7148, lng: 139.7967 });
    expect(result.rejected).toHaveLength(0);
  });

  test("gives every record a stable id derived from its name", () => {
    const a = run([raw()]).attractions[0]!;
    const b = run([raw()]).attractions[0]!;
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("rejecting unusable records", () => {
  test("rejects a record with no name and says why", () => {
    const result = run([raw({ name: "  " })]);
    expect(result.attractions).toHaveLength(0);
    expect(result.rejected[0]!.reason).toMatch(/name/i);
  });

  test("rejects a record with missing coordinates", () => {
    const result = run([raw({ lat: undefined, lng: undefined })]);
    expect(result.attractions).toHaveLength(0);
    expect(result.rejected[0]!.reason).toMatch(/coordinate/i);
  });

  test("rejects coordinates outside the valid range", () => {
    const result = run([raw({ lat: 91, lng: 200 })]);
    expect(result.attractions).toHaveLength(0);
    expect(result.rejected[0]!.reason).toMatch(/coordinate/i);
  });

  test("rejects a record whose coordinates arrived as strings", () => {
    const result = run([raw({ lat: "35.7", lng: "139.7" })]);
    expect(result.attractions).toHaveLength(0);
  });

  test("survives input that is not a list at all", () => {
    const result = normalizeDiscovery("not json", DATES);
    expect(result.attractions).toHaveLength(0);
    expect(result.restaurants).toHaveLength(0);
  });

  test("skips a non-object entry without discarding its siblings", () => {
    const result = run([null, raw()]);
    expect(result.attractions).toHaveLength(1);
  });
});

describe("repairing salvageable records", () => {
  test("clamps confidence into the zero-to-one range", () => {
    expect(run([raw({ confidence: 7 })]).attractions[0]!.confidence).toBe(1);
    expect(run([raw({ confidence: -2 })]).attractions[0]!.confidence).toBe(0);
  });

  test("treats a missing confidence as low rather than certain", () => {
    const value = run([raw({ confidence: undefined })]).attractions[0]!.confidence;
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(0.6);
  });

  test("marks hours unknown for any trip date the agent did not resolve", () => {
    const result = run([raw({ hoursByDate: { "2026-09-07": { status: "open", open: "09:00", close: "17:00" } } })]);
    expect(result.attractions[0]!.hoursByDate["2026-09-08"]).toEqual({ status: "unknown" });
  });

  test("does not invent hours when the agent returned none", () => {
    const result = run([raw({ hoursByDate: undefined })]);
    for (const date of DATES) {
      expect(result.attractions[0]!.hoursByDate[date]).toEqual({ status: "unknown" });
    }
  });

  test("rejects a malformed hours entry as unknown rather than open", () => {
    const result = run([raw({ hoursByDate: { "2026-09-07": { status: "open", open: "nonsense" } } })]);
    expect(result.attractions[0]!.hoursByDate["2026-09-07"]).toEqual({ status: "unknown" });
  });

  test("bounds an implausible visit duration", () => {
    expect(run([raw({ estimatedVisitMinutes: 100000 })]).attractions[0]!.estimatedVisitMinutes)
      .toBeLessThanOrEqual(480);
    expect(run([raw({ estimatedVisitMinutes: 0 })]).attractions[0]!.estimatedVisitMinutes)
      .toBeGreaterThanOrEqual(15);
  });

  test("drops malformed source urls but keeps the valid ones", () => {
    const result = run([
      raw({ sources: [{ url: "not a url" }, { url: "https://example.com/a" }] }),
    ]);
    expect(result.attractions[0]!.sources).toEqual([{ url: "https://example.com/a", title: undefined }]);
  });

  test("keeps only http and https photo urls", () => {
    const result = run([
      raw({ photoUrls: ["javascript:alert(1)", "https://example.com/p.jpg"] }),
    ]);
    expect(result.attractions[0]!.photoUrls).toEqual(["https://example.com/p.jpg"]);
  });
});

describe("deduplication", () => {
  test("collapses duplicates of the same place, keeping the better-sourced one", () => {
    const result = run([
      raw({ name: "Sensō-ji", confidence: 0.4 }),
      raw({ name: "  senso-ji  ", confidence: 0.9 }),
    ]);
    expect(result.attractions).toHaveLength(1);
    expect(result.attractions[0]!.confidence).toBe(0.9);
  });
});

describe("restaurants", () => {
  test("normalizes restaurants with their cuisine list", () => {
    const result = run([], [
      {
        name: "Ueno ramen shop",
        cuisine: ["japanese", 7, "quick bite"],
        lat: 35.7115,
        lng: 139.777,
        confidence: 0.6,
      },
    ]);
    expect(result.restaurants).toHaveLength(1);
    expect(result.restaurants[0]!.cuisine).toEqual(["japanese", "quick bite"]);
  });

  test("rejects a restaurant without coordinates", () => {
    const result = run([], [{ name: "Nowhere", cuisine: ["japanese"] }]);
    expect(result.restaurants).toHaveLength(0);
  });
});

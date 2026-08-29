import { describe, expect, test } from "vitest";
import { parseRouteResponse, transferCountOf } from "@/routing/googleRoutes";

/**
 * Google's response is where real transit facts come from: line names and
 * transfer counts. The no-transfer rule depends on counting transfers
 * correctly, so an undercount would quietly admit exactly the itineraries the
 * rule exists to keep out.
 */

function response(overrides: Record<string, unknown> = {}) {
  return {
    routes: [
      {
        distanceMeters: 3200,
        duration: "900s",
        polyline: { encodedPolyline: "abc123" },
        legs: [{ steps: [{ transitDetails: { transitLine: { nameShort: "N", name: "N Judah" } } }] }],
        ...overrides,
      },
    ],
  };
}

describe("parsing", () => {
  test("reads duration, distance and geometry", () => {
    const leg = parseRouteResponse(response(), "transit");
    expect(leg?.durationMinutes).toBe(15);
    expect(leg?.distanceMeters).toBe(3200);
    expect(leg?.polyline).toBe("abc123");
  });

  test("rounds a duration that is not a whole minute", () => {
    expect(parseRouteResponse(response({ duration: "911s" }), "transit")?.durationMinutes).toBe(15);
    expect(parseRouteResponse(response({ duration: "60s" }), "walk")?.durationMinutes).toBe(1);
  });

  test("returns null when no route was found", () => {
    expect(parseRouteResponse({ routes: [] }, "transit")).toBeNull();
    expect(parseRouteResponse({}, "transit")).toBeNull();
  });

  test("returns null for a malformed payload rather than throwing", () => {
    expect(parseRouteResponse("nonsense", "walk")).toBeNull();
    expect(parseRouteResponse({ routes: [{ duration: "bad" }] }, "walk")).toBeNull();
  });

  test("survives a route with no geometry", () => {
    const leg = parseRouteResponse(response({ polyline: undefined }), "walk");
    expect(leg?.polyline).toBeUndefined();
    expect(leg?.durationMinutes).toBe(15);
  });
});

describe("transit lines", () => {
  test("prefers the short line name a rider would recognise", () => {
    const leg = parseRouteResponse(response(), "transit");
    expect(leg?.transitLines).toEqual(["N"]);
  });

  test("falls back to the full name when there is no short one", () => {
    const legs = [{ steps: [{ transitDetails: { transitLine: { name: "Ginza Line" } } }] }];
    const leg = parseRouteResponse(response({ legs }), "transit");
    expect(leg?.transitLines).toEqual(["Ginza Line"]);
  });

  test("lists every line used, in order", () => {
    const legs = [
      {
        steps: [
          { transitDetails: { transitLine: { nameShort: "N" } } },
          { navigationInstruction: { instructions: "Walk" } },
          { transitDetails: { transitLine: { nameShort: "38" } } },
        ],
      },
    ];
    const leg = parseRouteResponse(response({ legs }), "transit");
    expect(leg?.transitLines).toEqual(["N", "38"]);
  });
});

describe("transfer counting", () => {
  test("a single transit ride is zero transfers", () => {
    expect(transferCountOf(1)).toBe(0);
  });

  test("two rides is one transfer", () => {
    expect(transferCountOf(2)).toBe(1);
  });

  test("a route with no transit ride is not a negative transfer", () => {
    expect(transferCountOf(0)).toBe(0);
  });

  test("counts transfers on a parsed transit route", () => {
    const legs = [
      {
        steps: [
          { transitDetails: { transitLine: { nameShort: "N" } } },
          { transitDetails: { transitLine: { nameShort: "38" } } },
        ],
      },
    ];
    expect(parseRouteResponse(response({ legs }), "transit")?.transferCount).toBe(1);
  });

  test("counts steps across multiple legs of one route", () => {
    const legs = [
      { steps: [{ transitDetails: { transitLine: { nameShort: "N" } } }] },
      { steps: [{ transitDetails: { transitLine: { nameShort: "J" } } }] },
    ];
    expect(parseRouteResponse(response({ legs }), "transit")?.transferCount).toBe(1);
  });

  test("a walking route reports no transfers and no lines", () => {
    const leg = parseRouteResponse(response({ legs: [{ steps: [{}] }] }), "walk");
    expect(leg?.transferCount).toBe(0);
    expect(leg?.transitLines).toEqual([]);
  });
});

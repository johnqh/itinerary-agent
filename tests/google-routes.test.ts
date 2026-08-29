import { describe, expect, test, vi } from "vitest";
import {
  cacheKey,
  parseRouteResponse,
  resolveRoute,
  transferCountOf,
} from "@/routing/googleRoutes";
import type { LatLng } from "@/types/workspace";

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

/**
 * Google evaluates a transit request at the time it is made unless it is told
 * otherwise, so a trip planned for next spring came back described by the
 * trains running this afternoon. The itinerary's own departure has to travel
 * with the request, or the line names on screen are about a day nobody is
 * travelling on.
 */
describe("asking about the right moment", () => {
  const from: LatLng = { lat: 35.71, lng: 139.796 };
  const to: LatLng = { lat: 35.6595, lng: 139.7005 };

  async function bodyOf(request: Parameters<typeof resolveRoute>[0]) {
    let sent: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      sent = init;
      return new Response(JSON.stringify({ routes: [{ duration: "600s", distanceMeters: 100 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await resolveRoute(request);
      return JSON.parse(String(sent?.body)) as Record<string, unknown>;
    } finally {
      vi.unstubAllGlobals();
    }
  }

  test("sends the itinerary's departure on a transit request", async () => {
    const body = await bodyOf({
      from,
      to,
      mode: "transit",
      departureTime: "2027-04-02T00:30:00Z",
    });
    expect(body.departureTime).toBe("2027-04-02T00:30:00Z");
  });

  test("leaves a driving or walking request alone", async () => {
    // Sending a departure on a DRIVE request opts into traffic-aware routing,
    // which is billed at the higher tier for an answer a trip planned weeks
    // ahead cannot use.
    for (const mode of ["walk", "rideshare", "car"] as const) {
      const body = await bodyOf({ from, to, mode, departureTime: "2027-04-02T00:30:00Z" });
      expect(body.departureTime, mode).toBeUndefined();
    }
  });

  test("omits the departure when the itinerary could not supply one", async () => {
    const body = await bodyOf({ from, to, mode: "transit" });
    expect(body.departureTime).toBeUndefined();
  });

  test("two departures on one leg are not the same cached answer", () => {
    const morning = cacheKey({ from, to, mode: "transit", departureTime: "2027-04-02T00:30:00Z" });
    const evening = cacheKey({ from, to, mode: "transit", departureTime: "2027-04-02T11:30:00Z" });
    expect(morning).not.toBe(evening);
  });
});

import { describe, expect, test, vi } from "vitest";
import { resolveLeg } from "@/routing/refine";
import { RoutingUnavailable, type ResolvedRoute } from "@/routing/googleRoutes";
import type { RouteRequest } from "@/routing/googleRoutes";
import type { TransportMode } from "@/types/workspace";

/**
 * Mode selection against real data. The rules are the same ones the estimator
 * uses, but now the numbers are measured rather than modelled, so the
 * no-transfer rule finally has real transfer counts to reject.
 */

const FROM = { lat: 37.7749, lng: -122.4194 };
const TO = { lat: 37.7899, lng: -122.4014 };
const CTX = { isCarDay: false, pace: "balanced" as const };

function route(over: Partial<ResolvedRoute> = {}): ResolvedRoute {
  return {
    durationMinutes: 10,
    distanceMeters: 2000,
    transitLines: [],
    transferCount: 0,
    ...over,
  };
}

/** A resolver that answers per mode, and records what was asked for. */
function resolver(byMode: Partial<Record<TransportMode, ResolvedRoute | Error>>) {
  return vi.fn(async ({ mode }: RouteRequest) => {
    const answer = byMode[mode];
    if (answer instanceof Error) throw answer;
    if (!answer) throw new RoutingUnavailable(`no ${mode}`);
    return answer;
  });
}

describe("the moment the leg is asked about", () => {
  test("asks transit about the itinerary's departure", async () => {
    const resolve = resolver({
      walk: route({ durationMinutes: 40 }),
      transit: route({ durationMinutes: 14 }),
      rideshare: route({ durationMinutes: 11 }),
    });
    await resolveLeg(FROM, TO, { ...CTX, departureTime: "2027-04-02T00:30:00Z" }, resolve);

    const transit = resolve.mock.calls.map(([r]) => r).find((r) => r.mode === "transit");
    expect(transit?.departureTime).toBe("2027-04-02T00:30:00Z");
  });

  test("leaves walking and driving requests undated so they stay cacheable", async () => {
    const resolve = resolver({
      walk: route({ durationMinutes: 40 }),
      transit: route({ durationMinutes: 14 }),
      rideshare: route({ durationMinutes: 11 }),
    });
    await resolveLeg(FROM, TO, { ...CTX, departureTime: "2027-04-02T00:30:00Z" }, resolve);

    const others = resolve.mock.calls.map(([r]) => r).filter((r) => r.mode !== "transit");
    expect(others.length).toBeGreaterThan(0);
    for (const request of others) expect(request.departureTime).toBeUndefined();
  });
});

describe("walking", () => {
  test("takes a short walk without asking about anything else", async () => {
    const resolve = resolver({ walk: route({ durationMinutes: 8 }) });
    const leg = await resolveLeg(FROM, TO, CTX, resolve);
    expect(leg.mode).toBe("walk");
    expect(leg.durationMinutes).toBe(8);
    expect(leg.estimated).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  test("does not walk a leg beyond the pace threshold", async () => {
    const resolve = resolver({
      walk: route({ durationMinutes: 40 }),
      transit: route({ durationMinutes: 12, transitLines: ["N"] }),
      rideshare: route({ durationMinutes: 10 }),
    });
    const leg = await resolveLeg(FROM, TO, CTX, resolve);
    expect(leg.mode).not.toBe("walk");
  });
});

describe("car days", () => {
  test("drives every non-walking leg and never asks for transit", async () => {
    const resolve = resolver({
      walk: route({ durationMinutes: 40 }),
      car: route({ durationMinutes: 12 }),
    });
    const leg = await resolveLeg(FROM, TO, { ...CTX, isCarDay: true }, resolve);
    expect(leg.mode).toBe("car");
    const modesAsked = resolve.mock.calls.map((c) => c[0].mode);
    expect(modesAsked).not.toContain("transit");
  });
});

describe("transit acceptance", () => {
  test("accepts a direct ride and reports the line", async () => {
    const resolve = resolver({
      walk: route({ durationMinutes: 40 }),
      transit: route({ durationMinutes: 14, transitLines: ["N"], transferCount: 0 }),
      rideshare: route({ durationMinutes: 10 }),
    });
    const leg = await resolveLeg(FROM, TO, CTX, resolve);
    expect(leg.mode).toBe("transit");
    expect(leg.transitLines).toEqual(["N"]);
    expect(leg.transferCount).toBe(0);
    expect(leg.estimated).toBe(false);
  });

  test("accepts a ride with a single change", async () => {
    const resolve = resolver({
      walk: route({ durationMinutes: 40 }),
      transit: route({ durationMinutes: 14, transitLines: ["N", "38"], transferCount: 1 }),
      rideshare: route({ durationMinutes: 10 }),
    });
    const leg = await resolveLeg(FROM, TO, CTX, resolve);
    expect(leg.mode).toBe("transit");
    expect(leg.transferCount).toBe(1);
    expect(leg.transitLines).toEqual(["N", "38"]);
  });

  test("rejects a ride that needs a transfer, and says so", async () => {
    const resolve = resolver({
      walk: route({ durationMinutes: 40 }),
      transit: route({ durationMinutes: 14, transitLines: ["N", "38", "J"], transferCount: 2 }),
      rideshare: route({ durationMinutes: 10 }),
    });
    const leg = await resolveLeg(FROM, TO, CTX, resolve);
    expect(leg.mode).toBe("rideshare");
    expect(leg.fallbackReason).toMatch(/change|transfer/i);
  });

  test("rejects transit that takes far longer than the drive", async () => {
    const resolve = resolver({
      walk: route({ durationMinutes: 40 }),
      transit: route({ durationMinutes: 45, transitLines: ["N"] }),
      rideshare: route({ durationMinutes: 10 }),
    });
    const leg = await resolveLeg(FROM, TO, CTX, resolve);
    expect(leg.mode).toBe("rideshare");
    expect(leg.fallbackReason).toMatch(/times|longer|slower/i);
  });

  test("falls back to a ride when the provider has no transit for this leg", async () => {
    const resolve = resolver({
      walk: route({ durationMinutes: 40 }),
      rideshare: route({ durationMinutes: 10 }),
    });
    const leg = await resolveLeg(FROM, TO, CTX, resolve);
    expect(leg.mode).toBe("rideshare");
    expect(leg.fallbackReason).toMatch(/transit/i);
  });
});

describe("when routing cannot answer at all", () => {
  test("keeps an estimate and marks it as one rather than inventing a number", async () => {
    const resolve = vi.fn(async () => {
      throw new RoutingUnavailable("The Google Maps key was rejected.");
    });
    const leg = await resolveLeg(FROM, TO, CTX, resolve);
    expect(leg.estimated).toBe(true);
    expect(leg.durationMinutes).toBeGreaterThan(0);
    expect(leg.fallbackReason).toMatch(/rejected|estimate/i);
  });

  test("never claims a transit line it could not retrieve", async () => {
    const resolve = vi.fn(async () => {
      throw new RoutingUnavailable("down");
    });
    const leg = await resolveLeg(FROM, TO, CTX, resolve);
    expect(leg.transitLines ?? []).toEqual([]);
    expect(leg.mode).not.toBe("transit");
  });
});

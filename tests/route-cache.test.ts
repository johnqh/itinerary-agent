import { describe, expect, test, vi } from "vitest";
import { createPersistentRouteCache, type CacheStorage } from "@/routing/routeCache";
import type { ResolvedRoute } from "@/routing/googleRoutes";

/**
 * Every cache hit is a routing call not billed. Travel between two fixed points
 * does not change between two clicks of "Plan again", so re-resolving it is
 * pure cost.
 */

function memory(seed: Record<string, string> = {}): CacheStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const route: ResolvedRoute = {
  durationMinutes: 12,
  distanceMeters: 2400,
  transitLines: ["N"],
  transferCount: 0,
};

const REQUEST = {
  from: { lat: 37.7694, lng: -122.4862 },
  to: { lat: 37.8024, lng: -122.4058 },
  mode: "transit" as const,
};

const NOW = new Date("2026-09-01T12:00:00Z");

describe("within one session", () => {
  test("asks the provider once for the same leg", async () => {
    const inner = vi.fn(async () => route);
    const resolve = createPersistentRouteCache(inner, memory(), () => NOW);
    await resolve(REQUEST);
    await resolve(REQUEST);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("still asks for a different leg", async () => {
    const inner = vi.fn(async () => route);
    const resolve = createPersistentRouteCache(inner, memory(), () => NOW);
    await resolve(REQUEST);
    await resolve({ ...REQUEST, mode: "walk" });
    expect(inner).toHaveBeenCalledTimes(2);
  });

  test("does not cache a failure, so the next attempt can succeed", async () => {
    let calls = 0;
    const inner = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("network");
      return route;
    });
    const resolve = createPersistentRouteCache(inner, memory(), () => NOW);
    await expect(resolve(REQUEST)).rejects.toThrow();
    await expect(resolve(REQUEST)).resolves.toEqual(route);
    expect(inner).toHaveBeenCalledTimes(2);
  });
});

describe("across reloads", () => {
  test("reuses a leg resolved in an earlier session", async () => {
    const storage = memory();
    const first = vi.fn(async () => route);
    await createPersistentRouteCache(first, storage, () => NOW)(REQUEST);

    const second = vi.fn(async () => route);
    const again = await createPersistentRouteCache(second, storage, () => NOW)(REQUEST);

    expect(second).not.toHaveBeenCalled();
    expect(again).toEqual(route);
  });

  test("re-resolves a leg cached long enough ago to be stale", async () => {
    const storage = memory();
    await createPersistentRouteCache(async () => route, storage, () => NOW)(REQUEST);

    const later = new Date("2026-10-15T12:00:00Z");
    const inner = vi.fn(async () => route);
    await createPersistentRouteCache(inner, storage, () => later)(REQUEST);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("ignores a corrupt cache rather than throwing", async () => {
    const storage = memory({ "itinerary-agent.routes": "{not json" });
    const inner = vi.fn(async () => route);
    await expect(
      createPersistentRouteCache(inner, storage, () => NOW)(REQUEST),
    ).resolves.toEqual(route);
  });

  test("works when storage refuses to answer at all", async () => {
    const hostile: CacheStorage = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    };
    const inner = vi.fn(async () => route);
    await expect(
      createPersistentRouteCache(inner, hostile, () => NOW)(REQUEST),
    ).resolves.toEqual(route);
  });
});

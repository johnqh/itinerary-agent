import { describe, expect, test, vi } from "vitest";
import {
  createPersistentRouteCache,
  ROUTE_CACHE_KEY,
  type CacheStorage,
} from "@/routing/routeCache";
import { cacheKey, type ResolvedRoute } from "@/routing/googleRoutes";

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

/**
 * A leg of a real itinerary: a covered city knows its own zone, so the
 * departure the traveller will actually make is part of the question asked.
 */
const REQUEST = {
  from: { lat: 37.7694, lng: -122.4862 },
  to: { lat: 37.8024, lng: -122.4058 },
  mode: "transit" as const,
  departureTime: "2026-09-14T17:00:00Z",
};

/** The same journey with no departure, which the provider answers for now. */
const UNDATED = { ...REQUEST, departureTime: undefined };

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

/**
 * A transit answer with no departure describes the timetable at the moment it
 * was asked. Kept for a fortnight it would tell a traveller about lines,
 * changes and durations that are not running on their trip — which is the
 * defect dating the request was added to cure, arriving by another route.
 */
describe("an answer about now", () => {
  test("keeps an undated transit answer for this session only", async () => {
    const storage = memory();
    const inner = vi.fn(async () => route);
    const resolve = createPersistentRouteCache(inner, storage, () => NOW);

    await resolve(UNDATED);
    await resolve(UNDATED);

    expect(inner).toHaveBeenCalledTimes(1);
    expect(storage.getItem(ROUTE_CACHE_KEY)).toBeNull();
  });

  test("re-asks in a later session rather than replaying it", async () => {
    const storage = memory();
    await createPersistentRouteCache(async () => route, storage, () => NOW)(UNDATED);

    const inner = vi.fn(async () => route);
    await createPersistentRouteCache(inner, storage, () => NOW)(UNDATED);

    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("still stores a walk, whose duration does not depend on the clock", async () => {
    const storage = memory();
    const inner = vi.fn(async () => route);
    await createPersistentRouteCache(inner, storage, () => NOW)({ ...UNDATED, mode: "walk" });

    const second = vi.fn(async () => route);
    await createPersistentRouteCache(second, storage, () => NOW)({ ...UNDATED, mode: "walk" });

    expect(second).not.toHaveBeenCalled();
  });
});

/**
 * The cache is one string in a bucket with a hard size limit. Entries too old
 * to be used again still take room in it, and once the bucket is full every
 * later write is refused — so a file that only ever grows ends up caching
 * nothing at all.
 */
describe("keeping the file a usable size", () => {
  const STALE_KEY = "walk:1.0000,2.0000-to-3.0000,4.0000";

  test("drops entries too old to be used when it writes", async () => {
    const stale = JSON.stringify({ [STALE_KEY]: { savedAt: "2026-01-01T00:00:00Z", route } });
    const storage = memory({ [ROUTE_CACHE_KEY]: stale });

    await createPersistentRouteCache(async () => route, storage, () => NOW)(REQUEST);

    const file = JSON.parse(storage.getItem(ROUTE_CACHE_KEY)!) as Record<string, unknown>;
    expect(Object.keys(file)).not.toContain(STALE_KEY);
  });

  test("keeps the newest entries when storage says it is full", async () => {
    const older = new Date("2026-08-20T12:00:00Z").toISOString();
    const seeded: Record<string, unknown> = {};
    for (let i = 0; i < 8; i += 1) seeded[`walk:${i}`] = { savedAt: older, route };
    const map = new Map([[ROUTE_CACHE_KEY, JSON.stringify(seeded)]]);

    let refusals = 0;
    const full: CacheStorage = {
      getItem: (k) => map.get(k) ?? null,
      // The whole file no longer fits. A shorter one does.
      setItem: (k, v) => {
        if (refusals === 0) {
          refusals += 1;
          throw new Error("QuotaExceededError");
        }
        map.set(k, v);
      },
      removeItem: (k) => void map.delete(k),
    };

    await createPersistentRouteCache(async () => route, full, () => NOW)(REQUEST);

    const file = JSON.parse(map.get(ROUTE_CACHE_KEY)!) as Record<string, unknown>;
    expect(refusals, "the test never exercised a full store").toBe(1);
    expect(Object.keys(file).length).toBeLessThan(9);
    expect(Object.keys(file), "the route just resolved was thrown away").toContain(
      cacheKey(REQUEST),
    );
  });
});

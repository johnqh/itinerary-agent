import { cacheKey, type ResolvedRoute, type RouteRequest } from "@/routing/googleRoutes";
import type { RouteResolver } from "@/routing/refine";

/**
 * Remembers resolved legs so the same journey is never billed twice.
 *
 * Every hit here is a routing call not made. Replanning re-resolves the same
 * legs constantly — the traveller changes one rating and the other twelve
 * journeys are identical — and travel between two fixed points does not change
 * between two clicks. The cache outlives the page as well, because it will not
 * have changed by tomorrow either.
 *
 * Failures are deliberately not cached: a network blip or a rejected key must
 * not persist as a permanent absence of a route.
 */

export interface CacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ROUTE_CACHE_KEY = "itinerary-agent.routes";

/** Long enough to cover a planning session; short enough that a rerouted bus line eventually lands. */
const MAX_AGE_DAYS = 14;

interface CacheEntry {
  savedAt: string;
  route: ResolvedRoute;
}

type CacheFile = Record<string, CacheEntry>;

function read(storage: CacheStorage): CacheFile {
  try {
    const raw = storage.getItem(ROUTE_CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as CacheFile) : {};
  } catch {
    // A corrupt or unreadable cache is simply an empty one.
    return {};
  }
}

function write(storage: CacheStorage, file: CacheFile): void {
  try {
    storage.setItem(ROUTE_CACHE_KEY, JSON.stringify(file));
  } catch {
    // Storage can be full or blocked. Losing the cache costs money, not
    // correctness, so it must never break a plan.
  }
}

function fresh(entry: CacheEntry, now: Date): boolean {
  const savedAt = Date.parse(entry.savedAt);
  if (Number.isNaN(savedAt)) return false;
  const ageDays = (now.getTime() - savedAt) / 86_400_000;
  return ageDays >= 0 && ageDays <= MAX_AGE_DAYS;
}

export function createPersistentRouteCache(
  inner: RouteResolver,
  storage: CacheStorage,
  clock: () => Date = () => new Date(),
): RouteResolver {
  // In-flight requests are shared too, so two legs asking for the same journey
  // at once make one call rather than two.
  const pending = new Map<string, Promise<ResolvedRoute>>();

  return async (request: RouteRequest) => {
    const key = cacheKey(request);

    const stored = read(storage)[key];
    if (stored && fresh(stored, clock())) return stored.route;

    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const promise = inner(request);
    pending.set(key, promise);

    try {
      const route = await promise;
      const file = read(storage);
      file[key] = { savedAt: clock().toISOString(), route };
      write(storage, file);
      return route;
    } finally {
      pending.delete(key);
    }
  };
}

/** The browser's storage, or an in-memory stand-in where it is unavailable. */
export function browserCacheStorage(): CacheStorage {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // Falls through to the in-memory stand-in below.
  }
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

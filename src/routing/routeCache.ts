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
 * not persist as a permanent absence of a route. Neither is an answer about
 * now — see `persistable`.
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
    return;
  } catch {
    // Storage is full or blocked. Full is worth one more attempt: refusing
    // every write from here on would quietly turn persistence off for good,
    // and half a cache still saves half the calls.
  }

  const byAge = Object.entries(file).sort(
    ([, a], [, b]) => Date.parse(b.savedAt) - Date.parse(a.savedAt),
  );
  try {
    storage.setItem(
      ROUTE_CACHE_KEY,
      JSON.stringify(Object.fromEntries(byAge.slice(0, Math.ceil(byAge.length / 2)))),
    );
  } catch {
    // Blocked outright. Losing the cache costs money, not correctness, so it
    // must never break a plan.
  }
}

function fresh(entry: CacheEntry, now: Date): boolean {
  const savedAt = Date.parse(entry?.savedAt ?? "");
  if (Number.isNaN(savedAt)) return false;
  const ageDays = (now.getTime() - savedAt) / 86_400_000;
  return ageDays >= 0 && ageDays <= MAX_AGE_DAYS;
}

/**
 * The stored route, or null if it is not one.
 *
 * The file outlives the code that wrote it: a browser keeps it across a
 * deployment, so a record written by an older build is JSON that parses
 * cleanly and means nothing. Taken on trust it becomes a leg with no duration
 * and no distance, shown as a real measurement, and it would say so for a
 * fortnight. Anything that does not answer the question is treated as a miss
 * and asked again.
 */
function storedRoute(value: unknown): ResolvedRoute | null {
  if (typeof value !== "object" || value === null) return null;
  const route = value as Partial<ResolvedRoute>;
  if (typeof route.durationMinutes !== "number" || !Number.isFinite(route.durationMinutes)) {
    return null;
  }
  if (typeof route.distanceMeters !== "number" || !Number.isFinite(route.distanceMeters)) {
    return null;
  }
  if (typeof route.transferCount !== "number" || !Number.isFinite(route.transferCount)) {
    return null;
  }
  if (!Array.isArray(route.transitLines) || route.transitLines.some((l) => typeof l !== "string")) {
    return null;
  }
  if (route.polyline !== undefined && typeof route.polyline !== "string") return null;
  return route as ResolvedRoute;
}

/**
 * Entries that can no longer be returned — too old, or not a route — are
 * dropped whenever the file is rewritten. Left in place they would never be
 * read again but would still take room, and the file only has so much: once
 * the bucket is full every later write is refused, and a cache that grows for
 * ever ends up caching nothing.
 */
function prune(file: CacheFile, now: Date): CacheFile {
  const kept: CacheFile = {};
  for (const [key, entry] of Object.entries(file)) {
    if (fresh(entry, now) && storedRoute(entry.route)) kept[key] = entry;
  }
  return kept;
}

/**
 * Whether an answer may outlive the session that asked for it.
 *
 * A transit request with no departure is answered for the moment it arrives,
 * so the lines, the changes and the duration in it describe the timetable
 * running right now. Kept for a fortnight it would describe a service to a
 * traveller who will not be there for one — which is the defect that dating
 * the request was added to cure, arriving by another route. Those answers are
 * reused within the session that asked and no longer. A walk or a drive has no
 * timetable, so it keeps.
 */
function persistable(request: RouteRequest): boolean {
  return request.mode !== "transit" || Boolean(request.departureTime);
}

export function createPersistentRouteCache(
  inner: RouteResolver,
  storage: CacheStorage,
  clock: () => Date = () => new Date(),
): RouteResolver {
  // In-flight requests are shared too, so two legs asking for the same journey
  // at once make one call rather than two.
  const pending = new Map<string, Promise<ResolvedRoute>>();
  // Answers that must not outlive this session still cost money to ask twice
  // inside it, so they are held here instead of in storage.
  const session = new Map<string, ResolvedRoute>();

  return async (request: RouteRequest) => {
    const key = cacheKey(request);
    const durable = persistable(request);

    if (durable) {
      const stored = read(storage)[key];
      if (stored && fresh(stored, clock())) {
        const hit = storedRoute(stored.route);
        if (hit) return hit;
      }
    } else {
      const held = session.get(key);
      if (held) return held;
    }

    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const promise = inner(request);
    pending.set(key, promise);

    try {
      const route = await promise;
      if (durable) {
        const file = prune(read(storage), clock());
        file[key] = { savedAt: clock().toISOString(), route };
        write(storage, file);
      } else {
        session.set(key, route);
      }
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

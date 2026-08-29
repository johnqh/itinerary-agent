import type {
  Attraction,
  Phase,
  Plan,
  Rating,
  Restaurant,
  TripRequest,
  Workspace,
} from "@/types/workspace";

/**
 * Keeps a trip across a page reload.
 *
 * Planning a trip is long-lived work: losing a rated candidate list to a
 * refresh is the difference between a tool someone trusts and one they redo.
 * The harness owns the agent session; this owns the traveller's side of it, so
 * a reload rejoins rather than restarts even in offline mode where there is no
 * session to rejoin.
 *
 * Browser storage is the least reliable thing on the page — private windows,
 * cleared site data, quota, and browsers that throw on access. Every path here
 * degrades to "start fresh" and none of them throws.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SESSION_KEY = "itinerary-agent.session";
export const SESSION_SCHEMA_VERSION = 1;

/** Past this, the stored trip is unlikely to still be the one in hand. */
const MAX_AGE_DAYS = 14;

export interface StoredSession {
  version: number;
  savedAt: string;
  trip: TripRequest;
  ratings: Record<string, Rating>;
  phase: Phase;
  sessionId: string | null;
  live: boolean;
  attractions: Attraction[];
  restaurants: Restaurant[];
  plan: Plan | null;
}

export interface SaveOptions {
  live: boolean;
  now?: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * A restored trip drives real scheduling, so its shape is checked rather than
 * assumed. Anything short of a complete trip is discarded.
 */
function readTrip(value: unknown): TripRequest | null {
  if (!isRecord(value)) return null;
  const { destination, startDate, endDate, pace, meals } = value;
  if (typeof destination !== "string" || !destination.trim()) return null;
  if (typeof startDate !== "string" || typeof endDate !== "string") return null;
  if (pace !== "relaxed" && pace !== "balanced" && pace !== "packed") return null;
  if (!isRecord(meals)) return null;

  return {
    destination,
    startDate,
    endDate,
    hasRentalCar: value.hasRentalCar === true,
    pace,
    meals: {
      cuisines: Array.isArray(meals.cuisines)
        ? meals.cuisines.filter((c): c is string => typeof c === "string")
        : [],
      notes: typeof meals.notes === "string" ? meals.notes : undefined,
      strictness:
        meals.strictness === "flexible" ||
        meals.strictness === "prefer" ||
        meals.strictness === "strong"
          ? meals.strictness
          : "flexible",
    },
  };
}

export function saveSession(
  storage: StorageLike,
  workspace: Workspace,
  options: SaveOptions,
): void {
  if (!workspace.trip) return;

  const record: StoredSession = {
    version: SESSION_SCHEMA_VERSION,
    savedAt: (options.now ?? new Date()).toISOString(),
    trip: workspace.trip,
    ratings: workspace.ratings,
    phase: workspace.phase,
    sessionId: workspace.sessionId,
    live: options.live,
    attractions: workspace.attractions,
    restaurants: workspace.restaurants,
    plan: workspace.plan,
  };

  try {
    storage.setItem(SESSION_KEY, JSON.stringify(record));
  } catch {
    // Storage can be unavailable or full. Losing persistence is acceptable;
    // breaking the page over it is not.
  }
}

export function loadSession(storage: StorageLike, now = new Date()): StoredSession | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  // A record from another schema cannot be trusted field by field.
  if (parsed.version !== SESSION_SCHEMA_VERSION) return null;

  const savedAt = typeof parsed.savedAt === "string" ? Date.parse(parsed.savedAt) : NaN;
  if (Number.isNaN(savedAt)) return null;
  const ageDays = (now.getTime() - savedAt) / 86_400_000;
  if (ageDays > MAX_AGE_DAYS || ageDays < 0) return null;

  const trip = readTrip(parsed.trip);
  if (!trip) return null;

  const phase = parsed.phase;
  const validPhase: Phase =
    phase === "setup" ||
    phase === "discovering" ||
    phase === "rating" ||
    phase === "planning" ||
    phase === "ready"
      ? phase
      : "rating";

  return {
    version: SESSION_SCHEMA_VERSION,
    savedAt: new Date(savedAt).toISOString(),
    trip,
    ratings: isRecord(parsed.ratings) ? (parsed.ratings as Record<string, Rating>) : {},
    // A run that was mid-flight cannot be resumed from storage alone; the
    // traveller lands back on the last step they could act on.
    phase: validPhase === "discovering" || validPhase === "planning" ? "rating" : validPhase,
    sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : null,
    live: parsed.live === true,
    attractions: Array.isArray(parsed.attractions) ? (parsed.attractions as Attraction[]) : [],
    restaurants: Array.isArray(parsed.restaurants) ? (parsed.restaurants as Restaurant[]) : [],
    plan: isRecord(parsed.plan) ? (parsed.plan as unknown as Plan) : null,
  };
}

export function clearSession(storage: StorageLike): void {
  try {
    storage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to do: the caller is already moving on.
  }
}

/** The browser's storage, or null where it is unavailable. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

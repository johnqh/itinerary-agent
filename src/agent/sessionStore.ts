import type {
  Attraction,
  DegradedState,
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
  /**
   * Which degraded modes the restored candidates and plan were produced under.
   *
   * Stored because section 4.8 admits no silent degradation, and a reload is
   * not an exception: these notices describe the itinerary that comes back, so
   * losing them would present a seed-data plan of straight-line estimates as
   * though it were a researched one.
   */
  degraded: DegradedState;
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
  const { destination, startDate, endDate, hasRentalCar, pace, meals } = value;
  if (typeof destination !== "string" || !destination.trim()) return null;
  if (typeof startDate !== "string" || typeof endDate !== "string") return null;
  if (pace !== "relaxed" && pace !== "balanced" && pace !== "packed") return null;
  // A missing rental car is not "no rental car": it decides which days may
  // drive, so guessing it would re-plan the trip around a choice the traveller
  // never made.
  if (typeof hasRentalCar !== "boolean") return null;
  if (!isRecord(meals)) return null;

  return {
    destination,
    startDate,
    endDate,
    hasRentalCar,
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

/*
 * Everything below reads the rest of the record the same way `readTrip` reads
 * the trip. A restored record is handed straight to the renderer and to the
 * planner, and storage is writable by anything on the origin and survives
 * across releases, so an array of the wrong things is not a smaller workspace —
 * it is a crash on the first paint, or a re-plan against values nobody chose.
 * A record that fails any check is refused whole: a half-restored trip is
 * harder to reason about, for the traveller and for us, than a fresh one.
 */

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isLatLng(value: unknown): boolean {
  return isRecord(value) && isNumber(value.lat) && isNumber(value.lng);
}

function isHours(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.status === "closed" || value.status === "unknown") return true;
  return (
    value.status === "open" &&
    typeof value.open === "string" &&
    typeof value.close === "string"
  );
}

/** Keyed by YYYY-MM-DD; an absent date is a legitimate "never resolved". */
function isHoursByDate(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isHours);
}

function isSources(value: unknown): boolean {
  return (
    Array.isArray(value) && value.every((s) => isRecord(s) && typeof s.url === "string")
  );
}

function isAttraction(value: unknown): value is Attraction {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    typeof value.description === "string" &&
    isLatLng(value.location) &&
    isHoursByDate(value.hoursByDate) &&
    isNumber(value.estimatedVisitMinutes) &&
    typeof value.ticketRequired === "boolean" &&
    isStringArray(value.photoUrls) &&
    isSources(value.sources) &&
    isNumber(value.confidence)
  );
}

function isRestaurant(value: unknown): value is Restaurant {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isStringArray(value.cuisine) &&
    isLatLng(value.location) &&
    isHoursByDate(value.hoursByDate) &&
    isSources(value.sources) &&
    isNumber(value.confidence) &&
    // Rendered as a repeated currency glyph, which throws outright on a
    // negative count.
    (value.priceLevel === undefined ||
      value.priceLevel === 1 ||
      value.priceLevel === 2 ||
      value.priceLevel === 3 ||
      value.priceLevel === 4)
  );
}

function isPlanItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.kind === "attraction" || value.kind === "meal") &&
    typeof value.refId === "string" &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string"
  );
}

function isRouteLeg(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.fromIndex) &&
    isNumber(value.toIndex) &&
    (value.mode === "walk" ||
      value.mode === "transit" ||
      value.mode === "rideshare" ||
      value.mode === "car") &&
    isNumber(value.durationMinutes) &&
    isNumber(value.distanceMeters)
  );
}

function isPlanDay(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.date === "string" &&
    typeof value.isCarDay === "boolean" &&
    typeof value.summary === "string" &&
    Array.isArray(value.items) &&
    value.items.every(isPlanItem) &&
    Array.isArray(value.legs) &&
    value.legs.every(isRouteLeg)
  );
}

/** Only the counters the workspace actually displays or re-plans against. */
function isDiagnostics(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.considered) &&
    isNumber(value.included) &&
    isNumber(value.attractionMinutes) &&
    isNumber(value.transportMinutes) &&
    isNumber(value.score) &&
    Array.isArray(value.excluded) &&
    Array.isArray(value.unplacedMeals)
  );
}

function isPlan(value: unknown): value is Plan {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isNumber(value.version) &&
    typeof value.summary === "string" &&
    Array.isArray(value.days) &&
    value.days.every(isPlanDay) &&
    isStringArray(value.excludedAttractionIds) &&
    isDiagnostics(value.diagnostics)
  );
}

/**
 * Ratings are the traveller's own judgement and the planner's main input, so a
 * value off the 0..4 scale is not a stray key to ignore — it silently reorders
 * the itinerary.
 */
function isRatings(value: unknown): value is Record<string, Rating> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (r) => r === 0 || r === 1 || r === 2 || r === 3 || r === 4,
    )
  );
}

const DEGRADED_KEYS = ["discovery", "routing", "optimizer", "meals", "map"] as const;

function isDegraded(value: unknown): value is DegradedState {
  return (
    isRecord(value) &&
    DEGRADED_KEYS.every((k) => value[k] === null || typeof value[k] === "string")
  );
}

function isPhase(value: unknown): value is Phase {
  return (
    value === "setup" ||
    value === "discovering" ||
    value === "rating" ||
    value === "planning" ||
    value === "ready"
  );
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
    degraded: workspace.degraded,
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

  // An unrecognised phase is a record we do not understand, not a record to
  // land on the rating screen: coercing it would make an arbitrary workspace
  // actionable.
  if (!isPhase(parsed.phase)) return null;
  if (!isRatings(parsed.ratings)) return null;
  if (!isDegraded(parsed.degraded)) return null;

  if (!Array.isArray(parsed.attractions) || !parsed.attractions.every(isAttraction)) {
    return null;
  }
  if (!Array.isArray(parsed.restaurants) || !parsed.restaurants.every(isRestaurant)) {
    return null;
  }
  // A trip that never got as far as a plan stores null, which is not corruption.
  const plan = parsed.plan == null ? null : isPlan(parsed.plan) ? parsed.plan : undefined;
  if (plan === undefined) return null;

  return {
    version: SESSION_SCHEMA_VERSION,
    savedAt: new Date(savedAt).toISOString(),
    trip,
    ratings: parsed.ratings,
    // A run that was mid-flight cannot be resumed from storage alone; the
    // traveller lands back on the last step they could act on.
    phase:
      parsed.phase === "discovering" || parsed.phase === "planning"
        ? "rating"
        : parsed.phase,
    sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : null,
    live: parsed.live === true,
    attractions: parsed.attractions,
    restaurants: parsed.restaurants,
    plan,
    // The map notice is about this page's tile session, not the trip, so it is
    // dropped: a restored map may well load. The adapter never sets it, but a
    // record from a build that did should not outlive the load that failed.
    degraded: { ...parsed.degraded, map: null },
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

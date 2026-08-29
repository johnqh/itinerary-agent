import type {
  Attraction,
  Hours,
  LatLng,
  Restaurant,
  SourceRef,
} from "@/types/workspace";

/**
 * Turns raw agent output into contract-valid records.
 *
 * Everything here treats the agent as an untrusted source. A research subagent
 * reading messy pages will occasionally return a string where a number belongs,
 * hours for a date outside the trip, a duplicate of a place it already found,
 * or a confident-looking record with no coordinates. Repair what is safely
 * repairable, reject what is not, and record a reason either way so a discovery
 * run can be audited rather than guessed at.
 *
 * The one thing never done here is inventing a fact. An unresolved opening time
 * becomes `unknown`, never a plausible default: a guessed closing time produces
 * an itinerary that sends someone to a locked door.
 */

export interface RejectedRecord {
  name: string;
  reason: string;
}

export interface NormalizeResult {
  attractions: Attraction[];
  restaurants: Restaurant[];
  rejected: RejectedRecord[];
}

const MIN_VISIT_MINUTES = 15;
const MAX_VISIT_MINUTES = 480;
const DEFAULT_VISIT_MINUTES = 60;

/** Absent confidence is treated as weak, never as certainty. */
const DEFAULT_CONFIDENCE = 0.4;

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Names arrive with stray case, spacing, and punctuation; compare on this. */
function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readLocation(entry: Record<string, unknown>): LatLng | undefined {
  const lat = readFiniteNumber(entry.lat);
  const lng = readFiniteNumber(entry.lng);
  if (lat === undefined || lng === undefined) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

function readHttpUrl(value: unknown): string | undefined {
  const raw = readString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : undefined;
  } catch {
    return undefined;
  }
}

function readSources(value: unknown): SourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const url = readHttpUrl(entry.url);
    return url ? [{ url, title: readString(entry.title) }] : [];
  });
}

function readPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const url = readHttpUrl(entry);
    return url ? [url] : [];
  });
}

/** A single date's hours, or `unknown` when the payload cannot be trusted. */
function readHours(value: unknown): Hours {
  if (!isRecord(value)) return { status: "unknown" };
  if (value.status === "closed") return { status: "closed" };
  if (value.status === "open") {
    const open = readString(value.open);
    const close = readString(value.close);
    if (open && close && CLOCK.test(open) && CLOCK.test(close) && open < close) {
      return { status: "open", open, close };
    }
    // Claimed open, but the times are unusable. Saying so beats guessing.
    return { status: "unknown" };
  }
  return { status: "unknown" };
}

/**
 * Hours for exactly the trip's dates. Dates the agent skipped become unknown,
 * and dates outside the trip are dropped rather than carried around.
 */
function readHoursByDate(value: unknown, dates: string[]): Record<string, Hours> {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    dates.map((date) => [date, readHours(source[date])]),
  );
}

function readConfidence(value: unknown): number {
  const raw = readFiniteNumber(value);
  return raw === undefined ? DEFAULT_CONFIDENCE : clamp(raw, 0, 1);
}

function readVisitMinutes(value: unknown): number {
  const raw = readFiniteNumber(value);
  if (raw === undefined) return DEFAULT_VISIT_MINUTES;
  return Math.round(clamp(raw, MIN_VISIT_MINUTES, MAX_VISIT_MINUTES));
}

function readCuisine(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const cuisine = readString(entry);
    return cuisine ? [cuisine.toLowerCase()] : [];
  });
}

function readPriceLevel(value: unknown): 1 | 2 | 3 | 4 | undefined {
  const raw = readFiniteNumber(value);
  if (raw === undefined) return undefined;
  const level = Math.round(clamp(raw, 1, 4));
  return level as 1 | 2 | 3 | 4;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Keeps the better-sourced of two records for the same place. Subagents
 * researching neighbouring areas routinely return the same landmark twice.
 */
function keepBetter<T extends { confidence: number; sources: SourceRef[] }>(
  existing: T,
  candidate: T,
): T {
  if (candidate.confidence !== existing.confidence) {
    return candidate.confidence > existing.confidence ? candidate : existing;
  }
  return candidate.sources.length > existing.sources.length ? candidate : existing;
}

export function normalizeDiscovery(raw: unknown, dates: string[]): NormalizeResult {
  const payload = isRecord(raw) ? raw : {};
  const rejected: RejectedRecord[] = [];

  const attractions = new Map<string, Attraction>();
  for (const entry of asList(payload.attractions)) {
    if (!isRecord(entry)) continue;

    const name = readString(entry.name);
    if (!name) {
      rejected.push({ name: "(unnamed)", reason: "No name was returned." });
      continue;
    }

    const location = readLocation(entry);
    if (!location) {
      rejected.push({ name, reason: "No usable coordinates were returned." });
      continue;
    }

    const attraction: Attraction = {
      id: slugify(name),
      name,
      category: readString(entry.category) ?? "attraction",
      location,
      description: readString(entry.description) ?? "",
      practicalNotes: readString(entry.practicalNotes),
      hoursByDate: readHoursByDate(entry.hoursByDate, dates),
      estimatedVisitMinutes: readVisitMinutes(entry.estimatedVisitMinutes),
      costSummary: readString(entry.costSummary),
      ticketRequired: entry.ticketRequired === true,
      ticketUrl: readHttpUrl(entry.ticketUrl),
      officialUrl: readHttpUrl(entry.officialUrl),
      photoUrls: readPhotoUrls(entry.photoUrls),
      sources: readSources(entry.sources),
      confidence: readConfidence(entry.confidence),
    };

    const existing = attractions.get(attraction.id);
    attractions.set(
      attraction.id,
      existing ? keepBetter(existing, attraction) : attraction,
    );
  }

  const restaurants = new Map<string, Restaurant>();
  for (const entry of asList(payload.restaurants)) {
    if (!isRecord(entry)) continue;

    const name = readString(entry.name);
    if (!name) {
      rejected.push({ name: "(unnamed)", reason: "No name was returned." });
      continue;
    }

    const location = readLocation(entry);
    if (!location) {
      rejected.push({ name, reason: "No usable coordinates were returned." });
      continue;
    }

    const restaurant: Restaurant = {
      id: slugify(name),
      name,
      cuisine: readCuisine(entry.cuisine),
      location,
      hoursByDate: readHoursByDate(entry.hoursByDate, dates),
      priceLevel: readPriceLevel(entry.priceLevel),
      sources: readSources(entry.sources),
      confidence: readConfidence(entry.confidence),
    };

    const existing = restaurants.get(restaurant.id);
    restaurants.set(
      restaurant.id,
      existing ? keepBetter(existing, restaurant) : restaurant,
    );
  }

  return {
    attractions: [...attractions.values()],
    restaurants: [...restaurants.values()],
    rejected,
  };
}

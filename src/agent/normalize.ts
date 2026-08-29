import type {
  Attraction,
  Hours,
  LatLng,
  Restaurant,
  SourceRef,
} from "@/types/workspace";
import { haversineMeters } from "@/planner/geo";

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

/** Said out loud in the discovery banner, so it has to read as a sentence. */
const UNSOURCED_REASON =
  "No retrievable source was cited, so nothing in the record is grounded.";

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

/**
 * Names arrive with stray case, spacing, and punctuation; compare on this.
 *
 * Letters and digits of every script are kept, not just ASCII ones. Stripping
 * to ASCII collapsed 東京タワー and 浅草寺 to the same empty string, which made
 * two unrelated landmarks one record and pointed every rating at whichever
 * survived. Combining marks are dropped after NFKD so "Sensō-ji" and
 * "Senso-ji" still meet.
 */
function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * An id for a place whose name contributes no letters or digits at all.
 * Coordinates are the only identity such a record has left.
 */
function locationSlug(location: LatLng): string {
  const part = (value: number) =>
    `${value < 0 ? "s" : ""}${Math.abs(Math.round(value * 10_000))}`;
  return `place-${part(location.lat)}-${part(location.lng)}`;
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

/** Extensions a browser will actually render as a picture. */
const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|gif|avif)$/i;

/**
 * Photographs, not links to pages that contain photographs.
 *
 * An agent asked for images will sometimes return the page it found them on.
 * That renders as a broken frame where a picture should be, so the path has to
 * end in something a browser can draw. Query strings are ignored: image hosts
 * routinely append tracking parameters after the extension.
 */
function readPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const url = readHttpUrl(entry);
    if (!url) return [];
    try {
      return IMAGE_EXTENSIONS.test(new URL(url).pathname) ? [url] : [];
    } catch {
      return [];
    }
  });
}

/**
 * A single date's hours, or `unknown` when the payload cannot be trusted.
 *
 * A closing clock earlier than the opening one is a night that runs past
 * midnight, not a mistake: rejecting 18:00–02:00 threw away exactly the
 * restaurants that can seat a late dinner. Only an interval that opens and
 * closes at the same minute is unreadable, because nothing says whether it
 * means all day or not at all.
 */
function readHours(value: unknown): Hours {
  if (!isRecord(value)) return { status: "unknown" };
  if (value.status === "closed") return { status: "closed" };
  if (value.status === "open") {
    const open = readString(value.open);
    const close = readString(value.close);
    if (open && close && CLOCK.test(open) && CLOCK.test(close) && open !== close) {
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

/**
 * How close two records sharing a name have to be to be the same place.
 *
 * Subagents report the same landmark with slightly different coordinates, so
 * an exact match would never merge anything. Two hundred metres is wider than
 * that jitter and far narrower than the distance between two branches of a
 * restaurant chain, which are separate places a traveller may need to choose
 * between.
 */
const SAME_PLACE_METERS = 200;

interface Place {
  id: string;
  location: LatLng;
  confidence: number;
  sources: SourceRef[];
}

/**
 * Collects records under a name, keeping distinct places distinct.
 *
 * Keying on the name alone silently deleted every second branch of a chain and
 * every unrelated venue that happened to share a name, so identity here is the
 * name *and* the position. Ids stay unique because everything downstream —
 * ratings, plan items, map markers — resolves a place by its id.
 */
function createPlaceIndex<T extends Place>() {
  const entries: { slug: string; record: T }[] = [];
  const usedIds = new Set<string>();

  function uniqueId(base: string): string {
    if (!usedIds.has(base)) {
      usedIds.add(base);
      return base;
    }
    for (let suffix = 2; ; suffix++) {
      const candidate = `${base}-${suffix}`;
      if (!usedIds.has(candidate)) {
        usedIds.add(candidate);
        return candidate;
      }
    }
  }

  return {
    /** `build` is called with the id the record will actually carry. */
    add(slug: string, build: (id: string) => T): void {
      const provisional = build("");
      const twin = entries.find(
        (entry) =>
          entry.slug === slug &&
          haversineMeters(entry.record.location, provisional.location) <=
            SAME_PLACE_METERS,
      );
      if (twin) {
        // The surviving record keeps the id already handed out, so a merge
        // never moves a rating from under the traveller.
        twin.record = keepBetter(twin.record, build(twin.record.id));
        return;
      }
      const id = uniqueId(slug || locationSlug(provisional.location));
      entries.push({ slug, record: build(id) });
    },
    values(): T[] {
      return entries.map((entry) => entry.record);
    },
  };
}

export function normalizeDiscovery(raw: unknown, dates: string[]): NormalizeResult {
  const payload = isRecord(raw) ? raw : {};
  const rejected: RejectedRecord[] = [];

  const attractions = createPlaceIndex<Attraction>();
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

    // Grounding is the whole contract of a research record. One that cites
    // nothing retrievable is a claim, and a claim is what the seed dataset is
    // for, not what live research is for.
    const sources = readSources(entry.sources);
    if (sources.length === 0) {
      rejected.push({ name, reason: UNSOURCED_REASON });
      continue;
    }

    attractions.add(slugify(name), (id) => ({
      id,
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
      sources,
      confidence: readConfidence(entry.confidence),
    }));
  }

  const restaurants = createPlaceIndex<Restaurant>();
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

    const sources = readSources(entry.sources);
    if (sources.length === 0) {
      rejected.push({ name, reason: UNSOURCED_REASON });
      continue;
    }

    restaurants.add(slugify(name), (id) => ({
      id,
      name,
      cuisine: readCuisine(entry.cuisine),
      location,
      hoursByDate: readHoursByDate(entry.hoursByDate, dates),
      priceLevel: readPriceLevel(entry.priceLevel),
      sources,
      confidence: readConfidence(entry.confidence),
    }));
  }

  return {
    attractions: attractions.values(),
    restaurants: restaurants.values(),
    rejected,
  };
}

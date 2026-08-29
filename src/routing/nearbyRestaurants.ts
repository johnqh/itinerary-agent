import type { Hours, LatLng, Restaurant } from "@/types/workspace";

/**
 * Finds somewhere to eat near where the day actually is.
 *
 * Researching restaurants up front means guessing where the traveller will be
 * before the day exists, so the pool is arbitrary relative to the route and no
 * amount of adding more fixes it. This asks the question once it has an
 * answer: given the stop the traveller is at around midday, what is within a
 * few minutes' walk and open then.
 *
 * The API key is never handled here — requests go to `/places` on this origin
 * and the dev and preview servers attach it server-side.
 */

export interface NearbyRequestBody {
  includedTypes: string[];
  maxResultCount: number;
  locationRestriction: {
    circle: { center: { latitude: number; longitude: number }; radius: number };
  };
}

export function nearbyRequestBody(near: LatLng, radiusMetres: number): NearbyRequestBody {
  return {
    includedTypes: ["restaurant"],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: near.lat, longitude: near.lng },
        radius: radiusMetres,
      },
    },
  };
}

export const NEARBY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.primaryType",
  "places.priceLevel",
  "places.regularOpeningHours",
].join(",");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** "mexican_restaurant" is how the API says it; "mexican" is how a person does. */
function readCuisine(primaryType: unknown): string[] {
  if (typeof primaryType !== "string" || !primaryType) return [];
  const cleaned = primaryType.replace(/_restaurant$/, "").replace(/_/g, " ").trim();
  return cleaned && cleaned !== "restaurant" ? [cleaned] : [];
}

const PRICE_BANDS: Record<string, 1 | 2 | 3 | 4> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function clock(hour: unknown, minute: unknown): string | null {
  if (typeof hour !== "number" || hour < 0 || hour > 23) return null;
  const m = typeof minute === "number" ? minute : 0;
  if (m < 0 || m > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Midnight to midnight, which `openDuring` reads as the whole day: a closing
 * clock at or before the opening one runs into the following morning.
 */
const ALL_DAY: Hours = { status: "open", open: "00:00", close: "00:00" };

/**
 * The shape Places uses for a place that never closes: exactly one period,
 * opening at the very start of the week, with no closing time.
 *
 * Matched narrowly on purpose. A period missing its close for any other reason
 * is a record this parser cannot read, and reading it as "open forever" would
 * put an opening time on screen that nobody published.
 */
function isAlwaysOpen(periods: unknown[]): boolean {
  if (periods.length !== 1) return false;
  const only = periods[0];
  if (!isRecord(only) || isRecord(only.close) || !isRecord(only.open)) return false;
  const { day, hour, minute } = only.open;
  return day === 0 && hour === 0 && (minute === undefined || minute === 0);
}

/**
 * Google publishes a weekly pattern; a trip needs specific dates.
 *
 * `periods` is the whole week's opening, so a weekday it does not mention is a
 * day the place is shut — a fact, and a different thing from a place that
 * published nothing at all. The planner keeps unknown hours eligible and will
 * seat a meal against them, so recording a known closure as unknown books a
 * traveller into a restaurant with its shutters down. Only an absent or
 * unreadable schedule stays unknown.
 *
 * Every interval on the date is kept. A kitchen serving lunch and dinner
 * either side of an afternoon closure publishes two, and keeping the first
 * alone loses the dinner it can actually seat.
 */
function hoursForDates(opening: unknown, dates: string[]): Record<string, Hours> {
  const periods =
    isRecord(opening) && Array.isArray(opening.periods) ? opening.periods : null;

  // Places says "never closes" by publishing one period that opens at the
  // start of the week with no closing time at all. Read literally that is a
  // week with six unmentioned days, which would shut a 24-hour place on five
  // of them; it is in fact the one place that is open whenever asked.
  if (periods && isAlwaysOpen(periods)) {
    return Object.fromEntries(
      dates.map((date) => [date, ALL_DAY]),
    );
  }

  return Object.fromEntries(
    dates.map((date) => {
      if (!periods) return [date, { status: "unknown" } as Hours];

      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const intervals = periods.flatMap((p) => {
        if (!isRecord(p) || !isRecord(p.open) || p.open.day !== weekday) return [];
        const open = clock(p.open.hour, p.open.minute);
        const close = isRecord(p.close) ? clock(p.close.hour, p.close.minute) : null;
        // A period the API published but this parser cannot read is not
        // evidence of a closure, so it is dropped rather than counted.
        return open && close ? [{ open, close }] : [];
      });

      if (intervals.length === 0) {
        // Nothing readable for this weekday. A schedule that mentions the
        // weekday at all but not in a form this can read must not be reported
        // as a closure, so that case stays unknown.
        const mentioned = periods.some(
          (p) => isRecord(p) && isRecord(p.open) && p.open.day === weekday,
        );
        return [date, { status: mentioned ? "unknown" : "closed" } as Hours];
      }

      const [first, ...rest] = intervals;
      return [
        date,
        {
          status: "open",
          open: first!.open,
          close: first!.close,
          ...(rest.length > 0 ? { alsoOpen: rest } : {}),
        } as Hours,
      ];
    }),
  );
}

/** Places found this way were retrieved, not inferred, so they claim more than seed data. */
const NEARBY_CONFIDENCE = 0.75;

export function parseNearbyResponse(payload: unknown, dates: string[]): Restaurant[] {
  if (!isRecord(payload) || !Array.isArray(payload.places)) return [];

  return payload.places.flatMap((raw) => {
    if (!isRecord(raw)) return [];

    const location = raw.location;
    if (!isRecord(location)) return [];
    const lat = location.latitude;
    const lng = location.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const name =
      isRecord(raw.displayName) && typeof raw.displayName.text === "string"
        ? raw.displayName.text
        : null;
    if (!name) return [];

    const id = typeof raw.id === "string" && raw.id ? raw.id : `place-${lat},${lng}`;

    return [
      {
        id,
        name,
        cuisine: readCuisine(raw.primaryType),
        location: { lat, lng },
        hoursByDate: hoursForDates(raw.regularOpeningHours, dates),
        priceLevel:
          typeof raw.priceLevel === "string" ? PRICE_BANDS[raw.priceLevel] : undefined,
        sources: [],
        confidence: NEARBY_CONFIDENCE,
      } satisfies Restaurant,
    ];
  });
}

export class NearbyUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "NearbyUnavailable";
  }
}

/**
 * How far around a stop the search looks.
 *
 * Nine hundred metres is roughly a ten-minute walk: far enough that a day's
 * centre has real choice, near enough that the traveller is not crossing the
 * city for lunch. It is exported because it also answers the other direction
 * of the question — whether a restaurant already known is near enough to a
 * day's centre to count as that day's option.
 */
export const NEARBY_RADIUS_METERS = 900;

/** Asks for restaurants around one point. Throws when the provider cannot answer. */
export async function findRestaurantsNear(
  near: LatLng,
  dates: string[],
  radiusMetres = NEARBY_RADIUS_METERS,
): Promise<Restaurant[]> {
  const response = await fetch("/places/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-FieldMask": NEARBY_FIELD_MASK,
    },
    body: JSON.stringify(nearbyRequestBody(near, radiusMetres)),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new NearbyUnavailable(
      `Nearby search failed (${response.status}). ${detail.slice(0, 140)}`,
    );
  }

  return parseNearbyResponse(await response.json(), dates);
}

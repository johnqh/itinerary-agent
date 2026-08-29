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
 * Google publishes a weekly pattern; a trip needs specific dates. A day the
 * place never published stays unknown rather than being assumed shut, since an
 * unknown is scored differently from a closure.
 */
function hoursForDates(opening: unknown, dates: string[]): Record<string, Hours> {
  const periods =
    isRecord(opening) && Array.isArray(opening.periods) ? opening.periods : null;

  return Object.fromEntries(
    dates.map((date) => {
      if (!periods) return [date, { status: "unknown" } as Hours];

      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const period = periods.find(
        (p) => isRecord(p) && isRecord(p.open) && p.open.day === weekday,
      );
      if (!isRecord(period) || !isRecord(period.open)) {
        return [date, { status: "unknown" } as Hours];
      }

      const open = clock(period.open.hour, period.open.minute);
      const close = isRecord(period.close)
        ? clock(period.close.hour, period.close.minute)
        : null;
      if (!open || !close) return [date, { status: "unknown" } as Hours];

      return [date, { status: "open", open, close } as Hours];
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

/** Asks for restaurants around one point. Throws when the provider cannot answer. */
export async function findRestaurantsNear(
  near: LatLng,
  dates: string[],
  radiusMetres = 900,
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

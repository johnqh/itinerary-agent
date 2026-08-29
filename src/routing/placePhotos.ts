import type { Attraction } from "@/types/workspace";

/**
 * Photographs for places that were researched rather than seeded.
 *
 * Asking the model for image URLs is unreliable: it returns links to the page
 * an image sits on, or nothing at all, and a place with no picture is the
 * first thing a traveller notices. Places already holds photographs for
 * somewhere it knows, so they are fetched rather than requested.
 *
 * The URLs point back at this origin. The media endpoint needs the API key,
 * and a browser cannot attach a header to an `img` request, so the request
 * goes through the proxy that attaches it server-side. That also means no
 * credential is ever placed in the page.
 */

const PHOTO_PREFIX = "/places/v1/";
const PHOTO_WIDTH = 1200;

/** Enough for a gallery, few enough not to spend a request per picture. */
const MAX_PHOTOS_PER_PLACE = 4;

export function photoProxyUrl(photoName: string): string {
  return `${PHOTO_PREFIX}${photoName}/media?maxWidthPx=${PHOTO_WIDTH}`;
}

export function isPlacePhotoUrl(url: string): boolean {
  return url.startsWith(PHOTO_PREFIX) && url.includes("/photos/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function photoUrlsFromPlace(place: unknown): string[] {
  if (!isRecord(place) || !Array.isArray(place.photos)) return [];

  return place.photos
    .flatMap((photo) =>
      isRecord(photo) && typeof photo.name === "string" && photo.name
        ? [photoProxyUrl(photo.name)]
        : [],
    )
    .slice(0, MAX_PHOTOS_PER_PLACE);
}

const TEXT_SEARCH_FIELD_MASK = "places.id,places.displayName,places.photos";

/**
 * Looks one place up by name and returns its photographs.
 *
 * Failures are swallowed to an empty list on purpose: a missing picture is a
 * thinner card, while a thrown error would take down a discovery run that
 * otherwise succeeded.
 */
async function photosFor(query: string): Promise<string[]> {
  try {
    const response = await fetch("/places/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    const places = isRecord(payload) && Array.isArray(payload.places) ? payload.places : [];
    return places.length > 0 ? photoUrlsFromPlace(places[0]) : [];
  } catch {
    return [];
  }
}

/** How many lookups run at once. Enough to be quick, few enough to be polite. */
const CONCURRENCY = 4;

/**
 * Gives researched attractions their photographs, leaving alone any that
 * already have some.
 */
export async function attachPhotos(
  attractions: Attraction[],
  destination: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Attraction[]> {
  const needing = attractions.filter((a) => a.photoUrls.length === 0);
  if (needing.length === 0) return attractions;

  const found = new Map<string, string[]>();
  let done = 0;

  const queue = [...needing];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const photos = await photosFor(`${next.name}, ${destination}`);
      if (photos.length > 0) found.set(next.id, photos);
      done += 1;
      onProgress?.(done, needing.length);
    }
  });
  await Promise.all(workers);

  return attractions.map((a) =>
    found.has(a.id) ? { ...a, photoUrls: found.get(a.id)! } : a,
  );
}

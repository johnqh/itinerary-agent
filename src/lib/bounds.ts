import type { LatLng } from "@/types/workspace";

/**
 * Where the map should be looking.
 *
 * The seed dataset fixed the map on one city, which was right while that was
 * the only city with data. Live research returns any destination, so the view
 * has to be derived from the candidates themselves: markers off-screen behind a
 * map of somewhere else look exactly like a discovery run that found nothing.
 */

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** The box containing every point, or null when there is nothing to fit. */
export function boundsOf(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  return points.reduce<Bounds>(
    (box, point) => ({
      south: Math.min(box.south, point.lat),
      west: Math.min(box.west, point.lng),
      north: Math.max(box.north, point.lat),
      east: Math.max(box.east, point.lng),
    }),
    {
      south: points[0]!.lat,
      west: points[0]!.lng,
      north: points[0]!.lat,
      east: points[0]!.lng,
    },
  );
}

/**
 * The centre of those points, or `fallback` before any candidate exists.
 *
 * The centre of the bounding box rather than of the points themselves: one
 * dense neighbourhood should not drag the view off a distant landmark.
 */
export function focusCenter(points: LatLng[], fallback: LatLng): LatLng {
  const bounds = boundsOf(points);
  if (!bounds) return fallback;
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
}

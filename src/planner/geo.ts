import type { LatLng } from "@/types/workspace";
import type { TravelOption } from "@/planner/transport";

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** Straight-line distance understates road distance; scale it up. */
const ROAD_FACTOR = 1.3;
const WALK_KMH = 4.5;
const URBAN_DRIVE_KMH = 20;
const DRIVE_OVERHEAD_MINUTES = 3;

/**
 * Travel estimate with no routing provider.
 *
 * Transit is reported as unavailable rather than invented: claiming a line and
 * a transfer count we did not retrieve would be a fabricated fact, and every
 * leg built from these numbers is flagged `estimated` downstream.
 */
export function estimateTravel(from: LatLng, to: LatLng): TravelOption {
  const straight = haversineMeters(from, to);
  const road = straight * ROAD_FACTOR;
  return {
    walkMinutes: Math.round((straight / 1000 / WALK_KMH) * 60),
    driveMinutes: Math.round((road / 1000 / URBAN_DRIVE_KMH) * 60) + DRIVE_OVERHEAD_MINUTES,
    driveMeters: Math.round(road),
    transit: null,
  };
}

export function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

/**
 * Deterministic k-means. Seeded by evenly spaced points from a stable sort so
 * the same input always produces the same clusters; replanning must not shuffle
 * the itinerary for reasons the traveler did not cause.
 */
export function clusterByGeography<T extends { location: LatLng }>(
  items: T[],
  k: number,
  iterations = 12,
): T[][] {
  if (k <= 1 || items.length <= k) {
    return k <= 1 ? [items] : items.map((item) => [item]);
  }

  const ordered = [...items].sort(
    (a, b) => a.location.lat - b.location.lat || a.location.lng - b.location.lng,
  );
  let centroids: LatLng[] = Array.from({ length: k }, (_, i) => {
    const index = Math.floor((i * ordered.length) / k);
    return ordered[index]!.location;
  });

  let groups: T[][] = [];
  for (let iter = 0; iter < iterations; iter++) {
    groups = Array.from({ length: k }, () => [] as T[]);
    for (const item of ordered) {
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < k; c++) {
        const distance = haversineMeters(item.location, centroids[c]!);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = c;
        }
      }
      groups[best]!.push(item);
    }
    centroids = groups.map((group, i) =>
      group.length > 0 ? centroid(group.map((g) => g.location)) : centroids[i]!,
    );
  }

  return groups;
}

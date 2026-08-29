/**
 * Decodes Google's encoded polyline format.
 *
 * Route geometry arrives as a compressed string of deltas rather than a list of
 * coordinates. Drawing a straight line between two stops instead would tell the
 * traveller the route goes through the bay, which is why this exists rather
 * than a placeholder: a map that draws a plausible-looking wrong path is worse
 * than one that admits it does not know.
 *
 * Written out rather than pulled from a package: it is twenty lines, and the
 * format is fixed by specification.
 */

/** Coordinates are transmitted scaled by 1e5 and rounded to five decimals. */
const PRECISION = 1e5;

export type PolylinePoint = [lat: number, lng: number];

export function decodePolyline(encoded: string): PolylinePoint[] {
  const points: PolylinePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const latDelta = readDelta();
    if (latDelta === null) break;
    const lngDelta = readDelta();
    // A truncated payload leaves a latitude with no longitude. Drop the half
    // point rather than emitting a coordinate on the equator.
    if (lngDelta === null) break;

    lat += latDelta;
    lng += lngDelta;
    points.push([lat / PRECISION, lng / PRECISION]);
  }

  return points;

  /**
   * Reads one variable-length quantity: five bits per character, low group
   * first, with the sign carried in the least significant bit.
   */
  function readDelta(): number | null {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}

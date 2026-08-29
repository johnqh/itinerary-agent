import type { LatLng } from "@/types/workspace";

/**
 * Google's encoded polyline, unpacked.
 *
 * The provider answers with the shape of the journey as well as its length, and
 * the shape is the part a traveller reads: a straight line between two stops
 * says they cross the bay, when what the route does is go round by the bridge.
 * Having paid to measure the journey, drawing the measurement is nearly free.
 *
 * The format stores each point as a delta from the last, in units of 1e-5
 * degrees, each value zig-zag encoded into six-bit groups with the high bit set
 * on every group but the last.
 *
 * A string that ends mid-value, or contains characters the format never
 * produces, yields the points it did finish and nothing more. Half a value is
 * not half a place, and a route drawn through a coordinate nobody returned is a
 * fabricated one.
 */

const SCALE = 1e-5;

export function decodePolyline(encoded: string | undefined): LatLng[] {
  if (!encoded) return [];

  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const dLat = readValue();
    if (dLat === null) break;
    const dLng = readValue();
    if (dLng === null) break;

    lat += dLat;
    lng += dLng;
    const point = { lat: lat * SCALE, lng: lng * SCALE };
    // A delta stream that has drifted off the earth is not geometry any more,
    // whatever produced it.
    if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) break;
    points.push(point);
  }

  return points;

  /** One zig-zag encoded delta, or null when the string ran out or is not this. */
  function readValue(): number | null {
    let result = 0;
    let shift = 0;
    let group: number;

    do {
      if (index >= encoded!.length) return null;
      group = encoded!.charCodeAt(index) - 63;
      index += 1;
      if (group < 0 || group > 63) return null;
      result |= (group & 0x1f) << shift;
      shift += 5;
      // Five bits a group, and a signed 32-bit accumulator: more groups than
      // this is not a value the encoder can have produced.
      if (shift > 30) return null;
    } while (group >= 0x20);

    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}

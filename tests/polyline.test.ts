import { describe, expect, test } from "vitest";
import { decodePolyline } from "@/routing/polyline";

/**
 * Google answers with the shape of the route, not just its length. Drawing the
 * straight line between two stops instead says the traveller crosses the bay
 * rather than the bridge, and undoes the point of measuring the journey at all.
 */

describe("decoding Google's encoded geometry", () => {
  test("recovers the documented example", () => {
    // From Google's own encoded polyline reference.
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points).toHaveLength(3);
    expect(points[0]!.lat).toBeCloseTo(38.5, 5);
    expect(points[0]!.lng).toBeCloseTo(-120.2, 5);
    expect(points[1]!.lat).toBeCloseTo(40.7, 5);
    expect(points[1]!.lng).toBeCloseTo(-120.95, 5);
    expect(points[2]!.lat).toBeCloseTo(43.252, 5);
    expect(points[2]!.lng).toBeCloseTo(-126.453, 5);
  });

  test("has nothing to draw for nothing", () => {
    expect(decodePolyline("")).toEqual([]);
    expect(decodePolyline(undefined)).toEqual([]);
  });

  test("gives up on a truncated string rather than inventing a point", () => {
    // A trailing continuation byte with nothing after it: the last point was
    // never finished, so it is not a place the route goes.
    expect(decodePolyline("_p~iF~ps|U_")).toHaveLength(1);
  });

  test("never lets a corrupt string place a point off the earth", () => {
    for (const point of decodePolyline("!!!!invalid!!!!")) {
      expect(Math.abs(point.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(point.lng)).toBeLessThanOrEqual(180);
    }
  });
});

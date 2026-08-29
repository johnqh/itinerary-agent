import { describe, expect, test } from "vitest";
import { decodePolyline } from "@/routing/polyline";

/**
 * Google's encoded polyline format. The first case is the worked example from
 * Google's own specification, so a decoder that passes it is reading the same
 * format the API is writing.
 */

describe("decodePolyline", () => {
  test("decodes the reference example from the specification", () => {
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points).toHaveLength(3);
    expect(points[0]![0]).toBeCloseTo(38.5, 5);
    expect(points[0]![1]).toBeCloseTo(-120.2, 5);
    expect(points[1]![0]).toBeCloseTo(40.7, 5);
    expect(points[1]![1]).toBeCloseTo(-120.95, 5);
    expect(points[2]![0]).toBeCloseTo(43.252, 5);
    expect(points[2]![1]).toBeCloseTo(-126.453, 5);
  });

  test("returns nothing for an empty string rather than a phantom point", () => {
    expect(decodePolyline("")).toEqual([]);
  });

  test("survives a truncated payload instead of throwing", () => {
    // A half-written encoding must not take the map down with it.
    expect(() => decodePolyline("_p~iF~ps|U_ulL")).not.toThrow();
  });

  test("keeps points in the order they were encoded", () => {
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points[0]![0]).toBeLessThan(points[2]![0]);
  });

  test("decodes a single-point line", () => {
    const points = decodePolyline("_p~iF~ps|U");
    expect(points).toHaveLength(1);
    expect(points[0]![0]).toBeCloseTo(38.5, 5);
  });
});

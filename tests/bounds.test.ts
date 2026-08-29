import { describe, expect, test } from "vitest";
import { boundsOf, focusCenter } from "@/lib/bounds";
import { SEED_CENTER } from "@/data/seed-tokyo";

/**
 * Live research can return any city, so the map has to follow the candidates
 * rather than stay where the seed dataset happens to be. Researching Lisbon and
 * being shown Tokyo with the markers off-screen reads as an empty result.
 */

const LISBON = [
  { lat: 38.7139, lng: -9.1394 },
  { lat: 38.6916, lng: -9.2159 },
  { lat: 38.7223, lng: -9.1393 },
];

describe("boundsOf", () => {
  test("spans every point given", () => {
    const bounds = boundsOf(LISBON);
    expect(bounds).toEqual({
      south: 38.6916,
      west: -9.2159,
      north: 38.7223,
      east: -9.1393,
    });
  });

  test("is null when there is nothing to fit", () => {
    expect(boundsOf([])).toBeNull();
  });

  test("survives a single point", () => {
    expect(boundsOf([LISBON[0]!])).toEqual({
      south: 38.7139,
      west: -9.1394,
      north: 38.7139,
      east: -9.1394,
    });
  });
});

describe("focusCenter", () => {
  test("centres on the candidates rather than the seed city", () => {
    const center = focusCenter(LISBON, SEED_CENTER);
    expect(center.lat).toBeCloseTo((38.6916 + 38.7223) / 2, 6);
    expect(center.lng).toBeCloseTo((-9.2159 + -9.1393) / 2, 6);
    expect(center.lng).toBeLessThan(0);
  });

  test("falls back to the given centre before any candidate exists", () => {
    expect(focusCenter([], SEED_CENTER)).toEqual(SEED_CENTER);
  });
});

import { describe, expect, test } from "vitest";
import { leastDetour, worthTheDetour } from "@/planner/meals";
import type { LatLng, Restaurant } from "@/types/workspace";

/**
 * A meal sits between two stops, so what matters is the detour it adds to the
 * journey — not how close it is to the stop before it. Measuring only the
 * previous stop sends the traveller backwards: a restaurant beside the morning
 * can be a long way from where the afternoon starts.
 */

function at(id: string, lat: number, lng: number): Restaurant {
  return {
    id, name: id, cuisine: [], location: { lat, lng },
    hoursByDate: {}, sources: [], confidence: 0.7,
  };
}

// A short east-west hop: Fisherman's Wharf to Lombard Street.
const before: LatLng = { lat: 37.8080, lng: -122.4177 };
const after: LatLng = { lat: 37.8021, lng: -122.4187 };

describe("leastDetour", () => {
  test("prefers a place between the two stops over one beside the first", () => {
    const between = at("between", 37.8050, -122.4180);
    // Closer to `before` than `between` is, but the wrong side of it entirely.
    const backwards = at("backwards", 37.8095, -122.4300);
    expect(leastDetour([backwards, between], before, after)!.id).toBe("between");
  });

  test("falls back to plain proximity when there is no next stop", () => {
    const near = at("near", 37.8082, -122.4179);
    const far = at("far", 37.7600, -122.4200);
    expect(leastDetour([far, near], before, null)!.id).toBe("near");
  });

  test("returns nothing for an empty list", () => {
    expect(leastDetour([], before, after)).toBeNull();
  });

  test("a place on the direct line adds almost no detour", () => {
    const onTheWay = at("on-the-way", 37.8050, -122.4182);
    const detour = at("detour", 37.8050, -122.4600);
    expect(leastDetour([detour, onTheWay], before, after)!.id).toBe("on-the-way");
  });

  test("is stable: the same options in another order give the same answer", () => {
    const a = at("a", 37.8050, -122.4180);
    const b = at("b", 37.8060, -122.4250);
    expect(leastDetour([a, b], before, after)!.id).toBe(
      leastDetour([b, a], before, after)!.id,
    );
  });
});

describe("how far a cuisine preference is worth going", () => {
  test("a preferred cuisine is not worth crossing the day for", () => {
    // The stop before and the stop after are a short hop apart. A matching
    // restaurant far off that line costs more than the preference is worth.
    const wrongWay = at("wrong-way", 37.7897, -122.4216);
    const onTheWay = at("on-the-way", 37.8050, -122.4180);
    expect(worthTheDetour(wrongWay, onTheWay, before, after)).toBe(false);
  });

  test("a preferred cuisine a short walk off the line is worth taking", () => {
    const slightlyOff = at("slightly-off", 37.8048, -122.4205);
    const onTheWay = at("on-the-way", 37.8050, -122.4180);
    expect(worthTheDetour(slightlyOff, onTheWay, before, after)).toBe(true);
  });

  test("a match already on the way is always worth it", () => {
    const same = at("same", 37.8050, -122.4180);
    expect(worthTheDetour(same, same, before, after)).toBe(true);
  });

  test("with nothing to compare against, the match stands", () => {
    const match = at("match", 37.7897, -122.4216);
    expect(worthTheDetour(match, null, before, after)).toBe(true);
  });
});

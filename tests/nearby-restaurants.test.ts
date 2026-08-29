import { describe, expect, test } from "vitest";
import { parseNearbyResponse, nearbyRequestBody } from "@/routing/nearbyRestaurants";
import { openDuring, toMinutes } from "@/planner/time";

/**
 * Restaurants found where the day actually is.
 *
 * Researching them up front means guessing where the traveller will be before
 * the day exists, so the pool is arbitrary relative to the route. Asking near
 * the midday stop, once that stop is known, is the same question asked at a
 * time when it has an answer.
 */

function place(over: Record<string, unknown> = {}) {
  return {
    id: "places/abc",
    displayName: { text: "Nopalito" },
    location: { latitude: 37.7745, longitude: -122.438 },
    primaryType: "mexican_restaurant",
    priceLevel: "PRICE_LEVEL_MODERATE",
    regularOpeningHours: {
      periods: [
        { open: { day: 6, hour: 11, minute: 30 }, close: { day: 6, hour: 21, minute: 30 } },
      ],
    },
    ...over,
  };
}

describe("the request", () => {
  test("asks around the stop, not around the city", () => {
    const body = nearbyRequestBody({ lat: 37.77, lng: -122.42 }, 800);
    expect(body.locationRestriction.circle.center).toEqual({
      latitude: 37.77,
      longitude: -122.42,
    });
    expect(body.locationRestriction.circle.radius).toBe(800);
  });

  test("asks only for places that serve food", () => {
    const body = nearbyRequestBody({ lat: 37.77, lng: -122.42 }, 800);
    expect(body.includedTypes).toContain("restaurant");
  });
});

describe("parsing", () => {
  test("reads a place into a restaurant", () => {
    const [restaurant] = parseNearbyResponse({ places: [place()] }, ["2026-09-12"]);
    expect(restaurant!.name).toBe("Nopalito");
    expect(restaurant!.location).toEqual({ lat: 37.7745, lng: -122.438 });
  });

  test("turns the place type into a cuisine a traveller would recognise", () => {
    const [restaurant] = parseNearbyResponse({ places: [place()] }, ["2026-09-12"]);
    expect(restaurant!.cuisine).toContain("mexican");
  });

  test("maps the price band onto the app's scale", () => {
    const [restaurant] = parseNearbyResponse({ places: [place()] }, ["2026-09-12"]);
    expect(restaurant!.priceLevel).toBe(2);
  });

  test("gives a stable id derived from the place, not its position in the list", () => {
    const a = parseNearbyResponse({ places: [place()] }, ["2026-09-12"])[0]!;
    const b = parseNearbyResponse({ places: [place()] }, ["2026-09-12"])[0]!;
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/\w/);
  });

  test("drops a place with no usable location", () => {
    const result = parseNearbyResponse({ places: [place({ location: undefined })] }, ["2026-09-12"]);
    expect(result).toEqual([]);
  });

  test("returns nothing for an empty or malformed answer", () => {
    expect(parseNearbyResponse({}, ["2026-09-12"])).toEqual([]);
    expect(parseNearbyResponse("nonsense", ["2026-09-12"])).toEqual([]);
  });

  test("marks hours unknown when the place did not publish any", () => {
    const [restaurant] = parseNearbyResponse(
      { places: [place({ regularOpeningHours: undefined })] },
      ["2026-09-12"],
    );
    expect(restaurant!.hoursByDate["2026-09-12"]).toEqual({ status: "unknown" });
  });

  test("resolves published hours onto the trip's own dates", () => {
    // 2026-09-12 is a Saturday, which is day 6 in Google's numbering.
    const [restaurant] = parseNearbyResponse({ places: [place()] }, ["2026-09-12"]);
    expect(restaurant!.hoursByDate["2026-09-12"]).toEqual({
      status: "open",
      open: "11:30",
      close: "21:30",
    });
  });
});

/**
 * Google publishes `periods` as the whole week's opening. A weekday it omits
 * is a day the place is shut, which is different from a place that published
 * nothing at all: the planner keeps unknown hours eligible and seats meals
 * against them, so calling a known closure "unknown" books a shut restaurant.
 */
describe("a published week", () => {
  test("a weekday the schedule omits is closed, not unknown", () => {
    // 2026-09-13 is a Sunday; the fixture publishes Saturday only.
    const [restaurant] = parseNearbyResponse({ places: [place()] }, ["2026-09-13"]);
    expect(restaurant!.hoursByDate["2026-09-13"]).toEqual({ status: "closed" });
  });

  test("keeps the whole day's service, not only the first sitting", () => {
    const split = place({
      regularOpeningHours: {
        periods: [
          { open: { day: 6, hour: 11, minute: 30 }, close: { day: 6, hour: 14, minute: 0 } },
          { open: { day: 6, hour: 18, minute: 0 }, close: { day: 6, hour: 22, minute: 0 } },
        ],
      },
    });
    const [restaurant] = parseNearbyResponse({ places: [split] }, ["2026-09-12"]);
    const hours = restaurant!.hoursByDate["2026-09-12"];

    expect(openDuring(hours, toMinutes("12:00"), toMinutes("13:00"))).toBe("open");
    // Dinner service is published too; losing it seats dinner somewhere worse.
    expect(openDuring(hours, toMinutes("19:00"), toMinutes("20:30"))).toBe("open");
    // The afternoon closure is real and must not be papered over.
    expect(openDuring(hours, toMinutes("15:00"), toMinutes("16:00"))).toBe("closed");
  });
});

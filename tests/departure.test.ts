import { describe, expect, test } from "vitest";
import { departureInstant } from "@/routing/departure";

/**
 * A transit answer is only true of the moment it was asked about.
 *
 * The itinerary is written in the destination's wall clock, and the provider
 * wants an instant. Turning one into the other needs the destination's zone,
 * including whichever side of a daylight-saving change the date falls on —
 * which is exactly the difference between the line a rider can catch and one
 * that is not running.
 */

describe("turning a destination's wall clock into an instant", () => {
  test("reads the clock in the destination's zone, not this machine's", () => {
    expect(departureInstant("2026-09-12", "09:30", "Asia/Tokyo")).toBe("2026-09-12T00:30:00Z");
  });

  test("uses the offset in force on that date", () => {
    // Los Angeles is UTC-7 in September and UTC-8 in January.
    expect(departureInstant("2026-09-12", "09:30", "America/Los_Angeles")).toBe(
      "2026-09-12T16:30:00Z",
    );
    expect(departureInstant("2026-01-12", "09:30", "America/Los_Angeles")).toBe(
      "2026-01-12T17:30:00Z",
    );
  });

  test("crosses the date line the right way", () => {
    expect(departureInstant("2026-09-12", "07:00", "Asia/Tokyo")).toBe("2026-09-11T22:00:00Z");
  });

  test("has no answer without a usable zone, date or clock", () => {
    expect(departureInstant("2026-09-12", "09:30", undefined)).toBeNull();
    expect(departureInstant("2026-09-12", "09:30", "Not/AZone")).toBeNull();
    expect(departureInstant("2026-09-12", "24:00", "Asia/Tokyo")).toBeNull();
    expect(departureInstant("12/09/2026", "09:30", "Asia/Tokyo")).toBeNull();
  });
});

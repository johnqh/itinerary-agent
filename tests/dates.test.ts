import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { isoDaysFromNow, toLocalIsoDate } from "@/lib/dates";

/**
 * Date defaults are a local-calendar concern. Serializing a locally advanced
 * Date through `toISOString()` shifts the answer by a day for most of the
 * world, so these run under two timezones on opposite sides of UTC.
 */
const originalTz = process.env.TZ;

describe("toLocalIsoDate", () => {
  test("formats the local calendar date, not the UTC one", () => {
    process.env.TZ = "Asia/Tokyo";
    // 00:30 in Tokyo is still the previous day in UTC.
    expect(toLocalIsoDate(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");

    process.env.TZ = "America/Los_Angeles";
    // 23:30 in Los Angeles is already the next day in UTC.
    expect(toLocalIsoDate(new Date(2026, 0, 1, 23, 30))).toBe("2026-01-01");
  });

  test("zero-pads single-digit months and days", () => {
    process.env.TZ = "UTC";
    expect(toLocalIsoDate(new Date(2026, 2, 8, 12, 0))).toBe("2026-03-08");
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });
});

describe("isoDaysFromNow", () => {
  beforeAll(() => {
    process.env.TZ = "Asia/Tokyo";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  test("advances the local calendar date east of UTC", () => {
    // 08:00 in Tokyo is 23:00 the previous day in UTC.
    const now = new Date(2026, 5, 10, 8, 0);
    expect(isoDaysFromNow(0, now)).toBe("2026-06-10");
    expect(isoDaysFromNow(14, now)).toBe("2026-06-24");
  });

  test("crosses a month boundary", () => {
    expect(isoDaysFromNow(2, new Date(2026, 5, 30, 1, 0))).toBe("2026-07-02");
  });
});

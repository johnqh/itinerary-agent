import { describe, expect, test } from "vitest";
import {
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  fitsInDay,
  inMealWindow,
  openDuring,
  toClock,
  toMinutes,
} from "@/planner/time";
import type { Hours } from "@/types/workspace";

describe("clock conversion", () => {
  test("round-trips a time through minutes and back", () => {
    expect(toClock(toMinutes("09:30"))).toBe("09:30");
  });

  test("pads single-digit hours and minutes", () => {
    expect(toClock(545)).toBe("09:05");
  });
});

describe("opening hours", () => {
  const open: Hours = { status: "open", open: "09:00", close: "17:00" };

  test("reports open when the whole visit fits inside opening hours", () => {
    expect(openDuring(open, toMinutes("10:00"), toMinutes("11:30"))).toBe("open");
  });

  test("reports closed when the visit would end after closing time", () => {
    expect(openDuring(open, toMinutes("16:30"), toMinutes("17:30"))).toBe(
      "closed",
    );
  });

  test("reports closed for a date the attraction is shut", () => {
    expect(openDuring({ status: "closed" }, 600, 700)).toBe("closed");
  });

  test("reports unknown rather than guessing when hours were never resolved", () => {
    expect(openDuring(undefined, 600, 700)).toBe("unknown");
    expect(openDuring({ status: "unknown" }, 600, 700)).toBe("unknown");
  });
});

describe("day window", () => {
  test("accepts a visit that ends exactly at the end of the day", () => {
    expect(fitsInDay(DAY_END_MINUTES - 60, 60)).toBe(true);
  });

  test("rejects a visit that would run past the end of the day", () => {
    expect(fitsInDay(DAY_END_MINUTES - 30, 60)).toBe(false);
  });

  test("rejects a visit starting before the day window opens", () => {
    expect(fitsInDay(DAY_START_MINUTES - 30, 60)).toBe(false);
  });
});

describe("meal windows", () => {
  test("12:30 is inside the lunch target window", () => {
    expect(inMealWindow("lunch", toMinutes("12:30"), "target")).toBe(true);
  });

  test("13:30 is outside the lunch target but inside the acceptable window", () => {
    expect(inMealWindow("lunch", toMinutes("13:30"), "target")).toBe(false);
    expect(inMealWindow("lunch", toMinutes("13:30"), "acceptable")).toBe(true);
  });

  test("15:00 is not a lunch time at all", () => {
    expect(inMealWindow("lunch", toMinutes("15:00"), "acceptable")).toBe(false);
  });

  test("18:30 is inside the dinner target window", () => {
    expect(inMealWindow("dinner", toMinutes("18:30"), "target")).toBe(true);
  });
});

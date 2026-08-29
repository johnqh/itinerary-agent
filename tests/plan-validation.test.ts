import { describe, expect, test } from "vitest";
import { validateAgentPlan } from "@/agent/planValidation";
import type {
  Attraction,
  ExclusionReason,
  PlanDay,
  Restaurant,
  TripRequest,
} from "@/types/workspace";

/**
 * The optimizer's output is agent-produced, so it is checked against the same
 * hard rules the local planner obeys. A schedule that violates one of these is
 * not a worse itinerary, it is an unfollowable one, and it must be rejected
 * rather than shown.
 */

const DATES = ["2026-09-12", "2026-09-13"];
const OPEN = { status: "open", open: "09:00", close: "19:00" } as const;

const attractions: Attraction[] = ["a1", "a2", "a3"].map((id, i) => ({
  id,
  name: `A${i}`,
  category: "museum",
  location: { lat: 35.7 + i * 0.01, lng: 139.7 + i * 0.01 },
  description: "",
  hoursByDate: Object.fromEntries(DATES.map((d) => [d, OPEN])),
  estimatedVisitMinutes: 60,
  ticketRequired: false,
  photoUrls: [],
  sources: [],
  confidence: 0.8,
}));

const restaurants: Restaurant[] = [
  {
    id: "r1",
    name: "R1",
    cuisine: ["japanese"],
    location: { lat: 35.705, lng: 139.705 },
    hoursByDate: Object.fromEntries(
      DATES.map((d) => [d, { status: "open", open: "09:00", close: "22:00" } as const]),
    ),
    sources: [],
    confidence: 0.7,
  },
];

const trip: TripRequest = {
  destination: "Testville",
  startDate: DATES[0]!,
  endDate: DATES[1]!,
  hasRentalCar: false,
  pace: "balanced",
  meals: { cuisines: [], strictness: "flexible" },
};

function day(overrides: Partial<PlanDay> = {}): PlanDay {
  return {
    date: DATES[0]!,
    isCarDay: false,
    items: [
      { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
      { kind: "meal", refId: "r1", meal: "lunch", startTime: "12:30", endTime: "13:30" },
    ],
    legs: [
      { fromIndex: 0, toIndex: 1, mode: "walk", durationMinutes: 10, distanceMeters: 800 },
    ],
    summary: "",
    ...overrides,
  };
}

/**
 * The trip runs two dates, so a complete answer covers both. The second day is
 * deliberately minimal: it exists so the schedules under test are complete
 * rather than because anything is asserted about it.
 */
function secondDay(overrides: Partial<PlanDay> = {}): PlanDay {
  return {
    date: DATES[1]!,
    isCarDay: false,
    items: [{ kind: "attraction", refId: "a2", startTime: "09:00", endTime: "10:00" }],
    legs: [],
    summary: "",
    ...overrides,
  };
}

/** Every attraction the days do not schedule, accounted for with a reason. */
function accountFor(days: PlanDay[]): ExclusionReason[] {
  const scheduled = new Set(
    days
      .flatMap((d) => d.items)
      .filter((i) => i.kind === "attraction")
      .map((i) => i.refId),
  );
  return attractions
    .filter((a) => !scheduled.has(a.id))
    .map((a) => ({ attractionId: a.id, reason: "Did not fit." }));
}

function check(days: PlanDay[], excluded: ExclusionReason[] = accountFor(days)) {
  return validateAgentPlan(days, { trip, dates: DATES, attractions, restaurants }, excluded);
}

describe("accepting a sound schedule", () => {
  test("accepts a day that breaks no rule", () => {
    expect(check([day(), secondDay()]).ok).toBe(true);
  });

  /**
   * A meal the data cannot seat is a degraded result the workspace names, not
   * an unfollowable day. Rejecting the whole schedule over it would throw away
   * a usable itinerary and contradict the unplaced-meal report.
   */
  test("accepts a day that seats no dinner, which is reported rather than rejected", () => {
    const result = check([day(), secondDay()]);
    expect(result.ok).toBe(true);
    expect(day().items.some((i) => i.meal === "dinner")).toBe(false);
  });
});

describe("rejecting an unfollowable schedule", () => {
  test("rejects an attraction scheduled on two days", () => {
    const result = check([day(), day({ date: DATES[1]! })]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/more than once|twice/i);
  });

  test("rejects an item that runs past the end of the day", () => {
    const result = check([
      day({
        items: [{ kind: "attraction", refId: "a1", startTime: "20:00", endTime: "21:30" }],
        legs: [],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/day window/i);
  });

  test("rejects an attraction scheduled while it is closed", () => {
    const shut = attractions.map((a) =>
      a.id === "a1"
        ? { ...a, hoursByDate: { ...a.hoursByDate, [DATES[0]!]: { status: "closed" as const } } }
        : a,
    );
    const result = validateAgentPlan(
      [day(), secondDay()],
      { trip, dates: DATES, attractions: shut, restaurants },
      [{ attractionId: "a3", reason: "Did not fit." }],
    );
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/closed/i);
  });

  test("accepts a transit leg with a single change", () => {
    // One change is within the rule, so a schedule using it is followable.
    const result = check([
      day({
        legs: [
          {
            fromIndex: 0,
            toIndex: 1,
            mode: "transit",
            durationMinutes: 10,
            distanceMeters: 800,
            transferCount: 1,
          },
        ],
      }),
    ]);
    expect(result.violations.join(" ")).not.toMatch(/change|transfer/i);
  });

  test("rejects a transit leg that needs more changes than allowed", () => {
    const result = check([
      day({
        legs: [
          {
            fromIndex: 0,
            toIndex: 1,
            mode: "transit",
            durationMinutes: 10,
            distanceMeters: 800,
            transferCount: 2,
          },
        ],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/changes; at most/i);
  });

  test("rejects a car day that also uses transit", () => {
    const result = check([
      day({
        isCarDay: true,
        legs: [
          {
            fromIndex: 0,
            toIndex: 1,
            mode: "transit",
            durationMinutes: 10,
            distanceMeters: 800,
            transferCount: 0,
          },
        ],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/car day/i);
  });

  test("rejects items that are not in chronological order", () => {
    const result = check([
      day({
        items: [
          { kind: "attraction", refId: "a1", startTime: "14:00", endTime: "15:00" },
          { kind: "meal", refId: "r1", meal: "lunch", startTime: "12:30", endTime: "13:30" },
        ],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/order/i);
  });

  test("rejects a leg that cannot fit in the gap between its stops", () => {
    // 10:00 to 12:30 is 150 minutes; a 200-minute leg does not fit.
    const result = check([
      day({
        legs: [
          { fromIndex: 0, toIndex: 1, mode: "car", durationMinutes: 200, distanceMeters: 90000 },
        ],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/travel time|does not fit/i);
  });

  test("rejects a reference to something that was never discovered", () => {
    const result = check([
      day({
        items: [{ kind: "attraction", refId: "ghost", startTime: "09:00", endTime: "10:00" }],
        legs: [],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/unknown|not discovered/i);
  });

  test("rejects a date that is not part of the trip", () => {
    const result = check([day({ date: "2027-01-01" })]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/date/i);
  });

  test("reports every violation, not just the first", () => {
    const result = check([
      day({
        items: [{ kind: "attraction", refId: "ghost", startTime: "22:00", endTime: "23:00" }],
        legs: [],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(1);
  });
});

describe("covering every date of the trip", () => {
  test("rejects a schedule that leaves one of the trip's dates unplanned", () => {
    const result = check([day()]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/no day for 2026-09-13/i);
  });

  test("rejects an empty schedule outright", () => {
    const result = check([]);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(1);
  });

  test("rejects the same date planned twice", () => {
    const result = check([day(), day({ items: [], legs: [] }), secondDay()]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/2026-09-12 appears 2 times/i);
  });
});

describe("reading the clock the scheduler wrote", () => {
  test("rejects a minute field that is not a minute", () => {
    const result = check([
      day({
        items: [{ kind: "attraction", refId: "a1", startTime: "12:60", endTime: "13:30" }],
        legs: [],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/usable start and end time/i);
  });

  test("rejects an unpadded clock rather than guessing what it meant", () => {
    const result = check([
      day({
        items: [{ kind: "attraction", refId: "a1", startTime: "9:5", endTime: "10:00" }],
        legs: [],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/usable start and end time/i);
  });
});

describe("meals", () => {
  test("rejects a meal that is neither lunch nor dinner", () => {
    const result = check([
      day({
        items: [
          { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
          { kind: "meal", refId: "r1", startTime: "12:30", endTime: "13:30" },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/neither lunch nor dinner/i);
  });

  test("rejects dinner seated at lunchtime", () => {
    const result = check([
      day({
        items: [
          { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
          { kind: "meal", refId: "r1", meal: "dinner", startTime: "12:30", endTime: "13:30" },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/outside the dinner window/i);
  });

  test("rejects two lunches on the same day", () => {
    const result = check([
      day({
        items: [
          { kind: "meal", refId: "r1", meal: "lunch", startTime: "11:30", endTime: "12:15" },
          { kind: "meal", refId: "r1", meal: "lunch", startTime: "12:30", endTime: "13:30" },
        ],
        legs: [
          { fromIndex: 0, toIndex: 1, mode: "walk", durationMinutes: 0, distanceMeters: 0 },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/seats lunch twice/i);
  });

  test("rejects a meal at a restaurant that is closed then", () => {
    const shut: Restaurant[] = restaurants.map((r) => ({
      ...r,
      hoursByDate: { ...r.hoursByDate, [DATES[0]!]: { status: "closed" as const } },
    }));
    const result = validateAgentPlan(
      [day(), secondDay()],
      { trip, dates: DATES, attractions, restaurants: shut },
      [{ attractionId: "a3", reason: "Did not fit." }],
    );
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/closed/i);
  });
});

describe("visit durations", () => {
  test("rejects an attraction given less time than its visit takes", () => {
    const result = check([
      day({
        items: [{ kind: "attraction", refId: "a1", startTime: "09:00", endTime: "09:01" }],
        legs: [],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/needs 60 min/i);
  });
});

describe("transport this run has no data for", () => {
  test("rejects a transit leg even when it needs no transfer", () => {
    const result = check([
      day({
        legs: [
          {
            fromIndex: 0,
            toIndex: 1,
            mode: "transit",
            durationMinutes: 10,
            distanceMeters: 800,
            transferCount: 0,
          },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/no transit data was retrieved/i);
  });

  test("rejects a car day on a trip with no rental car", () => {
    const result = check([day({ isCarDay: true }), secondDay()]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/no rental car/i);
  });

  test("rejects a car leg on a day that is not a car day", () => {
    const result = check([
      day({
        legs: [
          { fromIndex: 0, toIndex: 1, mode: "car", durationMinutes: 10, distanceMeters: 800 },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/is not a car day/i);
  });
});

describe("checking travel against the coordinates rather than the solver", () => {
  /** a1 to a3 is about 2.9 km: too far to walk, so the model picks rideshare. */
  function farDay(overrides: Partial<PlanDay> = {}): PlanDay {
    return day({
      items: [
        { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
        { kind: "attraction", refId: "a3", startTime: "10:30", endTime: "11:30" },
      ],
      legs: [
        {
          fromIndex: 0,
          toIndex: 1,
          mode: "rideshare",
          durationMinutes: 14,
          distanceMeters: 3726,
        },
      ],
      ...overrides,
    });
  }

  test("accepts a leg that reserves the journey the coordinates imply", () => {
    expect(check([farDay(), secondDay()]).ok).toBe(true);
  });

  test("rejects a zero-minute leg between stops that are kilometres apart", () => {
    const result = check([
      farDay({
        legs: [
          { fromIndex: 0, toIndex: 1, mode: "rideshare", durationMinutes: 0, distanceMeters: 0 },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/understates/i);
  });

  test("rejects a mode the travel model would not have chosen", () => {
    const result = check([
      farDay({
        legs: [
          { fromIndex: 0, toIndex: 1, mode: "walk", durationMinutes: 40, distanceMeters: 2866 },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/by walk where the travel model gives rideshare/i);
  });

  test("rejects consecutive stops with no leg between them", () => {
    const result = check([farDay({ legs: [] }), secondDay()]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/no leg/i);
  });

  test("rejects two legs claiming the same pair of stops", () => {
    const result = check([
      farDay({
        legs: [
          {
            fromIndex: 0,
            toIndex: 1,
            mode: "rideshare",
            durationMinutes: 14,
            distanceMeters: 3726,
          },
          {
            fromIndex: 0,
            toIndex: 1,
            mode: "rideshare",
            durationMinutes: 14,
            distanceMeters: 3726,
          },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/2 legs/i);
  });

  test("rejects a leg that skips over a stop", () => {
    const result = check([
      day({
        items: [
          { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
          { kind: "meal", refId: "r1", meal: "lunch", startTime: "12:30", endTime: "13:30" },
          { kind: "attraction", refId: "a3", startTime: "15:00", endTime: "16:00" },
        ],
        legs: [
          { fromIndex: 0, toIndex: 2, mode: "walk", durationMinutes: 10, distanceMeters: 800 },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/consecutive stops/i);
  });
});

describe("accounting for every attraction", () => {
  test("rejects an attraction that is neither scheduled nor excluded", () => {
    const result = check([day(), secondDay()], []);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/neither scheduled nor/i);
  });

  test("rejects an attraction that is both scheduled and excluded", () => {
    const result = check(
      [day(), secondDay()],
      [
        { attractionId: "a1", reason: "Did not fit." },
        { attractionId: "a3", reason: "Did not fit." },
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/both scheduled and excluded/i);
  });

  test("rejects an exclusion naming something that was never discovered", () => {
    const result = check(
      [day(), secondDay()],
      [
        { attractionId: "a3", reason: "Did not fit." },
        { attractionId: "ghost", reason: "Did not fit." },
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/excluded but was never discovered/i);
  });

  test("rejects the same attraction excluded twice", () => {
    const result = check(
      [day(), secondDay()],
      [
        { attractionId: "a3", reason: "Did not fit." },
        { attractionId: "a3", reason: "Also did not fit." },
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/excluded 2 times/i);
  });

  test("rejects an exclusion with no reason", () => {
    const result = check([day(), secondDay()], [{ attractionId: "a3", reason: "  " }]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/no reason/i);
  });
});

/**
 * Under `strong` strictness the deterministic planner treats cuisine as a
 * constraint and reports the meal unplaced rather than seating the wrong one.
 * The validator has to agree, or the optimizer can seat a meal the planner
 * would have refused and, by seating it, silence the missing-meal warning.
 */
describe("the strong cuisine preference", () => {
  function checkMeals(days: PlanDay[], meals: TripRequest["meals"]) {
    return validateAgentPlan(
      days,
      { trip: { ...trip, meals }, dates: DATES, attractions, restaurants },
      accountFor(days),
    );
  }

  test("rejects a meal at a restaurant serving none of the requested cuisines", () => {
    const result = checkMeals([day(), secondDay()], {
      cuisines: ["italian"],
      strictness: "strong",
    });
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/italian/i);
  });

  test("accepts a meal whose cuisine matches, whatever the letter case", () => {
    const result = checkMeals([day(), secondDay()], {
      cuisines: ["Japanese"],
      strictness: "strong",
    });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("leaves a weaker strictness free to settle for another cuisine", () => {
    const result = checkMeals([day(), secondDay()], {
      cuisines: ["italian"],
      strictness: "prefer",
    });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

/**
 * A meal is a sitting, not a checkbox. Without a floor the scheduler can seat a
 * one-minute lunch, clear the missing-meal warning it would otherwise have
 * earned, and hand the rest of the meal block back to score-earning stops.
 */
describe("meal sittings", () => {
  test("rejects a one-minute lunch", () => {
    const result = check([
      day({
        items: [
          { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
          { kind: "meal", refId: "r1", meal: "lunch", startTime: "12:30", endTime: "12:31" },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/60 min/i);
  });

  test("rejects a dinner shorter than a dinner takes", () => {
    const result = check([
      day({
        items: [
          { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
          { kind: "meal", refId: "r1", meal: "dinner", startTime: "18:00", endTime: "19:00" },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/75 min/i);
  });

  test("accepts a sitting longer than the minimum", () => {
    const result = check([
      day({
        items: [
          { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
          { kind: "meal", refId: "r1", meal: "lunch", startTime: "12:00", endTime: "13:30" },
        ],
      }),
      secondDay(),
    ]);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

/**
 * The timeline renders a leg's distance verbatim, so an unchecked one is a
 * number the traveller reads as a fact. The coordinates put a floor under it.
 */
describe("checking the distance a leg claims", () => {
  function farDay(overrides: Partial<PlanDay> = {}): PlanDay {
    return day({
      items: [
        { kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" },
        { kind: "attraction", refId: "a3", startTime: "10:30", endTime: "11:30" },
      ],
      legs: [
        {
          fromIndex: 0,
          toIndex: 1,
          mode: "rideshare",
          durationMinutes: 14,
          distanceMeters: 3726,
        },
      ],
      ...overrides,
    });
  }

  test("rejects a multi-kilometre leg reported as no distance at all", () => {
    const result = check([
      farDay({
        legs: [
          {
            fromIndex: 0,
            toIndex: 1,
            mode: "rideshare",
            durationMinutes: 14,
            distanceMeters: 0,
          },
        ],
      }),
      secondDay(),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/distance/i);
  });

  test("accepts a distance at or above the straight line between the stops", () => {
    const result = check([farDay(), secondDay()]);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

import { describe, expect, test } from "vitest";
import {
  SESSION_SCHEMA_VERSION,
  loadSession,
  saveSession,
  type StorageLike,
} from "@/agent/sessionStore";
import type { Attraction, Plan, Restaurant, Workspace } from "@/types/workspace";

/**
 * A trip is long-lived work. Losing a rated candidate list to a page reload is
 * the difference between a tool someone trusts and one they re-do. Storage is
 * also the least reliable thing in a browser, so every failure here has to
 * degrade to "start fresh" rather than throw.
 */

function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function hostileStorage(): StorageLike {
  return {
    getItem() {
      throw new Error("access denied");
    },
    setItem() {
      throw new Error("quota exceeded");
    },
    removeItem() {
      throw new Error("access denied");
    },
  };
}

const attraction: Attraction = {
  id: "sensoji",
  name: "Sensō-ji",
  category: "temple",
  location: { lat: 35.7148, lng: 139.7967 },
  description: "Tokyo's oldest temple.",
  hoursByDate: { "2026-09-12": { status: "open", open: "06:00", close: "17:00" } },
  estimatedVisitMinutes: 75,
  ticketRequired: false,
  photoUrls: [],
  sources: [{ url: "https://www.senso-ji.jp/" }],
  confidence: 0.9,
};

const restaurant: Restaurant = {
  id: "daikokuya",
  name: "Daikokuya",
  cuisine: ["tempura"],
  location: { lat: 35.7118, lng: 139.7955 },
  hoursByDate: { "2026-09-12": { status: "open", open: "11:00", close: "20:30" } },
  sources: [{ url: "https://tempura.co.jp/" }],
  confidence: 0.8,
};

const plan: Plan = {
  id: "plan-1",
  version: 2,
  days: [
    {
      date: "2026-09-12",
      isCarDay: false,
      items: [
        { kind: "attraction", refId: "sensoji", startTime: "09:00", endTime: "10:15" },
      ],
      legs: [],
      summary: "Asakusa morning.",
    },
  ],
  excludedAttractionIds: [],
  summary: "One day in Tokyo.",
  diagnostics: {
    considered: 1,
    included: 1,
    excluded: [],
    unplacedMeals: [],
    routeCalls: 0,
    cacheHits: 0,
    transitAccepted: 0,
    transitRejected: 0,
    attractionMinutes: 75,
    transportMinutes: 0,
    score: 3,
  },
};

/**
 * A traveller at the rating step. The candidates are not decoration: the
 * rating screen is only ever reached by finishing discovery, so a stored
 * "rating" with nothing to rate describes a run that never happened.
 */
const workspace: Workspace = {
  phase: "rating",
  trip: {
    destination: "Tokyo, Japan",
    startDate: "2026-09-12",
    endDate: "2026-09-13",
    hasRentalCar: false,
    pace: "balanced",
    meals: { cuisines: ["japanese"], strictness: "prefer" },
  },
  sessionId: "sess-1",
  restoredAt: null,
  attractions: [attraction],
  restaurants: [restaurant],
  ratings: { sensoji: 4 },
  plan: null,
  progress: null,
  degraded: { discovery: null, routing: null, optimizer: null, meals: null, map: null },
};

/** What a traveller who has actually reached a plan has in hand. */
const plannedWorkspace: Workspace = { ...workspace, phase: "ready", plan };

const NOW = new Date("2026-09-01T12:00:00Z");

describe("round trip", () => {
  test("restores a saved workspace", () => {
    const storage = memoryStorage();
    saveSession(storage, workspace, { live: true, now: NOW });
    const restored = loadSession(storage, NOW);
    expect(restored?.trip.destination).toBe("Tokyo, Japan");
    expect(restored?.ratings).toEqual({ sensoji: 4 });
    expect(restored?.sessionId).toBe("sess-1");
    expect(restored?.live).toBe(true);
  });

  test("keeps the phase the traveller had reached", () => {
    const storage = memoryStorage();
    saveSession(storage, workspace, { live: false, now: NOW });
    expect(loadSession(storage, NOW)?.phase).toBe("rating");
  });

  test("restores the candidates and the plan a traveller had reached", () => {
    const storage = memoryStorage();
    saveSession(storage, plannedWorkspace, { live: true, now: NOW });
    const restored = loadSession(storage, NOW);
    expect(restored?.phase).toBe("ready");
    expect(restored?.attractions).toEqual([attraction]);
    expect(restored?.restaurants).toEqual([restaurant]);
    expect(restored?.plan).toEqual(plan);
  });

  /**
   * Section 4.8: a degraded mode is always named. The notices describe the
   * candidates and the plan being restored, so dropping them would show a
   * reloaded traveller a seed-data itinerary of straight-line estimates with
   * nothing on screen saying so — silent degradation by way of a refresh.
   */
  test("restores the degraded modes the plan on screen was built under", () => {
    const storage = memoryStorage();
    saveSession(
      storage,
      {
        ...plannedWorkspace,
        degraded: {
          discovery: "Offline seed dataset for Tokyo, Japan.",
          routing: "Travel times are straight-line estimates.",
          optimizer: "Scheduled by the local greedy builder.",
          meals: null,
          map: null,
        },
      },
      { live: false, now: NOW },
    );
    const restored = loadSession(storage, NOW);
    expect(restored?.degraded.discovery).toBe("Offline seed dataset for Tokyo, Japan.");
    expect(restored?.degraded.routing).toBe("Travel times are straight-line estimates.");
    expect(restored?.degraded.optimizer).toBe("Scheduled by the local greedy builder.");
    expect(restored?.degraded.meals).toBeNull();
  });

  test("saves nothing for a workspace with no trip yet", () => {
    const storage = memoryStorage();
    saveSession(storage, { ...workspace, trip: null }, { live: false, now: NOW });
    expect(loadSession(storage, NOW)).toBeNull();
  });
});

describe("refusing unusable records", () => {
  test("returns null when nothing was ever saved", () => {
    expect(loadSession(memoryStorage(), NOW)).toBeNull();
  });

  test("returns null for a corrupt record rather than throwing", () => {
    const storage = memoryStorage({ "itinerary-agent.session": "{not json" });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("ignores a record written by a different schema version", () => {
    const storage = memoryStorage();
    saveSession(storage, workspace, { live: false, now: NOW });
    const raw = JSON.parse(storage.getItem("itinerary-agent.session")!);
    raw.version = SESSION_SCHEMA_VERSION + 1;
    storage.setItem("itinerary-agent.session", JSON.stringify(raw));
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("ignores a record whose trip is missing required fields", () => {
    const storage = memoryStorage();
    saveSession(storage, workspace, { live: false, now: NOW });
    const raw = JSON.parse(storage.getItem("itinerary-agent.session")!);
    delete raw.trip.destination;
    storage.setItem("itinerary-agent.session", JSON.stringify(raw));
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("expires a record that is too old to still be the trip in hand", () => {
    const storage = memoryStorage();
    saveSession(storage, workspace, { live: false, now: NOW });
    const muchLater = new Date("2026-10-15T12:00:00Z");
    expect(loadSession(storage, muchLater)).toBeNull();
  });
});

/**
 * A restored record is handed straight to the renderer and the planner. Storage
 * is writable by anything on the origin and survives across releases, so a
 * record that does not hold real places, a real plan, or real ratings has to be
 * refused here rather than crash the first paint or quietly re-plan the trip
 * against values the traveller never chose.
 */
describe("refusing records that would crash or mislead the workspace", () => {
  function tamper(mutate: (raw: Record<string, never>) => void): StorageLike {
    const storage = memoryStorage();
    saveSession(storage, workspace, { live: false, now: NOW });
    const raw = JSON.parse(storage.getItem("itinerary-agent.session")!);
    mutate(raw);
    storage.setItem("itinerary-agent.session", JSON.stringify(raw));
    return storage;
  }

  test("rejects a record whose restaurants are not restaurants", () => {
    const storage = tamper((raw) => {
      raw.restaurants = [null] as never;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("rejects a record whose attractions are missing their fields", () => {
    const storage = tamper((raw) => {
      raw.attractions = [{ id: "sensoji" }] as never;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("rejects a record whose plan has no days", () => {
    const storage = tamper((raw) => {
      raw.plan = { id: "p1", version: 1 } as never;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("rejects a record whose ratings fall outside the rating scale", () => {
    const storage = tamper((raw) => {
      raw.ratings = { sensoji: 9 } as never;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("rejects a record whose phase is not a phase", () => {
    const storage = tamper((raw) => {
      raw.phase = "elsewhere" as never;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  // `RestaurantPanel` renders this as `"¥".repeat(priceLevel)`, which throws
  // outright on a negative number.
  test("rejects a record whose price level is off the scale", () => {
    const storage = tamper((raw) => {
      raw.restaurants = [{ ...restaurant, priceLevel: -1 }] as never;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  // `toMinutes` is arithmetic over strings this codebase produced; a stored
  // clock has to be a real one before the planner does time maths on it.
  test("rejects a record whose opening hours are not real clocks", () => {
    const storage = tamper((raw) => {
      raw.attractions = [
        { ...attraction, hoursByDate: { "2026-09-12": { status: "open", open: "garbage", close: "17:00" } } },
      ] as never;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("rejects a record whose opening hours are a plausible non-time", () => {
    const storage = tamper((raw) => {
      raw.restaurants = [
        { ...restaurant, hoursByDate: { "2026-09-12": { status: "open", open: "11:00", close: "24:99" } } },
      ] as never;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("rejects a record whose confidence is off the 0..1 scale", () => {
    const storage = tamper((raw) => {
      raw.attractions = [{ ...attraction, confidence: 42 }] as never;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("rejects a record whose degraded notices are not notices", () => {
    const storage = tamper((raw) => {
      raw.degraded = { discovery: 12 } as never;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });

  test("rejects a record with no rental-car choice rather than guessing one", () => {
    const storage = tamper((raw) => {
      delete (raw.trip as unknown as Record<string, unknown>).hasRentalCar;
    });
    expect(loadSession(storage, NOW)).toBeNull();
  });
});

/**
 * A phase is a claim about what the traveller can do next, so it has to agree
 * with the data behind it. A screen offering a control that cannot work, or
 * offering none at all, is worse than the setup form.
 */
describe("refusing records whose phase does not match their data", () => {
  function store(record: Partial<Record<string, unknown>>): StorageLike {
    const storage = memoryStorage();
    saveSession(storage, workspace, { live: false, now: NOW });
    const raw = JSON.parse(storage.getItem("itinerary-agent.session")!);
    storage.setItem("itinerary-agent.session", JSON.stringify({ ...raw, ...record }));
    return storage;
  }

  test("lands a ready trip with no plan back on the rating step", () => {
    expect(loadSession(store({ phase: "ready", plan: null }), NOW)?.phase).toBe("rating");
  });

  test("refuses a trip that never got past the setup form", () => {
    expect(loadSession(store({ phase: "setup", attractions: [] }), NOW)).toBeNull();
  });

  test("refuses a rating step with nothing to rate", () => {
    expect(loadSession(store({ attractions: [] }), NOW)).toBeNull();
  });

  test("refuses discovery that never finished", () => {
    expect(
      loadSession(store({ phase: "discovering", attractions: [] }), NOW),
    ).toBeNull();
  });

  test("lands an interrupted planning run back on the rating step", () => {
    expect(loadSession(store({ phase: "planning" }), NOW)?.phase).toBe("rating");
  });
});

describe("hostile storage", () => {
  test("saving never throws when storage refuses to write", () => {
    expect(() => saveSession(hostileStorage(), workspace, { live: false, now: NOW })).not.toThrow();
  });

  test("loading never throws when storage refuses to read", () => {
    expect(loadSession(hostileStorage(), NOW)).toBeNull();
  });
});

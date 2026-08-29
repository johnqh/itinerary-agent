import { describe, expect, test } from "vitest";
import {
  SESSION_SCHEMA_VERSION,
  loadSession,
  saveSession,
  type StorageLike,
} from "@/agent/sessionStore";
import type { Workspace } from "@/types/workspace";

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
  attractions: [],
  restaurants: [],
  ratings: { sensoji: 4 },
  plan: null,
  progress: null,
  degraded: { discovery: null, routing: null, optimizer: null, meals: null, map: null },
};

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

describe("hostile storage", () => {
  test("saving never throws when storage refuses to write", () => {
    expect(() => saveSession(hostileStorage(), workspace, { live: false, now: NOW })).not.toThrow();
  });

  test("loading never throws when storage refuses to read", () => {
    expect(loadSession(hostileStorage(), NOW)).toBeNull();
  });
});

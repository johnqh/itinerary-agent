import { describe, expect, test } from "vitest";
import { buildPlan } from "@/planner/build";
import type {
  Attraction,
  MealStrictness,
  Restaurant,
  TripRequest,
} from "@/types/workspace";

/**
 * Meals are a stated planning constraint, not a garnish: a day owes the
 * traveller one lunch and one dinner. When the data cannot supply one, the plan
 * has to say so rather than quietly hand back a day with no lunch in it.
 */

const DATES = ["2026-09-01"];
const OPEN = { status: "open", open: "08:00", close: "22:00" } as const;
const hours = Object.fromEntries(DATES.map((d) => [d, OPEN]));

const attractions: Attraction[] = Array.from({ length: 4 }, (_, i) => ({
  id: `a${i}`,
  name: `Attraction ${i}`,
  category: "museum",
  location: { lat: 35.7 + i * 0.002, lng: 139.77 + i * 0.002 },
  description: "",
  hoursByDate: { ...hours },
  estimatedVisitMinutes: 60,
  ticketRequired: false,
  photoUrls: [],
  sources: [],
  confidence: 0.8,
}));

function restaurant(
  id: string,
  lat: number,
  lng: number,
  cuisine: string[],
): Restaurant {
  return {
    id,
    name: `Restaurant ${id}`,
    cuisine,
    location: { lat, lng },
    hoursByDate: { ...hours },
    sources: [],
    confidence: 0.7,
  };
}

function tripWith(
  meals: { cuisines: string[]; strictness: MealStrictness; notes?: string },
): TripRequest {
  return {
    destination: "Testville",
    startDate: DATES[0]!,
    endDate: DATES[0]!,
    hasRentalCar: false,
    pace: "balanced",
    meals,
  };
}

describe("no restaurant is available at all", () => {
  const plan = buildPlan({
    trip: tripWith({ cuisines: [], strictness: "flexible" }),
    attractions,
    restaurants: [],
    ratings: {},
  });

  test("records both missing meals with a reason", () => {
    const unplaced = plan.diagnostics.unplacedMeals;
    expect(unplaced.map((m) => m.meal).sort()).toEqual(["dinner", "lunch"]);
    for (const entry of unplaced) {
      expect(entry.date).toBe(DATES[0]);
      expect(entry.reason).toBeTruthy();
    }
  });

  test("does not pretend the day has meals in its summary", () => {
    expect(plan.days[0]!.summary).not.toMatch(/with lunch and dinner/);
  });
});

describe("only a restaurant that is shut at mealtimes", () => {
  const breakfastOnly: Restaurant = {
    ...restaurant("r-breakfast", 35.7, 139.77, ["local"]),
    hoursByDate: { [DATES[0]!]: { status: "open", open: "06:00", close: "10:00" } },
  };

  const plan = buildPlan({
    trip: tripWith({ cuisines: [], strictness: "flexible" }),
    attractions,
    restaurants: [breakfastOnly],
    ratings: {},
  });

  test("leaves the meal unplaced rather than seating it at a shut restaurant", () => {
    expect(plan.diagnostics.unplacedMeals.length).toBe(2);
    expect(plan.days[0]!.items.filter((i) => i.kind === "meal")).toHaveLength(0);
  });
});

describe("meal strictness", () => {
  // The nearest restaurant does not match; the nearest match is a short drive
  // away. Each cuisine has a second, clearly more distant option so that "the
  // closest one" is never a coin flip.
  const near = restaurant("r-near", 35.702, 139.772, ["steakhouse"]);
  const nearAlt = restaurant("r-near-2", 35.69, 139.76, ["steakhouse"]);
  const far = restaurant("r-far", 35.72, 139.79, ["vegan"]);
  const farAlt = restaurant("r-far-2", 35.73, 139.8, ["vegan"]);
  const restaurants = [near, nearAlt, far, farAlt];

  function lunchFor(strictness: MealStrictness) {
    const plan = buildPlan({
      trip: tripWith({ cuisines: ["vegan"], strictness }),
      attractions,
      restaurants,
      ratings: {},
    });
    return {
      plan,
      lunch: plan.days[0]!.items.find((i) => i.kind === "meal" && i.meal === "lunch"),
    };
  }

  test("flexible takes the nearest open restaurant and ignores cuisine", () => {
    const { lunch } = lunchFor("flexible");
    expect(lunch?.refId).toBe("r-near");
  });

  test("prefer detours to a matching cuisine when one is open", () => {
    const { lunch } = lunchFor("prefer");
    expect(lunch?.refId).toBe("r-far");
  });

  test("strong takes only a matching cuisine", () => {
    const { lunch } = lunchFor("strong");
    expect(lunch?.refId).toBe("r-far");
  });
});

describe("meal strictness when nothing matches", () => {
  const restaurants = [
    restaurant("r-a", 35.702, 139.772, ["steakhouse"]),
    restaurant("r-b", 35.69, 139.76, ["steakhouse"]),
  ];

  test("prefer falls back to an open restaurant and says the cuisine was missed", () => {
    const plan = buildPlan({
      trip: tripWith({ cuisines: ["vegan"], strictness: "prefer" }),
      attractions,
      restaurants,
      ratings: {},
    });
    const lunch = plan.days[0]!.items.find((i) => i.kind === "meal" && i.meal === "lunch");
    expect(lunch?.refId).toBe("r-a");
    expect(lunch?.notes).toMatch(/vegan/i);
    expect(plan.diagnostics.unplacedMeals).toHaveLength(0);
  });

  test("strong leaves the meal unplaced and names the constraint", () => {
    const plan = buildPlan({
      trip: tripWith({ cuisines: ["vegan"], strictness: "strong" }),
      attractions,
      restaurants,
      ratings: {},
    });
    expect(plan.days[0]!.items.filter((i) => i.kind === "meal")).toHaveLength(0);
    expect(plan.diagnostics.unplacedMeals).toHaveLength(2);
    expect(plan.diagnostics.unplacedMeals[0]!.reason).toMatch(/vegan/i);
  });
});

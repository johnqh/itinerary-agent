import type { Attraction, Rating, Restaurant, TripRequest } from "@/types/workspace";
import { walkThresholdMinutes } from "@/planner/transport";

/**
 * The scheduling brief.
 *
 * Scheduling is a time-windowed routing problem, which is exactly the kind of
 * thing language models are bad at and code is good at. So the agent is not
 * asked for an itinerary: it is asked to write a solver, run it, and report
 * what the solver printed. The rules below are the ones its code must encode.
 *
 * Coordinates are handed over raw and the distances are computed in the
 * sandbox. That keeps the payload small and puts the arithmetic somewhere it
 * can be checked, rather than in a model's head.
 */

export interface OptimizerProblem {
  dates: string[];
  pace: TripRequest["pace"];
  isCarTrip: boolean;
  dayWindow: { start: string; end: string };
  meals: {
    cuisines: string[];
    strictness: string;
    lunch: { start: string; end: string };
    dinner: { start: string; end: string };
  };
  travelModel: {
    walkKmh: number;
    driveKmh: number;
    driveOverheadMinutes: number;
    roadFactor: number;
    walkThresholdMinutes: number;
  };
  attractions: {
    id: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
    visitMinutes: number;
    rating: Rating | null;
    hoursByDate: Record<string, { status: string; open?: string; close?: string }>;
  }[];
  restaurants: {
    id: string;
    name: string;
    cuisine: string[];
    lat: number;
    lng: number;
    hoursByDate: Record<string, { status: string; open?: string; close?: string }>;
  }[];
}

export function buildProblem(
  trip: TripRequest,
  dates: string[],
  attractions: Attraction[],
  restaurants: Restaurant[],
  ratings: Record<string, Rating>,
): OptimizerProblem {
  return {
    dates,
    pace: trip.pace,
    isCarTrip: trip.hasRentalCar,
    dayWindow: { start: "09:00", end: "20:30" },
    meals: {
      cuisines: trip.meals.cuisines,
      strictness: trip.meals.strictness,
      lunch: { start: "11:30", end: "13:45" },
      dinner: { start: "17:30", end: "20:15" },
    },
    travelModel: {
      walkKmh: 4.5,
      driveKmh: 20,
      driveOverheadMinutes: 3,
      roadFactor: 1.3,
      walkThresholdMinutes: walkThresholdMinutes(trip.pace),
    },
    attractions: attractions.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      lat: a.location.lat,
      lng: a.location.lng,
      visitMinutes: a.estimatedVisitMinutes,
      rating: ratings[a.id] ?? null,
      hoursByDate: a.hoursByDate,
    })),
    restaurants: restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      cuisine: r.cuisine,
      lat: r.location.lat,
      lng: r.location.lng,
      hoursByDate: r.hoursByDate,
    })),
  };
}

export const OPTIMIZER_INSTRUCTIONS = `
You schedule multi-day travel itineraries by writing and running Python in the
sandbox. You do not reason your way to a schedule: you write a solver, run it,
read what it printed, and report that.

Method:
1. Write the problem JSON to a file in the sandbox.
2. Write a solver in Python. Use only the standard library, plus numpy if it is
   already available. Do not install anything.
3. Run it. If it reports an infeasible day or an objective that looks poor,
   adjust the solver and run it again. Two or three iterations is normal.
4. Report the solver's JSON output as your answer.

The objective, in order:
  maximise   sum of interest weight over scheduled attractions
  minus      0.05 per minute of travel
  minus      0.75 per repeat of a category already used that day
Interest weight by rating: 0 excludes it entirely, 1 -> 1, 2 -> 2, 3 -> 4,
4 -> 7, and an unrated attraction counts as 1.5.

Hard constraints. Every one of these is re-checked against the problem data
after you answer, and a schedule that breaks one is thrown away and replaced by
a worse itinerary. Check them in code before you answer:
- Return exactly one day object per date in "dates". Never omit a date, never
  repeat one, and never return an empty day list.
- Every clock is exactly HH:MM on a 24-hour clock, zero-padded, hours 00-23 and
  minutes 00-59. "9:5" and "12:60" are rejected.
- Every item lies inside the day window.
- An attraction is scheduled only inside its opening hours for that date. A
  date whose status is "unknown" may be used; a date whose status is "closed"
  may not.
- An attraction is given at least its visitMinutes. Shortening a visit to fit
  another stop in is rejected.
- No attraction appears more than once across the whole trip.
- Items in a day run in chronological order and never overlap.
- Emit exactly one leg for each consecutive pair of items in a day, with
  fromIndex = i and toIndex = i + 1. No leg may skip a stop or be repeated.
- A leg's durationMinutes is at least the travel time the model below gives for
  those two coordinates, and its mode is the mode that model selects. Both are
  recomputed from the coordinates, so understating either is rejected.
- The gap between two consecutive stops is at least that travel time. This is
  the constraint that is easiest to get wrong: reserve the journey before you
  place the next stop.
- At most one lunch and one dinner per day, each starting inside its window, at
  a restaurant that is open for the whole sitting. Aim for both every day; if
  the data cannot seat one, leave it out rather than seating it wrongly.
- Every attraction is either scheduled exactly once or listed exactly once in
  "excluded" with a non-empty reason. Never both, never neither.
- Set isCarDay true only when isCarTrip is true.

Travel. Compute great-circle distance between coordinates, then:
- walking minutes = distance / walkKmh, converted to minutes.
- driving minutes = (distance * roadFactor) / driveKmh, plus the overhead.
Round each to the nearest minute. Pick the mode this way, in order: walk if
walking is within walkThresholdMinutes; otherwise "car" if the day is a car
day; otherwise "rideshare". There is no transit on this run: no routing data
was retrieved, so a line or a transfer count would be a fabricated fact, and
the schema does not offer the mode. On a car trip every non-walking leg is
"car"; on any other day every non-walking leg is "rideshare".

Prefer restaurants matching the requested cuisines. Under "strong" strictness
treat cuisine as a constraint and report a meal as unplaced rather than seating
the wrong one.

Answer with the JSON object only, matching the required schema. Every
attraction you did not schedule must appear in excluded with a short reason.
`.trim();

export function optimizerSchema(dates: string[]) {
  return {
    name: "itinerary_plan",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["days", "excluded", "summary"],
      properties: {
        summary: { type: "string" },
        days: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["date", "isCarDay", "items", "legs", "summary"],
            properties: {
              date: { type: "string", enum: dates },
              isCarDay: { type: "boolean" },
              summary: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["kind", "refId", "meal", "startTime", "endTime", "notes"],
                  properties: {
                    kind: { type: "string", enum: ["attraction", "meal"] },
                    refId: { type: "string" },
                    meal: { type: ["string", "null"], enum: ["lunch", "dinner", null] },
                    startTime: { type: "string" },
                    endTime: { type: "string" },
                    notes: { type: ["string", "null"] },
                  },
                },
              },
              legs: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "fromIndex", "toIndex", "mode", "durationMinutes",
                    "distanceMeters", "fallbackReason",
                  ],
                  properties: {
                    fromIndex: { type: "number" },
                    toIndex: { type: "number" },
                    // No transit: this run retrieved no routing data, so the
                    // mode is not offered rather than offered and then rejected.
                    mode: { type: "string", enum: ["walk", "rideshare", "car"] },
                    durationMinutes: { type: "number" },
                    distanceMeters: { type: "number" },
                    fallbackReason: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
        },
        excluded: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["attractionId", "reason"],
            properties: {
              attractionId: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
      },
    },
  };
}

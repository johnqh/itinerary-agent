import { describe, expect, test } from "vitest";
import { readTurnOutput } from "@/agent/discovery";
import {
  DISCOVERY_INSTRUCTIONS,
  discoveryPrompt,
  discoverySchema,
} from "@/agent/discoveryAgent";
import type { TripRequest } from "@/types/workspace";

/**
 * The turn's structured answer lives in the terminal state. These cases pin the
 * failure modes that would otherwise be indistinguishable from "found nothing":
 * a cancelled turn, an empty answer, and a reply that is not JSON.
 */

function doneWith(content: string) {
  return { status: "done", output: { type: "model.message", content } };
}

describe("readTurnOutput", () => {
  test("parses the structured payload from a finished turn", () => {
    const payload = readTurnOutput(doneWith('{"attractions":[{"name":"Sensō-ji"}]}'));
    expect(payload).toEqual({ attractions: [{ name: "Sensō-ji" }] });
  });

  test("throws when the turn did not finish successfully", () => {
    expect(() => readTurnOutput({ status: "cancelled", output: null })).toThrow(/cancelled/i);
  });

  test("surfaces the harness's own explanation when a turn errors", () => {
    // Without this the traveller is told the status and nothing else, while the
    // one sentence that identifies the fault is thrown away.
    expect(() =>
      readTurnOutput({
        status: "error",
        message: "Request failed (400): Invalid schema for response_format.",
      }),
    ).toThrow(/Invalid schema for response_format/);
  });

  test("throws when a finished turn carried no output", () => {
    expect(() => readTurnOutput({ status: "done", output: null })).toThrow(/no structured output/i);
  });

  test("throws when the output is blank rather than reporting an empty result", () => {
    expect(() => readTurnOutput(doneWith("   "))).toThrow(/no structured output/i);
  });

  test("throws when the reply is not valid JSON", () => {
    expect(() => readTurnOutput(doneWith("Here are some attractions!"))).toThrow(/not valid JSON/i);
  });

  test("throws when there is no state at all", () => {
    expect(() => readTurnOutput(undefined)).toThrow(/without a result/i);
  });
});

/**
 * The brief has to ask for one thing.
 *
 * Restaurants are found later, near the stops a day is actually built around.
 * A brief that both forbids restaurant research and demands six of them spends
 * the tool calls this change exists to reclaim, and leaves the model to settle
 * the contradiction whichever way it likes.
 */
describe("the research brief", () => {
  const trip: TripRequest = {
    destination: "Lisbon",
    startDate: "2026-09-12",
    endDate: "2026-09-13",
    hasRentalCar: false,
    pace: "balanced",
    meals: { cuisines: [], strictness: "flexible" },
  };

  test("does not ask for the restaurants it tells the model to skip", () => {
    expect(DISCOVERY_INSTRUCTIONS).toMatch(/Do not spend effort finding restaurants/);
    expect(DISCOVERY_INSTRUCTIONS).not.toMatch(/[0-9]+ restaurants/);
  });

  test("the per-trip prompt asks for attractions, not restaurants", () => {
    expect(discoveryPrompt(trip, ["2026-09-12", "2026-09-13"])).not.toMatch(/restaurant/i);
  });

  test("the schema says an empty restaurant list is the expected answer", () => {
    const schema = discoverySchema(["2026-09-12"]) as {
      schema: { properties: { restaurants: { description?: string } } };
    };
    expect(schema.schema.properties.restaurants.description).toMatch(/empty/i);
  });
});

import { describe, expect, test } from "vitest";
import { readTurnOutput } from "@/agent/discovery";

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

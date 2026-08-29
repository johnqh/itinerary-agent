import { describe, expect, test } from "vitest";
import { rejectionMessage } from "@/agent/optimizerAgent";

/**
 * What the scheduler is told when its answer is refused.
 *
 * The solver iterates against its own objective and has no idea the schedule
 * was rejected, so without this it repeats the same mistake with different
 * numbers. The message has to name the rule, not just the symptom, or the
 * agent optimises the one example it was shown.
 */

describe("rejectionMessage", () => {
  test("states plainly that the schedule was not accepted", () => {
    const message = rejectionMessage(["Travel time on 2026-09-12 does not fit."]);
    expect(message).toMatch(/rejected|not accepted/i);
  });

  test("lists every violation, so nothing is fixed in isolation", () => {
    const message = rejectionMessage([
      "Travel time on 2026-09-12 does not fit: 17 min into a 15 min gap.",
      "golden-gate-park is scheduled more than once.",
    ]);
    expect(message).toContain("17 min into a 15 min gap");
    expect(message).toContain("golden-gate-park is scheduled more than once");
  });

  test("asks for the solver to be corrected and re-run, not for a hand-written answer", () => {
    const message = rejectionMessage(["anything"]);
    expect(message).toMatch(/solver|code/i);
    expect(message).toMatch(/run/i);
  });

  test("names the constraint most often broken so the fix generalises", () => {
    const message = rejectionMessage(["Travel time on 2026-09-12 does not fit."]);
    expect(message).toMatch(/reserve|travel/i);
  });

  test("survives being handed no violations at all", () => {
    expect(() => rejectionMessage([])).not.toThrow();
  });

  test("does not bury the violations in prose", () => {
    const message = rejectionMessage(["A", "B", "C"]);
    const lines = message.split("\n").filter((l) => l.trim().startsWith("-"));
    expect(lines).toHaveLength(3);
  });
});

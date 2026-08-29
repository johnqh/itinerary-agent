import { describe, expect, test } from "vitest";
import { createProgressTracker } from "@/agent/discoveryProgress";

/**
 * Progress must be monotonic and must never imply a denominator the run does
 * not have. A live run spawns as few as two subagents while making seventy
 * tool calls, so "0 of 2" would understate a nearly finished run.
 */

describe("createProgressTracker", () => {
  test("starts at the first stage, not at zero of nothing", () => {
    const tracker = createProgressTracker();
    const progress = tracker.start();
    expect(progress.done).toBe(0);
    expect(progress.total).toBeGreaterThan(0);
  });

  test("advances past connecting once the tools are live", () => {
    const tracker = createProgressTracker();
    tracker.start();
    const progress = tracker.handle("mcp.initialize");
    expect(progress?.done).toBe(1);
  });

  test("reports the growing lookup count while searching", () => {
    const tracker = createProgressTracker();
    tracker.start();
    tracker.handle("mcp.initialize");
    tracker.handle("tool.response");
    const progress = tracker.handle("tool.response");
    expect(progress?.label).toMatch(/2 lookups/);
  });

  test("reports researchers once subagents appear", () => {
    const tracker = createProgressTracker();
    tracker.start();
    tracker.handle("thread.created");
    const progress = tracker.handle("thread.created");
    expect(progress?.label).toMatch(/2 researchers/);
  });

  test("keeps reporting lookups while a researcher is still working", () => {
    // A subagent can run for minutes before it reports back. Showing only
    // "1 researcher, 0 done" for that whole time reads as a hang, even though
    // the tool calls underneath are ticking along.
    const tracker = createProgressTracker();
    tracker.start();
    tracker.handle("thread.created");
    tracker.handle("tool.response");
    const progress = tracker.handle("tool.response");
    expect(progress?.label).toMatch(/1 researcher/);
    expect(progress?.label).toMatch(/2 lookups/);
  });

  test("never goes backwards when a later stage's event arrives first", () => {
    const tracker = createProgressTracker();
    tracker.start();
    const after = tracker.handle("thread.done");
    const later = tracker.handle("tool.response");
    expect(later!.done).toBeGreaterThanOrEqual(after!.done);
  });

  test("ends complete, with done equal to total", () => {
    const tracker = createProgressTracker();
    tracker.start();
    const progress = tracker.finish();
    expect(progress.done).toBe(progress.total);
  });

  test("ignores events it does not track", () => {
    const tracker = createProgressTracker();
    tracker.start();
    expect(tracker.handle("model.message.delta")).toBeNull();
  });

  test("counts subagents so a caller can report fan-out", () => {
    const tracker = createProgressTracker();
    tracker.start();
    tracker.handle("thread.created");
    tracker.handle("thread.created");
    expect(tracker.subagentCount).toBe(2);
  });
});

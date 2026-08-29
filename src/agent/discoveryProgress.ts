import type { Progress } from "@/types/workspace";

/**
 * Turns the harness event stream into honest progress.
 *
 * Progress is reported as fixed stages rather than as a fraction of subagents.
 * A real run spawns two or three researchers while making seventy tool calls,
 * so "0 of 2" describes a nearly finished run as barely started. Stages move
 * forward only, and the counters live in the label where they inform without
 * pretending to be a denominator.
 */

const STAGES = ["connecting", "searching", "researching", "complete"] as const;
type Stage = (typeof STAGES)[number];

const TOTAL = STAGES.length - 1;

function indexOf(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export interface ProgressTracker {
  readonly subagentCount: number;
  start(): Progress;
  handle(eventType: string): Progress | null;
  finish(): Progress;
}

export function createProgressTracker(): ProgressTracker {
  let stage: Stage = "connecting";
  let lookups = 0;
  let spawned = 0;
  let completed = 0;

  /** Stages only ever move forward; an out-of-order event cannot rewind them. */
  function advance(next: Stage): void {
    if (indexOf(next) > indexOf(stage)) stage = next;
  }

  function label(): string {
    switch (stage) {
      case "connecting":
        return "Connecting research tools";
      case "searching":
        return lookups > 0
          ? `Searching sources (${lookups} lookups)`
          : "Searching sources";
      case "researching":
        return spawned > 0
          ? `Researching details (${spawned} researchers, ${completed} done)`
          : "Researching details";
      case "complete":
        return "Research complete";
    }
  }

  function snapshot(): Progress {
    return { label: label(), done: indexOf(stage), total: TOTAL };
  }

  return {
    get subagentCount() {
      return spawned;
    },
    start() {
      return snapshot();
    },
    handle(eventType: string): Progress | null {
      switch (eventType) {
        case "mcp.initialize":
          advance("searching");
          return snapshot();
        case "tool.response":
          lookups += 1;
          advance("searching");
          return snapshot();
        case "thread.created":
          spawned += 1;
          advance("researching");
          return snapshot();
        case "thread.done":
          completed += 1;
          advance("researching");
          return snapshot();
        default:
          return null;
      }
    },
    finish() {
      stage = "complete";
      return snapshot();
    },
  };
}

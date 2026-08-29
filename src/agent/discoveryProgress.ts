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

/**
 * Research finishing is not the run finishing. Photographs and the nearby meal
 * search each take Places calls afterwards, so they are stages of their own:
 * folded into "complete" they would report a finished run while a traveller
 * waits, and a stall would be indistinguishable from an answer.
 */
const STAGES = [
  "connecting",
  "searching",
  "researching",
  "photographs",
  "meals",
  "complete",
] as const;
type Stage = (typeof STAGES)[number];

const TOTAL = STAGES.length - 1;

function indexOf(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export interface ProgressTracker {
  readonly subagentCount: number;
  start(): Progress;
  handle(eventType: string): Progress | null;
  /** Looking up photographs for the places research returned. */
  photographs(done: number, total: number): Progress;
  /** Searching for somewhere to eat around each day's centre. */
  meals(): Progress;
  finish(): Progress;
}

export function createProgressTracker(): ProgressTracker {
  let stage: Stage = "connecting";
  let lookups = 0;
  let spawned = 0;
  let completed = 0;
  let photos: { done: number; total: number } | null = null;

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
      case "researching": {
        if (spawned === 0) return "Researching details";
        // The lookup count is the only part that moves while a researcher is
        // still working. Without it the label sits unchanged for minutes and
        // an ordinary long run is indistinguishable from a hang.
        const who = `${spawned} researcher${spawned === 1 ? "" : "s"}`;
        return `Researching details (${who}, ${completed} done, ${lookups} lookups)`;
      }
      case "photographs":
        // The counter is a real one here: the number of places still to look
        // up is known before the first lookup starts.
        return photos
          ? `Finding photographs (${photos.done}/${photos.total})`
          : "Finding photographs";
      case "meals":
        return "Looking for places to eat nearby";
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
    photographs(done: number, total: number) {
      photos = { done, total };
      advance("photographs");
      return snapshot();
    },
    meals() {
      advance("meals");
      return snapshot();
    },
    finish() {
      stage = "complete";
      return snapshot();
    },
  };
}

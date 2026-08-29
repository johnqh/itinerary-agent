import type { Attraction, Restaurant, TripRequest } from "@/types/workspace";
import type { RejectedRecord } from "@/agent/normalize";
import { normalizeDiscovery } from "@/agent/normalize";
import {
  ORCHESTRATOR_MODEL,
  RESEARCH_MCP_SERVER,
  createClient,
} from "@/agent/client";
import {
  DISCOVERY_INSTRUCTIONS,
  discoveryPrompt,
  discoverySchema,
} from "@/agent/discoveryAgent";
import { createProgressTracker } from "@/agent/discoveryProgress";

/**
 * Runs one live discovery turn.
 *
 * Two details here are load-bearing and both were established by watching a
 * real turn rather than by reading docs:
 *
 * 1. The answer is read from the terminal `turn.done` state, never from the
 *    accumulated `model.message.delta` stream. Deltas carry every thread's
 *    narration, including each subagent's, so concatenating them yields
 *    commentary rather than the structured result.
 * 2. `thread.created` / `thread.done` are how subagent fan-out becomes visible.
 *    They are the only honest source for a progress denominator, because the
 *    agent decides at run time how many researchers to spawn.
 */

export interface DiscoveryProgress {
  label: string;
  done: number;
  total: number;
}

export interface DiscoveryOutcome {
  sessionId: string;
  attractions: Attraction[];
  restaurants: Restaurant[];
  rejected: RejectedRecord[];
  subagentCount: number;
}

export interface RunDiscoveryOptions {
  trip: TripRequest;
  dates: string[];
  onProgress?: (progress: DiscoveryProgress) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Pulls the structured payload out of the finished turn.
 *
 * The provider returns schema-conformant JSON as text, so it still has to be
 * parsed, and a parse failure must not read as "no attractions found".
 */
/**
 * Pulls the structured payload out of the finished turn.
 *
 * Every failure here raises rather than returning an empty result: a cancelled
 * turn, a blank answer and a non-JSON reply are all real errors, and reporting
 * any of them as "no attractions found" would hide a broken run behind a
 * plausible-looking empty map.
 */
export function readTurnOutput(state: unknown): unknown {
  if (!isRecord(state)) throw new Error("The turn finished without a result.");

  const status = state.status;
  if (status !== "done") {
    // The harness puts the actual fault in `message`. Reporting only the status
    // discards the one sentence that says what to fix.
    const detail = typeof state.message === "string" ? state.message.trim() : "";
    throw new Error(
      detail
        ? `Discovery ended with status "${String(status)}": ${detail}`
        : `Discovery ended with status "${String(status)}".`,
    );
  }

  const output = state.output;
  const content = isRecord(output) ? output.content : undefined;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The turn finished with no structured output.");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("The agent's reply was not valid JSON.");
  }
}

export async function runLiveDiscovery(
  options: RunDiscoveryOptions,
): Promise<DiscoveryOutcome> {
  const { trip, dates, onProgress } = options;
  const client = createClient();

  const { data: session } = await client.sessions.create({
    agent: {
      spec: {
        // Both named resources are what `harnessStatus()` preflights, so the
        // checkbox the traveller sees and the turn it starts agree.
        model: { name: ORCHESTRATOR_MODEL },
        instructions: DISCOVERY_INSTRUCTIONS,
        mcpServers: [{ name: RESEARCH_MCP_SERVER }],
        config: {
          dynamicSubAgents: { enabled: true },
          iterationLimit: 120,
        },
        responseFormat: {
          type: "json_schema",
          jsonSchema: discoverySchema(dates),
        },
      },
    },
  });

  const tracker = createProgressTracker();
  onProgress?.(tracker.start());

  const stream = await client.sessions.createTurnStream(session.id, {
    input: [{ type: "user.message", content: discoveryPrompt(trip, dates) }],
  });

  let finalState: unknown = null;
  for await (const { data: event } of stream.withMetadata()) {
    if (event.type === "turn.done") {
      finalState = (event as { state?: unknown }).state;
      continue;
    }
    const progress = tracker.handle(event.type);
    if (progress) onProgress?.(progress);
  }

  const payload = readTurnOutput(finalState);
  const normalized = normalizeDiscovery(payload, dates);
  onProgress?.(tracker.finish());

  return {
    sessionId: session.id,
    attractions: normalized.attractions,
    restaurants: normalized.restaurants,
    rejected: normalized.rejected,
    subagentCount: tracker.subagentCount,
  };
}

import { TrueForge } from "@truefoundry/trueforge-sdk";

/**
 * Harness connection.
 *
 * In the browser the base URL is this origin: both the dev server and `vite
 * preview` proxy `/api` to the harness, so the workspace never makes a
 * cross-origin request and no credential is ever exposed to the page. A build
 * deployed anywhere else has no such proxy in front of it and must be told
 * where the harness is with `VITE_TRUEFORGE_BASE_URL`, which then requires the
 * harness to allow that origin. Outside the browser (scripts, tests) the
 * harness is addressed directly.
 */

function baseUrl(): string {
  // `import.meta.env` is absent outside the bundler, so guard it.
  const configured = import.meta.env?.VITE_TRUEFORGE_BASE_URL?.trim();
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:8790";
}

export function createClient(): TrueForge {
  return new TrueForge({ baseUrl: baseUrl(), timeoutInSeconds: 900 });
}

/**
 * The harness resources the agent turns name by hand.
 *
 * They live here rather than in each session so the preflight and the turns
 * cannot drift apart: checking that "a model exists" told the traveller live
 * research was available, opened the checkbox, and then spent minutes of their
 * time on a turn that could only fail.
 *
 * Both jobs are bounded — extracting facts from retrieved pages, and writing a
 * solver against rules supplied in the brief — rather than open-ended
 * reasoning. A scheduling run iterates several times, so cost per pass decides
 * whether it can iterate at all.
 */
export const ORCHESTRATOR_MODEL = "openai/gpt-5-4-mini";
export const OPTIMIZER_MODEL = "openai/gpt-5-4-mini";
export const RESEARCH_MCP_SERVER = "bright-data";

const SETUP_HINT = "Run `bun run setup:harness` to register it.";

export type HarnessStatus =
  | { available: true; model: string }
  | { available: false; reason: string };

/**
 * The verdict over what the harness reported, with no I/O of its own.
 *
 * `webDataTools` is the number of tools the web-data connector listed, or null
 * when listing them failed at all.
 */
export function researchReadiness(
  models: string[],
  webDataTools: number | null,
): HarnessStatus {
  if (models.length === 0) {
    return {
      available: false,
      reason: `The harness is running but no model provider is configured. ${SETUP_HINT}`,
    };
  }

  if (!models.includes(ORCHESTRATOR_MODEL)) {
    return {
      available: false,
      reason: `Discovery runs on ${ORCHESTRATOR_MODEL}, which this harness does not offer. ${SETUP_HINT}`,
    };
  }

  if (webDataTools === null) {
    return {
      available: false,
      reason: `The web-data connector "${RESEARCH_MCP_SERVER}" is not answering, so there is nothing to research with. ${SETUP_HINT}`,
    };
  }

  if (webDataTools === 0) {
    return {
      available: false,
      reason: `The web-data connector "${RESEARCH_MCP_SERVER}" reports no tools, so there is nothing to research with. ${SETUP_HINT}`,
    };
  }

  return { available: true, model: ORCHESTRATOR_MODEL };
}

/**
 * Whether the harness can actually run a discovery turn.
 *
 * Discovery falls back to the seed dataset when this is false, so the check
 * must be cheap and must never throw.
 */
export async function harnessStatus(): Promise<HarnessStatus> {
  const client = createClient();

  let models: string[];
  try {
    const listed = await client.models.list();
    models = (listed.data ?? []).map((model) => model.name);
  } catch {
    return { available: false, reason: "The agent harness is not reachable." };
  }

  // A connector that is registered but broken throws here, and that is a
  // different answer from an empty tool list; both mean no live research.
  let webDataTools: number | null;
  try {
    const tools = await client.mcpServers.listTools(RESEARCH_MCP_SERVER);
    webDataTools = (tools.data ?? []).length;
  } catch {
    webDataTools = null;
  }

  return researchReadiness(models, webDataTools);
}

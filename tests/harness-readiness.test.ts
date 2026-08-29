import { describe, expect, test } from "vitest";
import {
  ORCHESTRATOR_MODEL,
  RESEARCH_MCP_SERVER,
  researchReadiness,
} from "@/agent/client";

/**
 * The preflight decides whether the workspace offers live research at all.
 * Getting it wrong costs the traveller minutes: an optimistic yes starts a long
 * run that can only end in the seed dataset, and a pessimistic no hides a
 * working feature. Both resources discovery names are checked, not just one.
 */

describe("researchReadiness", () => {
  test("is ready when the discovery model and the web-data tools are both there", () => {
    const status = researchReadiness([ORCHESTRATOR_MODEL], 12);
    expect(status.available).toBe(true);
    expect(status).toMatchObject({ model: ORCHESTRATOR_MODEL });
  });

  test("is not ready when no model provider is configured", () => {
    const status = researchReadiness([], 12);
    expect(status.available).toBe(false);
    expect(status).toMatchObject({ reason: expect.stringMatching(/model provider/i) });
  });

  test("is not ready when some other model is configured but not the one discovery runs", () => {
    const status = researchReadiness(["anthropic/claude-opus-5", "openai/gpt-4o"], 12);
    expect(status.available).toBe(false);
    expect(status).toMatchObject({
      reason: expect.stringContaining(ORCHESTRATOR_MODEL),
    });
  });

  test("is not ready when the web-data connector cannot be reached", () => {
    const status = researchReadiness([ORCHESTRATOR_MODEL], null);
    expect(status.available).toBe(false);
    expect(status).toMatchObject({
      reason: expect.stringContaining(RESEARCH_MCP_SERVER),
    });
  });

  test("is not ready when the web-data connector answers with no tools", () => {
    const status = researchReadiness([ORCHESTRATOR_MODEL], 0);
    expect(status.available).toBe(false);
    expect(status).toMatchObject({
      reason: expect.stringContaining(RESEARCH_MCP_SERVER),
    });
  });

  test("names the setup command in every reason a person can act on", () => {
    for (const status of [
      researchReadiness([], 12),
      researchReadiness(["openai/gpt-4o"], 12),
      researchReadiness([ORCHESTRATOR_MODEL], null),
    ]) {
      expect(status).toMatchObject({
        reason: expect.stringContaining("bun run setup:harness"),
      });
    }
  });
});

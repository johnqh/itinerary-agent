/**
 * Registers this project's harness resources: a model provider, the web-data
 * MCP connector, and a check that both actually answer.
 *
 * Run with `bun run setup:harness`. Bun loads `.env` automatically; that file is
 * gitignored and nothing here ever prints a secret. Uses `createOrUpdate`, so
 * re-running after rotating a key updates the stored credential in place.
 */

import { TrueForge } from "@truefoundry/trueforge-sdk";

/**
 * Reads an environment variable, treating blank as absent. A key left empty in
 * a .env template is not a configured value, and `??` alone would accept "".
 */
function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const BASE_URL = env("TRUEFORGE_BASE_URL") ?? "http://localhost:8790";
const OPENAI_API_KEY = env("OPENAI_API_KEY");
const BRIGHT_DATA_API_TOKEN = env("BRIGHT_DATA_API_TOKEN");

/** A capable orchestrator and a cheaper model for bounded research work. */
const OPENAI_MODELS = [
  {
    modelId: "gpt-5.6-sol",
    name: "gpt-5-6-sol",
    properties: {
      contextLength: 1050000,
      maxOutputTokens: 128000,
      reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    },
  },
  {
    modelId: "gpt-5.4-mini",
    name: "gpt-5-4-mini",
    properties: {
      contextLength: 400000,
      maxOutputTokens: 128000,
      reasoningEfforts: ["none", "low", "medium", "high", "xhigh"],
    },
  },
] as const;

const BRIGHT_DATA_URL = "https://mcp.brightdata.com/mcp";

async function main(): Promise<void> {
  const client = new TrueForge({ baseUrl: BASE_URL, timeoutInSeconds: 120 });

  try {
    await client.settings.modelProviders.list();
  } catch {
    console.error(
      `Cannot reach the harness at ${BASE_URL}.\n` +
        `Start it first:  npx @truefoundry/trueforge@latest`,
    );
    process.exit(1);
  }
  console.log(`Harness reachable at ${BASE_URL}`);

  if (!OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set. Copy .env.example to .env and fill it in.",
    );
    process.exit(1);
  }

  await client.settings.modelProviders.createOrUpdate({
    manifest: {
      type: "openai",
      auth: { apiKey: OPENAI_API_KEY },
      models: OPENAI_MODELS.map((m) => ({ ...m, properties: { ...m.properties } })),
    },
  });
  console.log("Model provider 'openai' registered.");

  if (BRIGHT_DATA_API_TOKEN) {
    await client.settings.mcpServers.createOrUpdate({
      manifest: {
        type: "remote",
        name: "bright-data",
        url: BRIGHT_DATA_URL,
        description:
          "Search the web and scrape pages, including sites behind bot protection.",
        auth: {
          type: "header",
          headers: { Authorization: `Bearer ${BRIGHT_DATA_API_TOKEN}` },
        },
      },
    });
    console.log("MCP connector 'bright-data' registered.");
  } else {
    console.warn(
      "BRIGHT_DATA_API_TOKEN is not set. Skipping the web-data connector;\n" +
        "discovery will stay on the offline seed dataset.",
    );
  }

  // Configuration being accepted is not the same as it working. Verify both.
  const models = await client.models.list();
  const modelNames = (models.data ?? []).map((m) => m.name);
  console.log(
    modelNames.length > 0
      ? `Models available (${modelNames.length}): ${modelNames.join(", ")}`
      : "No models reported. Check the API key.",
  );

  if (BRIGHT_DATA_API_TOKEN) {
    try {
      const tools = await client.mcpServers.listTools("bright-data");
      const names = (tools.data ?? []).map((t) => t.name);
      console.log(`bright-data tools (${names.length}): ${names.join(", ")}`);
    } catch (error) {
      console.error(
        "bright-data registered but its tools could not be listed. " +
          "The token may be wrong or the server unreachable.",
      );
      throw error;
    }
  }

  console.log("\nHarness setup complete.");
}

main().catch((error: unknown) => {
  // Print only the message: a full error dump can echo the credential back.
  console.error(
    `Setup failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});

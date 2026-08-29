import { TrueForge } from "@truefoundry/trueforge-sdk";

/**
 * Harness connection.
 *
 * In the browser the base URL is this origin: the dev server proxies `/api` to
 * the harness so the workspace never makes a cross-origin request, and no
 * credential is ever exposed to the page. Outside the browser (scripts, tests)
 * the harness is addressed directly.
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
 * Whether the harness is reachable and has a usable model.
 *
 * Discovery falls back to the seed dataset when this is false, so the check
 * must be cheap and must never throw.
 */
export async function harnessStatus(): Promise<
  { available: true; model: string } | { available: false; reason: string }
> {
  try {
    const client = createClient();
    const models = await client.models.list();
    const first = (models.data ?? [])[0];
    if (!first) {
      return {
        available: false,
        reason: "The harness is running but no model provider is configured.",
      };
    }
    return { available: true, model: first.name };
  } catch {
    return {
      available: false,
      reason: "The agent harness is not reachable.",
    };
  }
}

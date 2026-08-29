import type {
  Attraction,
  ExclusionReason,
  Plan,
  PlanDay,
  PlanItem,
  Rating,
  Restaurant,
  RouteLeg,
  TransportMode,
  TripRequest,
  UnplacedMeal,
} from "@/types/workspace";
import { createClient, OPTIMIZER_MODEL } from "@/agent/client";
import { readTurnOutput } from "@/agent/discovery";
import { validateAgentPlan } from "@/agent/planValidation";
import {
  buildProblem,
  OPTIMIZER_INSTRUCTIONS,
  optimizerSchema,
  rejectionMessage,
} from "@/agent/optimizerAgent";
import { toMinutes } from "@/planner/time";

/**
 * Runs the scheduling turn: the agent writes a solver, executes it in the
 * sandbox, and returns its output, which is then checked before use.
 */

/**
 * The schema does not offer transit, but it stays readable here on purpose. A
 * transit leg that arrived anyway is dropped by parsing, and a dropped leg
 * looks to the validator like a missing one; keeping it lets the rejection say
 * what actually happened.
 */
const MODES: TransportMode[] = ["walk", "transit", "rideshare", "car"];

/**
 * How many schedules to ask for before giving up on the agent.
 *
 * Three is a judgement: the first answer is often wrong in a way the second
 * fixes, and an agent still failing on the third is failing structurally
 * rather than by oversight. Each attempt costs a turn, and the deterministic
 * planner is waiting behind this.
 */
const MAX_SCHEDULING_ATTEMPTS = 3;

export interface OptimizeInput {
  trip: TripRequest;
  dates: string[];
  attractions: Attraction[];
  restaurants: Restaurant[];
  ratings: Record<string, Rating>;
  onProgress?: (label: string) => void;
}

export interface OptimizeOutcome {
  plan: Plan;
  sessionId: string;
  /** How many times the agent ran code before it was satisfied. */
  sandboxRuns: number;
  /** How many schedules it took before one passed the validator. */
  attempts: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Reshapes the scheduler's JSON into contract types.
 *
 * Malformed pieces are dropped rather than coerced into something plausible.
 * A leg with no recognisable mode or an item with no end time cannot be made
 * safe by guessing; dropping it lets the validator see what is actually there.
 */
export function toPlanDays(payload: unknown): {
  days: PlanDay[];
  excluded: ExclusionReason[];
  summary: string;
} {
  const root = isRecord(payload) ? payload : {};
  const days: PlanDay[] = [];

  for (const raw of Array.isArray(root.days) ? root.days : []) {
    if (!isRecord(raw)) continue;
    const date = str(raw.date);
    if (!date) continue;

    const items: PlanItem[] = [];
    for (const item of Array.isArray(raw.items) ? raw.items : []) {
      if (!isRecord(item)) continue;
      const refId = str(item.refId);
      const startTime = str(item.startTime);
      const endTime = str(item.endTime);
      if (!refId || !startTime || !endTime) continue;
      const kind = item.kind === "meal" ? "meal" : "attraction";
      const meal = item.meal === "lunch" || item.meal === "dinner" ? item.meal : undefined;
      items.push({
        kind,
        refId,
        meal: kind === "meal" ? meal : undefined,
        startTime,
        endTime,
        notes: str(item.notes),
      });
    }

    const legs: RouteLeg[] = [];
    for (const leg of Array.isArray(raw.legs) ? raw.legs : []) {
      if (!isRecord(leg)) continue;
      const fromIndex = num(leg.fromIndex);
      const toIndex = num(leg.toIndex);
      const mode = MODES.find((m) => m === leg.mode);
      if (fromIndex === undefined || toIndex === undefined || !mode) continue;
      legs.push({
        fromIndex,
        toIndex,
        mode,
        durationMinutes: Math.max(0, Math.round(num(leg.durationMinutes) ?? 0)),
        distanceMeters: Math.max(0, Math.round(num(leg.distanceMeters) ?? 0)),
        fallbackReason: str(leg.fallbackReason),
        // No routing provider ran, so every number here is a model of travel
        // rather than a measurement of it.
        estimated: true,
      });
    }

    days.push({
      date,
      isCarDay: raw.isCarDay === true,
      items,
      legs,
      summary: str(raw.summary) ?? "",
    });
  }

  const excluded: ExclusionReason[] = [];
  for (const entry of Array.isArray(root.excluded) ? root.excluded : []) {
    if (!isRecord(entry)) continue;
    const attractionId = str(entry.attractionId);
    if (!attractionId) continue;
    excluded.push({
      attractionId,
      reason: str(entry.reason) ?? "No reason was given.",
    });
  }

  return { days, excluded, summary: str(root.summary) ?? "" };
}

/**
 * The meals a returned schedule leaves unseated.
 *
 * The scheduler reports an absence, never a cause. Everywhere shut, nothing
 * near the route, a cuisine it would not compromise on — this run learned none
 * of them, and this sentence is read out to the traveller in the degraded
 * banner. Naming a cause it did not determine would be inventing one.
 */
export function unseatedMeals(days: PlanDay[]): UnplacedMeal[] {
  return days.flatMap((day) =>
    (["lunch", "dinner"] as const)
      .filter((meal) => !day.items.some((i) => i.kind === "meal" && i.meal === meal))
      .map((meal) => ({
        date: day.date,
        meal,
        reason: `The scheduler seated no ${meal} on ${day.date} and gave no reason for it.`,
      })),
  );
}

export class OptimizerRejected extends Error {
  constructor(readonly violations: string[]) {
    super(`The scheduler's answer broke ${violations.length} rule(s).`);
    this.name = "OptimizerRejected";
  }
}

export async function runSandboxOptimizer(
  input: OptimizeInput,
): Promise<OptimizeOutcome> {
  const { trip, dates, attractions, restaurants, ratings, onProgress } = input;
  const client = createClient();

  const { data: session } = await client.sessions.create({
    agent: {
      spec: {
        model: { name: OPTIMIZER_MODEL },
        instructions: OPTIMIZER_INSTRUCTIONS,
        config: { sandbox: { enabled: true }, iterationLimit: 60 },
        responseFormat: { type: "json_schema", jsonSchema: optimizerSchema(dates) },
      },
    },
  });

  const problem = buildProblem(trip, dates, attractions, restaurants, ratings);
  onProgress?.("Handing the problem to the scheduler");

  let sandboxRuns = 0;
  let attempt = 0;
  let accepted: { days: PlanDay[]; excluded: ExclusionReason[]; summary: string } | null = null;
  let lastViolations: string[] = [];

  /**
   * Ask, check, and ask again with what was wrong.
   *
   * Every attempt is a turn in the same session, so the agent still has its own
   * solver in front of it and is correcting code rather than writing new code
   * from a blank page. This is the loop the sandbox exists for: without it the
   * solver iterates against its own objective and never learns that the answer
   * was refused.
   */
  while (attempt < MAX_SCHEDULING_ATTEMPTS && !accepted) {
    attempt += 1;

    const content =
      attempt === 1
        ? `Schedule this trip. Problem JSON:\n\n${JSON.stringify(problem)}`
        : rejectionMessage(lastViolations);

    if (attempt > 1) {
      onProgress?.(
        `Schedule rejected; asking the scheduler to correct ${lastViolations.length} problem${
          lastViolations.length === 1 ? "" : "s"
        }`,
      );
    }

    const stream = await client.sessions.createTurnStream(session.id, {
      input: [{ type: "user.message", content }],
    });

    let finalState: unknown = null;
    for await (const { data: event } of stream.withMetadata()) {
      switch (event.type) {
        case "sandbox.created":
          onProgress?.("Sandbox ready");
          break;
        case "tool.response":
          sandboxRuns += 1;
          onProgress?.(`Running the solver (pass ${sandboxRuns})`);
          break;
        case "turn.done":
          finalState = (event as { state?: unknown }).state;
          break;
        default:
          break;
      }
    }

    const parsed = toPlanDays(readTurnOutput(finalState));

    // The exclusions are part of the answer, not commentary on it: they drive
    // the excluded pins and the diagnostics, so they are checked with the
    // schedule.
    const ledger = completeExclusions(parsed.days, attractions, parsed.excluded);
    const verdict = validateAgentPlan(
      parsed.days,
      { trip, dates, attractions, restaurants },
      ledger,
    );

    if (verdict.ok) {
      accepted = { ...parsed, excluded: ledger };
    } else {
      lastViolations = verdict.violations;
    }
  }

  if (!accepted) throw new OptimizerRejected(lastViolations);
  const { days, excluded, summary } = accepted;

  // The scheduler may legitimately fail to seat a meal; it may not do so
  // silently, so an absent meal becomes a reported degraded state.
  const unplacedMeals = unseatedMeals(days);

  const scheduled = days.flatMap((d) => d.items).filter((i) => i.kind === "attraction");
  const attractionMinutes = scheduled.reduce(
    (sum, item) => sum + (toMinutes(item.endTime) - toMinutes(item.startTime)),
    0,
  );
  const transportMinutes = days
    .flatMap((d) => d.legs)
    .reduce((sum, l) => sum + l.durationMinutes, 0);

  const plan: Plan = {
    id: `plan-${session.id}`,
    version: 1,
    days,
    excludedAttractionIds: excluded.map((e) => e.attractionId),
    summary,
    diagnostics: {
      considered: attractions.length,
      included: scheduled.length,
      excluded,
      routeCalls: 0,
      cacheHits: 0,
      transitAccepted: 0,
      transitRejected: 0,
      attractionMinutes,
      transportMinutes,
      score: 0,
      unplacedMeals,
    },
  };

  return { plan, sessionId: session.id, sandboxRuns, attempts: attempt };
}

/**
 * Completes the ledger of what was left out.
 *
 * The validator requires every candidate to be either scheduled or excluded,
 * which is right for the traveller: an attraction that vanishes with no
 * explanation is a defect they cannot see. But that is bookkeeping rather than
 * feasibility, and refusing an otherwise walkable day over a missing line item
 * throws away good work — in practice it pushed the scheduler towards
 * returning nothing at all, which passes the letter of the rule and helps
 * nobody.
 *
 * Anything unaccounted for is recorded as left out, saying only that. The
 * scheduler reported an absence, not a cause, and inventing one here would put
 * a fact on screen that nothing established.
 */
export function completeExclusions(
  days: PlanDay[],
  attractions: Attraction[],
  excluded: ExclusionReason[],
): ExclusionReason[] {
  const scheduled = new Set(
    days.flatMap((day) => day.items).filter((i) => i.kind === "attraction").map((i) => i.refId),
  );
  const accounted = new Set(excluded.map((e) => e.attractionId));

  const missing = attractions
    .filter((a) => !scheduled.has(a.id) && !accounted.has(a.id))
    .map((a) => ({
      attractionId: a.id,
      reason: "The scheduler did not fit this into the trip.",
    }));

  return [...excluded, ...missing];
}

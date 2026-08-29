import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Attraction,
  ItineraryAgent,
  Plan,
  Restaurant,
  Rating,
  TripRequest,
  Workspace,
} from "@/types/workspace";
import { buildPlan, tripDates } from "@/planner/build";
import {
  discoverySteps,
  liveDiscoveryProvenance,
  mealNotice,
} from "@/agent/notices";
import { coveredCityLabels, datasetFor, type OfflineDataset } from "@/data/datasets";
import { harnessStatus } from "@/agent/client";
import { runLiveDiscovery } from "@/agent/discovery";
import { OptimizerRejected, runSandboxOptimizer } from "@/agent/optimizer";
import { refinePlanRoutes } from "@/routing/refinePlan";
import {
  browserStorage,
  clearSession,
  loadSession,
  saveSession,
} from "@/agent/sessionStore";

/**
 * The adapter: the only module that knows how the agent is driven.
 *
 * In this revision it is backed by the offline seed dataset and the local
 * greedy builder, behind the same interface the harness-backed implementation
 * will satisfy. Actions become turns and streamed events become workspace state
 * without the UI changing, because the UI only ever sees `ItineraryAgent`.
 */

const EMPTY: Workspace = {
  phase: "setup",
  trip: null,
  sessionId: null,
  restoredAt: null,
  attractions: [],
  restaurants: [],
  ratings: {},
  plan: null,
  progress: null,
  degraded: { discovery: null, routing: null, optimizer: null, meals: null, map: null },
};

const ESTIMATE_NOTICE =
  "Travel times are straight-line estimates. No routing provider is connected, so transit is treated as unavailable.";

/** Roughly how long the simulated discovery run takes, however many steps it has. */
const DISCOVERY_RUN_MS = 900;
const STEP_DELAY_MS = 220;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rebuilds a workspace from a previous visit, or starts empty.
 *
 * Read once during the first render rather than in an effect, so a restored
 * trip is on screen from the first paint instead of flashing the setup form.
 */
function initialWorkspace(): { workspace: Workspace; live: boolean } {
  const storage = browserStorage();
  const stored = storage ? loadSession(storage) : null;
  if (!stored) return { workspace: EMPTY, live: false };

  return {
    live: stored.live,
    workspace: {
      ...EMPTY,
      phase: stored.phase,
      trip: stored.trip,
      sessionId: stored.sessionId,
      restoredAt: stored.savedAt,
      attractions: stored.attractions,
      restaurants: stored.restaurants,
      ratings: stored.ratings,
      plan: stored.plan,
      // The restored candidates and plan carry their provenance with them; a
      // reload is not a chance to present a degraded run as a clean one.
      degraded: stored.degraded,
    },
  };
}

export function useItineraryAgent(): ItineraryAgent {
  const [restored] = useState(initialWorkspace);
  const [workspace, setWorkspace] = useState<Workspace>(restored.workspace);

  // Read by actions that need the current trip before React has re-rendered.
  // A state updater cannot stand in for it: the updater runs when React chooses
  // to, which is after the action that queued it has already moved on.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  /** Whether this trip opted into agent-run research and scheduling. */
  const liveRef = useRef(restored.live);

  /**
   * Applies an async result only if it still belongs to the trip on screen.
   *
   * Research and scheduling take minutes, and "New trip" lets the traveller
   * replace the trip while one is still running. Without this, whichever run
   * finished last wrote its candidates, its session id and its provenance
   * notice into whatever trip was showing — a Kyoto header over Tokyo
   * candidates, under a banner claiming the web had been researched for a city
   * this trip never asked about.
   *
   * The trip object itself is the run's identity: `createTrip` stores exactly
   * the object it was handed and `reset` stores null, so a run whose trip is no
   * longer the current one is a run nobody is waiting for.
   */
  const commit = useCallback(
    (trip: TripRequest, update: (current: Workspace) => Workspace) => {
      setWorkspace((current) => (current.trip === trip ? update(current) : current));
    },
    [],
  );

  // Persist after every settled change so a reload rejoins the trip. Runs in
  // an effect rather than inside the state updaters, which must stay pure.
  useEffect(() => {
    const storage = browserStorage();
    if (storage) saveSession(storage, workspace, { live: liveRef.current });
  }, [workspace]);

  // Pure: state updaters must be free of side effects, or React's double
  // invocation in development silently counts every plan twice.
  const runPlan = useCallback((current: Workspace): Workspace => {
    if (!current.trip) return current;
    const plan = buildPlan({
      trip: current.trip,
      attractions: current.attractions,
      restaurants: current.restaurants,
      ratings: current.ratings,
    });
    return {
      ...current,
      phase: "ready",
      plan: { ...plan, version: (current.plan?.version ?? 0) + 1 },
      progress: null,
      degraded: {
        ...current.degraded,
        routing: ESTIMATE_NOTICE,
        optimizer: null,
        meals: mealNotice(plan, current.trip.meals),
      },
    };
  }, []);

  /**
   * Fills the workspace from a committed dataset.
   *
   * The stepped delay is cosmetic: it shows the same phases a live run reports
   * so the two paths do not feel like different products.
   */
  const runOfflineDiscovery = useCallback(
    async (trip: TripRequest, dataset: OfflineDataset, reason: string | null) => {
      const dates = tripDates(trip);
      const steps = discoverySteps(dates);
      const perStep = Math.max(30, Math.round(DISCOVERY_RUN_MS / steps.length));

      for (const [index, label] of steps.entries()) {
        await delay(perStep);
        const done = index + 1;
        commit(trip, (current) =>
          current.phase === "discovering"
            ? { ...current, progress: { label, done, total: steps.length } }
            : current,
        );
      }

      commit(trip, (current) => ({
        ...current,
        phase: "rating",
        attractions: dataset.attractions(dates),
        restaurants: dataset.restaurants(dates),
        progress: null,
        degraded: { ...current.degraded, discovery: reason },
      }));
    },
    [commit],
  );

  /**
   * Reports that research failed for a city no dataset covers.
   *
   * There is deliberately nothing to fall back to here. Showing another city's
   * attractions under this destination's name would be a wrong answer dressed
   * as a fast one.
   */
  const reportDiscoveryFailure = useCallback((trip: TripRequest, reason: string) => {
    setWorkspace((current) => ({
      ...current,
      phase: "rating",
      attractions: [],
      restaurants: [],
      progress: null,
      degraded: {
        ...current.degraded,
        discovery: `${reason} There is no offline dataset for ${trip.destination.trim()}, so there is nothing to show. ${coveredCityLabels().join(" and ")} work without any research at all.`,
      },
    }));
  }, []);

  const runDiscovery = useCallback(
    async (trip: TripRequest) => {
      const dates = tripDates(trip);
      const dataset = datasetFor(trip.destination);

      commit(trip, (current) => ({
        ...current,
        phase: "discovering",
        progress: { label: "Looking for candidates", done: 0, total: 1 },
      }));

      // A covered city answers from its dataset. Research is for everywhere
      // else, where it is the only way to get real places at all.
      if (dataset) {
        // No notice for a covered city. A committed dataset is the designed
        // path for these two, not a degradation of anything: the places are
        // real, and the travel between them is routed live like anywhere else.
        // Section 4.8 asks that fallbacks be named, and this is not one.
        await runOfflineDiscovery(trip, dataset, null);
        return;
      }

      const status = await harnessStatus();
      if (!status.available) {
        reportDiscoveryFailure(trip, status.reason);
        return;
      }

      try {
        const outcome = await runLiveDiscovery({
          trip,
          dates,
          onProgress: (progress) =>
            commit(trip, (current) =>
              current.phase === "discovering" ? { ...current, progress } : current,
            ),
        });

        if (outcome.attractions.length === 0) {
          reportDiscoveryFailure(trip, "Research returned no usable attractions.");
          return;
        }

        commit(trip, (current) => ({
          ...current,
          phase: "rating",
          sessionId: outcome.sessionId,
          attractions: outcome.attractions,
          restaurants: outcome.restaurants,
          progress: null,
          degraded: {
            ...current.degraded,
            discovery: liveDiscoveryProvenance(trip.destination, {
              attractionCount: outcome.attractions.length,
              restaurantCount: outcome.restaurants.length,
              rejected: outcome.rejected,
            }),
          },
        }));
      } catch (error) {
        reportDiscoveryFailure(
          trip,
          error instanceof Error ? error.message : "Research failed.",
        );
      }
    },
    [commit, runOfflineDiscovery, reportDiscoveryFailure],
  );

  const discover = useCallback(async () => {
    const trip = workspaceRef.current.trip;
    if (trip) await runDiscovery(trip);
  }, [runDiscovery]);

  const createTrip = useCallback(
    async (trip: TripRequest) => {
      liveRef.current = datasetFor(trip.destination) === null;
      setWorkspace({ ...EMPTY, trip, phase: "setup" });
      await runDiscovery(trip);
    },
    [runDiscovery],
  );

  const reset = useCallback(() => {
    const storage = browserStorage();
    if (storage) clearSession(storage);
    liveRef.current = false;
    setWorkspace(EMPTY);
  }, []);

  const setRating = useCallback((attractionId: string, rating: Rating) => {
    setWorkspace((current) =>
      current.ratings[attractionId] === rating
        ? current
        : { ...current, ratings: { ...current.ratings, [attractionId]: rating } },
    );
  }, []);

  /** Schedules with the local greedy builder, saying why if it was a fallback. */
  /**
   * Replaces the plan's estimated legs with routed ones.
   *
   * The plan is passed in rather than read back from state: a state updater has
   * not run by the time the action that queued it continues, so reading it here
   * would find the previous plan, or none at all.
   *
   * Runs after scheduling rather than during it. The planner needs travel times
   * to build a day, and routing every candidate pair to get them is quadratic;
   * routing the itinerary it chose is linear in its stops, and it is what turns
   * "rideshare, estimated" into "Muni N".
   */
  const routePlan = useCallback(
    async (
      plan: Plan,
      trip: TripRequest,
      attractions: Attraction[],
      restaurants: Restaurant[],
    ) => {
      setWorkspace((w) => ({
        ...w,
        progress: { label: "Finding the way between stops", done: 0, total: 1 },
      }));

      try {
        const refined = await refinePlanRoutes(plan, { trip, attractions, restaurants });
        setWorkspace((w) =>
          w.plan
            ? {
                ...w,
                plan: { ...refined.plan, version: w.plan.version },
                progress: null,
                degraded: { ...w.degraded, routing: refined.degraded },
              }
            : w,
        );
      } catch (error) {
        setWorkspace((w) => ({
          ...w,
          progress: null,
          degraded: {
            ...w.degraded,
            routing: `${error instanceof Error ? error.message : "Routing failed."} Travel times are straight-line estimates.`,
          },
        }));
      }
    },
    [],
  );

  /** Schedules with the local greedy builder, returning what it produced. */
  const planLocally = useCallback(
    async (trip: TripRequest, reason?: string): Promise<Plan | null> => {
      await delay(STEP_DELAY_MS);
      const current = workspaceRef.current;
      if (!current.trip) return null;

      const next = runPlan(current);
      commit(trip, () =>
        reason ? { ...next, degraded: { ...next.degraded, optimizer: reason } } : next,
      );
      return next.plan;
    },
    [commit, runPlan],
  );

  const generatePlan = useCallback(async () => {
    const trip = workspaceRef.current.trip;
    if (!trip) return;

    commit(trip, (current) => ({
      ...current,
      phase: "planning",
      progress: { label: "Scheduling your days", done: 0, total: 1 },
    }));

    const current = workspaceRef.current;
    if (!liveRef.current) {
      const built = await planLocally(trip);
      if (built) await routePlan(built, trip, current.attractions, current.restaurants);
      return;
    }

    try {
      const outcome = await runSandboxOptimizer({
        trip,
        dates: tripDates(trip),
        attractions: current.attractions,
        restaurants: current.restaurants,
        ratings: current.ratings,
        onProgress: (label) =>
          commit(trip, (w) =>
            w.phase === "planning" ? { ...w, progress: { label, done: 0, total: 1 } } : w,
          ),
      });

      commit(trip, (w) => ({
        ...w,
        phase: "ready",
        progress: null,
        plan: { ...outcome.plan, version: (w.plan?.version ?? 0) + 1 },
        degraded: {
          ...w.degraded,
          routing: ESTIMATE_NOTICE,
          // The schedule came from code the agent wrote and ran, so there is
          // no optimizer shortfall to report.
          optimizer: null,
          meals: w.trip ? mealNotice(outcome.plan, w.trip.meals) : null,
        },
      }));
      await routePlan(outcome.plan, trip, current.attractions, current.restaurants);
    } catch (error) {
      // A rejected schedule is not a crash: the deterministic planner answers
      // instead, and the reason is shown rather than swallowed.
      const reason =
        error instanceof OptimizerRejected
          ? `The agent's schedule was rejected and replaced by the built-in planner. ${error.violations[0] ?? ""}`
          : `The agent could not schedule this trip, so the built-in planner did. ${
              error instanceof Error ? error.message : ""
            }`;
      const built = await planLocally(trip, reason.trim());
      if (built) await routePlan(built, trip, current.attractions, current.restaurants);
    }
  }, [commit, planLocally, routePlan]);

  const submitRatings = useCallback(async () => {
    await generatePlan();
  }, [generatePlan]);

  return useMemo(
    () => ({
      workspace,
      createTrip,
      discover,
      setRating,
      submitRatings,
      generatePlan,
      replan: generatePlan,
      reset,
    }),
    [workspace, createTrip, discover, setRating, submitRatings, generatePlan, reset],
  );
}

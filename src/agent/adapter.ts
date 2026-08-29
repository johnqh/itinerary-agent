import { useCallback, useMemo, useRef, useState } from "react";
import type {
  DiscoveryOptions,
  ItineraryAgent,
  Rating,
  TripRequest,
  Workspace,
} from "@/types/workspace";
import { buildPlan, tripDates } from "@/planner/build";
import {
  discoveryFallbackNotice,
  discoverySteps,
  liveDiscoveryProvenance,
  mealNotice,
} from "@/agent/notices";
import { seedAttractions, seedRestaurants } from "@/data/seed-tokyo";
import { harnessStatus } from "@/agent/client";
import { runLiveDiscovery } from "@/agent/discovery";

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
  attractions: [],
  restaurants: [],
  ratings: {},
  plan: null,
  progress: null,
  degraded: { discovery: null, routing: null, optimizer: null, meals: null, map: null },
};

const ESTIMATE_NOTICE =
  "Travel times are straight-line estimates. No routing provider is connected, so transit is treated as unavailable.";
const GREEDY_NOTICE =
  "Scheduled by the local greedy builder. The sandboxed optimizer is not connected yet.";

/** Roughly how long the simulated discovery run takes, however many steps it has. */
const DISCOVERY_RUN_MS = 900;
const STEP_DELAY_MS = 220;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useItineraryAgent(): ItineraryAgent {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY);

  // Read by actions that need the current trip before React has re-rendered.
  // A state updater cannot stand in for it: the updater runs when React chooses
  // to, which is after the action that queued it has already moved on.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

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
        optimizer: GREEDY_NOTICE,
        meals: mealNotice(plan, current.trip.meals),
      },
    };
  }, []);

  /**
   * Fills the workspace with seed data and says why live research was skipped.
   *
   * The simulated step delay exists only so the traveller sees the phases the
   * live run would report; it is cosmetic and deliberately brief.
   */
  const runSeedDiscovery = useCallback(
    async (trip: TripRequest, reason: string) => {
      const dates = tripDates(trip);
      const steps = discoverySteps(dates);
      const perStep = Math.max(40, Math.round(DISCOVERY_RUN_MS / steps.length));

      for (const [index, label] of steps.entries()) {
        await delay(perStep);
        const done = index + 1;
        setWorkspace((current) =>
          current.phase === "discovering"
            ? { ...current, progress: { label, done, total: steps.length } }
            : current,
        );
      }

      setWorkspace((current) => ({
        ...current,
        phase: "rating",
        attractions: seedAttractions(dates),
        restaurants: seedRestaurants(dates),
        progress: null,
        degraded: {
          ...current.degraded,
          discovery: discoveryFallbackNotice(reason, trip.destination),
        },
      }));
    },
    [],
  );

  const runDiscovery = useCallback(
    async (trip: TripRequest, options?: DiscoveryOptions) => {
      const dates = tripDates(trip);

      // The offline dataset is the default because live research takes minutes.
      // Nothing about that is hidden: the banner says which one produced the
      // candidates on screen.
      if (!options?.live) {
        setWorkspace((current) => ({ ...current, phase: "discovering" }));
        await runSeedDiscovery(
          trip,
          "Live web research is switched off for this trip.",
        );
        return;
      }

      setWorkspace((current) => ({
        ...current,
        phase: "discovering",
        progress: { label: "Checking research tools", done: 0, total: 1 },
      }));

      const status = await harnessStatus();
      if (!status.available) {
        await runSeedDiscovery(trip, status.reason);
        return;
      }

      try {
        const outcome = await runLiveDiscovery({
          trip,
          dates,
          onProgress: (progress) =>
            setWorkspace((current) =>
              current.phase === "discovering" ? { ...current, progress } : current,
            ),
        });

        // Research that returns nothing usable is a failed run, not an empty
        // city. Falling back beats showing a traveller an empty map.
        if (outcome.attractions.length === 0) {
          await runSeedDiscovery(
            trip,
            "Live research returned no usable attractions.",
          );
          return;
        }

        setWorkspace((current) => ({
          ...current,
          phase: "rating",
          sessionId: outcome.sessionId,
          attractions: outcome.attractions,
          restaurants: outcome.restaurants,
          progress: null,
          degraded: {
            // Provenance is stated on every live run, not only a thin one:
            // "these facts were retrieved just now" is the claim this path
            // makes, and an unlabelled screen makes it invisibly.
            ...current.degraded,
            discovery: liveDiscoveryProvenance(trip.destination, {
              attractionCount: outcome.attractions.length,
              restaurantCount: outcome.restaurants.length,
              rejected: outcome.rejected,
            }),
          },
        }));
      } catch (error) {
        await runSeedDiscovery(
          trip,
          error instanceof Error ? error.message : "Live research failed.",
        );
      }
    },
    [runSeedDiscovery],
  );

  const discover = useCallback(async () => {
    const trip = workspaceRef.current.trip;
    if (trip) await runDiscovery(trip);
  }, [runDiscovery]);

  const createTrip = useCallback(
    async (trip: TripRequest, options?: DiscoveryOptions) => {
      setWorkspace({ ...EMPTY, trip, phase: "setup" });
      await runDiscovery(trip, options);
    },
    [runDiscovery],
  );

  const setRating = useCallback((attractionId: string, rating: Rating) => {
    setWorkspace((current) =>
      current.ratings[attractionId] === rating
        ? current
        : { ...current, ratings: { ...current.ratings, [attractionId]: rating } },
    );
  }, []);

  const generatePlan = useCallback(async () => {
    setWorkspace((current) => ({
      ...current,
      phase: "planning",
      progress: { label: "Scheduling your days", done: 0, total: 1 },
    }));
    await delay(STEP_DELAY_MS);
    setWorkspace((current) => runPlan(current));
  }, [runPlan]);

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
    }),
    [workspace, createTrip, discover, setRating, submitRatings, generatePlan],
  );
}

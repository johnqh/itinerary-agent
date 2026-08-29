import { useCallback, useMemo, useState } from "react";
import type {
  ItineraryAgent,
  Rating,
  TripRequest,
  Workspace,
} from "@/types/workspace";
import { buildPlan, tripDates } from "@/planner/build";
import { seedAttractions, seedRestaurants } from "@/data/seed-tokyo";

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
  attractions: [],
  restaurants: [],
  ratings: {},
  plan: null,
  progress: null,
  degraded: { discovery: null, routing: null, optimizer: null, meals: null, map: null },
};

const SEED_NOTICE =
  "Offline seed dataset. Live research tools are not connected yet, so these facts were not retrieved just now.";
const ESTIMATE_NOTICE =
  "Travel times are straight-line estimates. No routing provider is connected, so transit is treated as unavailable.";
const GREEDY_NOTICE =
  "Scheduled by the local greedy builder. The sandboxed optimizer is not connected yet.";

const STEP_DELAY_MS = 220;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useItineraryAgent(): ItineraryAgent {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY);

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
      },
    };
  }, []);

  const discover = useCallback(async () => {
    let dates: string[] = [];
    setWorkspace((current) => {
      if (!current.trip) return current;
      dates = tripDates(current.trip);
      return {
        ...current,
        phase: "discovering",
        progress: { label: "Researching attractions", done: 0, total: dates.length + 2 },
      };
    });

    // Stepped progress so the discovery phase is observable while it runs.
    for (let step = 1; step <= 2; step++) {
      await delay(STEP_DELAY_MS);
      setWorkspace((current) =>
        current.progress
          ? { ...current, progress: { ...current.progress, done: step } }
          : current,
      );
    }
    await delay(STEP_DELAY_MS);

    setWorkspace((current) => {
      if (!current.trip) return current;
      const resolved = tripDates(current.trip);
      return {
        ...current,
        phase: "rating",
        attractions: seedAttractions(resolved),
        restaurants: seedRestaurants(resolved),
        progress: null,
        degraded: { ...current.degraded, discovery: SEED_NOTICE },
      };
    });
  }, []);

  const createTrip = useCallback(
    async (trip: TripRequest) => {
      setWorkspace({ ...EMPTY, trip, phase: "setup" });
      await discover();
    },
    [discover],
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

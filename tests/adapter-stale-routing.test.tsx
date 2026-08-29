// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Plan } from "@/types/workspace";

/**
 * A route refinement belongs to the plan that started it.
 *
 * Routing runs after scheduling and takes as many provider round trips as the
 * itinerary has legs, and nothing about it moves the workspace out of `ready` —
 * so "Plan again" stays live the whole time. Without an identity check the
 * completion updater applied whatever it had to whatever plan was on screen,
 * stamped with the newer plan's version number: the traveller was shown the
 * previous itinerary's stops and travel times, labelled as the replan they had
 * just asked for.
 */

vi.mock("@/agent/client", () => ({
  harnessStatus: () => Promise.resolve({ available: true, model: "test-model" }),
}));

// The first refinement is the slow one, so it lands after the replan's has
// already been applied. That ordering is the point: it is what happens when
// someone replans while routing is still working through the legs.
let refinements = 0;
vi.mock("@/routing/refinePlan", () => ({
  refinePlanRoutes: async (plan: Plan) => {
    refinements += 1;
    const run = refinements;
    await new Promise((resolve) => setTimeout(resolve, run === 1 ? 400 : 20));
    return {
      plan: { ...plan, summary: `routed by run ${run}` },
      degraded: `notice from run ${run}`,
    };
  },
}));

const { useItineraryAgent } = await import("@/agent/adapter");

describe("a route refinement whose plan was replaced while it was in flight", () => {
  test("never overwrites the newer itinerary", async () => {
    window.localStorage.clear();
    refinements = 0;

    const { result } = renderHook(() => useItineraryAgent());

    await act(async () => {
      await result.current.createTrip({
        destination: "Tokyo",
        startDate: "2026-09-12",
        endDate: "2026-09-13",
        hasRentalCar: false,
        pace: "balanced",
        meals: { cuisines: [], strictness: "flexible" },
      });
    });
    await waitFor(() => expect(result.current.workspace.phase).toBe("rating"), { timeout: 5000 });

    // Plan, then replan before the first refinement can answer.
    await act(async () => {
      const first = result.current.generatePlan();
      const second = result.current.generatePlan();
      await Promise.all([first, second]);
    });

    // Long enough for the abandoned first refinement to finish and try to land.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(refinements).toBe(2);
    expect(result.current.workspace.plan?.summary).toBe("routed by run 2");
    expect(result.current.workspace.degraded.routing).toBe("notice from run 2");
  }, 15000);
});

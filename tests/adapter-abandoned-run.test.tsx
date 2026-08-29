// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * A run belongs to the trip that started it.
 *
 * "New trip" made it possible for the first time to replace a trip while its
 * research is still in flight. Nothing tied a result to the trip that asked for
 * it, so the abandoned run wrote its candidates, its session id and its
 * provenance notice into whichever trip happened to be on screen when it
 * landed. The traveller was then shown a header naming one city, a candidate
 * list from another, and a banner claiming the web had been researched for a
 * destination this trip never asked about — a fact the run did not establish
 * about the trip it is displayed on.
 */

vi.mock("@/agent/client", () => ({
  harnessStatus: () => Promise.resolve({ available: true, model: "test-model" }),
}));

vi.mock("@/components/MapView", () => ({ default: () => <div>map</div> }));

// The abandoned run is the slow one, so it lands after the replacement trip is
// already on screen. That ordering is the whole point: it is what happens when
// someone gives up on a slow live run and starts a different city.
let runs = 0;
vi.mock("@/agent/discovery", async () => {
  const { seedAttractions, seedRestaurants } = await import("@/data/seed-tokyo");
  return {
    runLiveDiscovery: async ({
      trip,
      dates,
    }: {
      trip: { destination: string };
      dates: string[];
    }) => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, runs === 1 ? 900 : 50));
      return {
        sessionId: `sess-${runs}`,
        attractions: seedAttractions(dates).map((a) => ({
          ...a,
          name: `${trip.destination} — ${a.name}`,
        })),
        restaurants: seedRestaurants(dates),
        rejected: [],
      };
    },
  };
});

const App = (await import("@/App")).default;

async function startLiveTrip(destination: string) {
  fireEvent.change(screen.getByDisplayValue(/Japan/), {
    target: { value: destination },
  });
  fireEvent.click(await screen.findByLabelText(/Research this destination live/));
  fireEvent.click(screen.getByRole("button", { name: "Find attractions" }));
}

describe("a run whose trip was replaced while it was in flight", () => {
  test("never lands on the trip that replaced it", async () => {
    window.localStorage.clear();
    render(<App />);

    await startLiveTrip("Tokyo, Japan");
    // Give up on the slow run and plan somewhere else instead.
    fireEvent.click(await screen.findByRole("button", { name: "New trip" }));
    await startLiveTrip("Kyoto, Japan");

    await screen.findByRole("button", { name: "Plan these days" }, { timeout: 5000 });
    // Long enough for the abandoned Tokyo run to finish and try to land.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(document.querySelector("h1")?.textContent).toBe("Kyoto, Japan");
    expect(screen.queryAllByText(/Tokyo, Japan — /)).toHaveLength(0);
    expect(screen.queryAllByText(/Kyoto, Japan — /).length).toBeGreaterThan(0);
    // Section 4.8: the banner may only state what this trip's run established.
    expect(screen.queryByText(/Researched live from the web for Tokyo, Japan/)).toBeNull();
  });
});

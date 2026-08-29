// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * "New trip" has to discard the trip, not just the itinerary.
 *
 * The agent's workspace is only half of what the traveller sees: which
 * candidate is open, which day is showing, and which degraded modes are named
 * all live in `App`. Those describe the trip that was discarded, so a
 * replacement trip that reuses the same candidate ids would otherwise open on
 * the previous trip's selection and repeat the previous trip's map warning —
 * a notice about a run that never happened, which is exactly what section 4.8
 * forbids.
 */

// The harness is not reachable from a test, and this behaviour does not depend
// on it: the offline seed path exercises the same reset.
vi.mock("@/agent/client", () => ({
  harnessStatus: () => Promise.resolve({ available: false, reason: "No harness." }),
}));

const TILE_NOTICE = "Base map tiles are not loading.";

// Leaflet needs a real layout and canvas, neither of which jsdom has. The map
// matters here only as the thing that reports a tile failure, so the stand-in
// is a button that reports one.
vi.mock("@/components/MapView", () => ({
  default: ({ onTileError }: { onTileError: (notice: string) => void }) => (
    <button type="button" onClick={() => onTileError(TILE_NOTICE)}>
      break the tiles
    </button>
  ),
}));

const App = (await import("@/App")).default;

/**
 * Runs the offline discovery pass and waits for the rating step.
 *
 * The destination is set explicitly: this test is about what a reset discards,
 * not about which city, and naming one keeps it independent of whichever city
 * the form happens to default to.
 */
async function planATrip() {
  fireEvent.change(screen.getByRole("textbox", { name: /Destination/i }), {
    target: { value: "Tokyo, Japan" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find attractions" }));
  await screen.findByRole("button", { name: "Plan these days" }, { timeout: 5000 });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("starting a new trip", () => {
  test("leaves nothing of the previous trip on screen", async () => {
    render(<App />);
    await planATrip();

    fireEvent.click(screen.getByRole("button", { name: /Sensō-ji/ }));
    expect(screen.getByLabelText("Close details")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "break the tiles" }));
    expect(screen.getByText(TILE_NOTICE)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "New trip" }));
    // The same seed dataset, so every candidate id is the one just discarded.
    await planATrip();

    expect(screen.queryByLabelText("Close details")).toBeNull();
    expect(screen.queryByText(TILE_NOTICE)).toBeNull();
  });
});

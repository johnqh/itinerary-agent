import { useCallback, useMemo, useState } from "react";
import { useItineraryAgent } from "@/agent/adapter";
import { tripDates as datesForTrip } from "@/planner/build";
import { SEED_CENTER } from "@/data/seed-tokyo";
import CandidateList from "@/components/CandidateList";
import DayTabs from "@/components/DayTabs";
import DegradedBanner from "@/components/DegradedBanner";
import DetailPanel from "@/components/DetailPanel";
import Legend from "@/components/Legend";
import MapView from "@/components/MapView";
import RestaurantPanel from "@/components/RestaurantPanel";
import Timeline from "@/components/Timeline";
import TripForm from "@/components/TripForm";
import type { Selection } from "@/types/workspace";

export default function App() {
  const agent = useItineraryAgent();
  const { workspace } = agent;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  // Map tiles are the one dependency the adapter cannot observe: only the
  // component that mounts Leaflet learns the provider stopped answering.
  const [mapNotice, setMapNotice] = useState<string | null>(null);

  const dates = useMemo(
    () => (workspace.trip ? datesForTrip(workspace.trip) : []),
    [workspace.trip],
  );

  const selectedAttraction = useMemo(
    () =>
      selection?.kind === "attraction"
        ? (workspace.attractions.find((a) => a.id === selection.id) ?? null)
        : null,
    [workspace.attractions, selection],
  );

  const selectedRestaurant = useMemo(
    () =>
      selection?.kind === "restaurant"
        ? (workspace.restaurants.find((r) => r.id === selection.id) ?? null)
        : null,
    [workspace.restaurants, selection],
  );

  const degraded = useMemo(
    () => ({ ...workspace.degraded, map: mapNotice }),
    [workspace.degraded, mapNotice],
  );

  const handleTileError = useCallback((notice: string) => setMapNotice(notice), []);

  if (!workspace.trip) {
    return <TripForm onSubmit={agent.createTrip} />;
  }

  const plan = workspace.plan;
  const day = plan?.days[Math.min(activeDayIndex, plan.days.length - 1)] ?? null;
  const busy = workspace.phase === "discovering" || workspace.phase === "planning";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">{workspace.trip.destination}</h1>
          <p className="text-xs text-neutral-500">
            {workspace.trip.startDate} to {workspace.trip.endDate} · {workspace.trip.pace}
            {workspace.trip.hasRentalCar ? " · rental car" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {workspace.phase === "rating" && (
            <button
              type="button"
              onClick={agent.submitRatings}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Generate plan
            </button>
          )}
          {workspace.phase === "ready" && (
            <button
              type="button"
              onClick={agent.replan}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium"
            >
              Plan again
            </button>
          )}
        </div>
      </header>

      <DegradedBanner degraded={degraded} />

      {busy && workspace.progress && (
        <div className="border-b border-neutral-200 bg-white px-4 py-2 text-xs text-neutral-600">
          {workspace.progress.label}… ({workspace.progress.done}/{workspace.progress.total})
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <section className="flex w-[26rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-neutral-200 bg-neutral-50 p-3">
          {plan && (
            <>
              <DayTabs
                dates={plan.days.map((d) => d.date)}
                activeIndex={Math.min(activeDayIndex, plan.days.length - 1)}
                onSelect={setActiveDayIndex}
              />
              <Legend />
              {day && (
                <Timeline
                  day={day}
                  attractions={workspace.attractions}
                  restaurants={workspace.restaurants}
                  selection={selection}
                  onSelect={setSelection}
                />
              )}
              <p className="text-xs text-neutral-500">
                {plan.summary} Version {plan.version}. {plan.diagnostics.included} of{" "}
                {plan.diagnostics.considered} candidates scheduled.
              </p>
            </>
          )}

          {workspace.attractions.length > 0 && (
            <>
              <h2 className="pt-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                {plan ? "Adjust interest and plan again" : "Rate what interests you"}
              </h2>
              <CandidateList
                attractions={workspace.attractions}
                ratings={workspace.ratings}
                tripDates={dates}
                excludedIds={plan?.excludedAttractionIds ?? []}
                selection={selection}
                onSelect={setSelection}
                onRate={agent.setRating}
              />
            </>
          )}
        </section>

        <section className="relative min-w-0 flex-1">
          <MapView
            center={SEED_CENTER}
            attractions={workspace.attractions}
            restaurants={workspace.restaurants}
            day={day}
            excludedIds={plan?.excludedAttractionIds ?? []}
            selection={selection}
            onSelect={setSelection}
            onTileError={handleTileError}
          />
          {(selectedAttraction || selectedRestaurant) && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-[400] flex items-end p-3">
              <div className="pointer-events-auto">
                {selectedAttraction ? (
                  <DetailPanel
                    attraction={selectedAttraction}
                    tripDates={dates}
                    onClose={() => setSelection(null)}
                  />
                ) : (
                  <RestaurantPanel
                    restaurant={selectedRestaurant!}
                    meal={
                      day?.items.find(
                        (i) => i.kind === "meal" && i.refId === selectedRestaurant!.id,
                      )?.meal
                    }
                    tripDates={dates}
                    onClose={() => setSelection(null)}
                  />
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

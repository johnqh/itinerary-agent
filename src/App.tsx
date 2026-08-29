import { useCallback, useEffect, useMemo, useState } from "react";
import { useItineraryAgent } from "@/agent/adapter";
import { harnessStatus } from "@/agent/client";
import { tripDates as datesForTrip } from "@/planner/build";
import { SEED_CENTER } from "@/data/seed-tokyo";
import { focusCenter } from "@/lib/bounds";
import CandidateList from "@/components/CandidateList";
import DayTabs from "@/components/DayTabs";
import DegradedBanner from "@/components/DegradedBanner";
import DetailPanel from "@/components/DetailPanel";
import Legend from "@/components/Legend";
import MapView from "@/components/MapView";
import RestaurantPanel from "@/components/RestaurantPanel";
import LegPanel from "@/components/LegPanel";
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

  // Asked once on mount so the setup form can tell the truth about whether a
  // destination other than the seed city can actually be researched.
  const [liveResearch, setLiveResearch] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void harnessStatus().then((status) => {
      if (!cancelled) setLiveResearch(status.available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Live research can return any city, so the map opens on whatever was found
  // and only falls back to the seed city while there is nothing to show.
  const mapCenter = useMemo(
    () =>
      focusCenter(
        [
          ...workspace.attractions.map((a) => a.location),
          ...workspace.restaurants.map((r) => r.location),
        ],
        SEED_CENTER,
      ),
    [workspace.attractions, workspace.restaurants],
  );

  const selectedLeg = useMemo(() => {
    const current = workspace.plan;
    if (selection?.kind !== "leg" || !current) return null;
    const legDay = current.days.find((d) => d.date === selection.date);
    const leg = legDay?.legs.find((l) => l.fromIndex === selection.fromIndex);
    return leg && legDay ? { leg, day: legDay } : null;
  }, [selection, workspace.plan]);

  const nameOf = useCallback(
    (refId: string) =>
      workspace.attractions.find((a) => a.id === refId)?.name ??
      workspace.restaurants.find((r) => r.id === refId)?.name ??
      refId,
    [workspace.attractions, workspace.restaurants],
  );

  const degraded = useMemo(
    () => ({ ...workspace.degraded, map: mapNotice }),
    [workspace.degraded, mapNotice],
  );

  const handleTileError = useCallback((notice: string) => setMapNotice(notice), []);

  if (!workspace.trip) {
    return <TripForm onSubmit={agent.createTrip} liveResearch={liveResearch} />;
  }

  const plan = workspace.plan;
  const day = plan?.days[Math.min(activeDayIndex, plan.days.length - 1)] ?? null;
  const busy = workspace.phase === "discovering" || workspace.phase === "planning";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-hairline bg-surface px-4 py-2.5">
        <div className="min-w-0">
          <span className="eyebrow">
            {dates.length} day{dates.length === 1 ? "" : "s"} · {workspace.trip.pace}
            {workspace.trip.hasRentalCar ? " · rental car" : ""}
          </span>
          <h1 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]">
            {workspace.trip.destination}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="tabular hidden text-[11px] text-muted sm:block">
            {workspace.trip.startDate} → {workspace.trip.endDate}
          </span>
          {workspace.phase === "rating" && (
            <button
              type="button"
              onClick={agent.submitRatings}
              className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Plan these days
            </button>
          )}
          {workspace.phase === "ready" && (
            <button
              type="button"
              onClick={agent.replan}
              className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-ink"
            >
              Plan again
            </button>
          )}
          <button
            type="button"
            onClick={agent.reset}
            className="rounded-md border border-transparent px-2 py-1.5 text-[13px] text-muted transition-colors hover:border-hairline hover:text-ink"
          >
            New trip
          </button>
        </div>
      </header>

      {workspace.restoredAt && (
        <div className="border-b border-hairline bg-surface px-4 py-1.5">
          <span className="text-[11px] text-muted">
            Picked up where you left off on{" "}
            {new Date(workspace.restoredAt).toLocaleString()}.
          </span>
        </div>
      )}

      <DegradedBanner degraded={degraded} />

      {busy && workspace.progress && (
        <div
          className="border-b border-hairline bg-surface px-4 py-2"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-ink">{workspace.progress.label}</span>
            <span className="tabular text-[11px] text-muted">
              step {workspace.progress.done} of {workspace.progress.total}
            </span>
          </div>
          <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-hairline">
            <div
              className="h-full rounded-full bg-transit transition-[width] duration-500"
              style={{
                width: `${Math.round((workspace.progress.done / Math.max(workspace.progress.total, 1)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <section className="flex w-[27rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-hairline bg-canvas p-3">
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
              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-hairline bg-hairline">
                <div className="bg-surface px-2.5 py-1.5">
                  <dt className="eyebrow">Stops</dt>
                  <dd className="tabular text-[13px]">
                    {plan.diagnostics.included}/{plan.diagnostics.considered}
                  </dd>
                </div>
                <div className="bg-surface px-2.5 py-1.5">
                  <dt className="eyebrow">Travel</dt>
                  <dd className="tabular text-[13px]">
                    {Math.round(plan.diagnostics.transportMinutes / 6) / 10}h
                  </dd>
                </div>
                <div className="bg-surface px-2.5 py-1.5">
                  <dt className="eyebrow">Version</dt>
                  <dd className="tabular text-[13px]">{plan.version}</dd>
                </div>
              </dl>
            </>
          )}

          {workspace.attractions.length > 0 && (
            <>
              <div className="flex items-baseline justify-between gap-2 pt-1">
                <h2 className="eyebrow">
                  {plan ? "Adjust interest, then plan again" : "Rate what interests you"}
                </h2>
                <span className="tabular text-[11px] text-muted">
                  {workspace.attractions.length} found
                </span>
              </div>
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
            center={mapCenter}
            attractions={workspace.attractions}
            restaurants={workspace.restaurants}
            day={day}
            excludedIds={plan?.excludedAttractionIds ?? []}
            selection={selection}
            onSelect={setSelection}
            onTileError={handleTileError}
          />
          {selectedLeg && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-[400] flex items-end p-3">
              <div className="pointer-events-auto">
                <LegPanel
                  leg={selectedLeg.leg}
                  from={selectedLeg.day.items[selectedLeg.leg.fromIndex]}
                  to={selectedLeg.day.items[selectedLeg.leg.toIndex]}
                  nameOf={nameOf}
                  onClose={() => setSelection(null)}
                />
              </div>
            </div>
          )}
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

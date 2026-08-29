import { MODE_COLORS, MODE_LABELS } from "@/lib/modes";
import type { Attraction, PlanDay, Restaurant, Selection } from "@/types/workspace";

interface Props {
  day: PlanDay;
  attractions: Attraction[];
  restaurants: Restaurant[];
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}

/**
 * The day drawn as a route diagram.
 *
 * A continuous spine runs down the day. Each travel segment is coloured by its
 * transport mode and its height grows with the time that leg takes, so a day
 * that is mostly travel looks like one at a glance rather than reading as an
 * evenly spaced list. The colours are the same ones used on the map, so a leg
 * can be matched between the two without a legend lookup.
 */

/** Pixels per travel minute, bounded so one long leg cannot dominate the day. */
const PIXELS_PER_MINUTE = 1.6;
const MIN_SEGMENT = 26;
const MAX_SEGMENT = 96;

function segmentHeight(minutes: number): number {
  return Math.round(
    Math.min(MAX_SEGMENT, Math.max(MIN_SEGMENT, minutes * PIXELS_PER_MINUTE)),
  );
}

export default function Timeline({
  day,
  attractions,
  restaurants,
  selection,
  onSelect,
}: Props) {
  const names = new Map<string, string>();
  const detail = new Map<string, string>();
  for (const a of attractions) {
    names.set(a.id, a.name);
    detail.set(a.id, a.category);
  }
  for (const r of restaurants) {
    names.set(r.id, r.name);
    detail.set(r.id, r.cuisine.slice(0, 2).join(" · "));
  }

  return (
    <ol className="mt-1">
      {day.items.map((item, index) => {
        const leg = day.legs.find((l) => l.fromIndex === index);
        const kind = item.kind === "meal" ? "restaurant" : "attraction";
        const selected = selection?.kind === kind && selection.id === item.refId;
        const isMeal = item.kind === "meal";

        return (
          <li key={`${item.refId}-${item.startTime}`}>
            <div className="grid grid-cols-[3.25rem_1rem_1fr] gap-x-2">
              <div className="tabular pt-[2px] text-right text-[11px] text-muted">
                {item.startTime}
              </div>

              {/* The spine: a stop sitting on the line. */}
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className={`mt-[6px] h-[9px] w-[9px] shrink-0 rounded-full border-2 ${
                    isMeal ? "border-car bg-white" : "border-ink bg-ink"
                  } ${selected ? "ring-2 ring-transit ring-offset-1" : ""}`}
                />
              </div>

              <button
                type="button"
                onClick={() => onSelect({ kind, id: item.refId })}
                className={`-mt-[3px] w-full rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                  selected
                    ? "border-ink bg-white"
                    : "border-transparent hover:border-hairline hover:bg-white"
                }`}
              >
                <div className="text-[13px] font-medium leading-snug">
                  {names.get(item.refId) ?? item.refId}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                  {isMeal && <span className="eyebrow text-car">{item.meal}</span>}
                  <span className="truncate">{detail.get(item.refId)}</span>
                  <span className="tabular">
                    {item.startTime}–{item.endTime}
                  </span>
                </div>
                {item.notes && (
                  <div className="mt-0.5 text-[11px] text-muted">{item.notes}</div>
                )}
              </button>
            </div>

            {leg && (
              <div className="grid grid-cols-[3.25rem_1rem_1fr] gap-x-2">
                <div />
                <div className="flex justify-center">
                  <span
                    aria-hidden
                    style={{
                      backgroundColor: MODE_COLORS[leg.mode],
                      height: segmentHeight(leg.durationMinutes),
                    }}
                    className="my-0.5 w-[3px] rounded-full"
                  />
                </div>
                <div className="flex flex-col justify-center py-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="eyebrow"
                      style={{ color: MODE_COLORS[leg.mode] }}
                    >
                      {MODE_LABELS[leg.mode]}
                    </span>
                    <span className="tabular text-[11px] text-muted">
                      {leg.durationMinutes} min · {(leg.distanceMeters / 1000).toFixed(1)} km
                      {leg.estimated ? " · estimated" : ""}
                    </span>
                  </div>
                  {leg.transitLines && leg.transitLines.length > 0 && (
                    <div className="text-[11px] text-muted">
                      {leg.transitLines.join(", ")}
                    </div>
                  )}
                  {leg.fallbackReason && (
                    <div className="text-[11px] leading-snug text-muted/80">
                      {leg.fallbackReason}
                    </div>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

import { MODE_COLORS, MODE_LABELS } from "@/lib/modes";
import type { PlanItem, RouteLeg } from "@/types/workspace";

interface Props {
  leg: RouteLeg;
  from: PlanItem | undefined;
  to: PlanItem | undefined;
  nameOf: (refId: string) => string;
  onClose: () => void;
}

/**
 * One journey between two stops.
 *
 * The interesting part is not the duration but why this mode: a rider wants
 * the line they are looking for on the platform, and a reader wants to know
 * whether the number in front of them was measured or modelled.
 */
export default function LegPanel({ leg, from, to, nameOf, onClose }: Props) {
  const color = MODE_COLORS[leg.mode];

  return (
    <aside className="w-80 rounded-lg border border-hairline bg-surface/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="eyebrow" style={{ color }}>
            {MODE_LABELS[leg.mode]}
          </span>
          <h2 className="text-[15px] font-semibold leading-snug">
            {from ? nameOf(from.refId) : "Start"} → {to ? nameOf(to.refId) : "End"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close route details"
          className="rounded px-1.5 text-muted hover:bg-ink/5"
        >
          ×
        </button>
      </div>

      {leg.transitLines && leg.transitLines.length > 0 && (
        <div className="mt-3">
          <span className="eyebrow">Ride</span>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {leg.transitLines.map((line, index) => (
              <span key={`${line}-${index}`} className="flex items-center gap-1.5">
                {index > 0 && <span className="text-xs text-muted">then</span>}
                <span
                  className="tabular rounded px-2 py-0.5 text-[13px] font-semibold text-white"
                  style={{ backgroundColor: color }}
                >
                  {line}
                </span>
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {leg.transferCount === 0
              ? "Direct: no changes on the way."
              : `One change on the way, at ${leg.transitLines?.[1] ? "the interchange" : "one stop"}.`}
          </p>
        </div>
      )}

      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Time</dt>
          <dd className="tabular">{leg.durationMinutes} min</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Distance</dt>
          <dd className="tabular">{(leg.distanceMeters / 1000).toFixed(1)} km</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Travel time</dt>
          <dd>{leg.estimated ? "Estimated" : "From the routing provider"}</dd>
        </div>
      </dl>

      {leg.fallbackReason && (
        <p className="mt-3 rounded border border-hairline bg-canvas px-2.5 py-2 text-[11px] leading-snug text-muted">
          <span className="eyebrow block text-ink/60">Why this mode</span>
          {leg.fallbackReason}
        </p>
      )}
    </aside>
  );
}

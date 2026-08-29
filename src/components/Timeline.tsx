import { MODE_COLORS, MODE_LABELS } from "@/lib/modes";
import type { Attraction, PlanDay, Restaurant, Selection } from "@/types/workspace";

interface Props {
  day: PlanDay;
  attractions: Attraction[];
  restaurants: Restaurant[];
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}

export default function Timeline({
  day,
  attractions,
  restaurants,
  selection,
  onSelect,
}: Props) {
  const names = new Map<string, string>();
  for (const a of attractions) names.set(a.id, a.name);
  for (const r of restaurants) names.set(r.id, r.name);

  return (
    <ol className="space-y-1">
      {day.items.map((item, index) => {
        const leg = day.legs.find((l) => l.fromIndex === index);
        const kind = item.kind === "meal" ? "restaurant" : "attraction";
        const selected = selection?.kind === kind && selection.id === item.refId;
        return (
          <li key={`${item.refId}-${item.startTime}`}>
            <button
              type="button"
              onClick={() => onSelect({ kind, id: item.refId })}
              className={`w-full rounded-md border bg-white px-3 py-2 text-left hover:border-neutral-400 ${
                selected ? "border-neutral-900" : "border-neutral-200"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {names.get(item.refId) ?? item.refId}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                  {item.startTime}–{item.endTime}
                </span>
              </div>
              {item.kind === "meal" && (
                <span className="text-xs capitalize text-amber-700">{item.meal}</span>
              )}
              {item.notes && (
                <p className="mt-0.5 text-xs text-neutral-500">{item.notes}</p>
              )}
            </button>

            {leg && (
              <div className="flex items-center gap-2 py-1 pl-3 text-xs text-neutral-600">
                <span
                  className="inline-block h-4 w-0.5 rounded"
                  style={{ backgroundColor: MODE_COLORS[leg.mode] }}
                />
                <span>
                  {MODE_LABELS[leg.mode]} · {leg.durationMinutes} min ·{" "}
                  {(leg.distanceMeters / 1000).toFixed(1)} km
                  {leg.estimated ? " · estimated" : ""}
                </span>
                {leg.transitLines?.length ? (
                  <span className="text-neutral-500">{leg.transitLines.join(", ")}</span>
                ) : null}
                {leg.fallbackReason ? (
                  <span className="text-neutral-400" title={leg.fallbackReason}>
                    why?
                  </span>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

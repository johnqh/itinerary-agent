import { MODE_COLORS, MODE_LABELS } from "@/lib/modes";
import type { TransportMode } from "@/types/workspace";

const MODES: TransportMode[] = ["walk", "transit", "rideshare", "car"];

export default function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600">
      {MODES.map((mode) => (
        <span key={mode} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-5 rounded"
            style={{ backgroundColor: MODE_COLORS[mode] }}
          />
          {MODE_LABELS[mode]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-neutral-400" />
        Not scheduled
      </span>
    </div>
  );
}

import { MODE_COLORS, MODE_LABELS } from "@/lib/modes";
import type { TransportMode } from "@/types/workspace";

const MODES: TransportMode[] = ["walk", "transit", "rideshare", "car"];

export default function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {MODES.map((mode) => (
        <span key={mode} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-[3px] w-4 rounded-full"
            style={{ backgroundColor: MODE_COLORS[mode] }}
          />
          <span className="eyebrow">{MODE_LABELS[mode]}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-muted/40" />
        <span className="eyebrow">Not scheduled</span>
      </span>
    </div>
  );
}

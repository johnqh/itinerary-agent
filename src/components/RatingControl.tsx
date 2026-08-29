import type { Rating } from "@/types/workspace";

const LABELS: Record<Rating, string> = {
  0: "Not interested",
  1: "Maybe",
  2: "Interested",
  3: "Really want to",
  4: "Must see",
};

const VALUES: Rating[] = [0, 1, 2, 3, 4];

interface Props {
  value: Rating | undefined;
  onChange: (rating: Rating) => void;
}

/**
 * Interest, as a five-stop scale.
 *
 * The scale reads left to right from "skip it" to "must see", and the filled
 * run makes the current choice legible without reading the number. Zero is
 * shown as a distinct stop rather than an empty one, because it is a real
 * instruction to the planner, not the absence of an answer.
 */
export default function RatingControl({ value, onChange }: Props) {
  return (
    <div
      className="inline-flex overflow-hidden rounded border border-hairline"
      role="group"
      aria-label="Interest"
    >
      {VALUES.map((rating) => {
        const active = value === rating;
        const filled = value !== undefined && rating > 0 && rating <= value;
        return (
          <button
            key={rating}
            type="button"
            title={LABELS[rating]}
            aria-label={LABELS[rating]}
            aria-pressed={active}
            onClick={() => onChange(rating)}
            className={`h-6 w-7 border-r border-hairline text-[11px] font-medium leading-none transition-colors last:border-r-0 ${
              active && rating === 0
                ? "bg-muted text-white"
                : active
                  ? "bg-ink text-white"
                  : filled
                    ? "bg-ink/10 text-ink"
                    : "bg-surface text-muted hover:bg-ink/5"
            }`}
          >
            {rating === 0 ? "×" : rating}
          </button>
        );
      })}
    </div>
  );
}

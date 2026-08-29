import type { Rating } from "@/types/workspace";

const LABELS: Record<Rating, string> = {
  0: "Not interested",
  1: "Maybe",
  2: "Interested",
  3: "Strong interest",
  4: "Must see",
};

const VALUES: Rating[] = [0, 1, 2, 3, 4];

interface Props {
  value: Rating | undefined;
  onChange: (rating: Rating) => void;
}

export default function RatingControl({ value, onChange }: Props) {
  return (
    <div className="flex gap-1" role="group" aria-label="Interest rating">
      {VALUES.map((rating) => {
        const active = value === rating;
        return (
          <button
            key={rating}
            type="button"
            title={LABELS[rating]}
            aria-label={LABELS[rating]}
            aria-pressed={active}
            onClick={() => onChange(rating)}
            className={`h-7 w-7 rounded-md border text-xs font-medium transition ${
              active
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500"
            }`}
          >
            {rating}
          </button>
        );
      })}
    </div>
  );
}

import RatingControl from "@/components/RatingControl";
import type { Attraction, Rating, Selection } from "@/types/workspace";

interface Props {
  attractions: Attraction[];
  ratings: Record<string, Rating>;
  tripDates: string[];
  excludedIds: string[];
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  onRate: (id: string, rating: Rating) => void;
}

function closedOnSomeDate(attraction: Attraction, dates: string[]): boolean {
  return dates.some((date) => attraction.hoursByDate[date]?.status === "closed");
}

export default function CandidateList({
  attractions,
  ratings,
  tripDates,
  excludedIds,
  selection,
  onSelect,
  onRate,
}: Props) {
  return (
    <ul className="space-y-2">
      {attractions.map((attraction) => {
        const excluded = excludedIds.includes(attraction.id);
        return (
          <li
            key={attraction.id}
            className={`rounded-md border px-3 py-2 ${
              selection?.kind === "attraction" && selection.id === attraction.id
                ? "border-ink bg-white"
                : "border-hairline bg-white"
            } ${excluded ? "opacity-60" : ""}`}
          >
            <button
              type="button"
              onClick={() => onSelect({ kind: "attraction", id: attraction.id })}
              className="w-full text-left"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium leading-snug">{attraction.name}</span>
                <span className="eyebrow shrink-0">{attraction.category}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">
                {attraction.description}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                <span className="tabular rounded bg-ink/5 px-1.5 py-0.5 text-muted">
                  {attraction.estimatedVisitMinutes} min
                </span>
                {attraction.ticketRequired && (
                  <span className="rounded bg-rideshare/10 px-1.5 py-0.5 text-rideshare">
                    Ticket needed
                  </span>
                )}
                {closedOnSomeDate(attraction, tripDates) && (
                  <span className="rounded bg-car/10 px-1.5 py-0.5 text-car">
                    Closed some days
                  </span>
                )}
                {excluded && (
                  <span className="rounded bg-ink/10 px-1.5 py-0.5 text-muted">
                    Not scheduled
                  </span>
                )}
              </div>
            </button>
            <div className="mt-2">
              <RatingControl
                value={ratings[attraction.id]}
                onChange={(rating) => onRate(attraction.id, rating)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

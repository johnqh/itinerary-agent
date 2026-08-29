import RatingControl from "@/components/RatingControl";
import type { Attraction, Rating } from "@/types/workspace";

interface Props {
  attractions: Attraction[];
  ratings: Record<string, Rating>;
  tripDates: string[];
  excludedIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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
  selectedId,
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
              selectedId === attraction.id
                ? "border-neutral-900 bg-white"
                : "border-neutral-200 bg-white"
            } ${excluded ? "opacity-60" : ""}`}
          >
            <button
              type="button"
              onClick={() => onSelect(attraction.id)}
              className="w-full text-left"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{attraction.name}</span>
                <span className="shrink-0 text-xs capitalize text-neutral-500">
                  {attraction.category}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-neutral-600">
                {attraction.description}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
                  {attraction.estimatedVisitMinutes} min
                </span>
                {attraction.ticketRequired && (
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-800">
                    Ticket needed
                  </span>
                )}
                {closedOnSomeDate(attraction, tripDates) && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">
                    Closed some days
                  </span>
                )}
                {excluded && (
                  <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-neutral-700">
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

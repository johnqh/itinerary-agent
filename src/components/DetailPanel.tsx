import type { Attraction } from "@/types/workspace";

interface Props {
  attraction: Attraction;
  tripDates: string[];
  onClose: () => void;
}

function hoursLabel(attraction: Attraction, date: string): string {
  const hours = attraction.hoursByDate[date];
  if (!hours || hours.status === "unknown") return "Hours unknown";
  if (hours.status === "closed") return "Closed";
  return `${hours.open}–${hours.close}`;
}

export default function DetailPanel({ attraction, tripDates, onClose }: Props) {
  return (
    <aside className="max-h-[60%] w-80 overflow-y-auto rounded-lg border border-hairline bg-white/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold leading-snug">{attraction.name}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded px-1.5 text-muted hover:bg-ink/5"
        >
          ×
        </button>
      </div>

      <p className="mt-2 text-sm text-muted">{attraction.description}</p>
      {attraction.practicalNotes && (
        <p className="mt-2 text-xs text-muted">{attraction.practicalNotes}</p>
      )}

      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Typical visit</dt>
          <dd>{attraction.estimatedVisitMinutes} min</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Cost</dt>
          <dd>{attraction.costSummary ?? "Unknown"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Ticket</dt>
          <dd>{attraction.ticketRequired ? "Required" : "Not required"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Source confidence</dt>
          <dd>{Math.round(attraction.confidence * 100)}%</dd>
        </div>
      </dl>

      <h3 className="mt-3 text-xs font-medium text-muted">Opening hours</h3>
      <ul className="mt-1 space-y-0.5 text-xs">
        {tripDates.map((date) => (
          <li key={date} className="flex justify-between gap-2">
            <span className="text-muted">{date}</span>
            <span>{hoursLabel(attraction, date)}</span>
          </li>
        ))}
      </ul>

      {attraction.sources.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-medium text-muted">Sources</h3>
          <ul className="mt-1 space-y-0.5 text-xs">
            {attraction.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline"
                >
                  {source.title ?? source.url}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

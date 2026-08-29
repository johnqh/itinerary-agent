import type { MealKind, Restaurant } from "@/types/workspace";

interface Props {
  restaurant: Restaurant;
  meal?: MealKind;
  tripDates: string[];
  onClose: () => void;
}

function hoursLabel(restaurant: Restaurant, date: string): string {
  const hours = restaurant.hoursByDate[date];
  if (!hours || hours.status === "unknown") return "Hours unknown";
  if (hours.status === "closed") return "Closed";
  return `${hours.open}–${hours.close}`;
}

/**
 * The meal counterpart of the attraction detail panel. Meals are selectable on
 * the map and in the timeline, so they need somewhere to land.
 */
export default function RestaurantPanel({ restaurant, meal, tripDates, onClose }: Props) {
  return (
    <aside className="max-h-[60%] w-80 overflow-y-auto rounded-lg border border-neutral-300 bg-white/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold leading-snug">{restaurant.name}</h2>
          {meal && <p className="text-xs capitalize text-amber-700">{meal} stop</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded px-1.5 text-neutral-500 hover:bg-neutral-100"
        >
          ×
        </button>
      </div>

      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-500">Cuisine</dt>
          <dd className="capitalize">{restaurant.cuisine.join(", ") || "Unknown"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-500">Price</dt>
          <dd>{restaurant.priceLevel ? "¥".repeat(restaurant.priceLevel) : "Unknown"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-500">Source confidence</dt>
          <dd>{Math.round(restaurant.confidence * 100)}%</dd>
        </div>
      </dl>

      <h3 className="mt-3 text-xs font-medium text-neutral-500">Opening hours</h3>
      <ul className="mt-1 space-y-0.5 text-xs">
        {tripDates.map((date) => (
          <li key={date} className="flex justify-between gap-2">
            <span className="text-neutral-500">{date}</span>
            <span>{hoursLabel(restaurant, date)}</span>
          </li>
        ))}
      </ul>

      {restaurant.sources.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-medium text-neutral-500">Sources</h3>
          <ul className="mt-1 space-y-0.5 text-xs">
            {restaurant.sources.map((source) => (
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

interface Props {
  dates: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

function parts(date: string): { weekday: string; day: string } {
  const parsed = new Date(`${date}T00:00:00Z`);
  return {
    weekday: parsed.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
    day: parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

/** Days are a sequence, so they are numbered: the order carries meaning. */
export default function DayTabs({ dates, activeIndex, onSelect }: Props) {
  return (
    <div className="flex gap-1 overflow-x-auto" role="tablist">
      {dates.map((date, index) => {
        const { weekday, day } = parts(date);
        const active = index === activeIndex;
        return (
          <button
            key={date}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(index)}
            className={`min-w-[4.5rem] shrink-0 border-b-2 px-2 pb-1.5 pt-1 text-left transition-colors ${
              active
                ? "border-ink"
                : "border-transparent hover:border-hairline"
            }`}
          >
            <span className={`eyebrow block ${active ? "text-ink" : ""}`}>
              Day {index + 1}
            </span>
            <span
              className={`block text-[12px] leading-tight ${
                active ? "font-medium text-ink" : "text-muted"
              }`}
            >
              {weekday} {day}
            </span>
          </button>
        );
      })}
    </div>
  );
}

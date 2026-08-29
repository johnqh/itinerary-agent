interface Props {
  dates: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

function label(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function DayTabs({ dates, activeIndex, onSelect }: Props) {
  return (
    <div className="flex gap-1 overflow-x-auto" role="tablist">
      {dates.map((date, index) => (
        <button
          key={date}
          type="button"
          role="tab"
          aria-selected={index === activeIndex}
          onClick={() => onSelect(index)}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${
            index === activeIndex
              ? "bg-neutral-900 text-white"
              : "bg-white text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          {label(date)}
        </button>
      ))}
    </div>
  );
}

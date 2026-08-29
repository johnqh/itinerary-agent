import { useState } from "react";
import type { MealStrictness, Pace, TripRequest } from "@/types/workspace";
import { isoDaysFromNow } from "@/lib/dates";
import { MAX_TRIP_DAYS, validateTripDates } from "@/planner/build";
import { coveredCityLabels, datasetFor } from "@/data/datasets";

const CUISINES = [
  "local",
  "japanese",
  "chinese",
  "korean",
  "thai",
  "vietnamese",
  "indian",
  "mexican",
  "italian",
  "french",
  "mediterranean",
  "american",
  "seafood",
  "barbecue",
  "vegetarian",
  "vegan",
  "bakery",
  "cafe",
  "dessert",
  "street food",
  "quick bite",
  "fine dining",
];
const PACES: Pace[] = ["relaxed", "balanced", "packed"];

interface TripFormProps {
  onSubmit: (trip: TripRequest) => void;
  /**
   * Whether live research is actually available. Null while still unknown, so
   * the form says nothing rather than guessing: a stale "not connected" warning
   * is as misleading as a missing one.
   */
  liveResearch: boolean | null;
}

export default function TripForm({ onSubmit, liveResearch }: TripFormProps) {
  const [destination, setDestination] = useState("San Francisco, USA");
  const [startDate, setStartDate] = useState(isoDaysFromNow(14));
  const [endDate, setEndDate] = useState(isoDaysFromNow(16));
  const [hasRentalCar, setHasRentalCar] = useState(false);
  const [pace, setPace] = useState<Pace>("balanced");
  const [cuisines, setCuisines] = useState<string[]>(["japanese", "local"]);
  const [strictness, setStrictness] = useState<MealStrictness>("prefer");
  const [notes, setNotes] = useState("");

  // The planner enforces exactly this rule, so the two cannot disagree.
  const dateError = validateTripDates(startDate, endDate);
  // The destination decides how the trip is researched: a covered city answers
  // from its dataset instantly, anywhere else goes to the research agent.
  const dataset = datasetFor(destination);

  function toggleCuisine(cuisine: string) {
    setCuisines((current) =>
      current.includes(cuisine)
        ? current.filter((c) => c !== cuisine)
        : [...current, cuisine],
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (dateError) return;
    onSubmit({
      destination,
      startDate,
      endDate,
      hasRentalCar,
      pace,
      meals: { cuisines, notes: notes.trim() || undefined, strictness },
    });
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-5 px-6 py-10">
      <header>
        <span className="eyebrow">Compass</span>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em]">
          Plan a trip
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          The agent researches what is worth seeing, stops for you to say what interests
          you, then schedules the days around real opening hours and travel time.
        </p>
      </header>

      <label className="block">
        <span className="text-[13px] font-medium">Destination</span>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-hairline bg-surface px-3 py-2.5 text-[14px]"
        />
      </label>

      {dataset ? null : liveResearch === false ? (

        <p className="rounded-md border border-car/30 bg-car/5 px-3 py-2 text-xs text-ink/80">
          Research is unavailable right now, so a new destination cannot be looked
          up. {coveredCityLabels().join(" and ")} are ready to plan.
        </p>
      ) : (
        <p className="rounded-md border border-hairline bg-surface px-3 py-2 text-xs text-muted">
          Researching {destination.trim() || "a new destination"} takes a few
          minutes. {coveredCityLabels().join(" and ")} are ready now.
        </p>
      )}

      <div className="grid gap-3">
        <label className="block">
          <span className="text-[13px] font-medium">First day</span>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline bg-surface px-3 py-2.5 text-[14px]"
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium">Last day</span>
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline bg-surface px-3 py-2.5 text-[14px]"
          />
        </label>
      </div>
      {dateError ? (
        <p className="text-[12px] text-car">{dateError}</p>
      ) : (
        <p className="text-xs text-muted">
          Up to {MAX_TRIP_DAYS} days are planned in one trip.
        </p>
      )}

      <fieldset>
        <legend className="text-[13px] font-medium">Pace</legend>
        <div className="mt-1 flex gap-2">
          {PACES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPace(option)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                pace === option
                  ? "border-ink bg-ink text-white"
                  : "border-hairline bg-surface hover:border-muted"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={hasRentalCar}
          onChange={(e) => setHasRentalCar(e.target.checked)}
        />
        I will have a rental car
        <span className="text-muted">(car days never mix with transit)</span>
      </label>

      <fieldset>
        <legend className="text-[13px] font-medium">Food preferences</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {CUISINES.map((cuisine) => (
            <button
              key={cuisine}
              type="button"
              onClick={() => toggleCuisine(cuisine)}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${
                cuisines.includes(cuisine)
                  ? "border-ink bg-ink text-white"
                  : "border-hairline bg-surface text-muted hover:border-muted"
              }`}
            >
              {cuisine}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          {(["flexible", "prefer", "strong"] as MealStrictness[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStrictness(option)}
              className={`rounded-md border px-2.5 py-1 text-xs capitalize ${
                strictness === option
                  ? "border-ink bg-ink text-white"
                  : "border-hairline bg-surface hover:border-muted"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Dietary notes, optional"
          className="mt-2 w-full rounded-md border border-hairline px-3 py-2 text-sm"
        />
      </fieldset>

      <button
        type="submit"
        disabled={Boolean(dateError)}
        className="w-full rounded-md bg-ink px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        Find attractions
      </button>
    </form>
  );
}

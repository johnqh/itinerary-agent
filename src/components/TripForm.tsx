import { useState } from "react";
import type { MealStrictness, Pace, TripRequest } from "@/types/workspace";
import { hasSeedData } from "@/agent/notices";
import { isoDaysFromNow } from "@/lib/dates";
import { MAX_TRIP_DAYS, validateTripDates } from "@/planner/build";
import { SEED_DESTINATION } from "@/data/seed-tokyo";

const CUISINES = ["japanese", "local", "italian", "vegetarian", "cafe", "quick bite"];
const PACES: Pace[] = ["relaxed", "balanced", "packed"];

export default function TripForm({ onSubmit }: { onSubmit: (trip: TripRequest) => void }) {
  const [destination, setDestination] = useState(SEED_DESTINATION);
  const [startDate, setStartDate] = useState(isoDaysFromNow(14));
  const [endDate, setEndDate] = useState(isoDaysFromNow(16));
  const [hasRentalCar, setHasRentalCar] = useState(false);
  const [pace, setPace] = useState<Pace>("balanced");
  const [cuisines, setCuisines] = useState<string[]>(["japanese", "local"]);
  const [strictness, setStrictness] = useState<MealStrictness>("prefer");
  const [notes, setNotes] = useState("");

  // The planner enforces exactly this rule, so the two cannot disagree.
  const dateError = validateTripDates(startDate, endDate);
  const destinationCovered = hasSeedData(destination);

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
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-5 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Plan a trip</h1>
        <p className="mt-1 text-sm text-neutral-600">
          The agent researches what is worth seeing, stops for you to say what interests
          you, then schedules the days around real opening hours and travel time.
        </p>
      </header>

      <label className="block">
        <span className="text-sm font-medium">Destination</span>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-neutral-500">
          Live research is not connected yet, so {SEED_DESTINATION} is the only city
          with data.
        </span>
      </label>
      {!destinationCovered && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          There is no data for {destination.trim() || "that destination"} yet. Planning
          will run on the offline {SEED_DESTINATION} dataset, so the attractions, the
          map and the travel times will all be {SEED_DESTINATION}, not{" "}
          {destination.trim() || "your destination"}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">First day</span>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Last day</span>
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      {dateError ? (
        <p className="text-sm text-red-600">{dateError}</p>
      ) : (
        <p className="text-xs text-neutral-500">
          Up to {MAX_TRIP_DAYS} days are planned in one trip.
        </p>
      )}

      <fieldset>
        <legend className="text-sm font-medium">Pace</legend>
        <div className="mt-1 flex gap-2">
          {PACES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPace(option)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                pace === option
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={hasRentalCar}
          onChange={(e) => setHasRentalCar(e.target.checked)}
        />
        I will have a rental car
        <span className="text-neutral-500">(car days never mix with transit)</span>
      </label>

      <fieldset>
        <legend className="text-sm font-medium">Food preferences</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {CUISINES.map((cuisine) => (
            <button
              key={cuisine}
              type="button"
              onClick={() => toggleCuisine(cuisine)}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${
                cuisines.includes(cuisine)
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white text-neutral-700"
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
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white"
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
          className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </fieldset>

      <button
        type="submit"
        disabled={Boolean(dateError)}
        className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
      >
        Find attractions
      </button>
    </form>
  );
}

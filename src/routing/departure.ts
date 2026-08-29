import { parseClock } from "@/planner/time";

/**
 * When a leg is actually travelled, as an instant a routing provider accepts.
 *
 * A transit answer is only true of the moment it was asked about: ask for a
 * route now and you are told which trains run now, whatever date the itinerary
 * is for. So the departure has to travel with the request — and building one
 * needs the destination's zone, because the itinerary is written in the
 * traveller's wall clock while the provider wants a UTC instant.
 *
 * Everything here returns null rather than guessing. A departure derived from
 * this machine's zone, or from an offset that is not in force on that date,
 * would produce a plausible timestamp for the wrong hour — and a transit line
 * looked up at the wrong hour is a fabricated fact, not an approximate one.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The zone's offset from UTC, in minutes, at a given instant.
 *
 * Derived by asking `Intl` what that instant reads as on the zone's wall clock
 * and measuring the gap. There is no API that answers this directly, and there
 * is no fixed offset to hard-code: the same zone is an hour apart either side
 * of a daylight-saving change.
 */
function offsetMinutesAt(instant: number, timeZone: string): number | null {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(instant));
  } catch {
    // An unknown zone name. Better no departure than one built on a guess.
    return null;
  }

  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    // `hour12: false` reports midnight as 24 in some runtimes.
    read("hour") % 24,
    read("minute"),
    read("second"),
  );
  return Number.isFinite(wall) ? (wall - instant) / 60_000 : null;
}

/**
 * `YYYY-MM-DD` plus `HH:MM` in `timeZone`, as an RFC 3339 UTC instant.
 *
 * The offset is measured twice: once at the naive instant, then again at the
 * corrected one. A single pass is wrong for the hours either side of a
 * daylight-saving change, which is when the offset the clock reading needs and
 * the offset the naive instant reports are not the same one.
 */
export function departureInstant(
  date: string,
  clock: string,
  timeZone: string | undefined,
): string | null {
  if (!timeZone || !DATE.test(date)) return null;
  if (parseClock(clock) === null) return null;

  const naive = Date.parse(`${date}T${clock}:00Z`);
  if (!Number.isFinite(naive)) return null;

  const firstOffset = offsetMinutesAt(naive, timeZone);
  if (firstOffset === null) return null;

  const candidate = naive - firstOffset * 60_000;
  const secondOffset = offsetMinutesAt(candidate, timeZone);
  if (secondOffset === null) return null;

  const instant = naive - secondOffset * 60_000;
  return `${new Date(instant).toISOString().slice(0, 19)}Z`;
}

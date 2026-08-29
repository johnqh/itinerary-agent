/**
 * Calendar-date helpers.
 *
 * Trip dates are calendar dates, not instants. Advancing a `Date` with the
 * local-time setters and then serializing it with `toISOString()` mixes two
 * timezones and lands a day early or late wherever the local calendar date
 * differs from the UTC one, which is most of the world for part of every day.
 * These helpers stay in the local calendar from end to end.
 */

/** `YYYY-MM-DD` for the local calendar date of `date`. */
export function toLocalIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` for the local calendar date `days` after `now`. */
export function isoDaysFromNow(days: number, now: Date = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return toLocalIsoDate(date);
}

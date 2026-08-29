import type { Attraction, LatLng, Restaurant } from "@/types/workspace";
import { seedAttractions, seedRestaurants, SEED_CENTER, SEED_DESTINATION } from "@/data/seed-tokyo";
import { sfAttractions, sfRestaurants, SF_CENTER, SF_DESTINATION } from "@/data/seed-sf";

/**
 * The cities that answer instantly from a committed dataset.
 *
 * Everywhere else goes to the research agent. Matching is deliberately on the
 * city itself rather than a substring: "South San Francisco" is a different
 * place, and answering it with San Francisco's attractions would be a wrong
 * answer rather than a fast one.
 */

export interface OfflineDataset {
  key: string;
  label: string;
  center: LatLng;
  /** Names this city is commonly written as, lower case. */
  aliases: string[];
  attractions(dates: string[]): Attraction[];
  restaurants(dates: string[]): Restaurant[];
}

export const OFFLINE_DATASETS: OfflineDataset[] = [
  {
    key: "tokyo",
    label: SEED_DESTINATION,
    center: SEED_CENTER,
    aliases: ["tokyo", "tokyo japan", "東京"],
    attractions: seedAttractions,
    restaurants: seedRestaurants,
  },
  {
    key: "san-francisco",
    label: SF_DESTINATION,
    center: SF_CENTER,
    aliases: ["san francisco", "sf", "san fran"],
    attractions: sfAttractions,
    restaurants: sfRestaurants,
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The city part of a destination: everything before the first comma. "San
 * Francisco, CA" and "San Francisco" are the same city; "South San Francisco"
 * is not.
 */
function cityPart(destination: string): string {
  const [city] = normalize(destination).split(",");
  return (city ?? "").trim();
}

export function datasetFor(destination: string): OfflineDataset | null {
  const city = cityPart(destination);
  if (!city) return null;

  const whole = normalize(destination).replace(/,/g, "");
  return (
    OFFLINE_DATASETS.find(
      (dataset) => dataset.aliases.includes(city) || dataset.aliases.includes(whole),
    ) ?? null
  );
}

/** The cities offline coverage exists for, for anything that needs to say so. */
export function coveredCityLabels(): string[] {
  return OFFLINE_DATASETS.map((d) => d.label);
}

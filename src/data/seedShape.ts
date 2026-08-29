import type { Attraction, Hours, Restaurant } from "@/types/workspace";

/**
 * The shape offline datasets are written in, and how they become contract
 * records.
 *
 * Seeds store a weekly opening pattern rather than per-date hours, so a dataset
 * stays correct whatever dates a trip uses, and a Monday closure still closes
 * on the trip's Monday.
 */

export interface WeeklyHours {
  open: string;
  close: string;
  /** 0 is Sunday, matching the JavaScript weekday numbering. */
  closedWeekdays?: number[];
}

export interface SeedAttraction {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  description: string;
  practicalNotes?: string;
  hours: WeeklyHours;
  visitMinutes: number;
  costSummary?: string;
  ticketRequired: boolean;
  officialUrl?: string;
  photoUrls?: string[];
}

export interface SeedRestaurant {
  id: string;
  name: string;
  cuisine: string[];
  lat: number;
  lng: number;
  priceLevel: 1 | 2 | 3 | 4;
  hours: WeeklyHours;
  photoUrls?: string[];
}

/**
 * Offline records are hand-checked, not retrieved just now, so they claim
 * moderate confidence rather than certainty.
 */
export const SEED_CONFIDENCE = 0.55;

export function hoursForDate(weekly: WeeklyHours, date: string): Hours {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekly.closedWeekdays?.includes(weekday)) return { status: "closed" };
  return { status: "open", open: weekly.open, close: weekly.close };
}

export function buildAttractions(seeds: SeedAttraction[], dates: string[]): Attraction[] {
  return seeds.map((seed) => ({
    id: seed.id,
    name: seed.name,
    category: seed.category,
    location: { lat: seed.lat, lng: seed.lng },
    description: seed.description,
    practicalNotes: seed.practicalNotes,
    hoursByDate: Object.fromEntries(dates.map((d) => [d, hoursForDate(seed.hours, d)])),
    estimatedVisitMinutes: seed.visitMinutes,
    costSummary: seed.costSummary,
    ticketRequired: seed.ticketRequired,
    officialUrl: seed.officialUrl,
    photoUrls: seed.photoUrls ?? [],
    sources: seed.officialUrl ? [{ url: seed.officialUrl, title: "Official site" }] : [],
    confidence: SEED_CONFIDENCE,
  }));
}

export function buildRestaurants(seeds: SeedRestaurant[], dates: string[]): Restaurant[] {
  return seeds.map((seed) => ({
    id: seed.id,
    name: seed.name,
    cuisine: seed.cuisine,
    location: { lat: seed.lat, lng: seed.lng },
    hoursByDate: Object.fromEntries(dates.map((d) => [d, hoursForDate(seed.hours, d)])),
    priceLevel: seed.priceLevel,
    sources: [],
    confidence: SEED_CONFIDENCE,
  }));
}

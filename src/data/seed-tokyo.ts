import type { Attraction, Hours, Restaurant } from "@/types/workspace";

/**
 * Offline seed dataset: Tokyo.
 *
 * This exists so the whole loop stays demonstrable when the research tools are
 * unavailable. The values are approximate and were not retrieved from a source
 * at run time, which is why every record carries a modest confidence and why
 * the workspace shows a degraded-mode banner whenever this data is in use.
 * Live discovery replaces it wholesale.
 */

type WeeklyHours = { open: string; close: string; closedWeekdays?: number[] };

interface SeedAttraction {
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
}

const SEED_ATTRACTIONS: SeedAttraction[] = [
  {
    id: "sensoji",
    name: "Sensō-ji",
    category: "temple",
    lat: 35.7148,
    lng: 139.7967,
    description: "Tokyo's oldest temple, approached through the Kaminarimon gate and Nakamise shopping street.",
    practicalNotes: "Grounds are open at all hours; the main hall keeps shorter hours. Busiest late morning.",
    hours: { open: "06:00", close: "17:00" },
    visitMinutes: 75,
    costSummary: "Free",
    ticketRequired: false,
    officialUrl: "https://www.senso-ji.jp/",
  },
  {
    id: "skytree",
    name: "Tokyo Skytree",
    category: "viewpoint",
    lat: 35.7101,
    lng: 139.8107,
    description: "Broadcasting tower with observation decks at 350m and 450m.",
    practicalNotes: "Timed tickets are cheaper booked ahead. Clearest views early or after sunset.",
    hours: { open: "10:00", close: "21:00" },
    visitMinutes: 90,
    costSummary: "Around ¥2,100 for the lower deck",
    ticketRequired: true,
    officialUrl: "https://www.tokyo-skytree.jp/en/",
  },
  {
    id: "ueno-park",
    name: "Ueno Park",
    category: "park",
    lat: 35.7156,
    lng: 139.7745,
    description: "Large public park holding several of the city's major museums and a pond.",
    hours: { open: "05:00", close: "23:00" },
    visitMinutes: 60,
    costSummary: "Free",
    ticketRequired: false,
  },
  {
    id: "tokyo-national-museum",
    name: "Tokyo National Museum",
    category: "museum",
    lat: 35.7188,
    lng: 139.7766,
    description: "Japan's oldest and largest museum, strongest on classical Japanese art.",
    practicalNotes: "Closed Mondays. The Honkan building alone takes about ninety minutes.",
    hours: { open: "09:30", close: "17:00", closedWeekdays: [1] },
    visitMinutes: 105,
    costSummary: "Around ¥1,000",
    ticketRequired: true,
    officialUrl: "https://www.tnm.jp/",
  },
  {
    id: "akihabara",
    name: "Akihabara Electric Town",
    category: "neighborhood",
    lat: 35.6984,
    lng: 139.7731,
    description: "Dense district of electronics, game, and hobby retailers.",
    hours: { open: "11:00", close: "20:00" },
    visitMinutes: 75,
    costSummary: "Free to browse",
    ticketRequired: false,
  },
  {
    id: "imperial-gardens",
    name: "Imperial Palace East Gardens",
    category: "garden",
    lat: 35.6852,
    lng: 139.7528,
    description: "Former castle grounds, with stone ramparts and a landscaped garden open to the public.",
    practicalNotes: "Closed Mondays and Fridays.",
    hours: { open: "09:00", close: "16:30", closedWeekdays: [1, 5] },
    visitMinutes: 75,
    costSummary: "Free",
    ticketRequired: false,
  },
  {
    id: "ginza",
    name: "Ginza",
    category: "neighborhood",
    lat: 35.6717,
    lng: 139.765,
    description: "Flagship retail district, notable for its architecture and weekend pedestrian streets.",
    hours: { open: "11:00", close: "20:00" },
    visitMinutes: 60,
    ticketRequired: false,
  },
  {
    id: "tsukiji-outer",
    name: "Tsukiji Outer Market",
    category: "market",
    lat: 35.6654,
    lng: 139.7707,
    description: "Street market of seafood, produce, and knife shops surviving the inner market's move.",
    practicalNotes: "Mornings only in practice; many stalls close by early afternoon.",
    hours: { open: "06:00", close: "14:00" },
    visitMinutes: 60,
    ticketRequired: false,
  },
  {
    id: "teamlab-planets",
    name: "teamLab Planets",
    category: "museum",
    lat: 35.6497,
    lng: 139.7906,
    description: "Immersive digital art installation walked barefoot through water and light rooms.",
    practicalNotes: "Timed entry, sold out most days. Wear clothing you can roll above the knee.",
    hours: { open: "09:00", close: "21:00" },
    visitMinutes: 90,
    costSummary: "Around ¥3,800",
    ticketRequired: true,
    officialUrl: "https://www.teamlab.art/e/planets/",
  },
  {
    id: "shibuya-crossing",
    name: "Shibuya Scramble Crossing",
    category: "viewpoint",
    lat: 35.6595,
    lng: 139.7005,
    description: "The intersection that empties in every direction at once, best seen from above.",
    hours: { open: "00:00", close: "23:59" },
    visitMinutes: 40,
    costSummary: "Free",
    ticketRequired: false,
  },
  {
    id: "meiji-jingu",
    name: "Meiji Jingū",
    category: "shrine",
    lat: 35.6764,
    lng: 139.6993,
    description: "Shinto shrine set in a dense planted forest beside Harajuku.",
    practicalNotes: "Opens at sunrise and closes at sunset; hours shift through the year.",
    hours: { open: "06:00", close: "17:00" },
    visitMinutes: 75,
    costSummary: "Free",
    ticketRequired: false,
  },
  {
    id: "shinjuku-gyoen",
    name: "Shinjuku Gyoen",
    category: "garden",
    lat: 35.6852,
    lng: 139.71,
    description: "Large garden combining English, French, and Japanese landscape styles.",
    practicalNotes: "Closed Mondays. Last entry is well before closing.",
    hours: { open: "09:00", close: "16:30", closedWeekdays: [1] },
    visitMinutes: 75,
    costSummary: "Around ¥500",
    ticketRequired: true,
  },
  {
    id: "tmg-observation",
    name: "Metropolitan Government Observation Deck",
    category: "viewpoint",
    lat: 35.6896,
    lng: 139.6917,
    description: "Free observation floor at 202m, with Mount Fuji visible on clear days.",
    hours: { open: "09:30", close: "22:00", closedWeekdays: [1] },
    visitMinutes: 45,
    costSummary: "Free",
    ticketRequired: false,
  },
  {
    id: "harajuku",
    name: "Harajuku and Takeshita Street",
    category: "neighborhood",
    lat: 35.6702,
    lng: 139.7027,
    description: "Youth fashion district, crowded and narrow, next to the Meiji Jingū approach.",
    hours: { open: "10:00", close: "20:00" },
    visitMinutes: 50,
    ticketRequired: false,
  },
];

interface SeedRestaurant {
  id: string;
  name: string;
  cuisine: string[];
  lat: number;
  lng: number;
  priceLevel: 1 | 2 | 3 | 4;
  hours: WeeklyHours;
}

const SEED_RESTAURANTS: SeedRestaurant[] = [
  { id: "r-asakusa", name: "Asakusa tempura counter", cuisine: ["japanese", "local"], lat: 35.7115, lng: 139.796, priceLevel: 2, hours: { open: "11:00", close: "20:00" } },
  { id: "r-ueno", name: "Ueno ramen shop", cuisine: ["japanese", "quick bite"], lat: 35.7115, lng: 139.777, priceLevel: 1, hours: { open: "11:00", close: "22:00" } },
  { id: "r-ginza", name: "Ginza sushi counter", cuisine: ["japanese", "local"], lat: 35.6717, lng: 139.7638, priceLevel: 4, hours: { open: "11:30", close: "21:00" } },
  { id: "r-tsukiji", name: "Tsukiji market kaisendon", cuisine: ["japanese", "local"], lat: 35.6655, lng: 139.77, priceLevel: 2, hours: { open: "07:00", close: "15:00" } },
  { id: "r-shibuya", name: "Shibuya conveyor sushi", cuisine: ["japanese", "quick bite"], lat: 35.6592, lng: 139.6985, priceLevel: 1, hours: { open: "11:00", close: "23:00" } },
  { id: "r-shinjuku", name: "Omoide Yokochō izakaya", cuisine: ["japanese", "local"], lat: 35.6935, lng: 139.6995, priceLevel: 2, hours: { open: "17:00", close: "23:30" } },
  { id: "r-harajuku", name: "Harajuku vegetarian cafe", cuisine: ["cafe", "vegetarian"], lat: 35.6705, lng: 139.703, priceLevel: 2, hours: { open: "09:00", close: "19:00" } },
];

function hoursForDate(weekly: WeeklyHours, date: string): Hours {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekly.closedWeekdays?.includes(weekday)) return { status: "closed" };
  return { status: "open", open: weekly.open, close: weekly.close };
}

/** Seed confidence is deliberately moderate: this data was not retrieved live. */
const SEED_CONFIDENCE = 0.55;

export function seedAttractions(dates: string[]): Attraction[] {
  return SEED_ATTRACTIONS.map((seed) => ({
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
    photoUrls: [],
    sources: seed.officialUrl ? [{ url: seed.officialUrl, title: "Official site" }] : [],
    confidence: SEED_CONFIDENCE,
  }));
}

export function seedRestaurants(dates: string[]): Restaurant[] {
  return SEED_RESTAURANTS.map((seed) => ({
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

export const SEED_DESTINATION = "Tokyo, Japan";
export const SEED_CENTER = { lat: 35.6812, lng: 139.7671 };

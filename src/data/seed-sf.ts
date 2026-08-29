import type { Attraction, Restaurant } from "@/types/workspace";
import { buildAttractions, buildRestaurants, type SeedAttraction, type SeedRestaurant } from "@/data/seedShape";

/**
 * Offline dataset: San Francisco.
 *
 * Hand-checked rather than retrieved at run time, which is why every record
 * carries a modest confidence and why the workspace names offline mode
 * whenever this data is in use. Travel between these places is still resolved
 * by the routing provider, so the transit lines shown are real even though the
 * places came from here.
 */

const SEED_ATTRACTIONS: SeedAttraction[] = [
  {
    id: "golden-gate-bridge",
    name: "Golden Gate Bridge",
    category: "landmark",
    lat: 37.8199,
    lng: -122.4783,
    description: "The 1937 suspension bridge across the strait, walkable end to end in about half an hour each way.",
    practicalNotes: "Windy and cold even in summer. The east sidewalk is for pedestrians; the vista point on the north side is the classic view.",
    hours: { open: "05:00", close: "21:00" },
    visitMinutes: 75,
    costSummary: "Free on foot",
    ticketRequired: false,
    officialUrl: "https://www.goldengate.org/",
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Golden_Gate_Bridge_as_seen_from_Battery_East.jpg/3840px-Golden_Gate_Bridge_as_seen_from_Battery_East.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"],
  },
  {
    id: "alcatraz",
    name: "Alcatraz Island",
    category: "museum",
    lat: 37.827,
    lng: -122.423,
    description: "The former federal prison on an island in the bay, reached only by the official ferry.",
    practicalNotes: "Ferry tickets sell out weeks ahead. Budget the round trip, not just the island time.",
    hours: { open: "08:45", close: "18:30" },
    visitMinutes: 180,
    costSummary: "Around $45 with the ferry",
    ticketRequired: true,
    officialUrl: "https://www.nps.gov/alca/",
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/1/17/Alcatraz_2021.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"],
  },
  {
    id: "fishermans-wharf",
    name: "Fisherman's Wharf",
    category: "neighborhood",
    lat: 37.808,
    lng: -122.4177,
    description: "The waterfront tourist district, with sea lions hauled out on the K-dock at Pier 39.",
    practicalNotes: "Busiest in the middle of the day. The sea lions are loudest in winter.",
    hours: { open: "09:00", close: "22:00" },
    visitMinutes: 60,
    costSummary: "Free to walk",
    ticketRequired: false,
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/a/ae/Fishermans_Wharf_Sign%2C_SF%2C_CA%2C_jjron_25.03.2012.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"],
  },
  {
    id: "painted-ladies",
    name: "Painted Ladies",
    category: "landmark",
    lat: 37.7763,
    lng: -122.4324,
    description: "The row of Victorian houses on Steiner Street, seen across the slope of Alamo Square Park.",
    practicalNotes: "The photograph everyone wants is from the top of the park lawn, not the pavement.",
    hours: { open: "06:00", close: "22:00" },
    visitMinutes: 30,
    costSummary: "Free",
    ticketRequired: false,
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Painted_Ladies_San_Francisco_January_2013_panorama_2.jpg/3840px-Painted_Ladies_San_Francisco_January_2013_panorama_2.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"],
  },
  {
    id: "golden-gate-park",
    name: "Golden Gate Park",
    category: "park",
    lat: 37.7694,
    lng: -122.4862,
    description: "A park larger than Central Park, running from the Haight to the ocean.",
    practicalNotes: "Too big to cross on foot casually. JFK Drive is car-free on weekends.",
    hours: { open: "05:00", close: "24:00" },
    visitMinutes: 75,
    costSummary: "Free",
    ticketRequired: false,
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/6/66/California-06241_-_In_front_of_museum_%2820449897948%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"],
  },
  {
    id: "de-young",
    name: "de Young Museum",
    category: "museum",
    lat: 37.7715,
    lng: -122.4686,
    description: "Fine arts museum in the park, with a free observation tower over the city.",
    practicalNotes: "Closed Mondays. The tower is free even without a ticket.",
    hours: { open: "09:30", close: "17:15", closedWeekdays: [1] },
    visitMinutes: 105,
    costSummary: "Around $20",
    ticketRequired: true,
    officialUrl: "https://www.famsf.org/",
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/d/d1/Famsf-logo-2024.png?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"],
  },
  {
    id: "cal-academy",
    name: "California Academy of Sciences",
    category: "museum",
    lat: 37.7699,
    lng: -122.4661,
    description: "Aquarium, planetarium, rainforest and natural history museum under one living roof.",
    practicalNotes: "Very busy with families at weekends. The rainforest dome has timed entry.",
    hours: { open: "09:30", close: "17:00" },
    visitMinutes: 150,
    costSummary: "Around $40",
    ticketRequired: true,
    officialUrl: "https://www.calacademy.org/",
    photoUrls: ["https://upload.wikimedia.org/wikipedia/en/2/26/California_Academy_of_Sciences_Logo.png?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"],
  },
  {
    id: "ferry-building",
    name: "Ferry Building Marketplace",
    category: "market",
    lat: 37.7955,
    lng: -122.3937,
    description: "The 1898 ferry terminal, now a food hall of local producers, with a farmers' market outside.",
    practicalNotes: "The farmers' market runs Tuesday, Thursday and Saturday mornings.",
    hours: { open: "07:00", close: "20:00" },
    visitMinutes: 60,
    costSummary: "Free to browse",
    ticketRequired: false,
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Ferry_Building_San_Francisco_from_Hyatt_Regency_with_R-Evolution_and_Bay_Bridge_2026_dllu.jpg/3840px-Ferry_Building_San_Francisco_from_Hyatt_Regency_with_R-Evolution_and_Bay_Bridge_2026_dllu.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"],
  },
  {
    id: "chinatown-sf",
    name: "Chinatown",
    category: "neighborhood",
    lat: 37.7908,
    lng: -122.4056,
    description: "The oldest Chinatown in North America, entered through the Dragon Gate on Grant Avenue.",
    practicalNotes: "Ross Alley and Waverly Place are the interesting walks, not Grant Avenue itself.",
    hours: { open: "08:00", close: "21:00" },
    visitMinutes: 75,
    costSummary: "Free to walk",
    ticketRequired: false,
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/7/75/San_Francisco_China_Town_MC.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"],
  },
  {
    id: "coit-tower",
    name: "Coit Tower",
    category: "viewpoint",
    lat: 37.8024,
    lng: -122.4058,
    description: "Art deco tower on Telegraph Hill, with 1930s murals in the lobby and a view from the top.",
    practicalNotes: "Reach it up the Filbert Steps rather than by road. Lift to the top costs extra.",
    hours: { open: "10:00", close: "18:00" },
    visitMinutes: 60,
    costSummary: "Around $10 for the lift",
    ticketRequired: true,
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/f/fc/Coit_Tower_1.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"],
  },
  {
    id: "lombard-street",
    name: "Lombard Street",
    category: "landmark",
    lat: 37.8021,
    lng: -122.4187,
    description: "The switchback block on Russian Hill, eight hairpin turns down a brick lane.",
    practicalNotes: "Walk it. Driving down means queueing, and the view is from the pavement anyway.",
    hours: { open: "06:00", close: "22:00" },
    visitMinutes: 25,
    costSummary: "Free",
    ticketRequired: false,
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/d/d1/Lombard_Street_2020.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"],
  },
  {
    id: "exploratorium",
    name: "Exploratorium",
    category: "museum",
    lat: 37.8017,
    lng: -122.3973,
    description: "A hands-on museum of science and perception on Pier 15.",
    practicalNotes: "Closed Mondays. Adults-only evenings on Thursdays.",
    hours: { open: "10:00", close: "17:00", closedWeekdays: [1] },
    visitMinutes: 150,
    costSummary: "Around $40",
    ticketRequired: true,
    officialUrl: "https://www.exploratorium.edu/",
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/3/32/Main_Entrance_to_the_Exploratorium_at_Pier_15.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"],
  },
  {
    id: "dolores-park",
    name: "Mission Dolores Park",
    category: "park",
    lat: 37.7596,
    lng: -122.4269,
    description: "The sloping park where the Mission spends sunny afternoons, with a skyline view from the top corner.",
    practicalNotes: "The south-west slope gets the sun longest. Nearby taquerias are the point.",
    hours: { open: "06:00", close: "22:00" },
    visitMinutes: 45,
    costSummary: "Free",
    ticketRequired: false,
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Dolores_Park_May_2025.jpg/3840px-Dolores_Park_May_2025.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"],
  },
  {
    id: "twin-peaks",
    name: "Twin Peaks",
    category: "viewpoint",
    lat: 37.7544,
    lng: -122.4477,
    description: "The two hills near the geographic centre of the city, with the widest view of it.",
    practicalNotes: "Fog often sits on the summit when the rest of the city is clear. Cold and exposed.",
    hours: { open: "05:00", close: "21:00" },
    visitMinutes: 45,
    costSummary: "Free",
    ticketRequired: false,
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/9/9c/Twin_Peaks_2022_Aerial.png?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"],
  },
];

const SEED_RESTAURANTS: SeedRestaurant[] = [
  { id: "r-tartine", name: "Tartine Bakery", cuisine: ["bakery", "cafe", "local"], lat: 37.7614, lng: -122.4241, priceLevel: 2, hours: { open: "08:00", close: "17:00" } },
  { id: "r-swan", name: "Swan Oyster Depot", cuisine: ["seafood", "local"], lat: 37.7897, lng: -122.4216, priceLevel: 3, hours: { open: "10:30", close: "17:30" } },
  { id: "r-prime-rib", name: "House of Prime Rib", cuisine: ["american", "local"], lat: 37.7924, lng: -122.4224, priceLevel: 4, hours: { open: "17:00", close: "22:00" } },
  { id: "r-la-taqueria", name: "La Taqueria", cuisine: ["mexican", "quick bite"], lat: 37.7509, lng: -122.4181, priceLevel: 1, hours: { open: "11:00", close: "20:45" } },
  { id: "r-zuni", name: "Zuni Caf\u00e9", cuisine: ["californian", "local"], lat: 37.7731, lng: -122.4224, priceLevel: 3, hours: { open: "11:30", close: "22:00" } },
  { id: "r-yank-sing", name: "Yank Sing", cuisine: ["chinese", "dim sum"], lat: 37.7896, lng: -122.3966, priceLevel: 3, hours: { open: "11:00", close: "15:00" } },
  { id: "r-nopa", name: "Nopa", cuisine: ["californian", "local", "vegetarian"], lat: 37.7748, lng: -122.4374, priceLevel: 3, hours: { open: "17:00", close: "23:00" } },
];

export function sfAttractions(dates: string[]): Attraction[] {
  return buildAttractions(SEED_ATTRACTIONS, dates);
}

export function sfRestaurants(dates: string[]): Restaurant[] {
  return buildRestaurants(SEED_RESTAURANTS, dates);
}

export const SF_DESTINATION = "San Francisco, USA";
export const SF_CENTER = { lat: 37.7793, lng: -122.4193 };

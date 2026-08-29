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
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Golden_Gate_Bridge_as_seen_from_Battery_East.jpg/1280px-Golden_Gate_Bridge_as_seen_from_Battery_East.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Golden_Gate_bridge_pillar.jpg/1280px-Golden_Gate_bridge_pillar.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Below_Golden_Gate_Bridge.jpeg/1280px-Below_Golden_Gate_Bridge.jpeg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Alcatraz_2021.jpg/1280px-Alcatraz_2021.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Alcatraz_Island_Flowers.jpg/1280px-Alcatraz_Island_Flowers.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/en/thumb/0/01/Alcatraz_Island_at_Sunset.jpg/500px-Alcatraz_Island_at_Sunset.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/The_Water_Tower_Alactraz.jpg/1280px-The_Water_Tower_Alactraz.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Fishermans_Wharf_Sign%2C_SF%2C_CA%2C_jjron_25.03.2012.jpg/500px-Fishermans_Wharf_Sign%2C_SF%2C_CA%2C_jjron_25.03.2012.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Fishermans_Wharf_aerial_view.jpg/1280px-Fishermans_Wharf_aerial_view.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Painted_Ladies_San_Francisco_January_2013_panorama_2.jpg/1280px-Painted_Ladies_San_Francisco_January_2013_panorama_2.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Imm027.jpg/1280px-Imm027.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
  },
  {
    id: "golden-gate-park",
    name: "Golden Gate Park",
    category: "park",
    lat: 37.7694,
    lng: -122.4862,
    description: "A park larger than Central Park, running from the Haight to the ocean.",
    practicalNotes: "Too big to cross on foot casually. JFK Drive is car-free on weekends.",
    // Midnight is written as the clock the app can parse. A close at or before
    // the open belongs to the following day, so 05:00–00:00 is the full
    // nineteen hours the park is actually open, not an empty interval.
    hours: { open: "05:00", close: "00:00" },
    visitMinutes: 75,
    costSummary: "Free",
    ticketRequired: false,
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/California-06241_-_In_front_of_museum_%2820449897948%29.jpg/1280px-California-06241_-_In_front_of_museum_%2820449897948%29.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Kezar_Stadium_%283540115697%29_%28cropped%29.jpg/1280px-Kezar_Stadium_%283540115697%29_%28cropped%29.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Golden_gate_park_aerial.jpg/500px-Golden_gate_park_aerial.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Golden_Gate_Park_-_Spreckels_Temple_of_Music_02.jpg/1280px-Golden_Gate_Park_-_Spreckels_Temple_of_Music_02.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/M._H._de_Young_Memorial_Museum.jpg/1280px-M._H._de_Young_Memorial_Museum.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/President_Laughing_at_Remarks_By_Queen_Elizabeth_Ii_at_a_Dinner_Honoring_Her_at_M.H._De_Young_Memorial_Museum_in_San_Francisco_California_with_George_Shultz_and_Helena_Shultz_-_DPLA_-_e4a38ca93b2212631332c85f5599ac14.jpg/1280px-thumbnail.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Cover_Pot_for_the_Teotihuacan_show_2017.jpg/1280px-Cover_Pot_for_the_Teotihuacan_show_2017.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Frederic_Edwin_Church_-_Rainy_Season_in_the_Tropics_-_Google_Art_Project.jpg/1280px-Frederic_Edwin_Church_-_Rainy_Season_in_the_Tropics_-_Google_Art_Project.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/California-06239_-_California_Academy_of_Sciences_%2820449900470%29.jpg/1280px-California-06239_-_California_Academy_of_Sciences_%2820449900470%29.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/California_Academy_of_Sciences_Indoor_Rainforest.jpg/1280px-California_Academy_of_Sciences_Indoor_Rainforest.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/California_Academy_of_Sciences_rainforest_scene.jpg/1280px-California_Academy_of_Sciences_rainforest_scene.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Albino_Alligator_2008.jpg/1280px-Albino_Alligator_2008.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Ferry_Building_San_Francisco_from_Hyatt_Regency_with_R-Evolution_and_Bay_Bridge_2026_dllu.jpg/1280px-Ferry_Building_San_Francisco_from_Hyatt_Regency_with_R-Evolution_and_Bay_Bridge_2026_dllu.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/San_Francisco_Ferry_Building_%28cropped%29.jpg/1280px-San_Francisco_Ferry_Building_%28cropped%29.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Second_floor_of_the_Ferry_Building.jpg/1280px-Second_floor_of_the_Ferry_Building.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/San_Francisco_China_Town_MC.jpg/1280px-San_Francisco_China_Town_MC.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Washington_Street_in_Chinatown%2C_San_Francisco.JPG/1280px-Washington_Street_in_Chinatown%2C_San_Francisco.JPG?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Stockton_Street_from_Broadway_70.JPG/1280px-Stockton_Street_from_Broadway_70.JPG?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Chinatown2.jpg/500px-Chinatown2.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Coit_Tower_1.jpg/1280px-Coit_Tower_1.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Coit_Tower_aerial.jpg/1280px-Coit_Tower_aerial.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/San_Francisco_%28CA%2C_USA%29%2C_Coit_Tower_--_2022_--_0891.jpg/1280px-San_Francisco_%28CA%2C_USA%29%2C_Coit_Tower_--_2022_--_0891.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Lombard_Street_2020.jpg/500px-Lombard_Street_2020.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Lombard_Street_San_Francisco_no_cars.jpg/250px-Lombard_Street_San_Francisco_no_cars.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Lombard_Street_-_San_Francisco.jpg/250px-Lombard_Street_-_San_Francisco.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Lombard_Street_%28San_Francisco%29_Sign_Photowalkabout_March_23_2013-8673.jpg/250px-Lombard_Street_%28San_Francisco%29_Sign_Photowalkabout_March_23_2013-8673.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Main_Entrance_to_the_Exploratorium_at_Pier_15.jpg/500px-Main_Entrance_to_the_Exploratorium_at_Pier_15.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Frank_Oppenheimer_with_Exploratorium_Exhibit.jpg/500px-Frank_Oppenheimer_with_Exploratorium_Exhibit.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Inside_exploratorium.jpg/500px-Inside_exploratorium.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Rust_wedge.jpg/1280px-Rust_wedge.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Dolores_Park_May_2025.jpg/1280px-Dolores_Park_May_2025.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/en/thumb/b/b3/Jewishcemetary.jpg/330px-Jewishcemetary.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/en/thumb/6/69/Dykedolores.jpg/500px-Dykedolores.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Mission_Dolores_Park_Map.jpg/1280px-Mission_Dolores_Park_Map.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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
    
    photoUrls: ["https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Twin_Peaks_2022_Aerial.png/1280px-Twin_Peaks_2022_Aerial.png?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Twin_Peaks_Blvd_closure_pedestrian_road.jpg/1280px-Twin_Peaks_Blvd_closure_pedestrian_road.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Twinpeaks.jpg/1280px-Twinpeaks.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail"],
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

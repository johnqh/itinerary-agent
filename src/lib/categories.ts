/**
 * How a kind of place looks, in one place.
 *
 * The map, the list and the detail panel all read from here, so a temple is
 * the same colour and the same glyph wherever it appears. Categories come from
 * research and are open-ended, so matching is on keywords with a sensible
 * default rather than an exhaustive list that live data would immediately
 * escape.
 */

export interface CategoryStyle {
  /** Shown in the map pin and beside the category label. */
  glyph: string;
  /** Pin fill. Chosen to stay distinguishable against a pale map. */
  color: string;
  label: string;
}

const STYLES: { match: string[]; style: CategoryStyle }[] = [
  { match: ["temple", "shrine", "church", "cathedral"], style: { glyph: "⛩️", color: "#C2410C", label: "Temple" } },
  { match: ["museum", "gallery", "art"], style: { glyph: "🏛️", color: "#7C3AED", label: "Museum" } },
  { match: ["park", "garden", "forest"], style: { glyph: "🌳", color: "#15803D", label: "Park" } },
  { match: ["viewpoint", "view", "tower", "observation", "peak", "hill"], style: { glyph: "🔭", color: "#0369A1", label: "Viewpoint" } },
  { match: ["market", "food market", "bazaar"], style: { glyph: "🧺", color: "#B45309", label: "Market" } },
  { match: ["neighborhood", "neighbourhood", "district", "street", "quarter"], style: { glyph: "🏙️", color: "#475569", label: "Neighbourhood" } },
  { match: ["bridge", "landmark", "monument", "statue"], style: { glyph: "🌉", color: "#BE123C", label: "Landmark" } },
  { match: ["beach", "bay", "harbour", "harbor", "pier", "wharf", "waterfront"], style: { glyph: "⚓", color: "#0E7490", label: "Waterfront" } },
  { match: ["zoo", "aquarium", "animal"], style: { glyph: "🐧", color: "#0891B2", label: "Wildlife" } },
  { match: ["castle", "palace", "fort"], style: { glyph: "🏯", color: "#A16207", label: "Castle" } },
];

const DEFAULT_STYLE: CategoryStyle = { glyph: "📍", color: "#334155", label: "Place" };

/** Meals are not a research category; they are placed by the planner. */
export const MEAL_STYLE: CategoryStyle = { glyph: "🍽️", color: "#C2410C", label: "Meal" };

export function categoryStyle(category: string): CategoryStyle {
  const value = category.trim().toLowerCase();
  if (!value) return DEFAULT_STYLE;

  for (const { match, style } of STYLES) {
    if (match.some((keyword) => value.includes(keyword))) return style;
  }
  return DEFAULT_STYLE;
}

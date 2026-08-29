import type { TripRequest } from "@/types/workspace";

/**
 * The research contract: what the agent is asked for, and the exact shape it
 * must answer in.
 *
 * The schema is enforced by the provider (`strict: true`), so the model cannot
 * return prose where a record belongs. Everything the schema cannot express —
 * grounding facts in sources, preferring an explicit unknown to a guess, and
 * spending tool calls efficiently — is stated in the instructions and then
 * re-checked by the normalizer, which treats this output as untrusted.
 */

/**
 * Strict mode requires `required` to name every key in `properties`, so an
 * optional field is expressed as a nullable type rather than an absent one.
 */
const HOURS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "open", "close"],
  properties: {
    status: { type: "string", enum: ["open", "closed", "unknown"] },
    open: { type: ["string", "null"], description: "HH:MM, 24-hour" },
    close: { type: ["string", "null"], description: "HH:MM, 24-hour" },
  },
} as const;

const SOURCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["url", "title"],
  properties: {
    url: { type: "string" },
    title: { type: ["string", "null"] },
  },
} as const;

function placeProperties(dates: string[]) {
  return {
    name: { type: "string" },
    category: { type: "string" },
    lat: { type: "number" },
    lng: { type: "number" },
    hoursByDate: {
      type: "object",
      additionalProperties: false,
      description: "Opening hours keyed by trip date. Use status 'unknown' when not verified.",
      required: dates,
      properties: Object.fromEntries(dates.map((d) => [d, HOURS_SCHEMA])),
    },
    // `minItems` would say "at least one source" in the schema itself, but
    // strict structured outputs reject that keyword and the whole turn fails
    // with an invalid-schema error. The requirement is stated in the
    // description and the instructions, and enforced by the normalizer, which
    // discards any record whose sources do not survive URL validation.
    sources: {
      type: "array",
      description:
        "At least one URL actually opened. A record citing none is discarded.",
      items: SOURCE_SCHEMA,
    },
    confidence: {
      type: "number",
      description: "0 to 1. How well sources support these facts.",
    },
  };
}

export function discoverySchema(dates: string[]) {
  const shared = placeProperties(dates);
  return {
    name: "trip_discovery",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["attractions", "restaurants"],
      properties: {
        attractions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "name", "category", "lat", "lng", "hoursByDate", "sources",
              "confidence", "description", "practicalNotes",
              "estimatedVisitMinutes", "costSummary", "ticketRequired",
              "ticketUrl", "officialUrl", "photoUrls",
            ],
            properties: {
              ...shared,
              description: { type: "string" },
              practicalNotes: { type: ["string", "null"] },
              estimatedVisitMinutes: { type: "number" },
              costSummary: { type: ["string", "null"] },
              ticketRequired: { type: "boolean" },
              ticketUrl: { type: ["string", "null"] },
              officialUrl: { type: ["string", "null"] },
              photoUrls: {
                type: "array",
                description:
                  "One to three direct image URLs whose path ends in .jpg, .jpeg, .png or .webp. Not page URLs.",
                items: { type: "string" },
              },
            },
          },
        },
        restaurants: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "name", "category", "lat", "lng", "hoursByDate", "sources",
              "confidence", "cuisine", "priceLevel",
            ],
            properties: {
              ...shared,
              cuisine: { type: "array", items: { type: "string" } },
              priceLevel: { type: ["number", "null"] },
            },
          },
        },
      },
    },
  };
}

export const DISCOVERY_INSTRUCTIONS = `
You research a destination and return candidate attractions and restaurants for a
traveller, grounded in sources you actually retrieved.

Grounding rules, in order of importance:
1. Never state a fact you did not retrieve. If you did not confirm an opening
   time, set that date's status to "unknown". A guessed closing time sends a
   traveller to a locked door, which is worse than admitting you do not know.
2. Every record needs at least one working source URL you actually opened. A
   record without one is discarded before the traveller sees it, so the work
   spent finding it is wasted.
3. Set confidence honestly: high only when a primary or official source
   confirms the practical details, low when you are inferring from one page.
4. Coordinates must be real decimal degrees for that exact place.

Efficiency rules. Tool calls are the expensive part of this job:
1. Start with one batch search to assemble a candidate list. Prefer the batch
   tools over one call per place.
2. Only then delegate to subagents, and only for candidates whose practical
   details are still missing. Give each subagent a small, specific brief.
3. Never pull a full page when a search result already answers the question.
4. Do not return raw page text. Return only the structured record.

Photographs. Every place needs one to three, and they are the first thing a
traveller judges a place by, so they are not optional detail. Give direct image
URLs — a link whose path ends in .jpg, .jpeg, .png or .webp — not the page the
image sits on, which cannot be displayed. Prefer images from the official site
or an encyclopaedia entry, and prefer a photograph of the place as it is now
over an archive or historical image. If you genuinely cannot find one for a
place, return an empty list rather than a link that is not an image.

Coverage: aim for at least 12 attractions spanning different categories and
neighbourhoods, plus at least 6 restaurants spread across the same areas so a
day anywhere in the city has somewhere to eat.

Do not spend effort finding restaurants. Somewhere to eat is chosen later,
once the days are laid out, by searching near the stops the traveller will
actually be at — so a restaurant found now is a guess about a route that does
not exist yet. If a place is genuinely famous as a destination in its own
right, return it as an attraction instead.

Budget: aim to finish in roughly 40 tool calls. Spending a hundred lookups to
add a fourteenth attraction is a bad trade; breadth of coverage and confirmed
hours matter more than exhaustiveness.

Answer with the JSON object only.
`.trim();

export function discoveryPrompt(trip: TripRequest, dates: string[]): string {
  const cuisines = trip.meals.cuisines.length > 0
    ? trip.meals.cuisines.join(", ")
    : "no particular preference";
  return [
    `Destination: ${trip.destination}`,
    `Trip dates: ${dates.join(", ")}`,
    `Pace: ${trip.pace}`,
    `Getting around: ${trip.hasRentalCar ? "has a rental car" : "on foot and public transport"}`,
    `Food preferences: ${cuisines}`,
    "",
    "Find the attractions and restaurants worth considering for this trip.",
    "Resolve opening hours for each of the listed trip dates specifically:",
    "many places close one weekday, and that changes the plan.",
  ].join("\n");
}

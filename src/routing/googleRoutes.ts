import type { LatLng, TransportMode } from "@/types/workspace";

/**
 * The Google Routes client.
 *
 * This is where the only real transport facts in the system come from: actual
 * travel times, transit line names a rider would recognise, and transfer
 * counts. Everything else in the planner models travel; this measures it.
 *
 * The API key is never handled here. Requests go to `/gmaps` on this origin and
 * the dev and preview servers inject the key server-side, so it stays out of
 * the browser bundle.
 */

export interface ResolvedRoute {
  durationMinutes: number;
  distanceMeters: number;
  polyline?: string;
  transitLines: string[];
  transferCount: number;
}

/** Google's travel modes, keyed by ours. Rideshare is a car journey. */
const TRAVEL_MODE: Record<TransportMode, string> = {
  walk: "WALK",
  transit: "TRANSIT",
  rideshare: "DRIVE",
  car: "DRIVE",
};

const FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.polyline.encodedPolyline",
  "routes.legs.steps.transitDetails.transitLine.name",
  "routes.legs.steps.transitDetails.transitLine.nameShort",
].join(",");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Google returns durations as a seconds string, e.g. "900s". */
function readSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Transfers are rides minus one: two vehicles means one change between them.
 * A route with no transit ride has nothing to transfer between.
 */
export function transferCountOf(transitRides: number): number {
  return Math.max(0, transitRides - 1);
}

function readLineName(step: unknown): string | null {
  if (!isRecord(step)) return null;
  const details = step.transitDetails;
  if (!isRecord(details)) return null;
  const line = details.transitLine;
  if (!isRecord(line)) return null;
  // Riders navigate by the short name on the vehicle ("N"), not the full one.
  const short = typeof line.nameShort === "string" ? line.nameShort.trim() : "";
  const full = typeof line.name === "string" ? line.name.trim() : "";
  return short || full || null;
}

export function parseRouteResponse(payload: unknown, mode: TransportMode): ResolvedRoute | null {
  if (!isRecord(payload)) return null;
  const routes = payload.routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;

  const route = routes[0];
  if (!isRecord(route)) return null;

  const seconds = readSeconds(route.duration);
  if (seconds === null) return null;

  const distance = typeof route.distanceMeters === "number" ? route.distanceMeters : 0;
  const polylineHolder = route.polyline;
  const polyline =
    isRecord(polylineHolder) && typeof polylineHolder.encodedPolyline === "string"
      ? polylineHolder.encodedPolyline
      : undefined;

  // Lines are only meaningful on a transit route. A driving or walking route
  // that happens to carry transit details must not be described by a line name.
  const transitLines: string[] = [];
  for (const leg of mode === "transit" && Array.isArray(route.legs) ? route.legs : []) {
    if (!isRecord(leg)) continue;
    for (const step of Array.isArray(leg.steps) ? leg.steps : []) {
      const name = readLineName(step);
      if (name) transitLines.push(name);
    }
  }

  return {
    durationMinutes: Math.round(seconds / 60),
    distanceMeters: Math.round(distance),
    polyline,
    transitLines,
    transferCount: transferCountOf(transitLines.length),
  };
}

export interface RouteRequest {
  from: LatLng;
  to: LatLng;
  mode: TransportMode;
  /**
   * When the traveller actually makes this journey, as an RFC 3339 UTC
   * instant. Only transit uses it, and only when the itinerary could supply
   * one — see `departureInstant`.
   */
  departureTime?: string;
}

/**
 * Rounded so nearby requests share a cache entry. ~11 m at 4 decimals.
 *
 * The departure is part of the key because it is part of the question: the
 * same two stops at 07:00 and at 23:00 are different journeys, and reusing one
 * answer for the other would report a line that is not running.
 */
export function cacheKey({ from, to, mode, departureTime }: RouteRequest): string {
  const r = (n: number) => n.toFixed(4);
  const at = departureTime ? `@${departureTime}` : "";
  return `${mode}:${r(from.lat)},${r(from.lng)}->${r(to.lat)},${r(to.lng)}${at}`;
}

export class RoutingUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "RoutingUnavailable";
  }
}

/**
 * Resolves one leg. Throws `RoutingUnavailable` when the provider cannot
 * answer, so the caller keeps its estimate rather than showing a wrong number.
 */
export async function resolveRoute(request: RouteRequest): Promise<ResolvedRoute> {
  const response = await fetch("/gmaps/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: request.from.lat, longitude: request.from.lng } } },
      destination: { location: { latLng: { latitude: request.to.lat, longitude: request.to.lng } } },
      travelMode: TRAVEL_MODE[request.mode],
      computeAlternativeRoutes: false,
      // Google evaluates a request at the moment it arrives unless told
      // otherwise, so without this a trip planned for the spring came back
      // described by the trains running this afternoon — the wrong lines, the
      // wrong changes, and sometimes a service that does not run that day at
      // all. Transit only: a departure on a DRIVE request opts into
      // traffic-aware routing, which is billed at the higher tier for an
      // answer a trip planned weeks ahead cannot use.
      ...(request.mode === "transit" && request.departureTime
        ? { departureTime: request.departureTime }
        : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new RoutingUnavailable(
      response.status === 403 || response.status === 401
        ? "The Google Maps key was rejected."
        : `Routing request failed (${response.status}). ${detail.slice(0, 120)}`,
    );
  }

  const parsed = parseRouteResponse(await response.json(), request.mode);
  if (!parsed) throw new RoutingUnavailable("No route was returned for this leg.");
  return parsed;
}

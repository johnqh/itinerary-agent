/**
 * The data contract.
 *
 * Every shape that crosses a boundary is defined here: the agent emits JSON
 * validated against these types, and the workspace renders them. Nothing else
 * in the system may invent a shape.
 */

export type TransportMode = "walk" | "transit" | "rideshare" | "car";

/** 0 not interested, 1 maybe, 2 interested, 3 strong interest, 4 must see. */
export type Rating = 0 | 1 | 2 | 3 | 4;

export type Pace = "relaxed" | "balanced" | "packed";

export type MealStrictness = "flexible" | "prefer" | "strong";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TripRequest {
  destination: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  hasRentalCar: boolean;
  pace: Pace;
  meals: {
    cuisines: string[];
    notes?: string;
    strictness: MealStrictness;
  };
}

/**
 * Opening hours for one date. `unknown` is a first-class value: an explicit
 * unknown is always preferred over a plausible guess.
 */
export type Hours =
  | { status: "open"; open: string; close: string }
  | { status: "closed" }
  | { status: "unknown" };

export interface SourceRef {
  url: string;
  title?: string;
}

export interface Attraction {
  id: string;
  name: string;
  category: string;
  location: LatLng;
  description: string;
  practicalNotes?: string;
  /** Keyed by YYYY-MM-DD. Missing key means the date was never resolved. */
  hoursByDate: Record<string, Hours>;
  estimatedVisitMinutes: number;
  costSummary?: string;
  ticketRequired: boolean;
  ticketUrl?: string;
  officialUrl?: string;
  photoUrls: string[];
  sources: SourceRef[];
  /** 0..1 */
  confidence: number;
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string[];
  location: LatLng;
  hoursByDate: Record<string, Hours>;
  priceLevel?: 1 | 2 | 3 | 4;
  sources: SourceRef[];
  confidence: number;
}

export type MealKind = "lunch" | "dinner";

export interface PlanItem {
  kind: "attraction" | "meal";
  /** Attraction id or restaurant id. */
  refId: string;
  meal?: MealKind;
  /** HH:MM, local to the destination. */
  startTime: string;
  endTime: string;
  notes?: string;
}

export interface RouteLeg {
  /** Index into the day's `items`. */
  fromIndex: number;
  toIndex: number;
  mode: TransportMode;
  durationMinutes: number;
  distanceMeters: number;
  polyline?: string;
  transitLines?: string[];
  transferCount?: number;
  /** Set when a preferred mode was rejected, explaining why. */
  fallbackReason?: string;
  /** True when travel time is a straight-line estimate, not provider data. */
  estimated?: boolean;
}

export interface PlanDay {
  /** YYYY-MM-DD */
  date: string;
  isCarDay: boolean;
  items: PlanItem[];
  legs: RouteLeg[];
  summary: string;
}

export interface ExclusionReason {
  attractionId: string;
  reason: string;
}

export interface PlannerDiagnostics {
  considered: number;
  included: number;
  excluded: ExclusionReason[];
  routeCalls: number;
  cacheHits: number;
  transitAccepted: number;
  transitRejected: number;
  attractionMinutes: number;
  transportMinutes: number;
  score: number;
}

export interface Plan {
  id: string;
  version: number;
  days: PlanDay[];
  excludedAttractionIds: string[];
  summary: string;
  diagnostics: PlannerDiagnostics;
}

export type Phase = "setup" | "discovering" | "rating" | "planning" | "ready";

export interface Progress {
  label: string;
  done: number;
  total: number;
}

/** Which degraded mode, if any, the system is currently running in. */
export interface DegradedState {
  /** Short, user-facing. Null when everything is live. */
  discovery: string | null;
  routing: string | null;
  optimizer: string | null;
}

export interface Workspace {
  phase: Phase;
  trip: TripRequest | null;
  attractions: Attraction[];
  restaurants: Restaurant[];
  ratings: Record<string, Rating>;
  plan: Plan | null;
  progress: Progress | null;
  degraded: DegradedState;
}

/** The interface the workspace UI consumes. The adapter is its only implementer. */
export interface ItineraryAgent {
  workspace: Workspace;
  createTrip(trip: TripRequest): Promise<void>;
  discover(): Promise<void>;
  setRating(attractionId: string, rating: Rating): void;
  submitRatings(): Promise<void>;
  generatePlan(): Promise<void>;
  replan(): Promise<void>;
}

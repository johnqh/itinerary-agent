# Itinerary Agent — Design and Implementation Plan

Status: draft for build day
Deadline: 18:00 today
Harness: TrueForge (`npx @truefoundry/trueforge@latest`, Node 22+, UI on `:8790`, MIT)

## 1. What This Is

A trip-planning agent that turns a destination and a set of dates into a
route-aware, day-by-day itinerary. The agent does the research and the
optimization; the traveler supplies judgment at exactly one point, by rating
which attractions they actually care about.

The product surface is a map-first workspace. The intelligence is an agent
loop that researches with real web tools, pauses for the traveler, and then
computes a schedule by writing and executing its own optimizer code in a
sandbox.

### The Three-Phase Loop

1. **Discover.** Given a location and trip dates, the agent finds candidate
   attractions with the practical facts needed to schedule them: coordinates,
   opening hours on the specific trip dates, visit duration, cost, ticket
   requirements, photos, and source links.
2. **Checkpoint.** The agent stops. The traveler sees every candidate on a map
   and in a ranked list, and rates each one by interest. Nothing is scheduled
   until they respond.
3. **Plan.** The agent generates a multi-day itinerary that visits as many
   high-interest attractions as practical while respecting opening hours,
   visit durations, meal windows, and transportation constraints. Subagents
   parallelize the research and routing; a sandboxed solver does the math.

Replanning re-enters phase 3 with new ratings. Phase 1 is not repeated.

## 2. Why This Shape Fits an Agent Harness

Each judged harness capability has a load-bearing job here. None is decorative.

| Capability | Job in this system |
|---|---|
| Real MCP tools | Live attraction data, opening hours, ticket prices, and reviews come from web-data MCP servers, not model memory. |
| Subagents | Per-attraction research and per-day routing are independent, I/O-bound, and context-heavy. They fan out in parallel and return compact records. |
| Sandboxed code execution | Scheduling is a time-windowed routing problem. The agent writes Python, runs it, reads the objective value, and iterates. Deterministic math, not token math. |
| Human checkpoints | Phase 2 is a hard stop for traveler input. Irreversible actions (sending or exporting a finished itinerary) sit behind tool approval. |
| Persistent sessions | A trip is a long-lived session. Replanning is another turn. A dropped connection resumes mid-turn rather than restarting research. |

The architectural claim worth defending to a reviewer: **subagents handle
research, the sandbox handles optimization.** Language models are good at
extracting facts from messy pages and bad at constraint satisfaction. Splitting
on that line is what makes the plan both accurate and cheap.

## 3. Feature Requirements

### 3.1 Trip Inputs

- Destination (free text, geocoded to a center point).
- Start date and end date, planned as full days.
- Rental car availability.
- Pace: relaxed, balanced, or packed.
- Meal preferences: cuisine tags, free-text dietary notes, and a strictness
  setting of flexible, prefer-when-possible, or strong preference.

Defaults: day window 09:00–20:30. Lunch target 12:00–13:00, acceptable
11:30–13:45. Dinner target 18:00–19:30, acceptable 17:30–20:15.

### 3.2 Phase 1 — Discovery

Must produce at least 12 candidate attractions for a well-covered city, each with:

- Name, category, and coordinates.
- Short description and practical notes.
- Opening hours resolved per trip date, or an explicit unknown.
- Estimated visit duration.
- Cost summary, or an explicit unknown.
- Ticket-required flag and booking or official URL where one exists.
- At least one photo URL where rights permit.
- Source URLs and a confidence score.

Also discovers restaurant candidates with location, cuisine, hours, and price
level, used later for meal insertion.

Requirements:

- Facts must be grounded in retrieved sources. Unknown is a valid value and is
  preferred over a plausible guess.
- Confidence must be exposed in the UI, not hidden.
- Discovery progress must be observable while it runs.

### 3.3 Phase 2 — Human Checkpoint

- All candidates render as category-coded map pins and as a ranked list.
- Selecting a candidate opens a detail panel: photos, summary, practical notes,
  per-date opening hours, cost, ticket link, source links, confidence.
- Each candidate carries a rating control on a 0–4 scale:
  - 0 not interested, 1 maybe, 2 interested, 3 strong interest, 4 must see.
  - Unrated defaults to neutral-low.
  - Rating is idempotent: setting the same value twice is a no-op, not a toggle.
- Badges surface scheduling-relevant warnings: ticket likely needed, closed on
  one or more trip dates, far from the main cluster.
- The agent does not proceed to phase 3 until the traveler submits.

### 3.4 Phase 3 — Planning

Output is one itinerary day per trip date. Each day contains ordered items
(attractions and meals), route legs between adjacent items, and a summary.
Attractions that did not make the cut remain visible as excluded pins.

#### Attraction Scoring

```
score = interestWeight
      + confidenceWeight
      + hoursFitWeight
      - travelPenalty
      - duplicateCategoryPenalty
      - unknownHoursPenalty
      - ticketFrictionPenalty
```

- Rating 0 excludes unless the traveler re-enables it.
- Rating 4 gets strong priority but remains subject to opening hours and
  feasible routing. Must-see does not mean must-fit.
- Strong bonus when open across the likely visit window; penalty when hours are
  unknown; excluded when known closed for every feasible window.
- Isolated attractions that force long travel legs are penalized.
- A day should not fill with near-identical categories unless all are top-rated.

#### Transportation Rules

Mode selection per leg, in order:

1. Walking when estimated walk time is at or below the threshold (default 15
   minutes; hard cap 25 minutes, raised for packed pace, lowered for relaxed).
2. If the day is a car day, all non-walking legs use car.
3. Otherwise request direct transit.
4. Accept transit only when transfer count is 0, duration is within 2x the
   rideshare estimate, and arrival still fits the next item's open window.
5. Otherwise rideshare, estimated from driving time and distance.

Additional rules:

- Transit with any transfer is rejected in this version. If provider data is
  unavailable, transit is treated as unavailable rather than assumed.
- A car day is all-or-nothing: car and transit are not mixed within a date.
  Car days should carry parking notes where discoverable.
- Every leg records its mode, duration, distance, and, where a preferred mode
  was rejected, the reason.

#### Meals

- Lunch inserted near the item closest to midday; dinner near the final
  afternoon or evening cluster.
- Restaurant choice minimizes detour, respects opening hours, and matches
  cuisine preferences according to the strictness setting.
- Meals are re-selected when replanning changes a day's geography.

#### Daily Assembly

1. Drop unusable candidates: no coordinates, rated 0, or closed on all dates.
2. Cluster remaining candidates geographically.
3. Assign clusters to dates, keeping must-see items on their closest feasible day.
4. Order within each day to reduce travel time while satisfying opening hours.
5. Insert lunch, then dinner.
6. Resolve route legs and geometry.
7. Score the day; move infeasible or low-scoring stops to the excluded list.

#### Replanning

- Reuses the existing candidate set and route cache.
- Produces a new plan version rather than mutating the previous one.
- Rating changes must produce visible movement between included and excluded.

#### Diagnostics

Every plan stores: candidates considered, included, excluded with reasons,
route calls made, cache hits, transit legs accepted and rejected, total
attraction time, total transport time, and final score. These make the system
explainable in a demo and debuggable under time pressure.

### 3.5 Explicit Non-Goals

Ticket purchase, real rideshare booking, live parking availability, offline
mode, collaborative planning, guaranteed global transit correctness, and
provably optimal scheduling.

## 4. Technical Design

### 4.1 Layering

```
┌─────────────────────────────────────────────┐
│ Web workspace (Vite + React + Leaflet)      │  map, list, ratings,
│                                             │  date tabs, timeline
├─────────────────────────────────────────────┤
│ Agent adapter hook (TypeScript)             │  turns in, state out
├─────────────────────────────────────────────┤
│ TrueForge harness                           │  agent loop, sessions,
│  agent spec · skills · connectors · sandbox │  approvals, subagents
├──────────────┬───────────────┬──────────────┤
│ Web-data MCP │ Routing data  │ Sandbox      │
└──────────────┴───────────────┴──────────────┘
```

The workspace is presentational and holds no planning logic. The adapter is the
only module that knows the harness exists. The agent holds all intelligence.

A Vite single-page app is used rather than a server-rendered framework. The map
and the restored session are both browser-only concerns, and server rendering
them invites hydration mismatches that cost more to debug than the server render
is worth here.

### 4.2 Data Contract

One shared TypeScript module defines every shape crossing a boundary. The agent
emits JSON validated against it; the UI renders it. This contract is the spine
of the system and is written before anything else.

```ts
export type TransportMode = "walk" | "transit" | "rideshare" | "car";
export type Rating = 0 | 1 | 2 | 3 | 4;
export type Pace = "relaxed" | "balanced" | "packed";

export interface TripRequest {
  destination: string;
  startDate: string;               // YYYY-MM-DD
  endDate: string;                 // YYYY-MM-DD
  hasRentalCar: boolean;
  pace: Pace;
  meals: {
    cuisines: string[];
    notes?: string;
    strictness: "flexible" | "prefer" | "strong";
  };
}

export type Hours =
  | { status: "open"; open: string; close: string }   // HH:MM local
  | { status: "closed" }
  | { status: "unknown" };

export interface Attraction {
  id: string;
  name: string;
  category: string;
  location: { lat: number; lng: number };
  description: string;
  practicalNotes?: string;
  hoursByDate: Record<string, Hours>;
  estimatedVisitMinutes: number;
  costSummary?: string;
  ticketRequired: boolean;
  ticketUrl?: string;
  officialUrl?: string;
  photoUrls: string[];
  sources: { url: string; title?: string }[];
  confidence: number;              // 0..1
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string[];
  location: { lat: number; lng: number };
  hoursByDate: Record<string, Hours>;
  priceLevel?: 1 | 2 | 3 | 4;
  sources: { url: string; title?: string }[];
  confidence: number;
}

export interface PlanItem {
  kind: "attraction" | "meal";
  refId: string;
  startTime: string;               // HH:MM
  endTime: string;
  notes?: string;
}

export interface RouteLeg {
  fromIndex: number;               // index into day.items
  toIndex: number;
  mode: TransportMode;
  durationMinutes: number;
  distanceMeters: number;
  polyline?: string;
  transitLines?: string[];
  transferCount?: number;
  fallbackReason?: string;
}

export interface PlanDay {
  date: string;
  isCarDay: boolean;
  items: PlanItem[];
  legs: RouteLeg[];
  summary: string;
}

export interface PlannerDiagnostics {
  considered: number;
  included: number;
  excluded: { attractionId: string; reason: string }[];
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

export interface Workspace {
  phase: Phase;
  trip: TripRequest | null;
  attractions: Attraction[];
  restaurants: Restaurant[];
  ratings: Record<string, Rating>;
  plan: Plan | null;
  progress: { label: string; done: number; total: number } | null;
}
```

### 4.3 Harness Topology

Configured once in the harness, committed to the repo as catalog files so the
setup is reproducible rather than click-configured.

- **Model.** A frontier model for the orchestrator; a cheaper model for research
  subagents, which do bounded extraction rather than reasoning.
- **Connectors.** Web-data MCP for search, page retrieval, and structured place
  lookups. A routing data source for travel times, transit lines, transfer
  counts, and geometry.
- **Sandbox.** Provisioned on demand for the optimizer. Secrets stay in the
  harness and are never passed into sandbox code.
- **Skills.** Three git-backed `SKILL.md` packs, loaded on demand:
  - `attraction-research` — what facts to extract, how to cite, when to return
    unknown, and the exact output schema.
  - `itinerary-optimization` — the objective function, constraints, transport
    rules, and the optimizer's input/output contract.
  - `route-resolution` — mode selection order, transit acceptance tests, and
    fallback recording.

Keeping these as skills rather than one enormous prompt is what keeps the
orchestrator's context small enough to survive a long session.

### 4.4 Subagent Architecture

The design principle: **fan out on I/O, centralize on math.**

```
orchestrator
├── scout (1)                    → candidate names + rough coords
├── research subagents (N)       → one per candidate, parallel, capped
│     ↳ returns a compact Attraction record; raw pages never enter
│       the orchestrator's context
├── sandbox optimizer (1)        → deterministic; assigns and orders all days
├── route subagents (1 per date) → parallel; resolves legs for its day only
└── narrator (orchestrator)      → day summaries and the trip overview
```

Why not a subagent per day for the planning itself: day assignment is a global
decision. Independent per-day planners would double-book attractions and
produce geographically incoherent days. Optimization runs once, globally, in
code. Subagents parallelize only what is genuinely independent.

Efficiency rules, all of which are also cost controls:

- Concurrency cap of about 5 research subagents at a time.
- Batch a scout pass first so research runs on a deduplicated candidate list.
- Compact schemas: subagents return structured records, never prose or raw HTML.
- Large results offloaded to files rather than pushed through context.
- Route lookups keyed and cached on rounded origin, destination, and mode, so
  replanning is nearly free.
- Restrict route resolution to legs the optimizer actually selected, not all
  candidate pairs. This is the single largest cost saving in the system.

### 4.5 The Sandbox Optimizer

The agent writes a Python program into the sandbox, runs it, and reads back
JSON. If a day overflows its window or the objective looks poor, it adjusts
parameters and re-runs. This is a genuine solve loop, not a formatting step.

**Input** (written as a JSON file): candidates with coordinates, per-date hours,
visit durations, and interest ratings; restaurant candidates; a pairwise travel
time matrix seeded from haversine estimates; trip dates; pace; car flag; and the
tuning constants.

**Objective:**

```
maximize  Σ interestWeight(rating_i) · included_i
        − λ_travel · totalTravelMinutes
        − Σ penalties (unknown hours, ticket friction, category repetition)
```

**Constraints:** day window 09:00–20:30; each attraction scheduled only inside
its open hours on its assigned date; walk legs under the pace-adjusted cap; one
lunch and one dinner per day inside their acceptable windows; car days do not
mix modes; each attraction appears at most once across the whole trip.

**Algorithm:** geographic clustering to group candidates, cluster-to-date
assignment respecting must-see placement, then per day a greedy insertion by
score density followed by 2-opt local search on the ordering under time-window
feasibility, then meal insertion at minimum detour. Pure NumPy; no external
solver, so nothing to install under time pressure.

**Output:** day assignments, ordered items with times, the excluded list with a
reason per item, and diagnostics.

The travel matrix starts as straight-line estimates so the optimizer can run
before any routing calls are made. Route subagents then replace the selected
legs with real data, and the optimizer re-runs once against corrected times.
Two passes, bounded cost, and the itinerary is honest about real travel time.

### 4.6 Human Checkpoint Mechanism

Phase 2 is a real harness pause, not a UI convention. After discovery the
orchestrator emits a question to the traveler and the turn suspends. The
workspace renders the candidates, collects ratings, and resumes the turn with
the response payload. The session holds all discovery state across the pause,
so the traveler can close the tab, come back, and still be at the rating step.

Irreversible or outbound actions — exporting or sending a finished itinerary —
sit behind a tool-approval gate, surfaced in the UI as an explicit confirm step
showing exactly what will be sent and to whom.

### 4.7 Adapter and Session State

The adapter hook is the only harness-aware module in the frontend. It exposes
imperative actions (create trip, run discovery, set rating, submit ratings,
generate plan, replan, save, export) and a single `Workspace` value.

- Each action maps to a turn on the trip's session.
- Streamed events are folded into the `Workspace` object; the UI re-renders.
- Progress events drive the discovery progress indicator.
- The session id, current turn id, and last sequence number are persisted
  locally. On reload the adapter resubscribes to the turn from the last
  sequence number, so a refresh mid-discovery rejoins in progress instead of
  restarting.

### 4.8 Failure and Fallback Modes

Every external dependency has a defined degraded state, and the UI always
states which one is active rather than silently degrading:

- Web-data MCP unavailable → fall back to a committed seed dataset for one
  well-covered demo city. The full loop stays demonstrable offline.
- Routing data unavailable → keep straight-line travel estimates, mark every
  leg as estimated, and say so in the timeline.
- Sandbox unavailable → fall back to the greedy pass implemented in TypeScript,
  skipping local search. Worse itineraries, working product.
- Model or subagent failure on one candidate → drop that candidate with a
  recorded reason; never fail the whole discovery run.

## 5. Implementation Plan

Every step lands as a pull request. Direct pushes to the default branch do not
count as reviewed work, so the branch-and-PR habit starts at the first commit.

### PR 1 — Foundation (target 90 minutes)

- Repository scaffold, TypeScript config, lint, test runner.
- The data contract module from section 4.2.
- Committed seed dataset for one demo city, conforming to the contract.
- Web workspace shell: map, candidate list, detail panel, rating controls,
  date tabs, timeline, transport legend, excluded pins.
- Adapter hook implemented against the seed dataset behind the real interface.

Exit condition: the full UI renders a complete itinerary from static data. From
this moment there is always something demonstrable, whatever else fails.

### PR 2 — Discovery (target 90 minutes)

- Harness catalogs for model, connectors, and sandbox.
- `attraction-research` skill.
- Scout pass plus capped parallel research subagents.
- Discovery progress events wired to the adapter.
- Adapter switches from seed data to live results, seed retained as fallback.

Exit condition: a real destination returns 12 or more grounded candidates with
sources, and the map fills from live data.

### PR 3 — Checkpoint (target 45 minutes)

- Orchestrator suspends after discovery and asks for ratings.
- Adapter resumes the turn with the rating payload.
- Rating idempotency and the unrated default.
- Session resume across a page reload verified by hand.

Exit condition: closing and reopening the tab mid-rating loses nothing.

### PR 4 — Planning (target 120 minutes)

- `itinerary-optimization` and `route-resolution` skills.
- Sandbox optimizer with the objective, constraints, and two-pass travel matrix.
- Per-date route subagents, mode selection, transit acceptance, fallbacks.
- Route cache, diagnostics, replanning as a new version.

Exit condition: rating changes visibly move attractions between the itinerary
and the excluded list, and legs render in mode colors.

### Freeze, roughly 90 minutes before deadline

No new features after the freeze. Remaining time goes to: two full rehearsals of
the demo from a clean session, README with setup and a code-review evidence
section, the build write-up, and submission.

### Parallelization Note

The optimizer depends only on the data contract, not on live discovery. Once
PR 1 lands it can be built against the seed dataset in parallel with PR 2. If
two people are working, that is the split.

## 6. Acceptance Criteria

- A trip can be created with destination, dates, car availability, pace, and
  meal preferences.
- Discovery returns at least 12 grounded candidates with sources and confidence.
- Candidates appear on the map and in the list, each with a working detail panel.
- The agent stops for ratings and does not plan until they are submitted.
- Planning produces one day per trip date, each with stops, lunch, dinner, and
  route legs.
- Legs render in mode-specific colors with duration and distance.
- Excluded attractions remain visible as distinct pins.
- Changing ratings and replanning produces a visibly different itinerary.
- No transit leg in any output has a transfer count above 0.
- Car days contain no transit legs.
- A page reload mid-run rejoins rather than restarts.
- Every degraded mode is stated in the UI when active.

## 7. Verification

- Unit tests on pure logic: scoring, mode selection, transit acceptance,
  time-window feasibility, meal insertion, rating idempotency.
- A golden test: seed dataset in, deterministic itinerary out, asserting no
  transfer transit, no mixed-mode car days, and no double-booked attraction.
- Typecheck, lint, and build clean before every PR.
- One manual pass of the whole loop from a fresh session before the freeze.

## 8. Submission Checklist

- Public repository with an open-source license.
- All work merged through reviewed pull requests; automated review run on each,
  high-severity findings fixed, and a code-review evidence section in the README
  linking a merged PR.
- README: what it does, setup, configuration, architecture summary, and the
  harness capabilities used with pointers to where each lives in the code.
- Demo recording under three minutes.
- Build write-up covering the design decisions, especially the split between
  subagent research and sandboxed optimization.

## 9. Risks and Cut Line

| Risk | Mitigation |
|---|---|
| Adapter is a single point of failure | Built first, against seed data, before the agent is real. |
| Sandbox provisioning fails on the day | TypeScript greedy fallback path. |
| Web data is thin for the chosen city | Demo a well-covered dense city; seed dataset committed. |
| Routing costs or rate limits | Only selected legs are routed; aggressive caching; estimates are acceptable output. |
| Research subagents flood context | Compact schemas, result offloading, concurrency cap. |

**Cut in this order if behind:** itinerary export and its approval gate, photo
galleries, route geometry (keep straight lines), local-search refinement (keep
greedy ordering).

**Never cut:** the sandboxed optimizer, the human checkpoint, the research
subagents, and session persistence. Those four are the system.

## 10. Open Assumptions

Recorded honestly, to be confirmed against live documentation during setup:

- Exact tool names and response shapes of the chosen web-data MCP server.
- Sandbox provider availability and startup latency in local harness mode.
- Whether transit transfer counts and geometry are available from the chosen
  routing source for the demo city.
- Event type names for progress and question payloads beyond the documented
  streaming lifecycle.

Each assumption is verified in PR 2 or PR 4, and the fallback for each is
already specified in section 4.8.

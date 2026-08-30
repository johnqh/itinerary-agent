# How Compass works

What happens between typing a city and reading an itinerary, and why each part
is built the way it is.

For the design rationale that predates the code, see [plan.md](plan.md); for
the story of building it, [build-log.md](build-log.md).

---

## The shape of it

```
   destination ──► DISCOVERY ──► you rate ──► SCHEDULING ──► ROUTING ──► itinerary
                      │                           │             │
              subagents + MCP              sandbox + solver   Routes API
                      │                           │             │
                  normalizer                  validator       cache
```

Four ideas carry the whole system:

1. **Subagents fan out on I/O; the sandbox centralises the math.** Models are
   good at pulling facts out of messy pages and bad at constraint satisfaction.
2. **Agent output is checked, not trusted.** Everything an agent produces
   crosses a boundary that can reject it.
3. **Never invent a fact.** An unconfirmed opening time stays `unknown`.
4. **Never degrade silently.** A fallback the traveller cannot see is
   indistinguishable from a wrong answer.

---

## 1. The destination decides the path

`datasetFor()` matches on the **city**, not a substring, so "San Francisco, CA"
hits and "South San Francisco" does not — answering a different city with San
Francisco's attractions would be a wrong answer rather than a fast one.

- **Tokyo or San Francisco** — a committed dataset. Instant.
- **Anywhere else** — the research agent. Seven to thirteen minutes.

Datasets store a *weekly* opening pattern rather than fixed dates, so a Monday
closure closes on your Monday whatever dates you pick.

`src/data/datasets.ts`

## 2. Discovery

A harness **session** opens and runs one turn. The orchestrator has the
**Bright Data MCP server** attached — search, scrape, and their batch forms.

It scouts a candidate list first, then **spawns subagents** — roughly one per
place — each with a narrow brief: coordinates, hours resolved to your dates,
visit duration, cost, ticket rules, sources. Each returns a compact record, so
raw pages never enter the orchestrator's context.

Results come back as **provider-enforced JSON** (`responseFormat: json_schema`,
strict) and are then treated as untrusted. The normalizer repairs what is safely
repairable, rejects what is not, and records a reason either way:

- coordinates outside the possible range are dropped
- confidence is clamped, and a missing one reads as weak rather than certain
- hours for dates the agent skipped become `unknown`
- a record whose sources are all unusable is rejected outright
- a photo URL that is really a page link is discarded

**Photographs are fetched, not requested.** Asking a model for image URLs
returns page links or nothing, so anything still without a picture is looked up
in Places. The URLs point back at this origin because a browser cannot attach an
API key to an `img` request — and a key must never be in the page.

`src/agent/discovery.ts`, `normalize.ts`, `routing/placePhotos.ts`

## 3. The checkpoint

Discovery stops. Every candidate takes a rating from 0 to 4.

- **0** excludes it
- **4** is must-see, but still loses to opening hours and feasibility
- unrated sits deliberately between "maybe" and "interested"

Nothing is scheduled until you submit. Scheduling is a separate turn against
your answers.

## 4. Restaurants, found where the days will be

Asking research for a city's restaurants up front means choosing them *before
the itinerary exists*, so the pool is arbitrary relative to the route — and
adding more does not help.

Instead the attractions are clustered **the way the planner will cluster them**,
and a nearby search runs around each cluster centre. Every candidate is near a
day by construction.

`src/routing/mealSearch.ts`, `nearbyRestaurants.ts`

## 5. Scheduling

Two schedulers. The deterministic one always answers; the agent one is the
interesting one.

### The deterministic builder

Clusters attractions geographically, assigns clusters to dates, then fills each
day greedily by score density under time-window feasibility.

**Meals are anchors, not insertions.** Placing them first and filling
attractions around them makes "lunch at 16:00" unrepresentable rather than
merely unlikely.

A meal is chosen by the **detour it adds** — `before → restaurant → after`
minus the direct hop — not by its distance from the previous stop, which is
what sends a traveller backwards. Because a meal must be picked before the day
around it is settled, every meal is **chosen again** once the day exists,
against the stops it genuinely falls between — and only among the restaurants
both of those gaps can still reach, because the second pass moves the
restaurant and not the clock.

A cuisine preference is worth about ten minutes of extra walking. Past that the
itinerary takes the closer option and says why.

`src/planner/build.ts`, `meals.ts`, `scoring.ts`, `transport.ts`

### The sandboxed optimizer

The agent is not asked for an itinerary. It is asked for a **solver**.

It receives coordinates, ratings, hours and the rules, writes Python, runs it in
the harness's built-in sandbox, reads the objective and iterates. Distances are
computed in the sandbox rather than in a model's head, so the arithmetic is
somewhere it can be checked.

```
maximise  Σ interest(rating) − 0.05 × travel minutes − category repetition
```

`src/agent/optimizer.ts`, `optimizerAgent.ts`

## 6. The trust boundary

Whatever the agent returns is checked before anyone sees it:

- every item inside the day window and in order
- no attraction scheduled twice, or while closed
- no transit leg beyond the transfer limit
- a car day does not also use transit
- **every gap long enough to hold the journey between its stops**
- travel recomputed from coordinates, not taken on trust
- no day that visits nothing

The last two exist because the loop found ways around the others: a scheduler
under pressure will hand itself an easier problem, or give up entirely, and both
passed until they were closed.

**When it fails, the agent is told.** The violations go back *in the same
session*, where its own solver is still in front of it, so it corrects code
rather than starting from a blank page. Three attempts, then the deterministic
planner answers and the traveller is told that happened.

`src/agent/planValidation.ts`

## 7. Routing

Only the legs the planner **chose** are routed — linear in the itinerary's
stops rather than quadratic in candidates, which is the largest single cost
saving in the system.

Per leg, in the order the rules resolve, so a short walk costs one request:

1. **Walk** if within the pace threshold
2. **Car** if it is a car day
3. otherwise **transit vs rideshare** — transit wins if it needs at most one
   change and takes no more than three times the drive

Both limits are named constants every consumer reads, so the estimator, the
router, the validator and the agent's brief cannot drift apart. They were set
against measured journeys: San Francisco transit runs 2.1–2.4× driving, and a
stricter limit planned a transit city entirely by taxi.

Real geometry is decoded and drawn, so routes follow streets. Measured
durations then re-lay the day's clock. Results are cached across replans and
reloads — travel between two fixed points does not change between two clicks —
though transit routed for "now" is never persisted.

`src/routing/refine.ts`, `googleRoutes.ts`, `polyline.ts`, `routeCache.ts`

## 8. What you end up looking at

- a **route spine** whose segments are coloured by mode and sized by duration,
  so a day that is mostly travel looks like one
- **transit line badges** — Muni 5, 28 → 49
- **day tabs** that refit the map, with other days faded rather than hidden
- **teardrop pins** carrying the glyph and colour of what each place is
- a **leg panel**: which line to look for, whether it is direct, and whether the
  number was measured or modelled

A reload restores the trip, the candidates, the ratings and the plan.

`src/App.tsx`, `src/components/`

---

## Where the seams are

Honest about what is not finished:

- **The sandboxed optimizer has not yet had a schedule accepted.** It runs,
  writes code, and measurably self-corrects — 44 violations on one attempt, 22
  on the next — but the deterministic planner is what produces the itinerary on
  screen.
- **Live research takes 7–13 minutes**, which is why two cities ship offline.
- **Travel times without a routing key** are straight-line estimates, labelled
  as such everywhere they appear.

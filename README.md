# Itinerary Agent

Turns a destination and a set of dates into a route-aware, day-by-day itinerary.

The agent researches candidate attractions with real web tools, stops for the
traveller to say what interests them, and then schedules the days by **writing a
Python solver and running it in a sandbox**. Transport is planned rather than
assumed: walking, direct transit, rideshare and rental-car days each have
explicit rules, and a leg that breaks one is rejected rather than shown.

Built on [TrueForge](https://github.com/truefoundry/trueforge), the open-source
agent harness.

## Quick start

```bash
bun install
bun run dev          # http://localhost:5173
```

That is the whole setup. The app runs **offline against a committed dataset**,
needs no API key, and plans a trip instantly. Every screen states which mode it
is in.

### Running it for real

Live research and sandboxed scheduling need the harness and a model provider:

```bash
npx @truefoundry/trueforge@latest      # harness on :8790
cp .env.example .env                   # add OPENAI_API_KEY, optionally BRIGHT_DATA_API_TOKEN
bun run setup:harness                  # registers the provider and connector, then verifies both
bun run dev
```

Then tick **"Research this destination live"** in trip setup. It is off by
default because a real research run takes several minutes.

`.env` is gitignored and the setup script never prints a credential.

## The three phases

1. **Discover.** An orchestrator searches with web-data MCP tools and delegates
   to research subagents, returning grounded records: coordinates, opening hours
   resolved *per trip date*, visit durations, costs, ticket requirements and
   source links.
2. **Rate.** Nothing is scheduled until the traveller rates the candidates from
   0 (not interested) to 4 (must see).
3. **Schedule.** The agent writes a solver, runs it in the sandbox, and iterates
   when a day comes back infeasible. Its answer is then validated before use.

The governing principle: **subagents fan out on I/O, the sandbox centralises the
math.** Language models are good at pulling facts out of messy pages and bad at
constraint satisfaction, so research is parallelised across subagents while
scheduling runs once, globally, as code.

## Harness capabilities, and where they live

| Capability | Where | Status |
|---|---|---|
| Real MCP tools | `src/agent/discovery.ts`, `scripts/setup-harness.ts` | **Verified.** A live Kyoto run returned 14 attractions and 7 restaurants, 3 sources each. |
| Subagents | `src/agent/discovery.ts`, `discoveryProgress.ts` | **Verified.** Runs spawned 2–3 researchers; fan-out is tracked from `thread.created` / `thread.done`. |
| Sandboxed code execution | `src/agent/optimizer.ts`, `optimizerAgent.ts` | **Partly verified.** Python runs in the harness's built-in local sandbox, with no sandbox provider to configure. The optimizer provisioned a sandbox and ran its solver four times before the OpenAI account hit its spend limit; it has not yet completed a full run. |
| Human checkpoint | `src/agent/adapter.ts`, `src/components/CandidateList.tsx` | **Verified at the product level** — discovery stops and nothing is scheduled until ratings are submitted. The harness-native `ask_user_question` suspension is **not built**. |
| Persistent sessions | `src/agent/sessionStore.ts` | **Verified.** A reload restores the trip, candidates, ratings and plan. Harness-side turn resumption is not yet exercised. |

Statuses are deliberately specific. Where something is unverified, this table
says so rather than implying it works.

## Design decisions worth arguing about

**The agent's schedule is checked, not trusted.** `src/agent/planValidation.ts`
enforces the rules that decide whether a day can be walked at all: items inside
the day window and in order, no attraction scheduled twice or while closed, no
transit leg with a transfer, no car day that also uses transit, and every gap
between stops long enough to hold the journey between them. A schedule breaking
any of them is rejected and the deterministic planner answers instead — worse,
but real.

**Nothing invents a fact.** An opening time that was not retrieved stays
`unknown`; a guessed closing time sends someone to a locked door. With no
routing provider connected, transit is reported unavailable rather than given a
fabricated line and transfer count, and every travel time derived from
straight-line estimates is flagged as estimated.

**Degradation is never silent.** Seed data instead of live research, estimated
travel times, the greedy planner instead of the sandbox, a meal that could not
be seated, a map that failed to load — each names itself on screen.

**Meals are anchors, not insertions.** Placing meals first and filling
attractions around them makes "lunch at 16:00" unrepresentable rather than
merely unlikely.

## Layout

| Path | Contents |
|---|---|
| `src/types/workspace.ts` | The data contract. Every shape that crosses a boundary. |
| `src/agent/` | Everything harness-aware: client, discovery, optimizer, validation, session store. |
| `src/planner/` | Pure scheduling logic: scoring, transport rules, time windows, greedy builder. |
| `src/components/` | Presentational workspace. Holds no planning logic. |
| `src/data/` | Offline dataset used when research is unavailable. |
| `tests/` | Unit tests per module, plus a golden test over the offline dataset. |
| `docs/plan.md` | Requirements and technical design. |

## Development

```bash
bun run test        # unit and golden tests
bun run typecheck
bun run lint
bun run build
```

### Reaching the harness

The workspace calls the harness through its own origin, so the browser makes no
cross-origin request and no credential reaches the page. Both `bun run dev` and
`bun run preview` proxy `/api` to `TRUEFORGE_BASE_URL`, which defaults to
`http://localhost:8790`. A build served anywhere else has no such proxy in front
of it and must be given `VITE_TRUEFORGE_BASE_URL` at build time, which then
requires the harness to allow that origin. Both are documented in
[.env.example](.env.example).

Without a reachable harness — or without the model and web-data connector that
discovery names — live research is switched off, the workspace says so, and the
trip runs on the committed seed dataset.

### Reaching the Google providers

Google Routes and Google Places are reached the same way and for a stronger
reason: the API key is attached by the proxy, server-side, so it never reaches
the browser bundle. That is why `GOOGLE_MAPS_API_KEY` is deliberately **not**
`VITE_`-prefixed — a prefixed variable is inlined into the shipped JavaScript
for anyone to read.

`bun run dev` and `bun run preview` are the two supported ways to serve this
workspace, and both proxy `/gmaps` and `/places`. A static build put behind any
other server needs equivalent reverse proxies, each adding the
`X-Goog-Api-Key` header itself:

| Path       | Forwards to                      | Used for                              |
| ---------- | -------------------------------- | ------------------------------------- |
| `/gmaps/*` | `https://routes.googleapis.com/*` | travel times, transit lines, transfers |
| `/places/*` | `https://places.googleapis.com/*` | attraction photographs, nearby meals  |

There is deliberately no client-side alternative for either — the key must not
reach the page — and each has a defined degraded state rather than a silent
one:

- Nothing serving `/gmaps` keeps every leg as a straight-line estimate, names
  that on screen, and reports transit as unavailable rather than guessed at.
- Nothing serving `/places` leaves researched attractions with whatever
  photographs research found and returns no nearby restaurants, so a meal the
  planner cannot then seat is reported unseated in the timeline rather than
  invented.

Every change lands through a reviewed pull request. Direct pushes to `main` are
not part of this project's workflow.

## Known limitations

- **Transit needs the routing provider.** With `GOOGLE_MAPS_API_KEY` set, legs
  carry real travel times, line names and transfer counts. Without it, transit
  is reported unavailable rather than guessed at, and every non-walking leg is
  rideshare or car.
- **Travel times without a provider are straight-line estimates**, scaled for
  road distance. They are labelled as estimates everywhere they appear.
- **Offline datasets cover Tokyo and San Francisco.** Any other destination
  needs live research; the workspace says so rather than quietly showing the
  wrong city.
- **Hours the agent could not confirm stay unknown**, and unknown hours carry a
  scoring penalty rather than an assumption.

## Qodo Code Review Evidence

Pull requests here are reviewed automatically by Qodo Merge, configured in
[.pr_agent.toml](.pr_agent.toml) with review instructions pointed at this
project's real failure modes — transfer-count violations, car/transit mixing,
double-booked attractions, planning logic leaking into UI components, and
silently swallowed errors.

Merged, reviewed pull requests:

- [#2 — Foundation: data contract, planner logic, workspace](https://github.com/johnqh/itinerary-agent/pull/2)
  — 13 findings raised and addressed, including a missing module that broke the
  build on the pushed branch, meals seated at closed restaurants, and
  attractions stranded on a single date.

Further pull requests are listed as they merge.

## License

MIT. See [LICENSE](LICENSE).

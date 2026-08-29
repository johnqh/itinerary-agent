# Itinerary Agent

A trip-planning agent that turns a destination and a set of dates into a
route-aware, day-by-day itinerary.

The agent researches candidate attractions with real web tools, stops for the
traveler to rate what interests them, and then computes a multi-day schedule by
writing and running its own optimizer in a sandbox. Transportation is planned,
not assumed: walking, direct transit, rideshare, and rental-car days each have
explicit rules.

## Status

Design complete, implementation in progress. See
[docs/plan.md](docs/plan.md) for the full requirements and technical design.

## How It Works

1. **Discover.** Subagents fan out in parallel, one per candidate, and return
   grounded records with coordinates, per-date opening hours, visit durations,
   costs, ticket requirements, and source links.
2. **Checkpoint.** The agent suspends. The traveler rates each candidate from
   0 (not interested) to 4 (must see). Nothing is scheduled until they submit.
3. **Plan.** A sandboxed solver assigns attractions to days and orders each day
   under time-window constraints, then per-date subagents resolve the route legs.

The governing design principle is that subagents fan out on I/O while the
sandbox centralizes the math. Language models are good at extracting facts from
messy pages and poor at constraint satisfaction, so research is parallelized
across subagents and optimization runs once, globally, as deterministic code.

## Architecture

| Layer | Responsibility |
|---|---|
| Web workspace | Map, candidate list, ratings, date tabs, timeline. Presentational only. |
| Adapter | The only harness-aware module. Actions become turns; streamed events become state. |
| Harness | Agent loop, sessions, human checkpoints, subagents, sandbox. |
| Tools | Web-data MCP for research, routing data for travel legs, sandbox for the solver. |

## Development

```bash
bun install
bun run setup:harness   # register the model provider and the web-data connector
bun run dev             # workspace on http://localhost:5173
bun run test            # unit and golden tests
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

Every change lands through a reviewed pull request. Direct pushes to `main` are
not part of this project's workflow.

### Layout

| Path | Contents |
|---|---|
| `src/types/workspace.ts` | The data contract. Every shape crossing a boundary. |
| `src/planner/` | Pure scheduling logic: scoring, transport rules, time windows, the greedy builder. |
| `src/agent/adapter.ts` | The only harness-aware module. |
| `src/components/` | Presentational workspace UI. |
| `src/data/` | Offline seed dataset. |
| `tests/` | Unit tests per module, plus a golden test over the seed data. |

## Qodo Code Review Evidence

Pull requests in this repository are reviewed automatically by Qodo Merge,
configured in [.pr_agent.toml](.pr_agent.toml). Links to merged, reviewed pull
requests are listed here as they land.

- _Populated as pull requests merge._

## License

MIT. See [LICENSE](LICENSE).

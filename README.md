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

Every change lands through a reviewed pull request. Direct pushes to `main` are
not part of this project's workflow.

## Qodo Code Review Evidence

Pull requests in this repository are reviewed automatically by Qodo Merge,
configured in [.pr_agent.toml](.pr_agent.toml). Links to merged, reviewed pull
requests are listed here as they land.

- _Populated as pull requests merge._

## License

MIT. See [LICENSE](LICENSE).

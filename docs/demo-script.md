# Demo script

Three minutes. One take. The point to land: **the agent does real work with real
tools, and everything it produces is checked before a traveller sees it.**

## Before you hit record

```bash
npx @truefoundry/trueforge@latest     # harness on :8790
bun run dev                            # workspace on :5173
```

- Browser at the workspace, **localStorage cleared** (or click "New trip") so it
  opens on the setup form.
- A second tab on the harness at `localhost:8790`, on the Sessions list.
- Close anything with notifications. Full screen.
- Have `caffeinate -disu` running so nothing sleeps mid-take.

**Rehearse once before the real take.** The only slow step is planning
(~30–45s while it routes every leg), and you need to know where that lands.

---

## 0:00 — What it is (15s)

> "This is a trip planner built on an agent harness. You give it a city and
> some dates; it finds what's worth seeing, stops to ask what *you* care about,
> then schedules your days around real opening hours and real transit."

Setup form on screen. Don't read it out — let it be seen.

## 0:15 — Set up a trip (20s)

San Francisco is already filled in. Set the dates to **five days** — a longer
trip is where scheduling stops being trivial.

> "San Francisco, five days, no rental car, and I care about local food."

Click a couple of cuisine chips. Click **Find attractions**.

**Say the honest thing here** — a judge will ask anyway:

> "San Francisco and Tokyo come from a committed dataset so this is instant.
> Any other city goes to the research agent, which takes several minutes —
> I'll show that running at the end."

## 0:35 — The candidates (25s)

Twenty-two places, photographs, category-coloured pins.

> "These aren't just the postcard sights — Lands End, the tiled steps, Bernal
> Heights. The pins carry what each place *is*, so you can read a dozen of them
> at a glance."

Click one. The coverflow — **swipe it**.

> "Opening hours resolved for these specific dates. Where we couldn't confirm
> something, it says unknown rather than guessing — a guessed closing time
> sends you to a locked door."

## 1:00 — The human checkpoint (20s)

Rate four or five. Push one to **must-see**, one to **not interested**.

> "Nothing gets scheduled until I've said what matters. This is the checkpoint:
> the agent stops, and it doesn't proceed until I answer."

Click **Plan these days**.

## 1:20 — What happens while it plans (25s)

It's routing every leg. Fill the wait with the architecture — this is the part
judges are scoring:

> "Two things are running. Scheduling a trip is a time-windowed routing
> problem, so the agent doesn't write me an itinerary — it writes a Python
> solver, runs it in the harness sandbox, and iterates. And every leg is a real
> routing call, which is why this takes a moment."

> "The governing idea: subagents fan out on I/O, the sandbox centralises the
> math. Models are good at pulling facts out of messy pages and bad at
> constraint satisfaction, so research parallelises and scheduling runs once,
> as code."

## 1:45 — The itinerary (45s)

**This is the money shot. Slow down.**

> "Five days. Each one is a route — the spine is coloured by how you travel and
> the segment heights scale with how long each leg takes, so a day that's
> mostly travel *looks* like one."

Point at the transit badges:

> "Muni 5. Muni 7. Twenty-eight to forty-nine — that's a real journey with one
> change. These are actual line numbers from actual routing."

Click a leg on the map:

> "Which line to look for, whether it's direct, and whether that number was
> measured or estimated."

Find the rideshare leg and click it:

> "And here it refused transit — forty-six minutes against a thirteen-minute
> drive. The rule fired and it tells you why."

Switch day tabs:

> "Each day reframes the map. The places not on today's route fade rather than
> disappear, because knowing what was left out is part of judging a plan."

## 2:30 — The part most demos skip (20s)

> "The agent's schedule is checked, not trusted. It has to place every stop
> inside its opening hours, never book one twice, and leave every gap long
> enough to hold the journey — that last one is the easiest to get wrong and
> the hardest to notice."

> "When it fails, the violations go back to the agent in the same session so it
> corrects its own solver. If it still can't, the deterministic planner answers
> and you're told. I'd rather show you a real fallback than a lucky demo."

## 2:50 — Close (10s)

Reload the page — everything comes back.

> "Sessions persist, so this survives a reload. Open source, MIT, built on
> TrueForge."

---

## If something goes wrong

- **Planning is slow** → keep talking; the architecture section fills 45s.
- **A leg shows "estimated"** → say so: "routing didn't answer for that leg, so
  it's a straight-line estimate and it's labelled." That's the honesty story.
- **Anything errors** → click **New trip** and restart. Never re-plan into a
  broken state on camera.

## Do not claim

- That the sandboxed optimizer produced the itinerary on screen. It runs, it
  self-corrects, and it is **not yet accepted** — the deterministic planner is
  what you're looking at. Say "the agent writes and runs a solver, and its
  output is validated" — all true. Do not say "this schedule came from it."
- That live research is fast. It is 7–13 minutes.

## Optional tail, only if you have time

Start a Lisbon trip and leave it running while you talk. Show the harness tab:
subagents spawning, tool calls climbing. Then let it finish off-camera.

## What This Changes

<!-- One or two sentences. What now works that did not work before? -->

## Plan Step

<!-- Which step of docs/plan.md does this land? e.g. PR 2 — Discovery -->

## Constraints Checked

<!-- Delete rows that do not apply to this change. -->

- [ ] No transit leg has a transfer count above zero.
- [ ] No day mixes car mode with transit.
- [ ] No attraction is scheduled on more than one date.
- [ ] Every scheduled item falls inside its opening-hour window.
- [ ] Every external dependency has a defined degraded state, surfaced in the UI.

## Verification

<!-- Commands run and their result. Evidence, not assertions. -->

```
```

## Qodo Review

- [ ] Qodo review ran on this pull request.
- [ ] High-severity findings are fixed or explicitly justified below.

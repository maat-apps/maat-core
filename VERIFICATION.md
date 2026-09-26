# Verifying changes

A companion to [`STRUCTURE.md`](./STRUCTURE.md): not about the shipped
app's footprint, but the footprint of _verifying_ a change — lint,
format, typecheck, tests, build, audit, or whatever a repo's own
equivalents are. See
[maat-apps/maat-core#8](https://github.com/maat-apps/maat-core/issues/8).

## The principle

**Verify each change exactly once, at whichever location already
guarantees it happens anyway.**

1. **Redundant verification is the single largest avoidable cost, and
   it's linear regardless of project size.** Running the same lint/
   format/typecheck/test/build/audit (or equivalent) in two places for
   the same change is a full second copy of real compute — a tiny script
   and a large monorepo both pay this tax proportionally to how many
   times the same check reruns, not to their size. Eliminating the
   duplicate is a bigger win than optimizing either individual run.
2. **Given a required check already gates merge, running it anywhere
   else "just in case" is pure duplication, not extra safety** — the
   gate already provides the safety. Local/manual runs should be for
   genuine debugging (reproducing a failure, iterating faster than a CI
   round-trip) or before that CI gate exists at all, not a standing habit
   once it does.

Where the _one_ verification run should physically happen is a much
smaller effect than eliminating the duplicate, and isn't cleanly
decidable in general — shared/hyperscale infrastructure often has better
power-usage effectiveness than a personal machine, but CI environments
also pay a real, repeated cost a local one doesn't (a cold dependency
install from scratch every run, e.g. `npm ci` vs. an already-warm
`node_modules`). Default to wherever the required gate already lives (CI,
in most repos) simply because that's the run that's happening
regardless — not because it's provably greener.

## Practical checklist

Applies at any project size, from a first commit onward:

- One canonical check definition (one script/command), run by both the
  required CI gate and any local invocation — never two independently
  maintained definitions of "passes" that can drift apart.
- No local pre-push verification step once CI covers the exact same set
  and a required-check gate enforces it.
- Minimize each CI run's own overhead, independent of the "how many
  runs" question: cache dependency installs (e.g. `actions/setup-node`'s
  `npm` cache) rather than a fully cold install every time, path-filter
  workflows so unrelated changes don't trigger the full suite, and cancel
  superseded runs via `concurrency` instead of letting a stale run
  finish.
- Treat "CI minutes are free on a public repo" and "this run has zero
  footprint" as unrelated facts — free billing doesn't mean free energy.
  Don't use free minutes as license to run things more often than the
  verify-once principle calls for.

## In practice: routines

Routines drops local pre-push verification to zero: per-edit hooks run
formatting/lint fixes, a Stop hook runs typecheck and (when `src/`/
`tests/` changed) the unit suite as summary-only warnings, and the full
gate (`npm run validate`'s lint/format/typecheck/test:coverage/test:e2e/
build/audit) runs exactly once, in CI, on every PR. See its own
`CLAUDE.md` (Automation section) for the exact wiring.

# AGENTS

## Repo Purpose

`multimcts-js` is the TypeScript v2 engine for a generic multi-team Monte Carlo Tree Search library plus bundled reference games, profiling tools, and arena tooling.

This repo is one stage in a longer evolution of the author's MCTS work, but most sessions should focus on the code and docs that are already in this repository.

## Helpful Context

When relevant:

- [docs/HISTORY.md](docs/HISTORY.md) gives project background and origin context.
- [docs/future-design-notes.md](docs/future-design-notes.md) collects deferred design questions and historical optimization notes.

## Working Priorities

- Preserve the generic engine API in `src/index.ts`.
- Keep multiplayer and multi-team support as first-class design constraints.
- Prefer optional features and measurable benchmarks over speculative complexity.
- Treat profiling, arena runs, and diagnostics as the basis for optimization decisions.

## Common Commands

- `npm test`
- `npm run build`
- `npm run verify`
- `npm run profile:search -- --scenario hex-opening --iterations 1200`
- `npm run arena -- --scenario connect-four-opening --games 20 --iterations-a 2000 --iterations-b 2000`

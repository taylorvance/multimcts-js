# multimcts

TypeScript Monte Carlo Tree Search for multi-team turn-based games.

## Public API

Root exports:

- `GameState`
- `MCTS`
- `SearchNode`
- `type RewardInput`
- `type RolloutSuggestion`
- `type SearchLimits`
- `type SearchMetrics`
- `type SearchNodeStats`
- `type SearchResult`

Explicit subpaths:

- `multimcts/tictactoe`

## Design Goals

- Keep the search engine generic and game-agnostic.
- Treat tree reuse as a first-class concern rather than a consumer hack.
- Prefer explicit typed contracts over stringly runtime conventions.
- Publish a small, stable package boundary with smoke-tested dist output.

## Core Concepts

- Typed `GameState<TMove, TTeam, TState>` base class
- Structured `search()` results with metrics and tree access
- First-class tree reuse through `ensureRoot()` and `advanceToChild()`
- `Map`-based move and reward storage

## Example

```ts
import { MCTS } from 'multimcts';
import { TicTacToeState } from 'multimcts/tictactoe';

const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>();
const state = new TicTacToeState();

const result = mcts.search(state, { maxIterations: 1000 });
console.log(result.bestMove);
```

## Package Workflow

Local verification:

```bash
npm install
npm run verify
```

Release metadata is tracked with Changesets:

```bash
npm run changeset
```

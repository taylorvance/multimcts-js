# multimcts

TypeScript Monte Carlo Tree Search for multi-team turn-based games.

## Public API

Root exports:

- `GameState`
- `MCTS`
- `type SearchNodeView`
- `type FinalActionStrategy`
- `type RewardInput`
- `type RolloutSuggestion`
- `type SearchLimits`
- `type SearchMetrics`
- `type SearchNodeStats`
- `type SearchResult`
 - `type TeamValueEvaluator`
 - `type TeamValueStrategyName`
 - `teamValueStrategies`

Explicit subpaths:

- `multimcts/tictactoe`

## Design Goals

- Keep the search engine generic and game-agnostic.
- Treat tree reuse as a first-class concern rather than a consumer hack.
- Prefer explicit typed contracts over stringly runtime conventions.
- Publish a small, stable package boundary with smoke-tested dist output.

## Core Concepts

- Typed `GameState<TMove, TTeam, TState>` base class
- Structured `search()` results with metrics and read-only tree access
- Tree reuse through `advanceToChild()`
- `Map`-based move and reward storage
- Configurable team-value scalarization with built-in or custom evaluators
- Configurable final move selection with `maxChild`, `robustChild`, `maxRobustChild`, or `secureChild`
- Optional rollout hooks for heuristic playouts or low-allocation random move sampling

## Engine Notes

- The default final-action strategy is `robustChild`, which returns the most visited root child rather than the highest raw mean value.
- The default team-value strategy is `margin`, which scores a team by `ownValue - sum(otherTeamValues)`.
- `suggestRollout(random)` is the strongest rollout hook when a game can cheaply produce both the chosen move and the successor state in one pass.
- `sampleLegalMove()` defaults to random selection from `getLegalMoves()`, and can be overridden when a game can sample a rollout move faster without materializing the full move list.

## Example

```ts
import { MCTS } from 'multimcts';
import { TicTacToeState } from 'multimcts/tictactoe';

const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>();
const state = new TicTacToeState();

const result = mcts.search(state, { maxIterations: 1000 });
console.log(result.bestMove);
```

Choosing a different final-action policy:

```ts
const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>({
  finalActionStrategy: 'maxChild',
});
```

Choosing a different team-value policy:

```ts
const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>({
  teamValueStrategy: 'self',
});
```

Or provide a custom evaluator:

```ts
const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>({
  evaluateTeamValue: (team, rewards) => (rewards.get(team) ?? 0),
});
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

Search profiling against built code:

```bash
npm run profile:search -- --iterations 10000 --samples 12 --instrument-state
```

Built-in scenarios currently include:

- `tictactoe-midgame`
- `connect-four-opening`
- `connect-four-midgame`
- `othello-opening`

Use an external scenario module:

```bash
npm run profile:search -- --module ../some-repo/path/to/scenario.mjs
```

Enable optional tree-shape diagnostics during profiling:

```bash
npm run profile:search -- --scenario connect-four-midgame --iterations 3000 --diagnostics
```

Override the final move policy during a profile run:

```bash
npm run profile:search -- --scenario othello-opening --final-action-strategy secureChild
```

Override the team-value strategy during a profile run:

```bash
npm run profile:search -- --scenario connect-four-midgame --team-value-strategy self
```

Run head-to-head matches between two built engines:

```bash
npm run arena -- --scenario connect-four-opening --games 20 --iterations-a 2000 --iterations-b 2000
```

Compare two local checkouts or branches by pointing each side at a different built repo:

```bash
npm run arena -- --engine-a . --engine-b ../multimcts-js-other-checkout --scenario connect-four-opening
```

Compare different scalarization policies head-to-head:

```bash
npm run arena -- --scenario connect-four-opening --team-value-strategy-a margin --team-value-strategy-b self
```

Future design notes for deferred ideas such as player identity vs team identity live in [docs/future-design-notes.md](/Users/taylorvance/Library/Mobile%20Documents/com~apple~CloudDocs/dev/multimcts-js/docs/future-design-notes.md).

For CPU and heap profiles without adding engine overhead:

```bash
node --cpu-prof --experimental-strip-types scripts/profile-search.mjs --scenario tictactoe-midgame
node --heap-prof --experimental-strip-types scripts/profile-search.mjs --scenario tictactoe-midgame
```

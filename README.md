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
- `multimcts/breakthrough`
- `multimcts/connect-four`
- `multimcts/othello`
- `multimcts/hex`

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
- Reusable headless game modules for `Tic-Tac-Toe`, `Connect Four`, `Othello`, `Hex`, and `Breakthrough`

## Engine Notes

- The default final-action strategy is `robustChild`, which returns the most visited root child rather than the highest raw mean value.
- The default team-value strategy is `margin`, which scores a team by `ownValue - sum(otherTeamValues)`.
- `suggestRollout(random)` is the strongest rollout hook when a game can cheaply produce both the chosen move and the successor state in one pass.
- `sampleLegalMove()` defaults to random selection from `getLegalMoves()`, and can be overridden when a game can sample a rollout move faster without materializing the full move list.

## Example

```ts
import { MCTS } from "multimcts";
import { TicTacToeState } from "multimcts/tictactoe";

const mcts = new MCTS<TicTacToeState, number, "X" | "O">();
const state = new TicTacToeState();

const result = mcts.search(state, { maxIterations: 1000 });
console.log(result.bestMove);
```

Additional reusable game modules are available via:

- `multimcts/breakthrough`
- `multimcts/connect-four`
- `multimcts/othello`
- `multimcts/hex`

Choosing a different final-action policy:

```ts
const mcts = new MCTS<TicTacToeState, number, "X" | "O">({
  finalActionStrategy: "maxChild",
});
```

Choosing a different team-value policy:

```ts
const mcts = new MCTS<TicTacToeState, number, "X" | "O">({
  teamValueStrategy: "self",
});
```

Or provide a custom evaluator:

```ts
const mcts = new MCTS<TicTacToeState, number, "X" | "O">({
  evaluateTeamValue: (team, rewards) => rewards.get(team) ?? 0,
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

Release automation uses GitHub Actions plus npm trusted publishing via OIDC. Relevant files:

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `docs/release-strategy.md`

Key release scripts:

- `npm run changeset`
- `npm run version-packages`
- `npm run release`

The release workflow:

- verifies the repo on every `main` push
- creates and pushes a version commit when pending changesets exist
- publishes the package in that same run using npm trusted publishing via GitHub OIDC

## Local Hooks

This repo uses local hook automation through `simple-git-hooks`.

`npm install` installs the hooks for this repo.

Current hook behavior:

- `pre-commit`: run `npm run test` when staged changes affect source, tests, scripts, or package metadata; skip docs-only and workflow-only commits
- `pre-push`: fail if the branch is behind or diverged from its upstream, run `npm run verify`, then fail again if the upstream moved during verification

Search profiling against built code:

```bash
npm run profile:search -- --iterations 10000 --samples 12 --instrument-state
```

Add engine-phase timing on top of state-method timing when you want to see where selection, expansion, simulation, and backprop are spending time:

```bash
npm run profile:search -- --scenario tictactoe-midgame --instrument-state --instrument-engine
```

Built-in scenarios currently include:

- `breakthrough-opening`
- `breakthrough-midgame`
- `tictactoe-midgame`
- `connect-four-opening`
- `connect-four-midgame`
- `hex-opening`
- `hex-midgame`
- `othello-opening`

## Benchmark Suite

The benchmark pool is intentionally diverse rather than stacked with slight variations on the same alignment game.

- `Tic-Tac-Toe` is the tiny correctness and engine-overhead probe. It is useful for catching regressions in the core search loop because game logic cost is very low.
- `Connect Four` is the low-branching adversarial baseline. It represents games with cheap legality checks, tactical traps, and simple transitions.
- `Breakthrough` is the race-and-capture benchmark. It represents forward-only tactical games where mobility, tempo, and capture pressure matter more than heavy rules logic.
- `Othello` is the medium-complexity legality benchmark. It represents games where move generation and terminal checks are materially more expensive than the engine itself.
- `Hex` is the connection-game benchmark. It represents path-connectivity win conditions and connection-focused search rather than capture-heavy or score-heavy play.

For each benchmark game, prefer a small position set rather than only the initial state:

- opening positions for baseline throughput and symmetry
- midgames for realistic branching and tactical pressure
- later tactical positions when the game has qualitatively different endgame behavior

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

Compare a new game against an older engine commit without backporting the game code:

```bash
git worktree add /tmp/multimcts-old 7075f29
ln -s "$PWD/node_modules" /tmp/multimcts-old/node_modules
(cd /tmp/multimcts-old && npm run build)
npm run profile:search -- --scenario hex-opening --iterations 1200
(cd /tmp/multimcts-old && npm run profile:search -- --module "$PWD/scripts/scenarios/hex-opening.mjs" --iterations 1200)
npm run arena -- --engine-a . --engine-b /tmp/multimcts-old --scenario hex-opening --games 6 --iterations-a 800 --iterations-b 800
```

This works because the current scenario module can supply the current game implementation while each engine build stays pinned to its own commit.

Future design notes for deferred ideas live in [docs/future-design-notes.md](docs/future-design-notes.md).

Project origin and historical context live in [docs/HISTORY.md](docs/HISTORY.md).

For CPU and heap profiles without adding engine overhead:

```bash
node --cpu-prof --experimental-strip-types scripts/profile-search.mjs --scenario tictactoe-midgame
node --heap-prof --experimental-strip-types scripts/profile-search.mjs --scenario tictactoe-midgame
```

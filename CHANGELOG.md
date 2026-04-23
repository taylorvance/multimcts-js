# multimcts

## 2.2.0

### Minor Changes

- 65b7d98: Add an optional `maxRetainedNodes` search limit to cap the size of the retained MCTS tree.

  The engine now tracks retained-node counts incrementally, surfaces the capped count in diagnostics, and stops search once the retained tree reaches the configured limit while still allowing an initial expansion round on a fresh root.

## 2.1.1

### Patch Changes

- 92283f7: Add `npm run benchmark:compare` for running the current canonical profile and arena matrix against a baseline ref.

  Allow `scripts/profile-search.mjs` to target an arbitrary built engine via `--engine`, and refactor the compare scripts onto shared worktree/build helpers.

## 2.1.0

### Minor Changes

- b5e1b96: Add the new `multimcts/isolation` benchmark export and built-in Isolation profiling scenarios.

  Generalize the arena harness so two competitors can be compared on scenarios with more than two in-game teams, including Isolation, while preserving the existing commit-vs-commit workflow.

  Rename the canonical exploration tuning option to `explorationConstant` while keeping `explorationBias` supported as a deprecated compatibility alias.

## 2.0.0

### Major Changes

- ec9b5de: Rewrite `multimcts` as a TypeScript v2 engine with a new typed API.

  Major changes:

  - replace the old CommonJS implementation with a TypeScript build and generated declarations
  - introduce typed `GameState`, `MCTS`, and `SearchNode` exports
  - change `search()` to return a structured result object and accept limit options via `{ maxIterations, maxTimeMs }`
  - make tree reuse a first-class API through `ensureRoot()` and `advanceToChild()`
  - switch internal move and reward storage to `Map`
  - reject invalid search inputs such as missing limits and terminal-root searches

  Packaging and release updates included in this release:

  - publish a cleaner `dist/` layout with explicit subpath exports
  - add stricter TypeScript compiler settings
  - add a built-package smoke test
  - add Changesets metadata and release scripts

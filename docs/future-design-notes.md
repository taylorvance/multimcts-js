# Future Design Notes

## Player Identity vs Team Identity

The current engine treats `team` as the fundamental objective unit.

- All rewards are keyed by team.
- Multiple actors sharing the same team key are treated as one cohesive objective.
- Team-value scalarization operates on team rewards, not on per-player rewards.

This matches the current intended model for adversarial team games and co-op games where allies truly win or lose together.

### Deferred idea

A future version could separate:

- `player identity`: whose turn it is
- `team identity`: how outcomes are grouped and scored

That would open the door to richer models such as:

- multiple distinct players contributing to the same team score by default
- configurable teammate weighting instead of strict team-key collapse
- alliance-like or social-preference evaluators across distinct players
- team games where players are coordinated but not perfectly identical in utility

### Why this is deferred

This is a much larger semantic change than the current team-value strategy work.

Open design questions include:

- whether terminal values should be returned per player, per team, or both
- how turns map from players to teams
- whether search node value should be computed for the acting player, the acting team, or a configurable coalition
- how to avoid confusing consumers who only need the simpler team-key model

The recommended path is:

1. keep the current team-key model as the stable default
2. use explicit team-value strategies for adversarial-team behavior
3. revisit player-vs-team identity only when a concrete game requires it

## Arena Follow-Up

The current arena tooling is intentionally a two-agent harness even though the engine itself supports more than two teams.

That was a deliberate scoping choice rather than a claim that future arena work should stay 2-player only.

Why this is deferred:

- the repo does not yet have a canonical `>=3` player or team benchmark game that is important enough to drive arena design
- seat assignment, fairness, and reporting semantics for `>=3` participants are easier to get wrong than the current two-agent case
- the recent arena refactor already isolates match execution from worktree and build plumbing, so later generalization can focus on the match layer

Recommended path:

1. keep the current two-agent arena for engine-vs-engine regression testing and optimization work
2. revisit generalized multiplayer arena support only after the repo has a canonical `>=3` player or team benchmark scenario
3. design `N`-agent seat mapping and reporting around that real game rather than around hypothetical generic cases

## Optimization Roadmap

This is a pragmatic roadmap rather than a promise. Items are ordered by expected value and by how safely they fit the current engine architecture.

### Near-Term Priorities

1. improve rollout policies and low-allocation state fast paths in the bundled benchmark games when profiling shows state cost dominates engine cost
2. consider optional transposition-aware tree reuse keyed by `stateKey()` for games where repeated states are common and hashing is reliable
3. identify or add the next canonical benchmark positions that best expose engine-level regressions and wins

### Mid-Term Candidates

1. revisit optional RAVE only after it shows clear strength gains that justify core-engine complexity on the benchmark suite
2. optional pruning constants only after there is evidence they help the canonical games without obscuring engine behavior
3. progressive widening for games or variants where legal move counts are too large to expand eagerly
4. heuristic value blending such as implicit minimax backups only if a concrete game provides a cheap, trustworthy heuristic signal
5. concurrency-oriented techniques such as virtual loss only when the engine actually grows a parallel search mode

### Why These Are Deferred

- some techniques pay off only in specific branching-factor regimes or only with good heuristics
- several of them introduce more semantic risk than plain throughput optimizations
- the repo should prefer profile-backed improvements over adding fashionable MCTS features by default

## Historical MCTS Optimization Reference

The original Hexachromix-specific optimization work is not in this repo.

These references are historical context, not required local paths. Where a stable hosted repo is known, use that. Where it is not known, the current workspace snapshot is described only as a local historical reference.

Relevant historical references:

- `taylorvance/multimcts`: `multimcts/mcts.pyx`
- `taylorvance/hexachromix-lib`
- local `mcts-hxx-merge` snapshot: `KEEPTHIS-convertedcythontopython-hexachromix.py`
- `taylorvance/hexachromixio`: `hexachromix/tasks.py`

That `mcts.pyx` branch is the strongest historical reference for features that went beyond the earlier plain Python and Cython baselines. In particular, it implemented:

- optional `rave_bias` support with per-node RAVE visit and reward statistics
- rollout move tracking so backpropagation can update AMAF-style estimates for moves seen later in the playout
- score blending between direct node value and RAVE value using `rave_bias / (rave_bias + visits)`
- optional confidence-bound pruning via `pruning_bias`
- cached `sqrt(log(n))` and `1 / sqrt(n)` tables for hot-path scoring
- a rollout hook returning both `(move, nextState)` via `suggest_move()`

### Mapping To The Current TypeScript Engine

The current engine in [src/index.ts](../src/index.ts) already carries forward some of that lineage:

- shuffled unexpanded-move order
- cached per-node `sqrtLogVisits` and `inverseSqrtVisits`
- rollout hooks via `suggestRollout()` and `sampleLegalMove()`
- multi-team reward storage and configurable scalarization
- secure-child selection via a lower-confidence-bound style final action

What it still does not currently expose:

- optional RAVE or AMAF statistics
- selection-time or backprop-time AMAF move tracking
- pruning during selection
- public RAVE introspection on node views or node stats

### Suggested Next Steps

RAVE should stay deferred for now. The recent experiment increased engine complexity and did not yet show strong enough gains on the canonical benchmark set to justify landing it.

Recommended path before revisiting it:

1. keep the committed engine on the simpler direct-value baseline
2. continue testing RAVE or similar ideas in isolated branches until they show a clear strength win
3. only then decide whether any public RAVE diagnostics belong in node views or exported stats
4. revisit pruning only after a simpler optional optimization has clearly earned its keep

### Integration Risks To Keep In Mind

- RAVE assumes move identities are reusable across sibling lines; that is game-dependent and weaker when moves are highly state-relative.
- The current engine's team-value scalarization should remain the single source of truth for direct node value, so any RAVE value should likely be blended as another estimate of that same scalar value rather than as raw team rewards alone.
- Tree reuse through `advanceToChild()` means any added RAVE statistics need to stay coherent when subtrees are retained across turns.

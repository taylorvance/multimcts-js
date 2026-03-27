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

What it does not currently expose:

- RAVE or other AMAF statistics
- pruning during selection
- rollout move-set collection for backpropagation-side statistics

### Suggested Adoption Order

If this repo revisits search optimizations, the lowest-risk order is:

1. add optional RAVE support behind a disabled-by-default engine option
2. extend diagnostics and profiling so RAVE impact is measurable before tuning
3. revisit pruning only after RAVE is working and benchmarked

### Integration Risks To Keep In Mind

- RAVE assumes move identities are reusable across sibling lines; that is game-dependent and weaker when moves are highly state-relative.
- The current engine's team-value scalarization should remain the single source of truth for direct node value, so any RAVE value should likely be blended as another estimate of that same scalar value rather than as raw team rewards alone.
- Tree reuse through `advanceToChild()` means any added RAVE statistics need to stay coherent when subtrees are retained across turns.

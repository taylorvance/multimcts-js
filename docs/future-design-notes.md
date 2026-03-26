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

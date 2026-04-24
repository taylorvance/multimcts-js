# Lazy Refutation Pruning

## Purpose

This note captures the current idea for a narrow pruning experiment in the TypeScript engine.

The target is not broad tactical solving. The target is to avoid repeated search on a move that has already been disproven by a naturally discovered immediate reply.

## Core Idea

When normal tree expansion creates a child node and that child is terminal, the engine already has an exact terminal result for that line.

If that terminal child proves that the parent move is tactically refuted, mark the parent move as refuted and exclude it from future UCT selection.

Important constraints:

- do not proactively scan all replies
- do not add a separate tactical search pass
- do not re-evaluate unexplored sibling replies just to prove a refutation
- only piggyback on child nodes discovered through the normal selection and expansion flow

This is intentionally lazy. The optimization only starts helping after the search has already encountered the refuting reply once.

## Intended Benefit

The expected benefit is not faster proof of bad moves.

The expected benefit is preventing repeated waste on a branch that is already known to contain a terminal tactical punishment discovered during ordinary search.

This should be most relevant in positions where:

- immediate tactical refutations are common
- the same disproven move would otherwise continue to absorb visits through normal UCT pressure
- the search budget is constrained enough that avoiding repeated waste matters

## Non-Goals

- no proactive search over all opponent replies
- no generic mate solver or tactical oracle
- no claim that every discovered terminal child should trigger pruning
- no default assumption that the rule is sound for all multi-team or non-zero-sum settings
- no large API redesign around separate player identity vs team identity

## Why The Idea Needs Care

The engine is intentionally generic.

- rewards are stored per team
- node value is derived through configurable team-value scalarization
- the repo treats multiplayer and multi-team support as first-class constraints

Because of that, a hard "exclude this move from future selection" rule is a proof claim, not just a heuristic. That proof is straightforward in some adversarial settings and less clear in the general engine model.

The core engine should not silently bake in stronger assumptions than its public model supports.

## Current Direction

If this is pursued, the first version should separate:

- generic bookkeeping in the engine
- domain-specific or policy-specific refutation semantics

That means the engine mechanism can remain simple:

1. expand one child through the normal path
2. if the child is terminal, compute the exact terminal rewards already available on that path
3. ask a narrow policy hook whether this child proves the parent move is refuted
4. if yes, mark that parent move as refuted
5. during later UCT selection, skip refuted moves when at least one unrefuted alternative exists

This keeps the implementation lazy and keeps the proof rule explicit.

## Initial Scope Recommendation

Recommended initial scope:

- optional experiment, not default behavior
- narrow adversarial settings first
- benchmark-driven acceptance

This idea is most defensible when the caller can define a sound "refuting terminal reply" rule for the game and value model in use.

## Engine Touchpoints

If implemented, the likely touchpoints are:

- expansion, where a newly created child can be recognized as terminal
- simulation, which already returns exact terminal rewards for terminal children
- selection, which would need to skip refuted children when alternatives remain
- node bookkeeping, which would need a small amount of additional per-child or per-edge state

The implementation should stay close to the current hot path and avoid spreading special cases across unrelated engine logic.

## Expected Costs

For the lazy version, direct runtime overhead should be small.

Likely added costs:

- one extra terminal-child check on normal expansion paths
- a small amount of bookkeeping when a refutation is discovered
- selection-time filtering over child moves
- modest extra node or edge state

The larger cost is semantic complexity, not raw CPU or memory use.

## Main Risks

- unsound pruning if the refutation trigger is too broad
- hidden assumptions about two-player adversarial structure leaking into the generic engine
- benchmark noise that looks promising in tactical spots but does not hold up across canonical scenarios
- extra node invariants that make future engine changes harder to reason about

## Benchmark Plan

This idea should only land if it earns its place through measurement.

Suggested evaluation:

1. add diagnostics for refutations discovered and refuted-child skips during selection
2. test on tactical scenarios where immediate punishments plausibly occur
3. compare search throughput, retained-node shape, and arena strength
4. keep the experiment if it shows a clear practical gain rather than just plausible tactical anecdotes

## Ship Criteria

Good reasons to keep it:

- measurable strength gain in canonical adversarial benchmarks
- reduced waste in diagnostics without distorting final move quality
- limited code size and a clean optional interface

Good reasons to drop it:

- negligible benchmark impact
- awkward generic API pressure
- correctness concerns outside a narrow domain
- hot-path complexity that is larger than the practical win

## Current Decision

Current decision: document the idea, keep it out of the default engine for now, and only revisit implementation as a narrow optional experiment with explicit proof semantics and benchmark evidence.

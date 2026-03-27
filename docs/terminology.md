# Terminology

This document records the preferred public names for engine parameters and the naming rules behind them.

The goal is not to mirror every paper's symbols exactly. Papers often use short symbols such as `C`, `k`, `alpha`, or `beta` without supplying a user-facing API term. This glossary chooses stable, readable names that still map cleanly back to the underlying literature.

## Naming Rules

- Use `...Constant` for scalar tuning coefficients that act as additive or multiplicative constants in scoring formulas.
- Use `...Weight` or `...Blend` for interpolation factors.
- Use `...Exponent` for power-law parameters.
- Use `...Threshold` for cutoffs.
- Use `...Strategy` or `...Policy` for categorical choices.
- Use `max...` for hard search limits.
- Prefer zero as the disabled state for optional optimization constants when that keeps the API simpler than a separate boolean.

## Current Canonical Terms

- `explorationConstant`
  Maps to the UCT exploration coefficient often written as `C` or `Cp`.
- `teamValueStrategy`
  Names the built-in scalarization rule used to convert team rewards into the value optimized at a node.
- `finalActionStrategy`
  Names the rule used to choose the final move after search completes.

## Compatibility Aliases

This older name remains accepted for compatibility while downstream repos migrate:

- `explorationBias` -> `explorationConstant`

New docs and examples should prefer the canonical `...Constant` form.

## Reserved Future Terms

These are not current public options, but they are the preferred names if the corresponding features ever land:

- `raveConstant`
  Preferred public name for a future RAVE or AMAF blending constant, if RAVE ever proves worth adding.

## Deprecation Removal Plan

The compatibility alias should not remain forever.

Recommended cleanup path:

1. migrate `mcts-web` and any other known consumers to `explorationConstant`
2. keep accepting the deprecated aliases through the next non-breaking release line
3. remove `explorationBias` in the next deliberate breaking release after consumer migration is complete

Before removal, audit both code and docs for:

- `explorationBias`

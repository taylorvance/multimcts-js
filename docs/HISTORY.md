# Project History

This document is narrative context, not release history.

`CHANGELOG.md` tracks package and repo changes. This file explains how the project came to exist and why it looks the way it does.

## Status

This is a first-draft history based on the project author's recollection and adjacent repos in this workspace. It should be treated as internal historical context, not as an externally verified academic or literature review.

When this document mentions historical repos or file locations, treat them as descriptive context rather than guaranteed local paths. Where stable hosted repos are known, prefer the GitHub repo names. Some older snapshots in the author's workspace remain only partially mapped.

## Origin

The project started with `Hexachromix`, an original game invented by the author.

Before there was a generic engine, there was a game idea and physical prototyping:

- Hexachromix was first explored on pen and paper.
- The first software form was a pure Python CLI prototype of the game itself.

That matters because the engine did not come first. Hexachromix created the need for the engine, even though the engine itself was kept generic rather than hard-coded to Hexachromix rules.

## What Hexachromix Is

Hexachromix is a color-mixing connection strategy game played on a hexagonal board.

At a high level:

- the goal is to connect one side of the board to the opposite side using your color
- play proceeds in fixed color order: `R Y G C B M`
- the game supports 2 to 6 players, with different team variants
- the core mechanic is color mixing between the `RGB` and `CMY` systems

The rules distinguish three move types:

- claim an empty space
- share a space with exactly one color from the same color system
- mix a space containing the two colors from the other color system that combine into your color

The winning condition is connection-based: the first color to connect its side to the opposite side wins for its whole team.

## Why A Custom MCTS Engine Existed At All

After the initial game prototype, the author researched game AI approaches and landed on Monte Carlo Tree Search.

During that research, the author repeatedly ran into a framing that MCTS was mainly for 2-player perfect-information games. Hexachromix did not fit neatly into that box: it was designed for 2 to 6 players, and the engine needed to reason about more than a simple two-sided zero-sum objective.

The author's response was not to treat that as a hard limit. Instead, the author built a custom multiplayer or multi-team MCTS engine by synthesizing ideas from existing MCTS implementations and research papers, then shaping the engine around the requirements exposed by Hexachromix without baking Hexachromix-specific rules into the engine itself.

Whether that "multi" angle was fully novel in the literature is not claimed here as a verified fact. What is true historically is that the author did not find enough off-the-shelf material addressing the exact shape of the problem, so the engine was built anyway.

## Early Engine Phase

The earliest engine work lived in Python, then in more optimized Cython-oriented code.

Key characteristics of that phase:

- support for more than two players or teams
- reward accounting that was not limited to a single binary win-loss axis
- experimentation with rollout policies and search constants
- a strong emphasis on making the AI actually useful for Hexachromix rather than merely academically tidy

Relevant historical material from that era exists in older Python, Cython, and merge-snapshot codebases. Stable hosted repos identified from the current workspace include:

- `taylorvance/multimcts`
- `taylorvance/hexachromix-lib`

There is also additional archival material in local workspace directories named `cython` and `mcts`, but those are not assumed to exist everywhere.

The strongest historical reference for advanced search features is `multimcts/mcts.pyx` in `taylorvance/multimcts`.

That branch contains features such as RAVE, pruning, rollout move tracking, and other performance-oriented search details that informed later work.

## Hexachromix Web App Phase

Once the game and engine were far enough along, the work expanded into a full Hexachromix web application with online play support.

That phase included:

- a full web app for playing Hexachromix
- a server that connected players to each other
- eventual support for AI computer players
- MCTS acting as the AI brain behind those computer players

The AI integration mattered because it forced the search engine to operate as part of a real product rather than as an isolated experiment.

Relevant hosted repos from that phase include:

- `taylorvance/hexachromix`
- `taylorvance/hexachromixio`

One useful reference point is the `hexachromix/tasks.py` integration path in `taylorvance/hexachromixio`.

That file shows the web app asking an API service for the best move in a live game context.

## Generic JavaScript Port Phase

After the Hexachromix web-app phase, the same generic engine work was repackaged into a static web app for MCTS experiments across multiple games.

That phase involved:

- porting the engine to JavaScript
- exposing the engine in a more explicitly general-purpose multi-game format
- offering multiple games through a single MCTS-oriented web app
- hosting the result as a static site, including GitHub Pages usage

The important product shift was not from a Hexachromix-specific engine to a generic engine. The engine had already been kept generic. The shift was from using that engine mainly in service of Hexachromix to packaging it more explicitly as a reusable multi-game MCTS project.

That multi-game web application is `taylorvance/mcts-web`, which remains the main companion application and practical driver for the engine work in this repo.

## TypeScript V2 Phase

This repo is the current TypeScript v2 migration.

The goals of this phase include:

- a typed public engine API
- clearer separation between generic engine logic and game modules
- better diagnostics, profiling, and arena-style comparison tooling
- more games
- more search optimizations, but with stronger structure and measurement around them

In practice, this engine and `taylorvance/mcts-web` should be understood as closely paired projects: this repo provides the engine and tooling, while `mcts-web` is the main playground and application layer exercising that engine.

This is not a greenfield rewrite detached from the past. It is the latest stage in a line that goes:

1. pen-and-paper Hexachromix
2. pure Python Hexachromix prototype
3. custom Python and Cython multiplayer MCTS engine
4. Hexachromix web app with AI players
5. generic JavaScript MCTS app with multiple games
6. TypeScript v2 engine and library in this repo

## Through-Line

Several ideas stayed consistent across the whole arc:

- the project was driven by real game needs, not by implementing a textbook algorithm in isolation
- multiplayer or multi-team support was a first-class requirement, not an afterthought
- the engine was repeatedly reshaped by practical use in Hexachromix and mcts-web
- optimization work only matters if it survives contact with real games and real tooling

## Open Historical Follow-Ups

This file should likely gain more detail over time, especially around:

- dates or approximate eras for each phase
- which historical repos were authoritative at which points
- which ideas were first introduced in Python, Cython, JS, and TS respectively
- how the Hexachromix variants map onto later generic engine abstractions

---
"multimcts": minor
---

Add the new `multimcts/isolation` benchmark export and built-in Isolation profiling scenarios.

Generalize the arena harness so two competitors can be compared on scenarios with more than two in-game teams, including Isolation, while preserving the existing commit-vs-commit workflow.

Rename the canonical exploration tuning option to `explorationConstant` while keeping `explorationBias` supported as a deprecated compatibility alias.

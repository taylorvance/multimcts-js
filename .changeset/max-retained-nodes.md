---
"multimcts": minor
---

Add an optional `maxRetainedNodes` search limit to cap the size of the retained MCTS tree.

The engine now tracks retained-node counts incrementally, surfaces the capped count in diagnostics, and stops search once the retained tree reaches the configured limit while still allowing an initial expansion round on a fresh root.

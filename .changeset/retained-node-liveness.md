---
"multimcts": patch
---

Require `maxRetainedNodes` searches to also provide either `maxIterations` or `maxTimeMs`.

This prevents retained-node-only searches from running indefinitely when the reachable game tree never grows large enough to hit the configured retained-node cap.

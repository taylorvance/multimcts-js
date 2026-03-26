# multimcts

TypeScript Monte Carlo Tree Search for multi-team turn-based games.

## v2 shape

- Typed `GameState<TMove, TTeam, TState>` base class
- Structured `search()` results with metrics and tree access
- First-class tree reuse through `ensureRoot()` and `advanceToChild()`
- `Map`-based move and reward storage

## Example

```ts
import { MCTS } from 'multimcts';
import { TicTacToeState } from 'multimcts/tictactoe';

const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>();
const state = new TicTacToeState();

const result = mcts.search(state, { maxIterations: 1000 });
console.log(result.bestMove);
```

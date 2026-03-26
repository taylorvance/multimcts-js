import assert from 'node:assert/strict';
import test from 'node:test';
import { GameState, MCTS } from '../src/index.js';
import { TicTacToeState } from '../src/examples/tictactoe.js';

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

class ThreeTeamState extends GameState<string, 'A' | 'B' | 'C', ThreeTeamState> {
  readonly step: number;
  readonly team: 'A' | 'B' | 'C';

  constructor(step = 0, team: 'A' | 'B' | 'C' = 'A') {
    super();
    this.step = step;
    this.team = team;
  }

  getCurrentTeam() {
    return this.team;
  }

  getLegalMoves() {
    return this.step === 0 ? ['finish'] : [];
  }

  makeMove(_move: string) {
    return new ThreeTeamState(1, 'B');
  }

  isTerminal() {
    return this.step === 1;
  }

  getReward() {
    return { A: 1, B: 0.25, C: -0.25 };
  }

  override toString() {
    return `${this.team}:${this.step}`;
  }
}

test('search validates limits', () => {
  const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>();

  assert.throws(() => mcts.search(new TicTacToeState(), {}), /At least one/);
  assert.throws(
    () => mcts.search(new TicTacToeState(), { maxIterations: 0 }),
    /maxIterations must be a positive integer/,
  );
  assert.throws(
    () => mcts.search(new TicTacToeState(), { maxTimeMs: 0 }),
    /maxTimeMs must be a positive number/,
  );
});

test('search rejects terminal roots', () => {
  const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>();
  const terminalState = new TicTacToeState([
    'X', 'X', 'X',
    null, null, null,
    null, null, null,
  ], 'O');

  assert.throws(() => mcts.search(terminalState, { maxIterations: 1 }), /terminal state/);
});

test('search finds a winning Tic-Tac-Toe move', () => {
  const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>({
    random: createSeededRandom(7),
  });
  const state = new TicTacToeState([
    'X', 'X', null,
    null, 'O', null,
    null, null, 'O',
  ], 'X');

  const result = mcts.search(state, { maxIterations: 200 });

  assert.equal(result.bestMove, 2);
  assert.equal(result.root.visits, 200);
  assert.ok(result.bestChild);
});

test('search reuses the existing root for equivalent states', () => {
  const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>({
    random: createSeededRandom(11),
  });
  const firstState = new TicTacToeState();
  const firstResult = mcts.search(firstState, { maxIterations: 25 });
  const firstRoot = firstResult.root;

  const secondState = new TicTacToeState();
  const secondResult = mcts.search(secondState, { maxIterations: 25 });

  assert.equal(secondResult.root, firstRoot);
  assert.ok(secondResult.root.visits > firstRoot.children.size);
});

test('advanceToChild promotes an explored child to the root', () => {
  const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>({
    random: createSeededRandom(19),
  });
  const state = new TicTacToeState();
  const result = mcts.search(state, { maxIterations: 50 });
  const move = result.bestMove;

  assert.notEqual(move, null);
  const resolvedMove = move as number;

  const nextState = state.makeMove(resolvedMove);
  const child = result.root.children.get(resolvedMove);

  assert.ok(child);
  assert.equal(mcts.advanceToChild(resolvedMove, nextState), child);
  assert.equal(mcts.root, child);
  assert.equal(child.parent, null);
});

test('dict rewards propagate through multi-team searches', () => {
  const mcts = new MCTS<ThreeTeamState, string, 'A' | 'B' | 'C'>({
    random: createSeededRandom(3),
  });

  const result = mcts.search(new ThreeTeamState(), { maxIterations: 1 });

  assert.equal(result.bestMove, 'finish');
  assert.deepEqual([...result.root.rewards.entries()], [['A', 1], ['B', 0.25], ['C', -0.25]]);
  assert.deepEqual(
    [...result.bestChild?.rewards.entries() ?? []],
    [['A', 1], ['B', 0.25], ['C', -0.25]],
  );
});

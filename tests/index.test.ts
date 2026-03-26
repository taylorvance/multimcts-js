import assert from 'node:assert/strict';
import test from 'node:test';
import { GameState, MCTS, SearchNode } from '../src/index.ts';
import { TicTacToeState } from '../src/examples/tictactoe.ts';

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

class ChoiceState extends GameState<'safe' | 'swing', 'P', ChoiceState> {
  readonly id: 'root' | 'safe' | 'swing';

  constructor(id: 'root' | 'safe' | 'swing' = 'root') {
    super();
    this.id = id;
  }

  getCurrentTeam() {
    return 'P' as const;
  }

  getLegalMoves() {
    return this.id === 'root' ? ['safe', 'swing'] as const : [];
  }

  makeMove(move: 'safe' | 'swing') {
    return new ChoiceState(move);
  }

  isTerminal() {
    return this.id !== 'root';
  }

  getReward() {
    return 0;
  }
}

class RolloutSamplingState extends GameState<string, 'R', RolloutSamplingState> {
  readonly step: number;
  readonly legalMoveCalls: [number];
  readonly rolloutSelectionCalls: [number];

  constructor(
    step = 0,
    legalMoveCalls: [number] = [0],
    rolloutSelectionCalls: [number] = [0],
  ) {
    super();
    this.step = step;
    this.legalMoveCalls = legalMoveCalls;
    this.rolloutSelectionCalls = rolloutSelectionCalls;
  }

  getCurrentTeam() {
    return 'R' as const;
  }

  getLegalMoves() {
    this.legalMoveCalls[0] += 1;

    if(this.step <= 1) {
      return ['advance'];
    }

    throw new Error('getLegalMoves() should not be used beyond node expansion in this test.');
  }

  makeMove(_move: string) {
    return new RolloutSamplingState(this.step + 1, this.legalMoveCalls, this.rolloutSelectionCalls);
  }

  isTerminal() {
    return this.step >= 2;
  }

  getReward() {
    return 1;
  }

  override selectRolloutMove() {
    if(this.step !== 1) {
      return null;
    }

    this.rolloutSelectionCalls[0] += 1;
    return 'finish';
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
  assert.ok(secondResult.root.visits > 25);
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

test('robustChild is the default final action strategy', () => {
  const mcts = new MCTS<ChoiceState, 'safe' | 'swing', 'P'>({
    finalActionStrategy: 'robustChild',
  });
  const root = new SearchNode(new ChoiceState(), createSeededRandom(5));
  const safeChild = new SearchNode(new ChoiceState('safe'), createSeededRandom(5), root, 'safe');
  const swingChild = new SearchNode(new ChoiceState('swing'), createSeededRandom(5), root, 'swing');

  root.children.set('safe', safeChild);
  root.children.set('swing', swingChild);
  root.isFullyExpanded = true;

  for(let index = 0; index < 10; index += 1) {
    root.visit(new Map([['P', 0.6]]));
    safeChild.visit(new Map([['P', 0.6]]));
  }

  for(let index = 0; index < 2; index += 1) {
    root.visit(new Map([['P', 1]]));
    swingChild.visit(new Map([['P', 1]]));
  }

  mcts.root = root;

  assert.equal(mcts.getMaxChild(), swingChild);
  assert.equal(mcts.getRobustChild(), safeChild);
  assert.equal(mcts.getBestMove(), 'safe');
});

test('simulate can use selectRolloutMove without allocating legal moves', () => {
  const state = new RolloutSamplingState();
  const mcts = new MCTS<RolloutSamplingState, string, 'R'>({
    random: createSeededRandom(13),
  });

  const result = mcts.search(state, { maxIterations: 1 });

  assert.equal(result.bestMove, 'advance');
  assert.equal(state.legalMoveCalls[0], 2);
  assert.equal(state.rolloutSelectionCalls[0], 1);
});

test('searchWithDiagnostics returns search-shape telemetry without changing engine defaults', () => {
  const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>({
    random: createSeededRandom(17),
  });

  const result = mcts.searchWithDiagnostics(new TicTacToeState(), { maxIterations: 20 });

  assert.ok(result.diagnostics);
  assert.equal(result.diagnostics.createdNodes >= 1, true);
  assert.equal(result.diagnostics.expandedNodes >= 1, true);
  assert.equal(result.diagnostics.rolloutSimulationCount >= 1, true);
  assert.equal(result.diagnostics.retainedNodeCount >= 1, true);
  assert.equal(result.diagnostics.treeMaxDepth >= 1, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { GameState, MCTS, teamValueStrategies } from '../src/index.ts';
import { BreakthroughState, type BreakthroughCell } from '../src/games/breakthrough.ts';
import { IsolationState, playIsolationMoves } from '../src/games/isolation.ts';
import { TicTacToeState } from '../src/examples/tictactoe.ts';
import { HexState, playHexMoves } from '../src/games/hex.ts';
// @ts-expect-error arena helper is a runtime JS module without a declaration file.
import { parseArenaOptions, playArenaGame } from '../scripts/lib/arena-core.mjs';
// @ts-expect-error profile helper is a runtime JS module without a declaration file.
import { parseOptions as parseProfileOptions } from '../scripts/profile-search.mjs';

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

class OutcomePreferenceState extends GameState<
  'balanced' | 'selfish',
  'A' | 'B' | 'C',
  OutcomePreferenceState
> {
  readonly id: 'root' | 'balanced' | 'selfish';

  constructor(id: 'root' | 'balanced' | 'selfish' = 'root') {
    super();
    this.id = id;
  }

  getCurrentTeam() {
    return this.id === 'root' ? 'A' : 'B';
  }

  getLegalMoves() {
    return this.id === 'root' ? ['balanced', 'selfish'] as const : [];
  }

  makeMove(move: 'balanced' | 'selfish') {
    return new OutcomePreferenceState(move);
  }

  isTerminal() {
    return this.id !== 'root';
  }

  getReward() {
    return this.id === 'balanced'
      ? { A: 1, B: 0.9, C: 0 }
      : { A: 0.8, B: 0, C: 0 };
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

  override sampleLegalMove() {
    this.rolloutSelectionCalls[0] += 1;
    return 'finish';
  }
}

class ArenaTwoPlyState extends GameState<string, 'red' | 'blue', ArenaTwoPlyState> {
  readonly ply: number;

  constructor(ply = 0) {
    super();
    this.ply = ply;
  }

  getCurrentTeam() {
    return this.ply === 0 ? 'red' : 'blue';
  }

  getLegalMoves() {
    return this.ply < 2 ? [`move-${this.ply}`] : [];
  }

  makeMove(_move: string) {
    return new ArenaTwoPlyState(this.ply + 1);
  }

  isTerminal() {
    return this.ply >= 2;
  }

  getReward() {
    return { blue: 0, red: 1 };
  }
}

class ArenaThreeTeamState extends GameState<string, 'red' | 'blue' | 'green', ArenaThreeTeamState> {
  readonly ply: number;

  constructor(ply = 0) {
    super();
    this.ply = ply;
  }

  getCurrentTeam() {
    if(this.ply === 0) {
      return 'red';
    }

    if(this.ply === 1) {
      return 'blue';
    }

    return 'green';
  }

  getLegalMoves() {
    return this.ply < 3 ? [`move-${this.ply}`] : [];
  }

  makeMove(_move: string) {
    return new ArenaThreeTeamState(this.ply + 1);
  }

  isTerminal() {
    return this.ply >= 3;
  }

  getReward() {
    return { blue: 0, green: -1, red: 1 };
  }
}

class SuggestionRolloutState extends GameState<string, 'S', SuggestionRolloutState> {
  readonly step: number;
  readonly suggestionCalls: [number];
  readonly sampledRandomValues: number[];

  constructor(
    step = 0,
    suggestionCalls: [number] = [0],
    sampledRandomValues: number[] = [],
  ) {
    super();
    this.step = step;
    this.suggestionCalls = suggestionCalls;
    this.sampledRandomValues = sampledRandomValues;
  }

  getCurrentTeam() {
    return 'S' as const;
  }

  getLegalMoves() {
    return this.step < 2 ? ['expand'] : [];
  }

  makeMove(_move: string) {
    return new SuggestionRolloutState(
      this.step + 1,
      this.suggestionCalls,
      this.sampledRandomValues,
    );
  }

  isTerminal() {
    return this.step >= 2;
  }

  getReward() {
    return 1;
  }

  override suggestRollout(random: () => number) {
    this.suggestionCalls[0] += 1;
    this.sampledRandomValues.push(random());

    return {
      move: 'rollout',
      nextState: new SuggestionRolloutState(
        this.step + 1,
        this.suggestionCalls,
        this.sampledRandomValues,
      ),
    };
  }

  override sampleLegalMove(_random: () => number): string {
    throw new Error('sampleLegalMove should not be called when suggestRollout is provided.');
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

test('deprecated bias aliases remain supported for constants', () => {
  const mcts = new MCTS<TicTacToeState, number, 'X' | 'O'>({
    explorationBias: 1.5,
  });

  assert.equal(mcts.explorationConstant, 1.5);
  assert.equal(mcts.explorationBias, 1.5);
});

test('CLI parsers accept explicit zero for constant flags', () => {
  const arenaOptions = parseArenaOptions([
    '--exploration-constant-a', '0',
    '--exploration-constant-b', '0',
  ]);
  const profileOptions = parseProfileOptions([
    '--exploration-constant', '0',
  ]);

  assert.equal(arenaOptions.explorationConstantA, 0);
  assert.equal(arenaOptions.explorationConstantB, 0);
  assert.equal(profileOptions.explorationConstant, 0);
});

test('constructor rejects conflicting constant and bias aliases', () => {
  assert.throws(
    () => new MCTS<TicTacToeState, number, 'X' | 'O'>({
      explorationBias: 1,
      explorationConstant: 2,
    }),
    /explorationConstant and explorationBias cannot disagree/,
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
  assert.deepEqual([...result.root.utilitySums.entries()], [['A', 1], ['B', 0.25], ['C', -0.25]]);
  assert.deepEqual(
    [...result.bestChild?.utilitySums.entries() ?? []],
    [['A', 1], ['B', 0.25], ['C', -0.25]],
  );
});

test('robustChild is the default final action strategy', () => {
  const mcts = new MCTS<ChoiceState, 'safe' | 'swing', 'P'>({
    explorationConstant: 0,
    finalActionStrategy: 'robustChild',
    random: createSeededRandom(5),
  });
  const result = mcts.search(new ChoiceState(), { maxIterations: 12 });

  assert.equal(result.bestMove, mcts.getRobustChild(result.root)?.move ?? null);
});

test('simulate can use sampleLegalMove without allocating legal moves', () => {
  const state = new RolloutSamplingState();
  const mcts = new MCTS<RolloutSamplingState, string, 'R'>({
    random: createSeededRandom(13),
  });

  const result = mcts.search(state, { maxIterations: 1 });

  assert.equal(result.bestMove, 'advance');
  assert.equal(state.legalMoveCalls[0], 2);
  assert.equal(state.rolloutSelectionCalls[0], 1);
});

test('simulate passes rng through suggestRollout and uses its next state directly', () => {
  const state = new SuggestionRolloutState();
  const mcts = new MCTS<SuggestionRolloutState, string, 'S'>({
    random: createSeededRandom(23),
  });

  const result = mcts.search(state, { maxIterations: 1 });

  assert.equal(result.bestMove, 'expand');
  assert.equal(state.suggestionCalls[0], 1);
  assert.equal(state.sampledRandomValues.length, 1);
  const sampledValue = state.sampledRandomValues[0];
  assert.notEqual(sampledValue, undefined);
  if(sampledValue === undefined) {
    throw new Error('Expected suggestRollout to record an RNG sample.');
  }
  assert.ok(sampledValue >= 0 && sampledValue < 1);
});

test('TicTacToeState.sampleLegalMove does not require getLegalMoves', () => {
  class NoListTicTacToeState extends TicTacToeState {
    override getLegalMoves(): number[] {
      throw new Error('getLegalMoves should not be called');
    }
  }

  const state = new NoListTicTacToeState([
    'X', null, 'O',
    null, 'X', null,
    'O', null, null,
  ], 'X');
  const move = state.sampleLegalMove(createSeededRandom(31));

  assert.equal(state.board[move], null);
});

test('team value strategies are pure and produce expected scalar scores', () => {
  const rewards = new Map<'A' | 'B' | 'C', number>([
    ['A', 1],
    ['B', 0.25],
    ['C', 0.8],
  ]);

  assert.equal(teamValueStrategies.self('A', rewards), 1);
  assert.ok(Math.abs(teamValueStrategies.margin('A', rewards) - (-0.05)) < 1e-9);
  assert.ok(Math.abs(teamValueStrategies.vsBestOpponent('A', rewards) - 0.2) < 1e-9);
});

test('search can swap team value strategies without changing terminal reward shape', () => {
  const selfMcts = new MCTS<OutcomePreferenceState, 'balanced' | 'selfish', 'A' | 'B' | 'C'>({
    explorationConstant: 0,
    finalActionStrategy: 'maxChild',
    random: createSeededRandom(21),
    teamValueStrategy: 'self',
  });
  const marginMcts = new MCTS<OutcomePreferenceState, 'balanced' | 'selfish', 'A' | 'B' | 'C'>({
    explorationConstant: 0,
    finalActionStrategy: 'maxChild',
    random: createSeededRandom(21),
    teamValueStrategy: 'margin',
  });

  assert.equal(
    selfMcts.search(new OutcomePreferenceState(), { maxIterations: 12 }).bestMove,
    'balanced',
  );
  assert.equal(
    marginMcts.search(new OutcomePreferenceState(), { maxIterations: 12 }).bestMove,
    'selfish',
  );
});

test('custom team value evaluators can override the built-in strategy table', () => {
  const mcts = new MCTS<OutcomePreferenceState, 'balanced' | 'selfish', 'A' | 'B' | 'C'>({
    evaluateTeamValue: (_team, rewards) => (rewards.get('A') ?? 0) + (rewards.get('B') ?? 0),
    explorationConstant: 0,
    finalActionStrategy: 'maxChild',
    random: createSeededRandom(29),
  });

  assert.equal(
    mcts.search(new OutcomePreferenceState(), { maxIterations: 12 }).bestMove,
    'balanced',
  );
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

test('HexState detects a vertical win for B and reports per-team rewards', () => {
  const state = playHexMoves([
    0,
    1,
    7,
    2,
    14,
    3,
    21,
    4,
    28,
    5,
    35,
    6,
    42,
  ]);

  assert.equal(state.isTerminal(), true);
  assert.deepEqual(state.getReward(), { B: 1, W: 0 });
});

test('HexState opening exposes the expected number of legal moves', () => {
  const state = new HexState();

  assert.equal(state.getLegalMoves().length, 49);
  assert.equal(state.sampleLegalMove(createSeededRandom(37)) >= 0, true);
});

test('BreakthroughState opening exposes the expected legal moves', () => {
  const state = new BreakthroughState();

  assert.equal(state.getLegalMoves().length, 22);
  assert.match(state.sampleLegalMove(createSeededRandom(41)), /^\d+:\d+$/);
});

test('BreakthroughState detects a home-rank win for W', () => {
  const board = Array<BreakthroughCell>(64).fill(null);
  board[9] = 'W';
  board[54] = 'B';
  const state = new BreakthroughState(board, true);
  const terminalState = state.makeMove('9:0');

  assert.equal(terminalState.isTerminal(), true);
  assert.deepEqual(terminalState.getReward(), { W: 1, B: 0 });
});

test('IsolationState opening exposes the expected number of legal moves', () => {
  const state = new IsolationState();

  assert.equal(state.getCurrentTeam(), 'A');
  assert.equal(state.getLegalMoves().length, 8);
  assert.equal(state.getLegalMoves().includes(state.sampleLegalMove(createSeededRandom(43))), true);
});

test('IsolationState skips and eliminates trapped players when advancing the turn', () => {
  const board = [
    '#', 'B', '#', '#', '#',
    '#', '#', '#', '#', '#',
    '#', null, 'A', null, '#',
    '#', '#', '#', null, '#',
    '#', '#', 'C', null, '#',
  ] as const;
  const state = new IsolationState(board, 'A', 5);
  const nextState = state.makeMove(11);

  assert.equal(nextState.isTerminal(), false);
  assert.equal(nextState.getCurrentTeam(), 'C');
  assert.equal(nextState.board[1], '#');
});

test('IsolationState detects the lone survivor as the winner', () => {
  const board = [
    '#', '#', '#', '#', '#',
    '#', '#', 'A', '#', '#',
    '#', '#', '#', '#', '#',
    '#', '#', '#', '#', '#',
    '#', '#', '#', '#', '#',
  ] as const;
  const state = new IsolationState(board, 'A', 5);

  assert.equal(state.isTerminal(), true);
  assert.deepEqual(state.getReward(), { A: 1, B: 0, C: 0 });
});

test('playIsolationMoves produces a non-terminal multiplayer midgame', () => {
  const state = playIsolationMoves([
    17,
    29,
    33,
    25,
    22,
    26,
    32,
    16,
    18,
  ], 7);

  assert.equal(state.isTerminal(), false);
  assert.equal(state.getCurrentTeam(), 'A');
  assert.equal(state.getLegalMoves().length > 0, true);
});

test('playArenaGame advances both agents after every played move', () => {
  const advanceCalls: Array<[string, string]> = [];
  const chooseCalls: string[] = [];

  const createAgent = (agentKey: 'A' | 'B') => ({
    advance: (move: string, nextState: ArenaTwoPlyState) => {
      advanceCalls.push([agentKey, `${move}:${nextState.ply}`]);
      return true;
    },
    chooseMove: (state: ArenaTwoPlyState) => {
      chooseCalls.push(`${agentKey}:${state.ply}`);
      return {
        elapsedMs: 0,
        iterations: 5,
        move: `move-${state.ply}`,
      };
    },
    getSummary: () => ({
      avgIterationsPerMove: 5,
      avgMoveMs: 0,
      iterations: 5,
      moveMs: 0,
      moves: 1,
    }),
  });

  const result = playArenaGame({
    alternateSeats: true,
    createAgents: () => ({
      A: createAgent('A'),
      B: createAgent('B'),
    }),
    createInitialState: () => new ArenaTwoPlyState(),
    gameIndex: 0,
    iterations: {
      A: 10,
      B: 10,
    },
  });

  assert.equal(result.winner, 'A');
  assert.deepEqual(chooseCalls, ['A:0', 'B:1']);
  assert.deepEqual(advanceCalls, [
    ['A', 'move-0:1'],
    ['B', 'move-0:1'],
    ['A', 'move-1:2'],
    ['B', 'move-1:2'],
  ]);
});

test('playArenaGame rejects games that reveal more than two teams', () => {
  const createAgent = () => ({
    advance: () => true,
    chooseMove: (state: ArenaThreeTeamState) => ({
      elapsedMs: 0,
      iterations: 1,
      move: `move-${state.ply}`,
    }),
    getSummary: () => ({
      avgIterationsPerMove: 1,
      avgMoveMs: 0,
      iterations: 1,
      moveMs: 0,
      moves: 1,
    }),
  });

  assert.throws(
    () => playArenaGame({
      alternateSeats: false,
      createAgents: () => ({
        A: createAgent(),
        B: createAgent(),
      }),
      createInitialState: () => new ArenaThreeTeamState(),
      gameIndex: 0,
      iterations: {
        A: 10,
        B: 10,
      },
    }),
    /supports exactly 2 distinct teams/,
  );
});

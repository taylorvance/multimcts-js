import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const BUILTIN_ARENA_SCENARIOS = {
  'breakthrough-opening': './scenarios/breakthrough-opening.mjs',
  'breakthrough-midgame': './scenarios/breakthrough-midgame.mjs',
  'connect-four-opening': './scenarios/connect-four-opening.mjs',
  'connect-four-midgame': './scenarios/connect-four-midgame.mjs',
  'hex-opening': './scenarios/hex-opening.mjs',
  'hex-midgame': './scenarios/hex-midgame.mjs',
  'othello-opening': './scenarios/othello-opening.mjs',
  'tictactoe-opening': './scenarios/tictactoe-opening.mjs',
};

export const DEFAULT_ARENA_OPTIONS = {
  alternateSeats: true,
  engineA: '.',
  engineB: '.',
  explorationBiasA: Math.SQRT2,
  explorationBiasB: Math.SQRT2,
  finalActionStrategyA: 'robustChild',
  finalActionStrategyB: 'robustChild',
  games: undefined,
  iterationsA: undefined,
  iterationsB: undefined,
  json: false,
  modulePath: null,
  scenario: 'tictactoe-opening',
  seed: 0x51ced,
  teamValueStrategyA: 'margin',
  teamValueStrategyB: 'margin',
};

export const parsePositiveInt = (value, flagName) => {
  const parsed = Number.parseInt(value, 10);
  if(!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }

  return parsed;
};

export const parseNonNegativeInt = (value, flagName) => {
  const parsed = Number.parseInt(value, 10);
  if(!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative integer.`);
  }

  return parsed;
};

export const parsePositiveNumber = (value, flagName) => {
  const parsed = Number.parseFloat(value);
  if(!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive number.`);
  }

  return parsed;
};

export const parseArenaOptions = (rawArgs) => {
  const options = { ...DEFAULT_ARENA_OPTIONS };

  for(let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if(arg === '--json') {
      options.json = true;
      continue;
    }

    if(arg === '--no-alternate-seats') {
      options.alternateSeats = false;
      continue;
    }

    const nextValue = rawArgs[index + 1];
    if(nextValue === undefined) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch(arg) {
      case '--engine-a':
        options.engineA = nextValue;
        index += 1;
        break;
      case '--engine-b':
        options.engineB = nextValue;
        index += 1;
        break;
      case '--exploration-bias-a':
        options.explorationBiasA = parsePositiveNumber(nextValue, '--exploration-bias-a');
        index += 1;
        break;
      case '--exploration-bias-b':
        options.explorationBiasB = parsePositiveNumber(nextValue, '--exploration-bias-b');
        index += 1;
        break;
      case '--final-action-strategy-a':
        options.finalActionStrategyA = nextValue;
        index += 1;
        break;
      case '--final-action-strategy-b':
        options.finalActionStrategyB = nextValue;
        index += 1;
        break;
      case '--games':
        options.games = parsePositiveInt(nextValue, '--games');
        index += 1;
        break;
      case '--iterations-a':
        options.iterationsA = parsePositiveInt(nextValue, '--iterations-a');
        index += 1;
        break;
      case '--iterations-b':
        options.iterationsB = parsePositiveInt(nextValue, '--iterations-b');
        index += 1;
        break;
      case '--module':
        options.modulePath = nextValue;
        index += 1;
        break;
      case '--scenario':
        options.scenario = nextValue;
        index += 1;
        break;
      case '--seed':
        options.seed = parseNonNegativeInt(nextValue, '--seed');
        index += 1;
        break;
      case '--team-value-strategy-a':
        options.teamValueStrategyA = nextValue;
        index += 1;
        break;
      case '--team-value-strategy-b':
        options.teamValueStrategyB = nextValue;
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
};

export const createSeededRandom = (seed) => {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

export const resolveScenarioModulePath = (
  options,
  {
    builtinScenarios = BUILTIN_ARENA_SCENARIOS,
    cwd = process.cwd(),
    scriptDir,
  },
) => {
  if(options.modulePath) {
    return path.resolve(cwd, options.modulePath);
  }

  const builtinPath = builtinScenarios[options.scenario];
  if(!builtinPath) {
    throw new Error(`Unknown built-in scenario "${options.scenario}".`);
  }

  return path.resolve(scriptDir, builtinPath);
};

export const loadScenario = async (options, config) => {
  const modulePath = resolveScenarioModulePath(options, config);
  const scenarioModule = await import(pathToFileURL(modulePath).href);

  if(typeof scenarioModule.createInitialState !== 'function') {
    throw new Error(`Scenario module "${modulePath}" must export createInitialState().`);
  }

  return {
    createInitialState: scenarioModule.createInitialState,
    defaultGames: scenarioModule.defaultGames ?? 10,
    defaultIterations: scenarioModule.defaultIterations ?? 1000,
    label: scenarioModule.label ?? path.basename(modulePath),
    modulePath,
  };
};

export const resolveEngineModulePath = (input, cwd = process.cwd()) => {
  const resolvedPath = path.resolve(cwd, input);

  if(resolvedPath.endsWith('.js') || resolvedPath.endsWith('.mjs')) {
    return resolvedPath;
  }

  return path.join(resolvedPath, 'dist', 'index.js');
};

export const loadEngine = async (input, { cwd = process.cwd() } = {}) => {
  const modulePath = resolveEngineModulePath(input, cwd);
  const module = await import(pathToFileURL(modulePath).href);

  if(typeof module.MCTS !== 'function') {
    throw new Error(`Engine module "${modulePath}" does not export MCTS.`);
  }

  return {
    MCTS: module.MCTS,
    modulePath,
  };
};

export class DirectArenaAgent {
  constructor(MCTS, options) {
    this.engine = new MCTS(options);
    this.stats = {
      iterations: 0,
      moveMs: 0,
      moves: 0,
    };
  }

  chooseMove(state, limits) {
    const start = performance.now();
    const result = this.engine.search(state, limits);
    const elapsedMs = performance.now() - start;

    if(result.bestMove === null) {
      throw new Error('Arena search did not produce a legal move.');
    }

    this.stats.moveMs += elapsedMs;
    this.stats.moves += 1;
    this.stats.iterations += result.iterations;

    return {
      elapsedMs,
      iterations: result.iterations,
      move: result.bestMove,
    };
  }

  advance(move, nextState) {
    if(!this.engine.root) {
      return false;
    }

    if(this.engine.advanceToChild(move, nextState)) {
      return true;
    }

    this.engine.reset();
    return false;
  }

  getSummary() {
    return {
      avgIterationsPerMove: this.stats.moves > 0
        ? Number((this.stats.iterations / this.stats.moves).toFixed(3))
        : 0,
      avgMoveMs: this.stats.moves > 0
        ? Number((this.stats.moveMs / this.stats.moves).toFixed(3))
        : 0,
      iterations: this.stats.iterations,
      moveMs: Number(this.stats.moveMs.toFixed(3)),
      moves: this.stats.moves,
    };
  }
}

export const createDirectArenaAgent = (engineModule, options, seed) => new DirectArenaAgent(
  engineModule.MCTS,
  {
    explorationBias: options.explorationBias,
    finalActionStrategy: options.finalActionStrategy,
    random: createSeededRandom(seed),
    teamValueStrategy: options.teamValueStrategy,
  },
);

export const getTerminalOutcome = (state, terminalTeam) => {
  const reward = state.getReward(terminalTeam);

  if(typeof reward === 'number') {
    if(reward > 0) {
      return { draw: false, winners: [terminalTeam] };
    }

    if(reward === 0) {
      return { draw: true, winners: [] };
    }

    return { draw: false, winners: [] };
  }

  const rewardEntries = reward instanceof Map
    ? [...reward.entries()]
    : Object.entries(reward);

  let bestReward = Number.NEGATIVE_INFINITY;
  let winners = [];

  for(const [team, value] of rewardEntries) {
    if(value > bestReward) {
      bestReward = value;
      winners = [team];
    } else if(value === bestReward) {
      winners.push(team);
    }
  }

  return {
    draw: winners.length !== 1,
    winners,
  };
};

const createTotals = () => ({
  A: { avgIterationsPerMove: 0, avgMoveMs: 0, iterations: 0, moveMs: 0, moves: 0, wins: 0 },
  B: { avgIterationsPerMove: 0, avgMoveMs: 0, iterations: 0, moveMs: 0, moves: 0, wins: 0 },
  draws: 0,
  moves: 0,
});

export const playArenaGame = ({
  alternateSeats,
  createAgents,
  createInitialState,
  gameIndex,
  iterations,
}) => {
  const agents = createAgents(gameIndex);
  const agentOrder = alternateSeats && (gameIndex % 2 === 1)
    ? ['B', 'A']
    : ['A', 'B'];
  const teamToAgentKey = new Map();
  let lastTeam = null;
  let moveCount = 0;
  let state = createInitialState();

  while(!state.isTerminal()) {
    const currentTeam = state.getCurrentTeam();
    lastTeam = currentTeam;

    if(!teamToAgentKey.has(currentTeam)) {
      if(teamToAgentKey.size >= agentOrder.length) {
        throw new Error(
          `Arena currently supports exactly ${agentOrder.length} distinct teams per game; `
          + `encountered an unexpected additional team "${String(currentTeam)}".`,
        );
      }

      teamToAgentKey.set(currentTeam, agentOrder[teamToAgentKey.size]);
    }

    const agentKey = teamToAgentKey.get(currentTeam);
    if(!agentKey) {
      throw new Error(`Failed to resolve an agent for team "${String(currentTeam)}".`);
    }

    const agent = agents[agentKey];
    const result = agent.chooseMove(state, {
      maxIterations: iterations[agentKey],
    });
    const nextState = state.makeMove(result.move);

    for(const participant of Object.values(agents)) {
      participant.advance(result.move, nextState);
    }

    state = nextState;
    moveCount += 1;
  }

  const terminalOutcome = getTerminalOutcome(state, lastTeam ?? state.getCurrentTeam());
  let winner = 'draw';

  if(!terminalOutcome.draw && terminalOutcome.winners.length === 1) {
    const winnerKey = teamToAgentKey.get(terminalOutcome.winners[0]);
    winner = winnerKey ?? 'unknown';
  }

  return {
    agentSummaries: {
      A: agents.A.getSummary(),
      B: agents.B.getSummary(),
    },
    moveCount,
    seats: {
      A: agentOrder[0] === 'A' ? 'first' : 'second',
      B: agentOrder[0] === 'B' ? 'first' : 'second',
    },
    terminalOutcome,
    winner,
  };
};

export const runArena = ({
  alternateSeats,
  createAgents,
  createInitialState,
  engineMetadata,
  games,
  iterations,
  scenario,
}) => {
  const totals = createTotals();

  for(let gameIndex = 0; gameIndex < games; gameIndex += 1) {
    const game = playArenaGame({
      alternateSeats,
      createAgents,
      createInitialState,
      gameIndex,
      iterations,
    });

    totals.moves += game.moveCount;

    for(const agentKey of ['A', 'B']) {
      const agentSummary = game.agentSummaries[agentKey];
      totals[agentKey].iterations += agentSummary.iterations;
      totals[agentKey].moveMs += agentSummary.moveMs;
      totals[agentKey].moves += agentSummary.moves;
    }

    if(game.winner === 'A') {
      totals.A.wins += 1;
    } else if(game.winner === 'B') {
      totals.B.wins += 1;
    } else {
      totals.draws += 1;
    }
  }

  for(const agentKey of ['A', 'B']) {
    totals[agentKey].avgIterationsPerMove = totals[agentKey].moves > 0
      ? Number((totals[agentKey].iterations / totals[agentKey].moves).toFixed(3))
      : 0;
    totals[agentKey].avgMoveMs = totals[agentKey].moves > 0
      ? Number((totals[agentKey].moveMs / totals[agentKey].moves).toFixed(3))
      : 0;
    totals[agentKey].moveMs = Number(totals[agentKey].moveMs.toFixed(3));
  }

  return {
    config: {
      alternateSeats,
      games,
      iterationsA: iterations.A,
      iterationsB: iterations.B,
    },
    engines: engineMetadata,
    scenario: {
      label: scenario.label,
      modulePath: scenario.modulePath,
    },
    totals,
  };
};

export const printArenaSummary = (summary) => {
  console.log(`Scenario: ${summary.scenario.label}`);
  console.log(`Engine A: ${summary.engines.A.modulePath}`);
  console.log(`Engine B: ${summary.engines.B.modulePath}`);
  console.log(`Games: ${summary.config.games}`);
  console.log(`Iterations: A=${summary.config.iterationsA} B=${summary.config.iterationsB}`);
  console.log(
    `Team value strategies: A=${summary.engines.A.teamValueStrategy} `
    + `B=${summary.engines.B.teamValueStrategy}`,
  );
  console.log(`Wins: A=${summary.totals.A.wins} B=${summary.totals.B.wins} draws=${summary.totals.draws}`);
  console.log(
    `Average move time ms: A=${summary.totals.A.avgMoveMs} `
    + `B=${summary.totals.B.avgMoveMs}`,
  );
  console.log(
    `Average iterations per move: A=${summary.totals.A.avgIterationsPerMove} `
    + `B=${summary.totals.B.avgIterationsPerMove}`,
  );
  console.log(`Average plies per game: ${Number((summary.totals.moves / summary.config.games).toFixed(3))}`);
};

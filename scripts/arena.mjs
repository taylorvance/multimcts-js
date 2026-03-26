import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_SCENARIOS = {
  'connect-four-opening': './scenarios/connect-four-opening.mjs',
  'connect-four-midgame': './scenarios/connect-four-midgame.mjs',
  'othello-opening': './scenarios/othello-opening.mjs',
  'tictactoe-opening': './scenarios/tictactoe-opening.mjs',
};

const DEFAULT_OPTIONS = {
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
};

const parsePositiveInt = (value, flagName) => {
  const parsed = Number.parseInt(value, 10);
  if(!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }

  return parsed;
};

const parsePositiveNumber = (value, flagName) => {
  const parsed = Number.parseFloat(value);
  if(!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive number.`);
  }

  return parsed;
};

const parseOptions = (rawArgs) => {
  const options = { ...DEFAULT_OPTIONS };

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
        options.seed = parsePositiveInt(nextValue, '--seed');
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
};

const createSeededRandom = (seed) => {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const resolveScenarioModulePath = (options) => {
  if(options.modulePath) {
    return path.resolve(process.cwd(), options.modulePath);
  }

  const builtinPath = BUILTIN_SCENARIOS[options.scenario];
  if(!builtinPath) {
    throw new Error(`Unknown built-in scenario "${options.scenario}".`);
  }

  return path.resolve(SCRIPT_DIR, builtinPath);
};

const resolveEngineModulePath = (input) => {
  const resolvedPath = path.resolve(process.cwd(), input);

  if(resolvedPath.endsWith('.js') || resolvedPath.endsWith('.mjs')) {
    return resolvedPath;
  }

  return path.join(resolvedPath, 'dist', 'index.js');
};

const loadScenario = async (options) => {
  const modulePath = resolveScenarioModulePath(options);
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

const loadEngine = async (input) => {
  const modulePath = resolveEngineModulePath(input);
  const module = await import(pathToFileURL(modulePath).href);

  if(typeof module.MCTS !== 'function') {
    throw new Error(`Engine module "${modulePath}" does not export MCTS.`);
  }

  return {
    MCTS: module.MCTS,
    modulePath,
  };
};

const createAgent = (engine, options, suffix, seed) => new engine.MCTS({
  explorationBias: options[`explorationBias${suffix}`],
  finalActionStrategy: options[`finalActionStrategy${suffix}`],
  random: createSeededRandom(seed),
});

const getTerminalOutcome = (state, terminalTeam) => {
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

const playGame = (scenario, engineA, engineB, options, gameIndex) => {
  let state = scenario.createInitialState();
  let moveCount = 0;
  let lastTeam = null;
  const seats = options.alternateSeats && (gameIndex % 2 === 1)
    ? { A: 'second', B: 'first' }
    : { A: 'first', B: 'second' };
  const teamToSeat = new Map();
  const moveTimeMs = { A: 0, B: 0 };

  while(!state.isTerminal()) {
    const currentTeam = state.getCurrentTeam();
    lastTeam = currentTeam;

    if(!teamToSeat.has(currentTeam)) {
      if(teamToSeat.size === 0) {
        teamToSeat.set(currentTeam, 'first');
      } else if(teamToSeat.size === 1) {
        teamToSeat.set(currentTeam, 'second');
      }
    }

    const seat = teamToSeat.get(currentTeam) ?? 'first';
    const agentKey = seat === seats.A ? 'A' : 'B';
    const engine = agentKey === 'A' ? engineA : engineB;
    const iterations = agentKey === 'A' ? options.iterationsA : options.iterationsB;
    const start = performance.now();
    const result = engine.search(state, { maxIterations: iterations });
    moveTimeMs[agentKey] += performance.now() - start;

    if(result.bestMove === null) {
      throw new Error('Arena search did not produce a legal move.');
    }

    state = state.makeMove(result.bestMove);
    moveCount += 1;
  }

  const terminalOutcome = getTerminalOutcome(state, lastTeam ?? state.getCurrentTeam());

  let winner = 'draw';
  if(!terminalOutcome.draw && terminalOutcome.winners.length === 1) {
    const winningSeat = teamToSeat.get(terminalOutcome.winners[0]);
    winner = winningSeat === seats.A ? 'A' : winningSeat === seats.B ? 'B' : 'unknown';
  }

  return {
    moveCount,
    moveTimeMs,
    seats,
    terminalOutcome,
    winner,
  };
};

const main = async () => {
  const rawOptions = parseOptions(process.argv.slice(2));
  const scenario = await loadScenario(rawOptions);
  const [engineA, engineB] = await Promise.all([
    loadEngine(rawOptions.engineA),
    loadEngine(rawOptions.engineB),
  ]);

  const options = {
    ...rawOptions,
    games: rawOptions.games ?? scenario.defaultGames,
    iterationsA: rawOptions.iterationsA ?? scenario.defaultIterations,
    iterationsB: rawOptions.iterationsB ?? scenario.defaultIterations,
  };

  const totals = {
    A: { avgMoveMs: 0, moveMs: 0, wins: 0 },
    B: { avgMoveMs: 0, moveMs: 0, wins: 0 },
    draws: 0,
    moves: 0,
  };

  for(let gameIndex = 0; gameIndex < options.games; gameIndex += 1) {
    const agentA = createAgent(engineA, options, 'A', options.seed + (gameIndex * 2));
    const agentB = createAgent(engineB, options, 'B', options.seed + (gameIndex * 2) + 1);
    const game = playGame(scenario, agentA, agentB, options, gameIndex);

    totals.moves += game.moveCount;
    totals.A.moveMs += game.moveTimeMs.A;
    totals.B.moveMs += game.moveTimeMs.B;

    if(game.winner === 'A') {
      totals.A.wins += 1;
    } else if(game.winner === 'B') {
      totals.B.wins += 1;
    } else {
      totals.draws += 1;
    }
  }

  totals.A.avgMoveMs = Number((totals.A.moveMs / Math.max(totals.moves / 2, 1)).toFixed(3));
  totals.B.avgMoveMs = Number((totals.B.moveMs / Math.max(totals.moves / 2, 1)).toFixed(3));

  const summary = {
    config: {
      alternateSeats: options.alternateSeats,
      games: options.games,
      iterationsA: options.iterationsA,
      iterationsB: options.iterationsB,
    },
    engines: {
      A: {
        explorationBias: options.explorationBiasA,
        finalActionStrategy: options.finalActionStrategyA,
        modulePath: engineA.modulePath,
      },
      B: {
        explorationBias: options.explorationBiasB,
        finalActionStrategy: options.finalActionStrategyB,
        modulePath: engineB.modulePath,
      },
    },
    scenario: {
      label: scenario.label,
      modulePath: scenario.modulePath,
    },
    totals,
  };

  if(options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`Scenario: ${summary.scenario.label}`);
  console.log(`Engine A: ${summary.engines.A.modulePath}`);
  console.log(`Engine B: ${summary.engines.B.modulePath}`);
  console.log(`Games: ${summary.config.games}`);
  console.log(`Iterations: A=${summary.config.iterationsA} B=${summary.config.iterationsB}`);
  console.log(`Wins: A=${totals.A.wins} B=${totals.B.wins} draws=${totals.draws}`);
  console.log(`Average move time ms: A=${totals.A.avgMoveMs} B=${totals.B.avgMoveMs}`);
  console.log(`Average plies per game: ${Number((totals.moves / summary.config.games).toFixed(3))}`);
};

await main();

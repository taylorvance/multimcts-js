import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  createDirectArenaAgent,
  loadEngine,
  loadScenario,
  parseArenaOptions,
  printArenaSummary,
  runArena,
} from './lib/arena-core.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const main = async () => {
  const rawOptions = parseArenaOptions(process.argv.slice(2));
  const scenario = await loadScenario(rawOptions, { scriptDir: SCRIPT_DIR });
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

  const summary = runArena({
    alternateSeats: options.alternateSeats,
    createAgents: (gameIndex) => ({
      A: createDirectArenaAgent(engineA, {
        explorationBias: options.explorationBiasA,
        finalActionStrategy: options.finalActionStrategyA,
        teamValueStrategy: options.teamValueStrategyA,
      }, options.seed + (gameIndex * 2)),
      B: createDirectArenaAgent(engineB, {
        explorationBias: options.explorationBiasB,
        finalActionStrategy: options.finalActionStrategyB,
        teamValueStrategy: options.teamValueStrategyB,
      }, options.seed + (gameIndex * 2) + 1),
    }),
    createInitialState: scenario.createInitialState,
    engineMetadata: {
      A: {
        explorationBias: options.explorationBiasA,
        finalActionStrategy: options.finalActionStrategyA,
        modulePath: engineA.modulePath,
        teamValueStrategy: options.teamValueStrategyA,
      },
      B: {
        explorationBias: options.explorationBiasB,
        finalActionStrategy: options.finalActionStrategyB,
        modulePath: engineB.modulePath,
        teamValueStrategy: options.teamValueStrategyB,
      },
    },
    games: options.games,
    iterations: {
      A: options.iterationsA,
      B: options.iterationsB,
    },
    scenario,
  });

  if(options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printArenaSummary(summary);
};

await main();

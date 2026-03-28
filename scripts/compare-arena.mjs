import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  createDirectArenaAgent,
  loadEngine,
  loadScenario,
  parseArenaOptions,
  printArenaSummary,
  runArena,
} from './lib/arena-core.mjs';
import {
  WORKTREE_REF,
  addWorktree,
  buildCheckout,
  createTempCompareRoot,
  printDependencyWarning,
  removeTempCompareRoot,
  removeWorktree,
} from './lib/compare-worktrees.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const BOOLEAN_FLAGS = new Set(['--json', '--no-alternate-seats']);

const parseCompareArenaArgs = (rawArgs) => {
  const refs = [];
  const arenaArgs = [];

  for(let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if(!arg.startsWith('--')) {
      refs.push(arg);
      continue;
    }

    arenaArgs.push(arg);

    if(BOOLEAN_FLAGS.has(arg)) {
      continue;
    }

    const nextValue = rawArgs[index + 1];
    if(nextValue === undefined) {
      throw new Error(`Missing value for ${arg}`);
    }

    arenaArgs.push(nextValue);
    index += 1;
  }

  return {
    arenaOptions: parseArenaOptions(arenaArgs),
    baselineRef: refs[0] ?? 'origin/main',
    candidateRef: refs[1] ?? WORKTREE_REF,
  };
};

const main = async () => {
  const { arenaOptions: rawOptions, baselineRef, candidateRef } = parseCompareArenaArgs(
    process.argv.slice(2),
  );
  const scenario = await loadScenario(rawOptions, { scriptDir: SCRIPT_DIR });
  const options = {
    ...rawOptions,
    games: rawOptions.games ?? scenario.defaultGames,
    iterationsA: rawOptions.iterationsA ?? scenario.defaultIterations,
    iterationsB: rawOptions.iterationsB ?? scenario.defaultIterations,
  };
  const tempRoot = createTempCompareRoot('multimcts-arena-');
  const baselineDir = path.join(tempRoot, 'baseline');
  const candidateDir = path.join(tempRoot, 'candidate');
  const baselinePath = baselineRef === WORKTREE_REF ? REPO_ROOT : baselineDir;
  const candidatePath = candidateRef === WORKTREE_REF ? REPO_ROOT : candidateDir;

  try {
    if(baselineRef !== WORKTREE_REF) {
      addWorktree(REPO_ROOT, baselineDir, baselineRef);
    }

    if(candidateRef !== WORKTREE_REF) {
      addWorktree(REPO_ROOT, candidateDir, candidateRef);
    }

    printDependencyWarning(REPO_ROOT, baselineRef, candidateRef);
    buildCheckout(baselinePath);
    if(candidatePath !== baselinePath) {
      buildCheckout(candidatePath);
    }

    const [engineA, engineB] = await Promise.all([
      loadEngine(baselinePath),
      loadEngine(candidatePath),
    ]);

    const summary = runArena({
      alternateSeats: options.alternateSeats,
      createAgents: (gameIndex) => ({
        A: createDirectArenaAgent(engineA, {
          explorationConstant: options.explorationConstantA,
          finalActionStrategy: options.finalActionStrategyA,
          teamValueStrategy: options.teamValueStrategyA,
        }, options.seed + (gameIndex * 2)),
        B: createDirectArenaAgent(engineB, {
          explorationConstant: options.explorationConstantB,
          finalActionStrategy: options.finalActionStrategyB,
          teamValueStrategy: options.teamValueStrategyB,
        }, options.seed + (gameIndex * 2) + 1),
      }),
      createInitialState: scenario.createInitialState,
      engineMetadata: {
        A: {
          explorationConstant: options.explorationConstantA,
          finalActionStrategy: options.finalActionStrategyA,
          modulePath: engineA.modulePath,
          ref: baselineRef,
          teamValueStrategy: options.teamValueStrategyA,
        },
        B: {
          explorationConstant: options.explorationConstantB,
          finalActionStrategy: options.finalActionStrategyB,
          modulePath: engineB.modulePath,
          ref: candidateRef,
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

    console.log(`Comparing ${candidateRef} against ${baselineRef}`);
    console.log('');
    printArenaSummary(summary);
  } finally {
    if(baselineRef !== WORKTREE_REF) {
      removeWorktree(REPO_ROOT, baselineDir);
    }

    if(candidateRef !== WORKTREE_REF) {
      removeWorktree(REPO_ROOT, candidateDir);
    }

    removeTempCompareRoot(tempRoot);
  }
};

await main();

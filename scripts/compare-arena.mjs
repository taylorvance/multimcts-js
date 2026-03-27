import {
  existsSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import {
  createDirectArenaAgent,
  loadEngine,
  loadScenario,
  parseArenaOptions,
  printArenaSummary,
  runArena,
} from './lib/arena-core.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const WORKTREE_REF = 'WORKTREE';
const BOOLEAN_FLAGS = new Set(['--json', '--no-alternate-seats']);

const run = (command, args, cwd = REPO_ROOT) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if(result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        result.stderr.trim(),
        result.stdout.trim(),
      ].filter(Boolean).join('\n'),
    );
  }

  return result.stdout.trim();
};

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

const ensureNodeModulesLink = (checkoutDir) => {
  const repoNodeModules = path.join(REPO_ROOT, 'node_modules');
  const checkoutNodeModules = path.join(checkoutDir, 'node_modules');

  if(!existsSync(repoNodeModules)) {
    throw new Error('Missing node_modules in the current checkout. Run npm install first.');
  }

  if(!existsSync(checkoutNodeModules)) {
    symlinkSync(repoNodeModules, checkoutNodeModules, 'dir');
  }
};

const addWorktree = (dir, ref) => {
  run('git', ['worktree', 'add', '--detach', dir, ref]);
  ensureNodeModulesLink(dir);
};

const removeWorktree = (dir) => {
  spawnSync('git', ['worktree', 'remove', '--force', dir], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  rmSync(dir, { force: true, recursive: true });
};

const buildCheckout = (checkoutDir) => {
  run('npm', ['run', 'build'], checkoutDir);
};

const printDependencyWarning = (baselineRef, candidateRef) => {
  if(baselineRef === WORKTREE_REF || candidateRef === WORKTREE_REF) {
    return;
  }

  const diff = spawnSync(
    'git',
    ['diff', '--name-only', baselineRef, candidateRef, '--', 'package.json', 'package-lock.json'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );

  if(diff.status === 0 && diff.stdout.trim()) {
    console.log(
      'Warning: dependency manifests differ between refs. '
      + 'This comparison reuses the current checkout\'s node_modules for both refs.',
    );
    console.log('');
  }
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
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'multimcts-arena-'));
  const baselineDir = path.join(tempRoot, 'baseline');
  const candidateDir = path.join(tempRoot, 'candidate');
  const baselinePath = baselineRef === WORKTREE_REF ? REPO_ROOT : baselineDir;
  const candidatePath = candidateRef === WORKTREE_REF ? REPO_ROOT : candidateDir;

  try {
    if(baselineRef !== WORKTREE_REF) {
      addWorktree(baselineDir, baselineRef);
    }

    if(candidateRef !== WORKTREE_REF) {
      addWorktree(candidateDir, candidateRef);
    }

    printDependencyWarning(baselineRef, candidateRef);
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
          ref: baselineRef,
          teamValueStrategy: options.teamValueStrategyA,
        },
        B: {
          explorationBias: options.explorationBiasB,
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
      removeWorktree(baselineDir);
    }

    if(candidateRef !== WORKTREE_REF) {
      removeWorktree(candidateDir);
    }

    rmSync(tempRoot, { force: true, recursive: true });
  }
};

await main();

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  WORKTREE_REF,
  addWorktree,
  buildCheckout,
  createTempCompareRoot,
  printDependencyWarning,
  removeTempCompareRoot,
  removeWorktree,
  runCommand,
} from './lib/compare-worktrees.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const DEFAULT_OPTIONS = {
  arenaGames: undefined,
  arenaIterations: undefined,
  json: false,
  profileSamples: 6,
  profileWarmup: 1,
  quick: false,
  seed: 0x51ced,
};

const PROFILE_SCENARIOS = [
  { iterations: 2000, scenario: 'tictactoe-midgame' },
  { iterations: 2000, scenario: 'connect-four-midgame' },
  { iterations: 1200, scenario: 'hex-opening' },
  { iterations: 1200, scenario: 'othello-opening' },
  { iterations: 1200, scenario: 'breakthrough-midgame' },
  { iterations: 1200, scenario: 'isolation-midgame' },
];

const ARENA_SCENARIOS = [
  { games: 12, iterations: 600, scenario: 'tictactoe-opening' },
  { games: 8, iterations: 800, scenario: 'connect-four-opening' },
  { games: 8, iterations: 800, scenario: 'hex-opening' },
  { games: 8, iterations: 800, scenario: 'othello-opening' },
  { games: 8, iterations: 800, scenario: 'breakthrough-opening' },
  { games: 8, iterations: 600, scenario: 'isolation-opening' },
];

const parsePositiveInt = (value, flagName) => {
  const parsed = Number.parseInt(value, 10);
  if(!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }

  return parsed;
};

const parseNonNegativeInt = (value, flagName) => {
  const parsed = Number.parseInt(value, 10);
  if(!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative integer.`);
  }

  return parsed;
};

export const parseCompareBenchmarkOptions = (rawArgs) => {
  const options = { ...DEFAULT_OPTIONS };
  const refs = [];

  for(let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if(arg === '--json') {
      options.json = true;
      continue;
    }

    if(arg === '--quick') {
      options.quick = true;
      continue;
    }

    if(!arg.startsWith('--')) {
      refs.push(arg);
      continue;
    }

    const nextValue = rawArgs[index + 1];
    if(nextValue === undefined) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch(arg) {
      case '--arena-games':
        options.arenaGames = parsePositiveInt(nextValue, '--arena-games');
        index += 1;
        break;
      case '--arena-iterations':
        options.arenaIterations = parsePositiveInt(nextValue, '--arena-iterations');
        index += 1;
        break;
      case '--profile-samples':
        options.profileSamples = parsePositiveInt(nextValue, '--profile-samples');
        index += 1;
        break;
      case '--profile-warmup':
        options.profileWarmup = parseNonNegativeInt(nextValue, '--profile-warmup');
        index += 1;
        break;
      case '--seed':
        options.seed = parseNonNegativeInt(nextValue, '--seed');
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    baselineRef: refs[0] ?? '55e09df',
    candidateRef: refs[1] ?? WORKTREE_REF,
    options,
  };
};

const resolveQuickOptions = (options) => ({
  ...options,
  arenaGames: options.arenaGames ?? 4,
  arenaIterations: options.arenaIterations ?? 200,
  profileSamples: 2,
  profileWarmup: 1,
});

const runJsonCommand = (command, args, cwd = REPO_ROOT) => {
  const output = runCommand(command, args, cwd);

  try {
    return JSON.parse(output);
  } catch(error) {
    throw new Error(`Failed to parse JSON from ${command} ${args.join(' ')}: ${error.message}`);
  }
};

const formatDeltaPct = (baselineValue, candidateValue) => {
  if(baselineValue === 0) {
    return 0;
  }

  return Number((((candidateValue - baselineValue) / baselineValue) * 100).toFixed(2));
};

const summarizeArenaScore = (totals, games) => Number(
  (((totals.B.wins + (totals.draws * 0.5)) / games) * 100).toFixed(2),
);

const runProfileScenario = ({
  baselinePath,
  candidatePath,
  profileSamples,
  profileWarmup,
  scenario,
  seed,
}) => {
  const commonArgs = [
    '--experimental-strip-types',
    'scripts/profile-search.mjs',
    '--scenario', scenario.scenario,
    '--iterations', String(scenario.iterations),
    '--samples', String(profileSamples),
    '--warmup', String(profileWarmup),
    '--json',
  ];

  const baseline = runJsonCommand('node', [
    ...commonArgs,
    '--engine', baselinePath,
    '--seed', String(seed),
  ]);
  const candidate = runJsonCommand('node', [
    ...commonArgs,
    '--engine', candidatePath,
    '--seed', String(seed),
  ]);

  return {
    baseline: {
      roundsPerSecond: baseline.timing.roundsPerSecond,
    },
    candidate: {
      roundsPerSecond: candidate.timing.roundsPerSecond,
    },
    deltaPct: formatDeltaPct(
      baseline.timing.roundsPerSecond,
      candidate.timing.roundsPerSecond,
    ),
    iterations: scenario.iterations,
    samples: profileSamples,
    scenario: scenario.scenario,
    warmup: profileWarmup,
  };
};

const runArenaScenario = ({
  arenaGames,
  arenaIterations,
  baselinePath,
  candidatePath,
  scenario,
  seed,
}) => {
  const games = arenaGames ?? scenario.games;
  const iterations = arenaIterations ?? scenario.iterations;
  const summary = runJsonCommand('node', [
    '--experimental-strip-types',
    'scripts/arena.mjs',
    '--engine-a', baselinePath,
    '--engine-b', candidatePath,
    '--scenario', scenario.scenario,
    '--games', String(games),
    '--iterations-a', String(iterations),
    '--iterations-b', String(iterations),
    '--seed', String(seed),
    '--json',
  ]);

  return {
    candidateScorePct: summarizeArenaScore(summary.totals, games),
    draws: summary.totals.draws,
    games,
    iterations,
    scenario: scenario.scenario,
    wins: {
      baseline: summary.totals.A.wins,
      candidate: summary.totals.B.wins,
    },
  };
};

const formatSuiteSummary = (summary) => {
  const lines = [
    `Comparing ${summary.refs.candidate} against ${summary.refs.baseline}`,
    '',
    'Profile throughput:',
  ];

  for(const profile of summary.profile) {
    lines.push(
      `- ${profile.scenario}: baseline=${profile.baseline.roundsPerSecond} `
      + `candidate=${profile.candidate.roundsPerSecond} deltaPct=${profile.deltaPct}`,
    );
  }

  lines.push('', 'Arena results:');

  for(const arena of summary.arena) {
    lines.push(
      `- ${arena.scenario}: baselineWins=${arena.wins.baseline} `
      + `candidateWins=${arena.wins.candidate} draws=${arena.draws} `
      + `candidateScorePct=${arena.candidateScorePct}`,
    );
  }

  return lines.join('\n');
};

const main = async () => {
  const parsed = parseCompareBenchmarkOptions(process.argv.slice(2));
  const options = parsed.options.quick
    ? resolveQuickOptions(parsed.options)
    : parsed.options;
  const tempRoot = createTempCompareRoot('multimcts-benchmark-');
  const baselineDir = path.join(tempRoot, 'baseline');
  const candidateDir = path.join(tempRoot, 'candidate');
  const baselinePath = parsed.baselineRef === WORKTREE_REF ? REPO_ROOT : baselineDir;
  const candidatePath = parsed.candidateRef === WORKTREE_REF ? REPO_ROOT : candidateDir;

  try {
    if(parsed.baselineRef !== WORKTREE_REF) {
      addWorktree(REPO_ROOT, baselineDir, parsed.baselineRef);
    }

    if(parsed.candidateRef !== WORKTREE_REF) {
      addWorktree(REPO_ROOT, candidateDir, parsed.candidateRef);
    }

    printDependencyWarning(REPO_ROOT, parsed.baselineRef, parsed.candidateRef);
    buildCheckout(baselinePath);
    if(candidatePath !== baselinePath) {
      buildCheckout(candidatePath);
    }

    const profile = PROFILE_SCENARIOS.map((scenario, index) => runProfileScenario({
      baselinePath,
      candidatePath,
      profileSamples: options.profileSamples,
      profileWarmup: options.profileWarmup,
      scenario,
      seed: options.seed + (index * 2),
    }));
    const arena = ARENA_SCENARIOS.map((scenario, index) => runArenaScenario({
      arenaGames: options.arenaGames,
      arenaIterations: options.arenaIterations,
      baselinePath,
      candidatePath,
      scenario,
      seed: options.seed + 1000 + (index * 2),
    }));

    const summary = {
      arena,
      config: options,
      profile,
      refs: {
        baseline: parsed.baselineRef,
        candidate: parsed.candidateRef,
      },
    };

    if(options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log(formatSuiteSummary(summary));
  } finally {
    if(parsed.baselineRef !== WORKTREE_REF) {
      removeWorktree(REPO_ROOT, baselineDir);
    }

    if(parsed.candidateRef !== WORKTREE_REF) {
      removeWorktree(REPO_ROOT, candidateDir);
    }

    removeTempCompareRoot(tempRoot);
  }
};

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

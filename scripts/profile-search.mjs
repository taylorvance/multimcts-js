import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import { MCTS } from '../dist/index.js';

const DEFAULT_OPTIONS = {
  diagnostics: false,
  explorationBias: Math.SQRT2,
  finalActionStrategy: 'robustChild',
  instrumentEngine: false,
  instrumentState: false,
  iterations: undefined,
  json: false,
  modulePath: null,
  samples: undefined,
  scenario: 'tictactoe-midgame',
  seed: 0xc0ffee,
  teamValueStrategy: 'margin',
  warmup: undefined,
};

const BUILTIN_SCENARIOS = {
  'connect-four-midgame': './scenarios/connect-four-midgame.mjs',
  'connect-four-opening': './scenarios/connect-four-opening.mjs',
  'hex-midgame': './scenarios/hex-midgame.mjs',
  'hex-opening': './scenarios/hex-opening.mjs',
  'othello-opening': './scenarios/othello-opening.mjs',
  'tictactoe-midgame': './scenarios/tictactoe-midgame.mjs',
};
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

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

    if(arg === '--instrument-state') {
      options.instrumentState = true;
      continue;
    }

    if(arg === '--instrument-engine') {
      options.instrumentEngine = true;
      continue;
    }

    if(arg === '--diagnostics') {
      options.diagnostics = true;
      continue;
    }

    if(arg === '--json') {
      options.json = true;
      continue;
    }

    const nextValue = rawArgs[index + 1];
    if(nextValue === undefined) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch(arg) {
      case '--exploration-bias':
        options.explorationBias = parsePositiveNumber(nextValue, '--exploration-bias');
        index += 1;
        break;
      case '--final-action-strategy':
        options.finalActionStrategy = nextValue;
        index += 1;
        break;
      case '--iterations':
        options.iterations = parsePositiveInt(nextValue, '--iterations');
        index += 1;
        break;
      case '--module':
        options.modulePath = nextValue;
        index += 1;
        break;
      case '--samples':
        options.samples = parsePositiveInt(nextValue, '--samples');
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
      case '--team-value-strategy':
        options.teamValueStrategy = nextValue;
        index += 1;
        break;
      case '--warmup':
        options.warmup = parseNonNegativeInt(nextValue, '--warmup');
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

const loadScenario = async (options) => {
  const modulePath = resolveScenarioModulePath(options);
  const scenarioModule = await import(pathToFileURL(modulePath).href);

  if(typeof scenarioModule.createState !== 'function') {
    throw new Error(`Scenario module "${modulePath}" must export createState().`);
  }

  return {
    createState: scenarioModule.createState,
    defaultIterations: scenarioModule.defaultIterations ?? 2000,
    defaultSamples: scenarioModule.defaultSamples ?? 8,
    defaultWarmup: scenarioModule.defaultWarmup ?? 2,
    label: scenarioModule.label ?? path.basename(modulePath),
    modulePath,
  };
};

const createMethodStats = () => ({
  getCurrentTeam: { calls: 0, totalMs: 0 },
  getLegalMoves: { calls: 0, totalMs: 0 },
  getReward: { calls: 0, totalMs: 0 },
  isTerminal: { calls: 0, totalMs: 0 },
  makeMove: { calls: 0, totalMs: 0 },
  sampleLegalMove: { calls: 0, totalMs: 0 },
  suggestRollout: { calls: 0, totalMs: 0 },
  toString: { calls: 0, totalMs: 0 },
});

const createEngineMethodStats = () => ({
  backpropagate: { calls: 0, totalMs: 0 },
  executeRound: { calls: 0, totalMs: 0 },
  expand: { calls: 0, totalMs: 0 },
  getBestChild: { calls: 0, totalMs: 0 },
  search: { calls: 0, totalMs: 0 },
  select: { calls: 0, totalMs: 0 },
  simulate: { calls: 0, totalMs: 0 },
});

const instrumentObjectMethods = (target, methodStats) => {
  const restoreCallbacks = [];

  for(const methodName of Object.keys(methodStats)) {
    const originalMethod = target[methodName];
    if(typeof originalMethod !== 'function') {
      continue;
    }

    target[methodName] = function instrumentedMethod(...args) {
      const start = performance.now();
      try {
        return originalMethod.apply(this, args);
      } finally {
        methodStats[methodName].calls += 1;
        methodStats[methodName].totalMs += performance.now() - start;
      }
    };

    restoreCallbacks.push(() => {
      target[methodName] = originalMethod;
    });
  }

  return {
    restore() {
      for(const restoreCallback of restoreCallbacks) {
        restoreCallback();
      }
    },
  };
};

const instrumentStatePrototype = (state) => {
  const prototype = Object.getPrototypeOf(state);
  const methodStats = createMethodStats();
  const instrumentation = instrumentObjectMethods(prototype, methodStats);

  return {
    methodStats,
    restore() {
      instrumentation.restore();
    },
  };
};

const getMemorySnapshot = () => {
  const usage = process.memoryUsage();

  return {
    arrayBuffers: usage.arrayBuffers,
    external: usage.external,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    rss: usage.rss,
  };
};

const bytesToMb = (value) => Number((value / (1024 * 1024)).toFixed(3));

const sampleSearch = (scenario, options, sampleIndex, engineMethodStats = null) => {
  const state = scenario.createState();
  const random = createSeededRandom(options.seed + sampleIndex);
  const mcts = new MCTS({
    explorationBias: options.explorationBias,
    finalActionStrategy: options.finalActionStrategy,
    random,
    teamValueStrategy: options.teamValueStrategy,
  });
  const engineInstrumentation = options.instrumentEngine && engineMethodStats
    ? instrumentObjectMethods(mcts, engineMethodStats)
    : null;

  let result;
  let elapsedMs;

  try {
    const startWall = performance.now();
    result = options.diagnostics
      ? mcts.searchWithDiagnostics(state, { maxIterations: options.iterations })
      : mcts.search(state, { maxIterations: options.iterations });
    elapsedMs = performance.now() - startWall;
  } finally {
    engineInstrumentation?.restore();
  }

  return {
    elapsedMs,
    result,
  };
};

const summarizeMethodStats = (methodStats, totalWallMs) => Object.entries(methodStats)
  .map(([name, stat]) => ({
    averageUs: stat.calls > 0 ? Number(((stat.totalMs * 1000) / stat.calls).toFixed(3)) : 0,
    calls: stat.calls,
    name,
    sharePct: totalWallMs > 0 ? Number(((stat.totalMs / totalWallMs) * 100).toFixed(3)) : 0,
    totalMs: Number(stat.totalMs.toFixed(3)),
  }))
  .sort((left, right) => right.totalMs - left.totalMs);

const summarizeDiagnostics = (samples) => {
  if(samples.length === 0 || !samples.every((sample) => sample?.result.diagnostics)) {
    return null;
  }

  let createdNodes = 0;
  let expandedNodes = 0;
  let retainedNodeCount = 0;
  let rolloutDepthTotal = 0;
  let rolloutSimulationCount = 0;
  let selectDepthTotal = 0;
  let terminalSimulationCount = 0;
  let rootReusedCount = 0;
  let maxRolloutDepth = 0;
  let maxSelectDepth = 0;
  let maxTreeMaxDepth = 0;
  let totalTreeMaxDepth = 0;

  for(const sample of samples) {
    const diagnostics = sample.result.diagnostics;
    createdNodes += diagnostics.createdNodes;
    expandedNodes += diagnostics.expandedNodes;
    retainedNodeCount += diagnostics.retainedNodeCount;
    rolloutDepthTotal += diagnostics.rolloutDepthTotal;
    rolloutSimulationCount += diagnostics.rolloutSimulationCount;
    selectDepthTotal += diagnostics.selectDepthTotal;
    terminalSimulationCount += diagnostics.terminalSimulationCount;
    rootReusedCount += diagnostics.rootReused ? 1 : 0;
    maxRolloutDepth = Math.max(maxRolloutDepth, diagnostics.maxRolloutDepth);
    maxSelectDepth = Math.max(maxSelectDepth, diagnostics.maxSelectDepth);
    maxTreeMaxDepth = Math.max(maxTreeMaxDepth, diagnostics.treeMaxDepth);
    totalTreeMaxDepth += diagnostics.treeMaxDepth;
  }

  const sampleCount = samples.length;
  const totalIterations = samples.reduce((sum, sample) => sum + sample.result.iterations, 0);

  return {
    averageCreatedNodes: Number((createdNodes / sampleCount).toFixed(3)),
    averageExpandedNodes: Number((expandedNodes / sampleCount).toFixed(3)),
    averageRetainedNodes: Number((retainedNodeCount / sampleCount).toFixed(3)),
    averageRolloutDepth: rolloutSimulationCount > 0
      ? Number((rolloutDepthTotal / rolloutSimulationCount).toFixed(3))
      : 0,
    averageSelectDepth: totalIterations > 0
      ? Number((selectDepthTotal / totalIterations).toFixed(3))
      : 0,
    averageTreeMaxDepth: Number((totalTreeMaxDepth / sampleCount).toFixed(3)),
    maxRolloutDepth,
    maxSelectDepth,
    maxTreeMaxDepth,
    rootReuseRate: Number((rootReusedCount / sampleCount).toFixed(3)),
    terminalSimulationRate: totalIterations > 0
      ? Number((terminalSimulationCount / totalIterations).toFixed(3))
      : 0,
  };
};

const formatResult = (summary) => {
  const lines = [
    `Scenario: ${summary.scenario.label}`,
    `Module: ${summary.scenario.modulePath}`,
    `Iterations/sample: ${summary.config.iterations}`,
    `Samples: ${summary.config.samples}`,
    `Warmup: ${summary.config.warmup}`,
    `Exploration bias: ${summary.config.explorationBias}`,
    `Team value strategy: ${summary.config.teamValueStrategy}`,
    `Wall ms: avg=${summary.timing.averageMs} min=${summary.timing.minMs} max=${summary.timing.maxMs} total=${summary.timing.totalMs}`,
    `Rounds/sec: ${summary.timing.roundsPerSecond}`,
    `CPU ms: user=${summary.cpu.userMs} system=${summary.cpu.systemMs} total=${summary.cpu.totalMs}`,
    `Memory MB: rss start=${summary.memory.start.rss} end=${summary.memory.end.rss} peak=${summary.memory.peak.rss} | heapUsed start=${summary.memory.start.heapUsed} end=${summary.memory.end.heapUsed} peak=${summary.memory.peak.heapUsed}`,
    `Final action strategy: ${summary.finalActionStrategy}`,
    `Last sample best move: ${String(summary.lastSample.bestMove)}`,
  ];

  if(summary.diagnostics) {
    lines.push(
      `Tree diagnostics: avgCreatedNodes=${summary.diagnostics.averageCreatedNodes} avgExpandedNodes=${summary.diagnostics.averageExpandedNodes} avgRetainedNodes=${summary.diagnostics.averageRetainedNodes} avgSelectDepth=${summary.diagnostics.averageSelectDepth} avgRolloutDepth=${summary.diagnostics.averageRolloutDepth} avgTreeMaxDepth=${summary.diagnostics.averageTreeMaxDepth} maxTreeMaxDepth=${summary.diagnostics.maxTreeMaxDepth} maxSelectDepth=${summary.diagnostics.maxSelectDepth} maxRolloutDepth=${summary.diagnostics.maxRolloutDepth} rootReuseRate=${summary.diagnostics.rootReuseRate} terminalSimulationRate=${summary.diagnostics.terminalSimulationRate}`,
    );
  }

  if(summary.methodStats.length > 0) {
    lines.push('Top state methods:');
    for(const stat of summary.methodStats) {
      lines.push(`  ${stat.name}: calls=${stat.calls} totalMs=${stat.totalMs} avgUs=${stat.averageUs} sharePct=${stat.sharePct}`);
    }
  }

  if(summary.engineMethodStats.length > 0) {
    lines.push('Top engine methods (inclusive):');
    for(const stat of summary.engineMethodStats) {
      lines.push(`  ${stat.name}: calls=${stat.calls} totalMs=${stat.totalMs} avgUs=${stat.averageUs} sharePct=${stat.sharePct}`);
    }
  }

  return lines.join('\n');
};

const formatProfileRerunTarget = (options) => (
  options.modulePath
    ? `--module ${JSON.stringify(options.modulePath)}`
    : `--scenario ${options.scenario}`
);

const main = async () => {
  const rawOptions = parseOptions(process.argv.slice(2));
  const scenario = await loadScenario(rawOptions);
  const options = {
    ...rawOptions,
    iterations: rawOptions.iterations ?? scenario.defaultIterations,
    samples: rawOptions.samples ?? scenario.defaultSamples,
    warmup: rawOptions.warmup ?? scenario.defaultWarmup,
  };

  for(let warmupIndex = 0; warmupIndex < options.warmup; warmupIndex += 1) {
    sampleSearch(scenario, options, warmupIndex);
  }

  const sampleState = scenario.createState();
  const instrumentation = options.instrumentState
    ? instrumentStatePrototype(sampleState)
    : null;
  const engineMethodStats = options.instrumentEngine
    ? createEngineMethodStats()
    : null;

  const startMemory = getMemorySnapshot();
  const cpuStart = process.cpuUsage();
  const elapsedSamplesMs = [];
  const completedSamples = [];
  let peakMemory = { ...startMemory };
  let lastSample = null;

  try {
    for(let sampleIndex = 0; sampleIndex < options.samples; sampleIndex += 1) {
      const sample = sampleSearch(
        scenario,
        options,
        sampleIndex + options.warmup,
        engineMethodStats,
      );
      elapsedSamplesMs.push(sample.elapsedMs);
      completedSamples.push(sample);
      lastSample = sample;

      const memory = getMemorySnapshot();
      peakMemory = {
        arrayBuffers: Math.max(peakMemory.arrayBuffers, memory.arrayBuffers),
        external: Math.max(peakMemory.external, memory.external),
        heapTotal: Math.max(peakMemory.heapTotal, memory.heapTotal),
        heapUsed: Math.max(peakMemory.heapUsed, memory.heapUsed),
        rss: Math.max(peakMemory.rss, memory.rss),
      };
    }
  } finally {
    instrumentation?.restore();
  }

  const endMemory = getMemorySnapshot();
  const cpuUsage = process.cpuUsage(cpuStart);
  const totalMs = elapsedSamplesMs.reduce((sum, elapsedMs) => sum + elapsedMs, 0);
  const averageMs = totalMs / elapsedSamplesMs.length;
  const diagnostics = summarizeDiagnostics(completedSamples);

  const summary = {
    config: {
      diagnostics: options.diagnostics,
      explorationBias: options.explorationBias,
      finalActionStrategy: options.finalActionStrategy,
      instrumentEngine: options.instrumentEngine,
      iterations: options.iterations,
      samples: options.samples,
      teamValueStrategy: options.teamValueStrategy,
      warmup: options.warmup,
    },
    cpu: {
      systemMs: Number((cpuUsage.system / 1000).toFixed(3)),
      totalMs: Number(((cpuUsage.user + cpuUsage.system) / 1000).toFixed(3)),
      userMs: Number((cpuUsage.user / 1000).toFixed(3)),
    },
    finalActionStrategy: options.finalActionStrategy,
    diagnostics,
    lastSample: {
      bestMove: lastSample?.result.bestMove ?? null,
      iterations: lastSample?.result.iterations ?? 0,
    },
    memory: {
      end: {
        arrayBuffers: bytesToMb(endMemory.arrayBuffers),
        external: bytesToMb(endMemory.external),
        heapTotal: bytesToMb(endMemory.heapTotal),
        heapUsed: bytesToMb(endMemory.heapUsed),
        rss: bytesToMb(endMemory.rss),
      },
      peak: {
        arrayBuffers: bytesToMb(peakMemory.arrayBuffers),
        external: bytesToMb(peakMemory.external),
        heapTotal: bytesToMb(peakMemory.heapTotal),
        heapUsed: bytesToMb(peakMemory.heapUsed),
        rss: bytesToMb(peakMemory.rss),
      },
      start: {
        arrayBuffers: bytesToMb(startMemory.arrayBuffers),
        external: bytesToMb(startMemory.external),
        heapTotal: bytesToMb(startMemory.heapTotal),
        heapUsed: bytesToMb(startMemory.heapUsed),
        rss: bytesToMb(startMemory.rss),
      },
    },
    methodStats: instrumentation
      ? summarizeMethodStats(instrumentation.methodStats, totalMs)
      : [],
    engineMethodStats: engineMethodStats
      ? summarizeMethodStats(engineMethodStats, totalMs)
      : [],
    scenario: {
      label: scenario.label,
      modulePath: scenario.modulePath,
    },
    timing: {
      averageMs: Number(averageMs.toFixed(3)),
      maxMs: Number(Math.max(...elapsedSamplesMs).toFixed(3)),
      minMs: Number(Math.min(...elapsedSamplesMs).toFixed(3)),
      roundsPerSecond: Number(((options.iterations * options.samples) / (totalMs / 1000)).toFixed(3)),
      totalMs: Number(totalMs.toFixed(3)),
    },
  };

  if(options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(formatResult(summary));
  const rerunTarget = formatProfileRerunTarget(options);
  console.log('\nFor engine flamegraphs, rerun with:');
  console.log(`node --cpu-prof --experimental-strip-types scripts/profile-search.mjs ${rerunTarget} --iterations ${options.iterations}`);
  console.log('For heap profiles, rerun with:');
  console.log(`node --heap-prof --experimental-strip-types scripts/profile-search.mjs ${rerunTarget} --iterations ${options.iterations}`);
};

await main();

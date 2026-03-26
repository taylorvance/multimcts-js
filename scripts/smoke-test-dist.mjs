import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const npmCacheDir = path.join(repoRoot, '.tmp-npm-cache');

const packResult = spawnSync('npm', ['pack', '--json', '--dry-run', '--ignore-scripts'], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    npm_config_cache: npmCacheDir,
  },
});

assert.equal(packResult.status, 0, packResult.stderr || packResult.stdout);

const [packSummary] = JSON.parse(packResult.stdout);
assert.ok(packSummary, 'npm pack --dry-run did not return package metadata.');

const packedFiles = packSummary.files.map((file) => file.path);

assert.ok(packedFiles.includes('dist/index.js'));
assert.ok(packedFiles.includes('dist/index.d.ts'));
assert.ok(packedFiles.includes('dist/examples/tictactoe.js'));
assert.ok(packedFiles.includes('dist/examples/tictactoe.d.ts'));
assert.ok(packedFiles.includes('dist/games/connect-four.js'));
assert.ok(packedFiles.includes('dist/games/connect-four.d.ts'));
assert.ok(packedFiles.includes('dist/games/breakthrough.js'));
assert.ok(packedFiles.includes('dist/games/breakthrough.d.ts'));
assert.ok(packedFiles.includes('dist/games/othello.js'));
assert.ok(packedFiles.includes('dist/games/othello.d.ts'));
assert.ok(packedFiles.includes('dist/games/hex.js'));
assert.ok(packedFiles.includes('dist/games/hex.d.ts'));
assert.ok(packedFiles.includes('README.md'));
assert.ok(!packedFiles.some((filePath) => filePath.startsWith('dist/tests/')));

const runtimeModule = await import(pathToFileURL(path.join(repoRoot, 'dist/index.js')).href);
const exampleModule = await import(pathToFileURL(path.join(repoRoot, 'dist/examples/tictactoe.js')).href);
const connectFourModule = await import(pathToFileURL(path.join(repoRoot, 'dist/games/connect-four.js')).href);
const breakthroughModule = await import(pathToFileURL(path.join(repoRoot, 'dist/games/breakthrough.js')).href);
const othelloModule = await import(pathToFileURL(path.join(repoRoot, 'dist/games/othello.js')).href);
const hexModule = await import(pathToFileURL(path.join(repoRoot, 'dist/games/hex.js')).href);

assert.equal(typeof runtimeModule.GameState, 'function');
assert.equal(typeof runtimeModule.MCTS, 'function');
assert.equal(typeof runtimeModule.teamValueStrategies, 'object');
assert.equal(typeof exampleModule.TicTacToeState, 'function');
assert.equal(typeof connectFourModule.ConnectFourState, 'function');
assert.equal(typeof breakthroughModule.BreakthroughState, 'function');
assert.equal(typeof othelloModule.OthelloState, 'function');
assert.equal(typeof hexModule.HexState, 'function');

const searchState = new exampleModule.TicTacToeState();
const mcts = new runtimeModule.MCTS({ random: () => 0.5 });
const result = mcts.search(searchState, { maxIterations: 1 });

assert.equal(result.root.visits, 1);
assert.notEqual(result.bestMove, null);

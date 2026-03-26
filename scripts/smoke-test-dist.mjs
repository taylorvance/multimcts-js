import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const npmCacheDir = path.join(repoRoot, '.tmp-npm-cache');

const packResult = spawnSync('npm', ['pack', '--json', '--dry-run'], {
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
assert.ok(packedFiles.includes('README.md'));
assert.ok(!packedFiles.some((filePath) => filePath.startsWith('dist/tests/')));

const runtimeModule = await import(pathToFileURL(path.join(repoRoot, 'dist/index.js')).href);
const exampleModule = await import(pathToFileURL(path.join(repoRoot, 'dist/examples/tictactoe.js')).href);

assert.equal(typeof runtimeModule.GameState, 'function');
assert.equal(typeof runtimeModule.MCTS, 'function');
assert.equal(typeof runtimeModule.teamValueStrategies, 'object');
assert.equal(typeof exampleModule.TicTacToeState, 'function');

const searchState = new exampleModule.TicTacToeState();
const mcts = new runtimeModule.MCTS({ random: () => 0.5 });
const result = mcts.search(searchState, { maxIterations: 1 });

assert.equal(result.root.visits, 1);
assert.notEqual(result.bestMove, null);

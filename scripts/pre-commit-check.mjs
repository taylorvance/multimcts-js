import { execFileSync } from 'node:child_process';

const CODE_PATH_PREFIXES = ['src/', 'tests/', 'scripts/'];
const CODE_PATHS = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.test.json']);

function getStagedFiles() {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function affectsCode(filePath) {
  if (CODE_PATHS.has(filePath)) {
    return true;
  }

  return CODE_PATH_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

const stagedFiles = getStagedFiles();

if (stagedFiles.length === 0) {
  console.log('No staged files; skipping pre-commit checks.');
  process.exit(0);
}

if (!stagedFiles.some(affectsCode)) {
  console.log('Only docs or metadata changes are staged; skipping pre-commit tests.');
  process.exit(0);
}

execFileSync('npm', ['run', 'test'], {
  stdio: 'inherit',
});

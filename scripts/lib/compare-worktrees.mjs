import {
  existsSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const WORKTREE_REF = 'WORKTREE';

export const runCommand = (command, args, cwd) => {
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

export const createTempCompareRoot = (prefix = 'multimcts-compare-') => (
  mkdtempSync(path.join(tmpdir(), prefix))
);

export const ensureNodeModulesLink = (repoRoot, checkoutDir) => {
  const repoNodeModules = path.join(repoRoot, 'node_modules');
  const checkoutNodeModules = path.join(checkoutDir, 'node_modules');

  if(!existsSync(repoNodeModules)) {
    throw new Error('Missing node_modules in the current checkout. Run npm install first.');
  }

  if(!existsSync(checkoutNodeModules)) {
    symlinkSync(repoNodeModules, checkoutNodeModules, 'dir');
  }
};

export const addWorktree = (repoRoot, dir, ref) => {
  runCommand('git', ['worktree', 'add', '--detach', dir, ref], repoRoot);
  ensureNodeModulesLink(repoRoot, dir);
};

export const removeWorktree = (repoRoot, dir) => {
  spawnSync('git', ['worktree', 'remove', '--force', dir], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  rmSync(dir, { force: true, recursive: true });
};

export const buildCheckout = (checkoutDir) => {
  runCommand('npm', ['run', 'build'], checkoutDir);
};

export const removeTempCompareRoot = (dir) => {
  rmSync(dir, { force: true, recursive: true });
};

export const printDependencyWarning = (repoRoot, baselineRef, candidateRef) => {
  if(baselineRef === WORKTREE_REF || candidateRef === WORKTREE_REF) {
    return;
  }

  const diff = spawnSync(
    'git',
    ['diff', '--name-only', baselineRef, candidateRef, '--', 'package.json', 'package-lock.json'],
    {
      cwd: repoRoot,
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

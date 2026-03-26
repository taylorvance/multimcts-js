import { execFileSync } from 'node:child_process';

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

let upstreamRef;

try {
  upstreamRef = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
} catch {
  console.log('No upstream branch configured; skipping remote freshness check.');
  process.exit(0);
}

const [remoteName, ...branchParts] = upstreamRef.split('/');
const remoteBranch = branchParts.join('/');

if (!remoteName || !remoteBranch) {
  fail(`Could not parse upstream branch from "${upstreamRef}".`);
}

try {
  execFileSync('git', ['fetch', '--quiet', remoteName, remoteBranch], {
    stdio: 'inherit',
  });
} catch {
  fail(`Failed to fetch ${remoteName}/${remoteBranch} before push.`);
}

const localHead = runGit(['rev-parse', 'HEAD']);
const upstreamHead = runGit(['rev-parse', '@{u}']);
const mergeBase = runGit(['merge-base', 'HEAD', '@{u}']);

if (localHead === upstreamHead || mergeBase === upstreamHead) {
  console.log(`Upstream check passed against ${upstreamRef}.`);
  process.exit(0);
}

if (mergeBase === localHead) {
  fail(
    `Branch is behind ${upstreamRef}. Run "git pull --rebase ${remoteName} ${remoteBranch}" before pushing.`,
  );
}

fail(
  `Branch has diverged from ${upstreamRef}. Rebase or merge the remote branch before pushing.`,
);

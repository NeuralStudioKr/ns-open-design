import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Split pretest failures so agents/CI can tell contracts build miss from
 * snapshot-capture resolve/build miss (429/434).
 * Always print a labeled failure — including spawn ENOENT when pnpm is absent.
 */
function runStep(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: webRoot,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
  if (result.error) {
    const code = result.error.code || 'spawn';
    console.error(
      `\n[pretest] ${label} failed (${code}: ${result.error.message}).`
      + ' Fix this step before re-running web tests.\n',
    );
    process.exit(1);
  }
  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(
      `\n[pretest] ${label} failed (exit ${code}).`
      + ' Fix this step before re-running web tests.\n',
    );
    process.exit(code);
  }
}

runStep(
  'contracts build',
  'pnpm',
  ['-C', join(webRoot, '../../packages/contracts'), 'run', 'build'],
);
// Prefer direct node for snapshot-capture so this step still labels cleanly
// when only the contracts pnpm step is the blocker (434).
runStep(
  'build:snapshot-capture',
  process.execPath,
  [join(webRoot, 'scripts/build-snapshot-capture.mjs')],
);

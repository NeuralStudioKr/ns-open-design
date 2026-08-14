import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Split pretest failures so agents/CI can tell contracts build miss from
 * snapshot-capture resolve/build miss (429).
 */
function runStep(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: webRoot,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
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
runStep(
  'build:snapshot-capture',
  'pnpm',
  ['run', 'build:snapshot-capture'],
);

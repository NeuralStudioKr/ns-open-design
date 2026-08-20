import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const contractsRoot = join(webRoot, '../../packages/contracts');

/**
 * Split pretest failures so agents/CI can tell contracts build miss from
 * snapshot-capture resolve/build miss (429/434/439).
 * Always print a labeled failure — including spawn ENOENT when pnpm is absent.
 */
function failStep(label, detail) {
  console.error(
    `\n[pretest] ${label} failed (${detail}).`
    + ' Fix this step before re-running web tests.\n',
  );
}

function runStep(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: webRoot,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
  if (result.error) {
    const code = result.error.code || 'spawn';
    failStep(label, `${code}: ${result.error.message}`);
    process.exit(1);
  }
  const code = result.status ?? 1;
  if (code !== 0) {
    failStep(label, `exit ${code}`);
    process.exit(code);
  }
}

/**
 * Prefer pnpm, then corepack pnpm. Last resort: node esbuild.config.mjs so
 * sparse agents without pnpm still get a labeled contracts step (439).
 * Note: node-only fallback skips `tsc --emitDeclarationOnly`.
 */
function runContractsBuild() {
  const attempts = [
    ['pnpm', ['-C', contractsRoot, 'run', 'build']],
    ['corepack', ['pnpm', '-C', contractsRoot, 'run', 'build']],
  ];
  for (const [command, args] of attempts) {
    const result = spawnSync(command, args, {
      cwd: webRoot,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.error) {
      console.error(
        `[pretest] contracts build: ${command} unavailable (${result.error.code || 'spawn'}).`,
      );
      continue;
    }
    if ((result.status ?? 1) === 0) return;
    failStep('contracts build', `exit ${result.status}`);
    process.exit(result.status ?? 1);
  }
  console.error(
    '[pretest] contracts build: pnpm/corepack unavailable; trying node esbuild.config.mjs (no d.ts emit).',
  );
  runStep(
    'contracts build (node esbuild)',
    process.execPath,
    [join(contractsRoot, 'esbuild.config.mjs')],
    { cwd: contractsRoot },
  );
}

runContractsBuild();
// Prefer direct node for snapshot-capture so this step still labels cleanly
// when only the contracts pnpm step is the blocker (434).
runStep(
  'build:snapshot-capture',
  process.execPath,
  [join(webRoot, 'scripts/build-snapshot-capture.mjs')],
);

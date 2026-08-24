import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const snapshotScript = readFileSync(
  join(here, '../../scripts/build-snapshot-capture.mjs'),
  'utf8',
);
const pretestScript = readFileSync(
  join(here, '../../scripts/pretest.mjs'),
  'utf8',
);
const packageJson = readFileSync(
  join(here, '../../package.json'),
  'utf8',
);

describe('build:snapshot-capture resolve guards', () => {
  it('lists workspace resolve roots in failure messages', () => {
    expect(snapshotScript).toContain('function workspaceResolveRoots');
    expect(snapshotScript).toContain('function formatResolveFailure');
    expect(snapshotScript).toContain('Tried createRequire from:');
    expect(snapshotScript).toContain("join(root, 'package.json')");
    expect(snapshotScript).toContain("join(root, '../../packages/contracts/package.json')");
  });

  it('prefers modern-screenshot ESM over require.resolve CJS', () => {
    expect(snapshotScript).toContain('function resolveModernScreenshotEsm');
    expect(snapshotScript).toContain("join(dirname(pkgJson), 'dist', 'index.mjs')");
    expect(snapshotScript).toContain('exports.require');
    expect(snapshotScript).toContain("alias: {\n    'modern-screenshot': modernScreenshotEntry");
  });
});

describe('web pretest step split', () => {
  it('labels contracts build vs snapshot-capture failures separately', () => {
    expect(packageJson).toContain('"pretest": "node scripts/pretest.mjs"');
    expect(pretestScript).toContain('[pretest] ${label} failed');
    expect(pretestScript).toContain('contracts build');
    expect(pretestScript).toContain("'build:snapshot-capture'");
  });

  it('prints labeled failure on spawn errors (pnpm missing) and runs snapshot via node', () => {
    expect(pretestScript).toContain('if (result.error)');
    expect(pretestScript).toContain('result.error.code');
    expect(pretestScript).toContain('process.execPath');
    expect(pretestScript).toContain("join(webRoot, 'scripts/build-snapshot-capture.mjs')");
  });

  it('falls back contracts build via corepack then node esbuild', () => {
    expect(pretestScript).toContain('function runContractsBuild');
    expect(pretestScript).toContain("['corepack', ['pnpm'");
    expect(pretestScript).toContain("'contracts build (node esbuild)'");
    expect(pretestScript).toContain('esbuild.config.mjs');
    // Node-only fallback skips tsc d.ts emit — keep the caveat in the contract (444).
    expect(pretestScript).toContain('no d.ts emit');
    expect(pretestScript).toContain('skips `tsc --emitDeclarationOnly`');
  });
});

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
    expect(pretestScript).toContain("'contracts build'");
    expect(pretestScript).toContain("'build:snapshot-capture'");
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../scripts/build-snapshot-capture.mjs'),
  'utf8',
);

describe('build:snapshot-capture resolve guards', () => {
  it('lists workspace resolve roots in failure messages', () => {
    expect(script).toContain('function workspaceResolveRoots');
    expect(script).toContain('function formatResolveFailure');
    expect(script).toContain('Tried createRequire from:');
    expect(script).toContain("join(root, 'package.json')");
    expect(script).toContain("join(root, '../../packages/contracts/package.json')");
  });

  it('prefers modern-screenshot ESM over require.resolve CJS', () => {
    expect(script).toContain('function resolveModernScreenshotEsm');
    expect(script).toContain("join(dirname(pkgJson), 'dist', 'index.mjs')");
    expect(script).toContain('exports.require');
    expect(script).toContain("alias: {\n    'modern-screenshot': modernScreenshotEntry");
  });
});

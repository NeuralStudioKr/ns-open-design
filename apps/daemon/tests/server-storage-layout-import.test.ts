import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Regression: server.ts must import resolveProjectStorageLayout before use.
 * Missing import crashes daemon at module load (ReferenceError) — tsc can miss
 * this if build is skipped; static wiring check catches it in CI.
 */
describe('server.ts project storage layout wiring', () => {
  it('imports resolveProjectStorageLayout for PROJECT_STORAGE_LAYOUT', () => {
    const source = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');

    expect(source).toMatch(
      /import\s*\{[^}]*\bresolveProjectStorageLayout\b[^}]*\}\s*from\s*['"]\.\/storage\/project-storage-layout\.js['"]/,
    );
    expect(source).toContain(
      'const PROJECT_STORAGE_LAYOUT = resolveProjectStorageLayout(process.env, RUNTIME_DATA_DIR)',
    );
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoutes = readFileSync(join(here, '../src/project-routes.ts'), 'utf8');

describe('preview /raw sendProjectFile point-get heal', () => {
  it('retries ENOENT via ensureFileAvailable before serving preview assets', () => {
    // Deck iframes load Drive / composer images via /preview/:scope/*
    // (not chat thumbs). Without a point-get heal, TTL-skipped sync-down
    // leaves relative <img src="refs/drive/..."> as permanent 404s.
    expect(projectRoutes).toContain('resolveProjectFilePathWithPointGet');
    expect(projectRoutes).toContain('ensureFileAvailable');
    expect(projectRoutes).toMatch(
      /err\.code === 'ENOENT' && ctx\.projectStorageHooks/,
    );
    expect(projectRoutes).toContain(
      'Sibling-node uploads / Drive import can land in S3',
    );
    // Both preview and the winning /raw/ path go through sendProjectFile.
    expect(projectRoutes).toMatch(
      /const meta = await resolveProjectFilePathWithPointGet\(/,
    );
  });
});

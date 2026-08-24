import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoutes = readFileSync(join(here, '../src/project-routes.ts'), 'utf8');
const access = readFileSync(join(here, '../src/teamver-project-access.ts'), 'utf8');

describe('preview-url-batch route wiring (0806-N06)', () => {
  it('registers POST /api/projects/preview-url-batch after single GET preview-url', () => {
    const getAt = projectRoutes.indexOf("app.get('/api/projects/:id/preview-url'");
    const batchAt = projectRoutes.indexOf("app.post('/api/projects/preview-url-batch'");
    expect(getAt).toBeGreaterThan(0);
    expect(batchAt).toBeGreaterThan(getAt);
    const block = projectRoutes.slice(batchAt, batchAt + 4_200);
    expect(block).toContain('PROJECT_PREVIEW_URL_BATCH_MAX');
    expect(block).toContain('projectPreviewScopes.mint');
    expect(block).toContain('teamverBatchProjectAccessOk');
    expect(block).toContain('ok: false');
    expect(block).toContain("Cache-Control', 'no-store'");
  });

  it('denies preview-url-batch as a project id collection slug', () => {
    expect(access).toContain("'preview-url-batch'");
  });
});

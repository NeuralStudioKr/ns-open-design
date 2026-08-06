import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoutes = readFileSync(join(here, '../src/project-routes.ts'), 'utf8');
const access = readFileSync(join(here, '../src/teamver-project-access.ts'), 'utf8');

describe('cover-html-batch route wiring (0806-N07)', () => {
  it('registers POST /api/projects/cover-html-batch after preview-url-batch', () => {
    const previewBatchAt = projectRoutes.indexOf("app.post('/api/projects/preview-url-batch'");
    const coverBatchAt = projectRoutes.indexOf("app.post('/api/projects/cover-html-batch'");
    expect(previewBatchAt).toBeGreaterThan(0);
    expect(coverBatchAt).toBeGreaterThan(previewBatchAt);
    const block = projectRoutes.slice(coverBatchAt, coverBatchAt + 5_200);
    expect(block).toContain('PROJECT_COVER_HTML_BATCH_MAX');
    expect(block).toContain('prepareCoverHtmlBatchBody');
    expect(block).toContain('resolveProjectFilePath');
    expect(block).toContain('readProjectFile');
    expect(block).toContain('teamverBatchProjectAccessOk');
    expect(block).toContain("Cache-Control', 'no-store'");
  });

  it('denies cover-html-batch as a project id collection slug', () => {
    expect(access).toContain("'cover-html-batch'");
  });
});

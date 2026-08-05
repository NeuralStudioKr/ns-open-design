import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoutes = readFileSync(join(here, '../src/project-routes.ts'), 'utf8');
const lazyMaterialization = readFileSync(
  join(here, '../src/storage/lazy-project-materialization.ts'),
  'utf8',
);

describe('project file presign-get route wiring', () => {
  it('registers session-gated POST /presign-get before scoped preview routes', () => {
    const presignAt = projectRoutes.indexOf("app.post('/api/projects/:id/presign-get'");
    const previewAt = projectRoutes.indexOf(
      'app.get(/^\\/api\\/projects\\/([^/]+)\\/preview\\/([^/]+)\\/(.+)$/u',
    );
    expect(presignAt).toBeGreaterThan(0);
    expect(previewAt).toBeGreaterThan(presignAt);
    const block = projectRoutes.slice(presignAt, presignAt + 2200);
    expect(block).toContain('mintProjectFilePresignedGetFromRequest');
    expect(block).toContain("sendApiError(res, 404, 'FILE_NOT_FOUND'");
    expect(block).toContain("status === 401 ? 'UNAUTHORIZED' : 'UPSTREAM_UNAVAILABLE'");
    expect(block).toContain("status: 'disabled' as const");
    expect(block).toContain("status: 'ready' as const");
    expect(block).toContain("Cache-Control', 'no-store'");
  });

  it('does not treat /presign-get as a scratch materialization path', () => {
    expect(lazyMaterialization).toContain('function isProjectMaterializationPath');
    // Only files/folders/raw/export/… are materialized — presign-get must stay out.
    expect(lazyMaterialization).not.toMatch(/presign-get/);
    expect(lazyMaterialization).toMatch(
      /\/\(files\|folders\|search\|preview-url\|upload\|media\|finalize\|deploy\|design-system-package-audit\)/,
    );
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoutes = readFileSync(join(here, '../src/project-routes.ts'), 'utf8');

describe('project preview scope bridge injection', () => {
  it('injects odPreviewBridge on scoped /preview routes like /raw', () => {
    const start = projectRoutes.indexOf(
      'app.get(/^\\/api\\/projects\\/([^/]+)\\/preview\\/([^/]+)\\/(.+)$/u',
    );
    expect(start).toBeGreaterThan(0);
    const block = projectRoutes.slice(start, start + 3200);
    expect(block).toContain('wantsUrlPreviewScrollBridge');
    expect(block).toContain('injectUrlPreviewBridge');
    expect(block).toContain("injectUrlPreviewBridge(html, 'selection')");
    expect(block).toContain("injectUrlPreviewBridge(html, 'snapshot')");
  });
});

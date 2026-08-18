import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const routes = readFileSync(join(here, '../src/import-export-routes.ts'), 'utf8');
const server = readFileSync(join(here, '../src/server.ts'), 'utf8');
const headless = readFileSync(join(here, '../src/headless-export.ts'), 'utf8');

describe('export relative asset warm wiring', () => {
  it('warms inline export assets on html/pdf/pptx/zip/image routes', () => {
    expect(routes).toContain('warmInlineExportAssets');
    expect(routes).toContain('warmExportRelativeAssets');
    // Every buildDesktopPdfExportInput call should be followed by a warm.
    const builds = routes.match(/await buildDesktopPdfExportInput\(/g) ?? [];
    const warms = routes.match(/await warmInlineExportAssets\(/g) ?? [];
    expect(builds.length).toBeGreaterThanOrEqual(5);
    expect(warms.length).toBe(builds.length);
    expect(routes).toContain('applyOfficialTemplateLookToBuilt');
    expect(routes).toContain('mergeOfficialTemplateLookForExport');
  });

  it('passes projectStorageHooks into registerProjectExportRoutes', () => {
    expect(server).toMatch(
      /registerProjectExportRoutes\(app, \{[\s\S]*?projectStorageHooks,/,
    );
  });

  it('resolves bare html-ppt folder ids to example- install ids on plugin GET', () => {
    expect(server).toContain("aliasBase.startsWith('example-')");
    expect(server).toContain('`example-${aliasBase}`');
  });

  it('retries failed Chromium image fetches once during inlining', () => {
    expect(headless).toContain("cache: 'reload'");
    expect(headless).toContain('setTimeout(r, 400)');
  });
});

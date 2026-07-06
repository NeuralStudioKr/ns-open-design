import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDesktopPdfExportInput } from '../src/pdf-export.js';
import { startServer } from '../src/server.js';

describe('buildDesktopPdfExportInput', () => {
  let projectsRoot = '';
  const projectId = 'proj-pdf-test';

  beforeEach(async () => {
    projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-pdf-export-'));
    await mkdir(path.join(projectsRoot, projectId, 'deck', 'assets'), { recursive: true });
    await writeFile(
      path.join(projectsRoot, projectId, 'deck', 'index.html'),
      '<!doctype html><section class="slide">One</section>',
    );
  });

  afterEach(() => {
    if (projectsRoot) rmSync(projectsRoot, { recursive: true, force: true });
  });

  it('reads the project file and derives a raw-route baseHref from the file directory', async () => {
    const built = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: true,
      fileName: 'deck/index.html',
      projectId,
      projectsRoot,
      title: 'Seed Deck',
    });

    expect(built.input).toEqual({
      baseHref: 'http://127.0.0.1:7456/api/projects/proj-pdf-test/raw/deck/',
      deck: true,
      defaultFilename: 'Seed Deck.pdf',
      html: '<!doctype html><section class="slide">One</section>',
      title: 'Seed Deck',
    });
    expect(built.source.relPath).toBe('deck/index.html');
    expect(built.source.mtimeMs).toBeGreaterThan(0);
  });

  it('falls back to the file basename when the caller omits a title', async () => {
    const built = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: false,
      fileName: 'deck/index.html',
      projectId,
      projectsRoot,
    });

    expect(built.input.title).toBe('index');
    expect(built.input.defaultFilename).toBe('index.pdf');
  });

  it('renders inlineHtml directly and never touches scratch (S3-prefix-free export path)', async () => {
    const built = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: true,
      fileName: 'deck/index.html',
      // A projectsRoot that does not exist proves inline mode skips the disk read.
      projectsRoot: '/dev/null/does-not-exist',
      projectId: 'unknown-project',
      title: 'Snapshot Deck',
      inlineHtml: '<!doctype html><section class="slide">Snapshot</section>',
    });

    expect(built.input.html).toBe('<!doctype html><section class="slide">Snapshot</section>');
    expect(built.input.deck).toBe(true);
    expect(built.input.defaultFilename).toBe('Snapshot Deck.pdf');
    expect(built.source.relPath).toBe('deck/index.html');
    // Same body → deterministic cache-key mtime so identical inline exports dedupe.
    expect(built.source.mtimeMs).toBeGreaterThan(0);
    const rerun = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: true,
      fileName: 'deck/index.html',
      projectsRoot: '/dev/null/does-not-exist',
      projectId: 'unknown-project',
      title: 'Snapshot Deck',
      inlineHtml: '<!doctype html><section class="slide">Snapshot</section>',
    });
    expect(rerun.source.mtimeMs).toBe(built.source.mtimeMs);
    const different = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: true,
      fileName: 'deck/index.html',
      projectsRoot: '/dev/null/does-not-exist',
      projectId: 'unknown-project',
      title: 'Snapshot Deck',
      inlineHtml: '<!doctype html><section class="slide">Different</section>',
    });
    expect(different.source.mtimeMs).not.toBe(built.source.mtimeMs);
  });

  it('treats an all-whitespace inlineHtml as absent and reads the file instead', async () => {
    const built = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: false,
      fileName: 'deck/index.html',
      projectId,
      projectsRoot,
      inlineHtml: '   \n\t  ',
    });

    expect(built.input.html).toBe('<!doctype html><section class="slide">One</section>');
    expect(built.source.mtimeMs).toBeGreaterThan(0);
  });

  it('uses Vite dist/index.html when the entry is a dev module shell', async () => {
    await mkdir(path.join(projectsRoot, projectId, 'deck', 'dist', 'assets'), { recursive: true });
    await writeFile(
      path.join(projectsRoot, projectId, 'deck', 'index.html'),
      '<!doctype html><script type="module" src="/src/main.tsx"></script>',
    );
    await writeFile(
      path.join(projectsRoot, projectId, 'deck', 'dist', 'index.html'),
      '<!doctype html><link rel="stylesheet" href="/assets/app.css"><div id="root">built</div>',
    );

    const built = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: true,
      fileName: 'deck/index.html',
      projectId,
      projectsRoot,
      title: 'Built Deck',
    });

    expect(built.input.baseHref).toBe(
      'http://127.0.0.1:7456/api/projects/proj-pdf-test/raw/deck/dist/',
    );
    expect(built.input.html).toContain('href="assets/app.css"');
    expect(built.input.html).toContain('built');
    // Cache key SSOT: mtime tracks the dist file, not the dev shell (§20.1).
    expect(built.source.relPath).toBe('deck/dist/index.html');
  });
});

describe('POST /api/projects/:id/export/pdf', () => {
  it('forwards the project HTML file to the configured desktop PDF exporter', async () => {
    const projectId = `proj-pdf-route-${Date.now()}`;
    const calls: unknown[] = [];
    const started = await startServer({
      port: 0,
      returnServer: true,
      desktopPdfExporter: async (input: unknown) => {
        calls.push(input);
        return { ok: true, path: '/tmp/seed.pdf' };
      },
    }) as { server: { close(cb: () => void): void }; url: string };

    try {
      await fetch(`${started.url}/api/projects/${encodeURIComponent(projectId)}/files`, {
        body: JSON.stringify({
          content: '<!doctype html><section class="slide">One</section>',
          name: 'deck/index.html',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      const response = await fetch(`${started.url}/api/projects/${encodeURIComponent(projectId)}/export/pdf`, {
        body: JSON.stringify({ deck: true, fileName: 'deck/index.html', title: 'Seed Deck' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, path: '/tmp/seed.pdf' });
      expect(calls).toEqual([
        {
          baseHref: `${started.url}/api/projects/${encodeURIComponent(projectId)}/raw/deck/`,
          deck: true,
          defaultFilename: 'Seed Deck.pdf',
          html: '<!doctype html><section class="slide">One</section>',
          title: 'Seed Deck',
        },
      ]);
    } finally {
      await new Promise<void>((resolve) => started.server.close(resolve));
    }
  });
});

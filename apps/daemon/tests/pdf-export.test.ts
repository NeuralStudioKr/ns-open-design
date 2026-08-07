import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildDesktopPdfExportInput,
  collectRelativeProjectAssetPaths,
  inlineProjectImagesFromScratch,
  warmExportRelativeAssets,
} from '../src/pdf-export.js';
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

  it('repairs viewport leaks when reading project HTML from disk', async () => {
    await writeFile(
      path.join(projectsRoot, projectId, 'deck', 'leaky.html'),
      `<!doctype html><html><head><title>T</title></head><body>viewport=width=device-width, initial-scale=1" /><section class="slide">One</section></body></html>`,
    );
    const built = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: true,
      fileName: 'deck/leaky.html',
      projectId,
      projectsRoot,
      title: 'Leaky Deck',
    });

    expect(built.input.html).not.toMatch(/viewport=width=device-width/i);
    expect(built.input.html).toContain('<section class="slide">One</section>');
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

describe('inlineProjectImagesFromScratch', () => {
  let projectsRoot = '';
  const projectId = 'proj-inline-fs';

  beforeEach(async () => {
    projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-inline-fs-'));
    await mkdir(path.join(projectsRoot, projectId, 'refs', 'drive'), { recursive: true });
  });

  afterEach(() => {
    if (projectsRoot) rmSync(projectsRoot, { recursive: true, force: true });
  });

  it('replaces relative <img src> with data URIs read from scratch', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await writeFile(path.join(projectsRoot, projectId, 'refs', 'drive', 'a.png'), png);
    const html = '<img src="refs/drive/a.png" alt="a" srcset="refs/drive/a.png 2x">';
    const out = await inlineProjectImagesFromScratch({ html, projectId, projectsRoot });
    expect(out).toContain('src="data:image/png;base64,iVBORw0KGgo=');
    // Sibling srcset must be dropped once src became a data URI so Chromium
    // does not re-fetch the relative URL for a higher-DPR variant.
    expect(out).not.toMatch(/srcset\s*=/);
  });

  it('resolves NFC img src against NFD on-disk file (Hangul filenames)', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1]);
    const nfd = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFD');
    const nfc = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFC');
    await writeFile(path.join(projectsRoot, projectId, 'refs', 'drive', nfd), png);
    const html = `<img src="refs/drive/${nfc}" alt="fish">`;
    const out = await inlineProjectImagesFromScratch({ html, projectId, projectsRoot });
    expect(out).toMatch(/src="data:image\/webp;base64,/);
  });

  it('leaves external / data / api URLs unchanged', async () => {
    const html = [
      '<img src="https://cdn.example/a.png">',
      '<img src="data:image/png;base64,xx">',
      '<img src="/api/projects/p/raw/skip.png">',
    ].join('');
    const out = await inlineProjectImagesFromScratch({ html, projectId, projectsRoot });
    expect(out).toBe(html);
  });

  it('leaves relative src alone when file is missing on disk', async () => {
    const html = '<img src="uploads/missing.png" alt="?">';
    const out = await inlineProjectImagesFromScratch({ html, projectId, projectsRoot });
    expect(out).toBe(html);
  });

  it('basename-fallback resolves a bare filename to the timestamp-prefixed disk file', async () => {
    // Model sometimes emits `<img src="민들레.png">` while the on-disk file is
    // `msh9rso1-민들레.png` (staged with a session id prefix). Without this
    // fallback the preview iframe collapses to alt-only text ("민들레") — the
    // exact regression the user reports.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 42]);
    await writeFile(
      path.join(projectsRoot, projectId, 'msh9rso1-민들레.png'),
      png,
    );
    const html = '<img src="민들레.png" alt="민들레">';
    const out = await inlineProjectImagesFromScratch({ html, projectId, projectsRoot });
    expect(out).toMatch(/src="data:image\/png;base64,/);
    expect(out).toContain('alt="민들레"');
  });

  it('basename-fallback tolerates NFC/NFD mismatch when the disk file uses the alternate form', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1]);
    // Disk stores NFD (macOS drag-drop pre-NFC-normalization).
    const diskNameNfd = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFD');
    // Model emits NFC bare basename without the id prefix.
    const bareNfc = '서빙하는-금붕어.webp'.normalize('NFC');
    await writeFile(path.join(projectsRoot, projectId, diskNameNfd), png);
    const html = `<img src="${bareNfc}" alt="fish">`;
    const out = await inlineProjectImagesFromScratch({ html, projectId, projectsRoot });
    expect(out).toMatch(/src="data:image\/webp;base64,/);
  });
});

describe('collectRelativeProjectAssetPaths / warmExportRelativeAssets', () => {
  it('collects Drive/composer relative imgs and css urls, skips absolute/data', () => {
    const html = `
      <section class="slide">
        <img src="refs/drive/msh5lhfh-놀란고양이-_1_.jpeg" alt="cat">
        <img src="/refs/drive/leading-slash.png" alt="slash">
        <img src="/api/projects/p/raw/skip.png">
        <img src="data:image/png;base64,xx">
        <img src="https://cdn.example/remote.png">
        <div style="background-image:url('uploads/hero.png')"></div>
      </section>`;
    expect(collectRelativeProjectAssetPaths(html)).toEqual([
      'refs/drive/msh5lhfh-놀란고양이-_1_.jpeg',
      'refs/drive/leading-slash.png',
      'uploads/hero.png',
    ]);
  });

  it('point-gets collected relative assets before Chromium export', async () => {
    const called: string[] = [];
    const warmed = await warmExportRelativeAssets({
      projectId: 'proj-1',
      html: '<img src="refs/drive/a.png"><img src="photo.jpeg">',
      ensureFileAvailable: async (_id, relpath) => {
        called.push(relpath);
        return true;
      },
    });
    expect(called.sort()).toEqual(['photo.jpeg', 'refs/drive/a.png']);
    expect(warmed.sort()).toEqual(['photo.jpeg', 'refs/drive/a.png']);
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

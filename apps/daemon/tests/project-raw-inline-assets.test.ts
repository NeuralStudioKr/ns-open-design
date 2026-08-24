// @vitest-environment jsdom

import type http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

/**
 * Route-level coverage for the inline-images pass wired into
 * `GET /api/projects/:id/raw/*.html` (opt-in via `?inlineAssets=1`).
 *
 * Motivating regression: the FE deck preview iframe fetches deck.html via
 * `/raw` then hosts it in `srcdoc`. Without inline, subresource `<img src>`
 * GETs go back through `/preview/<scope>/…` and any Hangul NFC/NFD mismatch or
 * basename-only ref causes the browser to silently fall back to alt text
 * ("파일명만 보임"). Inline transforms these refs into `data:` URIs before the
 * HTML leaves the daemon.
 *
 * Non-goals: model context / retry payloads / manual raw editor MUST continue
 * to receive the on-disk bytes; the query gate below enforces that.
 */
describe('GET /raw/*.html — inlineAssets gate', () => {
  let server: http.Server;
  let baseUrl: string;
  let projectId: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    projectId = `raw-inline-${Date.now()}`;

    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: projectId,
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const projectsRoot = path.join(process.env.OD_DATA_DIR!, 'projects');
    const dir = path.join(projectsRoot, projectId);
    await mkdir(path.join(dir, 'refs', 'drive'), { recursive: true });

    // Byte-valid PNG header + one payload byte, small enough that inline stays
    // well under the 4 MiB per-image cap.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 42]);
    await writeFile(path.join(dir, 'refs', 'drive', 'msh9rso1-민들레.png'), png);

    // Deck references the image with the bare basename (the exact model-emit
    // mistake the user reported). The daemon inline pass MUST recover the real
    // on-disk file via basename fallback and inline it as a data URI.
    await writeFile(
      path.join(dir, 'deck.html'),
      [
        '<!doctype html>',
        '<html><body>',
        '<section class="slide">',
        '<img src="민들레.png" alt="민들레">',
        '</section>',
        '</body></html>',
      ].join(''),
      'utf8',
    );
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('returns raw HTML unchanged when inlineAssets is not requested (edit / model-context / download path)', async () => {
    const resp = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/raw/deck.html`,
    );
    expect(resp.status).toBe(200);
    const body = await resp.text();
    expect(body).toContain('src="민들레.png"');
    expect(body).not.toMatch(/src="data:image\//);
  });

  it('rewrites <img src> into inline data: URIs when ?inlineAssets=1 is set (preview path)', async () => {
    const resp = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/raw/deck.html?inlineAssets=1`,
    );
    expect(resp.status).toBe(200);
    const body = await resp.text();
    // Basename fallback resolves `민들레.png` to the on-disk `refs/drive/msh9rso1-민들레.png`.
    expect(body).toMatch(/src="data:image\/png;base64,/);
    // The original bare basename must no longer appear in an `<img src>`
    // attribute — otherwise the srcdoc iframe would still fire a subresource
    // GET that gets to 404.
    expect(body).not.toMatch(/<img[^>]*src="민들레\.png"/);
    // Alt text is preserved (still says "민들레") so accessibility is intact.
    expect(body).toContain('alt="민들레"');
  });

  it('leaves non-HTML files alone even with ?inlineAssets=1 (image byte fetch stays untouched)', async () => {
    const encodedPath = ['refs', 'drive', 'msh9rso1-민들레.png']
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const resp = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/raw/${encodedPath}?inlineAssets=1`,
    );
    expect(resp.status).toBe(200);
    // Inline transform is gated on `text/html` — image responses stay
    // untouched. Content-type check is what matters here; the exact byte body
    // depends on how the test harness fetch decodes the response.
    expect(resp.headers.get('content-type')).toContain('image/png');
  });
});

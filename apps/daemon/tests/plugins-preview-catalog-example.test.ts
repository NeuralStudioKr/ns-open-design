// Catalog preview must prefer a shipped root example.html over a
// generation seed in context.assets — even when the SQLite manifest is
// stale (`preview.entry: ./index.html` missing). Replit Deck wizard
// thumbs went white because assets/template.html ([REPLACE] · helix
// #fafafa) won that walk.

import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');
const serverRuntimeDataRoot = process.env.OD_DATA_DIR
  ? path.resolve(projectRoot, process.env.OD_DATA_DIR)
  : path.join(projectRoot, '.od');

const PLUGIN_ID = `catalog-example-before-seed-${Date.now()}`;
let pluginRoot: string;
let server: http.Server | undefined;
let baseUrl: string;

async function bootInstall(folder: string): Promise<void> {
  const installResp = await fetch(`${baseUrl}/api/plugins/install`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ source: folder }),
  });
  if (!installResp.body) throw new Error('install: no SSE body');
  const reader = installResp.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value);
  }
  if (!raw.includes('event: success')) {
    throw new Error(`installer did not finalize:\n${raw}`);
  }
}

beforeEach(async () => {
  pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'od-preview-catalog-ex-'));
  const folder = path.join(pluginRoot, PLUGIN_ID);
  await mkdir(path.join(folder, 'assets'), { recursive: true });
  await writeFile(
    path.join(folder, 'assets', 'template.html'),
    [
      '<!DOCTYPE html><title>[REPLACE] Deck title</title>',
      '<body data-theme="helix"><section class="slide">',
      '<h1>[REPLACE] The cover headline.</h1>',
      '</section></body>',
    ].join(''),
  );
  await writeFile(
    path.join(folder, 'example.html'),
    [
      '<!DOCTYPE html><title>Helix — Q1 Board</title>',
      '<body data-theme="helix"><section class="slide">',
      "<p>HELIX · Q1 '26 BOARD</p>",
      '<h1>Compounding on a market that finally moved.</h1>',
      '</section></body>',
    ].join(''),
  );
  await writeFile(
    path.join(folder, 'open-design.json'),
    JSON.stringify({
      $schema: 'https://open-design.ai/schemas/plugin.v1.json',
      name: PLUGIN_ID,
      title: 'Stale Replit-shaped preview',
      version: '0.1.0',
      description: 'fixture',
      license: 'MIT',
      od: {
        kind: 'scenario',
        capabilities: ['prompt:inject'],
        preview: { type: 'html', entry: './index.html' },
        context: {
          assets: ['./assets/template.html'],
        },
      },
    }),
  );
  await writeFile(
    path.join(folder, 'SKILL.md'),
    `---\nname: ${PLUGIN_ID}\ndescription: catalog example fixture\n---\n# fixture\n`,
  );

  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  server = started.server;
  baseUrl = started.url;
  await bootInstall(folder);
}, 30_000);

afterEach(async () => {
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
  try {
    const dbPath = path.join(serverRuntimeDataRoot, 'app.sqlite');
    const db = new Database(dbPath);
    db.prepare('DELETE FROM installed_plugins WHERE id = ?').run(PLUGIN_ID);
    db.close();
  } catch {
    // ignore
  }
  await rm(pluginRoot, { recursive: true, force: true });
}, 30_000);

describe('GET /api/plugins/:id/preview — catalog example before seed', () => {
  it('serves root example.html instead of assets/template.html when entry is missing', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/${PLUGIN_ID}/preview`);
    if (resp.status !== 200) {
      throw new Error(`expected 200, got ${resp.status}: ${await resp.text()}`);
    }
    const body = await resp.text();
    expect(body).toContain("HELIX · Q1 '26 BOARD");
    expect(body).toContain('Compounding on a market that finally moved.');
    expect(body).not.toContain('[REPLACE]');
  });

  it('thumbnail batch uses the same catalog example, not the seed', async () => {
    const previewUrl = `/api/plugins/${PLUGIN_ID}/preview`;
    const resp = await fetch(`${baseUrl}/api/plugins/preview-batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ urls: [previewUrl], mode: 'thumbnail' }),
    });
    expect(resp.status).toBe(200);
    const payload = (await resp.json()) as {
      results?: Array<{ url: string; ok: boolean; html?: string }>;
    };
    const html = payload.results?.[0]?.html ?? '';
    expect(payload.results?.[0]).toMatchObject({ url: previewUrl, ok: true });
    expect(html).toContain("HELIX · Q1 '26 BOARD");
    expect(html).not.toContain('[REPLACE]');
  });
});

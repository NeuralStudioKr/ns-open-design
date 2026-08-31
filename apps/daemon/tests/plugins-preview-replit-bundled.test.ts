// Real bundled Replit Deck preview — not a fixture mirror.
// Wizard thumbs hit GET /api/plugins/example-replit-deck/preview.
// The catalog must serve the helix cover, never assets/template.html
// `[REPLACE]` seed, even when context.assets still lists that seed.

import http from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };

const PLUGIN_ID = 'example-replit-deck';
let server: http.Server | undefined;
let baseUrl: string;

beforeEach(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  server = started.server;
  baseUrl = started.url;
}, 30_000);

afterEach(async () => {
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
}, 30_000);

describe('GET /api/plugins/example-replit-deck/preview — bundled helix cover', () => {
  it('serves the shipped helix example, not the [REPLACE] generation seed', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/${PLUGIN_ID}/preview`);
    if (resp.status !== 200) {
      throw new Error(`expected 200, got ${resp.status}: ${await resp.text()}`);
    }
    const body = await resp.text();
    expect(body).toContain("HELIX · Q1 '26 BOARD");
    expect(body).toContain('Compounding on a market that finally moved.');
    expect(body).not.toContain('[REPLACE]');
  });
});

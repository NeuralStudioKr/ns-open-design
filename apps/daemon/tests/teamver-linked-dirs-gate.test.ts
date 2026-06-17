import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

describe('Teamver embed linkedDirs gates', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalDesignApiUrl: string | undefined;
  let originalFetch: typeof fetch;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      if (url.includes('/api/v1/projects/') && url.endsWith('/access')) {
        return new Response(null, { status: 204 });
      }
      return originalFetch(input, init);
    });
    originalDesignApiUrl = process.env.TEAMVER_DESIGN_API_URL;
    process.env.TEAMVER_DESIGN_API_URL = 'http://teamver-design-api:8000';
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    server = started.server;
    baseUrl = started.url;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    server?.close();
    if (originalDesignApiUrl === undefined) delete process.env.TEAMVER_DESIGN_API_URL;
    else process.env.TEAMVER_DESIGN_API_URL = originalDesignApiUrl;
  });

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects POST /api/projects with metadata.linkedDirs', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-teamver-linked-dirs-'));
    tempDirs.push(dir);
    await mkdir(dir, { recursive: true });
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'teamver-linked-dirs-post',
        name: 'Blocked',
        metadata: { kind: 'prototype', linkedDirs: [dir] },
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('LINKED_DIRS_UNAVAILABLE');
  });

  it('rejects PATCH /api/projects/:id metadata.linkedDirs', async () => {
    const create = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'teamver-linked-dirs-patch',
        name: 'Native',
        metadata: { kind: 'prototype' },
      }),
    });
    expect(create.ok).toBe(true);

    const dir = mkdtempSync(path.join(tmpdir(), 'od-teamver-linked-dirs-'));
    tempDirs.push(dir);
    await mkdir(dir, { recursive: true });
    const patch = await fetch(`${baseUrl}/api/projects/teamver-linked-dirs-patch`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Teamver-User-Id': 'user-1',
        'X-Teamver-Workspace-Id': 'WS-1',
      },
      body: JSON.stringify({
        metadata: { kind: 'prototype', linkedDirs: [dir] },
      }),
    });
    expect(patch.status).toBe(400);
    const body = (await patch.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('LINKED_DIRS_UNAVAILABLE');
  });

  it('rejects POST /api/import/folder', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-teamver-linked-dirs-'));
    tempDirs.push(dir);
    await mkdir(dir, { recursive: true });
    const resp = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir: dir, name: 'Imported' }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('FOLDER_IMPORT_UNAVAILABLE');
  });
});

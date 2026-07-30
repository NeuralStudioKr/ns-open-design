// @vitest-environment jsdom

import type http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('project file revisions API', () => {
  let server: http.Server;
  let baseUrl: string;
  let projectId: string;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    projectId = `rev-test-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: projectId, skillId: null, designSystemId: null }),
    });
    expect(createResp.status).toBe(200);
    const projectsRoot = path.join(process.env.OD_DATA_DIR!, 'projects');
    const dir = path.join(projectsRoot, projectId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'deck.html'),
      '<!doctype html><html><body><h1>v0</h1></body></html>',
      'utf8',
    );
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const revisionsUrl = (suffix = '') =>
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/files/deck.html/revisions${suffix}`;

  it('pushes, lists, restores, and truncates redo branch revisions', async () => {
    const push1 = await fetch(revisionsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '<!doctype html><html><body><h1>v1</h1></body></html>',
        source: 'manual_edit',
        label: 'Edit 1',
      }),
    });
    expect(push1.status).toBe(200);
    const push1Json = await push1.json() as { revision: { id: string; sequence: number } };
    expect(push1Json.revision.sequence).toBeGreaterThanOrEqual(2);

    const list1 = await fetch(revisionsUrl());
    expect(list1.status).toBe(200);
    const list1Json = await list1.json() as { revisions: Array<{ sequence: number }>; headRevisionId: string };
    expect(list1Json.revisions.length).toBeGreaterThanOrEqual(2);
    expect(list1Json.headRevisionId).toBeTruthy();

    const baseline = list1Json.revisions[0]!;
    const restore = await fetch(`${revisionsUrl()}/${encodeURIComponent(baseline.id)}/restore`, {
      method: 'POST',
    });
    expect(restore.status).toBe(200);

    const raw = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/raw/deck.html`);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toContain('v0');

    const push2 = await fetch(revisionsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '<!doctype html><html><body><h1>v2</h1></body></html>',
        source: 'manual_edit',
        label: 'Edit 2',
        truncateAfterSequence: baseline.sequence,
      }),
    });
    expect(push2.status).toBe(200);

    const list2 = await fetch(revisionsUrl());
    const list2Json = await list2.json() as { revisions: Array<{ id: string; sequence: number }> };
    expect(list2Json.revisions.length).toBeGreaterThanOrEqual(2);
    expect(list2Json.revisions.some((revision) => revision.id === push1Json.revision.id)).toBe(false);
  });
});

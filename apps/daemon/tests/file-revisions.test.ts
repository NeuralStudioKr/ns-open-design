// @vitest-environment jsdom

import type http from 'node:http';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { snapshotStorageFileName } from '../src/file-revisions/snapshot-codec.js';

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
    const list1Json = await list1.json() as {
      revisions: Array<{ sequence: number }>;
      headRevisionId: string;
      retentionLimit: number;
    };
    expect(list1Json.revisions.length).toBeGreaterThanOrEqual(2);
    expect(list1Json.headRevisionId).toBeTruthy();
    expect(list1Json.retentionLimit).toBeGreaterThanOrEqual(2);

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

  it('ignores invalid artifactManifest instead of rejecting the revision push', async () => {
    const push = await fetch(revisionsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '<!doctype html><html><body><h1>manifest-soft</h1></body></html>',
        source: 'manual_edit',
        label: 'Style: Width',
        // Empty title fails validateArtifactManifestInput — previously 400'd
        // every Manual Edit autosave that echoed file.artifactManifest.
        artifactManifest: {
          kind: 'deck',
          renderer: 'deck-html',
          title: '',
          exports: ['html', 'pdf', 'pptx', 'zip'],
        },
      }),
    });
    expect(push.status).toBe(200);
    const pushJson = await push.json() as { revision: { label: string }; file: { name: string } };
    expect(pushJson.revision.label).toBe('Style: Width');
    expect(pushJson.file.name).toBe('deck.html');
  });

  it('stores gzip diff snapshots on disk and serves content through the API', async () => {
    const push = await fetch(revisionsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '<!doctype html><html><body><h1>gzip-v1</h1></body></html>',
        source: 'manual_edit',
        label: 'gzip edit',
      }),
    });
    expect(push.status).toBe(200);
    const pushJson = await push.json() as { revision: { id: string } };

    const projectsRoot = path.join(process.env.OD_DATA_DIR!, 'projects');
    const revisionDir = path.join(projectsRoot, projectId, '.od', 'revisions', 'deck.html');
    const files = await readdir(revisionDir);
    expect(files.some((file) => file === snapshotStorageFileName(pushJson.revision.id))).toBe(true);

    const contentResp = await fetch(`${revisionsUrl()}/${encodeURIComponent(pushJson.revision.id)}`);
    expect(contentResp.status).toBe(200);
    const contentJson = await contentResp.json() as { content: string };
    expect(contentJson.content).toContain('gzip-v1');
  });

  it('pushes when scratch deck.html is missing but revision snapshots exist', async () => {
    const projectsRoot = path.join(process.env.OD_DATA_DIR!, 'projects');
    const deckPath = path.join(projectsRoot, projectId, 'deck.html');
    await unlink(deckPath);

    const push = await fetch(revisionsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '<!doctype html><html><body><h1>scratch-miss</h1></body></html>',
        source: 'manual_edit',
        label: 'After scratch evict',
      }),
    });
    expect(push.status).toBe(200);
    const pushJson = await push.json() as { revision: { label: string } };
    expect(pushJson.revision.label).toBe('After scratch evict');
  });

  it('revision snapshot stays byte-identical to disk when writeProjectFile normalizes Motion UMD scripts', async () => {
    // Regression: the FE reconcile on page entry fired
    // "file was changed unexpectedly" every time because writeProjectFile
    // rewrites the vanilla Motion UMD `dist/motion.js` script tag to
    // `dist/framer-motion.js` before landing on disk, while the revision
    // snapshot was storing the pre-normalize FE bytes. On next entry
    // reconcile saw disk ≠ snapshot and locked out undo/redo with a scary
    // toast. This test pushes a Motion+React-hook body and asserts the
    // stored snapshot round-trips to the same bytes /raw serves.
    const originalHtml = [
      '<!doctype html><html><head><meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      '</head><body>',
      '<script src="https://unpkg.com/motion@11.11.9/dist/motion.js"></script>',
      '<script>',
      // Regex triggers on `Motion` global + a hook usage anywhere below.
      "const scroll = Motion.useScroll();",
      '</script>',
      '</body></html>',
    ].join('');

    const push = await fetch(revisionsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: originalHtml,
        source: 'manual_edit',
        label: 'Motion UMD normalize',
      }),
    });
    expect(push.status).toBe(200);
    const pushJson = await push.json() as { revision: { id: string } };

    const contentResp = await fetch(
      `${revisionsUrl()}/${encodeURIComponent(pushJson.revision.id)}`,
    );
    expect(contentResp.status).toBe(200);
    const contentJson = await contentResp.json() as { content: string };
    // Snapshot must reflect the normalized (framer-motion) form the daemon
    // actually wrote to disk. Prior behavior stored `dist/motion.js` here.
    expect(contentJson.content).toContain('dist/framer-motion.js');
    expect(contentJson.content).not.toContain('dist/motion.js"');

    // Bypass the /raw serve-time transforms (repairArtifactDocumentHead can
    // strip / rewrite parts of the head+body) and compare the snapshot bytes
    // directly against what landed on disk. The reconcile compare on the FE
    // side normalizes both operands, so what matters is that these two
    // starting points are byte-identical — that is exactly the invariant
    // that used to be broken.
    const projectsRoot = path.join(process.env.OD_DATA_DIR!, 'projects');
    const diskBytes = await readFile(
      path.join(projectsRoot, projectId, 'deck.html'),
      'utf8',
    );
    expect(diskBytes).toBe(contentJson.content);
  });
});

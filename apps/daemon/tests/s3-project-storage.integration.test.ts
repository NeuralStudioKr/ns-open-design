/**
 * P1-9 — live S3-compat roundtrip (MinIO / localstack).
 *
 * Skipped unless OD_S3_TEST_ENDPOINT is set.
 * Run: bash deploy/teamver/scripts/run_s3_integration_test.sh
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MaterializingProjectStorage } from '../src/storage/materializing-project-storage.js';
import { LocalProjectStorage, S3ProjectStorage } from '../src/storage/project-storage.js';

const endpoint = process.env.OD_S3_TEST_ENDPOINT?.trim();
const describeLive = endpoint ? describe : describe.skip;

function testStorage(): S3ProjectStorage {
  const bucket = process.env.OD_S3_TEST_BUCKET?.trim() || 'teamver-design-test';
  const region = process.env.OD_S3_TEST_REGION?.trim() || 'us-east-1';
  const accessKeyId = process.env.OD_S3_TEST_ACCESS_KEY_ID?.trim() || 'minioadmin';
  const secretAccessKey = process.env.OD_S3_TEST_SECRET_ACCESS_KEY?.trim() || 'minioadmin';
  const prefix = process.env.OD_S3_TEST_PREFIX?.trim() || 'integration/';
  return new S3ProjectStorage({
    bucket,
    region,
    prefix,
    ...(endpoint ? { endpoint } : {}),
    credentials: { accessKeyId, secretAccessKey },
  });
}

describeLive('S3ProjectStorage integration (MinIO / S3-compat)', () => {
  const projectId = `p-${Date.now()}`;
  let storage: S3ProjectStorage;

  beforeAll(() => {
    storage = testStorage();
  });

  it('write → read → stat → list → delete', async () => {
    const body = Buffer.from('<html>integration</html>');
    const meta = await storage.writeFile(projectId, 'pages/index.html', body);
    expect(meta.size).toBe(body.byteLength);

    await expect(storage.readFile(projectId, 'pages/index.html')).resolves.toEqual(body);

    const stat = await storage.statFile(projectId, 'pages/index.html');
    expect(stat?.size).toBe(body.byteLength);

    const listed = await storage.listFiles(projectId);
    expect(listed.map((f) => f.path)).toContain('pages/index.html');

    await storage.deleteFile(projectId, 'pages/index.html');
    await expect(storage.statFile(projectId, 'pages/index.html')).resolves.toBeNull();
  });

  it('MaterializingProjectStorage sync-down/up against S3 remote', async () => {
    const scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-s3-int-scratch-'));
    try {
      await storage.writeFile(projectId, 'remote-only.txt', Buffer.from('from-s3'));

      const materialized = new MaterializingProjectStorage(
        new LocalProjectStorage(scratchRoot),
        storage,
      );
      const remote = materialized.flatRemote();

      const down = await materialized.syncDown(projectId, remote);
      expect(down.files).toBeGreaterThanOrEqual(1);
      expect((await materialized.readFile(projectId, 'remote-only.txt')).toString('utf8')).toBe('from-s3');

      const runStart = Date.now();
      await materialized.writeFile(projectId, 'scratch-new.txt', Buffer.from('from-scratch'));
      const up = await materialized.syncUp(projectId, remote, runStart);
      expect(up.uploaded).toBeGreaterThanOrEqual(1);
      expect(up.failed).toBe(0);

      await expect(storage.readFile(projectId, 'scratch-new.txt')).resolves.toEqual(Buffer.from('from-scratch'));
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
      await storage.deleteFile(projectId, 'remote-only.txt').catch(() => undefined);
      await storage.deleteFile(projectId, 'scratch-new.txt').catch(() => undefined);
    }
  });
});

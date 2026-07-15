import { afterEach, describe, expect, it } from 'vitest';

import {
  clearExportDownloadsForTests,
  storeExportDownload,
} from '../src/export-download-store.js';
import { startServer } from '../src/server.js';

describe('GET /api/projects/:id/export/downloads/:token', () => {
  afterEach(async () => {
    await clearExportDownloadsForTests();
    delete process.env.OD_EXPORT_OFFLOAD_ENABLED;
    delete process.env.OD_EXPORT_OFFLOAD_BUCKET;
    delete process.env.OD_EXPORT_OFFLOAD_REGION;
    delete process.env.OD_EXPORT_OFFLOAD_PREFIX;
    delete process.env.OD_EXPORT_OFFLOAD_PRESIGN_TTL_SEC;
    delete process.env.OD_S3_ACCESS_KEY_ID;
    delete process.env.OD_S3_SECRET_ACCESS_KEY;
  });

  it('streams ticketed export files with Content-Disposition', async () => {
    const projectId = `proj-export-ticket-${Date.now()}`;
    const started = await startServer({
      port: 0,
      returnServer: true,
    }) as { server: { close(cb: () => void): void }; url: string };

    try {
      await fetch(`${started.url}/api/projects/${encodeURIComponent(projectId)}/files`, {
        body: JSON.stringify({
          content: '<!doctype html><p>ticket test</p>',
          name: 'index.html',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      const stored = await storeExportDownload({
        projectId,
        body: Buffer.from('%PDF-ticket-test'),
        filename: 'Seed Deck.pdf',
        mime: 'application/pdf',
      });
      expect(stored.bytes).toBe(Buffer.byteLength('%PDF-ticket-test'));

      const response = await fetch(`${started.url}${stored.url}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/pdf');
      expect(response.headers.get('content-disposition')).toContain('Seed Deck.pdf');
      expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength('%PDF-ticket-test')));
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('x-od-export-delivery-mode')).toBe('stream');
      expect(response.headers.get('x-od-export-single-use')).toBe('true');
      expect(await response.text()).toBe('%PDF-ticket-test');

      const expired = await fetch(`${started.url}${stored.url}`);
      expect(expired.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => started.server.close(resolve));
    }
  }, 60_000);

  it('rejects downloads for other projects', async () => {
    const projectId = `proj-export-ticket-${Date.now()}`;
    const started = await startServer({
      port: 0,
      returnServer: true,
    }) as { server: { close(cb: () => void): void }; url: string };

    try {
      const stored = await storeExportDownload({
        projectId,
        body: 'html',
        filename: 'artifact.html',
        mime: 'text/html',
      });

      const response = await fetch(
        `${started.url}/api/projects/other-project/export/downloads/${stored.token}`,
      );
      expect(response.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => started.server.close(resolve));
    }
  }, 60_000);

  it('redirects ticketed offload downloads to a single-use presigned GET URL', async () => {
    process.env.OD_EXPORT_OFFLOAD_ENABLED = '1';
    process.env.OD_EXPORT_OFFLOAD_BUCKET = 'teamver-design-data';
    process.env.OD_EXPORT_OFFLOAD_REGION = 'ap-northeast-2';
    process.env.OD_EXPORT_OFFLOAD_PREFIX = 'teamver';
    process.env.OD_EXPORT_OFFLOAD_PRESIGN_TTL_SEC = '120';
    process.env.OD_S3_ACCESS_KEY_ID = 'AKTEST';
    process.env.OD_S3_SECRET_ACCESS_KEY = 'secret';

    const projectId = `proj-export-ticket-${Date.now()}`;
    const started = await startServer({
      port: 0,
      returnServer: true,
    }) as { server: { close(cb: () => void): void }; url: string };

    try {
      const stored = await storeExportDownload({
        projectId,
        body: Buffer.from('%PDF-ticket-test'),
        filename: 'Seed Deck.pdf',
        mime: 'application/pdf',
        deliveryMode: 'redirect',
        offloadKey: 'exports/ws/proj/hash.pdf',
      });

      const response = await fetch(`${started.url}${stored.url}`, { redirect: 'manual' });
      expect(response.status).toBe(302);
      expect(response.headers.get('x-od-export-delivery-mode')).toBe('redirect');
      expect(response.headers.get('x-od-export-single-use')).toBe('true');
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      const url = new URL(location!);
      expect(url.origin).toBe('https://teamver-design-data.s3.ap-northeast-2.amazonaws.com');
      expect(url.pathname).toBe('/teamver/exports/ws/proj/hash.pdf');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
      expect(url.searchParams.get('response-content-disposition')).toContain('Seed Deck.pdf');
      expect(url.searchParams.get('response-content-type')).toBe('application/pdf');

      const expired = await fetch(`${started.url}${stored.url}`, { redirect: 'manual' });
      expect(expired.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => started.server.close(resolve));
    }
  }, 60_000);
});

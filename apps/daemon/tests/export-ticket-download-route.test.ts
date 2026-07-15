import { afterEach, describe, expect, it } from 'vitest';

import {
  clearExportDownloadsForTests,
  storeExportDownload,
} from '../src/export-download-store.js';
import { startServer } from '../src/server.js';

describe('GET /api/projects/:id/export/downloads/:token', () => {
  afterEach(async () => {
    await clearExportDownloadsForTests();
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
  });

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
  });
});

import fs from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  claimExportDownload,
  clearExportDownloadsForTests,
  completeExportDownload,
  releaseExportDownloadClaim,
  resolveExportDownload,
  storeExportDownload,
  wantsTicketDelivery,
} from '../src/export-download-store.js';

describe('export download store', () => {
  afterEach(async () => {
    await clearExportDownloadsForTests();
    delete process.env.OD_EXPORT_TICKET_TTL_SEC;
  });

  it('detects ticket delivery requests', () => {
    expect(wantsTicketDelivery({ delivery: 'ticket' })).toBe(true);
    expect(wantsTicketDelivery({ delivery: 'inline' })).toBe(false);
    expect(wantsTicketDelivery(null)).toBe(false);
  });

  it('stores and resolves export downloads by project and token', async () => {
    const stored = await storeExportDownload({
      projectId: 'proj-1',
      body: Buffer.from('pdf-bytes'),
      filename: 'Seed Deck.pdf',
      mime: 'application/pdf',
    });

    expect(stored.url).toBe('/api/projects/proj-1/export/downloads/' + stored.token);
    const resolved = resolveExportDownload('proj-1', stored.token);
    expect(resolved?.filename).toBe('Seed Deck.pdf');
    expect(resolved?.mime).toBe('application/pdf');
    await expect(fs.readFile(resolved!.filePath)).resolves.toEqual(Buffer.from('pdf-bytes'));
  });

  it('rejects tokens for other projects', async () => {
    const stored = await storeExportDownload({
      projectId: 'proj-1',
      body: 'html',
      filename: 'artifact.html',
      mime: 'text/html',
    });
    expect(resolveExportDownload('proj-2', stored.token)).toBeNull();
  });

  it('claims tickets exclusively and completes them after download', async () => {
    const stored = await storeExportDownload({
      projectId: 'proj-1',
      body: 'pdf-bytes',
      filename: 'deck.pdf',
      mime: 'application/pdf',
    });
    const claimed = claimExportDownload('proj-1', stored.token);
    expect(claimed?.filename).toBe('deck.pdf');
    expect(claimExportDownload('proj-1', stored.token)).toBeNull();
    releaseExportDownloadClaim(stored.token);
    expect(claimExportDownload('proj-1', stored.token)?.filename).toBe('deck.pdf');
    await completeExportDownload(stored.token);
    expect(resolveExportDownload('proj-1', stored.token)).toBeNull();
  });

  it('rejects malformed ticket tokens', async () => {
    const stored = await storeExportDownload({
      projectId: 'proj-1',
      body: 'html',
      filename: 'artifact.html',
      mime: 'text/html',
    });
    expect(claimExportDownload('proj-1', `${stored.token}-oops`)).toBeNull();
  });

  it('expires tickets after OD_EXPORT_TICKET_TTL_SEC', async () => {
    vi.useFakeTimers();
    process.env.OD_EXPORT_TICKET_TTL_SEC = '30';
    try {
      const stored = await storeExportDownload({
        projectId: 'proj-1',
        body: 'html',
        filename: 'artifact.html',
        mime: 'text/html',
      });
      expect(resolveExportDownload('proj-1', stored.token)).not.toBeNull();
      vi.advanceTimersByTime(31_000);
      expect(resolveExportDownload('proj-1', stored.token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

import { afterEach, describe, expect, it } from 'vitest';

import { runExportJobInBackground, type ExportJobRenderers } from '../src/export-job-runner.js';
import {
  clearExportJobsForTests,
  createExportJob,
  resolveExportJob,
} from '../src/export-job-store.js';
import { DeckSlideCountLimitError } from '../src/headless-export.js';
import type { ExportCacheOutcome } from '../src/export-cache-runtime.js';

function htmlOutcome(): ExportCacheOutcome {
  return {
    cache: 'miss',
    key: 'cache-key-html',
    body: Buffer.from('<!doctype html><p>deck</p>'),
    filename: 'Deck.html',
    mime: 'text/html; charset=utf-8',
    bytes: 26,
  };
}

function testRenderers(overrides: Partial<ExportJobRenderers> = {}): ExportJobRenderers {
  const unsupported = async (): Promise<never> => {
    throw new Error('unexpected renderer call');
  };
  return {
    pdf: unsupported,
    html: async () => htmlOutcome(),
    zip: unsupported,
    image: unsupported,
    pptx: unsupported,
    ...overrides,
  };
}

describe('export job runner', () => {
  afterEach(() => {
    clearExportJobsForTests();
  });

  it('renders, stores a download ticket, and marks the job ready', async () => {
    const job = createExportJob({ projectId: 'proj-1', format: 'html' });

    await runExportJobInBackground({
      request: {
        jobId: job.id,
        projectId: 'proj-1',
        workspaceId: 'workspace-1',
        format: 'html',
        fileName: 'deck.html',
        deck: true,
      },
      deps: {
        renderContext: (projectId) => ({
          daemonUrl: 'http://127.0.0.1:7456',
          projectId,
          projectsRoot: '/tmp/projects',
        }),
        prepareOffloadPayload: async () => ({
          offloadEnabled: true,
          offloadKey: 'exports/workspace-1/proj-1/cache-key-html.html',
          offloadStatus: 'uploaded',
        }),
        renderers: testRenderers(),
        storeDownload: async (options) => ({
          token: '0123456789abcdef0123456789abcdef',
          url: '/api/projects/proj-1/export/downloads/0123456789abcdef0123456789abcdef',
          deliveryMode: options.deliveryMode === 'redirect' ? 'redirect' : 'stream',
          filename: options.filename,
          mime: options.mime,
          bytes: options.bytes ?? 0,
          expiresAt: 1_800_000_000_000,
          filePath: '/tmp/download.html',
          ...(options.offloadKey ? { offloadKey: options.offloadKey } : {}),
          ...(options.offloadStatus ? { offloadStatus: options.offloadStatus } : {}),
        }),
      },
    });

    const snapshot = resolveExportJob('proj-1', job.id);
    expect(snapshot?.status).toBe('ready');
    expect(snapshot?.result).toMatchObject({
      cache: 'miss',
      deliveryMode: 'redirect',
      downloadUrl: '/api/projects/proj-1/export/downloads/0123456789abcdef0123456789abcdef',
      filename: 'Deck.html',
      mime: 'text/html; charset=utf-8',
      offloadStatus: 'uploaded',
    });
  });

  it('maps oversized PPTX deck errors to EXPORT_DECK_TOO_LARGE', async () => {
    const job = createExportJob({ projectId: 'proj-1', format: 'pptx' });

    await runExportJobInBackground({
      request: {
        jobId: job.id,
        projectId: 'proj-1',
        workspaceId: null,
        format: 'pptx',
        fileName: 'deck.html',
        deck: true,
      },
      deps: {
        renderContext: (projectId) => ({
          daemonUrl: 'http://127.0.0.1:7456',
          projectId,
          projectsRoot: '/tmp/projects',
        }),
        prepareOffloadPayload: async () => ({}),
        renderers: testRenderers({
          pptx: async () => {
            throw new DeckSlideCountLimitError(41, 40);
          },
        }),
        logger: { warn: () => undefined },
      },
    });

    const snapshot = resolveExportJob('proj-1', job.id);
    expect(snapshot?.status).toBe('failed');
    expect(snapshot?.error).toMatchObject({
      code: 'EXPORT_DECK_TOO_LARGE',
      message: 'PPTX export supports up to 40 slides; this deck has 41. Use PDF download for this large deck.',
    });
  });

  it('does not render when the job cannot be marked running', async () => {
    let renderCalls = 0;

    await runExportJobInBackground({
      request: {
        jobId: '0123456789abcdef0123456789abcdef',
        projectId: 'proj-1',
        workspaceId: null,
        format: 'html',
        fileName: 'deck.html',
        deck: true,
      },
      deps: {
        renderContext: (projectId) => ({
          daemonUrl: 'http://127.0.0.1:7456',
          projectId,
          projectsRoot: '/tmp/projects',
        }),
        prepareOffloadPayload: async () => ({}),
        renderers: testRenderers({
          html: async () => {
            renderCalls += 1;
            return htmlOutcome();
          },
        }),
        logger: { warn: () => undefined },
      },
    });

    expect(renderCalls).toBe(0);
  });
});

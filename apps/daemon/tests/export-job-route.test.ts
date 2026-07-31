import { afterEach, describe, expect, it } from 'vitest';

import { clearExportJobsForTests } from '../src/export-job-store.js';
import { startServer } from '../src/server.js';

type StartedServer = {
  server: { close(cb: () => void): void };
  url: string;
};

async function closeServer(started: StartedServer): Promise<void> {
  await new Promise<void>((resolve) => started.server.close(resolve));
}

describe('export job routes', () => {
  afterEach(() => {
    clearExportJobsForTests();
    delete process.env.OD_EXPORT_ASYNC_JOBS_ENABLED;
  });

  it('keeps async export jobs disabled by default', async () => {
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    try {
      const response = await fetch(`${started.url}/api/projects/proj-1/export/jobs`, {
        body: JSON.stringify({
          deck: true,
          fileName: 'deck.html',
          format: 'html',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      expect(response.status).toBe(404);
      const body = await response.json() as { error?: { code?: string } };
      expect(body.error?.code).toBe('EXPORT_JOBS_DISABLED');
    } finally {
      await closeServer(started);
    }
  }, 60_000);

  it('validates async export job format before enqueueing work', async () => {
    process.env.OD_EXPORT_ASYNC_JOBS_ENABLED = '1';
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    try {
      const response = await fetch(`${started.url}/api/projects/proj-1/export/jobs`, {
        body: JSON.stringify({
          deck: true,
          fileName: 'deck.html',
          format: 'video',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      expect(response.status).toBe(400);
      const body = await response.json() as { error?: { code?: string; message?: string } };
      expect(body.error?.code).toBe('BAD_REQUEST');
      expect(body.error?.message).toContain('format must be pdf');
    } finally {
      await closeServer(started);
    }
  }, 60_000);

  it('rejects PPTX async jobs when the request is not a deck', async () => {
    process.env.OD_EXPORT_ASYNC_JOBS_ENABLED = '1';
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    try {
      const response = await fetch(`${started.url}/api/projects/proj-1/export/jobs`, {
        body: JSON.stringify({
          deck: false,
          fileName: 'page.html',
          format: 'pptx',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      expect(response.status).toBe(422);
      const body = await response.json() as { error?: { code?: string } };
      expect(body.error?.code).toBe('NO_SLIDES');
    } finally {
      await closeServer(started);
    }
  }, 60_000);
});

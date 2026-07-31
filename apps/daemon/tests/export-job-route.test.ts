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

      const eventsResponse = await fetch(`${started.url}/api/projects/proj-1/export/jobs/0123456789abcdef0123456789abcdef/events`);
      expect(eventsResponse.status).toBe(404);
      const eventsBody = await eventsResponse.json() as { error?: { code?: string } };
      expect(eventsBody.error?.code).toBe('EXPORT_JOBS_DISABLED');
    } finally {
      await closeServer(started);
    }
  }, 60_000);

  it('returns polling and SSE URLs when an async export job is accepted', async () => {
    process.env.OD_EXPORT_ASYNC_JOBS_ENABLED = '1';
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    try {
      const response = await fetch(`${started.url}/api/projects/proj-1/export/jobs`, {
        body: JSON.stringify({
          deck: true,
          fileName: 'deck.html',
          format: 'html',
          inlineHtml: '<!doctype html><p>hello</p>',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      expect(response.status).toBe(202);
      const body = await response.json() as {
        eventsUrl?: string;
        format?: string;
        jobId?: string;
        status?: string;
        statusUrl?: string;
      };
      expect(body.status).toBe('queued');
      expect(body.format).toBe('html');
      expect(body.jobId).toMatch(/^[a-f0-9]{32}$/);
      expect(body.statusUrl).toBe(`/api/projects/proj-1/export/jobs/${body.jobId}`);
      expect(body.eventsUrl).toBe(`/api/projects/proj-1/export/jobs/${body.jobId}/events`);
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

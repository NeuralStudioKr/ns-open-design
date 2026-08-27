import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderExportJobWithRemoteWorkerFallback } from '../src/export-remote-worker.js';
import type { ExportJobRenderers, ExportJobRunnerRequest } from '../src/export-job-runner.js';
import type { ExportCacheOutcome } from '../src/export-cache-runtime.js';

const ENV_KEYS = [
  'OD_EXPORT_WORKER_BASE_URL',
  'OD_EXPORT_WORKER_TOKEN',
  'OD_API_TOKEN',
  'OD_EXPORT_WORKER_TIMEOUT_MS',
  'OD_EXPORT_WORKER_FALLBACK_ENABLED',
] as const;

const previousEnv = new Map<string, string | undefined>();

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

function request(): ExportJobRunnerRequest {
  return {
    jobId: '0123456789abcdef0123456789abcdef',
    projectId: 'proj-1',
    workspaceId: null,
    format: 'html',
    fileName: 'deck.html',
    deck: true,
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

describe('remote export worker renderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      const previous = previousEnv.get(key);
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
    previousEnv.clear();
  });

  function setEnv(next: Record<string, string>): void {
    for (const key of ENV_KEYS) {
      if (!previousEnv.has(key)) previousEnv.set(key, process.env[key]);
    }
    Object.assign(process.env, next);
  }

  it('falls back to in-process rendering when the worker is unavailable', async () => {
    setEnv({
      OD_EXPORT_WORKER_BASE_URL: 'http://export-worker:7460',
      OD_API_TOKEN: 'token',
    });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    }));

    const outcome = await renderExportJobWithRemoteWorkerFallback(request(), {
      renderContext: (projectId) => ({
        daemonUrl: 'http://open-design-daemon:7456',
        projectId,
        projectsRoot: '/tmp/projects',
      }),
      prepareOffloadPayload: async () => ({}),
      renderers: testRenderers(),
    });

    expect(outcome).toMatchObject({
      cache: 'miss',
      filename: 'Deck.html',
      mime: 'text/html; charset=utf-8',
    });
  });

  it('preserves remote render error codes without falling back', async () => {
    setEnv({
      OD_EXPORT_WORKER_BASE_URL: 'http://export-worker:7460',
      OD_API_TOKEN: 'token',
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: {
        code: 'EXPORT_DECK_TOO_LARGE',
        name: 'DeckSlideCountLimitError',
        message: 'PPTX export supports up to 40 slides; this deck has 41.',
      },
    }), { status: 500 })));

    await expect(renderExportJobWithRemoteWorkerFallback(request(), {
      renderContext: (projectId) => ({
        daemonUrl: 'http://open-design-daemon:7456',
        projectId,
        projectsRoot: '/tmp/projects',
      }),
      prepareOffloadPayload: async () => ({}),
      renderers: testRenderers({
        html: async () => {
          throw new Error('fallback renderer should not be called');
        },
      }),
    })).rejects.toMatchObject({
      code: 'EXPORT_DECK_TOO_LARGE',
      message: 'PPTX export supports up to 40 slides; this deck has 41.',
    });
  });

  it('falls back when the worker returns a non-json availability error', async () => {
    setEnv({
      OD_EXPORT_WORKER_BASE_URL: 'http://export-worker:7460',
      OD_API_TOKEN: 'token',
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    })));

    const outcome = await renderExportJobWithRemoteWorkerFallback(request(), {
      renderContext: (projectId) => ({
        daemonUrl: 'http://open-design-daemon:7456',
        projectId,
        projectsRoot: '/tmp/projects',
      }),
      prepareOffloadPayload: async () => ({}),
      renderers: testRenderers(),
    });

    expect(outcome).toMatchObject({
      cache: 'miss',
      filename: 'Deck.html',
    });
  });

  it('does not hide worker auth failures behind fallback rendering', async () => {
    setEnv({
      OD_EXPORT_WORKER_BASE_URL: 'http://export-worker:7460',
      OD_API_TOKEN: 'token',
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: { message: 'unauthorized' },
    }), { status: 401 })));

    await expect(renderExportJobWithRemoteWorkerFallback(request(), {
      renderContext: (projectId) => ({
        daemonUrl: 'http://open-design-daemon:7456',
        projectId,
        projectsRoot: '/tmp/projects',
      }),
      prepareOffloadPayload: async () => ({}),
      renderers: testRenderers({
        html: async () => {
          throw new Error('fallback renderer should not be called');
        },
      }),
    })).rejects.toMatchObject({
      code: 'EXPORT_WORKER_UNAUTHORIZED',
      message: 'unauthorized',
    });
  });
});

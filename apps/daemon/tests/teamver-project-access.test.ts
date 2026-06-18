import type http from 'node:http';
import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

function findProjectAccessMarker(spy: ReturnType<typeof vi.spyOn>, reason: string) {
  for (const call of spy.mock.calls) {
    const arg = call[0];
    if (typeof arg !== 'string') continue;
    try {
      const parsed = JSON.parse(arg) as Record<string, unknown>;
      if (parsed.metric === 'teamver_project_access_5xx' && parsed.reason === reason) {
        return parsed;
      }
    } catch {
      // ignore non-JSON warns
    }
  }
  return null;
}

type AccessRequest = {
  url: string | undefined;
  userId: string | undefined;
  workspaceId: string | undefined;
};

describe('Teamver project access gate', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalDesignApiUrl: string | undefined;
  let originalTimeoutMs: string | undefined;

  beforeAll(async () => {
    originalDesignApiUrl = process.env.TEAMVER_DESIGN_API_URL;
    originalTimeoutMs = process.env.TEAMVER_PROJECT_ACCESS_TIMEOUT_MS;
    delete process.env.TEAMVER_DESIGN_API_URL;
    delete process.env.TEAMVER_PROJECT_ACCESS_TIMEOUT_MS;

    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    if (originalDesignApiUrl === undefined) delete process.env.TEAMVER_DESIGN_API_URL;
    else process.env.TEAMVER_DESIGN_API_URL = originalDesignApiUrl;
    if (originalTimeoutMs === undefined) delete process.env.TEAMVER_PROJECT_ACCESS_TIMEOUT_MS;
    else process.env.TEAMVER_PROJECT_ACCESS_TIMEOUT_MS = originalTimeoutMs;
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createProject(id: string) {
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: id, skillId: null, designSystemId: null }),
    });
    expect(response.status).toBe(200);
  }

  async function withAccessServer(
    status: number,
    fn: (url: string, requests: AccessRequest[]) => Promise<void>,
  ) {
    const requests: AccessRequest[] = [];
    const accessServer = createServer((req, res) => {
      requests.push({
        url: req.url,
        userId: req.headers['x-teamver-user-id'] as string | undefined,
        workspaceId: req.headers['x-teamver-workspace-id'] as string | undefined,
      });
      res.writeHead(status);
      res.end();
    });
    await new Promise<void>((resolve) => accessServer.listen(0, '127.0.0.1', resolve));
    const address = accessServer.address();
    if (!address || typeof address === 'string') throw new Error('missing access server address');
    try {
      await fn(`http://127.0.0.1:${address.port}`, requests);
    } finally {
      await new Promise<void>((resolve) => accessServer.close(() => resolve()));
    }
  }

  it('keeps default OD project routes open when the Teamver gate is not configured', async () => {
    const projectId = `od-default-access-${Date.now()}`;
    await createProject(projectId);

    const detailResponse = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResponse.status).toBe(200);
    const detailBody = (await detailResponse.json()) as { project?: { id?: string } };
    expect(detailBody.project?.id).toBe(projectId);

    const filesResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
    expect(filesResponse.status).toBe(200);
    const filesBody = (await filesResponse.json()) as { files?: unknown[] };
    expect(Array.isArray(filesBody.files)).toBe(true);
  });

  it('allows project detail when design-api grants access', async () => {
    const projectId = `teamver-access-allow-${Date.now()}`;
    await createProject(projectId);

    await withAccessServer(204, async (url, requests) => {
      process.env.TEAMVER_DESIGN_API_URL = url;
      const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: {
          'X-Teamver-User-Id': 'user-1',
          'X-Teamver-Workspace-Id': 'workspace-1',
        },
      });
      expect(response.status).toBe(200);
      expect(requests).toEqual([
        {
          url: `/api/v1/projects/${encodeURIComponent(projectId)}/access`,
          userId: 'user-1',
          workspaceId: 'workspace-1',
        },
      ]);
    });
  });

  it('reuses cached access checks for subsequent project subroutes', async () => {
    const projectId = `teamver-access-cache-${Date.now()}`;
    await createProject(projectId);

    await withAccessServer(204, async (url, requests) => {
      process.env.TEAMVER_DESIGN_API_URL = url;
      const headers = {
        'X-Teamver-User-Id': 'user-cache',
        'X-Teamver-Workspace-Id': 'workspace-cache',
      };
      const detailResponse = await fetch(`${baseUrl}/api/projects/${projectId}`, { headers });
      expect(detailResponse.status).toBe(200);
      const filesResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files`, { headers });
      expect(filesResponse.status).toBe(200);
      expect(requests).toHaveLength(1);
    });
  });

  it('requires Teamver identity headers when the gate is configured', async () => {
    const projectId = `teamver-access-headers-${Date.now()}`;
    await createProject(projectId);

    await withAccessServer(204, async (url, requests) => {
      process.env.TEAMVER_DESIGN_API_URL = url;
      const response = await fetch(`${baseUrl}/api/projects/${projectId}`);
      expect(response.status).toBe(401);
      expect(requests).toEqual([]);
    });
  });

  it('hides projects when design-api denies access', async () => {
    const projectId = `teamver-access-deny-${Date.now()}`;
    await createProject(projectId);

    await withAccessServer(403, async (url) => {
      process.env.TEAMVER_DESIGN_API_URL = url;
      const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: {
          'X-Teamver-User-Id': 'user-2',
          'X-Teamver-Workspace-Id': 'workspace-2',
        },
      });
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('PROJECT_NOT_FOUND');
    });
  });

  it('emits structured teamver_project_access_5xx marker on upstream 5xx → 502', async () => {
    const projectId = `teamver-access-5xx-${Date.now()}`;
    await createProject(projectId);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await withAccessServer(503, async (url) => {
        process.env.TEAMVER_DESIGN_API_URL = url;
        const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
          headers: {
            'X-Teamver-User-Id': 'user-3',
            'X-Teamver-Workspace-Id': 'workspace-3',
          },
        });
        expect(response.status).toBe(502);
        const body = (await response.json()) as { error?: { code?: string } };
        expect(body.error?.code).toBe('UPSTREAM_UNAVAILABLE');
      });

      const marker = findProjectAccessMarker(warnSpy, 'http_5xx');
      expect(marker).not.toBeNull();
      expect(marker).toMatchObject({
        metric: 'teamver_project_access_5xx',
        reason: 'http_5xx',
        projectId,
        workspaceId: 'workspace-3',
        httpStatus: 503,
      });
      expect(typeof marker?.elapsedMs).toBe('number');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('emits timeout marker when design-api hangs past the configured budget', async () => {
    const projectId = `teamver-access-timeout-${Date.now()}`;
    await createProject(projectId);

    process.env.TEAMVER_PROJECT_ACCESS_TIMEOUT_MS = '50';

    // Slow access server that never responds — forces AbortSignal.timeout.
    const slowRequests: Array<{ socket: import('node:net').Socket }> = [];
    const slowServer = createServer((req) => {
      slowRequests.push({ socket: req.socket });
      // intentionally do not call res.writeHead / res.end
    });
    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', resolve));
    const address = slowServer.address();
    if (!address || typeof address === 'string') throw new Error('no slow address');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      process.env.TEAMVER_DESIGN_API_URL = `http://127.0.0.1:${address.port}`;
      const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: {
          'X-Teamver-User-Id': 'user-4',
          'X-Teamver-Workspace-Id': 'workspace-4',
        },
      });
      expect(response.status).toBe(502);
      const body = (await response.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('UPSTREAM_UNAVAILABLE');

      const marker = findProjectAccessMarker(warnSpy, 'timeout');
      expect(marker).not.toBeNull();
      expect(marker).toMatchObject({
        metric: 'teamver_project_access_5xx',
        reason: 'timeout',
        projectId,
        workspaceId: 'workspace-4',
        timeoutMs: 50,
      });
      expect(typeof marker?.elapsedMs).toBe('number');
    } finally {
      warnSpy.mockRestore();
      // Force-close any hung sockets so the slow server can close cleanly.
      for (const r of slowRequests) {
        r.socket.destroy();
      }
      await new Promise<void>((resolve) => slowServer.close(() => resolve()));
    }
  });

  it('emits network marker when design-api host is unreachable', async () => {
    const projectId = `teamver-access-network-${Date.now()}`;
    await createProject(projectId);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Port 1 is reserved (tcpmux); on most hosts ECONNREFUSED is immediate.
      process.env.TEAMVER_DESIGN_API_URL = 'http://127.0.0.1:1';
      const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: {
          'X-Teamver-User-Id': 'user-5',
          'X-Teamver-Workspace-Id': 'workspace-5',
        },
      });
      expect(response.status).toBe(502);

      // Either ECONNREFUSED → 'network' or AbortSignal triggered → 'timeout'.
      const marker =
        findProjectAccessMarker(warnSpy, 'network') ??
        findProjectAccessMarker(warnSpy, 'timeout');
      expect(marker).not.toBeNull();
      expect(marker).toMatchObject({
        metric: 'teamver_project_access_5xx',
        projectId,
        workspaceId: 'workspace-5',
      });
      expect(typeof marker?.error).toBe('string');
    } finally {
      warnSpy.mockRestore();
    }
  });
});

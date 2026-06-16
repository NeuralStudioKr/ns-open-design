import type http from 'node:http';
import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

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
});

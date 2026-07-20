import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('Teamver design BFF proxy', () => {
  let daemonServer: ReturnType<typeof createServer>;
  let daemonBaseUrl: string;
  let upstreamServer: ReturnType<typeof createServer>;
  let upstreamBaseUrl: string;
  let originalDesignApiUrl: string | undefined;
  const upstreamRequests: Array<{ method?: string; url?: string; headers: Record<string, string | string[] | undefined> }> = [];

  beforeAll(async () => {
    originalDesignApiUrl = process.env.TEAMVER_DESIGN_API_URL;

    upstreamServer = createServer((req, res) => {
      upstreamRequests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
      });
      if (req.url === '/api/v1/auth/session') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authenticated: true, workspaces: [] }));
        return;
      }
      if (req.url === '/api/v1/projects') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ projects: [{ odProjectId: 'proj-1' }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve));
    const upstreamAddress = upstreamServer.address() as AddressInfo;
    upstreamBaseUrl = `http://127.0.0.1:${upstreamAddress.port}`;
    process.env.TEAMVER_DESIGN_API_URL = upstreamBaseUrl;

    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: ReturnType<typeof createServer>;
    };
    daemonBaseUrl = started.url;
    daemonServer = started.server;
  });

  afterEach(() => {
    upstreamRequests.length = 0;
  });

  afterAll(async () => {
    if (originalDesignApiUrl === undefined) delete process.env.TEAMVER_DESIGN_API_URL;
    else process.env.TEAMVER_DESIGN_API_URL = originalDesignApiUrl;

    await new Promise<void>((resolve) => daemonServer.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  });

  it('proxies /teamver-bff/auth/session to design-api', async () => {
    const response = await fetch(`${daemonBaseUrl}/teamver-bff/auth/session`, {
      headers: { Cookie: 'session=test', Accept: 'application/json' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { authenticated?: boolean };
    expect(body.authenticated).toBe(true);
    expect(upstreamRequests[0]?.url).toBe('/api/v1/auth/session');
    expect(upstreamRequests[0]?.headers.cookie).toBe('session=test');
  });

  it('forwards teamver identity headers for /teamver-bff/projects', async () => {
    const response = await fetch(`${daemonBaseUrl}/teamver-bff/projects`, {
      headers: {
        Accept: 'application/json',
        'X-Teamver-User-Id': 'user-1',
        'X-Teamver-Workspace-Id': 'workspace-1',
        'X-Workspace-Id': 'workspace-1',
      },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { projects?: Array<{ odProjectId?: string }> };
    expect(body.projects?.[0]?.odProjectId).toBe('proj-1');
    expect(upstreamRequests[0]?.url).toBe('/api/v1/projects');
    expect(upstreamRequests[0]?.headers['x-teamver-user-id']).toBe('user-1');
    expect(upstreamRequests[0]?.headers['x-teamver-workspace-id']).toBe('workspace-1');
  });

  it('strips trailing slash so /teamver-bff/projects/ does not 307 via /api/v1/projects/', async () => {
    const response = await fetch(`${daemonBaseUrl}/teamver-bff/projects/`, {
      headers: {
        Accept: 'application/json',
        'X-Teamver-User-Id': 'user-1',
        'X-Teamver-Workspace-Id': 'workspace-1',
      },
    });
    expect(response.status).toBe(200);
    expect(upstreamRequests[0]?.url).toBe('/api/v1/projects');
  });
});

import type http from 'node:http';
import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { fetchTeamverRegistryProjectDetail } from '../src/teamver-project-sqlite-hydrate.js';

describe('teamver project sqlite hydrate', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalDesignApiUrl: string | undefined;

  beforeAll(async () => {
    originalDesignApiUrl = process.env.TEAMVER_DESIGN_API_URL;
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
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/projects/:id hydrates sqlite from design-api when row is missing locally', async () => {
    const projectId = `teamver-hydrate-${Date.now()}`;
    const designServer = createServer((req, res) => {
      if (req.url === `/api/v1/projects/${encodeURIComponent(projectId)}/access`) {
        res.writeHead(204, { 'X-Teamver-S3-Prefix': `design/ws/ws-1/user/u-1/proj_${projectId}/` });
        res.end();
        return;
      }
      if (req.url === `/api/v1/projects/${encodeURIComponent(projectId)}`) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            odProjectId: projectId,
            title: 'Hydrated From Registry',
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => designServer.listen(0, '127.0.0.1', resolve));
    const address = designServer.address();
    if (!address || typeof address === 'string') throw new Error('missing design-api address');

    process.env.TEAMVER_DESIGN_API_URL = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: {
          'X-Teamver-User-Id': 'user-hydrate',
          'X-Teamver-Workspace-Id': 'workspace-hydrate',
        },
      });
      const rawBody = await response.text();
      if (response.status !== 200) {
        throw new Error(`expected 200 got ${response.status}: ${rawBody}`);
      }
      const body = JSON.parse(rawBody) as { project?: { id?: string; name?: string } };
      expect(body.project?.id).toBe(projectId);
      expect(body.project?.name).toBe('Hydrated From Registry');
    } finally {
      await new Promise<void>((resolve) => designServer.close(() => resolve()));
    }
  });

  it('fetchTeamverRegistryProjectDetail returns null on upstream 404', async () => {
    const designServer = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => designServer.listen(0, '127.0.0.1', resolve));
    const address = designServer.address();
    if (!address || typeof address === 'string') throw new Error('missing design-api address');
    process.env.TEAMVER_DESIGN_API_URL = `http://127.0.0.1:${address.port}`;

    try {
      const detail = await fetchTeamverRegistryProjectDetail('missing-project', {
        userId: 'u1',
        workspaceId: 'ws1',
      });
      expect(detail).toBeNull();
    } finally {
      await new Promise<void>((resolve) => designServer.close(() => resolve()));
    }
  });
});

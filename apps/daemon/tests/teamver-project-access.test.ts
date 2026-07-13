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
    options?: { s3Prefix?: string },
  ) {
    const requests: AccessRequest[] = [];
    const accessServer = createServer((req, res) => {
      requests.push({
        url: req.url,
        userId: req.headers['x-teamver-user-id'] as string | undefined,
        workspaceId: req.headers['x-teamver-workspace-id'] as string | undefined,
      });
      const prefix = options?.s3Prefix?.trim();
      if (status === 204 && prefix) {
        res.writeHead(204, { 'X-Teamver-S3-Prefix': prefix });
      } else {
        res.writeHead(status);
      }
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

    await withAccessServer(
      204,
      async (url, requests) => {
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
    },
      { s3Prefix: `design/ws_workspace-cache/user_user-cache/proj_${projectId}/` },
    );
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

  it('rejects trusted OD bearer without identity on non-preview project routes', async () => {
    const projectId = `teamver-access-trusted-bearer-${Date.now()}`;
    await createProject(projectId);
    const previousToken = process.env.OD_API_TOKEN;
    const token = `trusted-preview-${Date.now()}`;
    process.env.OD_API_TOKEN = token;

    try {
      await withAccessServer(204, async (url, requests) => {
        process.env.TEAMVER_DESIGN_API_URL = url;
        const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(response.status).toBe(401);
        const body = (await response.json()) as { error?: { message?: string } };
        expect(body.error?.message).toMatch(/identity headers required/i);
        expect(requests).toEqual([]);
      });
    } finally {
      if (previousToken === undefined) delete process.env.OD_API_TOKEN;
      else process.env.OD_API_TOKEN = previousToken;
    }
  });

  it('does not treat query-string preview text as a trusted preview asset', async () => {
    const projectId = `teamver-access-preview-query-${Date.now()}`;
    await createProject(projectId);
    const previousToken = process.env.OD_API_TOKEN;
    const token = `trusted-preview-query-${Date.now()}`;
    process.env.OD_API_TOKEN = token;

    try {
      await withAccessServer(204, async (url, requests) => {
        process.env.TEAMVER_DESIGN_API_URL = url;
        const response = await fetch(
          `${baseUrl}/api/projects/${projectId}/files?next=/preview/not-a-scope/index.html`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        expect(response.status).toBe(401);
        const body = (await response.json()) as { error?: { message?: string } };
        expect(body.error?.message).toMatch(/identity headers required/i);
        expect(requests).toEqual([]);
      });
    } finally {
      if (previousToken === undefined) delete process.env.OD_API_TOKEN;
      else process.env.OD_API_TOKEN = previousToken;
    }
  });

  it('allows trusted OD bearer without identity on GET preview assets', async () => {
    const projectId = `teamver-access-trusted-preview-${Date.now()}`;
    await createProject(projectId);
    const previousToken = process.env.OD_API_TOKEN;
    const token = `trusted-preview-asset-${Date.now()}`;
    process.env.OD_API_TOKEN = token;

    try {
      await withAccessServer(204, async (url, requests) => {
        process.env.TEAMVER_DESIGN_API_URL = url;
        // Invalid scope → 404 from the preview route, not identity 401 from the gate.
        const response = await fetch(
          `${baseUrl}/api/projects/${projectId}/preview/not-a-real-scope/index.html`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        expect(response.status).not.toBe(401);
        const body = (await response.json()) as { error?: { message?: string; code?: string } };
        expect(body.error?.message ?? '').not.toMatch(/identity headers required/i);
        expect(requests).toEqual([]);
      });
    } finally {
      if (previousToken === undefined) delete process.env.OD_API_TOKEN;
      else process.env.OD_API_TOKEN = previousToken;
    }
  });

  it('GET /api/projects/recent bypasses the per-project access gate and returns an empty list', async () => {
    await withAccessServer(204, async (url, requests) => {
      process.env.TEAMVER_DESIGN_API_URL = url;
      const headers = {
        'X-Teamver-User-Id': 'user-recent',
        'X-Teamver-Workspace-Id': 'workspace-recent',
      };
      const response = await fetch(`${baseUrl}/api/projects/recent?limit=6`, { headers });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { projects: unknown[] };
      expect(Array.isArray(body.projects)).toBe(true);
      expect(requests).toHaveLength(0);
    });
  });

  it('auto-registers legacy projects when design-api returns 404 on access', async () => {
    const projectId = `teamver-access-register-${Date.now()}`;
    await createProject(projectId);

    const requests: AccessRequest[] = [];
    let accessChecks = 0;
    const accessServer = createServer((req, res) => {
      requests.push({
        url: req.url,
        userId: req.headers['x-teamver-user-id'] as string | undefined,
        workspaceId: req.headers['x-teamver-workspace-id'] as string | undefined,
      });
      if (req.method === 'POST' && req.url === '/api/v1/projects') {
        res.writeHead(201);
        res.end();
        return;
      }
      if (req.method === 'GET' && req.url === `/api/v1/projects/${encodeURIComponent(projectId)}/access`) {
        accessChecks += 1;
        if (accessChecks === 1) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(204, { 'X-Teamver-S3-Prefix': 'design/ws_ws1/user_u1/proj_x/' });
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => accessServer.listen(0, '127.0.0.1', resolve));
    const address = accessServer.address();
    if (!address || typeof address === 'string') throw new Error('missing access server address');

    try {
      process.env.TEAMVER_DESIGN_API_URL = `http://127.0.0.1:${address.port}`;
      const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: {
          'X-Teamver-User-Id': 'user-register',
          'X-Teamver-Workspace-Id': 'workspace-register',
        },
      });
      expect(response.status).toBe(200);
      expect(accessChecks).toBe(2);
      expect(requests.some((entry) => entry.url === '/api/v1/projects')).toBe(true);
    } finally {
      await new Promise<void>((resolve) => accessServer.close(() => resolve()));
    }
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

  it('recovers from a 404→register-failed→register-eventually-succeeds race within ~1.5s', async () => {
    // Reproduces the post-deploy "create project → /folders 502
    // teamver_project_s3_prefix_required, persists for ~5s" symptom:
    // the very first access lookup arrives before design-api has the row,
    // the daemon's register-on-404 retry must NOT poison the deny cache
    // for the full 5s permanent window. After ~1.5s a subsequent request
    // must hit the upstream again and succeed once design-api has the
    // row (here, after the second register attempt). Without the
    // transient-deny TTL the next request would short-circuit on the
    // cached deny and the user would see another 502 — exactly the
    // failure mode the user reported.
    const projectId = `teamver-access-deny-recovery-${Date.now()}`;
    await createProject(projectId);

    let registerCalls = 0;
    let accessCalls = 0;
    const accessServer = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/v1/projects') {
        registerCalls += 1;
        // First register attempt fails (e.g. transient DB error during
        // deploy). Subsequent attempts succeed.
        if (registerCalls === 1) {
          res.writeHead(500);
          res.end();
          return;
        }
        res.writeHead(201);
        res.end();
        return;
      }
      if (req.method === 'GET' && req.url === `/api/v1/projects/${encodeURIComponent(projectId)}/access`) {
        accessCalls += 1;
        // Until the design-api row exists, access returns 404. Once register
        // (attempt 2) succeeds, return granted with prefix.
        if (registerCalls >= 2) {
          res.writeHead(204, { 'X-Teamver-S3-Prefix': 'design/ws_x/user_y/proj_z/' });
          res.end();
          return;
        }
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => accessServer.listen(0, '127.0.0.1', resolve));
    const address = accessServer.address();
    if (!address || typeof address === 'string') throw new Error('missing access server address');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      process.env.TEAMVER_DESIGN_API_URL = `http://127.0.0.1:${address.port}`;

      // 1st request — register fails, deny is cached as transient.
      const firstResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: {
          'X-Teamver-User-Id': 'user-deny-recover',
          'X-Teamver-Workspace-Id': 'workspace-deny-recover',
        },
      });
      expect(firstResp.status).toBe(404);

      // register_failed marker must be observable so ops can alarm on it.
      const registerMarker = findProjectAccessMarker(warnSpy, 'register_failed');
      expect(registerMarker).not.toBeNull();
      expect(registerMarker).toMatchObject({
        metric: 'teamver_project_access_5xx',
        reason: 'register_failed',
        projectId,
        workspaceId: 'workspace-deny-recover',
        httpStatus: 500,
      });

      // Within the transient deny window (~1.5s) the cache short-circuits.
      const cachedDenyResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: {
          'X-Teamver-User-Id': 'user-deny-recover',
          'X-Teamver-Workspace-Id': 'workspace-deny-recover',
        },
      });
      expect(cachedDenyResp.status).toBe(404);
      // No new upstream call yet — the deny cache served it.
      expect(registerCalls).toBe(1);

      // After the transient TTL elapses (1500ms + a small buffer for jitter),
      // the next request hits upstream again. Register succeeds this time
      // and the access check returns granted.
      await new Promise((resolve) => setTimeout(resolve, 1700));
      const recoveredResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        headers: {
          'X-Teamver-User-Id': 'user-deny-recover',
          'X-Teamver-Workspace-Id': 'workspace-deny-recover',
        },
      });
      expect(recoveredResp.status).toBe(200);
      expect(registerCalls).toBeGreaterThanOrEqual(2);
      expect(accessCalls).toBeGreaterThanOrEqual(2);
    } finally {
      warnSpy.mockRestore();
      await new Promise<void>((resolve) => accessServer.close(() => resolve()));
    }
  }, 10_000);

  it('keeps 403 deny cached for the full permanent window (no early refresh)', async () => {
    // Counter-test for the transient-deny fix: real permission denials
    // (403) must still stick for the full window so we don't hammer
    // design-api on every request in a tight UI loop. This guards
    // against accidentally widening the transient classification.
    const projectId = `teamver-access-403-sticky-${Date.now()}`;
    await createProject(projectId);

    let accessCalls = 0;
    const accessServer = createServer((req, res) => {
      if (req.method === 'GET' && req.url === `/api/v1/projects/${encodeURIComponent(projectId)}/access`) {
        accessCalls += 1;
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => accessServer.listen(0, '127.0.0.1', resolve));
    const address = accessServer.address();
    if (!address || typeof address === 'string') throw new Error('missing access server address');

    try {
      process.env.TEAMVER_DESIGN_API_URL = `http://127.0.0.1:${address.port}`;
      const headers = {
        'X-Teamver-User-Id': 'user-403-sticky',
        'X-Teamver-Workspace-Id': 'workspace-403-sticky',
      };
      const r1 = await fetch(`${baseUrl}/api/projects/${projectId}`, { headers });
      expect(r1.status).toBe(404);
      // Wait longer than the transient window but well under the permanent one.
      await new Promise((resolve) => setTimeout(resolve, 1700));
      const r2 = await fetch(`${baseUrl}/api/projects/${projectId}`, { headers });
      expect(r2.status).toBe(404);
      // Cache should still be live — no second upstream call.
      expect(accessCalls).toBe(1);
    } finally {
      await new Promise<void>((resolve) => accessServer.close(() => resolve()));
    }
  }, 10_000);
});

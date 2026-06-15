import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OdDaemonClient, OdDaemonError } from '../src/daemon-client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OdDaemonClient', () => {
  it('checkHealth calls /api/health', async () => {
    const calls: string[] = [];
    const client = new OdDaemonClient({
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonResponse({ ok: true, service: 'daemon' });
      },
    });
    const health = await client.checkHealth();
    assert.equal(health.ok, true);
    assert.match(calls[0]!, /\/api\/health$/);
  });

  it('createRun expects 202', async () => {
    const client = new OdDaemonClient({
      fetchImpl: async (url, init) => {
        if (String(url).endsWith('/api/runs') && init?.method === 'POST') {
          return jsonResponse({ runId: 'run-1' }, 202);
        }
        return jsonResponse({});
      },
    });
    const created = await client.createRun({ projectId: 'p1', message: 'hi' });
    assert.equal(created.runId, 'run-1');
  });

  it('assertOperational fails when no agents', async () => {
    const client = new OdDaemonClient({
      fetchImpl: async (url) => {
        if (String(url).endsWith('/api/health')) {
          return jsonResponse({ ok: true });
        }
        if (String(url).endsWith('/api/ready')) {
          return jsonResponse({ ok: true });
        }
        if (String(url).endsWith('/api/agents')) {
          return jsonResponse({ agents: [] });
        }
        return jsonResponse({});
      },
    });
    await assert.rejects(
      () => client.assertOperational(),
      (err: unknown) => err instanceof OdDaemonError && err.code === 'NO_AGENTS',
    );
  });

  it('waitForRun resolves on terminal status', async () => {
    let polls = 0;
    const client = new OdDaemonClient({
      fetchImpl: async (url) => {
        if (String(url).includes('/api/runs/run-1')) {
          polls += 1;
          return jsonResponse({
            id: 'run-1',
            projectId: 'p1',
            conversationId: 'c1',
            assistantMessageId: 'm1',
            agentId: 'claude',
            status: polls >= 2 ? 'succeeded' : 'running',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        return jsonResponse({});
      },
    });
    const status = await client.waitForRun('run-1', {
      pollIntervalMs: 1,
      timeoutMs: 5_000,
    });
    assert.equal(status.status, 'succeeded');
    assert.ok(polls >= 2);
  });
});

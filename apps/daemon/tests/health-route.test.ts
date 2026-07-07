import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// docs-teamver/39_2 · 39_5 — verify `/api/health` surfaces `nodeId`
// and that `X-OD-Node-Id` is attached to every daemon response when
// OD_NODE_ID is set. Single-node deploys (OD_NODE_ID unset) must fall
// back to `unknown` in the health payload and skip the header.

describe('daemon /api/health nodeId (docs-teamver/39_2 · 39_5)', () => {
  const originalNodeId = process.env.OD_NODE_ID;
  let daemonBaseUrl = '';
  let daemonServer: ReturnType<typeof createServer> | null = null;

  afterEach(async () => {
    if (daemonServer) {
      await new Promise<void>((resolve) => daemonServer!.close(() => resolve()));
      daemonServer = null;
    }
    if (originalNodeId === undefined) {
      delete process.env.OD_NODE_ID;
    } else {
      process.env.OD_NODE_ID = originalNodeId;
    }
  });

  const boot = async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: ReturnType<typeof createServer>;
    };
    const address = started.server.address() as AddressInfo | null;
    daemonServer = started.server;
    daemonBaseUrl = address ? `http://127.0.0.1:${address.port}` : started.url;
  };

  it('reports the configured OD_NODE_ID + X-OD-Node-Id response header', async () => {
    process.env.OD_NODE_ID = 'i-0abc123def';
    await boot();

    const response = await fetch(`${daemonBaseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-od-node-id')).toBe('i-0abc123def');
    const payload = (await response.json()) as { ok: boolean; nodeId: string };
    expect(payload.ok).toBe(true);
    expect(payload.nodeId).toBe('i-0abc123def');
  });

  it('falls back to "unknown" and omits the header when OD_NODE_ID is unset', async () => {
    delete process.env.OD_NODE_ID;
    await boot();

    const response = await fetch(`${daemonBaseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-od-node-id')).toBeNull();
    const payload = (await response.json()) as { ok: boolean; nodeId: string };
    expect(payload.nodeId).toBe('unknown');
  });

  it('treats whitespace-only OD_NODE_ID as unset', async () => {
    process.env.OD_NODE_ID = '   ';
    await boot();

    const response = await fetch(`${daemonBaseUrl}/api/health`);
    expect(response.headers.get('x-od-node-id')).toBeNull();
    const payload = (await response.json()) as { ok: boolean; nodeId: string };
    expect(payload.nodeId).toBe('unknown');
  });
});

import express, { type Express } from 'express';
import http, { type AddressInfo } from 'node:http';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';

import {
  registerByokProxyStream,
  abortByokProxyStream,
  registerByokProxyAbortRoute,
  resetByokProxyStreamRegistryForTests,
  activeByokProxyStreamCountForTests,
} from '../src/byok-proxy-abort.js';

function mockReq(): Request {
  return { headers: {} } as unknown as Request;
}

type MockRes = {
  res: Response;
  headers: Record<string, string>;
  emitFinish: () => void;
  emitClose: () => void;
  headersSent: { value: boolean };
};

function mockRes(): MockRes {
  const listeners: Record<string, Array<() => void>> = {};
  const headers: Record<string, string> = {};
  const headersSent = { value: false };
  const res = {
    get headersSent() {
      return headersSent.value;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    once(event: string, fn: () => void) {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
      return this;
    },
  } as unknown as Response;
  return {
    res,
    headers,
    headersSent,
    emitFinish: () => {
      for (const fn of listeners.finish ?? []) fn();
    },
    emitClose: () => {
      for (const fn of listeners.close ?? []) fn();
    },
  };
}

describe('byok-proxy-abort', () => {
  beforeEach(() => {
    resetByokProxyStreamRegistryForTests();
  });

  it('registers a stream, exposes X-Stream-Id, and yields a non-aborted signal', () => {
    const { res, headers } = mockRes();
    const { streamId, signal } = registerByokProxyStream(mockReq(), res, {
      workspaceId: 'ws-1',
      projectId: 'p-1',
    });
    expect(streamId).toMatch(/[0-9a-f]{8}-/);
    expect(headers['X-Stream-Id']).toBe(streamId);
    expect(signal.aborted).toBe(false);
    expect(activeByokProxyStreamCountForTests()).toBe(1);
  });

  it('abortByokProxyStream aborts the signal and clears the entry', () => {
    const { res } = mockRes();
    const { streamId, signal } = registerByokProxyStream(mockReq(), res);
    expect(abortByokProxyStream(streamId)).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(activeByokProxyStreamCountForTests()).toBe(0);
    // Idempotent: second abort returns false (already cleared).
    expect(abortByokProxyStream(streamId)).toBe(false);
  });

  it('returns false for unknown streamId without throwing', () => {
    expect(abortByokProxyStream('nope')).toBe(false);
    expect(abortByokProxyStream('')).toBe(false);
  });

  it('clears the registry on res.finish synchronously', () => {
    const { res, emitFinish } = mockRes();
    const { streamId } = registerByokProxyStream(mockReq(), res);
    expect(activeByokProxyStreamCountForTests()).toBe(1);
    emitFinish();
    expect(activeByokProxyStreamCountForTests()).toBe(0);
    expect(abortByokProxyStream(streamId)).toBe(false);
  });

  it('defers clearing on res.close so an in-flight abort POST can still target it', () => {
    vi.useFakeTimers();
    try {
      const { res, emitClose } = mockRes();
      const { streamId, signal } = registerByokProxyStream(mockReq(), res);
      emitClose();
      // Entry survives the synchronous close window so a Stop-button
      // abort POST that lands within the grace period still aborts the
      // upstream stream.
      expect(activeByokProxyStreamCountForTests()).toBe(1);
      expect(abortByokProxyStream(streamId)).toBe(true);
      expect(signal.aborted).toBe(true);
      vi.advanceTimersByTime(10_000);
      expect(activeByokProxyStreamCountForTests()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('after grace window, res.close cleanup drops the entry without aborting it', () => {
    vi.useFakeTimers();
    try {
      const { res, emitClose } = mockRes();
      const { streamId, signal } = registerByokProxyStream(mockReq(), res);
      emitClose();
      vi.advanceTimersByTime(10_000);
      // Entry removed by the grace timer; the signal was NEVER aborted —
      // pagehide policy requires the upstream stream to drain naturally.
      expect(activeByokProxyStreamCountForTests()).toBe(0);
      expect(signal.aborted).toBe(false);
      expect(abortByokProxyStream(streamId)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not double-clear when both finish and close fire (finish wins)', () => {
    vi.useFakeTimers();
    try {
      const { res, emitFinish, emitClose } = mockRes();
      const { streamId } = registerByokProxyStream(mockReq(), res);
      emitFinish();
      emitClose();
      vi.advanceTimersByTime(10_000);
      expect(activeByokProxyStreamCountForTests()).toBe(0);
      expect(abortByokProxyStream(streamId)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips setHeader silently when headersSent is already true', () => {
    const ctx = mockRes();
    ctx.headersSent.value = true;
    const { streamId } = registerByokProxyStream(mockReq(), ctx.res, {
      workspaceId: null,
      projectId: null,
    });
    expect(ctx.headers['X-Stream-Id']).toBeUndefined();
    // Stream is still registered and abortable internally.
    expect(abortByokProxyStream(streamId)).toBe(true);
  });
});

/**
 * Defense-in-depth review fix: `/api/proxy/abort` now refuses to abort
 * a stream whose registry entry carries a workspaceId unless the caller
 * presents the same workspaceId. `streamId` is a 122-bit UUID and never
 * leaks outside the originating session, but enforcing the match closes
 * any cross-tenant abort vector if a streamId were to surface in shared
 * logs / devtools.
 */
describe('/api/proxy/abort tenant scoping', () => {
  let server: http.Server;
  let baseUrl: string;
  const originalIdentitySecret = process.env.OD_TEAMVER_IDENTITY_SECRET;

  beforeEach(async () => {
    resetByokProxyStreamRegistryForTests();
    delete process.env.OD_TEAMVER_IDENTITY_SECRET;
    const app: Express = express();
    app.use(express.json({ limit: '1mb' }));
    registerByokProxyAbortRoute(app);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    resetByokProxyStreamRegistryForTests();
    if (originalIdentitySecret == null) {
      delete process.env.OD_TEAMVER_IDENTITY_SECRET;
    } else {
      process.env.OD_TEAMVER_IDENTITY_SECRET = originalIdentitySecret;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function mockResForRegistry() {
    const listeners: Record<string, Array<() => void>> = {};
    return {
      get headersSent() {
        return false;
      },
      setHeader() {},
      once(event: string, fn: () => void) {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(fn);
        return this;
      },
    } as unknown as Response;
  }

  it('aborts when the caller workspace matches the registered workspace', async () => {
    const { streamId, signal } = registerByokProxyStream(
      { headers: {} } as unknown as Request,
      mockResForRegistry(),
      { workspaceId: 'ws-tenant-a', projectId: 'p-1' },
    );
    const resp = await fetch(`${baseUrl}/api/proxy/abort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': 'ws-tenant-a',
        'X-Teamver-User-Id': 'u-1',
      },
      body: JSON.stringify({ streamId }),
    });
    const body = (await resp.json()) as { aborted: boolean };
    expect(resp.status).toBe(200);
    expect(body.aborted).toBe(true);
    expect(signal.aborted).toBe(true);
  });

  it('refuses to abort across tenants and does NOT leak existence', async () => {
    const { streamId, signal } = registerByokProxyStream(
      { headers: {} } as unknown as Request,
      mockResForRegistry(),
      { workspaceId: 'ws-tenant-a', projectId: 'p-1' },
    );
    const resp = await fetch(`${baseUrl}/api/proxy/abort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': 'ws-tenant-b',
        'X-Teamver-User-Id': 'u-evil',
      },
      body: JSON.stringify({ streamId }),
    });
    const body = (await resp.json()) as { aborted: boolean };
    // Same shape as an "unknown streamId" response — caller can't tell
    // whether the stream exists in another tenant.
    expect(resp.status).toBe(200);
    expect(body.aborted).toBe(false);
    expect(signal.aborted).toBe(false);
    // Registry entry survives the failed cross-tenant attempt.
    expect(activeByokProxyStreamCountForTests()).toBe(1);
  });

  it('returns aborted:false for unknown streamId without 4xx', async () => {
    const resp = await fetch(`${baseUrl}/api/proxy/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streamId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(resp.status).toBe(200);
    expect(((await resp.json()) as { aborted: boolean }).aborted).toBe(false);
  });

  it('returns 400 when streamId is missing', async () => {
    const resp = await fetch(`${baseUrl}/api/proxy/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(resp.status).toBe(400);
  });
});

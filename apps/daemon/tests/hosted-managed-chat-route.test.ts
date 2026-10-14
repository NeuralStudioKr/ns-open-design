import type http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('parallel hosted managed chat route', () => {
  const realFetch = globalThis.fetch;
  const original = {
    enabled: process.env.TEAMVER_HOSTED_CHAT_API_ENABLED,
    buffered: process.env.TEAMVER_HOSTED_CHAT_BUFFERED_STREAM_ENABLED,
    designApi: process.env.TEAMVER_DESIGN_API_URL,
    key: process.env.TEAMVER_MINIMAX_API_KEY,
    model: process.env.TEAMVER_MINIMAX_CHAT_MODEL,
    baseUrl: process.env.TEAMVER_MINIMAX_BASE_URL,
  };
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.TEAMVER_HOSTED_CHAT_API_ENABLED = '1';
    delete process.env.TEAMVER_HOSTED_CHAT_BUFFERED_STREAM_ENABLED;
    process.env.TEAMVER_DESIGN_API_URL = 'http://design-api:8000';
    process.env.TEAMVER_MINIMAX_API_KEY = 'server-private-key';
    process.env.TEAMVER_MINIMAX_CHAT_MODEL = 'server-private-model';
    process.env.TEAMVER_MINIMAX_BASE_URL = 'https://api.minimax.io/v1';
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.TEAMVER_MINIMAX_API_KEY = 'server-private-key';
    delete process.env.TEAMVER_HOSTED_CHAT_BUFFERED_STREAM_ENABLED;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [key, value] of Object.entries({
      TEAMVER_HOSTED_CHAT_API_ENABLED: original.enabled,
      TEAMVER_HOSTED_CHAT_BUFFERED_STREAM_ENABLED: original.buffered,
      TEAMVER_DESIGN_API_URL: original.designApi,
      TEAMVER_MINIMAX_API_KEY: original.key,
      TEAMVER_MINIMAX_CHAT_MODEL: original.model,
      TEAMVER_MINIMAX_BASE_URL: original.baseUrl,
    })) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const headers = {
    'content-type': 'application/json',
    'x-teamver-user-id': 'user-1',
    'x-workspace-id': 'workspace-1',
  };

  it('rejects client provider routing before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: 'test-project',
        model: 'client-model',
        baseUrl: 'https://example.com',
        messages: [],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain('INVALID_MANAGED_CHAT_REQUEST');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses private server routing while keeping the public SSE provider-neutral', async () => {
    const upstreamBodies: any[] = [];
    const fetchMock = vi.fn(async (input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      expect(url).toBe('https://api.minimax.io/v1/chat/completions');
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer server-private-key',
      );
      upstreamBodies.push(JSON.parse(String(init?.body || '{}')));
      return sseResponse([
        'data: {"choices":[{"index":0,"delta":{"content":"managed ok"}}]}',
        '',
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4}}',
        '',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: 'test-project',
        maxOutputTokens: 32_000,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('managed ok');
    expect(body).toContain('event: usage');
    expect(body).not.toContain('server-private-model');
    expect(body.toLowerCase()).not.toContain('minimax');
    expect(upstreamBodies).toHaveLength(1);
    expect(upstreamBodies[0].model).toBe('server-private-model');
    expect(upstreamBodies[0].max_completion_tokens).toBe(32_000);
    expect(upstreamBodies[0]).not.toHaveProperty('max_tokens');
  });

  it('returns a neutral managed-service error when the private key is absent', async () => {
    delete process.env.TEAMVER_MINIMAX_API_KEY;

    const res = await realFetch(`${baseUrl}/api/proxy/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: 'test-project',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain('MANAGED_CHAT_UNAVAILABLE');
    expect(body.toLowerCase()).not.toContain('minimax');
  });

  it('keeps complete deck requests on the existing atomic path while the new flag is off', async () => {
    const complete = '<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>One</h1></section></body></html></artifact>';
    const fetchMock = vi.fn(async (input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      const payload = JSON.parse(String(init?.body || '{}'));
      expect(payload.stream).toBe(false);
      return new Response(JSON.stringify({
        choices: [{ message: { content: complete } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: 'test-project',
        expectCompleteDeckArtifact: true,
        messages: [{ role: 'user', content: 'make a deck' }],
      }),
    });

    const body = await res.text();
    expect(body).toContain('<h1>One</h1>');
    expect(body).not.toContain('event: progress');
  });

  it('streams provider-neutral progress but withholds deck bytes until validation', async () => {
    process.env.TEAMVER_HOSTED_CHAT_BUFFERED_STREAM_ENABLED = '1';
    const complete = '<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide"><h1>One</h1></section></body></html></artifact>';
    const splitAt = complete.indexOf('<section');
    const upstreamBodies: any[] = [];
    const fetchMock = vi.fn(async (input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      upstreamBodies.push(JSON.parse(String(init?.body || '{}')));
      return sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: complete.slice(0, splitAt) } }] })}`,
        '',
        `data: ${JSON.stringify({ choices: [{ delta: { content: complete.slice(splitAt) } }] })}`,
        '',
        'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":6}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: 'test-project',
        expectCompleteDeckArtifact: true,
        messages: [{ role: 'user', content: 'make a deck' }],
      }),
    });

    const body = await res.text();
    expect(upstreamBodies).toHaveLength(1);
    expect(upstreamBodies[0].stream).toBe(true);
    expect(body).toContain('event: progress');
    expect(body).toContain('"phase":"generating","activity":"content"');
    expect(body).toContain('"phase":"validating"');
    expect(body).toContain('"phase":"publishing"');
    expect(body.match(/event: delta/g)).toHaveLength(1);
    expect(body).toContain('<h1>One</h1>');
    expect(body.indexOf('event: progress')).toBeLessThan(body.indexOf('event: delta'));
    expect(body.toLowerCase()).not.toContain('minimax');
    expect(body).not.toContain('server-private-model');
  });

  it('does not forward provider-specific upstream error details', async () => {
    const fetchMock = vi.fn(async (input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return new Response('{"provider":"MiniMax","message":"private quota detail"}', {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: 'test-project',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('RATE_LIMITED');
    expect(body).toContain('AI service is temporarily unavailable');
    expect(body).not.toContain('private quota detail');
    expect(body.toLowerCase()).not.toContain('minimax');
  });
});

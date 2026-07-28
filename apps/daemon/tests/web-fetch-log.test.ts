// Per-call log schema for fetchUrlContent. Covers 48-1 §5:
//   web_fetch.backend=<name>
//   url_host=<host only>
//   duration_ms=<n>
//   status=ok text_bytes=<n> [truncated=1] [reader_fallback=1]
//   status=error error_code=<bucket> error=<verbatim short msg>
//
// Body / title / path / query are never logged; error strings are
// backend-provided and already short.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetWebFetchBackendCacheForTests,
  fetchUrlContent,
} from '../src/web-fetch/core.js';

describe('web_fetch log schema', () => {
  let logs: string[] = [];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
      if (typeof msg === 'string') logs.push(msg);
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    _resetWebFetchBackendCacheForTests();
  });

  afterEach(() => {
    _resetWebFetchBackendCacheForTests();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('emits status=ok with backend/host/bytes for a successful native fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        '<!doctype html><html><head><title>t</title></head><body><p>hi</p></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      )),
    );

    const result = await fetchUrlContent('https://example.com/some/path?a=1');
    expect(result.ok).toBe(true);

    const line = logs.find((l) => l.startsWith('web_fetch.backend='));
    expect(line, `logs: ${JSON.stringify(logs)}`).toBeDefined();
    expect(line).toContain('backend=native');
    expect(line).toContain('url_host=example.com');
    expect(line).toContain('status=ok');
    expect(line).toMatch(/duration_ms=\d+/);
    expect(line).toMatch(/text_bytes=\d+/);

    // Path / query must never appear in the log.
    expect(line).not.toContain('/some/path');
    expect(line).not.toContain('a=1');
    // Body / title must never appear either.
    expect(line).not.toContain('<p>hi</p>');
    expect(line).not.toMatch(/\btitle\b/);
  });

  it('emits status=error error_code=http_4xx on a 404 from native', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gone', { status: 404, statusText: 'Not Found' })),
    );

    const result = await fetchUrlContent('https://example.com/missing');
    expect(result.ok).toBe(false);

    const line = logs.find((l) => l.startsWith('web_fetch.backend=native'));
    expect(line).toBeDefined();
    expect(line).toContain('status=error');
    expect(line).toContain('error_code=http_4xx');
    expect(line).toContain('error=http 404 Not Found');
  });

  it('logs the fallback backend with reader_fallback=1 when reader → native retry succeeds', async () => {
    vi.stubEnv('WEB_FETCH_BACKEND', 'reader');
    vi.stubEnv('WEB_FETCH_READER_URL', 'https://r.jina.ai/');
    vi.stubEnv('WEB_FETCH_READER_FALLBACK_TO_NATIVE', '1');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.startsWith('https://r.jina.ai/')) {
          return new Response('boom', { status: 503, statusText: 'Bad Gateway' });
        }
        return new Response(
          '<!doctype html><html><body>ok</body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }),
    );

    const result = await fetchUrlContent('https://example.com/page');
    expect(result.ok).toBe(true);

    const line = logs.find((l) => l.includes('backend=native'));
    expect(line).toBeDefined();
    expect(line).toContain('status=ok');
    expect(line).toContain('reader_fallback=1');

    // The fallback warn must also be emitted with url_host + primary=reader.
    const warnCalls: string[] = warnSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .filter((m: unknown): m is string => typeof m === 'string');
    expect(warnCalls.some((m: string) => m.includes('web_fetch.reader_fallback'))).toBe(true);
    expect(warnCalls.some((m: string) => m.includes('primary=reader'))).toBe(true);
    expect(warnCalls.some((m: string) => m.includes('url_host=example.com'))).toBe(true);
  });

  it('logs an ssrf line with backend=- when assertExternalAssetUrl rejects the URL', async () => {
    // Loopback (127.0.0.1) is intentionally allowed by the daemon SSRF
    // guard for local LLM providers (Ollama etc.). Use the AWS EC2
    // metadata IP (169.254.169.254) — link-local space is blocked by
    // isBlockedExternalApiHostname in the contracts package.
    const result = await fetchUrlContent('http://169.254.169.254/latest/meta-data/');
    expect(result.ok).toBe(false);

    const line = logs.find((l) => l.startsWith('web_fetch.backend=-'));
    expect(line, `logs: ${JSON.stringify(logs)}`).toBeDefined();
    expect(line).toContain('status=error');
    expect(line).toContain('error_code=ssrf');
    expect(line).toContain('url_host=169.254.169.254');
  });
});

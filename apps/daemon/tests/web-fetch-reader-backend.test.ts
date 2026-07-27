// Reader-SaaS backend + end-to-end fallback wiring. Covers 48-1 §3.4
// (backend) and §3.5 (fallback path via core).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeReaderWebFetchBackend } from '../src/web-fetch/reader-backend.js';
import {
  _resetWebFetchBackendCacheForTests,
  fetchUrlContent,
} from '../src/web-fetch/core.js';

function ctx(): { url: string; signal: AbortSignal } {
  const controller = new AbortController();
  return { url: 'https://example.com/page', signal: controller.signal };
}

describe('makeReaderWebFetchBackend', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes the original URL with the configured reader base', async () => {
    const fetchMock = vi.fn(async () => new Response('# hello', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const backend = makeReaderWebFetchBackend({
      base: 'https://r.jina.ai/',
      timeoutMs: 12_000,
    });
    const result = await backend.fetchOnce(ctx());

    expect(result).toMatchObject({ ok: true, isHtml: false, text: '# hello' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://r.jina.ai/https://example.com/page',
      expect.any(Object),
    );
  });

  it('adds Authorization: Bearer <key> when apiKey is set', async () => {
    let seenHeaders: Record<string, string> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string, init: RequestInit) => {
        seenHeaders = init.headers as Record<string, string>;
        return new Response('ok', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }),
    );

    const backend = makeReaderWebFetchBackend({
      base: 'https://r.jina.ai/',
      apiKey: 'sk_test_123',
      timeoutMs: 12_000,
    });
    await backend.fetchOnce(ctx());

    expect(seenHeaders?.Authorization).toBe('Bearer sk_test_123');
  });

  it('omits Authorization when apiKey is not set', async () => {
    let seenHeaders: Record<string, string> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string, init: RequestInit) => {
        seenHeaders = init.headers as Record<string, string>;
        return new Response('ok', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }),
    );

    const backend = makeReaderWebFetchBackend({
      base: 'https://r.jina.ai/',
      timeoutMs: 12_000,
    });
    await backend.fetchOnce(ctx());

    expect(seenHeaders?.Authorization).toBeUndefined();
  });

  it('surfaces upstream 401 as http error and leaves fallback to the core', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', {
        status: 401,
        statusText: 'Unauthorized',
      })),
    );

    const backend = makeReaderWebFetchBackend({
      base: 'https://r.jina.ai/',
      timeoutMs: 12_000,
    });
    const result = await backend.fetchOnce(ctx());

    expect(result).toEqual({ ok: false, error: 'http 401 Unauthorized' });
  });

  it('does not run htmlToText on reader responses (isHtml=false, tags preserved)', async () => {
    // If the core were to run htmlToText on this payload it would eat
    // the <b>. Reader responses must round-trip verbatim.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('# heading <b>keep-me</b>', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })),
    );

    const backend = makeReaderWebFetchBackend({
      base: 'https://r.jina.ai/',
      timeoutMs: 12_000,
    });
    const result = await backend.fetchOnce(ctx());

    expect(result.isHtml).toBe(false);
    expect(result.text).toContain('<b>keep-me</b>');
  });
});

describe('fetchUrlContent — reader → native fallback wiring', () => {
  beforeEach(() => {
    _resetWebFetchBackendCacheForTests();
  });

  afterEach(() => {
    _resetWebFetchBackendCacheForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('retries native when reader fails and fallback is enabled', async () => {
    vi.stubEnv('WEB_FETCH_BACKEND', 'reader');
    vi.stubEnv('WEB_FETCH_READER_URL', 'https://r.jina.ai/');
    vi.stubEnv('WEB_FETCH_READER_FALLBACK_TO_NATIVE', '1');

    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        calls.push(input);
        if (input.startsWith('https://r.jina.ai/')) {
          return new Response('boom', { status: 503, statusText: 'Bad Gateway' });
        }
        return new Response(
          '<!doctype html><html><head><title>native ok</title></head><body><p>hi</p></body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }),
    );

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchUrlContent('https://example.com/page');

    expect(result).toMatchObject({ ok: true, title: 'native ok' });
    expect(result.text).toContain('hi');
    expect(calls).toEqual([
      'https://r.jina.ai/https://example.com/page',
      'https://example.com/page',
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('web_fetch.reader_fallback'),
    );

    warn.mockRestore();
  });

  it('does NOT retry when WEB_FETCH_READER_FALLBACK_TO_NATIVE is off', async () => {
    vi.stubEnv('WEB_FETCH_BACKEND', 'reader');
    vi.stubEnv('WEB_FETCH_READER_URL', 'https://r.jina.ai/');
    vi.stubEnv('WEB_FETCH_READER_FALLBACK_TO_NATIVE', '0');

    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        calls.push(input);
        return new Response('boom', { status: 503, statusText: 'Bad Gateway' });
      }),
    );

    const result = await fetchUrlContent('https://example.com/page');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('http 503');
    expect(calls).toEqual(['https://r.jina.ai/https://example.com/page']);
  });
});

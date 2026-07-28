// Native backend redirect policy (48-1 §3.3 §Redirect policy).
// Covers the fix that unblocks apex→www style hostnames like
// `neuralstudio.kr` while keeping the SSRF gate pinned across every
// hop.
//
// Invariants under test:
//   1. Terminal 2xx with no redirect → hops=0, backwards-compatible.
//   2. Single 301/302 to a public host → followed transparently, hops=1.
//   3. Chain of 2 hops → followed, hops=2 emitted on the log line.
//   4. 4+ hops → rejected with `too many redirects`, error_code=redirect_max.
//   5. Redirect Location pointing at an internal IP → rejected with
//      `blocked redirect: ...`, error_code=redirect_blocked. The SSRF
//      gate must still fire mid-chain.
//   6. Redirect Location on the loopback → same rejection.
//   7. https→http downgrade → rejected, error_code=redirect_blocked.
//   8. Redirect to a non-http(s) scheme (ftp://) → rejected.
//   9. 3xx without a Location header → rejected, error_code=redirect_malformed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetWebFetchBackendCacheForTests,
  fetchUrlContent,
} from '../src/web-fetch/core.js';

function makeResponse(status: number, headers: Record<string, string> = {}, body = ''): Response {
  return new Response(status >= 300 && status < 400 ? null : body, {
    status,
    headers,
  });
}

function mockFetchChain(responses: Array<{ match: (url: string) => boolean; response: Response }>): void {
  const fetchImpl = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String(input);
    for (const entry of responses) {
      if (entry.match(url)) return entry.response.clone();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchImpl);
}

describe('native backend — safe redirect follow', () => {
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

  it('returns hops=0 (unlogged) for a terminal 2xx response', async () => {
    mockFetchChain([
      {
        match: (url) => url === 'https://example.com/page',
        response: new Response('<html><title>t</title><body>hi</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      },
    ]);
    const result = await fetchUrlContent('https://example.com/page');
    expect(result.ok).toBe(true);
    expect(result.text).toContain('hi');
    // hops is intentionally NOT on the public shape.
    expect((result as unknown as Record<string, unknown>).hops).toBeUndefined();
    const line = logs.find((l) => l.startsWith('web_fetch.backend=native'));
    expect(line).toBeDefined();
    // Healthy default line MUST NOT include hops= when hops === 0.
    expect(line).not.toContain('hops=');
    expect(line).toContain('status=ok');
  });

  it('follows a single 301 apex→www redirect and logs hops=1', async () => {
    mockFetchChain([
      {
        match: (url) => url === 'https://neuralstudio.kr/',
        response: makeResponse(301, { location: 'https://www.neuralstudio.kr/' }),
      },
      {
        match: (url) => url === 'https://www.neuralstudio.kr/',
        response: new Response('<html><title>NS</title><body>ok</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      },
    ]);
    const result = await fetchUrlContent('https://neuralstudio.kr/');
    expect(result.ok).toBe(true);
    expect(result.title).toBe('NS');
    expect(result.text).toContain('ok');
    const line = logs.find((l) => l.startsWith('web_fetch.backend=native'));
    expect(line).toContain('hops=1');
    expect(line).toContain('status=ok');
  });

  it('follows two hops (http→https→www) and logs hops=2', async () => {
    mockFetchChain([
      {
        match: (url) => url === 'http://neuralstudio.kr/',
        response: makeResponse(301, { location: 'https://neuralstudio.kr/' }),
      },
      {
        match: (url) => url === 'https://neuralstudio.kr/',
        response: makeResponse(302, { location: 'https://www.neuralstudio.kr/' }),
      },
      {
        match: (url) => url === 'https://www.neuralstudio.kr/',
        response: new Response('final', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      },
    ]);
    const result = await fetchUrlContent('http://neuralstudio.kr/');
    expect(result.ok).toBe(true);
    expect(result.text).toBe('final');
    const line = logs.find((l) => l.startsWith('web_fetch.backend=native'));
    expect(line).toContain('hops=2');
  });

  it('rejects with too many redirects (>3 hops) after 4 straight 301s', async () => {
    mockFetchChain([
      { match: (url) => url === 'https://example.com/a', response: makeResponse(301, { location: 'https://example.com/b' }) },
      { match: (url) => url === 'https://example.com/b', response: makeResponse(301, { location: 'https://example.com/c' }) },
      { match: (url) => url === 'https://example.com/c', response: makeResponse(301, { location: 'https://example.com/d' }) },
      { match: (url) => url === 'https://example.com/d', response: makeResponse(301, { location: 'https://example.com/e' }) },
    ]);
    const result = await fetchUrlContent('https://example.com/a');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too many redirects/);
    const line = logs.find((l) => l.startsWith('web_fetch.backend=native'));
    expect(line).toContain('error_code=redirect_max');
    // 4 Location headers consumed, cap = 3 → hops=4 on the log line.
    expect(line).toContain('hops=4');
  });

  it('blocks a redirect that points at a metadata IP mid-chain', async () => {
    mockFetchChain([
      {
        match: (url) => url === 'https://attacker.com/',
        response: makeResponse(302, { location: 'http://169.254.169.254/latest/meta-data/' }),
      },
    ]);
    const result = await fetchUrlContent('https://attacker.com/');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/blocked redirect/);
    const line = logs.find((l) => l.startsWith('web_fetch.backend=native'));
    expect(line).toContain('error_code=redirect_blocked');
    expect(line).toContain('hops=1');
  });

  it('blocks a redirect that points at the loopback', async () => {
    mockFetchChain([
      {
        match: (url) => url === 'https://attacker.com/',
        response: makeResponse(302, { location: 'http://127.0.0.1/' }),
      },
    ]);
    const result = await fetchUrlContent('https://attacker.com/');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/blocked redirect/);
  });

  it('refuses an https→http downgrade even for a public target', async () => {
    mockFetchChain([
      {
        match: (url) => url === 'https://example.com/',
        response: makeResponse(302, { location: 'http://example.com/plain' }),
      },
    ]);
    const result = await fetchUrlContent('https://example.com/');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/https→http downgrade/);
    const line = logs.find((l) => l.startsWith('web_fetch.backend=native'));
    expect(line).toContain('error_code=redirect_blocked');
  });

  it('refuses a redirect to a non-http(s) scheme (ftp://)', async () => {
    mockFetchChain([
      {
        match: (url) => url === 'https://example.com/',
        response: makeResponse(302, { location: 'ftp://example.com/dl' }),
      },
    ]);
    const result = await fetchUrlContent('https://example.com/');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-http\(s\) scheme/);
  });

  it('rejects a 3xx response that omits Location', async () => {
    mockFetchChain([
      {
        match: (url) => url === 'https://example.com/',
        response: makeResponse(302, {}),
      },
    ]);
    const result = await fetchUrlContent('https://example.com/');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/without Location/);
    const line = logs.find((l) => l.startsWith('web_fetch.backend=native'));
    expect(line).toContain('error_code=redirect_malformed');
  });
});

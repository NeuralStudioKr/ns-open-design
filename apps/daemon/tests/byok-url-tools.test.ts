import { describe, expect, it, vi } from 'vitest';

import { fetchUrlContent } from '../src/byok-url-tools.js';

describe('fetchUrlContent', () => {
  it('rejects missing and non-http(s) URLs without fetching', async () => {
    expect(await fetchUrlContent(undefined)).toEqual({ ok: false, error: 'url is required' });
    expect(await fetchUrlContent('')).toEqual({ ok: false, error: 'url is required' });
    expect(await fetchUrlContent('ftp://example.com/')).toEqual({
      ok: false,
      error: 'only http(s) URLs are supported',
    });
    expect(await fetchUrlContent('file:///etc/passwd')).toEqual({
      ok: false,
      error: 'only http(s) URLs are supported',
    });
  });

  it('blocks loopback URLs via SSRF guard', async () => {
    const result = await fetchUrlContent('http://127.0.0.1:41711/');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('strips HTML to plain text and extracts title', async () => {
    const html = `<!doctype html><html><head><title>Teamver — Demo</title></head><body><script>ignore()</script><p>Hello</p><div>World</div></body></html>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      ),
    );
    const result = await fetchUrlContent('https://example.com/page');
    expect(result).toMatchObject({
      ok: true,
      title: 'Teamver — Demo',
      text: expect.stringContaining('Hello'),
    });
    expect(result.text).toContain('World');
    expect(result.text).not.toMatch(/ignore/i);
    vi.unstubAllGlobals();
  });
});

import { describe, expect, it } from 'vitest';
import {
  injectHtmlBaseHref,
  isUnauthorizedHtmlBody,
  loadAuthenticatedHtmlSrcDoc,
  looksLikeHtmlDocument,
  resolvePluginPreviewBaseHref,
} from '../../src/runtime/authenticatedHtmlSrcDoc';

describe('authenticatedHtmlSrcDoc helpers', () => {
  it('rejects session_expired JSON envelopes', () => {
    expect(
      isUnauthorizedHtmlBody('{"detail":"session_expired"}', 'application/json'),
    ).toBe(true);
    expect(looksLikeHtmlDocument('<!doctype html><html><body></body></html>')).toBe(true);
  });

  it('injects base href for relative assets', () => {
    const html = injectHtmlBaseHref(
      '<html><head></head><body>x</body></html>',
      'https://example.com/api/plugins/foo/',
    );
    expect(html).toContain('<base href="https://example.com/api/plugins/foo/">');
    expect(
      resolvePluginPreviewBaseHref(
        '/api/plugins/foo/preview',
        'https://stg-design.teamver.com/',
      ),
    ).toBe('https://stg-design.teamver.com/api/plugins/foo/');
  });

  it('strips canvas CSP base-uri none before injecting base href', () => {
    const canvas = `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'self'; script-src 'none'; base-uri 'none'; form-action 'none'"/>
</head><body></body></html>`;
    const html = injectHtmlBaseHref(canvas, 'https://stg-design.teamver.com/api/projects/p1/raw/canvas.html');
    expect(html).toContain('<base href="https://stg-design.teamver.com/api/projects/p1/raw/canvas.html">');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'unsafe-inline'");
    expect(html).not.toMatch(/base-uri\s+'none'/i);
  });

  it('loads authenticated HTML as srcDoc and rejects JSON envelopes', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('session')) {
          return new Response('{"detail":"session_expired"}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('<html><head></head><body><img src="./a.png"></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      };

      const ok = await loadAuthenticatedHtmlSrcDoc('/api/plugins/foo/preview');
      expect(ok.ok).toBe(true);
      expect(ok.ok ? ok.srcDoc : '').toContain('<base href="http://localhost/api/plugins/foo/">');

      const rejected = await loadAuthenticatedHtmlSrcDoc('/api/session');
      expect(rejected).toEqual({ ok: false, reason: 'not_html', status: 200 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

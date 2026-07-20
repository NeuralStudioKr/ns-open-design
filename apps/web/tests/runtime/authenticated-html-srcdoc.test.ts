import { describe, expect, it } from 'vitest';
import {
  injectHtmlBaseHref,
  isUnauthorizedHtmlBody,
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
});

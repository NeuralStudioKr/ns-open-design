import { describe, expect, it } from 'vitest';

import {
  buildStaticHtmlExportFallback,
  isHeadlessChromiumUnavailableExportError,
} from '../src/import-export-routes.js';

describe('buildStaticHtmlExportFallback', () => {
  it('injects deck flattening styles into the document head', () => {
    const html = '<!doctype html><html><head><title>Deck</title></head><body><section class="slide">One</section></body></html>';

    const fallback = buildStaticHtmlExportFallback({ deck: true, html });

    expect(fallback).toContain('data-teamver-static-html-export-fallback');
    expect(fallback).toContain('.slide:not(.active)');
    expect(fallback.indexOf('data-teamver-static-html-export-fallback')).toBeLessThan(fallback.indexOf('</head>'));
  });

  it('leaves non-deck HTML unchanged', () => {
    const html = '<!doctype html><p>Plain artifact</p>';

    expect(buildStaticHtmlExportFallback({ deck: false, html })).toBe(html);
  });
});

describe('isHeadlessChromiumUnavailableExportError', () => {
  it('matches daemon launch failures returned by the export runtime', () => {
    expect(
      isHeadlessChromiumUnavailableExportError(
        new Error('headless Chromium unavailable (tried 8 path(s)); /usr/bin/chromium: signal=SIGTRAP'),
      ),
    ).toBe(true);
  });

  it('does not hide unrelated render failures', () => {
    expect(isHeadlessChromiumUnavailableExportError(new Error('page.pdf failed'))).toBe(false);
  });
});

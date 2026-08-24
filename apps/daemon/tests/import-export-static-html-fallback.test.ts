import { describe, expect, it } from 'vitest';

import {
  buildStaticHtmlExportFallback,
  isHeadlessChromiumUnavailableExportError,
  resolveExportOffloadWorkspaceIdFromRequest,
  safeExportHeaderValue,
} from '../src/import-export-routes.js';

describe('buildStaticHtmlExportFallback', () => {
  it('injects deck flattening styles into the document head', () => {
    const html = '<!doctype html><html><head><title>Deck</title></head><body><section class="slide">One</section></body></html>';

    const fallback = buildStaticHtmlExportFallback({ deck: true, html });

    expect(fallback).toContain('data-teamver-static-html-export-fallback');
    expect(fallback).toContain('data-od-html-export-reveal');
    expect(fallback).toContain('.slide:not(.active)');
    expect(fallback).toContain('data-od-html-export-viewport');
    expect(fallback).not.toContain('break-after: page !important');
    expect(fallback.indexOf('data-teamver-static-html-export-fallback')).toBeLessThan(fallback.indexOf('</head>'));
  });

  it('leaves non-deck HTML healed but without deck screen/reveal chrome', () => {
    const html = '<!doctype html><p>Plain artifact</p>';
    const out = buildStaticHtmlExportFallback({ deck: false, html });
    expect(out).toContain('Plain artifact');
    expect(out).not.toContain('data-teamver-static-html-export-fallback');
    expect(out).not.toContain('data-od-html-export-reveal');
  });

  it('heals Motif-killing @import remnants on deck fallback', () => {
    const remnant =
      "1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');";
    const html = `<!doctype html><html><head><style>${remnant}
:root{--bg:#F5F5F0}.deco-pill{border-radius:9999px}
</style></head><body><section class="slide">One</section></body></html>`;
    const fallback = buildStaticHtmlExportFallback({ deck: true, html });
    expect(fallback).toMatch(/\.deco-pill\{/);
    expect(fallback).not.toMatch(/display=swap/i);
    expect(fallback).toMatch(/var\(--bg,\s*var\(--paper/);
    expect(fallback).not.toContain("flex-direction', 'column'");
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

describe('resolveExportOffloadWorkspaceIdFromRequest', () => {
  it('accepts workspace-only embed headers because FE cannot set x-teamver-user-id', () => {
    const req = {
      headers: {
        'x-workspace-id': 'W-STAGING',
      },
    };

    expect(resolveExportOffloadWorkspaceIdFromRequest(req as any)).toBe('W-STAGING');
  });

  it('prefers the embed workspace header when multiple workspace headers are present', () => {
    const req = {
      headers: {
        'x-teamver-user-id': 'U-1',
        'x-teamver-workspace-id': 'W-SESSION',
        'x-workspace-id': 'W-CLIENT',
      },
    };

    expect(resolveExportOffloadWorkspaceIdFromRequest(req as any)).toBe('W-CLIENT');
  });
});

describe('safeExportHeaderValue', () => {
  it('removes characters that Node rejects in response headers', () => {
    expect(safeExportHeaderValue('AccessDenied\n상세: 권한 없음\r\nbucket="x"')).toBe(
      'AccessDenied : bucket="x"',
    );
  });

  it('bounds diagnostic headers so long provider errors do not bloat responses', () => {
    expect(safeExportHeaderValue('a'.repeat(500))).toHaveLength(240);
  });
});

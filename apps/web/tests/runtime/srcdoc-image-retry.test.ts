import { describe, expect, it } from 'vitest';

import { buildSrcdoc } from '../../src/runtime/srcdoc';

describe('preview image retry bridge', () => {
  it('injects an image retry script alongside relative <img> refs', () => {
    const doc = buildSrcdoc(
      '<section class="slide"><img src="refs/drive/msh5lhfh-photo.jpeg" alt="cat"></section>',
      { deck: true },
    );
    expect(doc).toContain('data-od-preview-image-retry');
    // The retry helper must recognise relative + same-origin src values so
    // that composer / Drive-imported images self-heal after S3 sync-down.
    expect(doc).toMatch(/RETRY_DELAYS_MS/);
    // Cache-bust query prefix is `_odr=` so we do not overwrite artifact
    // query params like `?v=<mtime>` when the retry fires.
    expect(doc).toContain('_odr=');
    // Burn the retry budget only once a scoped <base href> exists — without
    // it relative src resolves against about:srcdoc and can never succeed.
    expect(doc).toContain('hasScopedBase');
    expect(doc).toMatch(/\/(?:raw|preview)\//);
  });

  it('keeps the retry bridge off data: / blob: / cross-origin sources', () => {
    const doc = buildSrcdoc(
      '<main>' +
        '<img src="data:image/png;base64,iVBORw0KGgo=" />' +
        '<img src="https://example.com/photo.png" />' +
        '</main>',
    );
    // The helper still injects (deck or not); its src filter is at runtime.
    expect(doc).toContain('data-od-preview-image-retry');
    // Filter check must be present so absolute cross-origin img loads are
    // skipped (we cannot re-mint them via a cache-bust).
    expect(doc).toContain("abs.origin === location.origin");
  });

  it('injects the retry bridge even without an artifact baseHref', () => {
    // The bridge must run before `<base href>` resolves (embed prefix fail-
    // open, first paint) so `error` events on relative <img> can still fire
    // a retry once the scope prefix / S3 sync-down finishes.
    const doc = buildSrcdoc(
      '<section class="slide"><img src="assets/hero.png" /></section>',
      { deck: true },
    );
    expect(doc).toContain('data-od-preview-image-retry');
    // No document <base href> is injected when callers omit baseHref — the
    // retry bridge still installs (and gates on hasScopedBase at runtime).
    expect(doc).not.toMatch(/<base\s+href=/i);
  });
});

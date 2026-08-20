import { describe, expect, it } from 'vitest';

import {
  DECK_FIXED_CANVAS_PIN_ATTR,
  pinDeckSlidesToFixedCanvas,
} from '../src/html/deck-fixed-canvas.js';

describe('pinDeckSlidesToFixedCanvas', () => {
  it('rewrites min-height:100vh slide hosts to a fixed 1920×1080 canvas', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="min-height:100vh;padding:96px;background:#0b0c10;color:#f5d76e">',
      '<h1>CLOUD NATIVE</h1>',
      '</section>',
      '<section class="slide" style="min-height:100vh;padding:80px">Body</section>',
      '</body></html>',
    ].join('');

    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toContain('width:1920px');
    expect(pinned).toContain('height:1080px');
    expect(pinned).not.toMatch(/min-height:\s*100vh/i);
    expect(pinned).toContain(DECK_FIXED_CANVAS_PIN_ATTR);
    expect(pinned).toMatch(/\.slide\s*\{[^}]*width:\s*1920px\s*!important/i);
    // Motif corner hangs must not be clipped by a forced overflow:hidden pin.
    expect(pinned).not.toMatch(/\.slide\s*\{[^}]*overflow:\s*hidden\s*!important/i);
  });

  it('adds fixed canvas style when slide hosts lack sizing attrs', () => {
    const html =
      '<!doctype html><html><body><section class="slide"><h1>A</h1></section></body></html>';
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toContain('style="width:1920px;height:1080px;box-sizing:border-box"');
    expect(pinned).not.toMatch(/style="[^"]*overflow:\s*hidden/);
    expect(pinned).not.toMatch(/\.slide\s*\{[^}]*overflow:\s*hidden/);
    expect(pinned).toContain(DECK_FIXED_CANVAS_PIN_ATTR);
  });

  it('strips authored overflow:hidden from already-sized 1920×1080 slides', () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px;box-sizing:border-box;overflow:hidden;padding:80px">',
      '<h1>Title</h1><p class="subtitle">Lead</p>',
      '</section>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/class="slide"[^>]*overflow:\s*hidden/i);
    expect(pinned).toMatch(/\.slide\s*\{[^}]*overflow:\s*visible\s*!important/i);
  });

  it('moves absolute bottom footers into flex flow so they do not cover the subtitle', () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px;display:flex;flex-direction:column;justify-content:center">',
      '<h1>Title</h1>',
      '<p class="subtitle">Long lead that used to collide with the footer</p>',
      '<p class="footer" style="position:absolute;bottom:48px;left:80px">Company · 2026</p>',
      '</section>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toMatch(/class="footer"[^>]*position:relative/);
    expect(pinned).toMatch(/class="footer"[^>]*margin-top:auto/);
    expect(pinned).not.toMatch(/class="footer"[^>]*position:absolute/);
    expect(pinned).not.toMatch(/class="footer"[^>]*bottom:48px/);
  });

  it('is idempotent for the injected style tag', () => {
    const once = pinDeckSlidesToFixedCanvas(
      '<body><section class="slide" style="min-height:100vh">A</section></body>',
    );
    const twice = pinDeckSlidesToFixedCanvas(once);
    expect(twice.match(new RegExp(DECK_FIXED_CANVAS_PIN_ATTR, 'g'))).toHaveLength(1);
  });
});

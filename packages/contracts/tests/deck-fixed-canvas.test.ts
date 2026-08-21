import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DECK_FIXED_CANVAS_PIN_ATTR,
  looksLikeDeckSlideHostAttrs,
  pinDeckSlidesToFixedCanvas,
} from '../src/html/deck-fixed-canvas.js';
import {
  classAttrHasDeckSlideToken,
  countDeckSlideHostOpens,
  isDeckSlideClassToken,
  looksLikeAuthorClassToggleDeck,
} from '../src/html/deck-slide-class.js';

const EXAMPLES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../plugins/_official/examples',
);

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
    expect(pinned).toMatch(/\.slide,[\s\S]*\{[^}]*width:\s*1920px\s*!important/i);
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

  it('pins data-screen-label slide hosts that omit the slide class', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section data-screen-label="01 Cover" style="min-height:100vh;padding:96px">A</section>',
      '<section data-screen-label="02 Body" style="min-height:100vh;padding:96px">B</section>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toMatch(/data-screen-label="01 Cover"[^>]*width:1920px/);
    expect(pinned).toMatch(/data-screen-label="02 Body"[^>]*height:1080px/);
    expect(pinned).not.toMatch(/min-height:\s*100vh/i);
    expect(pinned).toContain('[data-screen-label]');
    expect(pinned).toContain(DECK_FIXED_CANVAS_PIN_ATTR);
  });

  it('does not treat inner comment labels as slide hosts', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div data-screen-label="eyebrow" style="font-size:18px">Context</div>',
      '<h1>Title</h1>',
      '</section>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/data-screen-label="eyebrow"[^>]*width:1920px/);
    expect(pinned).toMatch(/data-screen-label="eyebrow"[^>]*font-size:18px/);
  });

  it('does not treat data-slide pagination dots as slide hosts', () => {
    const html = [
      '<!doctype html><html><body>',
      '<div class="nav-dot" data-slide="0" style="width:8px;height:8px"></div>',
      '<div class="nav-dot" data-slide="1" style="width:8px;height:8px"></div>',
      '</body></html>',
    ].join('');
    expect(pinDeckSlidesToFixedCanvas(html)).toBe(html);
  });

  it('strips authored overflow:hidden from already-sized 1920×1080 slides', () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px;box-sizing:border-box;overflow:hidden;padding:80px">',
      '<h1>Title</h1><p class="subtitle">Lead</p>',
      '</section>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/class="slide"[^>]*overflow:\s*hidden/i);
    expect(pinned).toMatch(/\.slide,[\s\S]*\{[^}]*overflow:\s*visible\s*!important/i);
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

  it('upgrades stale pin sheets that still force overflow:hidden', () => {
    const html = [
      '<!doctype html><html><head>',
      `<style ${DECK_FIXED_CANVAS_PIN_ATTR}>`,
      '.slide { width:1920px !important; height:1080px !important; overflow:hidden !important; }',
      '</style></head><body>',
      '<section class="slide" style="width:1920px;height:1080px"><h1>Pin upgrade</h1></section>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toMatch(/\.slide,[\s\S]*\{[^}]*overflow:\s*visible\s*!important/i);
    expect(pinned).not.toMatch(
      new RegExp(`${DECK_FIXED_CANVAS_PIN_ATTR}[^>]*>[\\s\\S]*overflow:\\s*hidden`, 'i'),
    );
  });

  it('force-pins official #deck catalog presenters for compact letterbox (§0.93)', () => {
    const html = readFileSync(join(EXAMPLES_DIR, 'html-ppt-zhangzara-studio/example.html'), 'utf8');
    expect(pinDeckSlidesToFixedCanvas(html)).toBe(html);
    const forced = pinDeckSlidesToFixedCanvas(html, { force: true });
    expect(forced).toContain(DECK_FIXED_CANVAS_PIN_ATTR);
    expect(forced).toMatch(/\.slide,[\s\S]*\{[^}]*width:\s*1920px\s*!important/i);
    expect(forced).toMatch(/overflow:\s*visible\s*!important/i);
  });
});

describe('deck slide class tokens', () => {
  it('does not treat slide-counter chrome as a slide host', () => {
    expect(classAttrHasDeckSlideToken('slide-counter')).toBe(false);
    expect(classAttrHasDeckSlideToken('slide-number')).toBe(false);
    expect(looksLikeDeckSlideHostAttrs('class="slide-counter" id="slideCounter"')).toBe(false);
    expect(looksLikeDeckSlideHostAttrs('class="slide slide-1 active"')).toBe(true);
    expect(looksLikeDeckSlideHostAttrs('class="slide-5"')).toBe(true);
  });

  it('allowlists page hosts and rejects nested Studio chrome / wrappers', () => {
    for (const chrome of [
      'slide-chrome',
      'slide-body',
      'slide-foot',
      'slide-inner',
      'slide-deck',
      'slide-wrap',
      'slide-track',
      'slides-container',
    ]) {
      expect(isDeckSlideClassToken(chrome), chrome).toBe(false);
      expect(looksLikeDeckSlideHostAttrs(`class="${chrome}"`), chrome).toBe(false);
    }
    expect(isDeckSlideClassToken('slide-frame')).toBe(true);
    expect(countDeckSlideHostOpens([
      '<section class="slide dark slide--cover">Cover</section>',
      '<div class="slide-chrome">01</div>',
      '<div class="slide-body">Copy</div>',
      '<div id="slide-counter" class="slide-counter">1 / 10</div>',
      '<section class="slide light">Body</section>',
    ].join(''))).toBe(2);
  });

  it('does not pin nested slide-chrome to the 1920 canvas', () => {
    const html = [
      '<section class="slide" style="min-height:100vh"><h1>Cover</h1>',
      '<div class="slide-chrome">01 / Studio</div>',
      '</section>',
      '<section class="slide" style="min-height:100vh">Body</section>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toMatch(/class="slide"[^>]*width:1920px/);
    expect(pinned).not.toMatch(/class="slide-chrome"[^>]*width:1920px/);
  });

  it('does not treat .slide-chrome opacity rules as author class-toggle', () => {
    expect(looksLikeAuthorClassToggleDeck([
      '<style>.slide-chrome{opacity:0}.slide.active{opacity:1}</style>',
      '<section class="slide">A</section><section class="slide">B</section>',
    ].join(''))).toBe(false);
    expect(looksLikeAuthorClassToggleDeck([
      '<style>.slide{opacity:0}.slide.active{opacity:1}</style>',
      '<section class="slide">A</section><section class="slide">B</section>',
    ].join(''))).toBe(true);
  });
});

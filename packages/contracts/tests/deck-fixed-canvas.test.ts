import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DECK_FIXED_CANVAS_PIN_ATTR,
  DECK_SLIDE_FLOW_ATTR,
  htmlHasDeckSlideHost,
  htmlLooksLikeNavigableDeckPreview,
  htmlLooksLikeSlideDeliverableStream,
  indexOfFirstDeckSlideHost,
  looksLikeDeckSlideHostAttrs,
  pinDeckSlidesToFixedCanvas,
} from '../src/html/deck-fixed-canvas.js';
import { looksLikeOfficialFullscreenPresenterDeck } from '../src/html/deck-template-look-css.js';
import {
  attrsLookLikeDeckOrTemplateSlideHost,
  classAttrHasDeckSlideToken,
  countDeckSlideHostOpens,
  findFirstDeckSlideHostIndex,
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
    expect(pinned).toMatch(/contain:\s*layout size/);
  });

  it('flows MiniMax absolute labels so they cannot sit inside another card', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div class="card" style="position:absolute;top:80px;left:80px;width:800px">02 Viewport</div>',
      '<span style="position:absolute;top:120px;left:420px">05 / CHECKLIST</span>',
      '<div class="deco-daisy" style="position:absolute;top:0;right:0">motif</div>',
      '</section>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toMatch(/class="card"[^>]*position:relative/);
    expect(pinned).not.toContain('05 / CHECKLIST');
    expect(pinned).toMatch(/<div data-od-slide-flow><div class="card"/);
    expect(pinned).toMatch(/<\/div><div class="deco-daisy"/);
    expect(pinned).toMatch(/class="deco-daisy"[^>]*position:absolute/);
    expect(pinned).toMatch(/contain:\s*layout size/);
    expect(pinned).not.toMatch(/class="slide"[^>]*overflow:\s*hidden/);
  });

  it('strips absolute div index badges but keeps in-flow slide-chrome', () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div style="position:absolute;top:24px;left:40px">05 / CHECKLIST</div>',
      '<div class="index-badge" style="position:absolute;top:24px;right:40px">06 / SUMMARY</div>',
      '<div class="slide-chrome">01 / Studio</div>',
      '<div class="info-card">Card body</div>',
      '</section>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toContain('05 / CHECKLIST');
    expect(pinned).not.toContain('06 / SUMMARY');
    expect(pinned).toContain('01 / Studio');
    expect(pinned).toContain('Card body');
  });

  it('does not wrap display:grid slide children into a flow clip', () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px;display:grid;grid-template-columns:1fr 1fr">',
      '<div class="card">Left</div><div class="card">Right</div>',
      '</section>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<div\s+data-od-slide-flow\b/);
  });

  it('binds MiniMax navy/blue outline boxes to official kit card classes', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div style="border:2px solid #2563eb;padding:24px">Viewport matrix</div>',
      '</section>',
      '<style data-od-official-look-css>.info-card{border:var(--border-width) solid var(--border)}</style>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toMatch(/class="[^"]*\binfo-card\b/);
    expect(pinned).not.toMatch(/border:2px solid #2563eb/);
    expect(pinned).toContain(DECK_SLIDE_FLOW_ATTR);
  });

  it('binds MiniMax indigo outline boxes to official kit card classes', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div style="border:2px solid #4f46e5;padding:24px">Indigo frame</div>',
      '</section>',
      '<style data-od-official-look-css>.card{box-shadow:var(--shadow)}</style>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toMatch(/class="[^"]*\bcard\b/);
    expect(pinned).not.toMatch(/border:2px solid #4f46e5/);
  });

  it('binds MiniMax cyan/sky outline boxes to official kit card classes', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div style="outline:2px solid #06b6d4;padding:24px">Cyan frame</div>',
      '<div style="border:1px solid #0ea5e9;padding:16px">Sky frame</div>',
      '</section>',
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toMatch(/class="[^"]*\binfo-card\b/);
    expect(pinned).not.toMatch(/#06b6d4/);
    expect(pinned).not.toMatch(/#0ea5e9/);
  });

  it('binds invented 1–2px frames regardless of MiniMax color dialect', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div style="border:2px solid #7c3aed;padding:24px">Violet rgb-hex</div>',
      '<div style="border:2px solid rgb(37, 99, 235);padding:16px">Blue rgb()</div>',
      '<div style="outline:1px solid rgba(79, 70, 229, 0.9);padding:16px">Indigo rgba()</div>',
      '<div style="border:2px solid blue;padding:16px">Named blue</div>',
      '<div style="box-shadow:0 0 0 2px #10b981;padding:16px">Emerald ring</div>',
      '<div style="border:1px solid var(--border);padding:16px">Keep kit token</div>',
      '</section>',
      '<style data-od-official-look-css>.info-card{border:var(--border-width) solid var(--border)}</style>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/#7c3aed/);
    expect(pinned).not.toMatch(/rgb\(37,\s*99,\s*235\)/);
    expect(pinned).not.toMatch(/rgba\(79,\s*70,\s*229/);
    expect(pinned).not.toMatch(/box-shadow:0 0 0 2px #10b981/);
    expect(pinned).not.toMatch(/border:2px solid blue/);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('binds MiniMax li/hsl invented frames to official kit card classes', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<ul>',
      '<li style="border:2px solid hsl(239 84% 67%);padding:16px">HSL card</li>',
      '<li style="border:2px solid #7c3aed;padding:16px">Hex li</li>',
      '</ul>',
      '</section>',
      '<style data-od-official-look-css>.info-card{border:var(--border-width) solid var(--border)}</style>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/hsl\(239/);
    expect(pinned).not.toMatch(/#7c3aed/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('strips nested and heading MiniMax index badges', () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div class="card" style="position:relative">',
      '<span style="position:absolute;top:12px;right:16px">05 / CHECKLIST</span>',
      '<h2 style="position:absolute;top:20px;left:24px">06 · SUMMARY</h2>',
      '<header style="position:fixed;top:16px;right:24px">07 / OUTRO</header>',
      '<span style="position:absolute;top:8px;left:8px">5 / CHECKLIST</span>',
      '<p>Viewport matrix</p>',
      '</div>',
      '<div class="slide-chrome">01 / Studio</div>',
      '</section>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toContain('05 / CHECKLIST');
    expect(pinned).not.toContain('06 · SUMMARY');
    expect(pinned).not.toContain('07 / OUTRO');
    expect(pinned).not.toContain('5 / CHECKLIST');
    expect(pinned).toContain('01 / Studio');
    expect(pinned).toContain('Viewport matrix');
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
    expect(pinned).not.toMatch(/\.slide\s*\{[^}]*overflow:\s*hidden/i);
    expect(pinned).toMatch(/\[data-od-slide-flow\][\s\S]*overflow:\s*hidden/);
  });

  it('force-pins official #deck catalog presenters for compact letterbox (§0.93)', () => {
    const html = readFileSync(join(EXAMPLES_DIR, 'html-ppt-zhangzara-studio/example.html'), 'utf8');
    expect(pinDeckSlidesToFixedCanvas(html)).toBe(html);
    const forced = pinDeckSlidesToFixedCanvas(html, { force: true });
    expect(forced).toContain(DECK_FIXED_CANVAS_PIN_ATTR);
    expect(forced).toMatch(/\.slide,[\s\S]*\{[^}]*width:\s*1920px\s*!important/i);
    expect(forced).toMatch(/overflow:\s*visible\s*!important/i);
  });

  it('does not flow authored absolute cards on official presenters even when force-pinning', () => {
    const html = [
      '<!doctype html><html><head><style>',
      '.slide { position:absolute; width:100%; height:100%; opacity:0 }',
      '.slide.active { opacity:1 }',
      '</style></head><body>',
      '<div id="deck">',
      '<section class="slide active" style="width:100vw;height:100vh">',
      '<div class="split-card" style="position:absolute;top:80px;left:80px">Keep me</div>',
      '</section>',
      '<section class="slide">Body</section>',
      '</div></body></html>',
    ].join('');
    expect(looksLikeOfficialFullscreenPresenterDeck(html)).toBe(true);
    const forced = pinDeckSlidesToFixedCanvas(html, { force: true });
    expect(forced).toMatch(/class="split-card"[^>]*position:absolute/);
    expect(forced).toContain('top:80px');
    expect(forced).toContain(DECK_FIXED_CANVAS_PIN_ATTR);
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

  it('does not treat chrome-only HTML as a navigable deck preview', () => {
    const chromeOnly = [
      '<div class="slide-counter">1 / 10</div>',
      '<div class="slide-chrome">Studio</div>',
    ].join('');
    expect(htmlHasDeckSlideHost(chromeOnly)).toBe(false);
    expect(htmlLooksLikeNavigableDeckPreview(chromeOnly)).toBe(false);
    expect(htmlLooksLikeNavigableDeckPreview(
      '<section class="slide"><h1>Cover</h1></section>',
    )).toBe(true);
    expect(htmlLooksLikeNavigableDeckPreview('<deck-stage></deck-stage>')).toBe(true);
    expect(htmlHasDeckSlideHost(
      '<section class="s1" data-screen-label="01 Cover">Title</section>',
    )).toBe(true);
  });

  it('does not treat chrome-only HTML as a slide deliverable stream', () => {
    expect(htmlLooksLikeSlideDeliverableStream('')).toBe(false);
    expect(htmlLooksLikeSlideDeliverableStream(
      '<div class="slide-counter">1 / 10</div><section class="slide-chrome">Studio</section>',
    )).toBe(false);
    expect(htmlLooksLikeSlideDeliverableStream(
      '<section class="s1" data-screen-label="01 Cover"><h1>Cover</h1></section>',
    )).toBe(true);
    expect(htmlLooksLikeSlideDeliverableStream('<!doctype html><html><body></body></html>')).toBe(true);
    expect(indexOfFirstDeckSlideHost(
      '<div class="slide-counter">1</div><section class="slide"><h1>A</h1></section>',
    )).toBeGreaterThan(0);
  });

  it('finds the first real page host after slide-counter / slide-chrome', () => {
    const html = [
      '<div class="slide-counter">5 / 10</div>',
      '<div class="slide-chrome">Studio</div>',
      '<section class="slide"><h1>The Collective</h1></section>',
    ].join('');
    expect(attrsLookLikeDeckOrTemplateSlideHost('class="slide-chrome"')).toBe(false);
    expect(attrsLookLikeDeckOrTemplateSlideHost('class="slide-counter" id="slide-counter"')).toBe(false);
    expect(attrsLookLikeDeckOrTemplateSlideHost('class="s1"')).toBe(true);
    expect(attrsLookLikeDeckOrTemplateSlideHost('id="slide"')).toBe(true);
    expect(attrsLookLikeDeckOrTemplateSlideHost('id="slide-3"')).toBe(true);
    expect(attrsLookLikeDeckOrTemplateSlideHost('id="slide-counter"')).toBe(false);
    const hostAt = findFirstDeckSlideHostIndex(html);
    expect(hostAt).toBe(html.indexOf('<section class="slide"'));
    expect(findFirstDeckSlideHostIndex(
      '<div class="slide-counter">5 / 10</div><div class="slide-chrome">x</div>',
    )).toBe(-1);
    expect(indexOfFirstDeckSlideHost(html)).toBe(hostAt);
  });
});

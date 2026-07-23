// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEmergencySlideDeckFromOutline } from '../../src/artifacts/emergency-deck';
import {
  looksLikeCompactApiStackedDeck,
  looksLikeCompactApiStackedDeckForPreview,
  wrapPreviewHtmlShell,
} from '../../src/runtime/compact-api-stacked-deck';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

const repoRoot = resolve(import.meta.dirname, '../../../..');

describe('looksLikeCompactApiStackedDeck', () => {
  it('matches API compact body-first slides without head chrome', () => {
    const html = [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide" style="min-height:100vh;padding:64px">A</section>',
      '<section class="slide" style="min-height:100vh;padding:64px">B</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
  });

  it('detects compact fragments after the same preview shell wrap as buildSrcdoc', () => {
    const fragment = '<section class="slide" style="min-height:100vh">A</section>';
    expect(looksLikeCompactApiStackedDeck(fragment)).toBe(false);
    expect(looksLikeCompactApiStackedDeckForPreview(fragment)).toBe(true);
    expect(looksLikeCompactApiStackedDeck(wrapPreviewHtmlShell(fragment))).toBe(true);
  });

  it('rejects framework decks with #deck-stage', () => {
    const html = readFileSync(resolve(repoRoot, 'templates/deck-framework.html'), 'utf8');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
  });

  it('rejects horizontal scroll-snap simple-deck templates', () => {
    const html = readFileSync(resolve(repoRoot, 'design-templates/simple-deck/assets/template.html'), 'utf8');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
  });

  it('rejects decks wrapped in a .deck container under body', () => {
    const html = [
      '<!doctype html><html><body>',
      '<div class="deck">',
      '<section class="slide" style="min-height:100vh">A</section>',
      '</div></body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
  });

  it('rejects emergency fallback decks that ship stylesheet min-height rules', () => {
    const html = buildEmergencySlideDeckFromOutline('1. Intro\n2. Body\n3. Close', { lang: 'ko' });
    expect(html).toBeTruthy();
    expect(looksLikeCompactApiStackedDeck(html!)).toBe(false);
  });

  it('locks portfolio-style compact decks to overflow hidden and stacked prev/next', async () => {
    const slides = [
      '<section class="slide" data-screen-label="01 Cover" style="min-height:100vh">',
      '<h1>김민준 <span>Frontend</span> Engineer</h1>',
      '</section>',
      '<section class="slide" data-screen-label="02 Projects" style="min-height:100vh">',
      '<h2>무엇을 만들었나요</h2>',
      '</section>',
    ].join('');
    const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#0b0c10">${slides}</body></html>`;
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toContain('overflow: hidden !important');
    expect(srcdoc).toContain('var compactStackedDeckEnabled = true');

    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(`<!doctype html><html><body>${slides}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: () => {} },
    });
    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.Event('load'));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 500));

    expect(win.document.documentElement.getAttribute('data-od-stacked-deck')).toBe('');
    const stage = win.document.getElementById('od-stacked-deck-stage');
    expect(stage).toBeTruthy();
    const slideEls = Array.from(win.document.querySelectorAll('#od-stacked-deck-stage > .slide')) as HTMLElement[];
    expect(slideEls).toHaveLength(2);
    expect(slideEls.filter((el) => el.style.display !== 'none')).toHaveLength(1);

    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    expect(slideEls[0]?.style.display).toBe('none');
    expect(slideEls[1]?.style.display).not.toBe('none');
  });

  it('does not inject stacked letterbox CSS into framework or authored decks', () => {
    const framework = readFileSync(resolve(repoRoot, 'templates/deck-framework.html'), 'utf8');
    const simpleDeck = readFileSync(resolve(repoRoot, 'design-templates/simple-deck/assets/template.html'), 'utf8');
    const compact = '<!doctype html><html><body><section class="slide" style="min-height:100vh">A</section></body></html>';

    expect(buildSrcdoc(framework, { deck: true })).not.toContain('data-od-deck-stacked-fix');
    expect(buildSrcdoc(simpleDeck, { deck: true })).not.toContain('data-od-deck-stacked-fix');
    const compactOut = buildSrcdoc(compact, { deck: true });
    expect(compactOut).toContain('data-od-deck-stacked-fix');
    expect(compactOut).toContain('var compactStackedDeckEnabled = true');
    expect(buildSrcdoc(simpleDeck, { deck: true })).not.toMatch(/html,\s*body\s*\{[^}]*overflow:\s*hidden\s*!important/);
  });
});

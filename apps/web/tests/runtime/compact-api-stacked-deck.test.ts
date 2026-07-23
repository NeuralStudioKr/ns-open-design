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

  it('matches emergency fallback decks that ship stylesheet min-height rules', () => {
    const html = buildEmergencySlideDeckFromOutline('1. Intro\n2. Body\n3. Close', { lang: 'ko' });
    expect(html).toBeTruthy();
    expect(looksLikeCompactApiStackedDeck(html!)).toBe(true);
  });

  it('matches generated body-first slide decks that include local CSS and navigation script', () => {
    const html = [
      '<!doctype html><html lang="ko"><head>',
      '<style>body{margin:0}.slide{min-height:100vh;padding:96px;background:#0f172a;color:white}</style>',
      '</head><body>',
      '<section class="slide"><h1>김민준</h1><p>Full-Stack Developer</p></section>',
      '<section class="slide"><h1>Projects</h1></section>',
      '<script>document.addEventListener("keydown",function(e){ if(e.key==="ArrowRight"){} });</script>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
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

  it('reconstructs fixed-stage deck layout viewport from host zoom scale', () => {
    const compact = '<!doctype html><html><body><section class="slide" style="min-height:100vh">A</section></body></html>';
    const out = buildSrcdoc(compact, { deck: true });

    expect(out).toContain('if (hostViewport.layoutFit && scale > 0)');
    expect(out).toContain('return { w: hw / scale, h: hh / scale };');
  });

  it('keeps explicit horizontal scroll-snap decks on their native path', () => {
    const html = [
      '<!doctype html><html><head><style>',
      'body{overflow-x:auto;scroll-snap-type:x mandatory}.slide{min-height:100vh;scroll-snap-align:start}',
      '</style></head><body>',
      '<section class="slide">A</section><section class="slide">B</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
    expect(buildSrcdoc(html, { deck: true })).not.toContain('data-od-deck-stacked-fix');
  });

  it('keeps transform-track decks on their native runtime path', () => {
    const html = [
      '<!doctype html><html><head><style>',
      '#deck{display:flex;width:300vw;transform:translateX(0)}.slide{flex:0 0 100vw;height:100vh}',
      '</style></head><body>',
      '<div id="deck">',
      '<section class="slide">A</section><section class="slide">B</section>',
      '</div>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
    expect(buildSrcdoc(html, { deck: true })).not.toContain('data-od-deck-stacked-fix');
  });
});

// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { looksLikeOfficialFullscreenPresenterDeck } from '@open-design/contracts';
import { buildEmergencySlideDeckFromOutline } from '../../src/artifacts/emergency-deck';
import {
  injectStackedDeckViewport,
  looksLikeAuthoredHorizontalSwipeDeck,
  looksLikeAuthoredScrollNavigateDeck,
  looksLikeCompactApiStackedDeck,
  looksLikeCompactApiStackedDeckForPreview,
  normalizeCompactStackedDeckForExport,
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

  it('supports alreadyRepaired wrap skip for buildSrcdoc hot path', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../src/runtime/compact-api-stacked-deck.ts'),
      'utf8',
    );
    expect(source).toContain('alreadyRepaired');
    expect(source).toContain('WrapPreviewHtmlShellOptions');
    expect(source).toContain('repairArtifactDocumentHeadIfNeeded');
    expect(source).toContain('prepareCompactStackedDeckPreviewHtml');
    // Fragment shell final pass is intact-gated (not always repairArtifactDocumentHead).
    expect(source).toContain('return repairArtifactDocumentHeadIfNeeded(wrapped)');
    expect(source).not.toContain('return repairArtifactDocumentHead(wrapped)');
    expect(wrapPreviewHtmlShell('<main>x</main>', { alreadyRepaired: true })).toContain('<!doctype html>');
  });

  it('rejects framework decks with #deck-stage', () => {
    const html = readFileSync(resolve(repoRoot, 'templates/deck-framework.html'), 'utf8');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
  });

  it('rejects horizontal scroll-snap simple-deck templates', () => {
    const html = readFileSync(resolve(repoRoot, 'design-templates/simple-deck/assets/template.html'), 'utf8');
    expect(looksLikeAuthoredHorizontalSwipeDeck(html)).toBe(true);
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
  });

  it('rejects marketing-style html,body horizontal flex decks without mistaking them for stacked', () => {
    const html = [
      '<!doctype html><html lang="ko"><body style="margin:0">',
      '<section class="slide" style="min-height:100vh">Cover</section>',
      '<section class="slide" style="min-height:100vh">Roadmap</section>',
      '<style>',
      'html,body{margin:0;scroll-snap-type:x mandatory;display:flex;overflow-x:auto;width:100vw}',
      '.slide{min-width:100vw;scroll-snap-align:start;min-height:100vh}',
      '</style>',
      '</body></html>',
    ].join('');
    expect(looksLikeAuthoredHorizontalSwipeDeck(html)).toBe(true);
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
    expect(buildSrcdoc(html, { deck: true })).not.toContain('data-od-deck-stacked-fix');
  });

  it('rejects html,body row-flex horizontal overflow even without scroll-snap', () => {
    const html = [
      '<!doctype html><html><head><style>',
      'html,body{margin:0;display:flex;overflow-x:auto;min-height:100vh}',
      '.slide{flex:0 0 100vw;min-height:100vh}',
      '</style></head><body>',
      '<section class="slide">A</section><section class="slide">B</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
  });

  it('matches slides sized with height:100vh in stylesheet rules', () => {
    const html = [
      '<!doctype html><html><head><style>',
      'body{margin:0} .slide{height:100vh;padding:48px}',
      '</style></head><body>',
      '<section class="slide">A</section><section class="slide">B</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
  });

  it('matches fixed 1920x1080 body-first decks without viewport-height CSS', () => {
    const html = [
      '<!doctype html><html><head><style>',
      'body{margin:0;background:#0b0c10}.slide{width:1920px;height:1080px;box-sizing:border-box;position:relative;overflow:hidden}',
      '</style></head><body>',
      '<section class="slide"><h1>Cover</h1></section>',
      '<section class="slide"><h2>Agenda</h2></section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toContain('data-od-deck-stacked-fix');
    expect(srcdoc).toContain('width=1920, initial-scale=1');
  });

  it('matches inline fixed slide styles regardless of attribute order', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section style="width:1920px;height:1080px;position:relative;overflow:hidden" class="theme slide">Cover</section>',
      '<section style="width:1920px;height:1080px;position:relative;overflow:hidden" class="theme slide">Agenda</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    expect(buildSrcdoc(html, { deck: true })).toContain('data-od-deck-stacked-fix');
  });

  it('matches fixed decks that use min-height instead of height', () => {
    const html = [
      '<!doctype html><html><head><style>',
      'body{margin:0}.slide{width:1920px;min-height:1080px;box-sizing:border-box;position:relative;overflow:hidden}',
      '</style></head><body>',
      '<section class="slide">Cover</section>',
      '<section class="slide">Agenda</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    expect(buildSrcdoc(html, { deck: true })).toContain('data-od-deck-stacked-fix');
  });

  it('recovers legacy body-first multi-slide decks that omitted sizing CSS', () => {
    const html = [
      '<!doctype html><html><head><style>',
      'body{margin:0;background:#17251a}.slide{padding:96px;background:#213c2a;color:#f7ead4}',
      '.slide h1{font-size:clamp(64px,8vw,148px)}',
      '</style></head><body>',
      '<section class="slide"><h1>토익 첫 수업에 오신 것을 환영합니다</h1></section>',
      '<section class="slide"><h2>커리큘럼 안내</h2></section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toContain('data-od-deck-stacked-fix');
    expect(srcdoc).toContain('width=1920, initial-scale=1');
  });

  it('keeps bare root-scroll slide decks on their native path', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide">One</section>',
      '<section class="slide">Two</section>',
      '<section class="slide">Three</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
    expect(buildSrcdoc(html, { deck: true })).not.toContain('data-od-deck-stacked-fix');
  });

  it('matches body-first slides after a header chrome element', () => {
    const html = [
      '<!doctype html><html><body>',
      '<header>PORTFOLIO</header>',
      '<section class="slide" style="min-height:100vh">A</section>',
      '<section class="slide" style="min-height:100vh">B</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
  });

  it('matches styled vertical creative decks with body > .slide and a <style> block', () => {
    const html = [
      '<!doctype html><html lang="ko"><head>',
      '<style>',
      'body { margin: 0; display: flex; flex-direction: column; background: #faf8f2; }',
      '.slide { min-height: 100vh; padding: clamp(48px, 6vw, 96px); position: relative; }',
      'h1 { font-size: clamp(64px, 10vw, 120px); }',
      '</style></head><body>',
      '<section class="slide" data-screen-label="01 Cover"><h1>KIM SEUNGHYUN</h1></section>',
      '<section class="slide" data-screen-label="02 Projects"><h2>Projects</h2></section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toContain('data-od-deck-stacked-fix');
    expect(srcdoc).toContain('width=1920, initial-scale=1');
  });

  it('matches slides wrapped in a single body child container', () => {
    const html = [
      '<!doctype html><html><body>',
      '<div class="slides-root">',
      '<section class="slide" style="min-height:100vh">A</section>',
      '<section class="slide" style="min-height:100vh">B</section>',
      '</div></body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
  });

  it('locks the iframe viewport to 1920px for stacked letterbox decks', () => {
    const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>'
      + '<body><section class="slide" style="min-height:100vh">A</section></body></html>';
    expect(injectStackedDeckViewport(html)).toContain('width=1920, initial-scale=1, maximum-scale=1');
    expect(injectStackedDeckViewport(html)).not.toContain('width=device-width');
  });

  it('letterboxes body-first 100vh slides wrapped in a .deck container', () => {
    const html = [
      '<!doctype html><html><body>',
      '<div class="deck">',
      '<section class="slide" style="min-height:100vh">A</section>',
      '<section class="slide" style="min-height:100vh">B</section>',
      '</div></body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    expect(buildSrcdoc(html, { deck: true })).toContain('data-od-deck-stacked-fix');
  });

  it('letterboxes body-first 100vh slides wrapped in a .presentation shell without official look', () => {
    const html = [
      '<!doctype html><html><body>',
      '<div class="presentation">',
      '<section class="slide" style="min-height:100vh;background:#0b0c10;color:#f5d76e">A</section>',
      '<section class="slide" style="min-height:100vh">B</section>',
      '</div></body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toContain('data-od-deck-stacked-fix');
    expect(srcdoc).toContain('width: 1920px !important');
    expect(srcdoc).toContain('height: 1080px !important');
    expect(srcdoc).toContain('data-od-deck-fixed-canvas-pin');
  });

  it('matches body-first slides when a <style> block precedes them in body', () => {
    const html = [
      '<!doctype html><html><body>',
      '<style>.slide{min-height:100vh}body{display:flex;flex-direction:column}</style>',
      '<section class="slide">A</section>',
      '<section class="slide">B</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
  });

  it('includes emergency fallback decks that stack body > .slide vertically', () => {
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

  it('locks portfolio-style compact decks to stacked letterbox without Motif-hostile slide clip', { timeout: 15_000 }, async () => {
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
    // html/body may still clip for pan; slide hosts must stay Motif-safe.
    expect(srcdoc).toMatch(/#od-stacked-deck-stage\s*>\s*\.slide\s*\{[^}]*overflow:\s*visible\s*!important/i);
    expect(srcdoc).toContain('bootstrapCompactStackedDeck');
    expect(srcdoc).toContain('data-od-stacked-deck-ready');
    expect(srcdoc).toContain('od:stacked-deck-ready');

    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(`<!doctype html><html><body>${slides}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://stg-design.teamver.test/',
    });
    const win = dom.window;
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });
    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.Event('load'));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 500));

    expect(win.document.documentElement.getAttribute('data-od-stacked-deck')).toBe('');
    const stage = win.document.getElementById('od-stacked-deck-stage');
    expect(stage).toBeTruthy();
    const slideEls = Array.from(win.document.querySelectorAll('#od-stacked-deck-stage > .slide')) as HTMLElement[];
    expect(slideEls).toHaveLength(2);

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 50));
    expect(win.document.documentElement.getAttribute('data-od-stacked-deck-ready')).toBe('');
    expect(slideEls.filter((el) => el.style.display !== 'none')).toHaveLength(1);
    expect(parentPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od:stacked-deck-ready' }),
      '*',
    );

    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    expect(slideEls[0]?.style.display).toBe('none');
    expect(slideEls[1]?.style.display).toBe('flex');
  });

  it('letterboxes data-screen-label slide hosts that omit the slide class', { timeout: 15_000 }, async () => {
    const html = [
      '<!doctype html><html lang="ko"><body style="margin:0;background:#1d1d1b">',
      '<section data-screen-label="01 Cover" style="min-height:100vh;padding:96px;color:#d6c20f">',
      '<h1>CLOUD NATIVE</h1>',
      '</section>',
      '<section data-screen-label="02 Body" style="min-height:100vh;padding:96px;color:#d6c20f">',
      '<h2>Runtime</h2>',
      '</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toContain('data-od-deck-stacked-fix');
    expect(srcdoc).toContain('data-od-deck-fixed-canvas-pin');
    expect(srcdoc).toContain('[data-screen-label]');

    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://stg-design.teamver.test/',
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage: () => {} } });
    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 100));

    const slideEls = Array.from(win.document.querySelectorAll('#od-stacked-deck-stage > .slide')) as HTMLElement[];
    expect(slideEls).toHaveLength(2);
    expect(slideEls[0]?.getAttribute('data-screen-label')).toBe('01 Cover');
    expect(slideEls[0]?.style.display).toBe('flex');
    expect(slideEls[1]?.style.display).toBe('none');
  });

  it('does not hoist inner data-screen-label comment targets as extra slides', { timeout: 15_000 }, async () => {
    const html = [
      '<!doctype html><html lang="ko"><body style="margin:0">',
      '<section class="slide" style="width:1920px;height:1080px;padding:96px">',
      '<div data-screen-label="eyebrow">Context</div>',
      '<h1 data-screen-label="title">Cover</h1>',
      '</section>',
      '<section class="slide" style="width:1920px;height:1080px;padding:96px">',
      '<h2>Body</h2>',
      '</section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window;
    Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage: () => {} } });
    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 100));

    const slideEls = Array.from(win.document.querySelectorAll('#od-stacked-deck-stage > .slide')) as HTMLElement[];
    expect(slideEls).toHaveLength(2);
    expect(win.document.querySelectorAll('[data-screen-label="eyebrow"]').length).toBe(1);
  });

  it('reveals slide 2 for body-leading style portfolio decks on next navigation', async () => {
    const html = [
      '<!doctype html><html lang="ko"><body style="margin:0">',
      '<style>.slide{min-height:100vh;display:flex;flex-direction:column}</style>',
      '<section class="slide" style="background:#111;color:#fff"><h1>김민준</h1></section>',
      '<section class="slide" style="background:#fafafa;color:#111"><h2>Projects</h2></section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window;
    Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage: () => {} } });
    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 100));

    const slideEls = Array.from(win.document.querySelectorAll('#od-stacked-deck-stage > .slide')) as HTMLElement[];
    expect(slideEls).toHaveLength(2);
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 50));
    expect(slideEls[0]?.style.display).toBe('none');
    expect(slideEls[1]?.style.display).toBe('flex');
    expect(win.getComputedStyle(slideEls[1]!).display).toBe('flex');
  });

  it('keeps fixed-canvas decks visible on navigation even when authored CSS hides inactive slides', async () => {
    const html = [
      '<!doctype html><html lang="ko"><head><style>',
      'body{margin:0;background:#0b0c10}',
      '.slide{width:1920px;height:1080px;box-sizing:border-box;display:none;position:relative;overflow:hidden;background:#10251a;color:#f5ead7}',
      '.slide.active{display:flex;flex-direction:column}',
      '</style></head><body>',
      '<section class="slide active"><h1>토익 첫 수업</h1></section>',
      '<section class="slide"><h2>커리큘럼 안내</h2></section>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window;
    Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage: () => {} } });
    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 100));

    const slideEls = Array.from(win.document.querySelectorAll('#od-stacked-deck-stage > .slide')) as HTMLElement[];
    expect(slideEls).toHaveLength(2);
    expect(slideEls[0]?.style.display).toBe('flex');
    expect(slideEls[1]?.style.display).toBe('none');

    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 50));
    expect(slideEls[0]?.style.display).toBe('none');
    expect(slideEls[1]?.style.display).toBe('flex');
    expect(slideEls[1]?.classList.contains('active')).toBe(true);
  });

  it('does not inject stacked letterbox CSS into framework or authored decks', () => {
    const framework = readFileSync(resolve(repoRoot, 'templates/deck-framework.html'), 'utf8');
    const simpleDeck = readFileSync(resolve(repoRoot, 'design-templates/simple-deck/assets/template.html'), 'utf8');
    const compact = '<!doctype html><html><body><section class="slide" style="min-height:100vh">A</section></body></html>';

    expect(buildSrcdoc(framework, { deck: true })).not.toContain('data-od-deck-stacked-fix');
    expect(buildSrcdoc(simpleDeck, { deck: true })).not.toContain('data-od-deck-stacked-fix');
    const compactOut = buildSrcdoc(compact, { deck: true });
    expect(compactOut).toContain('data-od-deck-stacked-fix');
    expect(compactOut).toContain('data-od-stacked-boot');
    expect(compactOut).toContain('data-od-compact-stacked');
    expect(compactOut).toContain('data-od-stacked-deck-ready');
    expect(buildSrcdoc(simpleDeck, { deck: true })).not.toMatch(/html,\s*body\s*\{[^}]*overflow:\s*hidden\s*!important/);
  });

  it('reconstructs fixed-stage deck layout viewport from host zoom scale', () => {
    const compact = '<!doctype html><html><body><section class="slide" style="min-height:100vh">A</section></body></html>';
    const out = buildSrcdoc(compact, { deck: true });

    expect(out).toContain('if (hostViewport.layoutFit && scale > 0)');
    expect(out).toContain('return { w: hw / scale, h: hh / scale };');
  });

  it('waits for host viewport before fitting compact decks (avoids black letterbox)', () => {
    const compact = '<!doctype html><html><body><section class="slide" style="min-height:100vh">A</section></body></html>';
    const out = buildSrcdoc(compact, { deck: true });

    // Inflated 1920 document width alone must not end chaseFirstLayout.
    expect(out).toContain('if (compactStackedDeckEnabled) {\n      return { w: 0, h: 0 };\n    }');
    expect(out).toContain('var maxAttempts = compactStackedDeckEnabled ? 60 : 30');
    expect(out).toContain('var maxSlowAttempts = 30');
    expect(out).toContain("document.documentElement.hasAttribute('data-od-stacked-deck-ready')");
    expect(out).not.toContain('if (hasHost && w > 0 && attempts >= 2) return;');
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

  it('letterboxes #deck viewport transform-track decks instead of letting iframe ratio reflow them', () => {
    const html = [
      '<!doctype html><html><head><style>',
      '#deck{display:flex;width:300vw;transform:translateX(0)}.slide{flex:0 0 100vw;height:100vh}',
      '</style></head><body>',
      '<div id="deck">',
      '<section class="slide">A</section><section class="slide">B</section>',
      '</div>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    expect(buildSrcdoc(html, { deck: true })).toContain('data-od-deck-stacked-fix');
  });

  it('letterboxes Zhangzara #deck viewport-track catalog decks for Teamver preview', () => {
    const templatesRoot = resolve(repoRoot, 'design-templates');
    const matchingTemplates = readdirSync(templatesRoot)
      .filter((name) => name.startsWith('html-ppt-zhangzara-'))
      .filter((name) => {
        const html = readFileSync(resolve(templatesRoot, name, 'example.html'), 'utf8');
        return /id\s*=\s*["']deck["']/i.test(html)
          && /#deck\b[^{]*\{[\s\S]*?display\s*:\s*flex/i.test(html)
          && /\.slide\b[^{]*\{[\s\S]*?(?:flex\s*:\s*0\s+0\s+100vw|width\s*:\s*100vw|height\s*:\s*100vh)/i.test(html);
      });

    expect(matchingTemplates).toEqual(expect.arrayContaining([
      'html-ppt-zhangzara-broadside',
      'html-ppt-zhangzara-grove',
      'html-ppt-zhangzara-mat',
      'html-ppt-zhangzara-monochrome',
      'html-ppt-zhangzara-signal',
      'html-ppt-zhangzara-studio',
      'html-ppt-zhangzara-vellum',
    ]));

    for (const templateName of matchingTemplates) {
      const html = readFileSync(resolve(templatesRoot, templateName, 'example.html'), 'utf8');
      expect(looksLikeAuthoredHorizontalSwipeDeck(html), templateName).toBe(false);
      expect(looksLikeCompactApiStackedDeck(html), templateName).toBe(true);
      const srcdoc = buildSrcdoc(html, { deck: true });
      expect(srcdoc, templateName).toContain('data-od-deck-stacked-fix');
      expect(srcdoc, templateName).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
      expect(srcdoc, templateName).toContain('#od-stacked-deck-stage');
      // Dual-classified official presenters must still force pin + neutralize
      // on the compact letterbox path (§0.93).
      expect(srcdoc, templateName).toContain('data-od-deck-fixed-canvas-pin');
      expect(srcdoc, templateName).toContain('data-od-stacked-canvas-neutralize');
      expect(srcdoc, templateName).toMatch(/#deck\b[^\{]*\{[^}]*flex-direction:\s*column\s*!important/i);
      expect(srcdoc, templateName).toContain('data-od-authored-display');
      expect(srcdoc, templateName).toContain('stopImmediatePropagation');
    }
  });

  it('hoists Zhangzara Studio #deck strips into host-controlled stacked navigation', { timeout: 15_000 }, async () => {
    const studio = readFileSync(
      resolve(repoRoot, 'design-templates/html-ppt-zhangzara-studio/example.html'),
      'utf8',
    );
    const srcdoc = buildSrcdoc(studio, { deck: true });
    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();

    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://stg-design.teamver.test/',
    });
    const win = dom.window;
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });

    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 1280, height: 720, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 120));

    const stage = win.document.getElementById('od-stacked-deck-stage');
    expect(stage).toBeTruthy();
    const slideEls = Array.from(win.document.querySelectorAll('#od-stacked-deck-stage > .slide')) as HTMLElement[];
    expect(slideEls.length).toBeGreaterThan(1);
    expect(slideEls[0]?.style.display).toBe('flex');
    expect(slideEls[1]?.style.display).toBe('none');

    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 80));

    expect(slideEls[0]?.style.display).toBe('none');
    expect(slideEls[1]?.style.display).toBe('flex');
    const states = parentPostMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === 'od:slide-state');
    expect(states.at(-1)).toMatchObject({ active: 1, count: slideEls.length });
  });

  it('treats deck-shell wrappers without #deck-stage as compact stacked decks', () => {
    const html = [
      '<!doctype html><html><body>',
      '<div class="deck-shell"><div class="deck-stage">',
      '<section class="slide" style="width:1920px;height:1080px;position:absolute;inset:0">Cover</section>',
      '<section class="slide" style="width:1920px;height:1080px;position:absolute;inset:0">Agenda</section>',
      '</div></div>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    expect(buildSrcdoc(html, { deck: true })).toContain('data-od-deck-stacked-fix');
  });

  it('keeps non-compact scrollIntoView-authored slide decks on native scroll navigation', () => {
    const navScript = `(function(){
var slides=document.querySelectorAll('.slide');
var cur=0;
function go(n){
n=Math.max(0,Math.min(slides.length-1,n));
slides[n].scrollIntoView({behavior:'smooth'});
cur=n;
}
document.addEventListener('keydown',function(e){
if(e.key==='ArrowRight'||e.key==='ArrowDown')go(cur+1);
if(e.key==='ArrowLeft'||e.key==='ArrowUp')go(cur-1);
});
})();`;
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide">One</section>',
      '<section class="slide">Two</section>',
      `<script>${navScript}</script>`,
      '</body></html>',
    ].join('');
    expect(looksLikeAuthoredScrollNavigateDeck(html)).toBe(true);
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
    expect(buildSrcdoc(html, { deck: true })).not.toContain('data-od-deck-stacked-fix');
  });

  it('recovers compact body-first decks even when the model emitted scrollIntoView navigation', () => {
    const navScript = `(function(){
var slides=document.querySelectorAll('.slide');
var cur=0;
function go(n){
n=Math.max(0,Math.min(slides.length-1,n));
slides[n].scrollIntoView({behavior:'smooth'});
cur=n;
}
})();`;
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="min-height:100vh">One</section>',
      '<section class="slide" style="min-height:100vh">Two</section>',
      `<script>${navScript}</script>`,
      '</body></html>',
    ].join('');
    expect(looksLikeAuthoredScrollNavigateDeck(html)).toBe(true);
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    expect(buildSrcdoc(html, { deck: true })).toContain('data-od-deck-stacked-fix');
  });

  it('keeps body-first Motif absolute fills on the compact 1920 letterbox path', () => {
    const motifFill = `<!doctype html><html><head><style>
.slide{position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;padding:64px}
.pill{border-radius:9999px;display:inline-flex}
</style></head><body>
<section class="slide"><span class="pill">TOOLING COMPARISON</span><h1>Turborepo vs Nx</h1></section>
<section class="slide"><h1>Roadmap</h1></section>
</body></html>`;
    expect(looksLikeCompactApiStackedDeck(motifFill)).toBe(true);
    const srcdoc = buildSrcdoc(motifFill, { deck: true });
    expect(srcdoc).toContain('data-od-deck-stacked-fix');
    expect(srcdoc).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(srcdoc).toContain('#od-stacked-deck-stage');
    expect(srcdoc).toContain('width: 1920px !important');
    expect(srcdoc).toContain('height: 1080px !important');
  });

  it('still letterboxes compact official-look fills that copied a .presentation host', async () => {
    const html = [
      '<!doctype html><html lang="ko"><head>',
      '<style data-od-official-look-css>',
      '.slide { position:absolute; inset:0; width:100%; height:100%; display:flex; flex-direction:column; }',
      '.slide-6 { justify-content:center; }',
      '/* stacked preview/export: Motif paint + fixed 1920 */',
      'html, body { overflow: visible !important; height: auto !important; }',
      '.slide { opacity: 1 !important; position: relative !important; width: 1920px !important; height: 1080px !important; flex-direction: unset; }',
      '</style></head><body>',
      '<div class="presentation">',
      '<section class="slide"><h2>도입 로드맵</h2><p>Phase 1-4</p></section>',
      '<section class="slide" style="display:flex;gap:0;padding:0;width:1920px;height:1080px">',
      '<div class="split-left">Turborepo</div><div class="split-right">Nx</div>',
      '</section>',
      '<section class="slide slide-6"><h2>체크리스트</h2></section>',
      '</div></body></html>',
    ].join('');

    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    expect(looksLikeCompactApiStackedDeckForPreview(html)).toBe(true);

    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toContain('data-od-deck-stacked-fix');
    expect(srcdoc).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');

    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage: () => {} } });
    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 100));

    const stage = win.document.getElementById('od-stacked-deck-stage') as HTMLElement | null;
    expect(stage).toBeTruthy();
    const slideEls = Array.from(win.document.querySelectorAll('#od-stacked-deck-stage > .slide')) as HTMLElement[];
    expect(slideEls).toHaveLength(3);
    expect(slideEls[0]?.style.flexDirection).toBe('column');
    expect(slideEls[0]?.style.justifyContent).toBe('center');
    // Hoist locks every stacked slide so split pages stay row before first paint.
    expect(slideEls[1]?.style.flexDirection).toBe('row');
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 40));
    expect(slideEls[1]?.style.flexDirection).toBe('row');
    expect(slideEls[2]?.classList.contains('slide-6')).toBe(true);
    expect(slideEls[2]?.style.justifyContent).not.toBe('center');

    const firstTransform = String(stage?.style.transform || '');
    expect(firstTransform).toMatch(/translate\(calc\(-50%/);
    expect(firstTransform).toMatch(/scale\(/);

    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 40));
    expect(String(stage?.style.transform || '')).toBe(firstTransform);
  });

  it('does not letterbox Zhangzara <deck-stage> catalogs as compact stacked decks', () => {
    const official = readFileSync(
      resolve(repoRoot, 'plugins/_official/examples/html-ppt-zhangzara-pink-script/example.html'),
      'utf8',
    );
    expect(official).toMatch(/<deck-stage\b/i);
    expect(looksLikeCompactApiStackedDeck(official)).toBe(false);
    expect(looksLikeCompactApiStackedDeckForPreview(official)).toBe(false);
    const srcdoc = buildSrcdoc(official, { deck: true });
    expect(srcdoc).not.toContain('data-od-deck-stacked-fix');
    expect(srcdoc).not.toContain('data-od-compact-stacked');
    expect(srcdoc).not.toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
  });

  it('keeps official catalog presenters on native 100% fill instead of stacked 1920', () => {
    const official = readFileSync(
      resolve(repoRoot, 'plugins/_official/examples/html-ppt-zhangzara-capsule/example.html'),
      'utf8',
    );
    expect(looksLikeCompactApiStackedDeck(official)).toBe(false);
    expect(looksLikeCompactApiStackedDeckForPreview(official)).toBe(false);
    const srcdoc = buildSrcdoc(official, { deck: true });
    expect(srcdoc).not.toContain('data-od-stacked-canvas-neutralize');
    expect(srcdoc).not.toContain('data-od-deck-stacked-fix');
    expect(srcdoc).not.toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(srcdoc).toContain('width=device-width');
    expect(srcdoc).toContain('CAPSULE');
    expect(srcdoc).toMatch(/\.slide\s*\{[^}]*position:\s*absolute/i);
  });

  it('does not force stacked slides into a centered column that clips 16:9 split layouts', async () => {
    const html = [
      '<!doctype html><html lang="ko"><head>',
      '<style data-od-official-look-css>',
      '.slide { position:absolute; inset:0; width:100%; height:100%; display:flex; flex-direction:column; padding:3rem 4rem; overflow:hidden; }',
      '.pill-coral { background:#E85D4E; }',
      '/* stacked preview/export: keep Motif paint, do not hide non-active slides */',
      'html, body { overflow: visible !important; height: auto !important; }',
      '.slide, .slide.active { opacity: 1 !important; pointer-events: auto !important; }',
      '</style></head><body>',
      '<section class="slide" style="display:flex;gap:0;padding:0;width:1920px;height:1080px">',
      '<div class="split-left"><h2>마이그레이션 전략</h2></div>',
      '<div class="split-right" style="width:620px;flex-shrink:0">마이그레이션 단계</div>',
      '</section>',
      '<section class="slide" style="display:flex;flex-direction:column;padding:90px 140px;width:1920px;height:1080px">',
      '<h2>체크리스트</h2>',
      '</section>',
      '</body></html>',
    ].join('');

    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toContain('data-od-deck-stacked-fix');
    expect(srcdoc).toContain('stacked preview/export: Motif paint + fixed 1920');
    const hostSlideCss = srcdoc.match(/#od-stacked-deck-stage\s*>\s*\.slide\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(hostSlideCss).toContain('width: 1920px');
    expect(hostSlideCss).toContain('height: 1080px');
    expect(hostSlideCss).not.toMatch(/flex-direction\s*:\s*column/);
    expect(hostSlideCss).not.toMatch(/justify-content\s*:\s*center/);

    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage: () => {} } });
    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 100));

    const slideEls = Array.from(win.document.querySelectorAll('#od-stacked-deck-stage > .slide')) as HTMLElement[];
    expect(slideEls).toHaveLength(2);
    expect(slideEls[0]?.style.display).toBe('flex');
    const splitDir = String(win.getComputedStyle(slideEls[0]!).flexDirection || '').toLowerCase();
    expect(splitDir).not.toBe('column');
    expect(['row', 'unset', 'initial', '']).toContain(splitDir);
    expect(String(win.getComputedStyle(slideEls[0]!).justifyContent || '').toLowerCase()).not.toBe('center');

    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 50));
    expect(slideEls[1]?.style.display).toBe('flex');
    expect(String(win.getComputedStyle(slideEls[1]!).flexDirection || '').toLowerCase()).toBe('column');
  });

  it('keeps authored grid slides on grid and strips official max-width collapse CSS', async () => {
    const html = [
      '<!doctype html><html lang="ko"><head>',
      '<style data-od-official-look-css>',
      '.slide { position:absolute; inset:0; width:100%; height:100%; display:flex; flex-direction:column; }',
      '.cards-grid { display:grid; grid-template-columns:repeat(3,1fr); }',
      '@media (max-width: 900px) { .cards-grid { grid-template-columns: 1fr; } .slide { padding: 2rem; } }',
      '/* stacked preview/export: Motif paint + fixed 1920 */',
      'html, body { overflow: visible !important; height: auto !important; }',
      '.slide { opacity: 1 !important; flex-direction: unset; }',
      '</style></head><body>',
      '<section class="slide" style="display:grid;grid-template-columns:1fr 1fr;width:1920px;height:1080px;padding:0">',
      '<div>left</div><div>right</div>',
      '</section>',
      '</body></html>',
    ].join('');
    const srcdoc = buildSrcdoc(html, { deck: true });
    const look = srcdoc.match(/<style[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
    expect(look).toContain('.cards-grid { display:grid; grid-template-columns:repeat(3,1fr); }');
    expect(look).not.toMatch(/@media\s*\(\s*max-width/i);

    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage: () => {} } });
    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 800, height: 450, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 100));
    const slide = win.document.querySelector('#od-stacked-deck-stage > .slide') as HTMLElement | null;
    expect(slide?.style.display).toBe('grid');
  });

  it('preserves stylesheet display:grid on Studio-like #deck letterbox (§0.93)', async () => {
    const html = [
      '<!doctype html><html><head><style>',
      '#deck{display:flex;height:100vh}',
      '.slide{flex:0 0 100vw;width:100vw;height:100vh;display:grid;grid-template-rows:auto 1fr auto;overflow:hidden}',
      '</style></head><body>',
      '<div id="deck">',
      '<section class="slide is-active"><header>H</header><div class="slide-body">A</div><footer>F</footer></section>',
      '<section class="slide"><header>H</header><div class="slide-body">B</div><footer>F</footer></section>',
      '</div>',
      '<div id="nav-dots"><button class="nav-dot is-active"></button><button class="nav-dot"></button></div>',
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toContain('data-od-deck-fixed-canvas-pin');
    expect(srcdoc).toContain('data-od-stacked-canvas-neutralize');

    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();
    const { JSDOM } = await import('jsdom');
    const parentPostMessage = vi.fn();
    const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage: parentPostMessage } });
    new win.Function(match![1]!).call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 200));

    const slideEls = Array.from(
      win.document.querySelectorAll('#od-stacked-deck-stage > .slide'),
    ) as HTMLElement[];
    expect(slideEls.length).toBeGreaterThanOrEqual(2);
    expect(slideEls[0]?.getAttribute('data-od-authored-display')).toBe('grid');
    expect(slideEls[0]?.style.display).toBe('grid');

    const wheel = new win.WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true });
    win.document.dispatchEvent(wheel);
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    const states = parentPostMessage.mock.calls
      .map((call: unknown[]) => call[0])
      .filter((m: { type?: string }) => m?.type === 'od:slide-state');
    expect(states.at(-1)).toMatchObject({ active: 1, count: 2 });
    expect(slideEls[1]?.style.display).toBe('grid');
  });

  it('normalizes compact stacked decks for standalone export without hiding slides', () => {
    const html = [
      '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body>',
      '<section class="slide" style="min-height:100vh">One</section>',
      '<section class="slide" style="min-height:100vh">Two</section>',
      '</body></html>',
    ].join('');
    const out = normalizeCompactStackedDeckForExport(html, true);
    expect(out).toContain('data-od-compact-deck-export-fix');
    expect(out).toContain('width=1920, initial-scale=1, maximum-scale=1');
    expect(out).toContain('width: 1920px !important');
    expect(out).toContain('height: 1080px !important');
    expect(out).not.toContain('data-od-deck-bridge');
    expect(out).not.toMatch(/html,\s*body\s*\{[^}]*background:\s*#0b0c10/);
  });

  it('does not letterbox an opacity-stack presenter whose first child is slide-counter chrome', () => {
    const html = [
      '<!doctype html><html><head><style>',
      '.slide{position:absolute;inset:0;opacity:0}.slide.active{opacity:1}',
      '.slide-counter{position:fixed}',
      '</style></head><body>',
      '<div class="slide-counter">1 / 10</div>',
      '<div class="presentation">',
      '<section class="slide active">Cover</section>',
      '<section class="slide">Agenda</section>',
      '</div></body></html>',
    ].join('');
    expect(looksLikeOfficialFullscreenPresenterDeck(html)).toBe(true);
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
    expect(buildSrcdoc(html, { deck: true })).not.toContain('data-od-deck-stacked-fix');
  });

  it('keeps exclusive host hide after compact native nextBtn (no ghost / blank release)', async () => {
    const html = [
      '<!doctype html><html><head><style>',
      '.slide{height:100vh;width:100%}',
      '</style></head><body>',
      '<section class="slide active">Cover One</section>',
      '<section class="slide">Agenda Two</section>',
      '<button id="nextBtn">Next</button>',
      `<script>(function(){
        var i=0, slides=document.querySelectorAll('.slide');
        document.getElementById('nextBtn').onclick=function(){
          slides[i].classList.remove('active');
          i=Math.min(i+1, slides.length-1);
          slides[i].classList.add('active');
        };
      })();</script>`,
      '</body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(true);
    const srcdoc = buildSrcdoc(html, { deck: true });
    expect(srcdoc).toContain('data-od-deck-stacked-fix');
    const script = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    const author = [...srcdoc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter((match) => !/data-od-/i.test(match[1] ?? ''))
      .map((match) => match[2] ?? '')
      .filter(Boolean);
    const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage: () => {} } });
    for (const body of author) new win.Function(body).call(win);
    new win.Function(script!).call(win);
    win.dispatchEvent(new win.Event('load'));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 260));
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 40));
    const slides = [...win.document.querySelectorAll('.slide')] as HTMLElement[];
    expect(slides).toHaveLength(2);
    expect(slides[1]?.classList.contains('active')).toBe(true);
    expect(slides[1]?.style.display).not.toBe('none');
    expect(slides[0]?.style.display).toBe('none');
  });

  it('does not normalize framework or horizontal decks for standalone export', () => {
    const framework = '<!doctype html><html><body><div id="deck-stage"></div></body></html>';
    const horizontal = [
      '<!doctype html><html><head><style>',
      'body{scroll-snap-type:x mandatory}.slide{min-height:100vh;scroll-snap-align:start}',
      '</style></head><body>',
      '<section class="slide">A</section><section class="slide">B</section>',
      '</body></html>',
    ].join('');
    expect(normalizeCompactStackedDeckForExport(framework, true)).not.toContain('data-od-compact-deck-export-fix');
    expect(normalizeCompactStackedDeckForExport(horizontal, true)).not.toContain('data-od-compact-deck-export-fix');
  });
});

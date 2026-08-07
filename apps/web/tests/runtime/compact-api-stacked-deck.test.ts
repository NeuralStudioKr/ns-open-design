// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildEmergencySlideDeckFromOutline } from '../../src/artifacts/emergency-deck';
import {
  injectStackedDeckViewport,
  looksLikeAuthoredHorizontalSwipeDeck,
  looksLikeAuthoredScrollNavigateDeck,
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

  it('rejects decks wrapped in a .deck container under body', () => {
    const html = [
      '<!doctype html><html><body>',
      '<div class="deck">',
      '<section class="slide" style="min-height:100vh">A</section>',
      '</div></body></html>',
    ].join('');
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
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
    expect(srcdoc).toContain('bootstrapCompactStackedDeck');
    expect(srcdoc).toContain('data-od-stacked-deck-ready');
    expect(srcdoc).toContain('od:stacked-deck-ready');

    const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(`<!doctype html><html><body>${slides}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
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
    expect(slideEls.filter((el) => el.style.display !== 'none')).toHaveLength(1);

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 50));
    expect(win.document.documentElement.getAttribute('data-od-stacked-deck-ready')).toBe('');
    expect(parentPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od:stacked-deck-ready' }),
      '*',
    );

    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    expect(slideEls[0]?.style.display).toBe('none');
    expect(slideEls[1]?.style.display).toBe('flex');
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

  it('keeps scrollIntoView-authored slide decks on native scroll navigation', () => {
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
      '<section class="slide" style="min-height:100vh">One</section>',
      '<section class="slide" style="min-height:100vh">Two</section>',
      `<script>${navScript}</script>`,
      '</body></html>',
    ].join('');
    expect(looksLikeAuthoredScrollNavigateDeck(html)).toBe(true);
    expect(looksLikeCompactApiStackedDeck(html)).toBe(false);
    expect(buildSrcdoc(html, { deck: true })).not.toContain('data-od-deck-stacked-fix');
  });
});

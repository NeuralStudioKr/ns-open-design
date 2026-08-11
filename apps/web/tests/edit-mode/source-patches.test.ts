import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  applyManualEditPatch,
  isManualEditFullHtmlDocument,
  graftPatchedTargetElementFromSource,
  maskManualEditTargets,
  mergeManualEditTargetByHint,
  mergeManualEditTargetsFromSource,
  readManualEditAttributes,
  readManualEditFields,
  readManualEditOuterHtml,
  readManualEditStyles,
  resolveManualEditTargetReference,
  extractIdentityFromAttrSelectorId,
  isEphemeralGeneratedPathId,
  sanitizeManualEditHtmlFragment,
  sanitizeManualEditFullSource,
  isSafeManualEditUrl,
  isSafeManualEditUrlAttrValue,
  isSafeManualEditRelativeOrFragmentUrl,
  normalizeCssForSafetyScan,
  coerceManualEditStyleValue,
  readManualEditTargetSnapshot,
} from '../../src/edit-mode/source-patches';

const sourcePatchesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/edit-mode/source-patches.ts'),
  'utf8',
);

const baseSource = `<!doctype html>
<html>
  <head>
    <style>:root { --brand: #111; }</style>
  </head>
  <body>
    <main>
      <h1 data-od-id="hero-title">Original title</h1>
      <a data-od-id="cta" href="/start">Start</a>
      <button data-od-id="button-cta">Start button</button>
      <a data-od-id="nested-cta" href="/nested"><span>Buy now</span><svg viewBox="0 0 1 1"></svg></a>
      <img data-od-id="hero-image" src="/old.png" alt="Old image">
      <section data-od-id="card" class="hero" style="color: red; padding: 8px;" data-keep="yes">Card</section>
      <p data-od-id="nested"><strong>Nested</strong> copy</p>
      <p>Generated path text</p>
    </main>
  </body>
</html>`;

describe('manual edit source patches', () => {
  beforeEach(() => {
    const dom = new JSDOM('');
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.CSS = { escape: (value: string) => value.replace(/"/g, '\\"') } as typeof CSS;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'DOMParser');
    Reflect.deleteProperty(globalThis, 'CSS');
  });

  it('updates only the selected text target', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'hero-title', value: 'Edited title' });

    expect(result.ok).toBe(true);
    expect(readManualEditFields(result.source, 'hero-title').text).toBe('Edited title');
    expect(readManualEditFields(result.source, 'cta').text).toBe('Start');
  });

  it('updates link label and href', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-link', id: 'cta', text: 'Buy now', href: '/buy' });

    expect(result.ok).toBe(true);
    expect(readManualEditFields(result.source, 'cta')).toEqual({ text: 'Buy now', href: '/buy' });
  });

  it('treats buttons as label-only text targets instead of persisting href attributes', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'button-cta', value: 'Buy button' });

    expect(result.ok).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'button-cta');
    expect(html).toContain('Buy button');
    expect(html).not.toContain('href=');
    expect(readManualEditFields(result.source, 'button-cta')).toEqual({ text: 'Buy button' });
  });

  it('preserves nested link markup when only href changes', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-link', id: 'nested-cta', text: 'Buy now', href: '/buy' });

    expect(result.ok).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'nested-cta');
    expect(html).toContain('href="/buy"');
    expect(html).toContain('<span>Buy now</span>');
    expect(html).toContain('<svg');
  });

  it('rejects label edits for links with nested markup', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-link', id: 'nested-cta', text: 'Purchase', href: '/buy' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('nested markup');
  });

  it('updates image src and alt', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-image', id: 'hero-image', src: '/new.png', alt: 'New image' });

    expect(result.ok).toBe(true);
    expect(readManualEditFields(result.source, 'hero-image')).toEqual({ src: '/new.png', alt: 'New image' });
  });

  it('adds and removes inline style properties', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-style',
      id: 'card',
      styles: {
        color: '',
        backgroundColor: '#ff0000',
        fontSize: '24px',
        paddingTop: '12px',
        marginLeft: '4px',
        borderTopWidth: '2px',
        borderStyle: 'solid',
        borderColor: '#000000',
        borderRadius: '8px',
        opacity: '0.5',
      },
    });

    expect(result.ok).toBe(true);
    const styles = readManualEditStyles(result.source, 'card');
    expect(styles.color).toBe('');
    expect(styles.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(styles.fontSize).toBe('24px');
    // Persist uses !important (match live preview). jsdom may drop the
    // padding shorthand when longhands mix priority — assert longhands.
    expect(styles.paddingTop).toBe('12px');
    expect(styles.marginLeft).toBe('4px');
    expect(styles.borderTopWidth).toBe('2px');
    expect(styles.borderStyle).toBe('solid');
    expect(styles.borderColor).toBe('rgb(0, 0, 0)');
    expect(styles.borderRadius).toBe('8px');
    expect(styles.opacity).toBe('0.5');
    expect(result.source).toMatch(/background-color:\s*rgb\(255,\s*0,\s*0\)\s*!important/i);
  });

  it('applies attributes additively and preserves class/style unless explicitly updated', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-attributes',
      id: 'card',
      attributes: { 'aria-label': 'Hero card', 'data-empty': '', 'data-od-id': 'blocked' },
    });

    expect(result.ok).toBe(true);
    const attrs = readManualEditAttributes(result.source, 'card');
    expect(attrs['aria-label']).toBe('Hero card');
    expect(attrs.class).toBe('hero');
    expect(attrs.style).toContain('color: red');
    expect(attrs['data-od-id']).toBe('card');
    expect(attrs['data-empty']).toBeUndefined();
  });

  it('protects slide identity attrs and rejects unsafe event handlers in set-attributes', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-od-id="01 Cover" data-slide-index="0" data-screen-label="01 Cover">Cover</section>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: '01 Cover',
      attributes: {
        'data-slide-index': '',
        'data-screen-label': '',
        onclick: 'alert(1)',
        style: 'display:none',
        'aria-label': 'Cover slide',
      },
    });
    expect(result.ok, result.error).toBe(true);
    const attrs = readManualEditAttributes(result.source, '01 Cover');
    expect(attrs['data-slide-index']).toBe('0');
    expect(attrs['data-screen-label']).toBe('01 Cover');
    expect(attrs.onclick).toBeUndefined();
    expect(attrs['aria-label']).toBe('Cover slide');
    expect(result.source).not.toContain('onclick=');
  });

  it('protects slide identity attrs case-insensitively in set-attributes', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-od-id="01 Cover" data-slide-index="0">Cover</section>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: '01 Cover',
      attributes: {
        'DATA-SLIDE-INDEX': '9',
        'Data-Od-Id': 'hijacked',
      },
    });
    // Protected identity attrs are all skipped → patch fails closed.
    expect(result.ok).toBe(false);
    const attrs = readManualEditAttributes(result.source, '01 Cover');
    expect(attrs['data-slide-index']).toBe('0');
    expect(attrs['data-od-id']).toBe('01 Cover');
  });

  it('rejects javascript: URLs in set-link and set-attributes href/src', () => {
    const linkDenied = applyManualEditPatch(baseSource, {
      kind: 'set-link',
      id: 'cta',
      text: 'Start',
      href: 'javascript:alert(1)',
    });
    expect(linkDenied.ok).toBe(false);
    expect(readManualEditFields(baseSource, 'cta').href).toBe('/start');

    const attrDenied = applyManualEditPatch(baseSource, {
      kind: 'set-attributes',
      id: 'cta',
      attributes: { href: 'javascript:alert(1)', 'aria-label': 'ok' },
    });
    expect(attrDenied.ok).toBe(true);
    const attrs = readManualEditAttributes(attrDenied.source, 'cta');
    expect(attrs.href).toBe('/start');
    expect(attrs['aria-label']).toBe('ok');
  });

  it('coerces numeric set-style JSON instead of silently clearing properties', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-style',
      id: 'hero-title',
      styles: { fontSize: 32 as unknown as string, fontWeight: 700 as unknown as string },
    });
    expect(result.ok, result.error).toBe(true);
    const styles = readManualEditStyles(result.source, 'hero-title');
    expect(styles.fontSize).toMatch(/32/);
    expect(styles.fontWeight).toBe('700');
  });

  it('appends px to unitless length strings in set-style', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-style',
      id: 'hero-title',
      styles: { fontSize: '32', fontWeight: '700' },
    });
    expect(result.ok, result.error).toBe(true);
    const styles = readManualEditStyles(result.source, 'hero-title');
    expect(styles.fontSize).toMatch(/32px/);
    expect(styles.fontWeight).toBe('700');
  });

  it('syncs svg width/height attributes when resizing via set-style', () => {
    const source = '<main><svg data-od-id="logo" viewBox="0 0 400 400" width="420" height="420"></svg></main>';
    const result = applyManualEditPatch(source, {
      kind: 'set-style',
      id: 'logo',
      styles: { width: '360px', height: '360px', display: 'inline-block' },
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain('width="360"');
    expect(result.source).toContain('height="360"');
    expect(result.source).toContain('width: 360px');
    expect(result.source).toContain('height: 360px');
  });

  it('syncs lone svg child when resizing absolute graphic wrapper', () => {
    const source = [
      '<section class="slide">',
      '<div data-od-source-path="path-0-1" style="position:absolute;left:855px;top:322px;width:775px;height:508px">',
      '<svg data-od-source-path="path-0-1-0" viewBox="0 0 400 400" width="420" height="420"></svg>',
      '</div></section>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-style',
      id: 'path-0-1',
      styles: { width: '600px', height: '400px' },
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain('width: 600px');
    expect(result.source).toContain('height: 400px');
    expect(result.source).toContain('width="600"');
    expect(result.source).toContain('height="400"');
  });

  it('persists move left/top on absolute graphic wrapper', () => {
    const source = [
      '<section class="slide">',
      '<div data-od-source-path="path-0-1" style="position:absolute;left:855px;top:322px;width:775px;height:508px">',
      '<svg data-od-source-path="path-0-1-0" viewBox="0 0 400 400" width="420" height="420"></svg>',
      '</div></section>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-style',
      id: 'path-0-1',
      styles: { left: '900px', top: '350px' },
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain('left: 900px');
    expect(result.source).toContain('top: 350px');
    expect(result.source).not.toContain('left: 855px');
  });

  it('rejects srcset javascript, null-byte scheme bypass, and svg data URLs', () => {
    const source = [
      '<!doctype html><html><body>',
      '<img data-od-id="hero-image" src="/old.png" alt="Old image">',
      '</body></html>',
    ].join('');
    const srcsetDenied = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'hero-image',
      attributes: { srcset: 'javascript:alert(1)' },
    });
    expect(srcsetDenied.ok).toBe(false);
    expect(readManualEditAttributes(srcsetDenied.source, 'hero-image').srcset).toBeUndefined();

    const nullByteDenied = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'hero-image',
      attributes: { src: 'java\u0000script:alert(1)' },
    });
    expect(nullByteDenied.ok).toBe(false);
    expect(readManualEditAttributes(nullByteDenied.source, 'hero-image').src).toBe('/old.png');

    const svgDenied = applyManualEditPatch(source, {
      kind: 'set-image',
      id: 'hero-image',
      src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      alt: 'x',
    });
    expect(svgDenied.ok).toBe(false);
  });

  it('rejects spaced data:text/html and javascript: on action/formaction/poster', () => {
    const source = [
      '<!doctype html><html><body>',
      '<a data-od-id="cta" href="/start">Start</a>',
      '<form data-od-id="form"><button data-od-id="submit">Go</button></form>',
      '<video data-od-id="clip" poster="/thumb.png"></video>',
      '</body></html>',
    ].join('');
    const spaced = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'cta',
      attributes: { href: 'data: text/html,hi' },
    });
    expect(spaced.ok).toBe(false);
    expect(readManualEditAttributes(spaced.source, 'cta').href).toBe('/start');

    const formDenied = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'form',
      attributes: { action: 'javascript:alert(1)' },
    });
    expect(formDenied.ok).toBe(false);
    expect(readManualEditAttributes(formDenied.source, 'form').action).toBeUndefined();

    const formactionDenied = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'submit',
      attributes: { formaction: 'javascript:alert(1)' },
    });
    expect(formactionDenied.ok).toBe(false);
    expect(readManualEditAttributes(formactionDenied.source, 'submit').formaction).toBeUndefined();

    const posterDenied = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'clip',
      attributes: { poster: 'javascript:alert(1)' },
    });
    expect(posterDenied.ok).toBe(false);
    expect(readManualEditAttributes(posterDenied.source, 'clip').poster).toBe('/thumb.png');
  });

  it('preserves data-od-id when selected outerHTML omits it', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'card',
      html: '<section class="replacement">Replaced</section>',
    });

    expect(result.ok).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'card');
    expect(html).toContain('data-od-id="card"');
    expect(html).toContain('class="replacement"');
  });

  it('preserves slide identity attrs when page-level outerHTML omits them', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-od-id="01 Cover" data-slide-index="0" data-screen-label="01 Cover">',
      '<h1>Cover</h1>',
      '</section>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: '01 Cover',
      html: '<section class="slide replacement"><h1>Cover</h1></section>',
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, '01 Cover');
    expect(html).toContain('data-od-id="01 Cover"');
    expect(html).toContain('data-slide-index="0"');
    expect(html).toContain('data-screen-label="01 Cover"');
    expect(html).toContain('class="slide replacement"');
  });

  it('forces current slide identity when model outerHTML emits wrong indexes', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-od-id="01 Cover" data-slide-index="0" data-screen-label="01 Cover">',
      '<h1>Cover</h1>',
      '</section>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: '01 Cover',
      html: '<section class="slide" data-od-id="hijacked" data-slide-index="9" data-screen-label="XX"><h1>Cover</h1></section>',
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, '01 Cover');
    expect(html).toContain('data-od-id="01 Cover"');
    expect(html).toContain('data-slide-index="0"');
    expect(html).toContain('data-screen-label="01 Cover"');
    expect(html).not.toContain('data-slide-index="9"');
  });

  it('strips on* handlers from set-outer-html replacement trees', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-image',
      html: '<img data-od-id="hero-image" src="/ok.png" onerror="alert(1)" alt="x">',
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'hero-image');
    expect(html).toContain('src="/ok.png"');
    expect(html).not.toMatch(/onerror/i);
  });

  it('strips executable chrome tags nested in set-outer-html replacements', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<h1 data-od-id="hero-title">',
        '<script>alert(1)</script>',
        '<iframe src="https://evil.example"></iframe>',
        'Safe title',
        '</h1>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'hero-title');
    expect(html).toContain('Safe title');
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<iframe\b/i);
  });

  it('rejects set-outer-html when the sole root is a non-content chrome tag', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<script>alert(1)</script>',
    });
    expect(result.ok).toBe(false);
    expect(readManualEditOuterHtml(result.source, 'hero-title')).toContain('Original title');
  });

  it('strips @import from salvaged style siblings before head inject', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>@import url("https://evil.example/x.css"); .hero-pop{color:#ef4444}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain('.hero-pop{color:#ef4444}');
    expect(result.source).not.toMatch(/@import/i);
    expect(result.source).not.toContain('evil.example');
  });

  it('strips CSS-escape and comment-smuggled @import from salvaged styles', () => {
    const escaped = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>@\\69 mport url("https://evil.example/escaped.css"); .hero-pop{color:#111}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(escaped.ok, escaped.error).toBe(true);
    expect(escaped.source).toContain('.hero-pop{color:#111}');
    expect(escaped.source).not.toContain('evil.example');
    expect(escaped.source).not.toMatch(/@import/i);

    const commented = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>@im/**/port url("https://evil.example/comment.css"); .hero-pop{color:#222}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(commented.ok, commented.error).toBe(true);
    expect(commented.source).toContain('.hero-pop{color:#222}');
    expect(commented.source).not.toContain('evil.example');
  });

  it('ignores short ASCII UI labels like Done when scoring merge candidates', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<button data-od-id="done-btn">Done</button>',
      '<p data-od-id="note" data-od-edit="text">Remember this</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<button>Done</button>',
      '<p>Updated note copy</p>',
      '</section>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetsFromSource(
      source,
      modelOutput,
      ['note'],
      { slideIndex: 0 },
      [{
        id: 'note',
        currentText: 'Remember this',
        // "Done" must not steal the pin onto the button; longer quoted phrase
        // still guides the merge onto the paragraph.
        instructionText: "change the text to 'Done' — write 'Updated note copy'",
        htmlHint: '<p data-od-id="note">Remember this</p>',
      }],
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<p data-od-id="note" data-od-edit="text">Updated note copy</p>');
    expect(result.source).toContain('<button data-od-id="done-btn">Done</button>');
    expect(result.source).not.toMatch(/<button data-od-id="note"/);
  });

  it('strips nested identity attrs and refuses minting ids on path-only targets', () => {
    const nested = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<h1 data-od-id="hero-title">Safe <a data-od-id="cta" href="/phish">link</a></h1>',
    });
    expect(nested.ok, nested.error).toBe(true);
    const nestedHtml = readManualEditOuterHtml(nested.source, 'hero-title');
    expect(nestedHtml).toContain('data-od-id="hero-title"');
    expect(nestedHtml).toContain('href="/phish"');
    expect(nestedHtml).not.toMatch(/<a[^>]*data-od-id="cta"/i);
    // Original CTA identity must remain unique.
    expect(readManualEditOuterHtml(nested.source, 'cta')).toContain('href="/start"');

    const unlabeledSource = [
      '<!doctype html><html><body>',
      '<main><p>Path only copy</p><a data-od-id="cta" href="/start">Start</a></main>',
      '</body></html>',
    ].join('');
    const minted = applyManualEditPatch(unlabeledSource, {
      kind: 'set-outer-html',
      id: 'path-0-0',
      html: '<p data-od-id="cta">Hijacked</p>',
    });
    expect(minted.ok, minted.error).toBe(true);
    expect(minted.source).toContain('>Hijacked</p>');
    expect(minted.source).not.toMatch(/<p[^>]*data-od-id="cta"/i);
    expect(readManualEditOuterHtml(minted.source, 'cta')).toContain('href="/start"');
  });

  it('ignores short quoted instruction terms when scoring merge candidates', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<button data-od-id="ok-btn">OK</button>',
      '<strong data-od-id="instructor-name" data-od-edit="text">홍길동</strong>',
      '<p data-od-id="body">안내 본문</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<button>OK</button>',
      '<strong>김강사</strong>',
      '<p>안내 본문</p>',
      '</section>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetsFromSource(
      source,
      modelOutput,
      ['instructor-name'],
      { slideIndex: 0 },
      [{
        id: 'instructor-name',
        currentText: '홍길동',
        // Short "OK" must not steal the merge onto the button.
        instructionText: "이름은 'OK' 이고 강사는 '김강사' 야",
        htmlHint: '<strong data-od-id="instructor-name">홍길동</strong>',
      }],
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<strong data-od-id="instructor-name" data-od-edit="text">김강사</strong>');
    expect(result.source).toContain('<button data-od-id="ok-btn">OK</button>');
  });

  it('allowlists set-style props and persists whiteSpace', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-style',
      id: 'hero-title',
      styles: {
        whiteSpace: 'nowrap',
        textDecoration: 'underline',
        behavior: 'url(#xss)',
        cssText: 'background:url(javascript:1)',
      } as unknown as Partial<import('../../src/edit-mode/types').ManualEditStyles>,
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'hero-title');
    expect(html).toMatch(/white-space:\s*nowrap/i);
    expect(html).toMatch(/text-decoration:\s*underline/i);
    expect(html).not.toMatch(/behavior/i);
    expect(html).not.toMatch(/cssText|css-text/i);
    expect(html).not.toMatch(/javascript/i);
  });

  it('persists zIndex via set-style for positioned elements', () => {
    const source = `<!doctype html>
<html><body>
  <main>
    <div data-od-id="logo-wrap" style="position:absolute;left:100px;top:50px;width:200px;height:120px">Logo</div>
  </main>
</body></html>`;
    const result = applyManualEditPatch(source, {
      kind: 'set-style',
      id: 'logo-wrap',
      styles: { zIndex: '5' },
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'logo-wrap');
    expect(html).toMatch(/z-index:\s*5/i);
  });

  it('salvages set-outer-html when model emits style sibling + matching root', () => {
    // User-facing failure: deck_patch_merge_failed — Replacement HTML must
    // contain exactly one root element. Models often pair a <style> block
    // with the real replacement element for "make it stand out" edits.
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>.hero-pop{font-size:40px;color:#ef4444}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });

    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'hero-title');
    expect(html).toContain('class="hero-pop"');
    expect(html).toContain('Original title');
    expect(html).not.toContain('<style');
    // Style sibling is retained in <head> so the class rules still paint.
    expect(result.source).toContain('.hero-pop{font-size:40px;color:#ef4444}');
  });

  it('salvages set-outer-html when model emits multiple sibling roots by wrapping', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<span class="badge">NEW</span><strong>Original title</strong>',
    });

    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'hero-title');
    expect(html.startsWith('<h1')).toBe(true);
    expect(html).toContain('data-od-id="hero-title"');
    expect(html).toContain('class="badge"');
    expect(html).toContain('<strong>Original title</strong>');
  });

  it('salvages text-only set-outer-html bodies by wrapping in the original tag', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: 'Just plain text title',
    });

    expect(result.ok, result.error).toBe(true);
    expect(readManualEditOuterHtml(result.source, 'hero-title')).toBe(
      '<h1 data-od-id="hero-title">Just plain text title</h1>',
    );
  });

  it('replaces full source for snapshot-based undo history', () => {
    const source = '<!doctype html><html><body><h1 data-od-id="hero-title">Snapshot</h1></body></html>';
    const result = applyManualEditPatch(baseSource, { kind: 'set-full-source', source });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('<h1 data-od-id="hero-title">Snapshot</h1>');
    expect(result.source).toMatch(/<!doctype html>/i);
  });

  it('sanitizes set-full-source so script/on* cannot ride undo snapshots', () => {
    const source = [
      '<!doctype html><html><body>',
      '<img src="x" onerror="alert(1)">',
      '<script src="https://evil.example/x.js"></script>',
      '<h1 data-od-id="hero-title">Snapshot</h1>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(baseSource, { kind: 'set-full-source', source });
    expect(result.ok).toBe(true);
    expect(result.source).toContain('hero-title');
    expect(result.source).not.toMatch(/<script\b/i);
    expect(result.source).not.toMatch(/onerror/i);
    expect(result.source).not.toContain('evil.example');
  });

  it('scrubs on*/unsafe style on html/head/body hosts in set-full-source', () => {
    const source = [
      '<!doctype html>',
      '<html onclick="alert(1)">',
      '<head style="background:url(javascript:alert(2))"></head>',
      '<body onload="alert(3)" background="javascript:alert(4)">',
      '<h1 data-od-id="hero-title">Snapshot</h1>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(baseSource, { kind: 'set-full-source', source });
    expect(result.ok).toBe(true);
    expect(result.source).toContain('hero-title');
    expect(result.source).not.toMatch(/onclick/i);
    expect(result.source).not.toMatch(/onload/i);
    expect(result.source).not.toMatch(/javascript/i);
    expect(result.source).not.toMatch(/\bbackground=/i);
  });

  it('joins CSS backslash-newline continuations before scheme scrub', () => {
    const inline = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<h1 data-od-id="hero-title" style="background:url(&quot;java\\\nscript:alert(1)&quot;);color:navy">Title</h1>',
    });
    expect(inline.ok, inline.error).toBe(true);
    const inlineHtml = readManualEditOuterHtml(inline.source, 'hero-title');
    expect(inlineHtml).not.toMatch(/javascript/i);
    expect(inlineHtml).toContain('color:navy');

    const imageSet = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<h1 data-od-id="hero-title" style="background:image-set(&quot;java\\\nscript:alert(1)&quot; 1x);color:teal">Title</h1>',
    });
    expect(imageSet.ok, imageSet.error).toBe(true);
    expect(readManualEditOuterHtml(imageSet.source, 'hero-title')).not.toMatch(/javascript/i);
  });

  it('rejects external animateColor hrefs and strips discard nodes', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><circle id="c" r="2"></circle><g id="safe"><text>ok</text></g></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<circle id="c" r="2"></circle>',
        '<g id="safe"><text>ok</text></g>',
        '<animateColor href="https://evil.example/remote.svg#c" attributeName="fill" values="red;blue"></animateColor>',
        '<animateColor href="#c" attributeName="fill" values="red;blue"></animateColor>',
        '<discard href="#safe" begin="0s"></discard>',
        '</svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).not.toContain('evil.example');
    expect(html).not.toMatch(/<discard\b/i);
    expect(html).toContain('href="#c"');
    expect(html).toContain('id="safe"');
  });

  it('strips javascript: from longdesc and imagesrcset', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-image',
      html: [
        '<img data-od-id="hero-image" src="/safe.png" alt="ok"',
        ' longdesc="javascript:alert(1)"',
        ' imagesrcset="javascript:alert(2) 1x, /ok.png 2x">',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'hero-image');
    expect(html).not.toMatch(/javascript/i);
    expect(html).not.toMatch(/\blongdesc=/i);
    expect(html).not.toMatch(/\bimagesrcset=/i);
  });

  it('rejects set-image on non-img hosts like script', () => {
    const source = [
      '<!doctype html><html><body>',
      '<script data-od-id="boot" src="/safe.js"></script>',
      '<img data-od-id="hero-image" src="/old.png" alt="Old">',
      '</body></html>',
    ].join('');
    const denied = applyManualEditPatch(source, {
      kind: 'set-image',
      id: 'boot',
      src: 'https://evil.example/x.js',
      alt: '',
    });
    expect(denied.ok).toBe(false);
    expect(denied.source).toContain('src="/safe.js"');
    expect(denied.source).not.toContain('evil.example');

    const ok = applyManualEditPatch(source, {
      kind: 'set-image',
      id: 'hero-image',
      src: '/new.png',
      alt: 'New',
    });
    expect(ok.ok, ok.error).toBe(true);
    expect(readManualEditFields(ok.source, 'hero-image').src).toBe('/new.png');
  });

  it('rejects set-link on link/base stylesheet hosts', () => {
    const source = [
      '<!doctype html><html><head>',
      '<link data-od-id="theme" rel="stylesheet" href="/safe.css">',
      '<base data-od-id="base" href="/">',
      '</head><body>',
      '<a data-od-id="cta" href="/start">Start</a>',
      '</body></html>',
    ].join('');
    const linkDenied = applyManualEditPatch(source, {
      kind: 'set-link',
      id: 'theme',
      text: '',
      href: 'https://evil.example/x.css',
    });
    expect(linkDenied.ok).toBe(false);
    expect(linkDenied.source).toContain('href="/safe.css"');

    const baseDenied = applyManualEditPatch(source, {
      kind: 'set-link',
      id: 'base',
      text: '',
      href: 'https://evil.example/',
    });
    expect(baseDenied.ok).toBe(false);

    const ok = applyManualEditPatch(source, {
      kind: 'set-link',
      id: 'cta',
      text: 'Go',
      href: '/next',
    });
    expect(ok.ok, ok.error).toBe(true);
    expect(readManualEditFields(ok.source, 'cta').href).toBe('/next');
  });

  it('keeps SVG presentation url() same-document fragment only', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><rect width="10" height="10"></rect></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<rect width="10" height="10" filter="url(https://evil.example/f.svg#x)" fill="url(#ok)"></rect>',
        '<animate attributeName="filter" to="url(https://evil.example/f.svg#x)"></animate>',
        '<animate attributeName="fill" to="url(#ok)"></animate>',
        '</svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('fill="url(#ok)"');
    expect(html).not.toMatch(/filter="url\(/i);
  });

  it('blocks set-attributes entirely on locked iframe/script hosts', () => {
    const source = [
      '<!doctype html><html><body>',
      '<iframe data-od-id="legacy" src="/safe.html"></iframe>',
      '</body></html>',
    ].join('');
    const iframe = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'legacy',
      attributes: { src: 'https://evil.example/frame.html' },
    });
    expect(iframe.ok).toBe(false);
    expect(iframe.source).toContain('src="/safe.html"');
    expect(iframe.source).not.toContain('evil.example');
  });

  it('rejects dangerous identity-matched set-outer-html roots', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<script data-od-id="hero-title" src="https://evil.example/x.js"></script>',
        '<h1>Fallback safe title</h1>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'hero-title');
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toContain('evil.example');
    expect(result.source).not.toMatch(/<script\b/i);
  });

  it('rejects blob/file/about URL schemes on links', () => {
    for (const href of ['blob:https://app.example/uuid', 'file:///etc/passwd', 'about:blank']) {
      const denied = applyManualEditPatch(baseSource, {
        kind: 'set-link',
        id: 'cta',
        text: 'Start',
        href,
      });
      expect(denied.ok, href).toBe(false);
      expect(readManualEditFields(baseSource, 'cta').href).toBe('/start');
    }
  });

  it('rejects dangerous merge/graft replacement roots', () => {
    const current = baseSource;
    const next = baseSource.replace(
      '<h1 data-od-id="hero-title">Original title</h1>',
      '<script data-od-id="hero-title" src="https://evil.example/x.js"></script>',
    );
    const merged = mergeManualEditTargetsFromSource(current, next, ['hero-title']);
    expect(merged.ok).toBe(false);
    expect(merged.source).toContain('<h1 data-od-id="hero-title">Original title</h1>');
    expect(merged.source).not.toMatch(/<script\b/i);

    const grafted = graftPatchedTargetElementFromSource(current, next, 'hero-title');
    expect(grafted.ok).toBe(false);
    expect(grafted.source).toContain('<h1 data-od-id="hero-title">Original title</h1>');
  });

  it('strips handler/applet tags and http-equiv attributes from fragments', () => {
    expect(
      sanitizeManualEditHtmlFragment(
        '<div><handler type="application/javascript">alert(1)</handler><span>ok</span></div>',
      ),
    ).toBe('<div><span>ok</span></div>');
    expect(
      sanitizeManualEditHtmlFragment(
        '<div><meta http-equiv="refresh" content="0;url=https://evil.example">x</div>',
      ),
    ).toBe('<div>x</div>');

    const attrs = applyManualEditPatch(baseSource, {
      kind: 'set-attributes',
      id: 'hero-title',
      attributes: { 'http-equiv': 'refresh', title: 'ok' },
    });
    expect(attrs.ok, attrs.error).toBe(true);
    expect(readManualEditAttributes(attrs.source, 'hero-title')['http-equiv']).toBeUndefined();
    expect(readManualEditAttributes(attrs.source, 'hero-title').title).toBe('ok');
  });

  it('rejects chrome/resource extension URL schemes', () => {
    for (const href of ['chrome://settings', 'resource://gre/modules/x.js', 'moz-extension://abc/x']) {
      const denied = applyManualEditPatch(baseSource, {
        kind: 'set-link',
        id: 'cta',
        text: 'Start',
        href,
      });
      expect(denied.ok, href).toBe(false);
    }
  });

  it('scrubs -o-link and remote filter urls from salvaged styles', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>.hero-pop{-o-link:"javascript:alert(1)";filter:url(https://evil.example/f.svg#x);color:#444}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain('.hero-pop{');
    expect(result.source).toContain('color:#444');
    expect(result.source).not.toMatch(/-o-link/i);
    expect(result.source).not.toContain('evil.example');
    expect(result.source).not.toMatch(/javascript/i);
  });

  it('updates CSS tokens in style tags', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-token', token: '--brand', value: '#f00' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('--brand: #f00;');
  });

  it('rejects set-token values that break out of the CSS declaration', () => {
    const breakout = applyManualEditPatch(baseSource, {
      kind: 'set-token',
      token: '--brand',
      value: 'red; } body{background:url(https://evil.example/x)} .x{color:',
    });
    expect(breakout.ok).toBe(false);
    expect(breakout.source).toContain('--brand: #111;');
    expect(breakout.source).not.toContain('evil.example');

    const plainProp = applyManualEditPatch(baseSource, {
      kind: 'set-token',
      token: 'color',
      value: 'red',
    });
    expect(plainProp.ok).toBe(false);
  });

  it('rejects set-token url() values and scrubs unsafe inline style urls', () => {
    const tokenUrl = applyManualEditPatch(baseSource, {
      kind: 'set-token',
      token: '--brand',
      value: 'url(https://evil.example/token.css)',
    });
    expect(tokenUrl.ok).toBe(false);
    expect(tokenUrl.source).toContain('--brand: #111;');

    const styled = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<h1 data-od-id="hero-title" style="background:url(javascript:alert(1));color:red">Title</h1>',
    });
    expect(styled.ok, styled.error).toBe(true);
    const html = readManualEditOuterHtml(styled.source, 'hero-title');
    expect(html).toContain('color:red');
    expect(html).not.toMatch(/javascript/i);

    const siblingJs = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>.hero-pop{background:url("javascript:alert(1)");color:#333}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(siblingJs.ok, siblingJs.error).toBe(true);
    expect(siblingJs.source).toContain('.hero-pop{');
    expect(siblingJs.source).not.toMatch(/javascript/i);
  });

  it('scrubs nested style tags in set-outer-html instead of dropping the host', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<h1 data-od-id="hero-title">',
        '<style>@import url("https://evil.example/x.css"); .x{color:red}</style>',
        'Safe title',
        '</h1>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'hero-title');
    expect(html).toContain('Safe title');
    // Nested style hosts are scrub-kept so slide "stand out" edits survive.
    expect(html).toContain('<style>');
    expect(html).toContain('.x{color:red}');
    expect(result.source).not.toContain('evil.example');
    expect(result.source).not.toMatch(/@import/i);
  });

  it('strips SVG SMIL javascript: payloads on to/values attrs', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><a href="#x"><text>hi</text></a></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<a href="#safe"><text>hi</text>',
        '<set attributeName="href" to="javascript:alert(4)"></set>',
        '<animate attributeName="xlink:href" values="javascript:alert(5);#x"></animate>',
        '</a></svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).toContain('href="#safe"');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/\bto=["']javascript/i);
    expect(html).not.toMatch(/values=["'][^"']*javascript/i);
  });

  it('removes SMIL nodes that assign on* handlers via attributeName', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><rect width="10" height="10"></rect></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<rect width="10" height="10">',
        '<set attributeName="onclick" to="alert(1)"></set>',
        '<animate attributeName="onmouseover" values="alert(2);alert(3)"></animate>',
        '</rect></svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).not.toMatch(/attributeName=["']on/i);
    expect(html).not.toMatch(/<set\b/i);
    expect(html).not.toMatch(/<animate\b/i);
  });

  it('scrubs CSS-escape/comment javascript urls in inline style attrs', () => {
    const escaped = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<h1 data-od-id="hero-title" style="background:url(\\6a avascript:alert(1));color:blue">Title</h1>',
    });
    expect(escaped.ok, escaped.error).toBe(true);
    const escapedHtml = readManualEditOuterHtml(escaped.source, 'hero-title');
    expect(escapedHtml).not.toMatch(/javascript/i);
    expect(escapedHtml).toContain('color:blue');

    const commented = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<h1 data-od-id="hero-title" style="background:url(/*x*/javascript:alert(1));color:green">Title</h1>',
    });
    expect(commented.ok, commented.error).toBe(true);
    const commentedHtml = readManualEditOuterHtml(commented.source, 'hero-title');
    expect(commentedHtml).not.toMatch(/javascript/i);
    expect(commentedHtml).toContain('color:green');
  });

  it('rejects ZWSP-smuggled javascript: URLs in set-link', () => {
    const denied = applyManualEditPatch(baseSource, {
      kind: 'set-link',
      id: 'cta',
      text: 'Start',
      href: 'java\u200bscript:alert(1)',
    });
    expect(denied.ok).toBe(false);
    expect(readManualEditFields(baseSource, 'cta').href).toBe('/start');

    const attrDenied = applyManualEditPatch(baseSource, {
      kind: 'set-attributes',
      id: 'cta',
      attributes: { href: 'java\u200cscript:alert(1)' },
    });
    expect(attrDenied.ok).toBe(false);
    expect(readManualEditAttributes(attrDenied.source, 'cta').href).toBe('/start');
  });

  it('scrubs ZWSP-smuggled javascript urls inside inline style url()', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<h1 data-od-id="hero-title" style="background:url(\'java\u200bscript:alert(1)\');color:teal">Title</h1>',
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'hero-title');
    expect(html).not.toMatch(/javascript/i);
    expect(html).toContain('color:teal');
  });

  it('scrubs javascript urls in SVG presentation attrs like filter/fill', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><rect width="10" height="10"></rect></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<rect width="10" height="10" filter="url(javascript:alert(1))" fill="url(javascript:alert(2))" cursor="url(javascript:alert(3))"></rect>',
        '</svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).not.toMatch(/javascript/i);
    expect(html).not.toMatch(/\bfilter=["'][^"']*javascript/i);
    expect(html).not.toMatch(/\bfill=["'][^"']*javascript/i);
  });

  it('rejects external feImage/mpath hrefs like use/image', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><filter id="f"><feImage href="#icon"></feImage></filter></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<filter id="f"><feImage href="https://evil.example/x.svg"></feImage></filter>',
        '<path id="p"><animateMotion><mpath xlink:href="https://evil.example/path"></mpath></animateMotion></path>',
        '<feImage href="#icon"></feImage>',
        '</svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('href="#icon"');
  });

  it('rejects set-attributes / set-text on script and iframe hosts', () => {
    const source = [
      '<!doctype html><html><body>',
      '<script data-od-id="boot" src="/ok.js"></script>',
      '<iframe data-od-id="frame" src="/frame.html"></iframe>',
      '</body></html>',
    ].join('');
    const script = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'boot',
      attributes: { src: 'https://evil.example/x.js' },
    });
    expect(script.ok).toBe(false);
    expect(script.source).toContain('src="/ok.js"');

    const frame = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'frame',
      attributes: { src: 'https://evil.example/frame.html' },
    });
    expect(frame.ok).toBe(false);
    expect(frame.source).toContain('src="/frame.html"');

    const text = applyManualEditPatch(source, {
      kind: 'set-text',
      id: 'boot',
      value: 'alert(1)//',
    });
    expect(text.ok).toBe(false);
    expect(text.source).not.toContain('alert(1)');
  });

  it('rejects set-attributes that would re-enable inert script hosts', () => {
    const source = [
      '<!doctype html><html><body>',
      '<script data-od-id="boot" type="application/json">{"x":1}</script>',
      '</body></html>',
    ].join('');
    const clearType = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'boot',
      attributes: { type: '' },
    });
    expect(clearType.ok).toBe(false);
    expect(clearType.source).toContain('type="application/json"');

    const moduleType = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'boot',
      attributes: { type: 'module' },
    });
    expect(moduleType.ok).toBe(false);
    expect(moduleType.source).toContain('type="application/json"');
  });

  it('refuses meta http-equiv/content mutations via set-attributes', () => {
    const source = [
      '<!doctype html><html><head>',
      '<meta data-od-id="refresh" http-equiv="refresh" content="120">',
      '</head><body></body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'refresh',
      attributes: {
        'http-equiv': 'refresh',
        content: '0;url=javascript:alert(1)',
      },
    });
    expect(result.ok).toBe(false);
    expect(result.source).toContain('content="120"');
    expect(result.source).not.toMatch(/javascript/i);
  });

  it('sanitizes scoped full-deck HTML payloads via sanitizeManualEditFullSource', () => {
    const dirty = [
      '<!doctype html><html><body>',
      '<div data-od-id="hero"><img src="x" onerror="alert(1)">Safe</div>',
      '<script>alert(2)</script>',
      '</body></html>',
    ].join('');
    const clean = sanitizeManualEditFullSource(dirty);
    expect(clean).toContain('Safe');
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toMatch(/<script\b/i);
  });

  it('fails closed with regex scrub when full-source parse returns null', () => {
    // Avoid stubbing global DOMParser/document — that pollutes parallel suites.
    expect(sourcePatchesSource).toContain('failClosedScrubHtmlWithoutParser');
    expect(sourcePatchesSource).toContain(
      'never re-persist unsanitized HTML when the parser is unavailable',
    );
    expect(sourcePatchesSource).toMatch(/if\s*\(\s*!doc\s*\)\s*return failClosedScrubHtmlWithoutParser/);
  });

  it('fails closed for fragment sanitize when parser body is unavailable', () => {
    expect(sourcePatchesSource).toContain(
      'if (!doc?.body) return failClosedScrubHtmlWithoutParser(trimmed)',
    );
  });

  it('hardens failClosed scrub against javascript: URL attrs and dangerous tags', () => {
    expect(sourcePatchesSource).toContain('annotation-xml');
    expect(sourcePatchesSource).toContain('fencedframe');
    expect(sourcePatchesSource).toMatch(/javascript\|vbscript/);
    expect(sourcePatchesSource).toContain("'background'");
    expect(sourcePatchesSource).toContain("'srcset'");
    expect(sourcePatchesSource).toContain("'longdesc'");
    // SMIL to/from/by/values + unquoted srcdoc parity with DOM walk.
    expect(sourcePatchesSource).toContain("'to'");
    expect(sourcePatchesSource).toContain("'from'");
    expect(sourcePatchesSource).toContain("'by'");
    expect(sourcePatchesSource).toContain("'values'");
    expect(sourcePatchesSource).toContain('animate|animatemotion|animatetransform|set|animatecolor');
    expect(sourcePatchesSource).toContain('.replace(/\\ssrcdoc\\s*=\\s*[^\\s>]+/gi, \'\')');
    // behavior / http-equiv / presentation-attr parity with DOM walk.
    expect(sourcePatchesSource).toContain('.replace(/\\sbehavior\\s*=');
    expect(sourcePatchesSource).toContain('.replace(/\\shttp-equiv\\s*=');
    expect(sourcePatchesSource).toContain("'color-profile'");
    expect(sourcePatchesSource).toContain('presentationAttrs');
    // Fail-closed URL/presentation via isSafe gates (ZWSP compact + presentation normalize).
    expect(sourcePatchesSource).toContain('same gate as DOM isSafeManualEditUrlAttrValue');
    expect(sourcePatchesSource).toContain('isSafeManualEditUrlAttrValue(attr, value) ? full : \'\'');
    expect(sourcePatchesSource).toContain('Protocol-relative residual');
    expect(sourcePatchesSource).toContain('same gate as DOM isSafeManualEditPresentationCssValue');
    expect(sourcePatchesSource).toContain('isSafeManualEditPresentationCssValue(value) ? full : \'\'');
    expect(sourcePatchesSource).toContain('options?.parsedDoc ?? parseSource(source)');
    // Absolute action/formaction/ping residual (SMIL via isSafe; CSS color: not stripped).
    expect(sourcePatchesSource).toContain('/\\s(?:action|formaction|ping)\\s*=');
    expect(sourcePatchesSource).toContain('do not treat CSS');
    expect(sourcePatchesSource).toContain('/\\s(?:action|formaction|ping|to|from|by|values)\\s*=');
    expect(sourcePatchesSource).toContain('[\\s\\S]*?\\\\[\\s\\S]*?');
    // SMIL values residual removed — isSafeManualEditUrlAttrValue owns values tokens.
    expect(sourcePatchesSource).toContain('srcset|imagesrcset|archive');
    expect(sourcePatchesSource).toContain('SMIL `values` is gated by isSafeManualEditUrlAttrValue');
    expect(sourcePatchesSource).not.toContain('srcset|imagesrcset|archive|values');
    // SVG fragment-only href/xlink:href (use/image/… + isSafeManualEditSvgResourceRef).
    expect(sourcePatchesSource).toContain('SVG paint/resource tags — fail closed');
    expect(sourcePatchesSource).toContain("(?!#[^\\\\\\\\/:'\"]*)");
    expect(sourcePatchesSource).toContain("'lineargradient', 'radialgradient', 'filter'");
    expect(sourcePatchesSource).toContain('isSafeManualEditSvgResourceRef');
    // General URL-attr backslash-authority deny (DOM isSafeManualEditUrl).
    expect(sourcePatchesSource).toContain("if (compact.includes('\\\\')) return false;");
    expect(sourcePatchesSource).toContain('Backslash-authority on general URL attrs');
    // SMIL nav attributeName covers remaining MANUAL_EDIT_URL_ATTRS.
    expect(sourcePatchesSource).toContain("'background'");
    expect(sourcePatchesSource).toContain("'imagesrcset'");
    expect(sourcePatchesSource).toContain("'usemap'");
    expect(sourcePatchesSource).toContain('Align with MANUAL_EDIT_URL_ATTRS — SMIL can retarget');
    // usemap fragment-only + unsafe #fragment parity with SVG helper.
    expect(sourcePatchesSource).toContain("if (lower === 'usemap')");
    expect(sourcePatchesSource).toContain('return isSafeManualEditSvgResourceRef(value)');
    expect(sourcePatchesSource).toContain('usemap — same-document #fragment only');
    expect(sourcePatchesSource).toContain('Unsafe #fragments');
    expect(sourcePatchesSource).toContain('isSafeManualEditSmilNavValue(smilAttr, trimmed)');
    expect(sourcePatchesSource).toContain('Unquoted unsafe usemap fragments');
    expect(sourcePatchesSource).toContain('Unquoted unsafe SVG href/xlink:href fragments');
    expect(sourcePatchesSource).toContain("lower === 'usemap' || lower === 'href' || lower === 'xlink:href'");
    expect(sourcePatchesSource).toContain("lower === 'srcset' || lower === 'imagesrcset'");
    expect(sourcePatchesSource).toContain('Multi-token ping — drop when ANY whitespace token');
    expect(sourcePatchesSource).toContain('view-source');
    expect(sourcePatchesSource).toContain('ms-appx(?:-web)?');
  });

  it('exposes single-document mutate/batch apply helpers', () => {
    expect(sourcePatchesSource).toContain('export function applyManualEditPatches');
    expect(sourcePatchesSource).toContain('export function applyManualEditPatchMutation');
    expect(sourcePatchesSource).toContain('sanitizeManualEditDocumentInPlace');
    expect(sourcePatchesSource).not.toMatch(/export function parseAbsoluteDomSlideSelector/);
  });

  it('reads selection snapshot in one parse and hardens failClosed style/entities', () => {
    expect(sourcePatchesSource).toContain('export function readManualEditTargetSnapshot');
    expect(sourcePatchesSource).toContain('decodeHtmlCharacterReferences(String(raw || \'\'))');
    expect(sourcePatchesSource).toContain('.replace(/\\sstyle\\s*=');
    const snap = readManualEditTargetSnapshot(baseSource, 'hero-title');
    expect(snap.fields.text).toContain('Original title');
    expect(snap.outerHtml).toContain('data-od-id="hero-title"');
    expect(snap.styles).toBeTruthy();
  });

  it('scrubs remote backdrop-filter and cursor/clip-path urls from styles', () => {
    const inline = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<h1 data-od-id="hero-title" style="',
        'backdrop-filter:url(https://evil.example/f.svg#x);',
        'cursor:url(https://evil.example/c.cur),auto;',
        'clip-path:url(https://evil.example/clip.svg#x);',
        'color:navy">Title</h1>',
      ].join(''),
    });
    expect(inline.ok, inline.error).toBe(true);
    const html = readManualEditOuterHtml(inline.source, 'hero-title');
    expect(html).toContain('color:navy');
    expect(html).not.toContain('evil.example');
    expect(html).not.toMatch(/backdrop-filter/i);
    expect(html).not.toMatch(/cursor:\s*url/i);
    expect(html).not.toMatch(/clip-path/i);

    const salvaged = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>.hero-pop{cursor:url(https://evil.example/c.cur),auto;color:#444}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(salvaged.ok, salvaged.error).toBe(true);
    expect(salvaged.source).toContain('color:#444');
    expect(salvaged.source).not.toContain('evil.example');
  });

  it('drops compound filter/backdrop-filter urls and preserves false-positive neighbors', () => {
    const compound = sanitizeManualEditHtmlFragment(
      '<div style="filter: blur(2px) url(https://evil.example/f.svg#x);backdrop-filter: blur(2px) url(https://evil.example/b.svg#x);color:red">x</div>',
    );
    expect(compound).toContain('color:red');
    expect(compound).not.toContain('evil.example');
    expect(compound).not.toMatch(/filter\s*:/i);

    const blurOnly = sanitizeManualEditHtmlFragment(
      '<div style="filter:blur(4px);color:red">x</div>',
    );
    expect(blurOnly).toContain('filter:blur(4px)');
    expect(blurOnly).toContain('color:red');

    // Must not chop `background-filter` into `background-`.
    const falsePos = sanitizeManualEditHtmlFragment(
      '<div style="background-filter:url(https://cdn.example/bg.svg#x);color:red">x</div>',
    );
    expect(falsePos).toContain('background-filter:url(https://cdn.example/bg.svg#x)');
    expect(falsePos).toContain('color:red');
    expect(falsePos).not.toMatch(/background-;/);

    const fragOk = sanitizeManualEditHtmlFragment(
      '<div style="filter:url(#ok);color:red">x</div>',
    );
    expect(fragOk).toContain('filter:url(#ok)');
  });

  it('rejects filter:var() and quoted presentation url() with paren smuggling', () => {
    const viaVar = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<h1 data-od-id="hero-title" style="--f:url(https://evil.example/f.svg#x);filter:var(--f);color:navy">Title</h1>',
    });
    expect(viaVar.ok, viaVar.error).toBe(true);
    const viaVarHtml = readManualEditOuterHtml(viaVar.source, 'hero-title');
    expect(viaVarHtml).toContain('color:navy');
    expect(viaVarHtml).not.toMatch(/filter\s*:\s*var/i);
    // Custom prop for imagery may remain; filter:var must not.
    expect(viaVarHtml).not.toMatch(/filter\s*:\s*url\(https/i);

    const quoted = sanitizeManualEditHtmlFragment(
      '<svg><rect filter="url(&quot;https://evil.example/a).svg#x&quot;)"></rect></svg>',
    );
    expect(quoted).not.toContain('evil.example');
    expect(quoted).not.toMatch(/\bfilter=/i);
  });

  it('is idempotent for benign full-source decks with remote background-image', () => {
    const once = sanitizeManualEditFullSource([
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<div data-od-id="t" style="background-image:url(https://cdn.example/ok.png);color:blue">ok</div>',
      '</section></body></html>',
    ].join(''));
    const twice = sanitizeManualEditFullSource(once);
    expect(twice).toBe(once);
    expect(once).toContain('data-od-id="t"');
    expect(once).toContain('cdn.example/ok.png');
    expect(once).toContain('color:blue');
  });

  it('validates ping as a whitespace-separated relative URL list', () => {
    expect(isSafeManualEditUrlAttrValue('ping', '/ok')).toBe(true);
    expect(isSafeManualEditUrlAttrValue('ping', '#local')).toBe(true);
    expect(isSafeManualEditUrlAttrValue('ping', '/ok #local')).toBe(true);
    expect(isSafeManualEditUrlAttrValue('ping', '/ok https://evil.example/p')).toBe(false);
    expect(isSafeManualEditUrlAttrValue('ping', 'https://evil.example/p')).toBe(false);

    expect(
      sanitizeManualEditHtmlFragment(
        '<a href="#ok" ping="/ok https://evil.example/p">x</a>',
      ),
    ).toBe('<a href="#ok">x</a>');
    expect(
      sanitizeManualEditHtmlFragment('<a href="#ok" ping="/ok #frag">x</a>'),
    ).toBe('<a href="#ok" ping="/ok #frag">x</a>');
  });

  it('rejects backslash-authority relative URLs (UNC / IE-style)', () => {
    expect(isSafeManualEditRelativeOrFragmentUrl('\\\\evil.example\\payload')).toBe(false);
    expect(isSafeManualEditRelativeOrFragmentUrl('\\evil.example/x')).toBe(false);
    expect(isSafeManualEditRelativeOrFragmentUrl('//cdn.example/x')).toBe(false);
    expect(isSafeManualEditRelativeOrFragmentUrl('https://cdn.example/x')).toBe(false);
    expect(isSafeManualEditRelativeOrFragmentUrl('/safe/path.png')).toBe(true);
    expect(isSafeManualEditRelativeOrFragmentUrl('assets/photo.png')).toBe(true);
    expect(isSafeManualEditRelativeOrFragmentUrl('#hero')).toBe(true);

    expect(isSafeManualEditUrlAttrValue('action', '\\\\evil.example\\x')).toBe(false);
    expect(isSafeManualEditUrlAttrValue('ping', '/ok \\\\evil.example\\x')).toBe(false);
    // General URL attrs share the same backslash deny as relative-only.
    expect(isSafeManualEditUrl('\\\\evil.example\\payload')).toBe(false);
    expect(isSafeManualEditUrl('\\evil.example/x')).toBe(false);
    expect(isSafeManualEditUrlAttrValue('href', '\\\\evil.example\\x')).toBe(false);
    expect(isSafeManualEditUrlAttrValue('src', '\\evil.example/x')).toBe(false);
    expect(isSafeManualEditUrl('/safe/path.png')).toBe(true);
    // usemap is same-document #fragment only.
    expect(isSafeManualEditUrlAttrValue('usemap', '#map1')).toBe(true);
    expect(isSafeManualEditUrlAttrValue('usemap', 'https://evil.example/m')).toBe(false);
    expect(isSafeManualEditUrlAttrValue('usemap', '#foo:bar')).toBe(false);
    expect(isSafeManualEditUrlAttrValue('usemap', '#/x')).toBe(false);
    // Browser/OS navigators — not deck media.
    expect(isSafeManualEditUrl('view-source:https://evil.example')).toBe(false);
    expect(isSafeManualEditUrl('ms-appx://evil')).toBe(false);
    expect(isSafeManualEditUrl('ms-appx-web://evil')).toBe(false);
    expect(isSafeManualEditUrl('https://cdn.example/a.png')).toBe(true);
    // Cf / soft-hyphen smuggling — compactManualEditUrlForSchemeCheck.
    expect(isSafeManualEditUrl('java\u200bscript:alert(1)')).toBe(false);
    expect(isSafeManualEditUrl('java\u00adscript:alert(1)')).toBe(false);
    expect(isSafeManualEditUrlAttrValue('href', 'java\u200bscript:alert(1)')).toBe(false);
    // SMIL to/from absolute/proto tokens are relative/fragment only; CSS paints stay.
    expect(isSafeManualEditUrlAttrValue('to', 'https://evil.example/phish')).toBe(false);
    expect(isSafeManualEditUrlAttrValue('from', '//evil.example/x')).toBe(false);
    expect(isSafeManualEditUrlAttrValue('to', '10')).toBe(true);
    expect(isSafeManualEditUrlAttrValue('to', 'red')).toBe(true);
    expect(isSafeManualEditUrlAttrValue('to', 'color:red')).toBe(true);
    expect(isSafeManualEditUrlAttrValue('to', '#frag')).toBe(true);
    expect(sourcePatchesSource).toContain('do not treat `color:` as a URL scheme');
  });

  it('failClosed strips ZWSP-smuggled javascript: URL attrs without DOMParser', () => {
    Reflect.deleteProperty(globalThis, 'DOMParser');
    const out = sanitizeManualEditFullSource(
      '<!doctype html><html><body><a href="java\u200bscript:alert(1)">x</a>'
      + '<img src="java\u00adscript:alert(2)"></body></html>',
    );
    expect(out.toLowerCase()).not.toContain('javascript');
    expect(out).not.toMatch(/\shref\s*=/i);
    expect(out).not.toMatch(/\ssrc\s*=/i);
    expect(sourcePatchesSource).toContain('same gate as DOM isSafeManualEditUrlAttrValue');
  });

  it('failClosed values path uses isSafe (SMIL drop + CSS paint keep) without DOMParser', () => {
    Reflect.deleteProperty(globalThis, 'DOMParser');
    // SMIL nodes are failClosed-stripped entirely; values residual is isSafe-owned.
    const smil = sanitizeManualEditFullSource([
      '<!doctype html><html><body>',
      '<animate attributeName="href" values="javascript:alert(1);#ok"></animate>',
      '<set attributeName="xlink:href" values="https://evil.example/x;#f"></set>',
      '<p data-od-id="ok">safe</p>',
      '</body></html>',
    ].join(''));
    expect(smil.toLowerCase()).not.toContain('animate');
    expect(smil.toLowerCase()).not.toContain('<set');
    expect(smil.toLowerCase()).not.toContain('javascript');
    expect(smil).not.toContain('evil.example');
    expect(smil).toContain('data-od-id="ok"');
    // Bare CSS paints on SMIL-style attrs survive isSafe when not absolute schemes.
    expect(isSafeManualEditUrlAttrValue('values', '0;color:red;10')).toBe(true);
    expect(isSafeManualEditUrlAttrValue('values', 'javascript:alert(1);#x')).toBe(false);
    expect(isSafeManualEditUrlAttrValue('values', 'https://evil.example/a;#x')).toBe(false);
    expect(sourcePatchesSource).toContain('SMIL `values` is gated by isSafeManualEditUrlAttrValue');
  });

  it('rejects bare data:/blob: presentation paints and keeps named colors', () => {
    expect(sanitizeManualEditHtmlFragment('<rect fill="data:image/svg+xml,<svg></svg>" data-od-id="a" />'))
      .not.toContain('data:');
    expect(sanitizeManualEditHtmlFragment('<rect fill="blob:https://x/1" data-od-id="a" />'))
      .not.toContain('blob:');
    expect(sanitizeManualEditHtmlFragment('<rect fill="red" data-od-id="a" />'))
      .toContain('fill="red"');
    // CSS-escape / comment-smuggled bare schemes — failClosed uses isSafe parity.
    expect(sanitizeManualEditHtmlFragment('<rect fill="d\\61ta:image/svg+xml,<svg></svg>" data-od-id="a" />'))
      .not.toMatch(/d\\61ta:|data:/i);
    expect(sanitizeManualEditHtmlFragment('<rect fill="/**/data:image/svg+xml,<svg></svg>" data-od-id="a" />'))
      .not.toContain('data:');
    expect(sanitizeManualEditHtmlFragment(
      '<rect fill=\'image-set("https://evil.example/a.png" 1x)\' data-od-id="a" />',
    )).not.toContain('image-set');
    expect(sanitizeManualEditHtmlFragment(
      '<rect fill="-moz-binding:url(#x)" data-od-id="a" />',
    )).not.toContain('-moz-binding');
    expect(sourcePatchesSource).toContain('same gate as DOM isSafeManualEditPresentationCssValue');
    expect(sourcePatchesSource).toContain('image-set / element / -moz-binding are never safe');
    expect(sourcePatchesSource).toContain("^(?:javascript|vbscript|data|blob)\\s*:");
  });

  it('exports normalizeCssForSafetyScan for inspect escape parity', () => {
    expect(normalizeCssForSafetyScan('url/**/(javascript:x)')).toBe('url(javascript:x)');
    expect(sourcePatchesSource).toContain('export function normalizeCssForSafetyScan');
  });

  it('drops fencedframe, portal, webview, plaintext, and xmp hosts', () => {
    // Keep the safe node before raw-text hosts — plaintext/xmp consume
    // following siblings as character data in HTML parsers.
    const html = [
      '<!doctype html><html><body>',
      '<p data-od-id="ok">safe</p>',
      '<fencedframe src="https://evil.example/"></fencedframe>',
      '<portal src="https://evil.example/"></portal>',
      '<webview src="https://evil.example/"></webview>',
      '<plaintext>raw<script>x()</script>',
      '</body></html>',
    ].join('');
    const out = sanitizeManualEditFullSource(html);
    expect(out.toLowerCase()).not.toContain('fencedframe');
    expect(out.toLowerCase()).not.toContain('<portal');
    expect(out.toLowerCase()).not.toContain('webview');
    expect(out.toLowerCase()).not.toContain('plaintext');
    expect(out).toContain('data-od-id="ok"');

    expect(
      sanitizeManualEditHtmlFragment(
        '<div><fencedframe src="https://evil.example/"></fencedframe><span>ok</span></div>',
      ),
    ).toBe('<div><span>ok</span></div>');
    expect(sanitizeManualEditHtmlFragment('<xmp><script>y()</script></xmp>')).not.toMatch(
      /<xmp\b|<script\b/i,
    );
    expect(sanitizeManualEditHtmlFragment('<plaintext>raw</plaintext>')).not.toMatch(
      /<plaintext\b/i,
    );
  });

  it('rejects declaration breakout characters in coerced style values', () => {
    expect(coerceManualEditStyleValue('color', 'red; background:url(javascript:alert(1))')).toBeNull();
    expect(coerceManualEditStyleValue('color', '1px} body{color:red')).toBeNull();
    expect(coerceManualEditStyleValue('color', 'red<script>')).toBeNull();
    expect(coerceManualEditStyleValue('color', 'red\nblue')).toBeNull();
    expect(coerceManualEditStyleValue('fontSize', '12')).toBe('12px');
    expect(coerceManualEditStyleValue('color', 'navy')).toBe('navy');

    const result = applyManualEditPatch(baseSource, {
      kind: 'set-style',
      id: 'hero-title',
      styles: {
        color: 'red; background:url(javascript:alert(1))',
        fontSize: '18',
      },
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'hero-title');
    expect(html).toMatch(/font-size:\s*18px/i);
    expect(html).not.toMatch(/javascript/i);
    expect(html).not.toMatch(/background:\s*url/i);
  });

  it('strips onload from salvaged style siblings and full-source style hosts', () => {
    const salvaged = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style onload="alert(1)">.hero-pop{color:#444}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(salvaged.ok, salvaged.error).toBe(true);
    expect(salvaged.source).toContain('.hero-pop{color:#444}');
    expect(salvaged.source).not.toMatch(/onload/i);

    const full = sanitizeManualEditFullSource([
      '<!doctype html><html><head>',
      '<style onload="alert(1)">body{color:red}</style>',
      '</head><body><h1>ok</h1></body></html>',
    ].join(''));
    expect(full).toContain('body{color:red}');
    expect(full).not.toMatch(/onload/i);
  });

  it('rejects set-attributes that retarget SMIL attributeName to on*', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg><rect><set data-od-id="anim" attributeName="x" to="1"></set></rect></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'anim',
      attributes: { attributeName: 'onclick', to: 'alert(1)' },
    });
    expect(result.ok).toBe(false);
    expect(result.source).toContain('attributeName="x"');
    expect(result.source).not.toContain('onclick');
  });

  it('strips remote url() from marker and color-profile presentation attrs', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><path d="M0 0"></path></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<path d="M0 0" marker="url(https://evil.example/m.svg#x)"></path>',
        '<image color-profile="url(https://evil.example/profile.icc)" href="#ok"></image>',
        '</svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).not.toContain('evil.example');
    expect(html).not.toMatch(/\bmarker=/i);
    expect(html).not.toMatch(/color-profile=/i);
  });

  it('rejects remote href on SVG cursor resource tags', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><rect width="10" height="10"></rect></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<cursor id="c" href="https://evil.example/cursor.svg"></cursor>',
        '<cursor id="local" href="#c"></cursor>',
        '<rect cursor="url(#local)" width="10" height="10"></rect>',
        '</svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('href="#c"');
  });

  it('rejects absolute https form action/formaction phishing', () => {
    const source = [
      '<!doctype html><html><body>',
      '<form data-od-id="form" action="/submit"><button data-od-id="submit" formaction="/submit">Go</button></form>',
      '</body></html>',
    ].join('');
    const form = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'form',
      attributes: { action: 'https://evil.example/phish' },
    });
    expect(form.ok).toBe(false);
    expect(readManualEditAttributes(form.source, 'form').action).toBe('/submit');

    const button = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'submit',
      attributes: { formaction: 'https://evil.example/phish' },
    });
    expect(button.ok).toBe(false);
    expect(readManualEditAttributes(button.source, 'submit').formaction).toBe('/submit');

    const outer = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'form',
      html: '<form data-od-id="form" action="https://evil.example/phish"><button>Go</button></form>',
    });
    expect(outer.ok, outer.error).toBe(true);
    expect(readManualEditOuterHtml(outer.source, 'form')).not.toContain('evil.example');
  });

  it('scrubs IE/HTC behavior: bindings from inline and salvaged styles', () => {
    const inline = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<h1 data-od-id="hero-title" style="behavior:url(evil.htc);color:navy">Title</h1>',
    });
    expect(inline.ok, inline.error).toBe(true);
    const inlineHtml = readManualEditOuterHtml(inline.source, 'hero-title');
    expect(inlineHtml).not.toMatch(/behavior/i);
    expect(inlineHtml).toContain('color:navy');

    const salvaged = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>.hero-pop{behavior:url(evil.htc);color:#444}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(salvaged.ok, salvaged.error).toBe(true);
    expect(salvaged.source).toContain('.hero-pop{');
    expect(salvaged.source).toContain('color:#444');
    expect(salvaged.source).not.toMatch(/behavior/i);
  });

  it('strips HTML behavior attributes from fragments and set-attributes', () => {
    expect(
      sanitizeManualEditHtmlFragment('<div behavior="url(evil.htc)">safe</div>'),
    ).toBe('<div>safe</div>');

    const result = applyManualEditPatch(baseSource, {
      kind: 'set-attributes',
      id: 'hero-title',
      attributes: { behavior: 'url(evil.htc)', title: 'ok' },
    });
    expect(result.ok, result.error).toBe(true);
    const attrs = readManualEditAttributes(result.source, 'hero-title');
    expect(attrs.behavior).toBeUndefined();
    expect(attrs.title).toBe('ok');
  });

  it('rejects set-token values that hide url()/expression() behind CSS escapes', () => {
    const escapedUrl = applyManualEditPatch(baseSource, {
      kind: 'set-token',
      token: '--brand',
      value: '\\75rl(https://evil.example/x.png)',
    });
    expect(escapedUrl.ok).toBe(false);
    expect(escapedUrl.source).toContain('--brand: #111;');
    expect(escapedUrl.source).not.toContain('evil.example');

    const escapedExpr = applyManualEditPatch(baseSource, {
      kind: 'set-token',
      token: '--brand',
      value: '\\65xpression(alert(1))',
    });
    expect(escapedExpr.ok).toBe(false);
    expect(escapedExpr.source).toContain('--brand: #111;');
  });

  it('removes SMIL nodes that target srcdoc or content', () => {
    // iframe/meta roots are dropped entirely — exercise SMIL kill under a safe host.
    const srcdoc = sanitizeManualEditHtmlFragment(
      '<div><animate attributeName="srcdoc" to="<script>alert(1)</script>"></animate><span>ok</span></div>',
    );
    expect(srcdoc).toContain('<span>ok</span>');
    expect(srcdoc).not.toMatch(/<animate\b/i);
    expect(srcdoc).not.toMatch(/srcdoc/i);

    const content = sanitizeManualEditHtmlFragment(
      '<div><set attributeName="content" to="0;url=javascript:alert(1)"></set><span>ok</span></div>',
    );
    expect(content).toContain('<span>ok</span>');
    expect(content).not.toMatch(/<set\b/i);
    expect(content).not.toMatch(/javascript/i);
  });

  it('removes SMIL nodes that assign behavior or http-equiv', () => {
    const behavior = sanitizeManualEditHtmlFragment(
      '<div><set attributeName="behavior" to="url(evil.htc)"></set><span>ok</span></div>',
    );
    expect(behavior).toContain('<span>ok</span>');
    expect(behavior).not.toMatch(/<set\b/i);
    expect(behavior).not.toMatch(/behavior/i);

    const httpEquiv = sanitizeManualEditHtmlFragment(
      '<div><animate attributeName="http-equiv" to="refresh"></animate><span>ok</span></div>',
    );
    expect(httpEquiv).toContain('<span>ok</span>');
    expect(httpEquiv).not.toMatch(/<animate\b/i);
    expect(httpEquiv).not.toMatch(/http-equiv/i);
  });

  it('keeps ping on same-document relative or fragment targets only', () => {
    const source = [
      '<!doctype html><html><body>',
      '<a data-od-id="cta" href="#ok" ping="#local">Start</a>',
      '</body></html>',
    ].join('');
    const denied = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'cta',
      attributes: { ping: 'https://evil.example/track' },
    });
    expect(denied.ok).toBe(false);
    expect(readManualEditAttributes(denied.source, 'cta').ping).toBe('#local');

    const outer = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'cta',
      html: '<a data-od-id="cta" href="#ok" ping="https://evil.example/track">Start</a>',
    });
    expect(outer.ok, outer.error).toBe(true);
    expect(readManualEditOuterHtml(outer.source, 'cta')).not.toContain('evil.example');
    expect(readManualEditOuterHtml(outer.source, 'cta')).not.toMatch(/\bping=/i);

    const ok = applyManualEditPatch(source, {
      kind: 'set-attributes',
      id: 'cta',
      attributes: { ping: '/same-origin/track' },
    });
    expect(ok.ok, ok.error).toBe(true);
    expect(readManualEditAttributes(ok.source, 'cta').ping).toBe('/same-origin/track');

    expect(
      sanitizeManualEditHtmlFragment('<a href="#ok" ping="#local">x</a>'),
    ).toBe('<a href="#ok" ping="#local">x</a>');
  });

  it('removes SMIL nodes that retarget href to absolute https', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><a href="#safe"><text>hi</text></a></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<a href="#safe"><text>hi</text>',
        '<set attributeName="href" to="https://evil.example/phish"></set>',
        '</a></svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).toContain('href="#safe"');
    expect(html).not.toContain('evil.example');
    expect(html).not.toMatch(/<set\b/i);
  });

  it('rejects external animateMotion/animate hrefs', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><circle id="c" r="2"></circle></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<circle id="c" r="2"></circle>',
        '<animateMotion path="M0,0 L10,10" href="https://evil.example/x.svg#c"></animateMotion>',
        '<animate href="https://evil.example/x.svg#c" attributeName="r" to="4"></animate>',
        '<animateMotion path="M0,0 L1,1" href="#c"></animateMotion>',
        '</svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('href="#c"');
  });

  it('sanitizeManualEditHtmlFragment strips nested script and on* handlers', () => {
    const out = sanitizeManualEditHtmlFragment(
      '<section class="slide"><h1 onclick="alert(1)">Hero</h1><script src="https://evil.example/x.js"></script></section>',
    );
    expect(out).toContain('<h1');
    expect(out).toContain('Hero');
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/<script\b/i);
    expect(out).not.toContain('evil.example');
  });

  it('scrubs -webkit-image-set javascript strings from inline and salvaged styles', () => {
    const inline = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: '<h1 data-od-id="hero-title" style="background:-webkit-image-set(&quot;javascript:alert(1)&quot; 1x);color:navy">Title</h1>',
    });
    expect(inline.ok, inline.error).toBe(true);
    const inlineHtml = readManualEditOuterHtml(inline.source, 'hero-title');
    expect(inlineHtml).not.toMatch(/javascript/i);
    expect(inlineHtml).toContain('color:navy');

    const salvaged = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>.hero-pop{background:image-set("javascript:alert(1)" 1x);color:#444}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(salvaged.ok, salvaged.error).toBe(true);
    expect(salvaged.source).toContain('.hero-pop{');
    expect(salvaged.source).not.toMatch(/javascript/i);
  });

  it('drops remote image()/image-set() on resource CSS props', () => {
    const fragment = sanitizeManualEditHtmlFragment(
      [
        '<div style="',
        'filter:image(&quot;https://evil.example/f.svg&quot;);',
        'mask-image:image-set(&quot;https://evil.example/m.svg&quot; 1x);',
        'color:red',
        '">x</div>',
      ].join(''),
    );
    expect(fragment).toContain('color:red');
    expect(fragment).not.toContain('evil.example');
    expect(fragment).not.toMatch(/filter\s*:/i);
    expect(fragment).not.toMatch(/mask-image\s*:/i);

    const salvaged = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>.hero-pop{backdrop-filter:image("https://evil.example/f.svg");color:#444}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(salvaged.ok, salvaged.error).toBe(true);
    expect(salvaged.source).toContain('color:#444');
    expect(salvaged.source).not.toContain('evil.example');
  });

  it('rejects set-token image()/image-set() and bare scheme strings', () => {
    for (const value of [
      'image("javascript:alert(1)")',
      'image-set("javascript:alert(1)" 1x)',
      'javascript:alert(1)',
      'data:text/html,hi',
    ]) {
      const denied = applyManualEditPatch(baseSource, {
        kind: 'set-token',
        token: '--brand',
        value,
      });
      expect(denied.ok, value).toBe(false);
      expect(denied.source).toContain('--brand: #111;');
    }
  });

  it('scrubs image("data:…") without leaving truncated SVG junk', () => {
    const dataHtml = sanitizeManualEditHtmlFragment(
      '<div style=\'background: image("data:text/html,<script>alert(1)</script>");color:navy\'>x</div>',
    );
    expect(dataHtml).toContain('color:navy');
    expect(dataHtml).not.toMatch(/data:text\/html/i);
    expect(dataHtml).not.toMatch(/<script\b/i);

    const nestedParen = sanitizeManualEditHtmlFragment(
      '<div style=\'background: -webkit-image-set("data:image/svg+xml,<svg onload=alert(1)></svg>" 1x);color:navy\'>x</div>',
    );
    expect(nestedParen).toContain('color:navy');
    expect(nestedParen).not.toMatch(/onload/i);
    expect(nestedParen).not.toMatch(/<\/svg>/i);
    expect(nestedParen).not.toMatch(/data:image\/svg/i);
  });

  it('drops foreignObject and MathML annotation-xml HTML islands', () => {
    const out = sanitizeManualEditFullSource([
      '<!doctype html><html><body>',
      '<p data-od-id="ok">safe</p>',
      '<svg><foreignObject><form action="/api/secrets" method="post">',
      '<input name="cookie"><button>Send</button></form></foreignObject></svg>',
      '<math><annotation-xml encoding="text/html">',
      '<form action="/login"><input name="password"><button>Go</button></form>',
      '</annotation-xml></math>',
      '</body></html>',
    ].join(''));
    expect(out).toContain('data-od-id="ok"');
    expect(out.toLowerCase()).not.toContain('foreignobject');
    expect(out.toLowerCase()).not.toContain('annotation-xml');
    expect(out.toLowerCase()).not.toContain('<form');
    expect(out).not.toContain('/api/secrets');
  });

  it('strips @font-face and @namespace from salvaged style siblings', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>@namespace url(http://www.w3.org/1999/xhtml);@font-face{font-family:X;src:url(https://evil.example/x.woff2)}.hero-pop{color:#555}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain('.hero-pop{color:#555}');
    expect(result.source).not.toMatch(/@namespace/i);
    expect(result.source).not.toMatch(/@font-face/i);
    expect(result.source).not.toContain('evil.example');
  });

  it('rejects external SVG use/image hrefs and keeps fragment refs', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><symbol id="icon"></symbol><use href="#icon"></use></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<symbol id="icon"></symbol>',
        '<use href="https://evil.example/sprite.svg#icon"></use>',
        '<use xlink:href="//evil.example/sprite.svg#icon"></use>',
        '<use href="#icon"></use>',
        '<image href="https://evil.example/x.png"></image>',
        '</svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).toContain('href="#icon"');
    expect(html).not.toContain('evil.example');
    expect(html).not.toMatch(/<image[^>]+href=/i);
  });

  it('scrubs SMIL style animations that embed javascript urls', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><rect width="10" height="10"></rect></svg>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark">',
        '<rect width="10" height="10">',
        '<set attributeName="style" to="background:url(javascript:alert(1));color:red"></set>',
        '</rect></svg>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'mark');
    expect(html).not.toMatch(/javascript/i);
    // Either the set node is dropped or its to= value is scrubbed clean.
    if (/<set\b/i.test(html)) {
      expect(html).toMatch(/to=["'][^"']*color:red/i);
      expect(html).not.toMatch(/to=["'][^"']*javascript/i);
    }
  });

  it('rejects HTML character-reference javascript: URL bypasses', () => {
    for (const href of [
      '&#106;avascript:alert(1)',
      'javascript&#58;alert(1)',
      '&#x6a;avascript:alert(1)',
    ]) {
      const denied = applyManualEditPatch(baseSource, {
        kind: 'set-link',
        id: 'cta',
        text: 'Start',
        href,
      });
      expect(denied.ok, href).toBe(false);
      expect(readManualEditFields(baseSource, 'cta').href).toBe('/start');
    }
  });

  it('rejects named HTML-entity javascript: URL bypasses', () => {
    for (const href of [
      'javascript&colon;alert(1)',
      'java&Tab;script:alert(1)',
      'java&NewLine;script:alert(1)',
      'java&shy;script:alert(1)',
      'java&WJ;script:alert(1)',
      'java&ZeroWidthSpace;script:alert(1)',
      'java&hairsp;script:alert(1)',
      'java&ThickSpace;script:alert(1)',
    ]) {
      const denied = applyManualEditPatch(baseSource, {
        kind: 'set-link',
        id: 'cta',
        text: 'Start',
        href,
      });
      expect(denied.ok, href).toBe(false);
    }

    expect(
      sanitizeManualEditHtmlFragment('<a href="java&shy;script:alert(1)">x</a>'),
    ).not.toMatch(/javascript|shy;script/i);

    const formSource = [
      '<!doctype html><html><body>',
      '<button data-od-id="submit" formaction="/ok">Go</button>',
      '</body></html>',
    ].join('');
    const formaction = applyManualEditPatch(formSource, {
      kind: 'set-attributes',
      id: 'submit',
      attributes: { formaction: 'javascript&colon;alert(1)' },
    });
    // Unsafe URL attrs are skipped (patch may still ok); original must remain.
    expect(formaction.source).toContain('formaction="/ok"');
    expect(formaction.source).not.toMatch(/javascript/i);
    expect(formaction.source).not.toContain('&colon;');
  });

  it('drops remote url() on border-image/shape-outside/list-style resource props', () => {
    const fragment = sanitizeManualEditHtmlFragment(
      [
        '<div style="',
        'border-image-source:url(https://evil.example/x.svg);',
        'shape-outside:url(https://evil.example/s.svg);',
        'list-style-image:url(https://evil.example/l.svg);',
        'offset-path:url(https://evil.example/o.svg);',
        'color:red',
        '">x</div>',
      ].join(''),
    );
    expect(fragment).toContain('color:red');
    expect(fragment).not.toContain('evil.example');
    expect(fragment).not.toMatch(/border-image/i);
    expect(fragment).not.toMatch(/shape-outside/i);
    expect(fragment).not.toMatch(/list-style/i);
    expect(fragment).not.toMatch(/offset-path/i);

    const viaVar = sanitizeManualEditHtmlFragment(
      '<div style="border-image-source:var(--x);color:red">x</div>',
    );
    expect(viaVar).toContain('color:red');
    expect(viaVar).not.toMatch(/border-image-source/i);
  });

  it('scrubs CSS element() from inline and salvaged styles', () => {
    const inline = sanitizeManualEditHtmlFragment(
      '<div style="background:element(#hero);color:red">x</div>',
    );
    expect(inline).toContain('color:red');
    expect(inline).not.toMatch(/\belement\s*\(/i);

    const salvaged = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>.hero-pop{background:element(#hero);color:#444}</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(salvaged.ok, salvaged.error).toBe(true);
    expect(salvaged.source).toContain('color:#444');
    expect(salvaged.source).not.toMatch(/\belement\s*\(/i);
  });

  it('strips @counter-style and @page with remote urls from salvaged styles', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>',
        '@counter-style x{system:cyclic;symbols:url(https://evil.example/x.svg);suffix:" "}',
        '@page{background:url(https://evil.example/p.svg)}',
        '.hero-pop{color:#555}',
        '</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain('.hero-pop{color:#555}');
    expect(result.source).not.toMatch(/@counter-style/i);
    expect(result.source).not.toMatch(/@page\b/i);
    expect(result.source).not.toContain('evil.example');
  });

  it('strips @counter-style when suffix strings contain closing braces', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'hero-title',
      html: [
        '<style>',
        '@counter-style x{system:cyclic;symbols:url(https://evil.example/x.svg);suffix:"}"}',
        '.hero-pop{color:#555}',
        '</style>',
        '<h1 class="hero-pop" data-od-id="hero-title">Original title</h1>',
      ].join(''),
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain('.hero-pop{color:#555}');
    expect(result.source).not.toMatch(/@counter-style/i);
    expect(result.source).not.toContain('evil.example');
  });

  it('rejects set-attributes when every attribute is skipped as unsafe', () => {
    const denied = applyManualEditPatch(baseSource, {
      kind: 'set-attributes',
      id: 'cta',
      attributes: {
        href: 'javascript:alert(1)',
        onclick: 'alert(1)',
      },
    });
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/none of the requested attributes/i);
    expect(readManualEditFields(denied.source, 'cta').href).toBe('/start');
  });

  it('scrubs element() with nested parentheses via quote-aware rewrite', () => {
    const out = sanitizeManualEditHtmlFragment(
      '<div style="background:element(#hero);filter:element(#x);color:navy">x</div>',
    );
    expect(out).toContain('color:navy');
    expect(out).not.toMatch(/\belement\s*\(/i);
  });

  it('keeps scrubbed nested slide <style> instead of dropping the host', () => {
    const fragment = sanitizeManualEditHtmlFragment([
      '<section class="slide">',
      '<style>.hero-pop{font-size:40px;color:#ef4444;background:url(javascript:alert(1))}</style>',
      '<h1 class="hero-pop" data-od-id="hero-title">Title</h1>',
      '</section>',
    ].join(''));
    expect(fragment).toContain('<style>');
    expect(fragment).toContain('.hero-pop{');
    expect(fragment).toContain('font-size:40px');
    expect(fragment).toContain('color:#ef4444');
    expect(fragment).not.toMatch(/javascript/i);
    expect(fragment).toContain('data-od-id="hero-title"');

    const full = sanitizeManualEditFullSource([
      '<!doctype html><html><body>',
      '<section class="slide">',
      '<style>.hero-pop{color:#123456}</style>',
      '<h1 class="hero-pop">Title</h1>',
      '</section>',
      '</body></html>',
    ].join(''));
    expect(full).toContain('<style>');
    expect(full).toContain('.hero-pop{color:#123456}');
  });

  it('scrubs SMIL presentation values instead of boolean-only reject', () => {
    const source = [
      '<!doctype html><html><body>',
      '<svg data-od-id="mark"><rect>',
      '<set data-od-id="anim" attributeName="filter" to="url(#ok) blur(1px)"></set>',
      '</rect></svg>',
      '</body></html>',
    ].join('');
    // Remote url in a compound presentation value — scrub/drop unsafe piece path.
    const dirty = applyManualEditPatch(source, {
      kind: 'set-outer-html',
      id: 'mark',
      html: [
        '<svg data-od-id="mark"><rect>',
        '<set data-od-id="anim" attributeName="filter" to="url(https://evil.example/f.svg#x)"></set>',
        '</rect></svg>',
      ].join(''),
    });
    expect(dirty.ok, dirty.error).toBe(true);
    const html = readManualEditOuterHtml(dirty.source, 'mark');
    expect(html).not.toContain('evil.example');
  });

  it('does not drop whole style blocks for .javascript:hover selectors', () => {
    const out = sanitizeManualEditHtmlFragment(
      '<div><style>.javascript:hover{color:red}.btn{color:blue}</style><span>ok</span></div>',
    );
    expect(out).toContain('<style>');
    expect(out).toContain('.javascript:hover{color:red}');
    expect(out).toContain('.btn{color:blue}');
    expect(out).toContain('<span>ok</span>');

    const pathSeg = sanitizeManualEditHtmlFragment(
      '<div style="background:url(/assets/javascript:docs.png);color:navy">x</div>',
    );
    expect(pathSeg).toContain('color:navy');
    expect(pathSeg).toContain('/assets/javascript:docs.png');
  });

  it('preserves fragment-shaped HTML when saving patches', () => {
    const source = '<main><h1 data-od-id="hero-title">Original title</h1></main>';
    const result = applyManualEditPatch(source, { kind: 'set-text', id: 'hero-title', value: 'Edited title' });

    expect(result.ok).toBe(true);
    expect(result.source).toBe('<main><h1 data-od-id="hero-title">Edited title</h1></main>');
    expect(result.source).not.toContain('<!doctype');
    expect(result.source).not.toContain('<html');
    expect(result.source).not.toContain('<body');
  });

  it('detects full documents after leading comments and keeps fragments distinct', () => {
    expect(isManualEditFullHtmlDocument('<!-- generated -->\n<!doctype html><html></html>')).toBe(true);
    expect(isManualEditFullHtmlDocument('<?xml version="1.0"?>\n<html></html>')).toBe(true);
    expect(isManualEditFullHtmlDocument('<main><h1>Fragment</h1></main>')).toBe(false);
  });

  it('preserves full documents with leading comments when saving patches', () => {
    const source = [
      '<!-- generated by open design -->',
      '<!doctype html><html><head><style>:root { --brand: #111; }</style></head>',
      '<body><main><h1 data-od-id="hero-title">Original title</h1></main></body></html>',
    ].join('\n');
    const result = applyManualEditPatch(source, { kind: 'set-text', id: 'hero-title', value: 'Edited title' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('<!doctype html>');
    expect(result.source).toContain('<html>');
    expect(result.source).toContain('<head><style>:root { --brand: #111; }</style></head>');
    expect(result.source).toContain('<h1 data-od-id="hero-title">Edited title</h1>');
  });

  it('addresses unannotated elements with generated DOM path ids', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'path-0-7', value: 'Path target' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('Path target');
  });

  it('resolves generated DOM path ids against the document before applying slide scope', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h1>Slide one title</h1></section>',
      '<section class="slide" data-slide-index="1"><h1>Slide two title</h1></section>',
      '</body></html>',
    ].join('');

    const result = applyManualEditPatch(
      source,
      { kind: 'set-style', id: 'path-1-0', styles: { backgroundColor: '#ef4444' } },
      { slideIndex: 1 },
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.source).toMatch(
      /<h1 style="background-color:\s*rgb\(239,\s*68,\s*68\)\s*!important;">Slide two title<\/h1>/,
    );
    expect(result.source).toContain('<section class="slide" data-slide-index="0"><h1>Slide one title</h1></section>');
    expect(
      applyManualEditPatch(
        source,
        { kind: 'set-style', id: 'path-0-0', styles: { backgroundColor: '#ef4444' } },
        { slideIndex: 1 },
      ).ok,
    ).toBe(false);
  });

  it('resolves preview path-N ids without minting dom:[data-od-id=path-N]', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h1>Intro</h1></section>',
      '<section class="slide" data-slide-index="1"><h1>Title</h1><p>Body</p></section>',
      '</body></html>',
    ].join('');
    expect(isEphemeralGeneratedPathId('path-1-0')).toBe(true);
    expect(extractIdentityFromAttrSelectorId('dom:[data-od-id="path-1-0"]')).toBe('path-1-0');

    const resolved = resolveManualEditTargetReference(
      source,
      'path-1-0',
      { slideIndex: 1 },
      { id: 'path-1-0', selector: '[data-od-id="path-1-0"]', currentText: 'Title' },
    );
    expect(resolved).toBe('path-1-0');

    const fromDomAttr = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'dom:[data-od-id="path-1-0"]', value: 'New Title' },
      { slideIndex: 1 },
      { id: 'path-1-0', selector: '[data-od-id="path-1-0"]', currentText: 'Title', htmlHint: '<h1>Title</h1>' },
    );
    expect(fromDomAttr.ok, JSON.stringify(fromDomAttr)).toBe(true);
    expect(fromDomAttr.source).toContain('<h1>New Title</h1>');
  });

  it('addresses page-level data-screen-label targets like "01 Cover"', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0" data-screen-label="01 Cover">',
      '<h1>KIM SEUNGHYUN</h1><p>Subtitle</p>',
      '</section>',
      '<section class="slide" data-slide-index="1" data-screen-label="02 About"><h2>About</h2></section>',
      '</body></html>',
    ].join('');

    const styled = applyManualEditPatch(
      source,
      { kind: 'set-style', id: '01 Cover', styles: { backgroundColor: '#0f172a' } },
      { slideIndex: 0 },
    );
    expect(styled.ok, JSON.stringify(styled)).toBe(true);
    expect(styled.source).toMatch(/data-screen-label="01 Cover"[^>]*style=/);
    expect(styled.source).toContain('background-color');

    const texted = applyManualEditPatch(
      source,
      { kind: 'set-text', id: '01 Cover', value: 'New Name' },
      { slideIndex: 0 },
      {
        id: '01 Cover',
        selector: '[data-screen-label="01 Cover"]',
        currentText: 'KIM SEUNGHYUN',
        htmlHint: '<h1>KIM SEUNGHYUN</h1>',
      },
    );
    expect(texted.ok, JSON.stringify(texted)).toBe(true);
    expect(texted.source).toContain('<h1>New Name</h1>');
    expect(texted.source).toContain('<p>Subtitle</p>');
    expect(resolveManualEditTargetReference(source, '01 Cover', { slideIndex: 0 })).toBe('01 Cover');
  });

  it('addresses unannotated comment targets with dom selector ids inside the selected slide', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><p>Slide one copy</p></section>',
      '<section class="slide" data-slide-index="1"><p>Slide two copy</p></section>',
      '</body></html>',
    ].join('');
    const id = 'dom:body > section:nth-of-type(2) > p:nth-of-type(1)';

    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id, value: 'Scoped DOM target' },
      { slideIndex: 1 },
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.source).toContain('<p>Slide one copy</p>');
    expect(result.source).toContain('<p>Scoped DOM target</p>');
    expect(applyManualEditPatch(source, { kind: 'set-text', id, value: 'Wrong slide' }, { slideIndex: 0 }).ok)
      .toBe(false);
  });

  it('resolves preview dom paths with a drifted outer wrapper relative to the slide', () => {
    // Preview iframe captured body > div.deck > section > … but the saved
    // deck.html has sections directly under body (wrapper omitted / different).
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><p>Slide one copy</p></section>',
      '<section class="slide" data-slide-index="1">',
      '<div class="content"><div class="meta">meta</div><div class="body"><p>Target copy</p></div></div>',
      '</section>',
      '</body></html>',
    ].join('');
    const id =
      'dom:body > div:nth-of-type(1) > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > p:nth-of-type(1)';

    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id, value: 'Patched copy' },
      { slideIndex: 1 },
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.source).toContain('<p>Patched copy</p>');
    expect(result.source).toContain('<p>Slide one copy</p>');
    expect(result.source).toContain('>meta<');
  });

  it('falls back to comment text/html hints when the dom path cannot be walked', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><p>Other</p></section>',
      '<section class="slide" data-slide-index="1"><p>Keep me</p><p>Unique target phrase</p></section>',
      '</body></html>',
    ].join('');
    const id = 'dom:body > div:nth-of-type(9) > section:nth-of-type(9) > p:nth-of-type(9)';

    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id, value: 'Hint recovered' },
      { slideIndex: 1 },
      {
        id,
        currentText: 'Unique target phrase',
        htmlHint: '<p>Unique target phrase</p>',
      },
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.source).toContain('<p>Hint recovered</p>');
    expect(result.source).toContain('<p>Keep me</p>');
  });

  it('resolves preview dom selectors with wrapper div inside a selected slide', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><p>Slide one copy</p></section>',
      '<section class="slide" data-slide-index="1">',
      '<div><div><p data-od-id="company-name">회사 이름</p></div></div>',
      '</section>',
      '</body></html>',
    ].join('');
    const id =
      'dom:body > div:nth-of-type(1) > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > p:nth-of-type(1)';

    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id, value: '뉴럴스튜디오' },
      { slideIndex: 1 },
      { currentText: '회사 이름', htmlHint: '<p>회사 이름</p>' },
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.source).toContain('뉴럴스튜디오');
    expect(result.source).not.toContain('회사 이름');
  });

  it('resolves selector-only comment targets inside the selected slide', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h2 data-od-id="slide-0-title" style="font-size:20px">Slide one</h2></section>',
      '<section class="slide" data-slide-index="1"><h2 data-od-id="slide-1-title" style="font-size:24px">Slide two</h2></section>',
      '</body></html>',
    ].join('');

    const resolved = resolveManualEditTargetReference(
      source,
      '',
      { slideIndex: 1 },
      {
        selector: 'h2',
        currentText: 'Slide two',
        instructionText: '폰트 더 크게하자',
        htmlHint: '<h2>Slide two</h2>',
      },
    );

    expect(resolved).toBe('slide-1-title');
    const result = applyManualEditPatch(
      source,
      { kind: 'set-style', id: resolved ?? '', styles: { fontSize: '30px' } },
      { slideIndex: 1 },
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(readManualEditStyles(result.source, 'slide-0-title', { slideIndex: 0 }).fontSize)
      .toBe('20px');
    expect(readManualEditStyles(result.source, 'slide-1-title', { slideIndex: 1 }).fontSize)
      .toBe('30px');
  });

  it('limits deck comment fast-path patches to the selected slide scope', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="headline" style="font-size: 20px">Slide one</h1>',
      '</section>',
      '<section class="slide" data-slide-index="1">',
      '<h1 data-od-id="headline" style="font-size: 24px">Slide two</h1>',
      '</section>',
      '</body></html>',
    ].join('');

    const result = applyManualEditPatch(
      source,
      { kind: 'set-style', id: 'headline', styles: { color: '#facc15' } },
      { slideIndex: 1 },
    );

    expect(result.ok).toBe(true);
    expect(readManualEditOuterHtml(result.source, 'headline', { slideIndex: 0 }))
      .toContain('Slide one');
    expect(readManualEditOuterHtml(result.source, 'headline', { slideIndex: 0 }))
      .not.toContain('#facc15');
    expect(readManualEditOuterHtml(result.source, 'headline', { slideIndex: 1 }))
      .toContain('color: rgb(250, 204, 21)');
    expect(readManualEditStyles(result.source, 'headline', { slideIndex: 1 }).color)
      .toBe('rgb(250, 204, 21)');
  });

  it('rejects scoped deck patches when the target slide is missing', () => {
    const source = '<section class="slide"><h1 data-od-id="headline">Only slide</h1></section>';
    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'headline', value: 'Should not apply' },
      { slideIndex: 3 },
    );

    expect(result.ok).toBe(false);
    expect(result.source).toBe(source);
  });

  it('masks only comment targets inside a selected slide for scoped full-deck diffs', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="headline">Slide one</h1><p data-od-id="body">Body one</p>',
      '</section>',
      '<section class="slide" data-slide-index="1">',
      '<h1 data-od-id="headline">Slide two</h1><p data-od-id="body">Body two</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const targetOnly = source.replace('Slide two', 'Slide two edited');
    const siblingChanged = targetOnly.replace('Body two', 'Body two changed');

    const beforeMasked = maskManualEditTargets(source, ['headline'], { slideIndex: 1 });
    const targetMasked = maskManualEditTargets(targetOnly, ['headline'], { slideIndex: 1 });
    const siblingMasked = maskManualEditTargets(siblingChanged, ['headline'], { slideIndex: 1 });

    expect(beforeMasked.ok, JSON.stringify(beforeMasked)).toBe(true);
    expect(targetMasked.ok, JSON.stringify(targetMasked)).toBe(true);
    expect(siblingMasked.ok, JSON.stringify(siblingMasked)).toBe(true);
    if (!beforeMasked.ok || !targetMasked.ok || !siblingMasked.ok) return;
    expect(targetMasked.source).toBe(beforeMasked.source);
    expect(siblingMasked.source).not.toBe(beforeMasked.source);
    expect(maskManualEditTargets(source, ['headline'], { slideIndex: 4 }).ok).toBe(false);
  });

  it('masks dom selector comment targets so full-deck fallback guards stay element-scoped', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><p>Slide one copy</p></section>',
      '<section class="slide" data-slide-index="1"><p>Slide two copy</p><small>Keep me</small></section>',
      '</body></html>',
    ].join('');
    const targetOnly = source.replace('Slide two copy', 'Edited copy');
    const siblingChanged = targetOnly.replace('Keep me', 'Changed sibling');
    const id = 'dom:body > section:nth-of-type(2) > p:nth-of-type(1)';

    const beforeMasked = maskManualEditTargets(source, [id], { slideIndex: 1 });
    const targetMasked = maskManualEditTargets(targetOnly, [id], { slideIndex: 1 });
    const siblingMasked = maskManualEditTargets(siblingChanged, [id], { slideIndex: 1 });

    expect(beforeMasked.ok, JSON.stringify(beforeMasked)).toBe(true);
    expect(targetMasked.ok, JSON.stringify(targetMasked)).toBe(true);
    expect(siblingMasked.ok, JSON.stringify(siblingMasked)).toBe(true);
    if (!beforeMasked.ok || !targetMasked.ok || !siblingMasked.ok) return;
    expect(targetMasked.source).toBe(beforeMasked.source);
    expect(siblingMasked.source).not.toBe(beforeMasked.source);
    expect(maskManualEditTargets(source, [id], { slideIndex: 0 }).ok).toBe(false);
  });

  it('merges only selected comment targets from a model-produced full deck', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="headline">Slide one</h1><p data-od-id="body">Body one</p>',
      '</section>',
      '<section class="slide" data-slide-index="1">',
      '<h1 data-od-id="headline">Slide two</h1><p data-od-id="body">Body two</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="headline">Unexpected slide one edit</h1><p data-od-id="body">Body one</p>',
      '</section>',
      '<section class="slide" data-slide-index="1">',
      '<h1 data-od-id="headline">Slide two edited</h1><p data-od-id="body">Unexpected sibling edit</p>',
      '</section>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetsFromSource(source, modelOutput, ['headline'], { slideIndex: 1 });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.changedCount).toBe(1);
    expect(result.source).toContain('<h1 data-od-id="headline">Slide one</h1>');
    expect(result.source).toContain('<h1 data-od-id="headline">Slide two edited</h1>');
    expect(result.source).toContain('<p data-od-id="body">Body two</p>');
    expect(result.source).not.toContain('Unexpected slide one edit');
    expect(result.source).not.toContain('Unexpected sibling edit');
  });

  it('merges selector-based comment targets inside the selected slide only', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><p>Slide one copy</p></section>',
      '<section class="slide" data-slide-index="1"><p>Slide two copy</p><small>Keep me</small></section>',
      '</body></html>',
    ].join('');
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><p>Unexpected slide one edit</p></section>',
      '<section class="slide" data-slide-index="1"><p>Edited copy</p><small>Unexpected sibling edit</small></section>',
      '</body></html>',
    ].join('');
    const id = 'dom:body > section:nth-of-type(2) > p:nth-of-type(1)';

    const result = mergeManualEditTargetsFromSource(source, modelOutput, [id], { slideIndex: 1 });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<section class="slide" data-slide-index="0"><p>Slide one copy</p></section>');
    expect(result.source).toContain('<section class="slide" data-slide-index="1"><p>Edited copy</p><small>Keep me</small></section>');
    expect(result.source).not.toContain('Unexpected slide one edit');
    expect(result.source).not.toContain('Unexpected sibling edit');
  });

  it('merges slide-relative selector targets inside the selected slide only', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h2>Slide one heading</h2></section>',
      '<section class="slide" data-slide-index="1"><h2>Slide two heading</h2><p>Keep me</p></section>',
      '</body></html>',
    ].join('');
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h2>Unexpected slide one edit</h2></section>',
      '<section class="slide" data-slide-index="1"><h2 style="color:red">Edited heading</h2><p>Unexpected sibling edit</p></section>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetsFromSource(source, modelOutput, ['dom:h2:nth-of-type(1)'], { slideIndex: 1 });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<section class="slide" data-slide-index="0"><h2>Slide one heading</h2></section>');
    expect(result.source).toContain('<section class="slide" data-slide-index="1"><h2 style="color:red">Edited heading</h2><p>Keep me</p></section>');
    expect(result.source).not.toContain('Unexpected slide one edit');
    expect(result.source).not.toContain('Unexpected sibling edit');
  });

  it('merges generated DOM path comment targets inside the selected slide only', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h1>Slide one title</h1><p>Keep one</p></section>',
      '<section class="slide" data-slide-index="1"><h1>Slide two title</h1><p>Keep two</p></section>',
      '</body></html>',
    ].join('');
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h1>Unexpected slide one edit</h1><p>Keep one</p></section>',
      '<section class="slide" data-slide-index="1"><h1>Edited slide two</h1><p>Unexpected sibling edit</p></section>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetsFromSource(source, modelOutput, ['path-1-0'], { slideIndex: 1 });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<section class="slide" data-slide-index="0"><h1>Slide one title</h1><p>Keep one</p></section>');
    expect(result.source).toContain('<section class="slide" data-slide-index="1"><h1>Edited slide two</h1><p>Keep two</p></section>');
    expect(result.source).not.toContain('Unexpected slide one edit');
    expect(result.source).not.toContain('Unexpected sibling edit');
  });

  it('merges selected targets by scoped position when model output drops edit ids', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h1 data-od-id="title">Keep</h1></section>',
      '<section class="slide" data-slide-index="1">',
      '<h1 data-od-id="title" data-od-edit="text">강사 이름</h1><p data-od-id="body">본문</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><h1>Unexpected</h1></section>',
      '<section class="slide" data-slide-index="1">',
      '<h1>김이박</h1><p>Unexpected sibling edit</p>',
      '</section>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetsFromSource(source, modelOutput, ['title'], { slideIndex: 1 });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<section class="slide" data-slide-index="0"><h1 data-od-id="title">Keep</h1></section>');
    expect(result.source).toContain('<h1 data-od-id="title" data-od-edit="text">김이박</h1>');
    expect(result.source).toContain('<p data-od-id="body">본문</p>');
    expect(result.source).not.toContain('Unexpected sibling edit');
  });

  it('rejects scoped-position matches when a sibling insert shifts tags', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<p data-od-id="note" data-od-edit="text">Remember this note</p>',
      '</section>',
      '</body></html>',
    ].join('');
    // Model inserts a button before the paragraph — path-0 would land on the
    // button if position matching ignored tags.
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<button>Done</button>',
      '<p>Remember this note — updated</p>',
      '</section>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetsFromSource(
      source,
      modelOutput,
      ['note'],
      { slideIndex: 0 },
      [{
        id: 'note',
        currentText: 'Remember this note',
        instructionText: "rewrite to 'Remember this note — updated'",
        htmlHint: '<p data-od-id="note">Remember this note</p>',
      }],
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    // Position walk would have landed on <button>Done</button>; tag reject +
    // text-hint must still graft the paragraph update onto the pinned note.
    expect(result.source).toContain('<p data-od-id="note" data-od-edit="text">Remember this note — updated</p>');
    expect(result.source).not.toMatch(/data-od-id="note"[^>]*>Done</i);
    expect(result.source).not.toMatch(/<button[^>]*data-od-id="note"/i);
  });

  it('merges selected targets by instruction text when model output restructures the slide', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h1>토익 학원 첫 수업 안내</h1>',
      '<footer><span>강사 </span><strong data-od-id="instructor-name" data-od-edit="text">홍길동</strong></footer>',
      '<p data-od-id="body">여러분의 목표 점수를 함께 달성해 나가겠습니다.</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<p>TOEIC Preparation Course</p>',
      '<h1>토익 학원<br>첫 수업 안내</h1>',
      '<p>강사 <strong>김강사</strong></p>',
      '<p>여러분의 목표 점수를 함께 달성해 나가겠습니다.</p>',
      '</section>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetsFromSource(
      source,
      modelOutput,
      ['instructor-name'],
      { slideIndex: 0 },
      [{
        id: 'instructor-name',
        currentText: '홍길동',
        instructionText: "강사 이름은 '김강사' 야",
        htmlHint: '<strong data-od-id="instructor-name">홍길동</strong>',
      }],
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<strong data-od-id="instructor-name" data-od-edit="text">김강사</strong>');
    expect(result.source).toContain('<p data-od-id="body">여러분의 목표 점수를 함께 달성해 나가겠습니다.</p>');
    expect(result.source).not.toContain('TOEIC Preparation Course');
  });

  it('rejects selected target merges when the model did not change the target', () => {
    const source = '<!doctype html><html><body><section class="slide"><h1 data-od-id="headline">Keep</h1></section></body></html>';
    const modelOutput = source.replace('</section>', '<p>Unscoped edit</p></section>');

    const result = mergeManualEditTargetsFromSource(source, modelOutput, ['headline'], { slideIndex: 0 });

    expect(result.ok).toBe(false);
    expect(result.source).toBe(source);
    if (!result.ok) expect(result.reason).toContain('unchanged');
  });

  it('salvages text patches onto the primary leaf inside nested markup', () => {
    // `<p data-od-id="nested"><strong>Nested</strong> copy</p>` — comment /
    // manual set-text used to fail with "Use the HTML tab instead".
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'nested', value: 'Flat text' });

    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'nested');
    expect(html).toContain('<strong>Flat text</strong>');
    expect(html).not.toContain('>Nested<');
    // Trailing sibling text beside the leaf is cleared so the label rewrite
    // does not leave stale " copy" next to the new value.
    expect(html.replace(/\s+/g, ' ')).not.toMatch(/Flat text<\/strong>\s*copy/);
  });

  it('salvages text patches for gradient/span wrappers via comment hint', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h1 data-od-id="title"><span class="grad">뉴럴스튜디오</span></h1>',
      '<p>Keep</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'title', value: 'Neural Studio' },
      { slideIndex: 0 },
      { id: 'title', currentText: '뉴럴스튜디오', htmlHint: '<span class="grad">뉴럴스튜디오</span>' },
    );
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain('<span class="grad">Neural Studio</span>');
    expect(result.source).toContain('<p>Keep</p>');
    expect(result.source).toContain('data-od-id="title"');
  });

  it('flattens br-only headings instead of rejecting nested markup', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h2 data-od-id="title">아이폰 시리즈 개요 및<br>발전 동향 보고서</h2>',
      '</section>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'title', value: '아이폰 시리즈 개요 및 발전 동향 보고서' },
      { slideIndex: 0 },
    );
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain(
      '<h2 data-od-id="title">아이폰 시리즈 개요 및 발전 동향 보고서</h2>',
    );
    expect(result.source).not.toContain('<br');
  });

  it('maps committed newlines back to <br> so Enter wraps persist', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h2 data-od-id="title">한 줄 제목</h2>',
      '</section>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'title', value: '첫 줄\n둘째 줄' },
      { slideIndex: 0 },
    );
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain('<h2 data-od-id="title">첫 줄<br>둘째 줄</h2>');
  });

  it('encodes significant spaces so space-only set-text edits survive freeze remount', () => {
    // Under CSS white-space:normal, trailing / run spaces collapse after the
    // host remounts freeze HTML from source. ContentEditable made them look
    // real during edit; without &nbsp; encoding the save looks like a no-op.
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h2 data-od-id="title">헬로월드</h2>',
      '</section>',
      '</body></html>',
    ].join('');
    const trailing = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'title', value: '헬로월드 ' },
      { slideIndex: 0 },
    );
    expect(trailing.ok, trailing.error).toBe(true);
    expect(trailing.source).toMatch(
      /<h2 data-od-id="title">헬로월드(?:&nbsp;|\u00a0)<\/h2>/,
    );

    const double = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'title', value: '헬로  월드' },
      { slideIndex: 0 },
    );
    expect(double.ok, double.error).toBe(true);
    expect(double.source).toMatch(
      /<h2 data-od-id="title">헬로 (?:&nbsp;|\u00a0)월드<\/h2>/,
    );

    const leading = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'title', value: ' 헬로월드' },
      { slideIndex: 0 },
    );
    expect(leading.ok, leading.error).toBe(true);
    expect(leading.source).toMatch(
      /<h2 data-od-id="title">(?:&nbsp;|\u00a0)헬로월드<\/h2>/,
    );
  });

  it('round-trips space-only edits through readManualEditFields without trim', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h2 data-od-id="title">헬로월드</h2>',
      '</section>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'title', value: '헬로 월드 ' },
      { slideIndex: 0 },
    );
    expect(result.ok, result.error).toBe(true);
    expect(readManualEditFields(result.source, 'title', { slideIndex: 0 }).text).toBe(
      '헬로 월드 ',
    );
  });

  it('keeps intentional newlines when rewriting br-only headings', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h2 data-od-id="title">아이폰 시리즈 개요 및<br>발전 동향 보고서</h2>',
      '</section>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'title', value: '아이폰 시리즈 개요 및\n발전 동향 보고서' },
      { slideIndex: 0 },
    );
    expect(result.ok, result.error).toBe(true);
    expect(result.source).toContain(
      '<h2 data-od-id="title">아이폰 시리즈 개요 및<br>발전 동향 보고서</h2>',
    );
  });

  it('salvages ambiguous inline-only wrappers by rewriting their inner text', () => {
    // `<h1><span>Alpha</span><span>Beta</span></h1>` used to reject with
    // "Use the HTML tab" — real Teamver decks hit this constantly (badge +
    // label spans, gradient wrappers, etc.). Inline-only children mean the
    // user's edit can safely replace inner HTML with the escaped text.
    const source = [
      '<!doctype html><html><body>',
      '<h1 data-od-id="pair"><span>Alpha</span> <span>Beta</span></h1>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, { kind: 'set-text', id: 'pair', value: 'Gamma & <em>more</em>' });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'pair');
    expect(html).toContain('Gamma &amp; &lt;em&gt;more&lt;/em&gt;');
    expect(html).not.toContain('<span>');
  });

  it('flattens shallow text-only div/p stacks instead of rejecting', () => {
    // Teamver decks often wrap multi-line labels as sibling text divs.
    // Rejecting with "Use the HTML tab" blocked ordinary wording edits.
    const source = [
      '<!doctype html><html><body>',
      '<div data-od-id="stack"><div>첫 줄</div><div>둘째 줄</div></div>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, { kind: 'set-text', id: 'stack', value: '한 줄로' });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'stack');
    expect(html).toContain('한 줄로');
    expect(html).not.toContain('<div>첫 줄</div>');
    expect(html).not.toContain('둘째 줄');
  });

  it('still rejects text patches on block layout containers', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section data-od-id="grid"><article>One</article><article>Two</article></section>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, { kind: 'set-text', id: 'grid', value: 'Gamma' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('nested markup');
  });

  it('flattens nested markup for inline contenteditable commits', () => {
    const result = applyManualEditPatch(
      baseSource,
      { kind: 'set-text', id: 'nested', value: 'Flat text', flattenNestedMarkup: true },
    );

    expect(result.ok).toBe(true);
    expect(readManualEditOuterHtml(result.source, 'nested')).toBe('<p data-od-id="nested">Flat text</p>');
  });

  it('lets set-link update the label on a link with inline emphasis', () => {
    const source = [
      '<!doctype html><html><body>',
      '<a data-od-id="cta" href="/old"><strong>Old</strong> label</a>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, {
      kind: 'set-link',
      id: 'cta',
      text: 'Go now',
      href: '/new',
    });
    expect(result.ok, result.error).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'cta');
    expect(html).toContain('href="/new"');
    expect(html).toContain('Go now');
    expect(html).not.toContain('<strong>');
  });

  it('resolves scoped root for decks wrapped in .deck / .deck-stage containers', () => {
    const source = [
      '<!doctype html><html><body>',
      '<div class="deck">',
      '<section class="slide"><h1 data-od-id="headline">Slide one</h1></section>',
      '<section class="slide"><h1 data-od-id="headline">Slide two</h1></section>',
      '</div>',
      '</body></html>',
    ].join('');

    const result = applyManualEditPatch(
      source,
      { kind: 'set-text', id: 'headline', value: 'Edited two' },
      { slideIndex: 1 },
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.source).toContain('<h1 data-od-id="headline">Slide one</h1>');
    expect(result.source).toContain('<h1 data-od-id="headline">Edited two</h1>');
  });

  it('finds current target by captured text hint when structural id no longer resolves', () => {
    // Reproduces the stale-click failure mode: the deck on disk was
    // resaved with a structure that no longer carries a matching
    // `data-od-id` for the click payload id, and its path-N-M address
    // now walks to a different node. The hint carries the currentText
    // the click captured, so hint-based lookup should still resolve
    // the right element in current source and let the narrow merge
    // ship the model's text change.
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h1>강의 안내</h1>',
      '<p>강사 <strong>홍길동</strong></p>',
      '</section>',
      '</body></html>',
    ].join('');
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<h1>강의 안내</h1>',
      '<p>강사 <strong>김강사</strong></p>',
      '</section>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetsFromSource(
      source,
      modelOutput,
      ['instructor-name'],
      { slideIndex: 0 },
      [{
        id: 'instructor-name',
        currentText: '홍길동',
        instructionText: "강사 이름을 김강사로 바꿔",
        htmlHint: '<strong>홍길동</strong>',
      }],
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<strong>김강사</strong>');
    expect(result.source).toContain('<h1>강의 안내</h1>');
    expect(result.source).not.toContain('홍길동');
  });

  it('rejects hint fallback safely when the hint text is ambiguous across candidates', () => {
    // Two sibling candidates both match the hint text; the fallback
    // deterministically picks the FIRST element in currentDoc. In this
    // model output the FIRST `<p>알림</p>` is unchanged (still `알림`),
    // so the narrow merge diagnoses "targets unchanged" instead of
    // silently mis-patching the wrong sibling. This is the defensive
    // outcome — no fuzzy guess wins when the hint has no discriminator.
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<p>알림</p>',
      '<p>알림</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const modelOutput = source.replace('<p>알림</p><p>알림</p>', '<p>알림</p><p>공지</p>');

    const result = mergeManualEditTargetsFromSource(
      source,
      modelOutput,
      ['missing-id'],
      { slideIndex: 0 },
      [{
        id: 'missing-id',
        currentText: '알림',
        instructionText: '공지로 바꿔줘',
      }],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('unchanged');
    // Original source is preserved — no partial write on ambiguous.
    expect(result.source).toBe(source);
  });

  it('finds patched target by captured text hint when the model drops data-od-id', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<p class="company" data-od-id="company-name" style="font-size:24px">Teamver Inc.</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const modelOutput = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<p class="company" style="font-size:30px;font-weight:700">Teamver Inc.</p>',
      '</section>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetsFromSource(
      source,
      modelOutput,
      ['company-name'],
      { slideIndex: 0 },
      [{
        id: 'company-name',
        currentText: 'Teamver Inc.',
        instructionText: '회사 이름 눈에 잘 띄게 수정',
        htmlHint: '<p class="company"',
      }],
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('font-weight:700');
    expect(result.source).toContain('font-size:30px');
    expect(result.source).toContain('data-od-id="company-name"');
  });

  it('grafts a patched target element when ids are missing but text hints match', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<p class="company" data-od-id="company-name" style="font-size:24px">Teamver Inc.</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const patched = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '<p class="company" style="font-size:30px;font-weight:700">Teamver Inc.</p>',
      '<p>Extra sibling the model added</p>',
      '</section>',
      '</body></html>',
    ].join('');

    const graft = graftPatchedTargetElementFromSource(
      source,
      patched,
      'company-name',
      { slideIndex: 0 },
      {
        id: 'company-name',
        currentText: 'Teamver Inc.',
        instructionText: '회사 이름 눈에 잘 띄게 수정',
        htmlHint: '<p class="company"',
      },
    );

    expect(graft.ok, JSON.stringify(graft)).toBe(true);
    if (!graft.ok) return;
    expect(graft.source).toContain('font-weight:700');
    expect(graft.source).toContain('data-od-id="company-name"');
    expect(graft.source).not.toContain('Extra sibling');
  });

  it('merges by captured selector when structural ids are stale', () => {
    const source = [
      '<!doctype html><html><body>',
      '<div class="deck-shell"><div id="deck-stage" class="deck-stage">',
      '<section class="slide"><p>뉴럴스튜디오㈜ 소개</p></section>',
      '</div></div>',
      '</body></html>',
    ].join('');
    const patched = [
      '<!doctype html><html><body>',
      '<div class="deck-shell"><div id="deck-stage" class="deck-stage">',
      '<section class="slide"><p><strong>뉴럴스튜디오㈜</strong> 소개</p></section>',
      '</div></div>',
      '</body></html>',
    ].join('');

    const result = mergeManualEditTargetByHint(
      source,
      patched,
      { slideIndex: 0 },
      {
        currentText: '뉴럴스튜디오㈜ 소개',
        selector: 'body > div:nth-of-type(1) > div:nth-of-type(1) > section:nth-of-type(1) > p:nth-of-type(1)',
        htmlHint: '<p>',
      },
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('<strong>뉴럴스튜디오㈜</strong>');
  });

  it('resolves synthetic visual-mark ids to the scoped slide section', () => {
    const deck = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>One</h1></section>
<section class="slide" data-slide-index="1"><p data-od-id="p1">Marked</p></section>
</body></html>`;
    const result = applyManualEditPatch(
      deck,
      {
        kind: 'set-style',
        id: 'visual-mark-ms8hq9qu-drawing-2026-07-31T05-17-03-125Z-png',
        styles: { fontSize: '32px' },
      },
      { slideIndex: 1 },
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('font-size: 32px');
    expect(result.source).toContain('Marked');
  });
});

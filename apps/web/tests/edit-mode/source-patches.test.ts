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
} from '../../src/edit-mode/source-patches';

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
    expect(styles.padding).toBe('12px 8px 8px');
    expect(styles.paddingTop).toBe('12px');
    expect(styles.marginLeft).toBe('4px');
    expect(styles.borderTopWidth).toBe('2px');
    expect(styles.borderStyle).toBe('solid');
    expect(styles.borderColor).toBe('rgb(0, 0, 0)');
    expect(styles.borderRadius).toBe('8px');
    expect(styles.opacity).toBe('0.5');
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

  it('replaces full source for snapshot-based undo history', () => {
    const source = '<!doctype html><html><body><h1 data-od-id="hero-title">Snapshot</h1></body></html>';
    const result = applyManualEditPatch(baseSource, { kind: 'set-full-source', source });

    expect(result).toEqual({ ok: true, source });
  });

  it('updates CSS tokens in style tags', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-token', token: '--brand', value: '#f00' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('--brand: #f00;');
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
    expect(result.source).toContain('<h1 style="background-color: rgb(239, 68, 68);">Slide two title</h1>');
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

  it('rejects text patches for nested markup', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'nested', value: 'Flat text' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('nested markup');
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
});

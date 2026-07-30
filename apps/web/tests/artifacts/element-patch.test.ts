// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  applyElementPatches,
  isElementPatchArtifactType,
  parseElementPatch,
} from '../../src/artifacts/element-patch';

const CURRENT_DECK = [
  '<!doctype html>',
  '<html lang="ko"><head><meta charset="utf-8"/></head>',
  '<body>',
  '  <section class="slide" data-slide-index="0">',
  '    <h1 data-od-id="company-name" style="font-size:24px">Teamver Inc.</h1>',
  '    <p>Subtitle</p>',
  '  </section>',
  '</body>',
  '</html>',
].join('\n');

describe('isElementPatchArtifactType', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.document = dom.window.document;
  });
  it('accepts element-patch only', () => {
    expect(isElementPatchArtifactType('element-patch')).toBe(true);
    expect(isElementPatchArtifactType('ELEMENT-PATCH')).toBe(true);
    expect(isElementPatchArtifactType('deck-patch')).toBe(false);
  });
});

describe('parseElementPatch', () => {
  it('parses set-style and set-text patches for the pinned target', () => {
    const result = parseElementPatch([
      '<patch target-id="company-name" slide-index="0" kind="set-style">',
      '{"fontWeight":"700","fontSize":"32px"}',
      '</patch>',
      '<patch target-id="company-name" slide-index="0" kind="set-text">ACME Corp</patch>',
    ].join('\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patches).toHaveLength(2);
    expect(result.patches[0]).toMatchObject({
      slideIndex: 0,
      id: 'company-name',
      kind: 'set-style',
      styles: { fontWeight: '700', fontSize: '32px' },
    });
    expect(result.patches[1]).toMatchObject({
      slideIndex: 0,
      id: 'company-name',
      kind: 'set-text',
      value: 'ACME Corp',
    });
  });

  it('recovers unquoted target-id CSS paths that contain ">"', () => {
    const result = parseElementPatch(
      '<patch target-id=dom:body > section:nth-of-type(1) > h1:nth-of-type(1) slide-index=0 kind=set-text>새 제목</patch>',
    );
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.patches[0]).toMatchObject({
      slideIndex: 0,
      id: 'dom:body > section:nth-of-type(1) > h1:nth-of-type(1)',
      kind: 'set-text',
      value: '새 제목',
    });
  });

  it('parses target-id CSS paths that contain ">" (dom:body selectors)', () => {
    const targetId = 'dom:body > section:nth-of-type(1) > h1:nth-of-type(1)';
    // Model / template often emit the raw ">" inside the quoted attr.
    const rawGt = parseElementPatch(
      `<patch target-id="${targetId}" slide-index="0" kind="set-text">새 제목</patch>`,
    );
    expect(rawGt.ok, rawGt.ok ? '' : rawGt.reason).toBe(true);
    if (!rawGt.ok) return;
    expect(rawGt.patches[0]).toMatchObject({
      slideIndex: 0,
      id: targetId,
      kind: 'set-text',
      value: '새 제목',
    });

    // Our concrete templates escape ">" as &gt; — both forms must round-trip.
    const escaped = parseElementPatch(
      '<patch target-id="dom:body &gt; section:nth-of-type(1) &gt; h1:nth-of-type(1)" slide-index="0" kind="set-text">새 제목</patch>',
    );
    expect(escaped.ok, escaped.ok ? '' : escaped.reason).toBe(true);
    if (!escaped.ok) return;
    expect(escaped.patches[0]?.id).toBe(targetId);
    expect(escaped.patches[0]?.slideIndex).toBe(0);
  });
});

describe('applyElementPatches', () => {
  it('applies arbitrary natural-language-driven style edits without slide merge', () => {
    const parsed = parseElementPatch(
      '<patch target-id="company-name" slide-index="0" kind="set-style">{"fontWeight":"700","fontSize":"30px","color":"#ef4444"}</patch>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const applied = applyElementPatches({
      currentHtml: CURRENT_DECK,
      patches: parsed.patches,
      allowedSlideIndexes: [0],
      allowedTargetIds: ['company-name'],
    });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(applied.html).toContain('font-weight: 700');
    expect(applied.html).toContain('font-size: 30px');
    expect(applied.html).toMatch(/color:\s*(#ef4444|rgb\(239,\s*68,\s*68\))/);
    expect(applied.html).toContain('data-od-id="company-name"');
    expect(applied.html).toContain('<p>Subtitle</p>');
  });

  it('rejects patches outside the attached comment scope', () => {
    const parsed = parseElementPatch(
      '<patch target-id="other-id" slide-index="0" kind="set-text">Hijack</patch>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = applyElementPatches({
      currentHtml: CURRENT_DECK,
      patches: parsed.patches,
      allowedSlideIndexes: [0],
      allowedTargetIds: ['company-name'],
    });
    expect(applied.ok).toBe(false);
  });

  it('applies set-outer-html even when the body has a style sibling root', () => {
    // Repro: deck_patch_merge_failed — Replacement HTML must contain exactly
    // one root element. Comment-edit models frequently emit <style>+element.
    const parsed = parseElementPatch(
      [
        '<patch target-id="company-name" slide-index="0" kind="set-outer-html">',
        '<style>.pop{font-weight:700;color:#ef4444}</style>',
        '<h1 class="pop" data-od-id="company-name">Acme Corp</h1>',
        '</patch>',
      ].join(''),
    );
    expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
    if (!parsed.ok) return;

    const applied = applyElementPatches({
      currentHtml: CURRENT_DECK,
      patches: parsed.patches,
      allowedSlideIndexes: [0],
      allowedTargetIds: ['company-name'],
    });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(applied.html).toContain('class="pop"');
    expect(applied.html).toContain('data-od-id="company-name"');
    expect(applied.html).toContain('Acme Corp');
    expect(applied.html).toContain('<p>Subtitle</p>');
  });

  it('applies page-level data-screen-label targets like "01 Cover"', () => {
    const deck = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0" data-screen-label="01 Cover">',
      '<h1>KIM SEUNGHYUN</h1><p>Keep</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const parsed = parseElementPatch(
      '<patch target-id="01 Cover" slide-index="0" kind="set-style">{"backgroundColor":"#111827"}</patch>',
    );
    expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
    if (!parsed.ok) return;

    const applied = applyElementPatches({
      currentHtml: deck,
      patches: parsed.patches,
      allowedSlideIndexes: [0],
      allowedTargetIds: ['01 Cover'],
      targetHints: [{
        id: '01 Cover',
        targetIds: ['01 Cover'],
        slideIndex: 0,
        selector: '[data-screen-label="01 Cover"]',
        currentText: 'KIM SEUNGHYUN',
        htmlHint: '<h1>KIM SEUNGHYUN</h1>',
      }],
    });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(applied.html).toContain('data-screen-label="01 Cover"');
    expect(applied.html).toMatch(/background-color:\s*(#111827|rgb\(17,\s*24,\s*39\))/i);
  });

  it('applies dom: CSS paths that drifted from preview wrappers using slide-relative lookup', () => {
    const deck = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0"><p>one</p></section>',
      '<section class="slide" data-slide-index="1">',
      '<div><div class="a">a</div><div class="b"><p>Target copy</p></div></div>',
      '</section>',
      '</body></html>',
    ].join('');
    const targetId =
      'dom:body > div:nth-of-type(1) > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > p:nth-of-type(1)';
    const parsed = parseElementPatch(
      `<patch target-id="${targetId}" slide-index="1" kind="set-text">Patched</patch>`,
    );
    expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
    if (!parsed.ok) return;

    const applied = applyElementPatches({
      currentHtml: deck,
      patches: parsed.patches,
      allowedSlideIndexes: [1],
      allowedTargetIds: [targetId],
      targetHints: [{
        targetIds: [targetId],
        slideIndex: 1,
        id: targetId,
        currentText: 'Target copy',
        htmlHint: '<p>Target copy</p>',
      }],
    });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(applied.html).toContain('<p>Patched</p>');
    expect(applied.html).toContain('<p>one</p>');
  });

  it('falls back to comment text/html hints when preview dom paths include non-source wrappers', () => {
    const currentDeck = [
      '<!doctype html>',
      '<html><body>',
      '<section class="slide" data-slide-index="0"><p>Intro</p></section>',
      '<section class="slide" data-slide-index="1">',
      '  <div><div><p>AI 여민동락</p></div></div>',
      '</section>',
      '</body></html>',
    ].join('');
    const targetId = 'dom:body > div:nth-of-type(1) > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > p:nth-of-type(1)';
    const parsed = parseElementPatch(
      `<patch target-id="${targetId}" slide-index="1" kind="set-style">{"fontSize":"40px"}</patch>`,
    );
    expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
    if (!parsed.ok) return;

    const applied = applyElementPatches({
      currentHtml: currentDeck,
      patches: parsed.patches,
      allowedSlideIndexes: [1],
      allowedTargetIds: [targetId],
      targetHints: [{
        targetIds: [targetId],
        slideIndex: 1,
        id: targetId,
        currentText: 'AI 여민동락',
        htmlHint: '<p>',
        selector: 'body > div:nth-of-type(1) > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > p:nth-of-type(1)',
      }],
    });

    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(applied.html).toContain('font-size: 40px');
    expect(applied.html).toContain('AI 여민동락');
  });
});

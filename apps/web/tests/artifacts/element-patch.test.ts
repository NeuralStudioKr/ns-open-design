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
});

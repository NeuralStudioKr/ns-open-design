import { describe, expect, it } from 'vitest';

import {
  applyDeckPatch,
  isDeckPatchArtifactType,
  parseDeckPatch,
} from '../../src/artifacts/deck-patch';

const CURRENT_DECK = [
  '<!doctype html>',
  '<html lang="ko"><head><meta charset="utf-8"/></head>',
  '<body style="margin:0">',
  '  <section class="slide" data-slide-index="0">',
  '    <h1>Intro</h1><p>Original body</p>',
  '  </section>',
  '  <section class="slide" data-slide-index="1">',
  '    <h2>Numbers</h2><p>Original numbers</p>',
  '  </section>',
  '  <section class="slide" data-slide-index="2">',
  '    <h2>Wrap</h2><p>Original wrap</p>',
  '  </section>',
  '  <script>/* deck runtime */</script>',
  '</body>',
  '</html>',
].join('\n');

describe('isDeckPatchArtifactType', () => {
  it('accepts case-insensitive deck-patch and slide-patch types', () => {
    expect(isDeckPatchArtifactType('deck-patch')).toBe(true);
    expect(isDeckPatchArtifactType('DECK-PATCH')).toBe(true);
    expect(isDeckPatchArtifactType('slide-patch')).toBe(true);
  });

  it('rejects deck and text/html types (those go through the full-deck path)', () => {
    expect(isDeckPatchArtifactType('deck')).toBe(false);
    expect(isDeckPatchArtifactType('text/html')).toBe(false);
    expect(isDeckPatchArtifactType(undefined)).toBe(false);
    expect(isDeckPatchArtifactType(null)).toBe(false);
    expect(isDeckPatchArtifactType('')).toBe(false);
  });
});

describe('parseDeckPatch', () => {
  it('parses a single replace section with data-slide-index', () => {
    const result = parseDeckPatch(
      '<section class="slide" data-slide-index="1">' +
        '<h2>New</h2><p>Refreshed numbers</p>' +
        '</section>',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.ops).toHaveLength(1);
      expect(result.patch.ops[0]).toMatchObject({
        op: 'replace',
        slideIndex: 1,
      });
      expect(result.patch.ops[0]?.html).toContain('<h2>New</h2>');
      expect(result.patch.ops[0]?.html).toMatch(/^<section class="slide" data-slide-index="1">/);
    }
  });

  it('parses multiple sections and tolerates prose noise between them', () => {
    const result = parseDeckPatch(
      [
        '<!-- comment noise -->',
        '<section class="slide" data-slide-index="0">',
        '  <h1>Intro v2</h1>',
        '</section>',
        'Some stray prose the model added while planning.',
        '<section class="slide" data-slide-index="2">',
        '  <h2>Wrap v2</h2>',
        '</section>',
      ].join('\n'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.ops.map((op) => op.slideIndex)).toEqual([0, 2]);
      expect(result.patch.ops.every((op) => op.op === 'replace')).toBe(true);
    }
  });

  it('reads data-op="remove" / append / prepend explicitly', () => {
    const result = parseDeckPatch(
      [
        '<section class="slide" data-slide-index="0" data-op="remove"></section>',
        '<section class="slide" data-slide-index="1" data-op="append">',
        '  <h2>New after slide 1</h2>',
        '</section>',
        '<section class="slide" data-slide-index="0" data-op="prepend">',
        '  <h2>New before slide 0</h2>',
        '</section>',
      ].join('\n'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.ops.map((op) => op.op)).toEqual(['remove', 'append', 'prepend']);
      expect(result.patch.ops[0]?.html).toBe('');
    }
  });

  it('rejects sections missing data-slide-index (client cannot locate the target)', () => {
    const result = parseDeckPatch(
      '<section class="slide"><h2>No index</h2></section>',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/data-slide-index/);
    }
  });

  it('rejects unsupported data-op values so bad patches fall back to full-deck', () => {
    const result = parseDeckPatch(
      '<section class="slide" data-slide-index="0" data-op="rewrite-everything"></section>',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/data-op/);
    }
  });

  it('rejects an empty body (no slide sections to apply)', () => {
    const result = parseDeckPatch('   \n<!-- planning notes only -->\n');
    expect(result.ok).toBe(false);
  });
});

describe('applyDeckPatch', () => {
  it('replaces one slide by index while preserving <head>, <body> attributes, and non-slide siblings', () => {
    const parsed = parseDeckPatch(
      '<section class="slide" data-slide-index="1">' +
        '<h2>Numbers v2</h2><p>Refreshed numbers</p>' +
        '</section>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = applyDeckPatch({ currentHtml: CURRENT_DECK, patch: parsed.patch });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.appliedOps).toBe(1);
    expect(merged.html).toContain('<h2>Numbers v2</h2>');
    expect(merged.html).not.toContain('Original numbers');
    expect(merged.html).toContain('<script>/* deck runtime */</script>');
    expect(merged.html).toContain('<h1>Intro</h1>');
    expect(merged.html).toContain('<h2>Wrap</h2>');
    expect(merged.html).toContain('<body style="margin:0">');
  });

  it('applies remove / append / prepend in-order against the mutating slide list', () => {
    const parsed = parseDeckPatch(
      [
        '<section class="slide" data-slide-index="0" data-op="prepend">',
        '  <h1>Cover</h1>',
        '</section>',
        '<section class="slide" data-slide-index="3" data-op="remove"></section>',
      ].join('\n'),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const merged = applyDeckPatch({ currentHtml: CURRENT_DECK, patch: parsed.patch });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    // prepend adds a new cover before slide 0 (deck now has 4). Then remove
    // targets slideIndex 3 → the old "Wrap" section (which shifted to index
    // 3 after the prepend).
    expect(merged.appliedOps).toBe(2);
    expect(merged.html).toContain('<h1>Cover</h1>');
    expect(merged.html).not.toContain('Original wrap');
    expect(merged.html).toContain('<h2>Numbers</h2>');
    expect(merged.html).toContain('<h1>Intro</h1>');
  });

  it('fails when slideIndex exceeds the current deck bounds (client falls back)', () => {
    const parsed = parseDeckPatch(
      '<section class="slide" data-slide-index="99"><h2>Nope</h2></section>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = applyDeckPatch({ currentHtml: CURRENT_DECK, patch: parsed.patch });
    expect(merged.ok).toBe(false);
    if (!merged.ok) {
      expect(merged.reason).toMatch(/slideIndex 99/);
    }
  });

  it('fails when the current deck has no <body>…</body> to patch', () => {
    const parsed = parseDeckPatch(
      '<section class="slide" data-slide-index="0"></section>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = applyDeckPatch({
      currentHtml: '<div>not a full document</div>',
      patch: parsed.patch,
    });
    expect(merged.ok).toBe(false);
  });

  it('handles nested <section> tags inside a slide without confusing the depth counter', () => {
    const nestedDeck = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0">',
      '  <h1>A</h1>',
      '  <section aria-label="inner"><p>nested</p></section>',
      '</section>',
      '<section class="slide" data-slide-index="1">',
      '  <h1>B</h1>',
      '</section>',
      '</body></html>',
    ].join('\n');
    const parsed = parseDeckPatch(
      '<section class="slide" data-slide-index="1"><h1>B v2</h1></section>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = applyDeckPatch({ currentHtml: nestedDeck, patch: parsed.patch });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.html).toContain('<h1>A</h1>');
    expect(merged.html).toContain('<section aria-label="inner"><p>nested</p></section>');
    expect(merged.html).toContain('<h1>B v2</h1>');
    expect(merged.html).not.toContain('<h1>B</h1>');
  });
});

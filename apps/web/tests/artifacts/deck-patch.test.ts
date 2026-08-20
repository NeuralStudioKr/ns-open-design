import { describe, expect, it } from 'vitest';

import {
  appendIncomingSlidesOntoExistingDeck,
  applyDeckPatch,
  diffDeckSlideIndexes,
  extractTopLevelSlideSections,
  isDeckPatchArtifactType,
  parseDeckPatch,
  parseDeckPatchWithSalvage,
  salvageDeckPatchBodyMissingSlideWrapper,
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

  it('recovers missing data-slide-index from a single comment-scope fallback', () => {
    const result = parseDeckPatch(
      '<section class="slide" data-screen-label="03 역사"><h2>History v2</h2></section>',
      { fallbackSlideIndexes: [2] },
    );
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.patch.ops[0]).toMatchObject({ op: 'replace', slideIndex: 2 });
    expect(result.patch.ops[0]?.html).toContain('data-slide-index="2"');
    expect(result.patch.ops[0]?.html).toContain('data-screen-label="03 역사"');
  });

  it('recovers missing data-slide-index via data-screen-label on the current deck', () => {
    const current = [
      '<!doctype html><html><body>',
      '<section class="slide" data-slide-index="0" data-screen-label="01 인트로"><h1>Intro</h1></section>',
      '<section class="slide" data-slide-index="1" data-screen-label="02 개요"><h2>Overview</h2></section>',
      '<section class="slide" data-slide-index="2" data-screen-label="03 역사"><h2>History</h2></section>',
      '<section class="slide" data-slide-index="3" data-screen-label="04 레시피"><h2>Recipe</h2></section>',
      '</body></html>',
    ].join('');
    const result = parseDeckPatch(
      '<section class="slide" data-screen-label="04 레시피" style="background:#0f172a"><h2>Recipe v2</h2></section>',
      { currentHtml: current },
    );
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.patch.ops[0]?.slideIndex).toBe(3);
    const applied = applyDeckPatch({ currentHtml: current, patch: result.patch, allowedSlideIndexes: [3] });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(applied.html).toContain('Recipe v2');
    expect(applied.html).toContain('data-screen-label="03 역사"');
  });

  it('keeps data-slide-index that appears after a quoted attr containing ">"', () => {
    const result = parseDeckPatch(
      '<section class="slide" style="width:calc(100% > 50%)" data-slide-index="1"><h2>Ok</h2></section>',
    );
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.patch.ops[0]?.slideIndex).toBe(1);
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

describe('salvageDeckPatchBodyMissingSlideWrapper', () => {
  it('wraps raw SVG markup when a single scoped slide index is known', () => {
    const body = '<svg viewBox="0 0 24 24"><path d="M12 21s-8-4.5-8-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-8 11-8 11z"/></svg>';
    const salvaged = salvageDeckPatchBodyMissingSlideWrapper(body, { fallbackSlideIndexes: [1] });
    expect(salvaged).toContain('data-slide-index="1"');
    expect(salvaged).toContain('<svg');
    const parsed = parseDeckPatchWithSalvage(body, { fallbackSlideIndexes: [1] });
    expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.patch.ops[0]?.slideIndex).toBe(1);
  });

  it('does not salvage when multiple scoped slide indexes are present', () => {
    const body = '<div>shape</div>';
    expect(
      salvageDeckPatchBodyMissingSlideWrapper(body, { fallbackSlideIndexes: [0, 1] }),
    ).toBeNull();
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

  it('rejects scoped comment patches that target a non-attached slide', () => {
    const parsed = parseDeckPatch(
      '<section class="slide" data-slide-index="2"><h2>Wrong slide</h2></section>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = applyDeckPatch({
      currentHtml: CURRENT_DECK,
      patch: parsed.patch,
      allowedSlideIndexes: [1],
    });
    expect(merged.ok).toBe(false);
    if (!merged.ok) {
      expect(merged.reason).toMatch(/outside attached comment scope/);
    }
  });

  it('allows scoped comment patches to replace only the attached slide', () => {
    const parsed = parseDeckPatch(
      '<section class="slide" data-slide-index="1"><h2>Numbers scoped</h2></section>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = applyDeckPatch({
      currentHtml: CURRENT_DECK,
      patch: parsed.patch,
      allowedSlideIndexes: [1],
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.html).toContain('<h2>Numbers scoped</h2>');
    expect(merged.html).toContain('<h1>Intro</h1>');
    expect(merged.html).toContain('<h2>Wrap</h2>');
  });

  it('rejects structural ops for scoped comment patches', () => {
    const parsed = parseDeckPatch(
      '<section class="slide" data-slide-index="1" data-op="append"><h2>Extra</h2></section>',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = applyDeckPatch({
      currentHtml: CURRENT_DECK,
      patch: parsed.patch,
      allowedSlideIndexes: [1],
    });
    expect(merged.ok).toBe(false);
    if (!merged.ok) {
      expect(merged.reason).toMatch(/not allowed for scoped comment edits/);
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

describe('diffDeckSlideIndexes', () => {
  it('reports only the changed slide indexes between two full deck documents', () => {
    const next = CURRENT_DECK.replace('<h2>Numbers</h2>', '<h2>Numbers v2</h2>');
    const diff = diffDeckSlideIndexes(CURRENT_DECK, next);
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    expect(diff.changedSlideIndexes).toEqual([1]);
  });

  it('accepts pre-materialized beforeSlides without rematerializing', () => {
    const next = CURRENT_DECK.replace('<h2>Numbers</h2>', '<h2>Numbers v2</h2>');
    const beforeBody = CURRENT_DECK.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';
    const beforeSlides = extractTopLevelSlideSections(beforeBody);
    const diff = diffDeckSlideIndexes('<!-- no body -->', next, { beforeSlides });
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    expect(diff.changedSlideIndexes).toEqual([1]);
  });

  it('accepts pre-materialized afterSlides without rematerializing', () => {
    const next = CURRENT_DECK.replace('<h2>Numbers</h2>', '<h2>Numbers v2</h2>');
    const afterBody = next.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';
    const afterSlides = extractTopLevelSlideSections(afterBody);
    const diff = diffDeckSlideIndexes(CURRENT_DECK, '<!-- no body -->', { afterSlides });
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    expect(diff.changedSlideIndexes).toEqual([1]);
  });

  it('fails when a full deck fallback changes the slide count', () => {
    const next = CURRENT_DECK.replace(
      '<script>/* deck runtime */</script>',
      '<section class="slide" data-slide-index="3"><h2>Extra</h2></section>\n<script>/* deck runtime */</script>',
    );
    const diff = diffDeckSlideIndexes(CURRENT_DECK, next);
    expect(diff.ok).toBe(false);
    if (!diff.ok) {
      expect(diff.reason).toMatch(/slide count changed/);
    }
  });
});

describe('appendIncomingSlidesOntoExistingDeck', () => {
  it('appends body-only new slides onto a saved official-look deck', () => {
    const oneSlide = [
      '<!doctype html><html><head><title>Daisy Days</title>',
      '<style>.deco{position:absolute}</style></head><body>',
      '<section class="slide"><h1>Linux Internals</h1><p>Cover</p></section>',
      '</body></html>',
    ].join('');
    const incoming =
      '<section class="slide"><h2>Why it matters</h2><p>Kernel ABI.</p></section>'
      + '<section class="slide"><h2>Next steps</h2><p>Trace syscalls.</p></section>';
    const merged = appendIncomingSlidesOntoExistingDeck(oneSlide, incoming);
    expect(merged).toContain('<title>Daisy Days</title>');
    expect(merged).toContain('<h1>Linux Internals</h1>');
    expect(merged).toContain('<h2>Why it matters</h2>');
    expect(merged).toContain('<h2>Next steps</h2>');
    expect(extractTopLevelSlideSections(merged ?? '').length).toBe(3);
  });

  it('keeps only the tail when incoming is a longer full rewrite', () => {
    const prior =
      '<!doctype html><html><body><section class="slide"><h1>Cover</h1></section></body></html>';
    const incoming = [
      '<!doctype html><html><head><style>.x{}</style></head><body>',
      '<section class="slide"><h1>Cover</h1></section>',
      '<section class="slide"><h2>Body</h2><p>More.</p></section>',
      '</body></html>',
    ].join('');
    const merged = appendIncomingSlidesOntoExistingDeck(prior, incoming);
    expect(merged).toContain('<h1>Cover</h1>');
    expect(merged).toContain('<h2>Body</h2>');
    expect(extractTopLevelSlideSections(merged ?? '').length).toBe(2);
  });

  it('does not clobber the saved deck with a shorter head rewrite', () => {
    const prior =
      '<!doctype html><html><head><style>.kit{}</style></head><body>'
      + '<section class="slide"><h1>Cover</h1></section></body></html>';
    const rewrite =
      '<!doctype html><html><head><title>Daisy</title></head><body>'
      + '<section class="slide"><h1>New cover</h1></section></body></html>';
    expect(appendIncomingSlidesOntoExistingDeck(prior, rewrite)).toBeNull();
  });
});

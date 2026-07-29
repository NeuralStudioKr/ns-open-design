// @vitest-environment jsdom
//
// Behavioural coverage for the "empty element-patch" recovery path.
//
// Bug (user report on staging, 2026-07-29): the model emitted
//   <artifact type="element-patch" identifier="deck"></artifact>
// with a truly empty body. `parseElementPatch` returned
// `{ ok: false, reason: 'empty element-patch body' }`, which
// `tryApplyElementPatchesAgainstCurrentDeck` bubbled up as
// `deck_patch_parse_failed`. The caller in persistArtifact
// unconditionally wrapped that as `scope-rejected`, so the user saw
//   "선택한 댓글 대상 밖의 변경이 감지되어 저장하지 않았습니다."
// even though the failure was actually "model gave us no content".
//
// This suite pins two recoveries:
//   1. Salvage: when the element-patch wrapper contains
//      `<section class="slide">` content, fall back to the deck-patch
//      pipeline (`elementPatchBodyLooksLikeDeckPatch`).
//   2. Auto-continue: truly empty element-patch bodies are routed
//      through `skipped-incomplete` so the run enters the standard
//      "결과물이 완성되지 않아 자동으로 이어쓰기…" recovery instead
//      of the scary scope-rejected banner.
//
// The persistArtifact wire-up is asserted via source-level pins in
// project-view-message-load.test.ts; here we focus on the parse
// primitives that drive both branches.

import { describe, expect, it } from 'vitest';
import { parseElementPatch } from '../src/artifacts/element-patch';

describe('parseElementPatch — empty / malformed bodies', () => {
  it('rejects a truly empty body with the "empty element-patch body" sentinel', () => {
    const result = parseElementPatch('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty element-patch body');
  });

  it('rejects a whitespace-only body with the same sentinel', () => {
    const result = parseElementPatch('   \n\t   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty element-patch body');
  });

  it('rejects a body with content but no <patch> blocks with a distinct sentinel', () => {
    const result = parseElementPatch(
      '<section class="slide" data-slide-index="1"><h1>Content but no patch tags</h1></section>',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no <patch> blocks in element-patch body');
  });

  it('accepts a well-formed element-patch and returns the parsed ops', () => {
    const result = parseElementPatch(
      '<patch target-id="hero" slide-index="1" kind="set-text">New title</patch>',
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0]).toMatchObject({
      id: 'hero',
      kind: 'set-text',
      value: 'New title',
      slideIndex: 1,
    });
  });
});

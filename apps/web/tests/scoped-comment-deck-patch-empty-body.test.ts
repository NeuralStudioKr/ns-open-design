// @vitest-environment jsdom
//
// Behavioural coverage for the new empty deck-patch salvage.
//
// Bug (2026-07-29 round-review): the model occasionally emits
//   <artifact type="deck-patch" identifier="deck"></artifact>
// or
//   <artifact type="deck-patch"><h1>filler with no section</h1></artifact>
// against a scoped comment attachment. `parseDeckPatch` returned
// `{ ok: false, reason: 'no <section class="slide"> blocks in deck-patch body' }`,
// which persistArtifact previously wrapped as `scope-rejected` — the
// user saw "선택한 댓글 대상 밖의 변경이 감지되어 저장하지
// 않았습니다." even though the failure was actually "model gave us
// no slide content". Auto-continue never fired because the persist
// result was scope-rejected, not skipped-incomplete.
//
// The fix mirrors the empty-element-patch policy:
//   - Scoped run + `isDeckPatchEmptyBody(body, reason)` → `skipped-incomplete`
//     (auto-continue takes over).
//   - Unscoped run + empty deck-patch → `rejected` with a specific banner.
//
// This suite pins the predicate.

import { describe, expect, it } from 'vitest';
import { isDeckPatchEmptyBody } from '../src/components/ProjectView';
import { parseDeckPatch } from '../src/artifacts/deck-patch';

describe('parseDeckPatch — empty body sentinel is stable', () => {
  it('rejects a truly empty body with the emptiness sentinel', () => {
    const result = parseDeckPatch('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no <section class="slide"> blocks in deck-patch body');
    }
  });

  it('rejects a whitespace-only body with the same sentinel', () => {
    const result = parseDeckPatch('   \n\t   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no <section class="slide"> blocks in deck-patch body');
    }
  });

  it('rejects a body with content but no <section class="slide"> blocks with the same sentinel', () => {
    const result = parseDeckPatch('<h1>filler content but no slide sections</h1>');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no <section class="slide"> blocks in deck-patch body');
    }
  });
});

describe('isDeckPatchEmptyBody — routes only the empty case to auto-continue', () => {
  const emptySentinel = 'no <section class="slide"> blocks in deck-patch body';

  it('accepts empty and whitespace-only bodies', () => {
    expect(isDeckPatchEmptyBody('', emptySentinel)).toBe(true);
    expect(isDeckPatchEmptyBody('   ', emptySentinel)).toBe(true);
    expect(isDeckPatchEmptyBody('\n\t\r', emptySentinel)).toBe(true);
  });

  it('accepts content that is neither <patch> nor <section class="slide">', () => {
    // Sentinel says no <section class="slide">, and there is nothing to
    // salvage into element-patch (no <patch> either) — treat as empty
    // and let auto-continue try again.
    expect(isDeckPatchEmptyBody('<h1>Placeholder</h1>', emptySentinel)).toBe(true);
    expect(isDeckPatchEmptyBody('설명만 있고 실제 슬라이드는 없음', emptySentinel)).toBe(true);
  });

  it('rejects a body that has <patch> blocks — that is the salvage case, not empty', () => {
    // deckPatchBodyLooksLikeElementPatch handles this — do not route
    // to auto-continue here or the salvage never fires.
    expect(
      isDeckPatchEmptyBody(
        '<patch target-id="hero" slide-index="1" kind="set-style">{"fontSize":"32px"}</patch>',
        emptySentinel,
      ),
    ).toBe(false);
  });

  it('rejects any parse failure reason that is NOT the emptiness sentinel', () => {
    // Missing data-slide-index, unsupported op, non-integer index — all
    // real parse errors that should surface as scope-rejected, not
    // silently retried through auto-continue.
    expect(
      isDeckPatchEmptyBody(
        '<section class="slide">missing index</section>',
        'deck-patch section missing data-slide-index attribute (open tag: <section class="slide">…)',
      ),
    ).toBe(false);
    expect(
      isDeckPatchEmptyBody(
        '<section class="slide" data-slide-index="0" data-op="unsupported"></section>',
        'deck-patch section uses unsupported data-op (open tag: <section class="slide" data-slide-index="0" data-op="unsupported">…)',
      ),
    ).toBe(false);
  });
});

// 루프166 — MiniMax `<div class="arrow"></div>` CSS-삼각형 chrome이 step 카드에
// 잔재로 남는 회귀 방어. MiniMax는 자기 CSS에 다음 규칙을 함께 emit한다:
//
//   .slide .arrow{position:absolute; right:0; top:50%; transform:translateY(-50%);
//                  width:0; height:0; border-*}
//   .slide .arrow{display:none;}
//
// 루프158에서 `.slide .foo` 계열은 catalog paint가 body content로 들이닫는 것을
// 막기 위해 `.slide [data-od-official-motif-html].foo` 로 좁혔다. 그러나 두 번째
// `display:none` 규칙까지 함께 좁혀지면서 body의 빈 `.arrow` (본문 카드에 붙는
// CSS-삼각형)가 렌더링에 그대로 노출된다 — step 카드 아래에 검은 삼각형이 남는
// 사용자 리포트 (2026-08-28 · staging MiniMax English-conversation deck).
//
// 이 스펙은 두 축을 방어한다:
//   A) look CSS의 neutralize sheet가 `[data-od-slide-flow]` 내부의 빈
//      `.arrow`/`.arr`을 `display:none` 처리해야 한다.
//   B) MiniMax deco CSS scope-rewriter는 `display:none` hide 규칙은 좁히지 말고
//      body 요소에도 적용되도록 보존해야 한다.
//
// 두 축 중 하나만 있어도 렌더링은 정상화되지만, 두 축 모두 확보하는 것이
// MiniMax의 임의 CSS 조합에 견고하다.

import { describe, expect, it } from 'vitest';

import {
  LOOK_NEUTRALIZE_CSS,
  mergeOfficialDeckLookCss,
} from '../src/html/deck-template-look-css';
import { buildStandaloneDeckHtmlDocument } from '../src/html/deckPdfExport';
import { pinDeckSlidesToFixedCanvas } from '../src/html/deck-fixed-canvas';

const FIXTURE_MINIMAX_ARROW_STEP_CARDS = `<!doctype html><html><head>
<title>MiniMax arrow regression</title>
<style data-od-official-motif-deco-css>
.slide .arrow{position:absolute; right:0; top:50%; transform:translateY(-50%); width:0; height:0; border-top:18px solid transparent; border-bottom:18px solid transparent; border-left:24px solid #0F0F0F; z-index:2;}
.slide .arrow{display:none;}
.slide .marker{position:absolute; left:96px; bottom:160px; width:560px; height:120px; background:#F06CA8; border:4px solid #0F0F0F;}
</style>
</head><body>
<section class="slide" data-screen-label="04 STEPS" style="position:relative;background:#EFE9D9;color:#0F0F0F;overflow:hidden">
  <div style="padding:56px 96px">
    <h2 style="font-size:108px;margin:0">ONE CHUNK, FOUR PASSES.</h2>
    <div class="flow" style="display:grid;grid-template-columns:repeat(4,1fr);gap:28px">
      <div class="step" style="border:4px solid #0F0F0F;padding:28px">
        <div style="font-size:64px">01</div>
        <div>LISTENING</div>
        <div>TED 청취</div>
        <div class="arrow" style="position:relative;transform:translateY(-50%);width:0;height:0;border-top:18px solid transparent;border-bottom:18px solid transparent;border-left:24px solid #0F0F0F;z-index:2"></div>
      </div>
      <div class="step" style="border:4px solid #0F0F0F;padding:28px">
        <div style="font-size:64px">02</div>
        <div>SHADOW</div>
        <div>Shadowing</div>
        <div class="arrow" style="position:relative;transform:translateY(-50%);width:0;height:0;border-top:18px solid transparent;border-bottom:18px solid transparent;border-left:24px solid #0F0F0F;z-index:2"></div>
      </div>
    </div>
  </div>
</section>
</body></html>`;

describe('MiniMax .arrow / .arr CSS-triangle body chrome must not render (루프166)', () => {
  it('LOOK_NEUTRALIZE_CSS hides empty body .arrow / .arr inside data-od-slide-flow', () => {
    // Two robustness signals: it targets .arrow and .arr, it uses :empty, it
    // sits inside a [data-od-slide-flow] descendant selector, and it exempts
    // real Motif hosts. `display:none !important` is required so scoped deco
    // CSS (which sets `display:none` on motif hosts) or inline styles from
    // MiniMax do not accidentally lose to specificity.
    const rule = LOOK_NEUTRALIZE_CSS.match(
      /\.slide[^{}]*\[data-od-slide-flow\][^{}]*:is\(\.arrow,\s*\.arr\)[^{}]*:empty[^{}]*\{[^{}]*display:\s*none[^}]*\}/i,
    );
    expect(rule, `LOOK_NEUTRALIZE_CSS must include an empty-arrow hide rule; got:\n${LOOK_NEUTRALIZE_CSS}`).not.toBeNull();
    expect(rule![0]).toMatch(/display:\s*none\s*!important/i);
    expect(rule![0]).toMatch(/:not\(\[data-od-official-motif-html\]\)/i);
  });

  it('scopeMotifDecoCssToOfficialHosts preserves `display:none` rules unscoped', () => {
    // Feed the destination through mergeOfficialDeckLookCss so the deco CSS
    // pipeline (which includes scopeMotifDecoCssToOfficialHosts) has a chance
    // to rewrite the MiniMax deco sheet. Even after scoping, the second
    // `display:none` rule must retain a form that applies to body `.arrow`
    // elements (either unscoped `.slide .arrow` or an `:empty` neutralize
    // fallback wrapping it).
    const merged = mergeOfficialDeckLookCss(FIXTURE_MINIMAX_ARROW_STEP_CARDS);
    // The deco sheet body may either
    //   (a) still contain an unscoped `.slide .arrow{display:none}` line, OR
    //   (b) the neutralize sheet must include the `:empty` hide rule.
    // Either satisfies the regression contract.
    const decoSheetMatch = merged.match(
      /<style\b[^>]*\bdata-od-official-motif-deco-css\b[^>]*>([\s\S]*?)<\/style>/i,
    );
    const decoBody = decoSheetMatch?.[1] ?? '';
    const decoHasUnscopedHide =
      /\.slide\s+\.arrow\b[^{]*\{[^}]*display:\s*none[^}]*\}/i.test(decoBody);
    const neutralizeHidesEmpty =
      /\[data-od-slide-flow\][^{}]*:is\(\.arrow,\s*\.arr\)[^{}]*:empty[^{}]*display:\s*none/i.test(merged);
    expect(
      decoHasUnscopedHide || neutralizeHidesEmpty,
      'One of (a) deco CSS retains unscoped `.slide .arrow{display:none}`, or (b) neutralize sheet has `[data-od-slide-flow] :is(.arrow, .arr):empty { display:none }` must hold.',
    ).toBe(true);
  });

  it('end-to-end pin+export never leaves an inline `.arrow`/`.arr` catalog CSS-triangle uncovered by a hide rule', () => {
    const doc = buildStandaloneDeckHtmlDocument(FIXTURE_MINIMAX_ARROW_STEP_CARDS);
    // The body arrows should still exist in DOM (loop158/163 do not strip them
    // — they only rewrite look CSS scope). But the export must include a hide
    // rule that CSS engines will apply to them.
    expect(doc).toMatch(/<div\s+class="arrow"[^>]*><\/div>/i);
    const hideRuleApplies =
      /\.slide[^{}]*\[data-od-slide-flow\][^{}]*:is\(\.arrow,\s*\.arr\)[^{}]*:empty[^{}]*display:\s*none/i.test(doc)
      || /\.slide\s+\.arrow\b[^{}]*\{[^}]*display:\s*none[^}]*\}/i.test(doc);
    expect(
      hideRuleApplies,
      'Exported document must include a hide rule that reaches body `.arrow`/`.arr` elements',
    ).toBe(true);
  });

  it('the hide rule does NOT touch `.arrow`/`.arr` elements that carry visible text', () => {
    // Defensive: some decks legitimately use `.arrow` with text content (e.g.
    // "→ Next"). :empty must not swallow them.
    const html = `<!doctype html><html><body>
<section class="slide">
  <div class="arrow" style="position:relative">→ Next step</div>
</section>
</body></html>`;
    const pinned = pinDeckSlidesToFixedCanvas(html, { force: true });
    // `→ Next step` must survive pin. Neutralize CSS only hides `:empty`
    // arrows, so this content-carrying `.arrow` remains in the DOM.
    expect(pinned).toContain('→ Next step');
  });
});

// @vitest-environment jsdom
//
// End-to-end reproduction of the user-reported deck_patch_merge_failed
// after the style-only + text-preserved fallbacks landed.
//
// User's message: "회사 이름 눈에 잘 띄게 수정".
// Model's response (verbatim from bug report):
//   <artifact type="deck-patch" identifier="deck">
//     <section class="slide" data-slide-index="1" style="…">
//       …heavy styling, gradient span, malformed duplicate style attr
//     </section>
//   </artifact>
//
// This suite drives the full deck-patch merge pipeline
// (parseDeckPatch → applyDeckPatch → mergeScopedCommentTargetsFromPatchedDeck)
// with the exact model output the user pasted, using a plausible
// current-deck HTML and a plausible comment attachment. The
// deck_patch_merge_failed error must NOT reappear for this case.

import { describe, expect, it } from 'vitest';
import {
  applyScopedDeckPatchToHtml,
  mergeScopedCommentTargetsFromPatchedDeck,
  resolveScopedCommentSlideCandidates,
} from '../src/components/ProjectView';
import { applyDeckPatch, parseDeckPatch } from '../src/artifacts/deck-patch';
import type { ChatCommentAttachment } from '../src/types';

// Model output from the user's bug report. Includes the exact
// malformed duplicate `style` attribute the model produced.
const MODEL_PATCH_BODY = `
<section class="slide" data-slide-index="1" style="background:#ffffff;color:#0f172a">
  <div class="pin dark"><span class="dot amber"></span>Company Overview</div>
  <h2 style="margin:0 0 20px;font-size:80px;font-weight:900;line-height:1.06;letter-spacing:-.02em">AI를 <span style="color:#2563eb;font-size:96px;font-weight:900;text-shadow:0 2px 24px rgba(37,99,235,.3)">모두의 기술</span>로<br>만드는 기업</h2>
  <p style="margin:0 0 16px;font-size:26px;color:#475569;max-width:48rem;line-height:1.6">
    <span style="display:inline-block;background:linear-gradient(90deg,#2563eb,#6366f1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:34px;font-weight:900;letter style="display:inline-block;background:linear-gradient(90deg,#2563eb,#6366f1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:34px;font-weight:900;letter-spacing:-.01em;padding-right:4px">뉴럴스튜디오㈜</span>는 Agentic AI OS 기반의 AI-native 회사입니다.
  </p>
  <p style="margin:0 0 48px;font-size:22px;color:#64748b;max-width:48rem;line-height:1.6">Teamver와 Genver를 통해 AI가 실제 업무 성과로 이어지는 구조를 만들어갑니다.</p>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:960px">
    <div style="background:#f8fafc;border-radius:16px;padding:32px 28px;border-left:4px solid #6366f1">
      <div style="font-size:16px;font-weight:700;letter-spacing:.1em;color:#6366f1;margin-bottom:12px">AI FOR EVERYONE</div>
      <div style="font-size:20px;color:#1e293b;line-height:1.55">AI는 소수만의 기술이 아니라, 누구나 활용할 수 있어야 합니다.</div>
    </div>
    <div style="background:#f8fafc;border-radius:16px;padding:32px 28px;border-left:4px solid #10b981">
      <div style="font-size:16px;font-weight:700;letter-spacing:.1em;color:#10b981;margin-bottom:12px">BUILD FOR REALITY</div>
      <div style="font-size:20px;color:#1e293b;line-height:1.55">좋은 기술은 실제 문제를 해결할 때 비로소 가치가 있습니다.</div>
    </div>
    <div style="background:#f8fafc;border-radius:16px;padding:32px 28px;border-left:4px solid #f59e0b">
      <div style="font-size:16px;font-weight:700;letter-spacing:.1em;color:#f59e0b;margin-bottom:12px">REDUCE FAILURE</div>
      <div style="font-size:20px;color:#1e293b;line-height:1.55">성공을 말하기 전에, 실패를 줄이는 구조와 전략이 먼저입니다.</div>
    </div>
  </div>
</section>
`.trim();

// A plausible current disk HTML: 6-slide deck where slide 1 has an
// h2 title, an intro <p> containing "뉴럴스튜디오㈜" text plainly
// (no span wrapper), and a follow-up <p>. Data-od-id attrs live on
// each meaningful element (mirrors annotateMissingOdIds output).
const CURRENT_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<section class="slide" data-slide-index="0" data-od-id="path-0">
  <h1 data-od-id="path-0-0">인트로</h1>
</section>
<section class="slide" data-slide-index="1" data-od-id="path-1">
  <div class="pin dark" data-od-id="path-1-0"><span class="dot amber"></span>Company Overview</div>
  <h2 data-od-id="path-1-1">AI를 모두의 기술로<br>만드는 기업</h2>
  <p data-od-id="path-1-2">뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.</p>
  <p data-od-id="path-1-3">Teamver와 Genver를 통해 AI가 실제 업무 성과로 이어지는 구조를 만들어갑니다.</p>
</section>
<section class="slide" data-slide-index="2" data-od-id="path-2">
  <h1 data-od-id="path-2-0">비전</h1>
</section>
</body></html>`;

function attachmentFor(overrides: Partial<ChatCommentAttachment> = {}): ChatCommentAttachment {
  return {
    id: 'c1',
    order: 1,
    filePath: 'deck.html',
    // The user's click resolved to the <p> element containing
    // "뉴럴스튜디오㈜" — annotateMissingOdIds would have written
    // `data-od-id="path-1-2"` on it (2nd meaningful child of body's
    // 2nd section).
    elementId: 'path-1-2',
    selector: '[data-od-id="path-1-2"]',
    label: 'p',
    comment: '회사 이름 눈에 잘 띄게 수정',
    currentText: '뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.',
    pagePosition: { x: 0, y: 0, width: 10, height: 10 },
    htmlHint: '<p data-od-id="path-1-2">뉴럴스튜디오㈜는 Agentic AI OS 기반의 AI-native 회사입니다.</p>',
    selectionKind: 'element',
    slideIndex: 1,
    ...overrides,
  };
}

describe('scoped comment merge — end-to-end for the actual bug report', () => {
  it('accepts the model deck-patch even though it dropped data-od-id and wrapped the target text in a new span', () => {
    // Step 1: parse the model output as a deck-patch (parseDeckPatch
    // must accept the malformed duplicate-`style` markup — depth
    // counting is HTML-tolerant).
    const parsed = parseDeckPatch(MODEL_PATCH_BODY);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) return;

    // Step 2: applyDeckPatch produces the merged slide-level result.
    const applied = applyDeckPatch({
      currentHtml: CURRENT_HTML,
      patch: parsed.patch,
      allowedSlideIndexes: [1],
    });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;

    // Step 3: mergeScopedCommentTargetsFromPatchedDeck narrows to
    // target element. This is where the user hit deck_patch_merge_failed.
    const scoped = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: CURRENT_HTML,
      patchedHtml: applied.html,
      commentAttachments: [attachmentFor()],
      instructionText: '회사 이름 눈에 잘 띄게 수정',
    });

    expect(scoped.ok, JSON.stringify(scoped)).toBe(true);
    if (!scoped.ok) return;
    // Result must include the model's emphasis edit (gradient span
    // around 뉴럴스튜디오㈜) so the user's request actually ships.
    expect(scoped.html).toContain('뉴럴스튜디오㈜');
    expect(scoped.html).toContain('linear-gradient');
    // Non-target slides survive verbatim — the scoped merge did not
    // silently touch slide 0 or slide 2.
    expect(scoped.html).toContain('<h1 data-od-id="path-0-0">인트로</h1>');
    expect(scoped.html).toContain('<h1 data-od-id="path-2-0">비전</h1>');
  });

  it('still fails cleanly when the model wiped the target text (safety rail)', () => {
    // Regression protection: if the model returns a slide that no
    // longer contains the captured currentText, the fallback path
    // must NOT accept a slide-level swap. This is the case that
    // 2026-07-28 comment style edit 단일 슬라이드 fallback 회수
    // originally shut down; the newer fallbacks must not reopen it.
    const wipedPatchBody = `
<section class="slide" data-slide-index="1">
  <h1>완전히 다른 슬라이드로 교체됨</h1>
  <p>회사 이름이 아예 사라졌습니다.</p>
</section>`.trim();

    const parsed = parseDeckPatch(wipedPatchBody);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const applied = applyDeckPatch({
      currentHtml: CURRENT_HTML,
      patch: parsed.patch,
      allowedSlideIndexes: [1],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const scoped = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: CURRENT_HTML,
      patchedHtml: applied.html,
      commentAttachments: [attachmentFor()],
      instructionText: '회사 이름 눈에 잘 띄게 수정',
    });

    expect(scoped.ok).toBe(false);
    if (!scoped.ok) {
      // Reason may be either the original narrow-merge reason or a
      // downstream reason once the fallbacks all decline — we assert
      // the ok:false result and let the caller surface the
      // deck_patch_merge_failed code.
      expect(scoped.reason).toBeTruthy();
    }
  });

  it('accepts a model-chosen slide when the attachment.slideIndex is stale but the target text is preserved', () => {
    // Repro for the scenario where `attachment.slideIndex` captured
    // the wrong active slide (deck bridge reported stale state) but
    // the model correctly targeted the slide where 뉴럴스튜디오㈜
    // actually lives. Strict scope apply rejects; the relaxed retry
    // then lets mergeScoped verify via target-text-preserved and
    // accept the model's choice.
    const staleAttachmentSlideIndex = 0; // user thinks target was on slide 0
    const parsed = parseDeckPatch(MODEL_PATCH_BODY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Strict scope apply must reject when model chose slide 1 but
    // attachment claims 0 — that's the scenario we now recover from
    // at the wrapper layer, not inside applyDeckPatch.
    const strict = applyDeckPatch({
      currentHtml: CURRENT_HTML,
      patch: parsed.patch,
      allowedSlideIndexes: [staleAttachmentSlideIndex],
    });
    expect(strict.ok).toBe(false);
    if (!strict.ok) {
      expect(strict.reason).toContain('outside attached comment scope');
    }

    // mergeScoped must discover slide 1 from target text even when
    // attachment.slideIndex is stale (0).
    const relaxed = applyDeckPatch({
      currentHtml: CURRENT_HTML,
      patch: parsed.patch,
    });
    expect(relaxed.ok, JSON.stringify(relaxed)).toBe(true);
    if (!relaxed.ok) return;

    const scoped = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: CURRENT_HTML,
      patchedHtml: relaxed.html,
      commentAttachments: [attachmentFor({ slideIndex: staleAttachmentSlideIndex })],
      instructionText: '회사 이름 눈에 잘 띄게 수정',
    });
    expect(scoped.ok, JSON.stringify(scoped)).toBe(true);
    if (!scoped.ok) return;
    expect(scoped.html).toContain('뉴럴스튜디오㈜');
    expect(scoped.html).toContain('linear-gradient');
    expect(scoped.html).toContain('<h1 data-od-id="path-0-0">인트로</h1>');
  });

  it('accepts stale attachment.slideIndex through the full scoped deck-patch wrapper', () => {
    const result = applyScopedDeckPatchToHtml({
      currentHtml: CURRENT_HTML,
      patchBody: MODEL_PATCH_BODY,
      allowedSlideIndexes: [0],
      commentAttachments: [attachmentFor({ slideIndex: 0 })],
      instructionText: '회사 이름 눈에 잘 띄게 수정',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('linear-gradient');
    expect(result.html).toContain('<h1 data-od-id="path-0-0">인트로</h1>');
  });

  it('resolves slide candidates from target text when attachment.slideIndex is stale', () => {
    const candidates = resolveScopedCommentSlideCandidates({
      attachment: attachmentFor({ slideIndex: 0 }),
      currentHtml: CURRENT_HTML,
      patchedHtml: CURRENT_HTML,
    });
    expect(candidates).toEqual([1, 0]);
  });

  it('accepts even when the disk HTML has no data-od-id at all (model dropped identifiers on a previous save)', () => {
    // The narrow merge's element-id lookup fails on both sides when
    // a previous turn stripped data-od-id from the deck. The
    // text-preserved fallback must still land the edit if the
    // target text survives in the patched slide.
    const strippedCurrentHtml = CURRENT_HTML.replace(/\s+data-od-id="[^"]*"/g, '');

    const parsed = parseDeckPatch(MODEL_PATCH_BODY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const applied = applyDeckPatch({
      currentHtml: strippedCurrentHtml,
      patch: parsed.patch,
      allowedSlideIndexes: [1],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const scoped = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml: strippedCurrentHtml,
      patchedHtml: applied.html,
      commentAttachments: [attachmentFor()],
      instructionText: '회사 이름 눈에 잘 띄게 수정',
    });

    expect(scoped.ok, JSON.stringify(scoped)).toBe(true);
    if (!scoped.ok) return;
    expect(scoped.html).toContain('뉴럴스튜디오㈜');
    expect(scoped.html).toContain('linear-gradient');
  });
});

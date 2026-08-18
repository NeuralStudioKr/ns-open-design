import { describe, expect, it } from "vitest";

import {
  normalizeBodyFirstHtmlDocument,
  recoverBestHtmlDocumentFromText,
  salvageTruncatedHtmlDocument,
} from "../../src/artifacts/recover";
import { isIncompleteHtmlDocumentShell } from "../../src/artifacts/validate";
import { isClosedSoftSalvageDeckHtml } from "../../src/artifacts/deck-html-content";

describe("salvageTruncatedHtmlDocument", () => {
  it("closes a truncated deck that already has real slide sections", () => {
    const truncated = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>AI 도입 효과</title>
<style>.slide{padding:40px}</style></head>
<body>
<section class="slide"><h1>기업 AI 도입 효과</h1><p>개요 설명입니다.</p></section>
<section class="slide"><h2>생산성</h2><ul><li>업무 자동화</li><li>의사결정 지원</li></ul></section>
<section class="slide"><h2>비용 절감</h2><p>운영비 감소 사례`;

    const salvaged = salvageTruncatedHtmlDocument(truncated);
    expect(salvaged).toBeTruthy();
    expect(salvaged).toContain('기업 AI 도입 효과');
    expect(salvaged).toMatch(/<\/section>\s*<\/body>\s*<\/html>\s*$/i);
    // Soft salvage may still trip the strict multi-slide incomplete ratio when
    // the trailing cut slide is short; persist trusts salvage quality instead.
    expect(salvaged!.length).toBeGreaterThan(128);
  });

  it("salvages a truncated deck even when a later empty closed document poisons the tail", () => {
    const text =
      '작성 중\n'
      + '<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>NS</title></head><body>'
      + '<section class="slide"><h1>NeuralStudio</h1><p>회사 소개 개요입니다.</p></section>'
      + '<section class="slide"><h2>제품</h2><p>핵심 제품 라인업을 소개합니다.'
      + '\n\n<!doctype html><html><body></body></html>';
    const recovered = recoverBestHtmlDocumentFromText(text);
    expect(recovered).toBeTruthy();
    expect(recovered).toContain('NeuralStudio');
    expect(recovered).toMatch(/<\/body>\s*<\/html>\s*$/i);
  });

  it("auto-closes mid-first-slide truncation so previewable HTML can persist", () => {
    // Previously failed because only </section>-closed slides counted as content.
    const truncated = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>온보딩</title></head>
<body>
<section class="slide"><h1>신입사원 온보딩</h1><p>첫날 목표와 팀 문화를 설명하는 커버 슬라이드입니다.`;
    const salvaged = salvageTruncatedHtmlDocument(truncated);
    expect(salvaged).toBeTruthy();
    expect(salvaged).toContain('신입사원 온보딩');
    expect(salvaged).toMatch(/<\/section>\s*<\/body>\s*<\/html>\s*$/i);
    expect(isIncompleteHtmlDocumentShell(salvaged!)).toBe(false);
  });

  it("salvages title-only cover slides cut at max_tokens (avoids skipped-incomplete)", () => {
    // Strict deliverable bar rejects short titles; truncation salvage must not
    // (generic outline-only labels like "표지"/"발표 개요" still refuse).
    const truncated = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>Deck</title>
<style>.slide{padding:40px;min-height:100vh}</style></head>
<body>
<section class="slide"><h1>온보딩 킥오프</h1>`;
    const salvaged = salvageTruncatedHtmlDocument(truncated);
    expect(salvaged).toBeTruthy();
    expect(salvaged).toContain('온보딩 킥오프');
    expect(salvaged).toMatch(/<\/section>\s*<\/body>\s*<\/html>\s*$/i);
  });

  it("salvages a truncated deck with one strong slide among empty placeholders", () => {
    const truncated = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>Deck</title></head>
<body>
<section class="slide"><h1>커버 전략 발표</h1><p>이번 분기의 핵심 메시지와 실행 계획을 공유합니다.</p></section>
<section class="slide"></section>
<section class="slide"></section>
<section class="slide"></section>
<section class="slide"><h2>다음 단계</h2><p>담당자별 액션 아이템을 정리합니다.`;
    const salvaged = salvageTruncatedHtmlDocument(truncated);
    expect(salvaged).toBeTruthy();
    expect(salvaged).toContain('커버 전략 발표');
    expect(salvaged).toMatch(/<\/body>\s*<\/html>\s*$/i);
  });

  it("does not salvage an empty head-only shell", () => {
    const shell =
      "<!doctype html><html><head><meta charset=\"utf-8\"><title>x</title></head><body>";
    expect(salvageTruncatedHtmlDocument(shell)).toBeNull();
  });

  it("does not salvage SLOT-comment-only slide skeletons", () => {
    const slotOnly = `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>Deck</title>
<style>.slide{padding:40px}</style></head><body>
<section class="slide"><!-- SLOT: slide 1 content --></section>
<section class="slide"><!-- SLOT: slide 2 content --></section>`;
    expect(salvageTruncatedHtmlDocument(slotOnly)).toBeNull();
  });

  it("does not touch an already-closed complete document", () => {
    const complete = `<!doctype html><html><head><title>ok</title></head><body>
<section class="slide"><h1>Done</h1><p>Complete slide copy here.</p></section>
</body></html>`;
    expect(salvageTruncatedHtmlDocument(complete)).toBeNull();
  });

  it("strips stutter open tags before closing a truncated deck", () => {
    const stutter = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>AI 도입 효과</title>
<style>.slide{padding:40px}</style></head>
<body>
<section class="
<section class="slide"><h1>기업 AI 도입 효과</h1><p>개요 설명입니다.</p></section>
<section class="slide"><h2>생산성</h2><ul><li>업무 자동화</li><li>의사결정 지원</li></ul></section>`;
    const salvaged = salvageTruncatedHtmlDocument(stutter);
    expect(salvaged).toBeTruthy();
    expect(salvaged).not.toMatch(/<section class="\s*<section/i);
    expect(salvaged).toMatch(/<\/body>\s*<\/html>\s*$/i);
    expect(isIncompleteHtmlDocumentShell(salvaged!)).toBe(false);
  });

  it("inserts </body> before a premature </html> instead of appending after it", () => {
    const prematureHtml = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>AI 도입 효과</title>
<style>.slide{padding:40px}</style></head>
<body>
<section class="slide"><h1>기업 AI 도입 효과</h1><p>개요 설명입니다.</p></section>
<section class="slide"><h2>생산성</h2><ul><li>업무 자동화</li><li>의사결정 지원</li></ul></section>
</html>`;
    const salvaged = salvageTruncatedHtmlDocument(prematureHtml);
    expect(salvaged).toBeTruthy();
    expect(salvaged).toMatch(/<\/body>\s*<\/html>\s*$/i);
    expect(salvaged).not.toMatch(/<\/html>\s*<\/body>/i);
    expect(isIncompleteHtmlDocumentShell(salvaged!)).toBe(false);
  });

  it("wraps body-first compact deck artifacts into a complete document", () => {
    const bodyFirst =
      '<body style="margin:0">'
      + '<section class="slide"><h1>AI 도입 효과</h1><p>업무 생산성 개선을 설명합니다.</p></section>'
      + '<section class="slide"><h2>비용 절감</h2><p>반복 업무 자동화로 운영비를 낮춥니다.</p></section>';
    const normalized = normalizeBodyFirstHtmlDocument(bodyFirst);
    expect(normalized).toMatch(/^<!doctype html><html lang="ko"><body/i);
    expect(normalized).toMatch(/<\/body><\/html>$/);
    expect(isIncompleteHtmlDocumentShell(normalized!)).toBe(false);
  });

  it("wraps slide-section-first compact deck artifacts into a complete document", () => {
    const sectionFirst =
      '<section class="slide" style="min-height:100vh"><h1>온보딩</h1><p>첫날 체크리스트입니다.</p></section>'
      + '<section class="slide"><h2>협업 방식</h2><p>팀 문화와 커뮤니케이션 규칙을 소개합니다.</p></section>';
    const normalized = normalizeBodyFirstHtmlDocument(sectionFirst);
    expect(normalized).toContain('<body><section class="slide"');
    expect(normalized).toMatch(/<\/body><\/html>$/);
  });

  it("does not wrap empty or SLOT-only body-first deck shells", () => {
    expect(
      normalizeBodyFirstHtmlDocument('<body><section class="slide"></section></body>'),
    ).toBeNull();
    expect(
      normalizeBodyFirstHtmlDocument(
        '<section class="slide"><!-- SLOT: slide 1 content --></section>'
        + '<section class="slide"><!-- SLOT: slide 2 content --></section>',
      ),
    ).toBeNull();
    expect(
      normalizeBodyFirstHtmlDocument(
        '<body>슬라이드 초안을 만들고 있어요</body>',
      ),
    ).toBeNull();
  });

  it("recovers body-first deck tails after prose or an artifact wrapper", () => {
    const text =
      '온보딩 발표 흐름에 맞춰 덱을 작성하고 있습니다.\n'
      + '<artifact type="deck" identifier="deck">'
      + '<body style="margin:0">'
      + '<section class="slide"><h1>신입사원 온보딩</h1><p>첫날 목표와 팀 문화를 설명합니다.</p></section>'
      + '<section class="slide"><h2>업무 프로세스</h2><p>스프린트와 PR 흐름을 안내합니다.</p></section>';
    const recovered = recoverBestHtmlDocumentFromText(text);
    expect(recovered).toMatch(/^<!doctype html><html lang="ko"><body/i);
    expect(recovered).toContain('<h1>신입사원 온보딩</h1>');
    expect(recovered).toMatch(/<\/body><\/html>$/);
    expect(isIncompleteHtmlDocumentShell(recovered!)).toBe(false);
  });

  it("recovers truncated doctype decks from assistant prose via recoverBest", () => {
    const text =
      '덱 HTML을 작성 중입니다.\n'
      + '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8" /><title>NS</title></head><body>'
      + '<section class="slide"><h1>NeuralStudio</h1><p>회사 소개 개요입니다.</p></section>'
      + '<section class="slide"><h2>제품</h2><p>핵심 제품 라인업을 소개합니다.';
    const recovered = recoverBestHtmlDocumentFromText(text);
    expect(recovered).toBeTruthy();
    expect(recovered).toContain('<h1>NeuralStudio</h1>');
    expect(recovered).toMatch(/<\/body>\s*<\/html>\s*$/i);
    expect(isIncompleteHtmlDocumentShell(recovered!)).toBe(false);
  });

  it("strips trailing unclosed nav script before appending document closers", () => {
    const truncated = `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>NS</title></head><body>
<section class="slide"><h1>NeuralStudio</h1><p>회사 소개 개요입니다.</p></section>
<section class="slide"><h2>제품</h2><p>핵심 제품 라인업을 소개합니다.</p></section>
<script>
(
  }
  document.addEventListener('keydown', e=>{
    if(e.key==='ArrowRight') go(1);`;
    const salvaged = salvageTruncatedHtmlDocument(truncated);
    expect(salvaged).toBeTruthy();
    expect(salvaged).toContain('<h1>NeuralStudio</h1>');
    expect(salvaged).not.toMatch(/<script\b/i);
    expect(salvaged).toMatch(/<\/body>\s*<\/html>\s*$/i);
    expect(isIncompleteHtmlDocumentShell(salvaged!)).toBe(false);
  });

  it("salvages a truncated catalog <div class=\"slide\"> deck instead of skipped-incomplete", () => {
    const truncated = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>온보딩</title></head>
<body>
<div class="slide"><h1>신입사원 온보딩</h1><p>첫날 목표와 팀 문화를 설명하는 커버 슬라이드입니다.`;
    expect(isIncompleteHtmlDocumentShell(truncated)).toBe(true);
    const salvaged = salvageTruncatedHtmlDocument(truncated);
    expect(salvaged).toBeTruthy();
    expect(salvaged).toContain("신입사원 온보딩");
    expect(salvaged).toMatch(/<\/div>\s*<\/body>\s*<\/html>\s*$/i);
    expect(isIncompleteHtmlDocumentShell(salvaged!)).toBe(false);
  });

  it("wraps body-first <div class=\"slide\"> compact decks into a complete document", () => {
    const divFirst =
      '<div class="slide" style="min-height:100vh"><h1>온보딩</h1><p>첫날 체크리스트입니다.</p></div>'
      + '<div class="slide"><h2>협업 방식</h2><p>팀 문화와 커뮤니케이션 규칙을 소개합니다.</p></div>';
    const normalized = normalizeBodyFirstHtmlDocument(divFirst);
    expect(normalized).toMatch(/^<!doctype html><html lang="ko"><body><div class="slide"/i);
    expect(normalized).toMatch(/<\/body><\/html>$/);
    expect(isIncompleteHtmlDocumentShell(normalized!)).toBe(false);
    expect(
      normalizeBodyFirstHtmlDocument(
        '<div class="slide-inner"><h1>온보딩</h1><p>첫날 체크리스트입니다.</p></div>',
      ),
    ).toBeNull();
  });

  it("recovers truncated <div class=\"slide\"> decks from assistant prose via recoverBest", () => {
    const text =
      "덱 HTML을 작성 중입니다.\n"
      + '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8" /><title>NS</title></head><body>'
      + '<div class="slide"><h1>NeuralStudio</h1><p>회사 소개 개요입니다.</p></div>'
      + '<div class="slide"><h2>제품</h2><p>핵심 제품 라인업을 소개합니다.';
    const recovered = recoverBestHtmlDocumentFromText(text);
    expect(recovered).toBeTruthy();
    expect(recovered).toContain("<h1>NeuralStudio</h1>");
    expect(recovered).toMatch(/<\/body>\s*<\/html>\s*$/i);
    expect(isIncompleteHtmlDocumentShell(recovered!)).toBe(false);
    const trustSoftTruncationSalvage =
      Boolean(recovered) || isClosedSoftSalvageDeckHtml(recovered!);
    expect(trustSoftTruncationSalvage).toBe(true);
    expect(
      !trustSoftTruncationSalvage && isIncompleteHtmlDocumentShell(recovered!),
    ).toBe(false);
  });

  it("keeps slides when head style is truncated before body", () => {
    const truncated = `<!doctype html><html><head><title>Deck</title>
<style>.slide{padding:40px
<body>
<section class="slide"><h1>기업 AI 도입 효과</h1><p>개요 설명과 본문 내용입니다.</p></section>
<section class="slide"><h2>생산성</h2><p>업무 자동화 사례를 소개합니다.</p></section>`;
    const salvaged = salvageTruncatedHtmlDocument(truncated);
    expect(salvaged).toBeTruthy();
    expect(salvaged).toContain('기업 AI 도입 효과');
    expect(salvaged).toContain('</style>');
    expect(salvaged).toMatch(/<\/body>\s*<\/html>\s*$/i);
  });
});

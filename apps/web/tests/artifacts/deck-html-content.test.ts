import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  closeUnclosedSlideSectionsForSalvage,
  documentContainsSlideSection,
  hasFilledSlideSection,
  hasSalvageableDeckSlideContent,
  isClosedSoftSalvageDeckHtml,
  isDeckStatusProseOnlyBody,
  isPersistableShortDeckDraft,
  isPersistableShortDeckDraftAfterHeal,
  deckArtifactStartsWithMotifSvgDump,
  deckLooksLikeUnfilledCatalogExample,
  deckSlideHeadingsLookLikeFailedGenerate,
  shouldAbortStreamForHeadOnlyKitDump,
  shouldAbortStreamForMotifSvgDump,
  shouldDiscardPartialHtmlForMotifSvgDump,
  stripAbandonedHeadKitDumpFromStreamedText,
  stripAbandonedMotifSvgDumpFromStreamedText,
  meetsMinimumDeckDeliverableQuality,
  meetsTruncationSalvageQuality,
} from "../../src/artifacts/deck-html-content";
import {
  normalizeBodyFirstHtmlDocument,
  salvageTruncatedHtmlDocument,
} from "../../src/artifacts/recover";
import { healInstructionCopyCoverHeading } from "@open-design/contracts";
import { isIncompleteHtmlDocumentShell } from "../../src/artifacts/validate";

describe("deck-html-content", () => {
  it("rejects status-only Korean prose without slide sections", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>슬라이드 초안을 만들고 있어요</body></html>";
    expect(hasSalvageableDeckSlideContent(html)).toBe(false);
    expect(isDeckStatusProseOnlyBody(html)).toBe(true);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(true);
  });

  it("does not treat a head-only brief title as salvageable slide copy", () => {
    const html = `<!doctype html><html lang="ko"><head>
<title>Linux Internals &amp; Production Mastery</title>
<style>.deco-daisy{color:#fcdf6c}</style></head>`;
    expect(hasSalvageableDeckSlideContent(html)).toBe(false);
  });

  it("treats a compact 6-slide MiniMax first-fill as a persistable draft", () => {
    const html =
      '<!doctype html><html lang="ko"><body>'
      + Array.from({ length: 6 }, (_, i) =>
        `<section class="slide"><h2>슬라이드 ${i + 1}</h2><p>본문입니다.</p></section>`,
      ).join('')
      + '</body></html>';
    expect(isPersistableShortDeckDraft(html)).toBe(true);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(false);
  });

  it("does not treat a 7-slide sparse shell as a short persistable draft", () => {
    const html =
      '<!doctype html><html lang="ko"><body>'
      + Array.from({ length: 7 }, (_, i) =>
        `<section class="slide"><h2>슬라이드 ${i + 1}</h2></section>`,
      ).join('')
      + '</body></html>';
    expect(isPersistableShortDeckDraft(html)).toBe(false);
  });

  it("treats a compact 3-slide MiniMax first-fill as a persistable draft", () => {
    const html =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>시장 기회</h1></section>'
      + '<section class="slide"><h2>도입 장벽</h2><p>보안 검토가 병목입니다.</p></section>'
      + '<section class="slide"><h2>다음 단계</h2></section>'
      + '</body></html>';
    expect(isPersistableShortDeckDraft(html)).toBe(true);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(false);
  });

  it("treats a 3-slide MiniMax draft with only one titled slide as persistable", () => {
    const html =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>시장 기회</h1><p>국내 SaaS 전환이 가속화되고 있습니다.</p></section>'
      + '<section class="slide"></section>'
      + '<section class="slide"></section>'
      + '</body></html>';
    expect(isPersistableShortDeckDraft(html)).toBe(true);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(false);
  });

  it("does not treat a 3-slide outline/status shell as a persistable draft", () => {
    const html =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h2>발표 개요</h2></section>'
      + '<section class="slide"><h2>목차</h2></section>'
      + '<section class="slide"><h2>만들고 있어요</h2></section>'
      + '</body></html>';
    expect(isPersistableShortDeckDraft(html)).toBe(false);
  });

  it("treats a short titled one-slide cover as a persistable draft", () => {
    const html =
      '<!doctype html><html><body><section class="slide"><h1>AI</h1></section></body></html>';
    expect(meetsMinimumDeckDeliverableQuality(html)).toBe(false);
    // Soft/short drafts must not trip incomplete-html-document-shell (§0.76).
    expect(isIncompleteHtmlDocumentShell(html)).toBe(false);
    expect(isPersistableShortDeckDraft(html)).toBe(true);
  });

  it("does not persist status-only or empty one-slide shells as drafts", () => {
    expect(
      isPersistableShortDeckDraft(
        '<!doctype html><html><body><section class="slide"><h1>만들고 있어요</h1></section></body></html>',
      ),
    ).toBe(false);
    expect(
      isPersistableShortDeckDraft(
        '<!doctype html><html><body><section class="slide"></section></body></html>',
      ),
    ).toBe(false);
  });

  it("does not treat a head SVG plus title as salvageable slide copy", () => {
    const html = `<!doctype html><html lang="ko"><head>
<title>Linux Internals</title>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>
</head>`;
    expect(hasSalvageableDeckSlideContent(html)).toBe(false);
  });

  it("rejects leaked streaming tail fragments", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body><p>을 만들고 있어요</p><h2>발표 개요</h2></body></html>";
    expect(hasSalvageableDeckSlideContent(html)).toBe(false);
    expect(isDeckStatusProseOnlyBody(html)).toBe(true);
  });

  it("accepts filled slide sections with real copy", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><h1>Neural Studio</h1><p>회사 소개 슬라이드입니다.</p></section>"
      + "<section class=\"slide\"><h2>서비스</h2><p>AI 디자인 자동화 플랫폼</p></section>"
      + "</body></html>";
    expect(documentContainsSlideSection('<div class="slide-counter">1 / 10</div>')).toBe(false);
    expect(documentContainsSlideSection('<div class="slide-chrome">Studio</div>')).toBe(false);
    expect(documentContainsSlideSection(
      '<section class="s1" data-screen-label="01 Cover"><h1>Cover</h1></section>',
    )).toBe(true);
    expect(hasFilledSlideSection(html)).toBe(true);
    expect(hasSalvageableDeckSlideContent(html)).toBe(true);
    expect(isDeckStatusProseOnlyBody(html)).toBe(false);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(false);
    expect(deckSlideHeadingsLookLikeFailedGenerate(html)).toBe(false);
  });

  it("flags kami-style topic+counter empty shells as failed generate (루프179)", () => {
    const kamiShell =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>삼각함수</h1>'
      + '<p class="tagline">삼각함수에 대해서 설명하는 피피티 만들어줘.</p></section>'
      + '<section class="slide"><h2>삼각함수 · 3</h2></section>'
      + '<section class="slide"><h2>삼각함수 · 4</h2><ul><li></li></ul></section>'
      + '<section class="slide"><h2>삼각함수 · 5</h2></section>'
      + "</body></html>";
    expect(deckSlideHeadingsLookLikeFailedGenerate(kamiShell)).toBe(true);
    expect(isPersistableShortDeckDraft(kamiShell)).toBe(false);
    const filledTopic =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>삼각함수</h1><p>각과 비를 다룹니다.</p></section>'
      + '<section class="slide"><h2>삼각함수 · 2</h2><p>사인 코사인의 정의.</p></section>'
      + '<section class="slide"><h2>삼각함수 · 3</h2><p>단위원과 각도.</p></section>'
      + "</body></html>";
    expect(deckSlideHeadingsLookLikeFailedGenerate(filledTopic)).toBe(false);
    expect(isPersistableShortDeckDraft(filledTopic)).toBe(true);
    const genericSlideLabels =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>시장 기회</h1></section>'
      + '<section class="slide"><h2>슬라이드 2</h2></section>'
      + '<section class="slide"><h2>슬라이드 3</h2></section>'
      + "</body></html>";
    expect(deckSlideHeadingsLookLikeFailedGenerate(genericSlideLabels)).toBe(false);
  });

  it("flags title-only outline shells and heading-only long titles (루프181)", () => {
    const outline =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>영어 회화 로드맵</h1></section>'
      + '<section class="slide"><h2>듣기 훈련</h2></section>'
      + '<section class="slide"><h2>말하기 루틴</h2></section>'
      + '<section class="slide"><h2>복습 체크</h2></section>'
      + '<section class="slide"><h2>주간 목표</h2></section>'
      + "</body></html>";
    expect(deckSlideHeadingsLookLikeFailedGenerate(outline)).toBe(true);
    expect(isPersistableShortDeckDraft(outline)).toBe(false);
    expect(hasFilledSlideSection(outline)).toBe(false);
    const longTitleOnly =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>삼각함수의 기본 개념과 단위원</h1></section>'
      + "</body></html>";
    expect(hasFilledSlideSection(longTitleOnly)).toBe(false);
    expect(isPersistableShortDeckDraft(longTitleOnly)).toBe(true);
    const filledOutline =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>영어 회화 로드맵</h1><p>주 3회 쉐도잉으로 시작합니다.</p></section>'
      + '<section class="slide"><h2>듣기 훈련</h2><p>짧은 클립을 반복 청취합니다.</p></section>'
      + '<section class="slide"><h2>말하기 루틴</h2><p>녹음 후 자기 피드백.</p></section>'
      + '<section class="slide"><h2>복습 체크</h2><p>주말 미니 퀴즈.</p></section>'
      + "</body></html>";
    expect(deckSlideHeadingsLookLikeFailedGenerate(filledOutline)).toBe(false);
    expect(hasFilledSlideSection(filledOutline)).toBe(true);
  });

  it("flags instruction-copy and template-marketing cover headings", () => {
    const parrot =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><h1>expo에 대해서 설명하는 피피티 만들어줘</h1><p>시니어 개발자 레벨</p></section>"
      + "<section class=\"slide\"><h1>Expo Router</h1><p>file-based routing</p></section>"
      + "</body></html>";
    expect(deckSlideHeadingsLookLikeFailedGenerate(parrot)).toBe(true);
    const real =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><h1>Expo for Senior Engineers</h1><p>Managed workflow vs prebuild</p></section>"
      + "<section class=\"slide\"><h1>EAS Build</h1><p>cloud builds and Submit</p></section>"
      + "</body></html>";
    expect(deckSlideHeadingsLookLikeFailedGenerate(real)).toBe(false);
    const shortParrot =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><h1>expo에 대해서 설명하는 피피티 만들어줘</h1></section>"
      + "</body></html>";
    expect(isPersistableShortDeckDraft(shortParrot)).toBe(false);
    const streamingStatusSix =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>을 만들고 있어요</h1><p>발표 개요</p></section>'
      + '<section class="slide"></section>'
      + '<section class="slide"></section>'
      + '<section class="slide"></section>'
      + '<section class="slide"></section>'
      + '<section class="slide"><p>error</p></section>'
      + '</body></html>';
    expect(isPersistableShortDeckDraft(streamingStatusSix)).toBe(false);
    expect(isDeckStatusProseOnlyBody(streamingStatusSix)).toBe(true);
    const healedShort = healInstructionCopyCoverHeading(
      shortParrot,
      "expo에 대해서 설명하는 피피티 만들어줘",
    );
    expect(deckSlideHeadingsLookLikeFailedGenerate(healedShort)).toBe(false);
    expect(isPersistableShortDeckDraft(healedShort)).toBe(true);
    expect(isPersistableShortDeckDraftAfterHeal(shortParrot, "expo에 대해서 설명하는 피피티 만들어줘")).toBe(true);
    expect(isPersistableShortDeckDraftAfterHeal(shortParrot)).toBe(true);
    const titleOnlyParrot =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>슬라이드 만들어줘</h1></section>'
      + '</body></html>';
    expect(isPersistableShortDeckDraft(titleOnlyParrot)).toBe(false);
    expect(isPersistableShortDeckDraftAfterHeal(titleOnlyParrot)).toBe(true);
    expect(isDeckStatusProseOnlyBody(titleOnlyParrot)).toBe(false);
    expect(isIncompleteHtmlDocumentShell(titleOnlyParrot)).toBe(false);
    const parrotThree =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>시장 기회 PPT 만들어줘</h1><p>국내 SaaS 전환이 가속화되고 있습니다.</p></section>'
      + '<section class="slide"><h2>도입 장벽 슬라이드 만들어줘</h2><p>보안 검토가 병목입니다.</p></section>'
      + '<section class="slide"><h2>다음 단계 피피티 만들어줘</h2><p>파일럿으로 검증하세요.</p></section>'
      + '</body></html>';
    expect(isPersistableShortDeckDraft(parrotThree)).toBe(false);
    expect(isPersistableShortDeckDraftAfterHeal(parrotThree)).toBe(true);
    expect(isPersistableShortDeckDraftAfterHeal(
      '<!doctype html><html><body><section class="slide"></section></body></html>',
    )).toBe(false);
  });

  it("flags Motif SVG dumps that start before the cover heading", () => {
    const hung =
      '<!doctype html><html lang="ko"><body style="margin:0;background:#F5F0E6">'
      + '<section class="slide slide-title" style="width:1920px;height:1080px">'
      + '<div style="position:absolute;top:-30px;left:-30px;width:220px;height:220px">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">'
      + '<style>.cls-0{fill:#FFFFFF}.cls-1{fill:#FCDF6C}</style>';
    expect(deckArtifactStartsWithMotifSvgDump(hung)).toBe(true);
    const titled =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>Expo for Senior Engineers</h1><p>Managed workflow</p>'
      + '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg></section></body></html>';
    expect(deckArtifactStartsWithMotifSvgDump(titled)).toBe(false);
    const titledNested =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1><span>Expo Deep Dive</span></h1><p>Lead</p>'
      + '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg></section></body></html>';
    expect(deckArtifactStartsWithMotifSvgDump(titledNested)).toBe(false);
    expect(shouldDiscardPartialHtmlForMotifSvgDump(hung)).toBe(true);
    expect(shouldDiscardPartialHtmlForMotifSvgDump(titled)).toBe(false);
  });

  it("aborts fill streams as soon as Motif SVG opens before a heading", () => {
    const fillDump =
      '<artifact type="deck"><!doctype html><html lang="ko"><body>'
      + '<section class="slide" style="background:#F5F0E6">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">';
    expect(
      shouldAbortStreamForMotifSvgDump({
        streamedText: fillDump,
        templateCloneContentFill: true,
      }),
    ).toBe(true);
    expect(
      shouldAbortStreamForMotifSvgDump({
        streamedText: fillDump,
        templateCloneContentFill: false,
      }),
    ).toBe(false);
    const committed =
      fillDump + '<style>.cls-0{fill:#FFFFFF}</style>' + "M0 0".repeat(80);
    expect(
      shouldAbortStreamForMotifSvgDump({
        streamedText: committed,
        templateCloneContentFill: false,
      }),
    ).toBe(true);
    expect(
      shouldAbortStreamForMotifSvgDump({
        streamedText: "planning the deck without html yet",
        templateCloneContentFill: true,
      }),
    ).toBe(false);
    expect(
      shouldAbortStreamForMotifSvgDump({
        streamedText:
          '<div class="slide-counter">1 / 10</div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">',
        templateCloneContentFill: true,
      }),
    ).toBe(false);
    expect(
      shouldAbortStreamForMotifSvgDump({
        streamedText:
          '<section class="s1" data-screen-label="01 Cover"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">',
        templateCloneContentFill: true,
      }),
    ).toBe(true);
    expect(
      shouldAbortStreamForMotifSvgDump({
        streamedText:
          '<artifact type="deck"><section class="slide"><h1>Expo for Senior Engineers</h1>'
          + '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
        templateCloneContentFill: true,
      }),
    ).toBe(false);
    const stripped = stripAbandonedMotifSvgDumpFromStreamedText(
      fillDump + '<path d="M0 0h150v150H0z"/>',
    );
    expect(stripped).toContain("<!-- motif svg dump abandoned -->");
    expect(stripped).not.toContain("<path d=");
    expect(stripped).not.toMatch(/<svg\s/);
  });

  it("aborts fill streams that dump a long head/style kit with no titled slide", () => {
    const kit = "<style>".padEnd(820, ".") + "</style>";
    const headDump =
      '<artifact type="deck"><!doctype html><html lang="ko"><head><title>Daisy Days</title>'
      + kit;
    expect(
      shouldAbortStreamForHeadOnlyKitDump({
        streamedText: headDump,
        templateCloneContentFill: true,
      }),
    ).toBe(true);
    expect(
      shouldAbortStreamForHeadOnlyKitDump({
        streamedText: headDump,
        templateCloneContentFill: false,
      }),
    ).toBe(false);
    expect(
      shouldAbortStreamForHeadOnlyKitDump({
        streamedText: headDump,
        slideOnlyDeck: true,
      }),
    ).toBe(true);
    expect(
      shouldAbortStreamForHeadOnlyKitDump({
        streamedText: headDump,
        slideCountTopUp: true,
      }),
    ).toBe(true);
    expect(
      shouldAbortStreamForHeadOnlyKitDump({
        streamedText:
          '<artifact type="deck"><!doctype html><html lang="ko"><head><title>x</title></head>',
        templateCloneContentFill: true,
      }),
    ).toBe(false);
    expect(
      shouldAbortStreamForHeadOnlyKitDump({
        streamedText:
          '<artifact type="deck"><body><section class="slide"><h1>Expo</h1></section>'
          + kit,
        templateCloneContentFill: true,
      }),
    ).toBe(false);
    const stripped = stripAbandonedHeadKitDumpFromStreamedText(headDump);
    expect(stripped).toContain("<!-- head kit dump abandoned -->");
    expect(stripped).not.toContain("<title>Daisy Days</title>");
    expect(
      shouldAbortStreamForHeadOnlyKitDump({
        streamedText:
          '<artifact type="deck"><body><div class="slide-counter">5 / 10</div><h1>Chrome</h1>'
          + kit,
        templateCloneContentFill: true,
      }),
    ).toBe(true);
    expect(
      shouldAbortStreamForHeadOnlyKitDump({
        streamedText:
          '<artifact type="deck"><body><div class="slide-counter">5 / 10</div>'
          + '<section class="slide"><h1>Expo</h1></section>'
          + kit,
        templateCloneContentFill: true,
      }),
    ).toBe(false);
  });

  it("does not treat Motif-SVG-only slides as deliverable copy", () => {
    const hung =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">'
      + '<style>.cls-0{fill:#FFFFFF}</style></svg></section></body></html>';
    expect(hasFilledSlideSection(hung)).toBe(false);
    expect(hasSalvageableDeckSlideContent(hung)).toBe(false);
    expect(meetsTruncationSalvageQuality(hung)).toBe(false);
  });

  it("still flags instruction-copy covers that pass the soft-salvage bar", () => {
    const parrot =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><h1>첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘</h1>"
      + "<p>시니어 개발자 레벨</p><svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"8\"/></svg></section>"
      + "<section class=\"slide\"><h1>Expo 소개</h1><p>Expo는 도구입니다.</p></section>"
      + "</body></html>";
    expect(isClosedSoftSalvageDeckHtml(parrot)).toBe(true);
    expect(deckSlideHeadingsLookLikeFailedGenerate(parrot)).toBe(true);
  });

  it("rejects slide sections that only contain status prose", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><p>슬라이드 초안을 만들고 있어요</p></section>"
      + "</body></html>";
    expect(hasFilledSlideSection(html)).toBe(false);
    expect(hasSalvageableDeckSlideContent(html)).toBe(false);
  });

  it("rejects sparse multi-slide decks past the first-fill short-draft cap", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><h1>Neural Studio</h1><p>회사 소개 슬라이드입니다.</p></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"><!-- SLOT: slide 3 --></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "</body></html>";
    expect(meetsMinimumDeckDeliverableQuality(html)).toBe(false);
    expect(isPersistableShortDeckDraft(html)).toBe(false);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(true);
    // Truncation salvage may still keep the strong slide for preview.
    expect(meetsTruncationSalvageQuality(html)).toBe(true);
  });

  it("closes an unclosed trailing slide section for salvage scoring", () => {
    const open =
      "<section class=\"slide\"><h1>커버</h1><p>첫날 목표를 설명합니다.";
    const closed = closeUnclosedSlideSectionsForSalvage(open);
    expect(closed).toMatch(/<\/section>\s*$/);
    expect(meetsTruncationSalvageQuality(`<!doctype html><html><body>${closed}</body></html>`)).toBe(
      true,
    );
  });

  it("recognizes already-closed soft-salvage decks that strict incomplete still rejects", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><h1>커버 전략 발표</h1><p>이번 분기 핵심 메시지와 실행 계획을 공유합니다.</p></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "</body></html>";
    expect(meetsMinimumDeckDeliverableQuality(html)).toBe(false);
    expect(isPersistableShortDeckDraft(html)).toBe(false);
    // Over-cap sparse still trips the shell predicate; persist trusts soft.
    expect(isIncompleteHtmlDocumentShell(html)).toBe(true);
    expect(isClosedSoftSalvageDeckHtml(html)).toBe(true);
  });

  it("rejects outline-only heading slides without body copy", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><h2>발표 개요</h2></section>"
      + "<section class=\"slide\"><h2>목차</h2></section>"
      + "</body></html>";
    expect(meetsMinimumDeckDeliverableQuality(html)).toBe(false);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(true);
  });

  it("treats catalog <div class=\"slide\"> hosts as first-class persist content", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<div class=\"slide\"><h1>Neural Studio</h1><p>회사 소개 슬라이드입니다.</p></div>"
      + "<div class=\"slide\"><h2>서비스</h2><p>AI 디자인 자동화 플랫폼</p></div>"
      + "</body></html>";
    expect(hasFilledSlideSection(html)).toBe(true);
    expect(hasSalvageableDeckSlideContent(html)).toBe(true);
    expect(meetsMinimumDeckDeliverableQuality(html)).toBe(true);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(false);
    expect(isClosedSoftSalvageDeckHtml(html)).toBe(true);
  });

  it("does not treat .slide-inner chrome as a slide host", () => {
    const chromeOnly =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<div class=\"slide-inner\"><h1>Neural Studio</h1><p>회사 소개 슬라이드입니다.</p></div>"
      + "<div class=\"slide-title\"><h2>서비스</h2><p>AI 디자인 자동화 플랫폼</p></div>"
      + "</body></html>";
    expect(hasFilledSlideSection(chromeOnly)).toBe(false);
    expect(meetsMinimumDeckDeliverableQuality(chromeOnly)).toBe(false);
    const nested =
      "<div class=\"slide\"><div class=\"slide-inner\"><h1>커버 전략</h1>"
      + "<p>첫날 목표와 팀 문화를 설명합니다.</p></div>";
    const closed = closeUnclosedSlideSectionsForSalvage(nested);
    expect(closed).toMatch(/<\/div>\s*$/);
    expect(closed).toContain("slide-inner");
    expect(meetsTruncationSalvageQuality(
      `<!doctype html><html><body>${closed}</body></html>`,
    )).toBe(true);
  });

  it("closes an unclosed trailing <div class=\"slide\"> for salvage scoring", () => {
    const open =
      "<div class=\"slide\"><h1>커버</h1><p>첫날 목표를 설명합니다.";
    const closed = closeUnclosedSlideSectionsForSalvage(open);
    expect(closed).toMatch(/<\/div>\s*$/);
    expect(meetsTruncationSalvageQuality(`<!doctype html><html><body>${closed}</body></html>`)).toBe(
      true,
    );
  });

  it("accepts multi-slide decks with enough filled slides and copy", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><h1>Neural Studio</h1><p>AI 디자인 자동화 회사 소개</p></section>"
      + "<section class=\"slide\"><h2>서비스</h2><p>슬라이드 제작과 브랜드 시스템을 지원합니다.</p></section>"
      + "<section class=\"slide\"><h2>고객</h2><p>엔터프라이즈와 스타트업 고객을 지원합니다.</p></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "</body></html>";
    expect(meetsMinimumDeckDeliverableQuality(html)).toBe(true);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(false);
  });

  it("flags ib-pitch-book Hartfield leftover when the brief is a different topic", () => {
    const leftover =
      '<!doctype html><html><body>'
      + '<section class="slide"><h1>A discounted-cash-flow that 영어 회화 표현 공부 팁, 예시에 · 6.</h1>'
      + '<p>Hartfield &amp; Co.</p><p>WACC (base)</p><p>Implied EV</p>'
      + '</section></body></html>';
    expect(
      deckLooksLikeUnfilledCatalogExample(
        leftover,
        '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘',
      ),
    ).toBe(true);
    expect(
      deckLooksLikeUnfilledCatalogExample(
        leftover,
        'Hartfield & Co. NorthPeak Industries WACC pitch',
      ),
    ).toBe(false);
    const example = readFileSync(
      resolve(import.meta.dirname, "../../../../design-templates/ib-pitch-book/example.html"),
      "utf8",
    );
    expect(
      deckLooksLikeUnfilledCatalogExample(
        example,
        "영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘",
      ),
    ).toBe(true);
    expect(
      deckLooksLikeUnfilledCatalogExample(
        example,
        "Hartfield & Co. NorthPeak Industries WACC pitch",
      ),
    ).toBe(false);
  });

  it("flags leftover kami-deck studio copy when the brief is a different topic", () => {
    const leftover =
      '<!doctype html><html><body>'
      + '<section class="slide"><h1>삼각함수</h1>'
      + '<p class="lede">A local-first design studio for the agent you already trust.</p>'
      + '<p>Open Design is the open-source alternative to Anthropic\'s Claude Design.</p>'
      + '<p>Berlin · 52.5200° N · 13.4050° E</p>'
      + '</section></body></html>';
    expect(
      deckLooksLikeUnfilledCatalogExample(
        leftover,
        '삼각함수에 대해서 설명하는 피피티 만들어줘.',
      ),
    ).toBe(true);
    expect(
      deckLooksLikeUnfilledCatalogExample(
        leftover,
        "open-source alternative to Anthropic's Claude Design. A local-first design studio for the agent you already trust.",
      ),
    ).toBe(false);
    const topical =
      '<!doctype html><html><body>'
      + '<section class="slide"><h1>삼각함수</h1><p>각과 비를 다루는 함수.</p></section>'
      + '</body></html>';
    expect(
      deckLooksLikeUnfilledCatalogExample(
        topical,
        '삼각함수에 대해서 설명하는 피피티 만들어줘.',
      ),
    ).toBe(false);
    const kamiExample = readFileSync(
      resolve(import.meta.dirname, "../../../../design-templates/kami-deck/example.html"),
      "utf8",
    );
    expect(
      deckLooksLikeUnfilledCatalogExample(
        kamiExample,
        '삼각함수에 대해서 설명하는 피피티 만들어줘.',
      ),
    ).toBe(true);
    const partial =
      '<!doctype html><html><body>'
      + '<section class="slide"><h1>삼각함수</h1>'
      + '<span class="eyebrow">Open-source design studio</span>'
      + '<p>Berlin · 52.5200° N · 13.4050° E</p>'
      + '</section></body></html>';
    expect(
      deckLooksLikeUnfilledCatalogExample(
        partial,
        '삼각함수에 대해서 설명하는 피피티 만들어줘.',
      ),
    ).toBe(true);
    const broadsideTokensOnly =
      '<!doctype html><html><body>'
      + '<section class="slide"><h1>삼각함수</h1>'
      + '<style>:root{--c-bg-orange:#e85d26} /* ZONE A · TOKENS */</style>'
      + '</section></body></html>';
    expect(
      deckLooksLikeUnfilledCatalogExample(
        broadsideTokensOnly,
        '삼각함수에 대해서 설명하는 피피티 만들어줘.',
      ),
    ).toBe(false);
  });

  it("flags leftover Broadside catalog when the brief is a different topic", () => {
    const leftover =
      '<!doctype html><html><body>'
      + '<section class="slide slide--cover orange"><h1>삼각함수</h1>'
      + '<p class="lead">삼각함수에 대해서 설명하는 피피티 만들어줘.</p>'
      + '<span class="broadside-num">[[Author Name]]</span>'
      + '<style>/* ZONE B · ENGINE — DO NOT MODIFY */</style>'
      + '</section></body></html>';
    expect(
      deckLooksLikeUnfilledCatalogExample(
        leftover,
        '삼각함수에 대해서 설명하는 피피티 만들어줘.',
      ),
    ).toBe(true);
    const topical =
      '<!doctype html><html><body>'
      + '<section class="slide slide--cover orange"><h1>삼각함수</h1>'
      + '<p class="lead">각과 비를 다루는 함수.</p></section>'
      + '</body></html>';
    expect(
      deckLooksLikeUnfilledCatalogExample(
        topical,
        '삼각함수에 대해서 설명하는 피피티 만들어줘.',
      ),
    ).toBe(false);
  });
});

describe("deck salvage with status prose", () => {
  it("does not wrap body-first status prose into a persisted deck", () => {
    const bodyFirst =
      "<body>슬라이드 초안을 만들고 있어요"
      + "<section class=\"slide\"><h2>발표 개요</h2></section>";
    expect(normalizeBodyFirstHtmlDocument(bodyFirst)).toBeNull();
    expect(salvageTruncatedHtmlDocument(bodyFirst)).toBeNull();
  });
});

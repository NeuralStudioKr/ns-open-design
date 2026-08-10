import { describe, expect, it } from "vitest";

import {
  closeUnclosedSlideSectionsForSalvage,
  hasFilledSlideSection,
  hasSalvageableDeckSlideContent,
  isClosedSoftSalvageDeckHtml,
  isDeckStatusProseOnlyBody,
  meetsMinimumDeckDeliverableQuality,
  meetsTruncationSalvageQuality,
} from "../../src/artifacts/deck-html-content";
import {
  normalizeBodyFirstHtmlDocument,
  salvageTruncatedHtmlDocument,
} from "../../src/artifacts/recover";
import { isIncompleteHtmlDocumentShell } from "../../src/artifacts/validate";

describe("deck-html-content", () => {
  it("rejects status-only Korean prose without slide sections", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>슬라이드 초안을 만들고 있어요</body></html>";
    expect(hasSalvageableDeckSlideContent(html)).toBe(false);
    expect(isDeckStatusProseOnlyBody(html)).toBe(true);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(true);
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
    expect(hasFilledSlideSection(html)).toBe(true);
    expect(hasSalvageableDeckSlideContent(html)).toBe(true);
    expect(isDeckStatusProseOnlyBody(html)).toBe(false);
    expect(isIncompleteHtmlDocumentShell(html)).toBe(false);
  });

  it("rejects slide sections that only contain status prose", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><p>슬라이드 초안을 만들고 있어요</p></section>"
      + "</body></html>";
    expect(hasFilledSlideSection(html)).toBe(false);
    expect(hasSalvageableDeckSlideContent(html)).toBe(false);
  });

  it("rejects sparse multi-slide decks with only one filled slide", () => {
    const html =
      "<!doctype html><html lang=\"ko\"><body>"
      + "<section class=\"slide\"><h1>Neural Studio</h1><p>회사 소개 슬라이드입니다.</p></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"><!-- SLOT: slide 3 --></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "<section class=\"slide\"></section>"
      + "</body></html>";
    expect(meetsMinimumDeckDeliverableQuality(html)).toBe(false);
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
      + "</body></html>";
    expect(meetsMinimumDeckDeliverableQuality(html)).toBe(false);
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

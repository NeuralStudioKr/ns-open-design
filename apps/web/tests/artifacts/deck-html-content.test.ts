import { describe, expect, it } from "vitest";

import {
  hasFilledSlideSection,
  hasSalvageableDeckSlideContent,
  isDeckStatusProseOnlyBody,
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

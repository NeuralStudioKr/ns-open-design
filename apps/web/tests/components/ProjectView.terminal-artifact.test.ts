import { describe, expect, it } from "vitest";

import {
  resolveTerminalArtifactToPersist,
  shouldFailSlideRunForMissingHtmlDeliverable,
  shouldFailSlideRunWithoutHtmlDeliverable,
} from "../../src/components/ProjectView";

const INCOMPLETE_SHELL = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body>";

describe("shouldFailSlideRunWithoutHtmlDeliverable", () => {
  it("fails plan-only Korean slide claims with no HTML on disk", () => {
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable(
        "기업 AI 도입 효과에 대한 프레젠테이션을 바로 제작하겠습니다.",
        { slideOnlyMvp: true },
      ),
    ).toBe(true);
  });

  it("fails promise-only Korean replies even without explicit deck words", () => {
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable("바로 만들어 드리겠습니다!", {
        slideOnlyMvp: true,
      }),
    ).toBe(true);
  });

  it("fails Korean completion claims that previously slipped past the gate", () => {
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable("슬라이드를 완성했습니다.", {
        slideOnlyMvp: true,
      }),
    ).toBe(true);
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable(
        "모두 건너뛰셨군요 — 슬라이드 구성:\n01 표지\n02 문제",
        { slideOnlyMvp: true },
      ),
    ).toBe(true);
  });

  it("fails English completion claims for decks without HTML", () => {
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable(
        "Created the presentation deck.",
        { slideOnlyMvp: true },
      ),
    ).toBe(true);
  });

  it("does not fail normal explanatory chat in slide-only projects", () => {
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable(
        "이 슬라이드는 ROI와 비용 절감 메시지를 한 장에 함께 보여주는 구조입니다.",
        { slideOnlyMvp: true },
      ),
    ).toBe(false);
  });

  it("does not apply outside Teamver slide-only mode", () => {
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable(
        "Created the presentation deck.",
        { slideOnlyMvp: false },
      ),
    ).toBe(false);
  });

  it("fails plan-only Korean slide outlines that claim completion", () => {
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable(
        "모두 건너뛰셨군요 — 제가 최선의 방향으로 직접 결정하겠습니다.\n슬라이드 구성:\n01 표지",
        { slideOnlyMvp: true },
      ),
    ).toBe(true);
  });

  it("fails pure slide outlines with three or more items and no HTML", () => {
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable(
        "슬라이드 구성:\n01 표지\n02 시장 현황\n03 핵심 전략",
        { slideOnlyMvp: true },
      ),
    ).toBe(true);
  });
});

describe("shouldFailSlideRunForMissingHtmlDeliverable", () => {
  it("fails when an incomplete artifact shell streamed but no HTML file landed", () => {
    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: null,
        parsedArtifact: {
          html: INCOMPLETE_SHELL,
        },
        liveHtml: INCOMPLETE_SHELL,
        finalText: "슬라이드 구성 계획",
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(true);
  });

  it("does not fail when an HTML file was produced", () => {
    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: "deck.html",
        parsedArtifact: { html: INCOMPLETE_SHELL },
        liveHtml: INCOMPLETE_SHELL,
        finalText: "슬라이드 구성 계획",
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(false);
  });

  it("fails when validation rejects the streamed artifact and nothing landed on disk", () => {
    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: null,
        parsedArtifact: {
          html: "<!doctype html><html><head></head><body></body></html>",
        },
        liveHtml: "",
        finalText: "슬라이드 완성",
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(true);
  });

  it("fails plan-only prose with no artifact and no HTML file", () => {
    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: null,
        parsedArtifact: null,
        liveHtml: "",
        finalText: "기업 AI 도입 효과에 대한 프레젠테이션을 바로 제작하겠습니다.",
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(true);
  });

  it("fails when SLOT-only / empty slide sections streamed with nothing on disk", () => {
    const slotOnly =
      '<!doctype html><html><head><meta charset="utf-8"></head><body>'
      + '<section class="slide"><!-- SLOT: slide 1 content --></section>'
      + '<section class="slide"><!-- SLOT: slide 2 content --></section>'
      + '</body></html>';
    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: null,
        parsedArtifact: { html: slotOnly },
        liveHtml: slotOnly,
        finalText: "슬라이드 완성했습니다",
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(true);
  });

  it("does not double-count when persist already failed", () => {
    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: null,
        parsedArtifact: { html: INCOMPLETE_SHELL },
        liveHtml: INCOMPLETE_SHELL,
        finalText: "슬라이드 완성",
        terminalArtifactPersistFailed: true,
      }),
    ).toBe(false);
  });
});

describe("resolveTerminalArtifactToPersist", () => {
  it("salvages a doctype tail when the parser missed the unclosed artifact body", () => {
    const finalText =
      "좋아요. 바로 작성합니다.\n"
      + '<artifact type="text/html" identifier="deck">\n'
      + '<!doctype html><html><head><meta charset="utf-8"><title>Deck</title></head><body>'
      + '<section class="slide"><h1>AI 도입 효과</h1><p>업무 생산성과 비용 절감을 설명합니다.</p></section>';

    const resolved = resolveTerminalArtifactToPersist(null, finalText, () => null);
    expect(resolved?.html).toContain("<h1>AI 도입 효과</h1>");
    expect(resolved?.html).toContain("</html>");
  });

  it("does not salvage SLOT-only doctype tails as successful artifacts", () => {
    const finalText =
      '<artifact type="text/html" identifier="deck">\n'
      + '<!doctype html><html><head><meta charset="utf-8"><title>Deck</title></head><body>'
      + '<section class="slide"><!-- SLOT: slide 1 content --></section>';

    const resolved = resolveTerminalArtifactToPersist(null, finalText, () => null);
    expect(resolved).toBeNull();
  });
});

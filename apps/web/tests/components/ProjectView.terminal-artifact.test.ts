import { describe, expect, it } from "vitest";

import {
  isQuestionFormTurnContent,
  projectFileFromPersistedHtmlFallback,
  resolveTerminalArtifactToPersist,
  shouldFailSlideRunForMissingHtmlDeliverable,
  shouldFailSlideRunWithoutHtmlDeliverable,
} from "../../src/components/ProjectView";

const INCOMPLETE_SHELL = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body>";

describe("isQuestionFormTurnContent", () => {
  it("treats valid and malformed question-form turns as non-artifact turns", () => {
    expect(
      isQuestionFormTurnContent(
        '<question-form id="discovery">{"questions":[{"id":"audience","label":"대상","type":"text"}]}</question-form>',
      ),
    ).toBe(true);
    expect(
      isQuestionFormTurnContent(
        "<question-form id=\"discovery\">간단한 정보를 알려주세요</question-form>",
      ),
    ).toBe(true);
    expect(
      isQuestionFormTurnContent(
        '<!doctype html><html><body><section class="slide"><h1>Deck</h1></section></body></html>',
      ),
    ).toBe(false);
  });
});

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
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable(
        "슬라이드 구성을 설명드렸습니다. 표지 다음에 문제 정의를 두었어요.",
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

  it("fails when a valid streamed artifact has no previewable file on disk", () => {
    const completeDeck =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>2026년 상반기 마케팅 전략</h1>'
      + '<p>월간 KPI 대시보드 셋업 완료</p></section>'
      + '</body></html>';

    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: null,
        parsedArtifact: { html: completeDeck },
        liveHtml: completeDeck,
        finalText: `<artifact type="deck" identifier="deck">${completeDeck}</artifact>`,
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(true);
  });

  it("does not fail when persist filename is already resolved despite file-list lag", () => {
    const completeDeck =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>2026년 상반기 마케팅 전략</h1>'
      + '<p>월간 KPI 대시보드 셋업 완료</p></section>'
      + '</body></html>';

    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: 'deck.html',
        parsedArtifact: { html: completeDeck },
        liveHtml: completeDeck,
        finalText: `<artifact type="deck" identifier="deck">${completeDeck}</artifact>`,
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(false);
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

  it("salvages body-first tails when the parser missed the artifact body", () => {
    const finalText =
      "신입사원 온보딩 흐름에 맞춰 덱을 작성하고 있습니다.\n"
      + '<artifact type="deck" identifier="deck">'
      + '<section class="slide"><h1>신입사원 온보딩</h1><p>첫날 목표와 협업 문화를 설명합니다.</p></section>'
      + '<section class="slide"><h2>업무 프로세스</h2><p>스프린트와 PR 규칙을 안내합니다.</p></section>';

    const resolved = resolveTerminalArtifactToPersist(null, finalText, (sourceText) => {
      const html = sourceText.includes('<section class="slide"')
        ? '<!doctype html><html lang="ko"><body>'
          + sourceText.slice(sourceText.indexOf('<section class="slide"'))
          + '</body></html>'
        : null;
      return html ? { identifier: 'response', artifactType: 'deck', title: 'Response', html } : null;
    });
    expect(resolved?.html).toContain("<h1>신입사원 온보딩</h1>");
    expect(resolved?.html).toContain("</html>");
  });
});

describe("projectFileFromPersistedHtmlFallback", () => {
  it("creates a minimal produced HTML file when persist succeeded before list refresh", () => {
    expect(
      projectFileFromPersistedHtmlFallback(
        "deck.html",
        { kind: "persisted", fileName: "deck.html" },
        1234,
      ),
    ).toEqual({
      name: "deck.html",
      size: 0,
      mtime: 1234,
      kind: "html",
      mime: "text/html",
    });
  });

  it("does not synthesize files for failed or mismatched persist results", () => {
    expect(
      projectFileFromPersistedHtmlFallback(
        "deck.html",
        { kind: "save-failed", fileName: "deck.html" },
      ),
    ).toBeNull();
    expect(
      projectFileFromPersistedHtmlFallback(
        "deck.html",
        { kind: "persisted", fileName: "other.html" },
      ),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
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

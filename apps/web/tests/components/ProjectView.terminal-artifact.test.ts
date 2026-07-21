import { describe, expect, it } from "vitest";

import { isIncompleteHtmlDocumentShell } from "../../src/artifacts/validate";
import {
  resolveTerminalArtifactToPersist,
  shouldFailSlideRunForMissingHtmlDeliverable,
  shouldFailSlideRunWithoutHtmlDeliverable,
} from "../../src/components/ProjectView";

const INCOMPLETE_SHELL = "\n<!doctype html>\n<html lang=\"ko\">\n<head>";

const COMPLETE_HTML = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>Deck</title></head>
<body><main><h1>Slide</h1><p>Content long enough to pass validation gate.</p></main></body>
</html>`;

describe("resolveTerminalArtifactToPersist", () => {
  it("prefers a complete standalone document over an incomplete parsed shell", () => {
    const result = resolveTerminalArtifactToPersist(
      {
        identifier: "ai-enterprise-deck",
        title: "Deck",
        artifactType: "text/html",
        html: INCOMPLETE_SHELL,
      },
      `plan text\n\`\`\`html\n${COMPLETE_HTML}\n\`\`\``,
      (text) => ({
        identifier: "response",
        title: "Response",
        artifactType: "text/html",
        html: COMPLETE_HTML,
      }),
    );

    expect(result?.html).toBe(COMPLETE_HTML);
    expect(isIncompleteHtmlDocumentShell(result?.html ?? "")).toBe(false);
  });

  it("keeps the incomplete parsed shell when no better standalone exists", () => {
    const parsed = {
      identifier: "ai-enterprise-deck",
      title: "Deck",
      artifactType: "text/html",
      html: INCOMPLETE_SHELL,
    };
    const result = resolveTerminalArtifactToPersist(parsed, "plan only", () => null);
    expect(result).toEqual(parsed);
  });
});

describe("shouldFailSlideRunWithoutHtmlDeliverable", () => {
  it("does not synthesize a failed run from slide-only completion text", () => {
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable(
        "좋아요! AI 도입 효과 발표 자료, 12장 슬라이드로 바로 만들겠습니다.\n\n슬라이드 구성 계획:",
        { slideOnlyMvp: true },
      ),
    ).toBe(false);
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

  it("does not fail plan-only Korean slide outlines in the web shell", () => {
    expect(
      shouldFailSlideRunWithoutHtmlDeliverable(
        "모두 건너뛰셨군요 — 제가 최선의 방향으로 직접 결정하겠습니다.\n슬라이드 구성:\n01 표지",
        { slideOnlyMvp: true },
      ),
    ).toBe(false);
  });
});

describe("shouldFailSlideRunForMissingHtmlDeliverable", () => {
  it("does not force-fail when an incomplete artifact shell streamed but no HTML file landed", () => {
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
    ).toBe(false);
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

  it("does not force-fail when validation rejects the streamed artifact and nothing landed on disk", () => {
    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: null,
        parsedArtifact: {
          // Document-shaped but too short / empty body — incomplete shell
          // path already covers this; also cover prose-as-html rejection via
          // the same gate by using a body that starts with doctype but is
          // empty enough to fail the shell check.
          html: "<!doctype html><html><head></head><body></body></html>",
        },
        liveHtml: "",
        finalText: "슬라이드 완성",
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(false);
  });
});

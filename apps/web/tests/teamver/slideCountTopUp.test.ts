import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../src/types";
import {
  SLIDE_COUNT_REQUEST_MAX,
  SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL,
  buildSlideCountTopUpPrompt,
  extractRequestedSlideCountSpecFromMessages,
  extractRequestedSlideCountTargetFromMessages,
  looksLikeSlideCountExpansionRequest,
  parseSlideCountSpec,
  parseSlideCountTarget,
  shouldQueueSlideCountTopUp,
} from "../../src/teamver/slideCountTopUp";

function userMessage(id: string, content: string): ChatMessage {
  return { id, role: "user", content, createdAt: 1 };
}

describe("slideCountTopUp", () => {
  it("caps the shared request ceiling at 15", () => {
    expect(SLIDE_COUNT_REQUEST_MAX).toBe(15);
  });

  it("parses ranges, units, and trailing punctuation", () => {
    expect(parseSlideCountTarget("8-10")).toBe(10);
    expect(parseSlideCountTarget("12–15")).toBe(15);
    expect(parseSlideCountTarget("15장")).toBe(15);
    expect(parseSlideCountTarget("15.", { allowBareNumber: true })).toBe(15);
    expect(parseSlideCountTarget("exactly 12", { allowBareNumber: true })).toBe(12);
    expect(parseSlideCountTarget("15", { allowBareNumber: true })).toBe(15);
    expect(parseSlideCountTarget("6-8 (stability cap for first template fill)")).toBeNull();
    expect(parseSlideCountTarget("20장")).toBeNull();
    expect(parseSlideCountSpec("5-6")).toEqual({ min: 5, max: 6 });
    expect(parseSlideCountSpec("5페이지")).toEqual({ min: 5, max: 5 });
  });

  it("reads the uncapped user request from fill seeds, not the stability hint", () => {
    const messages: ChatMessage[] = [
      userMessage(
        "u1",
        [
          "온보딩 슬라이드 만들어줘",
          "",
          "[Template clone content fill]",
          "User requested slide count: 15.",
          "Slide count hint: 6-8 (stability cap for first template fill).",
          'slideCount: "6-8 (stability cap for first template fill)"',
        ].join("\n"),
      ),
    ];
    expect(extractRequestedSlideCountTargetFromMessages(messages)).toBe(15);
  });

  it("lets a typed 5-page brief beat a quick-length 6-8 range in the fill seed", () => {
    const messages: ChatMessage[] = [
      userMessage(
        "u1",
        [
          "온보딩 슬라이드 5페이지 만들어줘",
          "",
          "[Template clone content fill]",
          "User requested slide count: 6-8.",
          "Slide count hint: 3 (stability cap for first template fill).",
          'slideCount: "6-8"',
        ].join("\n"),
      ),
    ];
    expect(extractRequestedSlideCountSpecFromMessages(messages)).toEqual({ min: 5, max: 5 });
    expect(extractRequestedSlideCountTargetFromMessages(messages)).toBe(5);
  });

  it("treats a 5-6 short preset as done at 5 pages", () => {
    const messages: ChatMessage[] = [
      userMessage(
        "u1",
        [
          "온보딩 슬라이드 만들어줘",
          "",
          "[Template clone content fill]",
          "User requested slide count: 5-6.",
        ].join("\n"),
      ),
    ];
    expect(extractRequestedSlideCountSpecFromMessages(messages)).toEqual({ min: 5, max: 6 });
    expect(shouldQueueSlideCountTopUp({
      produced: 5,
      requested: 6,
      requestedMin: 5,
      topUpCount: 0,
    })).toBe(false);
    expect(shouldQueueSlideCountTopUp({
      produced: 3,
      requested: 6,
      requestedMin: 5,
      topUpCount: 0,
    })).toBe(true);
  });

  it("skips hidden top-up turns when reading the requested count", () => {
    const messages: ChatMessage[] = [
      userMessage("u1", "User requested slide count: 12-15."),
      userMessage("u2", `${SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL}\nappend`),
    ];
    expect(extractRequestedSlideCountTargetFromMessages(messages)).toBe(15);
  });

  it("queues top-up only for a closed short deck under the cap", () => {
    expect(shouldQueueSlideCountTopUp({
      produced: 6,
      requested: 15,
      topUpCount: 0,
    })).toBe(true);
    expect(shouldQueueSlideCountTopUp({
      produced: 15,
      requested: 15,
      topUpCount: 0,
    })).toBe(false);
    expect(shouldQueueSlideCountTopUp({
      produced: 6,
      requested: 15,
      topUpCount: 2,
    })).toBe(false);
    expect(shouldQueueSlideCountTopUp({
      produced: 2,
      requested: 15,
      topUpCount: 0,
    })).toBe(false);
    expect(shouldQueueSlideCountTopUp({
      produced: 1,
      requested: null,
      defaultRequested: 6,
      topUpCount: 0,
    })).toBe(true);
    expect(shouldQueueSlideCountTopUp({
      produced: 2,
      requested: 15,
      defaultRequested: 6,
      topUpCount: 0,
    })).toBe(true);
    expect(shouldQueueSlideCountTopUp({
      produced: 6,
      requested: 15,
      topUpCount: 0,
      commentAttachmentCount: 1,
    })).toBe(false);
    expect(shouldQueueSlideCountTopUp({
      produced: 6,
      requested: 15,
      topUpCount: 0,
      hasIncompleteAssistant: true,
    })).toBe(false);
    expect(shouldQueueSlideCountTopUp({
      produced: 5,
      requested: 5,
      topUpCount: 0,
    })).toBe(false);
    expect(shouldQueueSlideCountTopUp({
      produced: 5,
      requested: null,
      defaultRequested: 6,
      topUpCount: 0,
    })).toBe(false);
  });

  it("asks the model to append a batch instead of rewriting the deck", () => {
    const prompt = buildSlideCountTopUpPrompt({ produced: 6, requested: 15 });
    expect(prompt.startsWith(SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL)).toBe(true);
    expect(prompt).toContain("Keep slides 1–6");
    expect(prompt).toContain("APPEND only new slides 7 through 9");
    expect(prompt).toContain("Do not start over");
    expect(prompt).toMatch(/emit ONLY the new `<section class="slide">`/i);
    expect(prompt).not.toContain("copies every existing slide verbatim");
    expect(prompt).toMatch(/NEVER "수정 반영 중"/);
    expect(prompt).not.toContain("[Template clone content fill]");
    expect(prompt).toContain("lightweight motif/deco vocabulary");
    expect(prompt).toContain("at most 3 next steps");
    expect(prompt).toContain("outlined rectangles");
    expect(prompt).not.toContain("Motif SVG is NOT required");
  });

  it("detects add-next-pages follow-ups and ignores surgical title edits", () => {
    expect(looksLikeSlideCountExpansionRequest("다음 페이지도 만들어줘")).toBe(true);
    expect(looksLikeSlideCountExpansionRequest("나머지 슬라이드 채워줘")).toBe(true);
    expect(looksLikeSlideCountExpansionRequest("add more slides")).toBe(true);
    expect(looksLikeSlideCountExpansionRequest("표지 제목만 바꿔줘")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../src/types";
import {
  SLIDE_COUNT_REQUEST_MAX,
  SLIDE_COUNT_TOP_UP_BATCH,
  SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL,
  SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL_LEGACY,
  buildSlideCountTopUpPrompt,
  countHonoredSlideCountTopUpTurns,
  slideCountTopUpAppendUntil,
  isSlideCountTopUpPrompt,
  extractRequestedSlideCountSpecFromMessages,
  countSlideCountTopUpAttemptsInConversation,
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

  it("루프396: reads 8-10 from runContext when brief-only persist dropped the seed line", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        content: "www.teamver.com 분석해서 서비스 소개 슬라이드 만들어줘",
        createdAt: 1,
        runContext: { slideCountHint: "8-10", templateCloneFill: "prompt" },
      },
    ];
    expect(extractRequestedSlideCountSpecFromMessages(messages)).toEqual({ min: 8, max: 10 });
    expect(shouldQueueSlideCountTopUp({
      produced: 6,
      requested: 10,
      requestedMin: 8,
      topUpCount: 0,
      defaultRequested: 6,
    })).toBe(true);
    // Without runContext, brief-only + default 6 must NOT top up a closed 6-slide deck.
    expect(extractRequestedSlideCountSpecFromMessages([
      userMessage("u2", "www.teamver.com 분석해서 서비스 소개 슬라이드 만들어줘"),
    ])).toBeNull();
  });

  it("reads the requested range from prompt-fill seeds so a 6-slide fallback can top up", () => {
    const messages: ChatMessage[] = [
      userMessage(
        "u1",
        [
          "www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.",
          "",
          "[Template clone prompt fill]",
          "User requested slide count: 8-10.",
          "Slide count: 8-10 (close this turn). Emit 8-10 complete slides in THIS artifact.",
        ].join("\n"),
      ),
    ];
    expect(extractRequestedSlideCountSpecFromMessages(messages)).toEqual({ min: 8, max: 10 });
    expect(shouldQueueSlideCountTopUp({
      produced: 6,
      requested: 10,
      requestedMin: 8,
      topUpCount: 0,
    })).toBe(true);
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

  it("recognizes sanitized leftover top-up prompts so reload can hide and count them", () => {
    const garbled = [
      "The",
      "The",
      "Keep",
      "APPEND",
      "This is an explicit slide-count expansion — not a redesign and not an incomplete-output retry.",
      "Do NOT rewrite the saved deck. Do NOT emit ``, Motif ``, or copy existing slides.",
      "Emit ONLY the new `",
    ].join("\n");
    expect(isSlideCountTopUpPrompt(garbled)).toBe(true);
    expect(isSlideCountTopUpPrompt(`${SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL_LEGACY}\nAPPEND only new slides`)).toBe(
      true,
    );
    expect(isSlideCountTopUpPrompt([
      "The",
      "The",
      "Keep",
      "APPEND",
      "Do NOT rewrite the saved deck. Do NOT emit ``, Motif ``, or copy existing slides.",
      "Emit ONLY the new `",
    ].join("\n"))).toBe(true);
    expect(isSlideCountTopUpPrompt("다음 장 더 만들어줘")).toBe(false);
    expect(
      countSlideCountTopUpAttemptsInConversation([
        userMessage("u1", "온보딩 슬라이드 만들어줘"),
        userMessage("u2", garbled),
      ]),
    ).toBe(1);
  });

  it("asks the model to append a batch instead of rewriting the deck", () => {
    const prompt = buildSlideCountTopUpPrompt({ produced: 6, requested: 15 });
    expect(prompt.startsWith(SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL)).toBe(true);
    expect(prompt).toContain("Keep slides 1–6");
    expect(prompt).toContain("APPEND only new slides 7 through 12");
    expect(prompt).toContain("Emit all 6 remaining slides this turn — not a 3-slide batch");
    expect(prompt).toContain("Do not start over");
    expect(prompt).toMatch(/emit ONLY the new `<section class="slide">`/i);
    expect(prompt).not.toContain("copies every existing slide verbatim");
    expect(prompt).toMatch(/NEVER "수정 반영 중"/);
    expect(prompt).not.toContain("[Template clone content fill]");
    expect(prompt).toContain("lightweight motif/deco vocabulary");
    expect(prompt).toContain("at most 3 next steps");
    expect(prompt).toContain("outlined rectangles");
    expect(prompt).toContain("05 / CHECKLIST");
    expect(prompt).not.toContain("Motif SVG is NOT required");
  });

  it("detects add-next-pages follow-ups and ignores surgical title edits", () => {
    expect(looksLikeSlideCountExpansionRequest("다음 페이지도 만들어줘")).toBe(true);
    expect(looksLikeSlideCountExpansionRequest("나머지 슬라이드 채워줘")).toBe(true);
    expect(looksLikeSlideCountExpansionRequest("add more slides")).toBe(true);
    expect(looksLikeSlideCountExpansionRequest("표지 제목만 바꿔줘")).toBe(false);
  });

  it("appends the remaining default-6 pages in one top-up", () => {
    expect(SLIDE_COUNT_TOP_UP_BATCH).toBe(6);
    expect(slideCountTopUpAppendUntil(1, 6)).toBe(6);
    expect(buildSlideCountTopUpPrompt({ produced: 1, requested: 6 })).toContain(
      "APPEND only new slides 2 through 6",
    );
    expect(buildSlideCountTopUpPrompt({ produced: 3, requested: 6 })).toContain(
      "APPEND only new slides 4 through 6",
    );
    expect(buildSlideCountTopUpPrompt({ produced: 1, requested: 6 })).toContain(
      "Emit all 5 remaining slides this turn — not a 3-slide batch",
    );
    expect(buildSlideCountTopUpPrompt({ produced: 6, requested: 15 })).toContain(
      "Stopping after 3 new slides is a failure",
    );
    expect(buildSlideCountTopUpPrompt({ produced: 3, requested: 6 })).toContain(
      "Emit all 3 remaining slides this turn",
    );
    expect(buildSlideCountTopUpPrompt({ produced: 3, requested: 6 })).not.toContain(
      "Stopping after 3 new slides is a failure",
    );
  });

  it("finishes a 5-6 short miss in one honored top-up and does not add a 6th page at 5", () => {
    expect(countHonoredSlideCountTopUpTurns({
      produced: 1,
      requested: 6,
      requestedMin: 5,
      defaultRequested: 6,
    })).toBe(1);
    expect(countHonoredSlideCountTopUpTurns({
      produced: 3,
      requested: 6,
      requestedMin: 5,
    })).toBe(1);
    expect(countHonoredSlideCountTopUpTurns({
      produced: 5,
      requested: 6,
      requestedMin: 5,
    })).toBe(0);
    expect(shouldQueueSlideCountTopUp({
      produced: 5,
      requested: 6,
      requestedMin: 5,
      topUpCount: 0,
    })).toBe(false);
    expect(buildSlideCountTopUpPrompt({ produced: 1, requested: 6 })).toContain(
      "Emit all 5 remaining slides this turn — not a 3-slide batch",
    );
  });

  it("does not queue top-up when an explicit 8–10 request already closed this turn", () => {
    expect(shouldQueueSlideCountTopUp({
      produced: 8,
      requested: 8,
      topUpCount: 0,
    })).toBe(false);
    expect(shouldQueueSlideCountTopUp({
      produced: 10,
      requested: 10,
      topUpCount: 0,
    })).toBe(false);
    expect(shouldQueueSlideCountTopUp({
      produced: 8,
      requested: 10,
      requestedMin: 8,
      topUpCount: 0,
    })).toBe(false);
    expect(countHonoredSlideCountTopUpTurns({
      produced: 10,
      requested: 10,
    })).toBe(0);
  });

  it("still tops up a short miss of an honored 8–10 count, and 11+ still batches", () => {
    expect(shouldQueueSlideCountTopUp({
      produced: 4,
      requested: 10,
      topUpCount: 0,
    })).toBe(true);
    expect(countHonoredSlideCountTopUpTurns({
      produced: 4,
      requested: 10,
    })).toBe(1);
    expect(shouldQueueSlideCountTopUp({
      produced: 6,
      requested: 12,
      topUpCount: 0,
    })).toBe(true);
    expect(countHonoredSlideCountTopUpTurns({
      produced: 6,
      requested: 12,
    })).toBe(1);
  });

  it("finishes a default-6 miss in one honored top-up, not a 3+3 split", () => {
    expect(countHonoredSlideCountTopUpTurns({
      produced: 1,
      requested: null,
      defaultRequested: 6,
    })).toBe(1);
    expect(countHonoredSlideCountTopUpTurns({
      produced: 3,
      requested: null,
      defaultRequested: 6,
    })).toBe(1);
    expect(countHonoredSlideCountTopUpTurns({
      produced: 6,
      requested: null,
      defaultRequested: 6,
    })).toBe(0);
    expect(countHonoredSlideCountTopUpTurns({
      produced: 6,
      requested: 15,
    })).toBe(2);

    let produced = 1;
    let topUpCount = 0;
    while (shouldQueueSlideCountTopUp({
      produced,
      requested: null,
      defaultRequested: 6,
      topUpCount,
    })) {
      produced = slideCountTopUpAppendUntil(produced, 6);
      topUpCount += 1;
    }
    expect(produced).toBe(6);
    expect(topUpCount).toBe(1);
    expect(shouldQueueSlideCountTopUp({
      produced: 6,
      requested: null,
      defaultRequested: 6,
      topUpCount: 1,
    })).toBe(false);
  });
});

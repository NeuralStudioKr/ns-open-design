import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../src/types";
import {
  SLIDE_COUNT_REQUEST_MAX,
  SLIDE_COUNT_TOP_UP_BATCH,
  SLIDE_COUNT_TOP_UP_BUSY_RETRY_MAX,
  SLIDE_COUNT_TOP_UP_BUSY_RETRY_MS,
  SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL,
  SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL_LEGACY,
  SLIDE_COUNT_TOP_UP_ENTRY_FROM,
  SPARSE_CONTENT_TOP_UP_ENTRY_FROM,
  SPARSE_CONTENT_TOP_UP_PROMPT_SENTINEL,
  THIN_PRIOR_FULL_REWRITE_ENTRY_FROM,
  formatSoftImprovementTurnFailureNotice,
  isSoftImprovementAutomationEntryFrom,
  isSoftImprovementAutomationPrompt,
  buildSlideCountTopUpPrompt,
  buildSparseContentTopUpPrompt,
  buildThinPriorFullRewritePrompt,
  countHonoredSlideCountTopUpTurns,
  countSparseContentTopUpAttemptsInConversation,
  isSparseContentTopUpPrompt,
  shouldQueueSparseContentTopUp,
  slideCountTopUpAppendUntil,
  isSlideCountTopUpPrompt,
  isThinPriorFullRewritePrompt,
  extractRequestedSlideCountSpecFromMessages,
  countSlideCountTopUpAttemptsInConversation,
  extractRequestedSlideCountTargetFromMessages,
  looksLikeSlideCountExpansionRequest,
  parseSlideCountSpec,
  parseSlideCountTarget,
  shouldQueueSlideCountTopUp,
  shouldQueueThinPriorFullRewrite,
  honorSlideCountCeiling,
  honorSlideCountCeilingFromMessages,
  applyHonorSlideCeilingToHtml,
  THIN_PRIOR_FULL_REWRITE_PROMPT_SENTINEL,
  shouldBlockSlideCountAppendOntoThinPrior,
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

  it("루프398: ignores stability-cap runContext and honors plain 8-10", () => {
    expect(extractRequestedSlideCountSpecFromMessages([
      {
        id: "u-cap",
        role: "user",
        content: "서비스 소개 슬라이드",
        createdAt: 1,
        runContext: { slideCountHint: "6 (stability cap for first template fill)" },
      },
    ])).toBeNull();
    expect(extractRequestedSlideCountSpecFromMessages([
      {
        id: "u-ok",
        role: "user",
        content: "서비스 소개 슬라이드",
        createdAt: 1,
        runContext: { slideCountHint: "8-10 (close this turn)" },
      },
    ])).toEqual({ min: 8, max: 10 });
  });

  it("루프400: visible exact 12장 beats seed-line 8-10 in the same turn", () => {
    expect(extractRequestedSlideCountSpecFromMessages([
      {
        id: "u-exact",
        role: "user",
        content: "정확히 12장으로 만들어줘\n\nUser requested slide count: 8-10",
        createdAt: 1,
        runContext: { slideCountHint: "8-10" },
      },
    ])).toEqual({ min: 12, max: 12 });
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

  it("caps explicit 8-10 at 10 and leaves 12-15 uncapped", () => {
    expect(honorSlideCountCeiling({ min: 8, max: 10 })).toBe(10);
    expect(honorSlideCountCeiling({ min: 5, max: 6 })).toBe(6);
    expect(honorSlideCountCeiling({ min: 10, max: 10 })).toBe(10);
    expect(honorSlideCountCeiling({ min: 12, max: 15 })).toBeNull();
    expect(honorSlideCountCeiling({ min: 6, max: 8 })).toBe(8);
    expect(honorSlideCountCeiling(null)).toBeNull();
    expect(
      honorSlideCountCeilingFromMessages([
        userMessage("u-honor-8-10", 'slideCount: "8-10"\n8~10장으로 만들어줘'),
      ]),
    ).toBe(10);
    expect(
      honorSlideCountCeilingFromMessages([
        userMessage("u-honor-12-15", 'slideCount: "12-15"\n12-15 pages'),
      ]),
    ).toBeNull();
  });

  it("trims persist HTML to the honor ceiling and first-fill unspecified 6", () => {
    const slides = Array.from({ length: 15 }, (_, i) => (
      `<section class="slide"><h2>장 ${i + 1}</h2><p>본문</p></section>`
    )).join("");
    const html = `<body>${slides}</body>`;
    const trimmed = applyHonorSlideCeilingToHtml(
      html,
      [userMessage("u-8-10", 'slideCount: "8-10"')],
    );
    expect((trimmed.match(/class="slide"/g) ?? []).length).toBe(10);
    expect(trimmed).not.toContain("장 11");
    const unspecified = applyHonorSlideCeilingToHtml(html, [], { firstFill: true });
    expect((unspecified.match(/class="slide"/g) ?? []).length).toBe(6);
    const detailed = applyHonorSlideCeilingToHtml(
      html,
      [userMessage("u-12-15", 'slideCount: "12-15"')],
      { firstFill: true },
    );
    expect((detailed.match(/class="slide"/g) ?? []).length).toBe(15);
    const topUp = applyHonorSlideCeilingToHtml(
      html,
      [
        userMessage("u-none", "만들어줘"),
        userMessage("u-top", `${SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL}\nAPPEND only new slides`),
      ],
      { firstFill: true },
    );
    expect((topUp.match(/class="slide"/g) ?? []).length).toBe(15);
  });

  it("does not queue hidden top-up when 8 of an 8-10 honor already closed", () => {
    expect(shouldQueueSlideCountTopUp({
      produced: 8,
      requested: 10,
      requestedMin: 8,
      topUpCount: 0,
    })).toBe(false);
    expect(shouldQueueSlideCountTopUp({
      produced: 6,
      requested: 10,
      requestedMin: 8,
      topUpCount: 0,
    })).toBe(true);
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
    })).toBe(true);
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
    expect(SLIDE_COUNT_TOP_UP_BUSY_RETRY_MAX).toBe(3);
    expect(SLIDE_COUNT_TOP_UP_BUSY_RETRY_MS).toBe(900);
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
    const spec = extractRequestedSlideCountSpecFromMessages([
      userMessage("u1", "서비스 소개 슬라이드 8~10장으로 만들어줘"),
    ]);
    expect(spec).toEqual({ min: 8, max: 10 });
    expect(shouldQueueSlideCountTopUp({
      produced: 4,
      requested: spec?.max ?? null,
      requestedMin: spec?.min ?? null,
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

  it("queues thin-prior full rewrite instead of append (루프468)", () => {
    expect(shouldQueueThinPriorFullRewrite({
      hostCount: 9,
      thinPrior: true,
      rewriteCount: 0,
    })).toBe(true);
    expect(shouldQueueThinPriorFullRewrite({
      hostCount: 2,
      thinPrior: true,
      rewriteCount: 0,
    })).toBe(true);
    expect(shouldQueueThinPriorFullRewrite({
      hostCount: 9,
      thinPrior: false,
      rewriteCount: 0,
    })).toBe(false);
    expect(shouldQueueThinPriorFullRewrite({
      hostCount: 9,
      thinPrior: true,
      rewriteCount: 1,
    })).toBe(false);
    const prompt = buildThinPriorFullRewritePrompt({ hostCount: 9, requested: 8 });
    expect(prompt.startsWith(THIN_PRIOR_FULL_REWRITE_PROMPT_SENTINEL)).toBe(true);
    expect(isThinPriorFullRewritePrompt(prompt)).toBe(true);
    expect(isSlideCountTopUpPrompt(prompt)).toBe(false);
    expect(prompt).toMatch(/REWRITE the entire deck/i);
    expect(prompt).toMatch(/emit exactly 8 slides/i);
    expect(prompt).toMatch(/NEVER copy host protocol tokens/i);
    const ranged = buildThinPriorFullRewritePrompt({
      hostCount: 4,
      requested: 10,
      requestedMin: 8,
      userBrief: "teamver 서비스 소개 슬라이드 8~10장 만들어줘",
    });
    expect(ranged).toMatch(/at least 8 and at most 10/);
    expect(ranged).toMatch(/Source brief/);
    expect(ranged).toMatch(/titlewrap/);
    expect(shouldBlockSlideCountAppendOntoThinPrior({
      thinPrior: true,
      rewriteCount: 1,
    })).toBe(true);
    expect(shouldBlockSlideCountAppendOntoThinPrior({
      thinPrior: true,
      rewriteCount: 0,
    })).toBe(false);
    expect(shouldBlockSlideCountAppendOntoThinPrior({
      thinPrior: false,
      rewriteCount: 1,
    })).toBe(false);
    // 루프505 — count shortfall (4 of 8–10) must win over sparse repair.
    expect(shouldQueueSlideCountTopUp({
      produced: 4,
      requested: 10,
      requestedMin: 8,
      topUpCount: 0,
    })).toBe(true);
    expect(shouldQueueSparseContentTopUp({
      evidenceCount: 2,
      slideCount: 4,
      topUpCount: 0,
      thinPrior: false,
    })).toBe(true);
  });

  it("queues a sparse-content repair only for a real deck with named gaps (루프480)", () => {
    const base = {
      evidenceCount: 2,
      slideCount: 7,
      topUpCount: 0,
      thinPrior: false,
    };
    expect(shouldQueueSparseContentTopUp(base)).toBe(true);
    // No evidence — a deliberately short deck is left alone.
    expect(shouldQueueSparseContentTopUp({ ...base, evidenceCount: 0 })).toBe(false);
    // Thin everywhere → thin-prior rewrite owns it.
    expect(shouldQueueSparseContentTopUp({ ...base, thinPrior: true })).toBe(false);
    // Gaps on most slides mean the whole run failed, not a fillable hole.
    expect(shouldQueueSparseContentTopUp({ ...base, evidenceCount: 5 })).toBe(false);
    expect(shouldQueueSparseContentTopUp({ ...base, slideCount: 2 })).toBe(false);
    // One repair per conversation.
    expect(shouldQueueSparseContentTopUp({ ...base, topUpCount: 1 })).toBe(false);
    // A comment-driven edit turn must not be hijacked.
    expect(shouldQueueSparseContentTopUp({ ...base, commentAttachmentCount: 1 })).toBe(false);
  });

  it("names the gaps in the sparse-content repair prompt (루프480)", () => {
    const prompt = buildSparseContentTopUpPrompt([
      { slideIndex: 2, reason: "heading_count_shortfall", detail: "4가지 핵심 기능 (4→3)" },
      { slideIndex: 6, reason: "title_only_card", detail: "Enterprise" },
    ]);
    expect(prompt.startsWith(SPARSE_CONTENT_TOP_UP_PROMPT_SENTINEL)).toBe(true);
    expect(isSparseContentTopUpPrompt(prompt)).toBe(true);
    expect(isSlideCountTopUpPrompt(prompt)).toBe(false);
    expect(isThinPriorFullRewritePrompt(prompt)).toBe(false);
    expect(prompt).toMatch(/data-slide-index="2" \(slide 3\): the heading promised more items/);
    expect(prompt).toMatch(/data-slide-index="6" \(slide 7\): a card carries a title with no body/);
    // 루프481 — patch only the named slides; a full deck re-emit is what stalled.
    expect(prompt).toMatch(/type="deck-patch"/);
    expect(prompt).toMatch(/Do NOT emit `<artifact type="deck">`/);
    expect(prompt).not.toMatch(/Re-emit the FULL deck/i);
    expect(prompt).toMatch(/N = 2, 6/);

    const messages = [
      { id: "u1", role: "user", content: prompt } as ChatMessage,
      { id: "a1", role: "assistant", content: "ok" } as ChatMessage,
    ];
    expect(countSparseContentTopUpAttemptsInConversation(messages)).toBe(1);
  });

  it("treats sparse repair as soft-improvement; slide-count top-up failure is real (루프503)", () => {
    expect(isSoftImprovementAutomationEntryFrom(SLIDE_COUNT_TOP_UP_ENTRY_FROM)).toBe(false);
    expect(isSoftImprovementAutomationEntryFrom(SPARSE_CONTENT_TOP_UP_ENTRY_FROM)).toBe(true);
    // The saved deck is incomplete on these — their failure is real news.
    expect(isSoftImprovementAutomationEntryFrom(THIN_PRIOR_FULL_REWRITE_ENTRY_FROM)).toBe(false);
    expect(isSoftImprovementAutomationEntryFrom("chat_composer")).toBe(false);
    expect(isSoftImprovementAutomationEntryFrom(undefined)).toBe(false);

    expect(isSoftImprovementAutomationPrompt(buildSparseContentTopUpPrompt([
      { slideIndex: 1, reason: "title_only_card", detail: "Pro" },
    ]))).toBe(true);
    expect(isSoftImprovementAutomationPrompt(
      buildThinPriorFullRewritePrompt({ hostCount: 9, requested: 8 }),
    )).toBe(false);
    expect(isSoftImprovementAutomationPrompt(
      buildSlideCountTopUpPrompt({ produced: 4, requested: 10 }),
    )).toBe(false);
    expect(formatSoftImprovementTurnFailureNotice()).toMatch(/그대로 유지/);
  });
});

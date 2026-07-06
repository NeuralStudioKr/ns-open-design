import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../src/types";
import { sanitizeChatMessageLeakedPseudoTool } from "../src/utils/sanitizeChatMessageLeakedPseudoTool";

describe("sanitizeChatMessageLeakedPseudoTool", () => {
  it("strips pseudo-tool XML from content and text events", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: 'Hi\n<function_calls><invoke name="TodoWrite"></invoke></function_calls>',
      events: [
        { kind: "text", text: "Plan\n<todo-list><item>Step</item></todo-list>" },
        { kind: "status", label: "running" },
      ],
    };

    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("Hi\n");
    expect(sanitized.events?.[0]).toEqual({ kind: "text", text: "Plan\n" });
    expect(sanitized.events?.[1]).toEqual({ kind: "status", label: "running" });
  });

  it("strips leaked todo XML from persisted assistant messages", () => {
    const message: ChatMessage = {
      id: "m-todo",
      role: "assistant",
      content: [
        "알겠습니다.",
        "<todo>",
        '[{"id":"1","label":"슬라이드 구성","status":"in_progress"}]',
        "</todo>",
        "슬라이드 구성 계획:",
      ].join("\n"),
      events: [
        {
          kind: "text",
          text: '진행합니다.\n<todo>[{"id":"2","label":"작성","status":"completed"}]</todo>\n완료.',
        },
      ],
    };

    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("알겠습니다.\n\n슬라이드 구성 계획:");
    expect(sanitized.content).not.toContain("<todo");
    expect(sanitized.events?.[0]).toEqual({ kind: "text", text: "진행합니다.\n\n완료." });
  });

  it("strips variant internal XML from persisted assistant messages", () => {
    const message: ChatMessage = {
      id: "m-variant-internal",
      role: "assistant",
      content: [
        "진행하겠습니다.",
        "<tool_call_chunk><function>TodoWrite</function>{}</tool_call_chunk>",
        "<internal_notes>hidden</internal_notes>",
        "초안을 준비합니다.",
      ].join("\n"),
      events: [
        {
          kind: "text",
          text: "본문\n<reasoning_trace>private</reasoning_trace>\n완료.",
        },
      ],
    };

    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("진행하겠습니다.\n\n초안을 준비합니다.");
    expect(sanitized.content).not.toContain("tool_call_chunk");
    expect(sanitized.content).not.toContain("internal_notes");
    expect(sanitized.events?.[0]).toEqual({ kind: "text", text: "본문\n\n완료." });
  });

  it("returns the same reference when nothing changed", () => {
    const message: ChatMessage = {
      id: "m2",
      role: "assistant",
      content: "Clean answer",
    };
    expect(sanitizeChatMessageLeakedPseudoTool(message)).toBe(message);
  });

  it("strips internal markup from thinking events on load", () => {
    const message: ChatMessage = {
      id: "m3",
      role: "assistant",
      content: "",
      events: [
        {
          kind: "thinking",
          text: "<answer_operator><task_analysis>plan</task_analysis></answer_operator>",
        },
      ],
    };
    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.events).toEqual([]);
  });

  it("drops empty text events after stripping internal markup", () => {
    const message: ChatMessage = {
      id: "m4",
      role: "assistant",
      content: "",
      events: [
        {
          kind: "text",
          text: "<answer_operator><task_analysis>only plan</task_analysis></answer_operator>",
        },
        { kind: "text", text: "슬라이드 구성 계획:" },
      ],
    };
    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.events).toEqual([{ kind: "text", text: "슬라이드 구성 계획:" }]);
  });

  it("strips read/edit pseudo-tool blocks and closed artifacts on reload", () => {
    const message: ChatMessage = {
      id: "m-read-edit",
      role: "assistant",
      content: "",
      events: [
        {
          kind: "text",
          text: [
            "<read><path>ai-adoption-effects.html</path></read>",
            '<artifact identifier="deck" type="text/html" title="Deck"><html></html></artifact>',
            "<edit><path>ai-adoption-effects.html</path><diff>patch</diff></edit>",
            "슬라이드 초안을 반영했습니다.",
          ].join("\n"),
        },
      ],
    };
    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.events?.[0]).toEqual({
      kind: "text",
      text: "슬라이드 초안을 반영했습니다.",
    });
  });

  it("strips leaked deck navigation script from persisted assistant messages", () => {
    const message: ChatMessage = {
      id: "m-deck-script",
      role: "assistant",
      content: [
        "(function () {",
        "var stage = document.getElementById('deck-stage');",
        "var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));",
        "function fit() { stage.style.transform = 'translate(0px,0px) scale(1)'; }",
        "function paint() { slides.forEach(function (el, i) { el.classList.toggle('active', i === 0); }); }",
        "function focusDeck() { try { window.focus(); document.body.focus({ preventScroll: true }); } catch (_) {} }",
        "fit();",
        "paint();",
        "focusDeck();",
        "})좋아요! 뉴럴스튜디오 온보딩 PPT를 만들겠습니다.",
      ].join("\n"),
      events: [
        {
          kind: "text",
          text: [
            "var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));",
            "function fit() { stage.style.transform = 'translate(0px,0px) scale(1)'; }",
            "function paint() { slides.forEach(function (el, i) { el.classList.toggle('active', i === 0); }); }",
            "function focusDeck() { try { window.focus(); document.body.focus({ preventScroll: true }); } catch (_) {} }",
            "fit();",
            "paint();",
            "focusDeck();",
            "})완료했습니다.",
          ].join("\n"),
        },
      ],
    };
    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("");
    expect(sanitized.content).not.toContain("deck-stage");
    expect(sanitized.events?.[0]).toEqual({ kind: "text", text: "완료했습니다." });
  });

  it("strips persisted deck generation plan prose on project re-entry", () => {
    const message: ChatMessage = {
      id: "m-deck-plan",
      role: "assistant",
      content: [
        "좋아요! 뉴럴스튜디오 온보딩 PPT, 8장, 테크 & 모던 톤으로 바로 만들겠습니다.",
        "",
        "**슬라이드 구성 계획:**1. Cover — 뉴럴스튜디오 온보딩 표지",
        "2. 회사 소개 & 미션3. 조직 & 팀 문화",
        "4. 커뮤니케이션 채널 & 협업 문화",
        "5. 툴 스택",
        "6. 업무 프로세스 (스프린트 사이클)",
        "7. 코드 & PR 가이드",
        "8. Closing — Day 1 체크리스트",
        "",
        "Neutral Modern 디자인 시스템 기반 (딥 네이비 + 코발트 #2F6FEB), Inter 폰트, 테크 톤으로 작성합니다.",
      ].join("\n"),
      events: [
        {
          kind: "text",
          text: [
            "**슬라이드 구성 계획:**1. Cover — 뉴럴스튜디오 온보딩 표지",
            "2. 회사 소개 & 미션",
          ].join("\n"),
        },
      ],
    };

    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("");
    expect(sanitized.events).toEqual([]);
  });
});

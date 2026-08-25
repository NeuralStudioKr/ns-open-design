import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../src/types";
import { sanitizeChatMessageLeakedPseudoTool } from "../src/utils/sanitizeChatMessageLeakedPseudoTool";
import { sanitizePersistedAssistantChatMessage } from "../src/utils/sanitizePersistedAssistantChatMessage";

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
    expect(sanitized.content).toBe("Hi");
    expect(sanitized.events?.[0]).toEqual({ kind: "text", text: "Plan" });
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
    const visibleProse = "요청하신 덱 초안을 바로 만들겠습니다.";
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
        `})${visibleProse}`,
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
    expect(sanitized.content).toBe(visibleProse);
    expect(sanitized.content).not.toContain("deck-stage");
    expect(sanitized.events?.[0]).toEqual({ kind: "text", text: "완료했습니다." });
  });

  it("strips mangled deck-framework body leak (no deck-* ids, no proper close) from persisted content and events", () => {
    const leaked = [
      "(function () {location.pathname || '/');",
      "var idx = 0; = Math.min((sw - pad) / 1920, (sh - pad) / 1080);",
      "stage.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';",
      "function focusDeck() { try { window.focus(); document.body.focus({ preventScroll: true }); } catch (_) {} }",
      "document.addEventListener('mousedown', focusDeck);",
      "window.addEventListener('resize', fit);",
      "fit();",
      "paint();",
      "focusDeck();",
    ].join("\n");
    const message: ChatMessage = {
      id: "m-deck-mangled",
      role: "assistant",
      content: leaked,
      events: [{ kind: "text", text: leaked }],
    };
    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("");
    expect(sanitized.content).not.toContain("stage.style.transform");
    expect(sanitized.content).not.toContain("focusDeck");
    expect(sanitized.events ?? []).toEqual([]);
  });

  it("strips orphan deck navigation tail fragments from persisted content and events", () => {
    const leaked = [
      "var total = document.getElementById('deck-total'); } catch (_) {} } {",
      "var saved = parseInt(localStorage.getItem(STORE) || '0', 10);",
      "if (!isNaN(saved) && saved >= 0 && saved < slides.length) idx = saved;",
      "} catch (_) {}",
    ].join("\n");
    const message: ChatMessage = {
      id: "m-deck-tail-fragment",
      role: "assistant",
      content: leaked,
      events: [{ kind: "text", text: leaked }],
    };

    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("");
    expect(sanitized.content).not.toContain("deck-total");
    expect(sanitized.content).not.toContain("localStorage");
    expect(sanitized.events ?? []).toEqual([]);
  });

  it("strips deck navigation middle fragments from persisted content and events", () => {
    const leaked = [
      "function onKey(e) {",
      "if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(idx + 1); }",
      "else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(idx - 1); }",
      "}",
      "document.body.setAttribute('tabindex', '-1');",
      "window.addEventListener('load', focusDeck);",
      "fit();",
      "paint();",
      "focusDeck();",
    ].join("\n");
    const message: ChatMessage = {
      id: "m-deck-middle-fragment",
      role: "assistant",
      content: leaked,
      events: [{ kind: "text", text: leaked }],
    };

    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("");
    expect(sanitized.content).not.toContain("ArrowRight");
    expect(sanitized.content).not.toContain("focusDeck");
    expect(sanitized.events ?? []).toEqual([]);
  });

  it("does not mutate persisted deck plan prose that contains no script leak", () => {
    const planText = [
      "요청하신 8장짜리 덱을 바로 만들겠습니다.",
      "",
      "**슬라이드 구성 계획:**",
      "1. 표지",
      "2. 소개",
      "3. 마무리",
    ].join("\n");
    const message: ChatMessage = {
      id: "m-deck-plan",
      role: "assistant",
      content: planText,
      events: [
        {
          kind: "text",
          text: ["**슬라이드 구성 계획:**", "1. 표지", "2. 소개"].join("\n"),
        },
      ],
    };

    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized).toBe(message);
  });

  it("reconciles split text events after stop mid-deck CSS leak", () => {
    const intro = "덱 전체 재작성으로 전달할게요.";
    const leak = "\n\n.slide { width:1920px; height:1080px; box-sizing:border-box; }";
    const message: ChatMessage = {
      id: "m-deck-css-chunks",
      role: "assistant",
      content: `${intro}${leak}`,
      events: [
        { kind: "text", text: `${intro}\n` },
        { kind: "text", text: leak },
      ],
      runStatus: "canceled",
    };

    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe(intro);
    expect(sanitized.events).toEqual([{ kind: "text", text: intro }]);
  });

  it("never paints classic function(e) half-screen deck-nav JS in chat", () => {
    const leaked = [
      "(function(){",
      "document.addEventListener('keydown',function(e){",
      "document.addEventListener('click',function(e){",
      "if(e.clientX>window.innerWidth/2)go(cur+1);else",
    ].join("\n");
    const message: ChatMessage = {
      id: "m-classic-nav",
      role: "assistant",
      content: `슬라이드 수정이 반영되었습니다.\n${leaked}`,
      events: [
        { kind: "text", text: "슬라이드 수정이 반영되었습니다.\n" },
        { kind: "text", text: leaked },
      ],
    };

    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("슬라이드 수정이 반영되었습니다.");
    expect(sanitized.content).not.toContain("addEventListener");
    expect(sanitized.content).not.toContain("innerWidth");
    expect(JSON.stringify(sanitized.events)).not.toContain("addEventListener");
  });

  it("joins reload leftover slide-body events so completion status stays and the dump drops", () => {
    const leak =
      "html>WD · LECTURE 01 · FRONT-END TRACK반응형 UIvideo·svg에일 HTML/CSS, 미디어 쿼리로 유동 재배치. 유지보수 단일 경로, SEO 유리, 초기 비용 낮음.능·접 90, axe-core0 critical, prefers-reduced-motion 대응.</artifact>";
    const hangulTitled =
      "WD · LECTURE 01 · FRONT-END TRACK반응형 UIvideo·svg에일 HTML/CSS, 미디어 쿼리로 유동 재배치. 유지보수 단일 경로, SEO 유리, 초기 비용 낮음.능·접 90, axe-core0 critical, prefers-reduced-motion 대응.";
    const message: ChatMessage = {
      id: "m-reload-lecture",
      role: "assistant",
      content: "슬라이드 작업이 완료되었습니다.",
      events: [
        { kind: "text", text: "슬라이드 작업이 완료되었습니다." },
        { kind: "tool_use", id: "w1", name: "Write", input: {} },
        { kind: "text", text: leak },
        { kind: "text", text: hangulTitled },
      ],
    };
    const sanitized = sanitizeChatMessageLeakedPseudoTool(message, { stripCodeFences: true });
    expect(sanitized.content).toBe("슬라이드 작업이 완료되었습니다.");
    expect(sanitized.content).not.toContain("LECTURE");
    expect(JSON.stringify(sanitized.events)).not.toContain("LECTURE");
    expect(JSON.stringify(sanitized.events)).not.toContain("html>");
    expect(JSON.stringify(sanitized.events)).not.toContain("</artifact>");
    expect(sanitized.events?.some((event) => event.kind === "text" && event.text.includes("완료"))).toBe(
      true,
    );
  });

  it("joins leftover body> events that have no lecture / axe-core tokens", () => {
    const leak =
      "body>WD · INTRO반응형 UI 유지보수 단일 경로, SEO 유리. font-size:2rem color:#111</body>";
    const message: ChatMessage = {
      id: "m-reload-body",
      role: "assistant",
      content: "슬라이드 작업이 완료되었습니다.",
      events: [
        { kind: "text", text: "슬라이드 작업이 완료되었습니다." },
        { kind: "tool_use", id: "w1", name: "Write", input: {} },
        { kind: "text", text: leak },
      ],
    };
    const sanitized = sanitizeChatMessageLeakedPseudoTool(message, { stripCodeFences: true });
    expect(sanitized.content).toBe("슬라이드 작업이 완료되었습니다.");
    expect(JSON.stringify(sanitized.events)).not.toContain("body>");
    expect(JSON.stringify(sanitized.events)).not.toContain("font-size:2rem");
  });
});

describe("sanitizePersistedAssistantChatMessage", () => {
  it("scrubs leftover body> events on settled rows and leaves in-flight question-form", () => {
    const leak =
      "body>WD · INTRO반응형 UI 유지보수 단일 경로, SEO 유리. font-size:2rem color:#111</body>";
    const settled: ChatMessage = {
      id: "m-settled",
      role: "assistant",
      content: "슬라이드 작업이 완료되었습니다.",
      createdAt: 1,
      runStatus: "succeeded",
      events: [
        { kind: "text", text: "슬라이드 작업이 완료되었습니다." },
        { kind: "tool_use", id: "w1", name: "Write", input: {} },
        { kind: "text", text: leak },
      ],
    };
    const cleaned = sanitizePersistedAssistantChatMessage(settled);
    expect(cleaned.content).toBe("슬라이드 작업이 완료되었습니다.");
    expect(JSON.stringify(cleaned.events)).not.toContain("body>");

    const inflight: ChatMessage = {
      id: "m-run",
      role: "assistant",
      content: 'Planning…\n<question-form id="discovery">{"questions":[',
      createdAt: 1,
      runStatus: "running",
      events: [
        { kind: "text", text: 'Planning…\n<question-form id="discovery">{"questions":[' },
      ],
    };
    expect(sanitizePersistedAssistantChatMessage(inflight)).toBe(inflight);
  });

  it("scrubs short WD · OUTRO / index-badge chrome on persist reload (round 28)", () => {
    const settled: ChatMessage = {
      id: "m-short-chrome",
      role: "assistant",
      content: "슬라이드 작업이 완료되었습니다.\nWD · OUTRO\n02 / AGENDA",
      createdAt: 1,
      runStatus: "succeeded",
      events: [
        { kind: "text", text: "슬라이드 작업이 완료되었습니다." },
        { kind: "text", text: "WD · OUTRO" },
        { kind: "text", text: "02 / AGENDA" },
      ],
    };
    const cleaned = sanitizePersistedAssistantChatMessage(settled);
    expect(cleaned.content).toBe("슬라이드 작업이 완료되었습니다.");
    expect(JSON.stringify(cleaned.events)).not.toContain("OUTRO");
    expect(JSON.stringify(cleaned.events)).not.toContain("AGENDA");
  });
});

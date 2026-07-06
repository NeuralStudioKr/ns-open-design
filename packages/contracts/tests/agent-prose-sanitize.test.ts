import { describe, expect, it } from "vitest";

import {
  LEAKED_AGENT_PROSE_TAG_NAMES,
  sanitizeAssistantProseForDisplay,
  sanitizeLeakedAgentProse,
  stripTrailingOpenInternalMarkup,
} from "../src/agent-prose-sanitize.js";

describe("agent-prose-sanitize SSOT", () => {
  it("documents every closed-tag family in LEAKED_AGENT_PROSE_TAG_NAMES", () => {
    expect(LEAKED_AGENT_PROSE_TAG_NAMES).toEqual(
      expect.arrayContaining(["tool_call", "redacted_thinking", "function_calls", "scratchpad"]),
    );
    expect(LEAKED_AGENT_PROSE_TAG_NAMES.length).toBeGreaterThanOrEqual(20);
  });

  it("strips answer_operator / task_analysis planning blocks", () => {
    const input = [
      "<answer_operator>",
      "<task_analysis>",
      "User skipped all discovery fields.",
      "Inferred defaults: Output: slide deck",
      "Workflow: TodoWrite plan",
      "</task_analysis>",
      "</answer_operator>",
      "슬라이드 구성 계획:",
    ].join("\n");
    expect(sanitizeLeakedAgentProse(input)).toBe("슬라이드 구성 계획:");
    expect(sanitizeAssistantProseForDisplay(input)).toBe("슬라이드 구성 계획:");
  });

  it("strips trailing open answer_operator while streaming", () => {
    const input = "Working…\n<answer_operator>\n<task_analysis>\nPlan:";
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(input);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("Working…");
  });

  it("strips dynamic *_operator and *_analysis suffix tags", () => {
    const input = [
      "<routing_operator>hidden</routing_operator>",
      "<brief_analysis>also hidden</brief_analysis>",
      "Visible.",
    ].join("\n");
    expect(sanitizeLeakedAgentProse(input)).toBe("Visible.");
  });

  it("strips extended internal planning tags", () => {
    const input = [
      "Answer.",
      "<workflow>steps</workflow>",
      "<observation>note</observation>",
      "<hidden>x</hidden>",
      "<execution_plan>y</execution_plan>",
      "Done.",
    ].join("\n");
    expect(sanitizeLeakedAgentProse(input)).toBe("Answer.\n\nDone.");
  });

  it("handles repeated closed-tag stripping with cached global regexes", () => {
    const input = [
      "<thinking>a</thinking>",
      "<thinking>b</thinking>",
      "Visible.",
    ].join("\n");
    expect(sanitizeLeakedAgentProse(input)).toBe("Visible.");
  });

  it("strips agent planning / reflection tags", () => {
    const input = [
      "Answer.",
      "<scratchpad>hidden notes</scratchpad>",
      "<reflection>why</reflection>",
      "<internal>do not show</internal>",
      "<chain_of_thought>steps</chain_of_thought>",
      "<chain-of-thought>more</chain-of-thought>",
      "<reasoning>rationale</reasoning>",
      "<plan>step 1</plan>",
      "<action>run tool</action>",
      "<function_result>ok</function_result>",
      "Done.",
    ].join("\n");
    const out = sanitizeLeakedAgentProse(input);
    expect(out).toBe("Answer.\n\nDone.");
  });

  it("strips leaked todo XML blocks from assistant prose", () => {
    const input = [
      "알겠습니다.",
      "<todo>",
      "[",
      '{"id":"1","label":"활성 DESIGN.md 확인","status":"completed"},',
      '{"id":"2","label":"12장 슬라이드 구성","status":"in_progress"}',
      "]",
      "</todo>",
      "슬라이드 구성 계획:",
    ].join("\n");
    const out = sanitizeLeakedAgentProse(input);
    expect(out).toBe("알겠습니다.\n\n슬라이드 구성 계획:");
    expect(out).not.toContain("<todo");
    expect(out).not.toContain("활성 DESIGN.md");
  });

  it("strips variant internal and pseudo-tool XML blocks from assistant prose", () => {
    const input = [
      "요청을 접수했습니다.",
      "<tool_call_chunk>",
      '{"name":"TodoWrite","arguments":{"todos":[{"content":"hidden"}]}}',
      "</tool_call_chunk>",
      "<reasoning_trace>private chain</reasoning_trace>",
      "<internal_notes>hidden note</internal_notes>",
      "<slide_plan_internal>hidden outline</slide_plan_internal>",
      "<todo_items>[{\"content\":\"hidden todo\"}]</todo_items>",
      "슬라이드 초안을 준비하겠습니다.",
    ].join("\n");
    const out = sanitizeAssistantProseForDisplay(input);
    expect(out).toBe("요청을 접수했습니다.\n\n슬라이드 초안을 준비하겠습니다.");
    expect(out).not.toContain("<tool_call_chunk");
    expect(out).not.toContain("private chain");
    expect(out).not.toContain("hidden note");
    expect(out).not.toContain("hidden todo");
  });

  it("strips markdown tool_call fences", () => {
    const input = [
      "Intro",
      "```tool_call",
      '{"name":"Write","arguments":{"path":"index.html"}}',
      "```",
      "Outro",
    ].join("\n");
    expect(sanitizeLeakedAgentProse(input)).toBe("Intro\n\nOutro");
  });

  it("strips untagged trailing tool JSON shards", () => {
    const input =
      'Visible\n{"name": "TodoUpdate", "arguments": {"updates": [{"index": 1, "status": "done"}]}}';
    expect(sanitizeAssistantProseForDisplay(input)).toBe("Visible");
  });

  it("strips trailing open markdown tool fences while streaming", () => {
    const input = "Working…\n```tool\n{\"name\":\"Write\"";
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(input);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("Working…");
  });

  it("strips trailing open todo XML while streaming", () => {
    const input = "진행하겠습니다.\n<todo>\n[{\"id\":\"1\",\"label\":\"작업\"";
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(input);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("진행하겠습니다.");
  });

  it("strips orphan pseudo-tool close tags left after chunked streaming sanitization", () => {
    const input = [
      "진행하겠습니다.",
      "</invoke>",
      "</tools>",
      "</tool_call_chunk>",
      "슬라이드 초안을 준비합니다.",
    ].join("\n");
    const out = sanitizeAssistantProseForDisplay(input);
    expect(out).toBe("진행하겠습니다.\n\n슬라이드 초안을 준비합니다.");
    expect(out).not.toContain("</invoke>");
    expect(out).not.toContain("</tools>");
  });

  it("strips trailing open variant internal XML while streaming", () => {
    const input = "진행하겠습니다.\n<tool_call_chunk>\n{\"name\":\"TodoWrite\"";
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(input);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("진행하겠습니다.");
  });

  it("strips the outer unclosed variant XML even when an inner dynamic tag is closed", () => {
    const input = [
      "진행하겠습니다.",
      "<tool_call_chunk>",
      "<function>TodoWrite</function>",
      '{"arguments":{"todos":[{"content":"hidden"}]}}',
    ].join("\n");
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(input);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("진행하겠습니다.");
  });

  it("strips Cursor-style tool_call blocks with JSON payloads", () => {
    const input = [
      "슬라이드 구성 계획:",
      "<tool_call>",
      '{"name": "TodoUpdate", "arguments": {"updates": [{"index": 1, "status": "completed"}]}}',
      "</tool_call>",
      "<tool_call>",
      '{"name": "Write", "arguments": {"path": "index.html", "content": "<!doctype html>"}}',
      "</tool_call>",
      "본문 시작",
    ].join("\n");
    const out = sanitizeLeakedAgentProse(input);
    expect(out).not.toContain("<tool_call>");
    expect(out).not.toContain("TodoUpdate");
    expect(out).not.toContain("<!doctype html>");
    expect(out).toContain("슬라이드 구성 계획:");
    expect(out).toContain("본문 시작");
  });

  it("strips pseudo Read/Edit/Write blocks (BYOK pseudo-tool markup leak)", () => {
    const input = [
      "<read>",
      "<path>ai-adoption-effects.html</path>",
      "</read>",
      "",
      '<artifact identifier="ai-adoption-effects" type="text/html" title="기업의 AI 도입 효과">',
      "<!doctype html>",
      '<html lang="ko"><head></head><body>hidden</body></html>',
      "<edit>",
      "<path>ai-adoption-effects.html</path>",
      "<diff>",
      "<<<<<<< SEARCH",
      ":root { --bg: #FAFAFA; }",
      "=======",
      ":root { --bg: #FAFAFA; --accent-soft: #F4E8E3; }",
      ">>>>>>> REPLACE",
      "</diff>",
      "</edit>",
      "",
      "슬라이드 초안을 반영했습니다.",
    ].join("\n");
    const out = sanitizeAssistantProseForDisplay(input);
    expect(out).toBe("슬라이드 초안을 반영했습니다.");
    expect(out).not.toContain("<read");
    expect(out).not.toContain("<edit");
    expect(out).not.toContain("<path>");
    expect(out).not.toContain("<<<<<<< SEARCH");
    expect(out).not.toContain("<!doctype html>");
  });

  it("strips leaked deck navigation script prose while preserving the final answer", () => {
    const input = [
      "(function () {",
      "var stage = document.getElementById('deck-stage');",
      "var slides = Array.prototype.slice.call(document.querySelectorAll('.slide')); var prev = document.getElementById('deck-prev');",
      "var next = document.getElementById('deck-next');",
      "var cur = document.getElementById('deck-cur');",
      "var total = document.getElementById('deck-total'); var STORE = 'deck:idx:' + (location.pathname || '/');",
      "var idx = 0; function fit() {",
      "var sw = window.innerWidth;",
      "var sh = window.innerHeight;",
      "stage.style.transform = 'translate(0px,0px) scale(1)';",
      "}",
      "function paint() {",
      "slides.forEach(function (el, i) { el.classList.toggle('active', i === idx); });",
      "}",
      "function go(i) { idx = i; paint(); }",
      "function onKey(e) { if (e.key === 'ArrowRight') go(idx + 1); }",
      "window.addEventListener('keydown', onKey, true);",
      "document.addEventListener('keydown', onKey, true);",
      "function focusDeck() { try { window.focus(); document.body.focus({ preventScroll: true }); } catch (_) {} }",
      "window.addEventListener('load', focusDeck);",
      "fit();",
      "paint();",
      "focusDeck();",
      "})좋아요! 뉴럴스튜디오 온보딩 PPT, 8장, 테크 & 모던 톤으로 바로 만들겠습니다.",
    ].join("\n");
    const out = sanitizeAssistantProseForDisplay(input, { streaming: true });
    expect(out).toBe("");
    expect(out).not.toContain("document.getElementById");
    expect(out).not.toContain("deck-stage");
  });

  it("strips deck generation preamble and numbered slide planning prose from history", () => {
    const input = [
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
    ].join("\n");

    expect(sanitizeAssistantProseForDisplay(input)).toBe("");
  });

  it("strips partial deck navigation script while streaming before the closing IIFE arrives", () => {
    const cases = [
      [
        "좋아요, 만들겠습니다.\n(function () {\nvar stage = document.getElementById('deck-stage');\nvar slides =",
        "좋아요, 만들겠습니다.",
      ],
      [
        "진행 중입니다.\nvar slides = Array.prototype.slice.call(document.querySelectorAll('.slide')); var prev = document.getElementById('deck-prev');\nfunction fit() {",
        "진행 중입니다.",
      ],
      [
        "초안을 준비합니다.\nfunction fit() {\nvar sw = window.innerWidth;\nstage.style.transform = 'translate(0px,0px) scale(1)';",
        "초안을 준비합니다.",
      ],
    ] as const;
    for (const [input, expected] of cases) {
      const out = sanitizeAssistantProseForDisplay(input, { streaming: true });
      expect(out).toBe(expected);
      expect(out).not.toContain("deck-stage");
      expect(out).not.toContain("querySelectorAll");
      expect(out).not.toContain("stage.style.transform");
    }
  });

  it("strips trailing open read/edit/artifact in history but preserves open artifact while streaming", () => {
    const streamingArtifact =
      'Working…\n<artifact identifier="deck" type="text/html" title="Deck">\n<!doctype html>';
    expect(
      sanitizeAssistantProseForDisplay(streamingArtifact, { streaming: true }),
    ).toBe(streamingArtifact);

    const streamingRead = "Working…\n<read>\n<path>index.html</path>";
    expect(sanitizeAssistantProseForDisplay(streamingRead, { streaming: true })).toBe("Working…");

    const historyArtifact =
      'Done.\n<artifact identifier="deck" type="text/html">\n<html></html>\n<edit>\n<path>x</path>';
    expect(sanitizeAssistantProseForDisplay(historyArtifact)).toBe("Done.");
  });
});

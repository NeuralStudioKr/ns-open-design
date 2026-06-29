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
});

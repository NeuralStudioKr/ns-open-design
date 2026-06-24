import { describe, expect, it } from "vitest";

import {
  sanitizeAssistantProseForDisplay,
  sanitizeLeakedAgentProse,
  stripInternalOpenDesignMarkup,
  stripTrailingOpenInternalMarkup,
} from "../src/runtime/internalAgentMarkup";
import { stripLeakedPseudoToolXml } from "../src/utils/stripLeakedPseudoToolXml";
import { sanitizeChatMessageLeakedPseudoTool } from "../src/utils/sanitizeChatMessageLeakedPseudoTool";

describe("internalAgentMarkup", () => {
  it("strips closed odTodoWrite blocks from assistant prose", () => {
    const input = [
      "Planning the deck.",
      "<odTodoWrite>",
      '[{"id":"1","text":"Pick layout","status":"in_progress"}]',
      "</odTodoWrite>",
      "Starting slide 1.",
    ].join("\n");
    const out = stripInternalOpenDesignMarkup(input);
    expect(out).not.toContain("<odTodoWrite");
    expect(out).not.toContain("Pick layout");
    expect(out).toContain("Planning the deck.");
    expect(out).toContain("Starting slide 1.");
  });

  it("strips trailing open od markup while streaming", () => {
    const input = "Working…\n<odTodoWrite>\n[{\"id\":\"1\"";
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(input);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("Working…");
    expect(text).not.toContain("<odTodoWrite");
  });

  it("removes fake tool narration placeholders", () => {
    const input = "Next step [正在调用 TodoWrite …] then build.";
    expect(stripInternalOpenDesignMarkup(input)).toBe("Next step  then build.");
  });

  it("sanitizeAssistantProseForDisplay applies closed + open stripping when streaming", () => {
    const input = "Hi\n<odThinking>secret chain</odThinking>\n<odTodoWrite>[";
    expect(sanitizeAssistantProseForDisplay(input, { streaming: true })).toBe("Hi");
  });

  it("strips closed redacted_thinking and system-reminder blocks", () => {
    const rt = "redacted_thinking";
    const input = [
      "Answer.",
      `<${rt}>chain of thought</${rt}>`,
      "<system-reminder>do not say this</system-reminder>",
      "Done.",
    ].join("\n");
    const out = stripInternalOpenDesignMarkup(input);
    expect(out).not.toContain("redacted_thinking");
    expect(out).not.toContain("chain of thought");
    expect(out).not.toContain("system-reminder");
    expect(out).toContain("Answer.");
    expect(out).toContain("Done.");
  });

  it("strips trailing open redacted_thinking while streaming", () => {
    const rt = "redacted_thinking";
    const input = `Working…\n<${rt}>\nThe user wants`;
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(input);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("Working…");
  });

  it("strips closed info blocks and trailing open info while streaming", () => {
    const closed = [
      "Plan ready.",
      "<info>TodoWrite called with 9 tasks</info>",
      "<info>Marking task 1 as in_progress</info>",
      "슬라이드 구성 계획:",
    ].join("\n");
    expect(stripInternalOpenDesignMarkup(closed)).toBe("Plan ready.\n\n슬라이드 구성 계획:");

    const streaming = "Working…\n<info>Marking task 3 as in_progress";
    const { text, hadOpenInternalMarkup } = stripTrailingOpenInternalMarkup(streaming);
    expect(hadOpenInternalMarkup).toBe(true);
    expect(text).toBe("Working…");
  });

  it("strips pseudo-tool XML, thinking tags, fake file reads, and bare status lines", () => {
    const input = [
      "<function_calls><invoke name=\"Write\"><parameter name=\"path\">x.html</parameter></invoke></function_calls>",
      "<todo-list><item>Step 1</item></todo-list>",
      "[读取 template.html 中的布局]",
      "[Reading layouts.md for patterns]",
      "Marking task 2 as completed",
      "<thinking>internal plan</thinking>",
      "<info>Running tool: Bash</info>",
      "Deliverable ready.",
    ].join("\n");
    const out = sanitizeLeakedAgentProse(input);
    expect(out).toBe("Deliverable ready.");
  });

  it("keeps legitimate user-facing prose that mentions tools in natural language", () => {
    const input =
      "슬라이드 구성 계획:\n\n12장 구조\n\n커버 — 기업 AI 도입의 실질적 효과";
    expect(sanitizeLeakedAgentProse(input)).toBe(input);
  });

  it("routes stripLeakedPseudoToolXml through the shared sanitizer", () => {
    const input = "<info>TodoWrite called with 3 tasks</info>\n\n본문";
    expect(stripLeakedPseudoToolXml(input)).toBe("본문");
  });
});

describe("sanitizeChatMessageLeakedPseudoTool (expanded)", () => {
  it("strips od markup and info narration from persisted text events", () => {
    const message = {
      id: "m1",
      role: "assistant" as const,
      content: "<info>Marking task 1 as in_progress</info>",
      events: [
        { kind: "text" as const, text: "Plan\n<odTodoWrite>[{\"id\":\"1\"}]</odTodoWrite>" },
      ],
    };
    const sanitized = sanitizeChatMessageLeakedPseudoTool(message);
    expect(sanitized.content).toBe("");
    expect(sanitized.events?.[0]).toEqual({ kind: "text", text: "Plan\n" });
  });
});

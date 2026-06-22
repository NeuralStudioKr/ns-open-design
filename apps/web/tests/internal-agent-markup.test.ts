import { describe, expect, it } from "vitest";
import {
  sanitizeAssistantProseForDisplay,
  stripInternalOpenDesignMarkup,
  stripTrailingOpenInternalMarkup,
} from "../src/runtime/internalAgentMarkup";

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
});

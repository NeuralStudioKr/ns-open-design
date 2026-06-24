import { describe, expect, it } from "vitest";

import { stripLeakedPseudoToolXml } from "../src/utils/stripLeakedPseudoToolXml";

describe("stripLeakedPseudoToolXml (web)", () => {
  it("removes function_calls blocks from streamed text", () => {
    const input =
      'Hi\n<function_calls><invoke name="Write"></invoke></function_calls>\nBye';
    expect(stripLeakedPseudoToolXml(input)).toBe("Hi\n\nBye");
  });

  it("removes agent runtime info narration (TodoWrite progress)", () => {
    const input = [
      "<info>TodoWrite called with 9 tasks</info>",
      "",
      "슬라이드 구성 계획:",
      "",
      "<info>Marking task 1 as in_progress</info>",
      "<info>Marking task 1 as completed</info>",
    ].join("\n");
    const out = stripLeakedPseudoToolXml(input);
    expect(out).not.toContain("<info>");
    expect(out).not.toContain("TodoWrite called");
    expect(out).not.toContain("Marking task");
    expect(out).toContain("슬라이드 구성 계획:");
  });
});

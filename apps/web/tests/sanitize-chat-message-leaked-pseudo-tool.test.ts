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

  it("returns the same reference when nothing changed", () => {
    const message: ChatMessage = {
      id: "m2",
      role: "assistant",
      content: "Clean answer",
    };
    expect(sanitizeChatMessageLeakedPseudoTool(message)).toBe(message);
  });
});

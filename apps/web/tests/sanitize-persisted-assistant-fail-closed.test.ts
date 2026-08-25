import { describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/sanitizeChatMessageLeakedPseudoTool", () => ({
  sanitizeChatMessageLeakedPseudoTool: () => {
    throw new Error("sanitize boom");
  },
}));

import type { ChatMessage } from "../src/types";
import { sanitizePersistedAssistantChatMessage } from "../src/utils/sanitizePersistedAssistantChatMessage";

describe("sanitizePersistedAssistantChatMessage fail-closed", () => {
  it("keeps a short Hangul completion status when the sanitizer throws", () => {
    const settled: ChatMessage = {
      id: "m-fail-closed",
      role: "assistant",
      content: "슬라이드 작업이 완료되었습니다.",
      createdAt: 1,
      runStatus: "succeeded",
      events: [{ kind: "text", text: "html>WD · LECTURE dump" }],
    };
    const cleaned = sanitizePersistedAssistantChatMessage(settled);
    expect(cleaned.content).toBe("슬라이드 작업이 완료되었습니다.");
    expect(cleaned.events?.some((event) => event.kind === "text")).toBe(false);
  });

  it("wipes dump-only content when the sanitizer throws", () => {
    const settled: ChatMessage = {
      id: "m-fail-dump",
      role: "assistant",
      content: "html>WD · LECTURE dump</artifact>",
      createdAt: 1,
      runStatus: "succeeded",
      events: [{ kind: "text", text: "html>WD · LECTURE dump</artifact>" }],
    };
    const cleaned = sanitizePersistedAssistantChatMessage(settled);
    expect(cleaned.content).toBe("");
    expect(cleaned.events?.some((event) => event.kind === "text")).toBe(false);
  });
});

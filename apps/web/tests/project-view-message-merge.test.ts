import { describe, expect, it } from "vitest";

import { mergeServerMessagesIntoConversation } from "../src/components/ProjectView";
import type { ChatMessage } from "../src/types";

describe("mergeServerMessagesIntoConversation", () => {
  it("keeps local active runStatus when server row is stale", () => {
    const local: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "partial",
      createdAt: 1,
      runStatus: "running",
      runId: "run-1",
    };
    const server: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      createdAt: 1,
      runStatus: "not_started" as ChatMessage["runStatus"],
    };
    const merged = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged[0]?.runStatus).toBe("running");
  });
});

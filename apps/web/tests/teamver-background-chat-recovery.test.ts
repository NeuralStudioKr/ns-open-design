import { describe, expect, it } from "vitest";
import {
  conversationHasRecoverableBackgroundChat,
  findInFlightAssistantMessages,
  isInFlightAssistantMessage,
  isRecoverableBackgroundChatMessage,
  isRecoverableDaemonRunMessage,
  mergeByokBackgroundRunSummaries,
  syntheticByokRunsForTaskCenter,
} from "../src/teamver/backgroundChatRecovery";
import type { ChatMessage } from "../src/types";

describe("backgroundChatRecovery", () => {
  it("detects API-mode in-flight assistant rows by startedAt", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "partial",
      createdAt: 1,
      startedAt: 1,
    };
    expect(isInFlightAssistantMessage(message)).toBe(true);
    expect(findInFlightAssistantMessages([message])).toEqual([message]);
    expect(conversationHasRecoverableBackgroundChat([message], "api")).toBe(true);
    expect(isRecoverableBackgroundChatMessage(message, "api")).toBe(true);
    expect(isRecoverableBackgroundChatMessage(message, "daemon")).toBe(false);
  });

  it("only treats the latest assistant turn as API-mode in-flight", () => {
    const older: ChatMessage = {
      id: "a-old",
      role: "assistant",
      content: "done",
      createdAt: 1,
      startedAt: 1,
    };
    const latest: ChatMessage = {
      id: "a-new",
      role: "assistant",
      content: "working",
      createdAt: 2,
      startedAt: 2,
    };
    expect(findInFlightAssistantMessages([older, latest])).toEqual([latest]);
    expect(conversationHasRecoverableBackgroundChat([older, latest], "api")).toBe(true);
    expect(isInFlightAssistantMessage(older)).toBe(true);
  });

  it("still treats daemon active runStatus as recoverable", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      createdAt: 1,
      runId: "run-1",
      runStatus: "running",
    };
    expect(isRecoverableDaemonRunMessage(message)).toBe(true);
    expect(isRecoverableBackgroundChatMessage(message, "daemon")).toBe(true);
  });

  it("merges BYOK active projects into daemon summaries", () => {
    const merged = mergeByokBackgroundRunSummaries(
      [],
      new Map([
        [
          "p1",
          { conversationId: "c1", assistantMessageId: "a1" },
        ],
      ]),
      new Map([["p1", "Deck project"]]),
    );
    expect(merged).toEqual([
      {
        projectId: "p1",
        projectName: "Deck project",
        status: "running",
        count: 1,
        conversationId: "c1",
      },
    ]);
  });

  it("builds synthetic BYOK runs for the task center", () => {
    const runs = syntheticByokRunsForTaskCenter(
      new Map([
        [
          "p1",
          { conversationId: "c1", assistantMessageId: "a1" },
        ],
      ]),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]?.projectId).toBe("p1");
    expect(runs[0]?.conversationId).toBe("c1");
    expect(runs[0]?.status).toBe("running");
  });
});

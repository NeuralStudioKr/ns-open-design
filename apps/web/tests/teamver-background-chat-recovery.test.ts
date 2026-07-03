import { describe, expect, it } from "vitest";
import {
  conversationHasRecoverableBackgroundChat,
  findInFlightAssistantMessages,
  isInFlightAssistantMessage,
  isRecoverableBackgroundChatMessage,
  isRecoverableDaemonRunMessage,
  mergeByokBackgroundRunSummaries,
  reconcileByokBackgroundChatsAfterPoll,
  shouldFullReplayReattachedRun,
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

  it("skips full replay when a checkpoint or saved content exists", () => {
    expect(
      shouldFullReplayReattachedRun({
        id: "a1",
        role: "assistant",
        content: "",
        createdAt: 1,
        runId: "run-1",
        runStatus: "running",
      }),
    ).toBe(true);
    expect(
      shouldFullReplayReattachedRun({
        id: "a2",
        role: "assistant",
        content: "partial output",
        createdAt: 1,
        runId: "run-1",
        runStatus: "running",
      }),
    ).toBe(false);
    expect(
      shouldFullReplayReattachedRun({
        id: "a3",
        role: "assistant",
        content: "",
        createdAt: 1,
        runId: "run-1",
        runStatus: "running",
        lastRunEventId: "evt-42",
      }),
    ).toBe(false);
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

  it("keeps BYOK background tracking until proxy streams drain", () => {
    const byokActive = new Map([
      ["p1", { conversationId: "c1", assistantMessageId: "a1" }],
    ]);
    const idlePollCounts = new Map<string, number>();
    const streamsByProject = new Map([
      ["p1", [{ conversationId: "c1", assistantMessageId: "a1" }]],
    ]);
    expect(
      reconcileByokBackgroundChatsAfterPoll(byokActive, idlePollCounts, streamsByProject),
    ).toEqual([]);
    expect(byokActive.size).toBe(1);
    expect(idlePollCounts.size).toBe(0);
  });

  it("drops stale BYOK background tracking after idle proxy polls", () => {
    const byokActive = new Map([
      ["p1", { conversationId: "c1", assistantMessageId: "a1" }],
    ]);
    const idlePollCounts = new Map<string, number>();
    const streamsByProject = new Map<string, readonly { conversationId?: string; assistantMessageId?: string }[]>([
      ["p1", []],
    ]);
    expect(
      reconcileByokBackgroundChatsAfterPoll(byokActive, idlePollCounts, streamsByProject, 3),
    ).toEqual([]);
    expect(
      reconcileByokBackgroundChatsAfterPoll(byokActive, idlePollCounts, streamsByProject, 3),
    ).toEqual([]);
    expect(
      reconcileByokBackgroundChatsAfterPoll(byokActive, idlePollCounts, streamsByProject, 3),
    ).toEqual(["p1"]);
    expect(byokActive.size).toBe(0);
  });
});

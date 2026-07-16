import { describe, expect, it } from "vitest";
import {
  shouldForceFailStaleDaemonRun,
  shouldPollStaleDaemonRun,
  TEAMVER_STALE_RUN_FORCE_FAIL_MS,
  TEAMVER_STALE_RUN_RECONCILE_MS,
  terminalAssistantPatchFromRunStatus,
} from "../../src/teamver/backgroundChatRecovery";
import type { ChatMessage } from "../../src/types";

function assistant(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    role: "assistant",
    content: "",
    createdAt: Date.now() - TEAMVER_STALE_RUN_RECONCILE_MS - 1_000,
    startedAt: Date.now() - TEAMVER_STALE_RUN_RECONCILE_MS - 1_000,
    runId: "run-1",
    runStatus: "running",
    ...overrides,
  };
}

describe("backgroundChatRecovery stale run helpers", () => {
  it("starts polling once a daemon run exceeds the reconcile window", () => {
    expect(shouldPollStaleDaemonRun(assistant())).toBe(true);
    expect(
      shouldPollStaleDaemonRun(
        assistant({ startedAt: Date.now() - 60_000, createdAt: Date.now() - 60_000 }),
      ),
    ).toBe(false);
  });

  it("forces failure after the longer safety window", () => {
    const now = Date.now();
    expect(
      shouldForceFailStaleDaemonRun(
        assistant({
          startedAt: now - TEAMVER_STALE_RUN_FORCE_FAIL_MS - 1_000,
          createdAt: now - TEAMVER_STALE_RUN_FORCE_FAIL_MS - 1_000,
        }),
        now,
      ),
    ).toBe(true);
  });

  it("maps terminal daemon status into assistant message fields", () => {
    expect(
      terminalAssistantPatchFromRunStatus({
        id: "run-1",
        projectId: "proj-1",
        conversationId: "conv-1",
        assistantMessageId: "msg-1",
        agentId: "amr",
        status: "failed",
        createdAt: 1,
        updatedAt: 2,
        errorCode: "AGENT_EXECUTION_FAILED",
        resumable: true,
      }),
    ).toMatchObject({
      runStatus: "failed",
      endedAt: 2,
      errorCode: "AGENT_EXECUTION_FAILED",
      resumable: true,
    });
  });
});

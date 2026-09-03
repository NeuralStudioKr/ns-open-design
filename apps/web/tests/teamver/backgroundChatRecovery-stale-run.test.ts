import { describe, expect, it } from "vitest";
import {
  API_RUN_STALLED_ERROR_CODE,
  applyTerminalRunStatusToAssistant,
  patchStaleApiAssistantFailure,
  shouldForceFailStaleApiRun,
  shouldForceFailStaleDaemonRun,
  shouldPollStaleApiRun,
  shouldPollStaleDaemonRun,
  TEAMVER_STALE_API_RUN_FORCE_FAIL_MS,
  TEAMVER_STALE_API_RUN_RECONCILE_MS,
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

  it("polls and forces failure for stale API-mode assistant rows without runId", () => {
    // Loop411 — force-fail stays above deck SSE idle (10m).
    expect(TEAMVER_STALE_API_RUN_RECONCILE_MS).toBe(10 * 60 * 1000);
    expect(TEAMVER_STALE_API_RUN_FORCE_FAIL_MS).toBe(11 * 60 * 1000);
    const now = Date.now();
    const apiAssistant = assistant({
      runId: undefined,
      startedAt: now - TEAMVER_STALE_API_RUN_RECONCILE_MS - 1_000,
      createdAt: now - TEAMVER_STALE_API_RUN_RECONCILE_MS - 1_000,
    });
    expect(shouldPollStaleApiRun(apiAssistant, now)).toBe(true);
    expect(shouldForceFailStaleApiRun(apiAssistant, now)).toBe(false);
    expect(
      shouldForceFailStaleApiRun(
        {
          ...apiAssistant,
          startedAt: now - TEAMVER_STALE_API_RUN_FORCE_FAIL_MS - 1_000,
          createdAt: now - TEAMVER_STALE_API_RUN_FORCE_FAIL_MS - 1_000,
        },
        now,
      ),
    ).toBe(true);
  });

  it("patches abandoned API assistant rows with a stalled failure", () => {
    const patched = patchStaleApiAssistantFailure(assistant({ runId: undefined }), "stalled");
    expect(patched.runStatus).toBe("failed");
    expect(patched.endedAt).toBeTypeOf("number");
    expect(patched.events?.some((event) => event.kind === "status" && event.code === API_RUN_STALLED_ERROR_CODE)).toBe(true);
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
      resumable: true,
    });
  });

  it("applies terminal status without wiping prior assistant events", () => {
    const prev = assistant({
      events: [
        { kind: "text", text: "partial" },
        { kind: "tool_use", id: "t1", name: "Write", input: {} },
      ],
    });
    const next = applyTerminalRunStatusToAssistant(prev, {
      id: "run-1",
      projectId: "proj-1",
      conversationId: "conv-1",
      assistantMessageId: prev.id,
      agentId: "amr",
      status: "failed",
      createdAt: 1,
      updatedAt: 2,
      error: "요청을 처리하지 못했습니다.",
      errorCode: "BAD_REQUEST",
      resumable: true,
    });
    expect(next.runStatus).toBe("failed");
    expect(next.events).toEqual([
      { kind: "text", text: "partial" },
      { kind: "tool_use", id: "t1", name: "Write", input: {} },
      {
        kind: "status",
        label: "error",
        detail: "요청을 처리하지 못했습니다.",
        code: "BAD_REQUEST",
      },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../src/types";
import {
  collapseEmptyAssistantShellsBeforeSuccessor,
  dedupeAssistantMessagesByRunId,
  dedupeConversationAssistantRows,
  isEmptyAssistantShell,
  patchInFlightAssistantForActiveRun,
} from "../../src/runtime/conversation-message-dedupe";

describe("isEmptyAssistantShell", () => {
  it("treats header-only assistant rows as empty shells", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 100,
    };
    expect(isEmptyAssistantShell(message)).toBe(true);
  });

  it("does not treat in-flight rows with events as shells", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      runStatus: "running",
      events: [{ kind: "text", text: "hello" }],
    };
    expect(isEmptyAssistantShell(message)).toBe(false);
  });
});

describe("dedupeAssistantMessagesByRunId", () => {
  it("keeps the richer assistant row when two share a run id", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "hi", createdAt: 1 };
    const empty: ChatMessage = {
      id: "a-empty",
      role: "assistant",
      content: "",
      runId: "run-1",
      runStatus: "running",
      createdAt: 2,
    };
    const live: ChatMessage = {
      id: "a-live",
      role: "assistant",
      content: "drafting",
      runId: "run-1",
      runStatus: "running",
      createdAt: 3,
    };
    const deduped = dedupeAssistantMessagesByRunId([user, empty, live]);
    expect(deduped.map((m) => m.id)).toEqual(["u1", "a-live"]);
  });
});

describe("collapseEmptyAssistantShellsBeforeSuccessor", () => {
  it("drops a header-only assistant before a richer successor on the same turn", () => {
    const user: ChatMessage = {
      id: "u1",
      role: "user",
      content: "슬라이드 수정",
      createdAt: 1,
    };
    const shell: ChatMessage = {
      id: "a-shell",
      role: "assistant",
      content: "",
      createdAt: 2,
    };
    const active: ChatMessage = {
      id: "a-live",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 3,
      createdAt: 3,
      events: [{ kind: "text", text: "<artifact type=\"deck\">" }],
    };
    const collapsed = collapseEmptyAssistantShellsBeforeSuccessor([user, shell, active]);
    expect(collapsed.map((m) => m.id)).toEqual(["u1", "a-live"]);
  });
});

describe("patchInFlightAssistantForActiveRun", () => {
  it("pins run metadata onto an optimistic row instead of adding a duplicate stub", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "make slides", createdAt: 1 };
    const optimistic: ChatMessage = {
      id: "client-a",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 2,
      createdAt: 2,
    };
    const patched = patchInFlightAssistantForActiveRun([user, optimistic], {
      id: "run-1",
      assistantMessageId: "daemon-a",
      status: "running",
      createdAt: 2,
    }, [{
      id: "run-1",
      assistantMessageId: "daemon-a",
      status: "running",
      createdAt: 2,
    }]);
    expect(patched).toEqual([
      user,
      {
        ...optimistic,
        runId: "run-1",
      },
    ]);
  });

  it("does not patch when multiple active runs are present", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "hi", createdAt: 1 };
    const optimistic: ChatMessage = {
      id: "client-a",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 2,
      createdAt: 2,
    };
    const patched = patchInFlightAssistantForActiveRun([user, optimistic], {
      id: "run-2",
      assistantMessageId: "daemon-b",
      status: "running",
      createdAt: 5,
    }, [
      { id: "run-1", assistantMessageId: "daemon-a", status: "running", createdAt: 2 },
      { id: "run-2", assistantMessageId: "daemon-b", status: "running", createdAt: 5 },
    ]);
    expect(patched).toBeNull();
  });
});

describe("dedupeConversationAssistantRows", () => {
  it("applies run-id dedupe and shell collapse together", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "edit deck", createdAt: 1 };
    const shell: ChatMessage = {
      id: "a-shell",
      role: "assistant",
      content: "",
      runId: "run-1",
      createdAt: 2,
    };
    const live: ChatMessage = {
      id: "a-live",
      role: "assistant",
      content: "working",
      runId: "run-1",
      runStatus: "running",
      createdAt: 3,
    };
    expect(dedupeConversationAssistantRows([user, shell, live]).map((m) => m.id)).toEqual([
      "u1",
      "a-live",
    ]);
  });
});

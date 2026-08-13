import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../src/types";
import { AUTO_CONTINUE_PROMPT_SENTINEL } from "../../src/runtime/resume";
import {
  collapseEmptyAssistantShellsBeforeSuccessor,
  DELIVERABLE_LIFECYCLE_STATUS_CODES,
  dedupeAssistantMessagesByRunId,
  dedupeConversationAssistantRows,
  isCollapsibleAssistantStub,
  isEmptyAssistantShell,
  isThinkingOnlyAssistantStub,
  patchInFlightAssistantForActiveRun,
  resolveLastAssistantMessageId,
  resolveLastAssistantMessageIndex,
  resolveLastSubstantiveAssistantMessageId,
} from "../../src/runtime/conversation-message-dedupe";

describe("DELIVERABLE_LIFECYCLE_STATUS_CODES", () => {
  it("initializes without circular TDZ", () => {
    expect(DELIVERABLE_LIFECYCLE_STATUS_CODES.has("outline_deck_fallback")).toBe(true);
    expect(DELIVERABLE_LIFECYCLE_STATUS_CODES.has("emergency_deck_fallback")).toBe(true);
    expect(DELIVERABLE_LIFECYCLE_STATUS_CODES.has("auto_continue_incomplete_output")).toBe(true);
  });
});

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

  it("treats requesting/initializing status-only rows as empty shells", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 2,
      events: [{ kind: "status", label: "requesting", detail: "claude" }],
    };
    expect(isEmptyAssistantShell(message)).toBe(true);
  });

  it("does not treat thinking-only rows as global empty shells (OD shows ThinkingBlock)", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 2,
      events: [{ kind: "thinking", text: "planning…" }],
    };
    expect(isEmptyAssistantShell(message)).toBe(false);
    expect(isThinkingOnlyAssistantStub(message)).toBe(true);
    expect(isCollapsibleAssistantStub(message)).toBe(true);
  });

  it("does not treat in-flight rows with text events as shells", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      runStatus: "running",
      events: [{ kind: "text", text: "hello" }],
    };
    expect(isEmptyAssistantShell(message)).toBe(false);
  });

  it("does not treat error status rows as shells", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      runStatus: "failed",
      events: [{ kind: "status", label: "error", detail: "boom" }],
    };
    expect(isEmptyAssistantShell(message)).toBe(false);
  });

  it("treats transient auto-continue / emergency-fallback status events as header-only noise", () => {
    // User report 2026-08-13: succeeded rows that were auto-continued (or
    // salvaged via emergency deck fallback) still carry a preserved
    // status:error event with the transient code. Without this rule the row
    // was NOT recognized as an empty shell, `isTerminalSucceededEmptyShellForDisplay`
    // returned false, and the Teamver completion lead / row entirely
    // disappeared after page re-entry when `producedFiles` was wiped.
    const autoContinued: ChatMessage = {
      id: "a-auto-continue",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 100,
      events: [
        { kind: "status", label: "requesting" },
        {
          kind: "status",
          label: "error",
          detail: "auto-continued after incomplete_output",
          code: "auto_continue_incomplete_output",
        },
      ],
    } as ChatMessage;
    expect(isEmptyAssistantShell(autoContinued)).toBe(true);

    const emergencySalvaged: ChatMessage = {
      id: "a-emergency",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 100,
      events: [
        {
          kind: "status",
          label: "warning",
          detail: "emergency deck fallback",
          code: "emergency_deck_fallback",
        },
      ],
    } as ChatMessage;
    expect(isEmptyAssistantShell(emergencySalvaged)).toBe(true);

    // A generic `status:error` without the transient code must still block
    // empty-shell detection (that path anchors the durable error card).
    const genericFailure: ChatMessage = {
      id: "a-fatal",
      role: "assistant",
      content: "",
      runStatus: "failed",
      endedAt: 100,
      events: [{ kind: "status", label: "error", detail: "boom", code: "incomplete_output" }],
    } as ChatMessage;
    expect(isEmptyAssistantShell(genericFailure)).toBe(false);
  });

  it("treats stale incomplete_output on succeeded rows as header-only noise", () => {
    const succeededWithStaleIncomplete: ChatMessage = {
      id: "a-succeeded-stale",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 100,
      events: [
        { kind: "status", label: "requesting" },
        {
          kind: "status",
          label: "error",
          detail: "truncated deliverable",
          code: "incomplete_output",
        },
        {
          kind: "status",
          label: "error",
          detail: "auto-continued",
          code: "auto_continue_incomplete_output",
        },
      ],
    } as ChatMessage;
    expect(isEmptyAssistantShell(succeededWithStaleIncomplete)).toBe(true);
  });

  it("treats runtime model status events as header-only noise", () => {
    const message: ChatMessage = {
      id: "a-model-status",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 100,
      events: [
        { kind: "status", label: "requesting" },
        { kind: "status", label: "model", detail: "claude-sonnet-4-5" },
      ],
    } as ChatMessage;
    expect(isEmptyAssistantShell(message)).toBe(true);
  });

  it("does not treat canceled or resumable empty rows as shells", () => {
    expect(
      isEmptyAssistantShell({
        id: "a-canceled",
        role: "assistant",
        content: "",
        runStatus: "canceled",
        endedAt: 2,
      }),
    ).toBe(false);
    expect(
      isEmptyAssistantShell({
        id: "a-resumable",
        role: "assistant",
        content: "",
        runStatus: "failed",
        endedAt: 2,
        resumable: true,
      }),
    ).toBe(false);
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

  it("keeps terminal produced-file rows over stale in-flight duplicates", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "make deck", createdAt: 1 };
    const staleRunning: ChatMessage = {
      id: "a-local",
      role: "assistant",
      content: "",
      runId: "run-1",
      runStatus: "running",
      startedAt: 2,
      createdAt: 2,
    };
    const completed: ChatMessage = {
      id: "a-server",
      role: "assistant",
      content: "",
      runId: "run-1",
      runStatus: "succeeded",
      endedAt: 10,
      createdAt: 3,
      producedFiles: [{
        name: "deck.html",
        path: "deck.html",
        mime: "text/html",
        size: 1024,
        mtime: 10,
        kind: "html",
      }],
    };

    const deduped = dedupeAssistantMessagesByRunId([user, staleRunning, completed]);

    expect(deduped.map((m) => m.id)).toEqual(["u1", "a-server"]);
    expect(deduped.at(-1)?.runStatus).toBe("succeeded");
    expect(deduped.at(-1)?.producedFiles?.[0]?.name).toBe("deck.html");
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

  it("drops an empty shell that arrives after a richer assistant", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "hi", createdAt: 1 };
    const live: ChatMessage = {
      id: "a-live",
      role: "assistant",
      content: "done",
      runStatus: "succeeded",
      endedAt: 3,
      createdAt: 2,
    };
    const shell: ChatMessage = {
      id: "a-shell",
      role: "assistant",
      content: "",
      createdAt: 4,
      events: [{ kind: "status", label: "requesting", detail: "model" }],
    };
    expect(
      collapseEmptyAssistantShellsBeforeSuccessor([user, live, shell]).map((m) => m.id),
    ).toEqual(["u1", "a-live"]);
  });

  it("collapses empty shells across a hidden auto-continue user prompt", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "make slides", createdAt: 1 };
    const shell: ChatMessage = {
      id: "a-shell",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      createdAt: 2,
      events: [{ kind: "status", label: "requesting", detail: "model" }],
    };
    const autoContinueUser: ChatMessage = {
      id: "u-auto",
      role: "user",
      content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\n이어쓰기`,
      createdAt: 3,
    };
    const live: ChatMessage = {
      id: "a-live",
      role: "assistant",
      content: "deck ready",
      runStatus: "succeeded",
      endedAt: 4,
      createdAt: 4,
    };
    expect(
      collapseEmptyAssistantShellsBeforeSuccessor([
        user,
        shell,
        autoContinueUser,
        live,
      ]).map((m) => m.id),
    ).toEqual(["u1", "u-auto", "a-live"]);
  });

  it("keeps a single empty shell when it is the only assistant on the turn", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "hi", createdAt: 1 };
    const shell: ChatMessage = {
      id: "a-shell",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 2,
      createdAt: 2,
      events: [{ kind: "status", label: "requesting" }],
    };
    expect(
      collapseEmptyAssistantShellsBeforeSuccessor([user, shell]).map((m) => m.id),
    ).toEqual(["u1", "a-shell"]);
  });

  it("keeps the in-flight retry shell beside a preserved failed attempt", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "retry me", createdAt: 1 };
    const failed: ChatMessage = {
      id: "a-failed",
      role: "assistant",
      content: "",
      runStatus: "failed",
      endedAt: 3,
      createdAt: 2,
      events: [{ kind: "status", label: "error", detail: "boom" }],
    };
    const retryShell: ChatMessage = {
      id: "a-retry",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 4,
      createdAt: 4,
      events: [{ kind: "status", label: "requesting", detail: "model" }],
    };
    expect(
      collapseEmptyAssistantShellsBeforeSuccessor([user, failed, retryShell]).map((m) => m.id),
    ).toEqual(["u1", "a-failed", "a-retry"]);
  });

  it("still drops a noise-only shell when a richer in-flight sibling exists", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "hi", createdAt: 1 };
    const shell: ChatMessage = {
      id: "a-shell",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 2,
      createdAt: 2,
      events: [{ kind: "status", label: "starting" }],
    };
    const live: ChatMessage = {
      id: "a-live",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 3,
      createdAt: 3,
      events: [{ kind: "text", text: "drafting" }],
    };
    expect(
      collapseEmptyAssistantShellsBeforeSuccessor([user, shell, live]).map((m) => m.id),
    ).toEqual(["u1", "a-live"]);
  });

  it("collapses a thinking-only stub beside a richer reply", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "hi", createdAt: 1 };
    const thinkingStub: ChatMessage = {
      id: "a-think",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      createdAt: 2,
      events: [{ kind: "thinking", text: "planning…" }],
    };
    const live: ChatMessage = {
      id: "a-live",
      role: "assistant",
      content: "done",
      runStatus: "succeeded",
      endedAt: 3,
      createdAt: 3,
    };
    expect(
      collapseEmptyAssistantShellsBeforeSuccessor([user, thinkingStub, live]).map((m) => m.id),
    ).toEqual(["u1", "a-live"]);
  });

  it("keeps a lone thinking-only stub so OD can render ThinkingBlock", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "hi", createdAt: 1 };
    const thinkingStub: ChatMessage = {
      id: "a-think",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      createdAt: 2,
      events: [{ kind: "thinking", text: "planning…" }],
    };
    expect(
      collapseEmptyAssistantShellsBeforeSuccessor([user, thinkingStub]).map((m) => m.id),
    ).toEqual(["u1", "a-think"]);
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

  it("does not patch when another active run is present without a run id", () => {
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
      { assistantMessageId: "daemon-a", status: "running", createdAt: 2 },
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

  it("keeps a terminal succeeded empty shell after a failed auto-continue attempt", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "make deck", createdAt: 1 };
    const failed: ChatMessage = {
      id: "a-failed",
      role: "assistant",
      content: "",
      runStatus: "failed",
      resumable: true,
      endedAt: 2,
      createdAt: 2,
      events: [{ kind: "status", label: "error", detail: "incomplete", code: "incomplete_output" }],
    };
    const autoUser: ChatMessage = {
      id: "u-auto",
      role: "user",
      content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue`,
      createdAt: 3,
    };
    const succeededShell: ChatMessage = {
      id: "a-succeeded",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 4,
      createdAt: 4,
      events: [{ kind: "status", label: "requesting" }],
    };
    const messages = [user, failed, autoUser, succeededShell];
    expect(collapseEmptyAssistantShellsBeforeSuccessor(messages).map((m) => m.id)).toEqual([
      "u1",
      "a-failed",
      "u-auto",
      "a-succeeded",
    ]);
    expect(dedupeConversationAssistantRows(messages).map((m) => m.id)).toEqual([
      "u1",
      "a-failed",
      "u-auto",
      "a-succeeded",
    ]);
  });
});

describe("resolveLastAssistantMessageId", () => {
  it("prefers the newest non-empty assistant over a trailing empty shell", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "hi", createdAt: 1 },
      {
        id: "a-live",
        role: "assistant",
        content: "done",
        runStatus: "succeeded",
        endedAt: 2,
        createdAt: 2,
      },
      {
        id: "a-shell",
        role: "assistant",
        content: "",
        createdAt: 3,
        events: [{ kind: "status", label: "requesting" }],
      },
    ];
    expect(resolveLastAssistantMessageId(messages)).toBe("a-live");
    expect(resolveLastAssistantMessageIndex(messages)).toBe(1);
  });

  it("falls back to an empty shell when it is the only assistant", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "hi", createdAt: 1 },
      {
        id: "a-shell",
        role: "assistant",
        content: "",
        runStatus: "running",
        startedAt: 2,
        createdAt: 2,
      },
    ];
    expect(resolveLastAssistantMessageId(messages)).toBe("a-shell");
  });

  it("prefers a trailing succeeded empty shell over an earlier error-only failure", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "make deck", createdAt: 1 },
      {
        id: "a-failed",
        role: "assistant",
        content: "",
        runStatus: "failed",
        resumable: true,
        endedAt: 2,
        createdAt: 2,
        events: [
          { kind: "status", label: "error", detail: "incomplete", code: "incomplete_output" },
        ],
      },
      {
        id: "a-succeeded",
        role: "assistant",
        content: "",
        runStatus: "succeeded",
        endedAt: 3,
        createdAt: 3,
        events: [{ kind: "status", label: "requesting" }],
      },
    ];
    expect(resolveLastAssistantMessageId(messages)).toBe("a-succeeded");
  });

  it("prefers a fresh in-flight empty shell over a prior completed assistant", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "first", createdAt: 1 },
      {
        id: "a1",
        role: "assistant",
        content: "done",
        runStatus: "succeeded",
        endedAt: 2,
        createdAt: 2,
      },
      { id: "u2", role: "user", content: "second", createdAt: 3 },
      {
        id: "a2",
        role: "assistant",
        content: "",
        runStatus: "running",
        startedAt: 4,
        createdAt: 4,
        events: [{ kind: "status", label: "requesting" }],
      },
    ];
    expect(resolveLastAssistantMessageId(messages)).toBe("a2");
    expect(resolveLastAssistantMessageIndex(messages)).toBe(3);
  });
});

describe("resolveLastSubstantiveAssistantMessageId", () => {
  it("skips an in-flight empty shell so recovery can see the failed incomplete row", () => {
    const messages: ChatMessage[] = [
      {
        id: "a-failed",
        role: "assistant",
        content: "",
        runStatus: "failed",
        resumable: true,
        endedAt: 1,
        createdAt: 1,
        events: [{ kind: "status", label: "error", detail: "x", code: "incomplete_output" }],
      },
      {
        id: "a-shell",
        role: "assistant",
        content: "",
        runStatus: "running",
        startedAt: 2,
        createdAt: 2,
        events: [{ kind: "status", label: "requesting" }],
      },
    ];
    expect(resolveLastAssistantMessageId(messages)).toBe("a-shell");
    expect(resolveLastSubstantiveAssistantMessageId(messages)).toBe("a-failed");
  });

  it("still prefers a substantive in-flight assistant over a prior failure", () => {
    const messages: ChatMessage[] = [
      {
        id: "a-failed",
        role: "assistant",
        content: "",
        runStatus: "failed",
        resumable: true,
        endedAt: 1,
        createdAt: 1,
        events: [{ kind: "status", label: "error", detail: "x", code: "incomplete_output" }],
      },
      {
        id: "a-live",
        role: "assistant",
        content: "",
        runStatus: "running",
        startedAt: 2,
        createdAt: 2,
        events: [{ kind: "text", text: "retrying" }],
      },
    ];
    expect(resolveLastSubstantiveAssistantMessageId(messages)).toBe("a-live");
  });
});

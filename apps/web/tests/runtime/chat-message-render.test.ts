import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../src/types";
import { AUTO_CONTINUE_PROMPT_SENTINEL } from "../../src/runtime/resume";
import {
  hasEmbedVisibleAssistantBody,
  shouldIncludeMessageInChatRender,
  shouldOmitMessageFromChatRender,
  shouldOmitSupersededAutoContinueFailure,
} from "../../src/runtime/chat-message-render";
import { resolveLastAssistantMessageId } from "../../src/runtime/conversation-message-dedupe";
import { buildChatRenderItems } from "../../src/components/ChatPane";

const embedCtx = {
  streaming: false,
  lastAssistantId: undefined as string | undefined,
  hideAssistantThinkingDetails: true,
};

describe("chat-message-render", () => {
  it("omits sanitized slide-count top-up leftovers on user and assistant rows", () => {
    const leftover = [
      "The",
      "The",
      "Keep",
      "APPEND",
      "This is an explicit slide-count expansion — not a redesign and not an incomplete-output retry.",
      "Do NOT rewrite the saved deck. Do NOT emit ``, Motif ``, or copy existing slides.",
      "Emit ONLY the new `",
    ].join("\n");
    expect(shouldOmitMessageFromChatRender({
      id: "u-topup",
      role: "user",
      content: leftover,
    }, embedCtx)).toBe(true);
    expect(shouldOmitMessageFromChatRender({
      id: "a-topup",
      role: "assistant",
      content: leftover,
    }, embedCtx)).toBe(true);
  });

  it("omits auto-continue user prompts", () => {
    const message: ChatMessage = {
      id: "u-auto",
      role: "user",
      content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue`,
    };
    expect(shouldOmitMessageFromChatRender(message, embedCtx)).toBe(true);
  });

  it("keeps terminal succeeded empty shells when called without turn context", () => {
    const shell: ChatMessage = {
      id: "a-shell",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      events: [{ kind: "status", label: "requesting" }],
    };
    // Reload paths may filter a single row before turn index is wired — still
    // reserve the completion lead instead of dropping the whole assistant row.
    expect(shouldOmitMessageFromChatRender(shell, embedCtx)).toBe(false);
    expect(hasEmbedVisibleAssistantBody(shell)).toBe(true);
  });

  it("keeps a turn-anchored succeeded empty shell for completion lead", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "make deck", createdAt: 1 };
    const shell: ChatMessage = {
      id: "a-shell",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      createdAt: 2,
      events: [{ kind: "status", label: "requesting" }],
    };
    expect(
      shouldOmitMessageFromChatRender(shell, embedCtx, {
        messages: [user, shell],
        messageIndex: 1,
      }),
    ).toBe(false);
  });

  it("keeps a live streaming empty shell", () => {
    const shell: ChatMessage = {
      id: "a-live",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 1,
    };
    expect(
      shouldIncludeMessageInChatRender(shell, {
        ...embedCtx,
        streaming: true,
        lastAssistantId: "a-live",
      }),
    ).toBe(true);
  });

  it("omits embed Bash-only tool rows without visible body", () => {
    const message: ChatMessage = {
      id: "a-bash",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      events: [
        { kind: "tool_use", id: "tu-1", name: "Bash", input: { command: "ls" } },
        { kind: "tool_result", toolUseId: "tu-1", content: "ok" },
      ],
    } as ChatMessage;
    expect(shouldOmitMessageFromChatRender(message, embedCtx)).toBe(true);
  });

  it("omits embed thinking+Bash rows so no phantom empty slot remains", () => {
    const message: ChatMessage = {
      id: "a-think",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      events: [
        { kind: "thinking", text: "planning…" },
        { kind: "tool_use", id: "tu-1", name: "Bash", input: { command: "ls" } },
        { kind: "tool_result", toolUseId: "tu-1", content: "ok" },
      ],
    } as ChatMessage;
    expect(hasEmbedVisibleAssistantBody(message)).toBe(false);
    expect(shouldOmitMessageFromChatRender(message, embedCtx)).toBe(true);
  });

  it("omits thinking-only rows in Teamver embed but keeps them in OD", () => {
    const message: ChatMessage = {
      id: "a-think",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      events: [{ kind: "thinking", text: "planning…" }],
    };
    expect(shouldOmitMessageFromChatRender(message, embedCtx)).toBe(true);
    expect(
      shouldOmitMessageFromChatRender(message, {
        ...embedCtx,
        hideAssistantThinkingDetails: false,
      }),
    ).toBe(false);
  });

  it("keeps canceled empty shells visible after Stop before first token", () => {
    const canceled: ChatMessage = {
      id: "a-canceled",
      role: "assistant",
      content: "",
      runStatus: "canceled",
      startedAt: 1,
      endedAt: 2,
    };
    expect(shouldOmitMessageFromChatRender(canceled, embedCtx)).toBe(false);
  });

  it("keeps artifact-only succeeded deck-patch turns visible in embed virtualization", () => {
    const message: ChatMessage = {
      id: "a-deck-patch",
      role: "assistant",
      content: '<artifact type="deck-patch" identifier="deck"></artifact>',
      runStatus: "succeeded",
      endedAt: 2,
    };
    expect(hasEmbedVisibleAssistantBody(message)).toBe(true);
    expect(shouldOmitMessageFromChatRender(message, embedCtx)).toBe(false);
  });

  it("keeps completion-lead visibility after reload when a preserved auto-continue error survives on a succeeded shell", () => {
    // User report 2026-08-13: after auto-continue, the succeeded assistant row
    // still carries a transient `status: error` code (`auto_continue_incomplete_output`
    // or `emergency_deck_fallback`). Persist sanitizer had already stripped
    // the closed artifact from `content`, and a later shell PUT wiped
    // `producedFiles`. Because the transient error event was not treated as
    // "header-only noise", `isEmptyAssistantShell` returned false, the
    // completion lead was never synthesized, and `AssistantMessage`
    // early-returned null on Teamver embed — the whole assistant row
    // disappeared on page re-entry.
    const user: ChatMessage = { id: "u1", role: "user", content: "make deck", createdAt: 1 };
    const message: ChatMessage = {
      id: "a-auto-continue-survivor",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 200,
      startedAt: 100,
      createdAt: 100,
      events: [
        { kind: "status", label: "requesting" },
        {
          kind: "status",
          label: "error",
          detail: "auto-continued after truncated deliverable",
          code: "auto_continue_incomplete_output",
        },
      ],
    } as ChatMessage;
    expect(hasEmbedVisibleAssistantBody(message)).toBe(true);
    expect(
      shouldOmitMessageFromChatRender(message, embedCtx, {
        messages: [user, message],
        messageIndex: 1,
      }),
    ).toBe(false);

    const emergencyMessage: ChatMessage = {
      ...message,
      id: "a-emergency-salvage",
      events: [
        { kind: "status", label: "requesting" },
        {
          kind: "status",
          label: "warning",
          detail: "emergency deck fallback",
          code: "emergency_deck_fallback",
        },
      ],
    };
    expect(hasEmbedVisibleAssistantBody(emergencyMessage)).toBe(true);
    expect(
      shouldOmitMessageFromChatRender(emergencyMessage, embedCtx, {
        messages: [user, emergencyMessage],
        messageIndex: 1,
      }),
    ).toBe(false);
  });

  it("keeps completion-lead visibility when slideTurnKind survives reload without producedFiles", () => {
    const message: ChatMessage = {
      id: "a-create-label",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      slideTurnKind: "create",
      events: [
        { kind: "status", label: "requesting" },
        { kind: "status", label: "model", detail: "claude-sonnet-4-5" },
      ],
    } as ChatMessage;
    expect(hasEmbedVisibleAssistantBody(message)).toBe(true);
    expect(shouldOmitMessageFromChatRender(message, embedCtx)).toBe(false);
  });

  it("keeps completion-lead visibility after reload when artifact tags were stripped", () => {
    const message: ChatMessage = {
      id: "a-reload",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      producedFiles: [
        {
          name: "deck.html",
          path: "deck.html",
          size: 100,
          mtime: 2,
          kind: "html",
          mime: "text/html",
        },
      ],
      preTurnFileNames: ["deck.html"],
      events: [{ kind: "status", label: "requesting" }],
    };
    expect(hasEmbedVisibleAssistantBody(message)).toBe(true);
    expect(shouldOmitMessageFromChatRender(message, embedCtx)).toBe(false);
  });

  it("keeps embed Write rows that surface file ops", () => {
    const message: ChatMessage = {
      id: "a-write",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      events: [
        { kind: "tool_use", id: "tu-1", name: "Write", input: { path: "deck.html" } },
        { kind: "tool_result", toolUseId: "tu-1", content: "ok" },
      ],
    } as ChatMessage;
    expect(hasEmbedVisibleAssistantBody(message)).toBe(true);
    expect(shouldOmitMessageFromChatRender(message, embedCtx)).toBe(false);
  });

  it("keeps failed assistants for error cards", () => {
    const message: ChatMessage = {
      id: "a-fail",
      role: "assistant",
      content: "",
      runStatus: "failed",
      endedAt: 2,
      events: [{ kind: "status", label: "error", detail: "boom" }],
    };
    expect(shouldOmitMessageFromChatRender(message, embedCtx)).toBe(false);
  });

  it("omits superseded auto-continue failures that only leave an agent header", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "edit slide", createdAt: 1 };
    const hiddenAutoContinueUser: ChatMessage = {
      id: "u-auto",
      role: "user",
      content: "<!--od:auto_continue_incomplete_output-->\ncontinue",
      createdAt: 2,
    };
    const firstFailed: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      agentName: "Anthropic API",
      runStatus: "failed",
      endedAt: 3,
      createdAt: 3,
      events: [
        { kind: "status", label: "error", detail: "recovering", code: "auto_continue_incomplete_output" },
      ],
    };
    const secondFailed: ChatMessage = {
      id: "a2",
      role: "assistant",
      content: "",
      agentName: "Anthropic API",
      runStatus: "failed",
      endedAt: 4,
      createdAt: 4,
      events: [{ kind: "status", label: "error", detail: "still broken", code: "incomplete_output" }],
    };
    const messages = [user, firstFailed, hiddenAutoContinueUser, secondFailed];
    expect(shouldOmitSupersededAutoContinueFailure(messages, 1)).toBe(true);
    expect(shouldOmitSupersededAutoContinueFailure(messages, 3)).toBe(false);
    const items = buildChatRenderItems(messages, {
      ...embedCtx,
      lastAssistantId: "a2",
    });
    expect(items.map((item) => item.message.id)).toEqual(["u1", "a2"]);
  });

  it("does not drop every assistant row when auto-continue ends in a sanitized empty shell", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "make deck", createdAt: 1 };
    const failed: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      runStatus: "failed",
      resumable: true,
      endedAt: 2,
      createdAt: 2,
      events: [
        { kind: "status", label: "error", detail: "incomplete", code: "incomplete_output" },
      ],
    };
    const autoUser: ChatMessage = {
      id: "u-auto",
      role: "user",
      content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue`,
      createdAt: 3,
    };
    const succeededShell: ChatMessage = {
      id: "a2",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 4,
      createdAt: 4,
      events: [{ kind: "status", label: "requesting" }],
    };
    const messages = [user, failed, autoUser, succeededShell];
    expect(shouldOmitSupersededAutoContinueFailure(messages, 1, embedCtx)).toBe(true);
    const items = buildChatRenderItems(messages, {
      ...embedCtx,
      lastAssistantId: "a2",
    });
    expect(items.map((item) => item.message.id)).toEqual(["u1", "a2"]);
    expect(hasEmbedVisibleAssistantBody(succeededShell)).toBe(true);
  });

  it("keeps a terminal succeeded empty shell as the last assistant anchor after reload", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "make deck", createdAt: 1 };
    const succeededShell: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      createdAt: 2,
      events: [{ kind: "status", label: "requesting" }],
    };
    const items = buildChatRenderItems([user, succeededShell], embedCtx);
    expect(items.map((item) => item.message.id)).toEqual(["u1", "a1"]);
  });

  it("keeps superseded failed attempts that still have visible prose", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "edit slide", createdAt: 1 };
    const firstFailed: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "partial deck draft",
      runStatus: "failed",
      endedAt: 2,
      createdAt: 2,
    };
    const retry: ChatMessage = {
      id: "a2",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 3,
      createdAt: 3,
    };
    const messages = [user, firstFailed, retry];
    expect(shouldOmitSupersededAutoContinueFailure(messages, 1)).toBe(false);
  });

  it("buildChatRenderItems drops omitted rows before virtualization count", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "hi", createdAt: 1 };
    const shell: ChatMessage = {
      id: "a-shell",
      role: "assistant",
      content: "",
      createdAt: 2,
      endedAt: 2,
      runStatus: "succeeded",
    };
    const live: ChatMessage = {
      id: "a-live",
      role: "assistant",
      content: "done",
      createdAt: 3,
      endedAt: 3,
      runStatus: "succeeded",
    };
    const items = buildChatRenderItems([user, shell, live], {
      ...embedCtx,
      lastAssistantId: "a-live",
    });
    expect(items.map((item) => item.message.id)).toEqual(["u1", "a-live"]);
  });

  it("keeps a multi-turn streaming shell when lastAssistantId comes from resolveLastAssistantMessageId", () => {
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
      },
    ];
    const lastAssistantId = resolveLastAssistantMessageId(messages);
    const items = buildChatRenderItems(messages, {
      streaming: true,
      lastAssistantId,
      hideAssistantThinkingDetails: true,
    });
    expect(lastAssistantId).toBe("a2");
    expect(items.map((item) => item.message.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });
});

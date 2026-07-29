import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../src/types";
import { AUTO_CONTINUE_PROMPT_SENTINEL } from "../../src/runtime/resume";
import {
  hasEmbedVisibleAssistantBody,
  shouldIncludeMessageInChatRender,
  shouldOmitMessageFromChatRender,
} from "../../src/runtime/chat-message-render";
import { resolveLastAssistantMessageId } from "../../src/runtime/conversation-message-dedupe";
import { buildChatRenderItems } from "../../src/components/ChatPane";

const embedCtx = {
  streaming: false,
  lastAssistantId: undefined as string | undefined,
  hideAssistantThinkingDetails: true,
};

describe("chat-message-render", () => {
  it("omits auto-continue user prompts", () => {
    const message: ChatMessage = {
      id: "u-auto",
      role: "user",
      content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue`,
    };
    expect(shouldOmitMessageFromChatRender(message, embedCtx)).toBe(true);
  });

  it("omits trailing empty assistant shells", () => {
    const shell: ChatMessage = {
      id: "a-shell",
      role: "assistant",
      content: "",
      runStatus: "succeeded",
      endedAt: 2,
      events: [{ kind: "status", label: "requesting" }],
    };
    expect(shouldOmitMessageFromChatRender(shell, embedCtx)).toBe(true);
    expect(hasEmbedVisibleAssistantBody(shell)).toBe(false);
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

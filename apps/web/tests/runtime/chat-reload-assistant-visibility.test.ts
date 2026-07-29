import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../src/types";
import { buildChatRenderItems } from "../../src/components/ChatPane";
import { dedupeConversationAssistantRows } from "../../src/runtime/conversation-message-dedupe";
import { mergeActiveRunsIntoMessages } from "../../src/teamver/backgroundChatRecovery";
import { AUTO_CONTINUE_PROMPT_SENTINEL } from "../../src/runtime/resume";
import { hasEmbedVisibleAssistantBody } from "../../src/runtime/chat-message-render";

const embedCtx = {
  streaming: false,
  lastAssistantId: undefined as string | undefined,
  hideAssistantThinkingDetails: true,
};

function autoContinueReloadFixture(): ChatMessage[] {
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
  return [user, failed, autoUser, succeededShell];
}

describe("chat reload assistant visibility", () => {
  it("keeps the terminal succeeded shell through load dedupe and chat render filtering", () => {
    const loaded = mergeActiveRunsIntoMessages(autoContinueReloadFixture(), []);
    expect(loaded.map((message) => message.id)).toEqual([
      "u1",
      "a-failed",
      "u-auto",
      "a-succeeded",
    ]);

    const items = buildChatRenderItems(loaded, {
      ...embedCtx,
      lastAssistantId: "a-succeeded",
    });
    expect(items.map((item) => item.message.id)).toEqual(["u1", "a-succeeded"]);
    const succeededShell = loaded.find((message) => message.id === "a-succeeded");
    expect(succeededShell).toBeDefined();
    expect(hasEmbedVisibleAssistantBody(succeededShell!)).toBe(true);
  });

  it("does not drop the succeeded shell when deduping conversation rows directly", () => {
    const deduped = dedupeConversationAssistantRows(autoContinueReloadFixture());
    expect(deduped.some((message) => message.id === "a-succeeded")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../src/types";
import { buildChatRenderItems } from "../../src/components/ChatPane";
import { dedupeConversationAssistantRows } from "../../src/runtime/conversation-message-dedupe";
import { mergeActiveRunsIntoMessages } from "../../src/teamver/backgroundChatRecovery";
import { AUTO_CONTINUE_PROMPT_SENTINEL } from "../../src/runtime/resume";

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
  });

  it("does not drop the succeeded shell when deduping conversation rows directly", () => {
    const deduped = dedupeConversationAssistantRows(autoContinueReloadFixture());
    expect(deduped.some((message) => message.id === "a-succeeded")).toBe(true);
  });

  it("drops code-fence-only assistant rows from chat render after reload", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "make deck", createdAt: 1 };
    const codeOnly: ChatMessage = {
      id: "a-code",
      role: "assistant",
      content: "```html\n<section class=\"slide\"><h1>Draft</h1></section>\n```",
      runStatus: "succeeded",
      endedAt: 2,
      createdAt: 2,
    };
    const items = buildChatRenderItems([user, codeOnly], {
      ...embedCtx,
      lastAssistantId: "a-code",
    });
    expect(items.map((item) => item.message.id)).toEqual(["u1"]);
  });
});

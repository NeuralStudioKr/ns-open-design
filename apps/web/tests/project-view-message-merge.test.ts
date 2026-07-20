import { describe, expect, it } from "vitest";

import {
  mergeMissingActiveRunAssistantMessages,
  mergeServerMessagesIntoConversation,
} from "../src/components/ProjectView";
import type { ChatMessage } from "../src/types";

describe("mergeServerMessagesIntoConversation", () => {
  it("keeps local active runStatus when server row is stale", () => {
    const local: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "partial",
      createdAt: 1,
      runStatus: "running",
      runId: "run-1",
    };
    const server: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      createdAt: 1,
      runStatus: "not_started" as ChatMessage["runStatus"],
    };
    const merged = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged[0]?.runStatus).toBe("running");
  });

  it("keeps longer local content during an in-flight run when server persist lags", () => {
    const questionFormChunk =
      'Planning…\n<question-form>{"id":"discovery","questions":[{"id":"topic","label":"Topic?","type":"text"}';
    const local: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: questionFormChunk,
      createdAt: 1,
      runStatus: "running",
      runId: "run-1",
    };
    const server: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Planning…",
      createdAt: 1,
      runStatus: "running",
      runId: "run-1",
    };
    const merged = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged[0]?.content).toBe(questionFormChunk);
  });

  it("does not prefer stale local content after the run has settled on the server", () => {
    const local: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "partial stale buffer",
      createdAt: 1,
      runStatus: "running",
      runId: "run-1",
    };
    const server: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "All done!",
      createdAt: 1,
      runStatus: "succeeded",
      runId: "run-1",
      endedAt: 2,
    };
    const merged = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged[0]?.content).toBe("All done!");
    expect(merged[0]?.runStatus).toBe("running");
  });

  it("prefers shorter sanitized local content when terminal server row still has leak residue", () => {
    // FE streaming buffer can shrink after closed-tag strip; daemon append-only
    // persist cannot. On refresh, prefer the cleaned local when the server
    // content is a strict extension (leak residue appended after the clean text).
    const local: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Hello",
      createdAt: 1,
      runStatus: "succeeded",
      runId: "run-1",
      endedAt: 2,
      events: [{ kind: "text", text: "Hello" }],
    };
    const server: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Hello <thinking>secret chain</thinking>",
      createdAt: 1,
      runStatus: "succeeded",
      runId: "run-1",
      endedAt: 2,
      events: [
        { kind: "text", text: "Hello" },
        { kind: "text", text: " <thinking>secret chain</thinking>" },
      ],
    };
    const merged = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged[0]?.content).toBe("Hello");
    expect(merged[0]?.events).toEqual([{ kind: "text", text: "Hello" }]);
  });

  it("prefers local when mid-string CDN scrub cleaned server content to match", () => {
    const local: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Done.\n\nNext.",
      createdAt: 1,
      runStatus: "succeeded",
      runId: "run-1",
      endedAt: 2,
    };
    const server: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: 'Done.\n\ngoogleapis.com/css2?family=Inter" />\n\nNext.',
      createdAt: 1,
      runStatus: "succeeded",
      runId: "run-1",
      endedAt: 2,
    };
    const merged = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged[0]?.content).toBe("Done.\n\nNext.");
  });
});

describe("mergeMissingActiveRunAssistantMessages", () => {
  it("restores an in-flight assistant row when only the user message was persisted", () => {
    const user: ChatMessage = {
      id: "u1",
      role: "user",
      content: "슬라이드 만들어줘",
      createdAt: 10,
    };

    const merged = mergeMissingActiveRunAssistantMessages([user], [
      {
        id: "run-1",
        assistantMessageId: "a1",
        agentId: "anthropic-api",
        status: "running",
        createdAt: 20,
      },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      id: "a1",
      role: "assistant",
      content: "",
      runId: "run-1",
      runStatus: "running",
      agentId: "anthropic-api",
      createdAt: 20,
      startedAt: 20,
    });
  });

  it("does not duplicate an assistant row that already exists", () => {
    const assistant: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "working",
      createdAt: 20,
      runId: "run-1",
      runStatus: "running",
    };

    const merged = mergeMissingActiveRunAssistantMessages([assistant], [
      {
        id: "run-1",
        assistantMessageId: "a1",
        status: "running",
        createdAt: 20,
      },
    ]);

    expect(merged).toEqual([assistant]);
  });
});

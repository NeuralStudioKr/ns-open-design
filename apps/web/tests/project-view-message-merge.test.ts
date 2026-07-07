import { describe, expect, it } from "vitest";

import { mergeServerMessagesIntoConversation } from "../src/components/ProjectView";
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
});

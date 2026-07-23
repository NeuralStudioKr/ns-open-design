import { describe, expect, it } from "vitest";

import {
  mergeMissingActiveRunAssistantMessages,
  mergeServerMessagesIntoConversation,
  orderConversationMessages,
  promptWithSlideAttachmentDeliverableInstruction,
  promptWithSlideCommentEditPatchInstruction,
} from "../src/components/ProjectView";
import { stripUserVisibleQuestionFormProtocolText } from "../src/artifacts/question-form";
import type { ChatMessage } from "../src/types";

describe("promptWithSlideAttachmentDeliverableInstruction", () => {
  it("adds a hidden deliverable contract for slide-only attachment runs", () => {
    const prompt = promptWithSlideAttachmentDeliverableInstruction(
      "발표 대본 참고해서 ppt 디자인 해줘",
      [{ path: "refs/drive/deck-brief.md", name: "deck-brief.md", kind: "file" }],
      { slideOnlyMvp: true },
    );

    expect(prompt).toContain("[Deliverable instruction]");
    expect(prompt).toContain("refs/drive/deck-brief.md");
    expect(prompt).toContain('`<artifact type="deck">`');
    expect(prompt).toContain("requested slide count");
    expect(prompt).not.toMatch(/1920|nav, and print/i);
    expect(stripUserVisibleQuestionFormProtocolText(prompt)).toBe("발표 대본 참고해서 ppt 디자인 해줘");
  });

  it("does not add the hidden contract outside slide-only or when already present", () => {
    expect(
      promptWithSlideAttachmentDeliverableInstruction(
        "make a deck",
        [{ path: "refs/file.md", name: "file.md", kind: "file" }],
        { slideOnlyMvp: false },
      ),
    ).toBe("make a deck");
    expect(
      promptWithSlideAttachmentDeliverableInstruction(
        "make a deck\n\n[Deliverable instruction]\nexisting",
        [{ path: "refs/file.md", name: "file.md", kind: "file" }],
        { slideOnlyMvp: true },
      ).match(/\[Deliverable instruction\]/g),
    ).toHaveLength(1);
  });

  it("suppresses the hidden contract on comment-driven edits so the scope block wins", () => {
    // Comment edits already carry `<attached-preview-comments>` telling the
    // model to change ONLY the pinned elements; layering the "emit ONE
    // complete deck" pressure on top forced full-deck regeneration on every
    // one-element edit (2+ minute round-trips). See ProjectView.handleSend
    // for the paired change that plumbs commentAttachments.length through.
    const prompt = promptWithSlideAttachmentDeliverableInstruction(
      "이 텍스트를 '안녕'으로 바꿔줘",
      [
        { path: "deck.html", name: "deck.html", kind: "file" },
        { path: "uploads/ref.png", name: "ref.png", kind: "image" },
      ],
      { slideOnlyMvp: true, commentAttachmentCount: 1 },
    );

    expect(prompt).toBe("이 텍스트를 '안녕'으로 바꿔줘");
    expect(prompt).not.toContain("[Deliverable instruction]");
  });
});

describe("promptWithSlideCommentEditPatchInstruction", () => {
  it("nudges the model into the deck-patch contract on comment edits", () => {
    const prompt = promptWithSlideCommentEditPatchInstruction(
      "이 텍스트를 '안녕'으로 바꿔줘",
      { slideOnlyMvp: true, commentAttachmentCount: 1 },
    );

    expect(prompt).toContain("[Comment-edit patch contract]");
    expect(prompt).toContain('<artifact type="deck-patch"');
    expect(prompt).toContain('data-slide-index');
    // The patch fallback path exists so a bad merge cleanly re-runs as a
    // full deck; the prompt should surface that so the model does not treat
    // deck-patch as the ONLY allowed output shape.
    expect(prompt).toContain('<artifact type="deck">');
  });

  it("uses plural phrasing when multiple comments target the same turn", () => {
    const prompt = promptWithSlideCommentEditPatchInstruction("변경 부탁", {
      slideOnlyMvp: true,
      commentAttachmentCount: 3,
    });
    expect(prompt).toContain('3 attached preview comments');
  });

  it("is a no-op outside slide-only mode or without comment attachments", () => {
    expect(
      promptWithSlideCommentEditPatchInstruction("hi", {
        slideOnlyMvp: false,
        commentAttachmentCount: 5,
      }),
    ).toBe("hi");
    expect(
      promptWithSlideCommentEditPatchInstruction("hi", {
        slideOnlyMvp: true,
        commentAttachmentCount: 0,
      }),
    ).toBe("hi");
  });

  it("is idempotent when the marker is already present (queue re-flush safety)", () => {
    const first = promptWithSlideCommentEditPatchInstruction("bump", {
      slideOnlyMvp: true,
      commentAttachmentCount: 1,
    });
    const second = promptWithSlideCommentEditPatchInstruction(first, {
      slideOnlyMvp: true,
      commentAttachmentCount: 1,
    });
    expect(second).toBe(first);
  });
});

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
    expect(merged[0]?.runStatus).toBe("succeeded");
    expect(merged[0]?.endedAt).toBe(2);
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

describe("orderConversationMessages / merge order", () => {
  it("keeps local user→assistant order when the server returns the pair flipped", () => {
    const user: ChatMessage = {
      id: "u1",
      role: "user",
      content: "기업이 업무에 AI 도입했을 때의 효과에 대해서 설명하는 프레젠테이션 생성.",
      createdAt: 100,
    };
    const assistant: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "기업 AI 도입 효과에 대한 프레젠테이션을 바로 제작하겠습니다.",
      createdAt: 101,
      runStatus: "succeeded",
      endedAt: 200,
    };
    // Server position race / failed user PUT left assistant first.
    const merged = mergeServerMessagesIntoConversation(
      [user, assistant],
      [assistant, user],
    );
    expect(merged.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("places a local-only user message before the server assistant after a failed user PUT", () => {
    const user: ChatMessage = {
      id: "u1",
      role: "user",
      content: "슬라이드 만들어줘",
      createdAt: 100,
    };
    const assistant: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "만들겠습니다",
      createdAt: 101,
      runStatus: "succeeded",
      endedAt: 200,
    };
    // Server only has the assistant (user save 401'd); naive append put user last.
    const merged = mergeServerMessagesIntoConversation([user, assistant], [assistant]);
    expect(merged.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("tie-breaks same createdAt with user before assistant", () => {
    const user: ChatMessage = {
      id: "u1",
      role: "user",
      content: "hi",
      createdAt: 50,
    };
    const assistant: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "hello",
      createdAt: 50,
    };
    expect(orderConversationMessages([assistant, user]).map((m) => m.id)).toEqual([
      "u1",
      "a1",
    ]);
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

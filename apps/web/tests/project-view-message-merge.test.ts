import { describe, expect, it } from "vitest";

import {
  mergeMissingActiveRunAssistantMessages,
  mergeServerMessagesIntoConversation,
  orderConversationMessages,
  imageAttachmentPathsForSlideEmbed,
  chatAttachmentsForAutoContinueImageEmbed,
  findClientSlideCountRegression,
  promptWithExistingDeckEditInstruction,
  resolveCanonicalDeckFileForEdit,
  promptWithSlideAttachmentDeliverableInstruction,
  promptWithSlideCommentEditPatchInstruction,
} from "../src/components/ProjectView";
import {
  messageContentWithCommentAttachments,
  commentsToAttachments,
  stripUserVisibleUserMessageText,
} from "../src/comments";
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
    expect(prompt).toContain('`<artifact type="deck" identifier="deck">`');
    expect(prompt).toContain("deck.html");
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

  it("suppresses full-deck deliverable pressure on comment edits but keeps image embed", () => {
    // Comment edits already carry `<attached-preview-comments>` telling the
    // model to change ONLY the pinned elements; layering the "emit ONE
    // complete deck" pressure on top forced full-deck regeneration on every
    // one-element edit (2+ minute round-trips). Image attaches still need an
    // exact <img src> contract for board/memo "넣어줘" turns.
    const prompt = promptWithSlideAttachmentDeliverableInstruction(
      "이 텍스트를 '안녕'으로 바꿔줘",
      [
        { path: "deck.html", name: "deck.html", kind: "file" },
        { path: "uploads/ref.png", name: "ref.png", kind: "image" },
      ],
      { slideOnlyMvp: true, commentAttachmentCount: 1 },
    );

    expect(prompt).toContain("[Attached image embed]");
    expect(prompt).toContain('src="uploads/ref.png"');
    expect(prompt).not.toContain("[Deliverable instruction]");
    expect(stripUserVisibleUserMessageText(prompt)).toBe("이 텍스트를 '안녕'으로 바꿔줘");
  });

  it("keeps comment-only text edits free of deliverable and embed noise", () => {
    const prompt = promptWithSlideAttachmentDeliverableInstruction(
      "이 텍스트를 '안녕'으로 바꿔줘",
      [{ path: "deck.html", name: "deck.html", kind: "file" }],
      { slideOnlyMvp: true, commentAttachmentCount: 1 },
    );
    expect(prompt).toBe("이 텍스트를 '안녕'으로 바꿔줘");
    expect(prompt).not.toContain("[Deliverable instruction]");
    expect(prompt).not.toContain("[Attached image embed]");
  });

  it("suppresses full-deck deliverable pressure when editing an existing deck", () => {
    const prompt = promptWithSlideAttachmentDeliverableInstruction(
      "방가방가~ 를 앞에 추가",
      [{ path: "deck.html", name: "deck.html", kind: "file" }],
      { slideOnlyMvp: true, existingDeckEdit: true },
    );
    expect(prompt).toBe("방가방가~ 를 앞에 추가");
    expect(prompt).not.toContain("[Deliverable instruction]");
  });

  it("keeps an image-embed contract on existing-deck turns with attached images", () => {
    const prompt = promptWithSlideAttachmentDeliverableInstruction(
      "이 이미지를 슬라이드에 넣어줘",
      [
        { path: "deck.html", name: "deck.html", kind: "file" },
        { path: "m1abc-photo.png", name: "m1abc-photo.png", kind: "image" },
      ],
      { slideOnlyMvp: true, existingDeckEdit: true },
    );
    expect(prompt).toContain("[Attached image embed]");
    expect(prompt).toContain('src="m1abc-photo.png"');
    expect(prompt).toContain("exact project-relative path");
    expect(prompt).toContain("never strip directory prefixes");
    expect(prompt).toContain("surgical insert into the EXISTING deck");
    expect(prompt).toContain("NEVER reduce the number of `<section class=\"slide\">` blocks");
    expect(prompt).toContain("deck-patch");
    expect(prompt).toContain("Do NOT emit a greenfield 2-slide wireframe");
    expect(prompt).not.toContain("[Deliverable instruction]");
    expect(stripUserVisibleUserMessageText(prompt)).toBe("이 이미지를 슬라이드에 넣어줘");
  });

  it("lists image embed paths on greenfield attachment deliverable turns", () => {
    const prompt = promptWithSlideAttachmentDeliverableInstruction(
      "이 사진으로 슬라이드 만들어줘",
      [{ path: "refs/drive/msh5lhfh-hero.png", name: "hero.png", kind: "image" }],
      { slideOnlyMvp: true },
    );
    expect(prompt).toContain("[Deliverable instruction]");
    expect(prompt).toContain("[Attached image embed]");
    expect(prompt).toContain('src="refs/drive/msh5lhfh-hero.png"');
    expect(prompt).toContain("never strip directory prefixes");
    expect(prompt).toContain("NEVER reduce the number of `<section class=\"slide\">` blocks");
  });
});

describe("imageAttachmentPathsForSlideEmbed", () => {
  it("keeps image paths and skips auto-attached deck.html", () => {
    expect(
      imageAttachmentPathsForSlideEmbed([
        { path: "deck.html", name: "deck.html", kind: "file" },
        { path: "photo.png", name: "photo.png", kind: "image" },
        { path: "notes.md", name: "notes.md", kind: "file" },
      ]),
    ).toEqual(["photo.png"]);
  });
});

describe("resolveCanonicalDeckFileForEdit", () => {
  it("ignores leftover non-deck HTML and picks deck.html", () => {
    expect(
      resolveCanonicalDeckFileForEdit(
        [
          { name: "about.html", path: "about.html", kind: "html", size: 1, mtime: 1 },
          { name: "deck.html", path: "deck.html", kind: "html", size: 2, mtime: 2 },
        ] as never,
        null,
      )?.name,
    ).toBe("deck.html");
  });

  it("returns null when only leftover HTML exists (first create)", () => {
    expect(
      resolveCanonicalDeckFileForEdit(
        [{ name: "about.html", path: "about.html", kind: "html", size: 1, mtime: 1 }] as never,
        "about.html",
      ),
    ).toBeNull();
  });
});

describe("promptWithExistingDeckEditInstruction", () => {
  it("tells the model the deck already exists and prefers deck-patch", () => {
    const prompt = promptWithExistingDeckEditInstruction("인사 앞에 방가방가 추가", {
      slideOnlyMvp: true,
      deckPath: "deck.html",
    });
    expect(prompt).toContain("[Existing deck edit]");
    expect(prompt).toContain("deck.html");
    expect(prompt).toContain("do NOT claim there is no completed deck");
    expect(prompt).toContain("deck-patch");
    expect(prompt).toContain("Applying your edits");
    expect(prompt).toContain("Never \"초안이 생성\"");
    expect(prompt).toContain("NEVER collapse the deck");
    expect(prompt).toContain("keep at least the same slide count");
  });

  it("mentions attached image paths when present", () => {
    const prompt = promptWithExistingDeckEditInstruction("사진을 넣어줘", {
      slideOnlyMvp: true,
      deckPath: "deck.html",
      imagePaths: ["photo.png"],
    });
    expect(prompt).toContain("exact project-relative paths");
    expect(prompt).toContain("- photo.png");
    expect(prompt).toContain("COPY the full current target slide HTML");
  });
});

describe("chatAttachmentsForAutoContinueImageEmbed", () => {
  it("keeps image + deck.html attachments across auto-continue so embed work is not dropped", () => {
    const kept = chatAttachmentsForAutoContinueImageEmbed({
      attachments: [
        { path: "uploads/goldfish.webp", name: "goldfish.webp", kind: "image" },
        { path: "deck.html", name: "deck.html", kind: "file" },
        { path: "notes.md", name: "notes.md", kind: "file" },
      ],
    });
    expect(kept.map((item) => item.path)).toEqual(["uploads/goldfish.webp", "deck.html"]);
  });

  it("recovers image attachments from @mentions when origin attachments were dropped", () => {
    const kept = chatAttachmentsForAutoContinueImageEmbed({
      content: "이 이미지 2페이지에 넣어줘 @msh9rso1-서빙하는-금붕어.webp",
      attachments: [{ path: "deck.html", name: "deck.html", kind: "file" }],
    });
    expect(kept.map((item) => item.path)).toEqual([
      "deck.html",
      "msh9rso1-서빙하는-금붕어.webp",
    ]);
  });
});

describe("findClientSlideCountRegression", () => {
  it("detects hard slide-count collapse that byte-size alone can miss", () => {
    const priorHtml = Array.from(
      { length: 8 },
      (_, i) => `<section class="slide" data-slide-index="${i}">slide ${i + 1} with plenty of copy</section>`,
    ).join("\n");
    const nextHtml = [
      '<section class="slide" data-slide-index="0">a</section>',
      '<section class="slide" data-slide-index="1">b</section>',
    ].join("\n");
    const regression = findClientSlideCountRegression({
      fileName: "deck.html",
      htmlBody: nextHtml,
      priorHtml,
    });
    expect(regression).toMatchObject({
      fileName: "deck.html",
      priorCount: 8,
      newCount: 2,
    });
    expect(
      findClientSlideCountRegression({
        fileName: "deck.html",
        htmlBody: priorHtml,
        priorHtml,
      }),
    ).toBeNull();
  });

  it("strict mode blocks soft shrink on existing-deck / image-embed turns", () => {
    const priorHtml = Array.from(
      { length: 8 },
      (_, i) => `<section class="slide" data-slide-index="${i}">slide ${i + 1}</section>`,
    ).join("\n");
    const soft = Array.from(
      { length: 6 },
      (_, i) => `<section class="slide" data-slide-index="${i}">slide ${i + 1}</section>`,
    ).join("\n");
    expect(
      findClientSlideCountRegression({
        fileName: "deck.html",
        htmlBody: soft,
        priorHtml,
      }),
    ).toBeNull();
    expect(
      findClientSlideCountRegression({
        fileName: "deck.html",
        htmlBody: soft,
        priorHtml,
        strict: true,
      }),
    ).toMatchObject({ priorCount: 8, newCount: 6 });
  });

  it("counts slides even when open-tags contain quoted '>' in style attrs", () => {
    const priorHtml = Array.from({ length: 8 }, (_, i) =>
      i === 0
        ? `<section class="slide" style="content: '>'" data-slide-index="${i}">hero</section>`
        : `<section class="slide" data-slide-index="${i}">slide ${i + 1}</section>`,
    ).join("\n");
    const soft = Array.from(
      { length: 6 },
      (_, i) => `<section class="slide" data-slide-index="${i}">slide ${i + 1}</section>`,
    ).join("\n");
    // Naive [^>]* open-tag regexes undercount prior to 1 and skip the guard.
    expect(
      findClientSlideCountRegression({
        fileName: "deck.html",
        htmlBody: soft,
        priorHtml,
        strict: true,
      }),
    ).toMatchObject({ priorCount: 8, newCount: 6 });
  });
});

describe("promptWithSlideCommentEditPatchInstruction", () => {
  it("appends a concrete element-patch template when comment attachments are provided", () => {
    const prompt = promptWithSlideCommentEditPatchInstruction(
      "이 텍스트를 '안녕'으로 바꿔줘",
      {
        slideOnlyMvp: true,
        commentAttachmentCount: 1,
        commentAttachments: [
          {
            id: 'c1',
            order: 1,
            filePath: 'deck.html',
            elementId: 'hero-title',
            selector: '[data-od-id="hero-title"]',
            label: 'Title',
            comment: "이 텍스트를 '안녕'으로 바꿔줘",
            currentText: 'Hello',
            pagePosition: { x: 0, y: 0, width: 10, height: 10 },
            htmlHint: '<h1 data-od-id="hero-title">Hello</h1>',
            selectionKind: 'element',
            slideIndex: 2,
          },
        ],
      },
    );

    expect(prompt).toContain('target-id="hero-title"');
    expect(prompt).toContain('slide-index="2"');
    expect(prompt).toContain('REQUIRED OUTPUT — respond with ONLY this artifact block');
    expect(prompt).toContain('at least one non-empty `<patch');
    expect(prompt).toContain('Never emit an empty `<artifact type="element-patch"></artifact>`');
  });

  it("nudges the model into the element-patch contract on comment edits", () => {
    const prompt = promptWithSlideCommentEditPatchInstruction(
      "이 텍스트를 '안녕'으로 바꿔줘",
      { slideOnlyMvp: true, commentAttachmentCount: 1 },
    );

    expect(prompt).toContain("[Comment-edit patch contract]");
    expect(prompt).toContain('<artifact type="element-patch"');
    expect(prompt).toContain('target-id="{elementId}"');
    expect(prompt).toContain('slide-index="{N}"');
    expect(prompt).toContain('arbitrary natural-language requests');
    expect(prompt).toContain('Never answer with a question when a pinned comment target is attached');
    expect(prompt).toContain('<artifact type="deck-patch"');
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

  it("nudges box/edit visual annotations toward element edits instead of decorative graft marks", () => {
    const prompt = promptWithSlideCommentEditPatchInstruction(
      "슬라이드 2 이 글씨들 더 크게",
      {
        slideOnlyMvp: true,
        commentAttachmentCount: 1,
        commentAttachments: [
          {
            id: 'visual-box-1',
            order: 1,
            filePath: 'deck.html',
            elementId: 'visual-mark-box-1',
            selector: '',
            label: 'Marked screenshot region',
            comment: '슬라이드 2 이 글씨들 더 크게',
            currentText: '',
            pagePosition: { x: 40, y: 50, width: 200, height: 80 },
            htmlHint: '',
            selectionKind: 'visual',
            screenshotPath: 'drawing-1.png',
            markKind: 'box',
            slideIndex: 1,
          },
        ],
      },
    );

    expect(prompt).toContain('[Visual annotation edit]');
    expect(prompt).toContain('Do NOT add decorative overlay divs');
    expect(prompt).not.toContain('[Visual mark edit]');
    expect(prompt).not.toContain('ADD the requested mark (SVG/icon)');
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

  it("keeps local user-turn chips when a stale server refresh omits comment metadata", () => {
    const attachment = {
      id: "c1",
      order: 1,
      filePath: "deck.html",
      elementId: "hero-title",
      selector: '[data-od-id="hero-title"]',
      label: "h2",
      comment: "더 크게 조정",
      currentText: "Title",
      pagePosition: { x: 0, y: 0, width: 100, height: 24 },
      htmlHint: "<h2>",
      selectionKind: "element" as const,
    };
    const local: ChatMessage = {
      id: "u1",
      role: "user",
      content: "더 크게 조정",
      createdAt: 1,
      sessionMode: "design",
      attachments: [{ path: "deck.html", name: "deck.html", kind: "file" }],
      commentAttachments: [attachment],
    };
    const server: ChatMessage = {
      id: "u1",
      role: "user",
      content: "더 크게 조정",
      createdAt: 1,
      sessionMode: "design",
    };
    const merged = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged[0]?.commentAttachments).toEqual([attachment]);
    expect(merged[0]?.attachments).toEqual([
      { path: "deck.html", name: "deck.html", kind: "file" },
    ]);
  });

  it("rehydrates user-turn chips from server content when metadata column is missing", () => {
    const attachments = commentsToAttachments([
      {
        id: "c1",
        projectId: "project-1",
        conversationId: "conversation-1",
        filePath: "deck.html",
        elementId: "hero-title",
        selector: '[data-od-id="hero-title"]',
        label: "h2",
        text: "Title",
        position: { x: 0, y: 0, width: 100, height: 24 },
        htmlHint: "<h2>",
        note: "더 크게 조정",
        status: "open",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const server: ChatMessage = {
      id: "u1",
      role: "user",
      content: messageContentWithCommentAttachments("더 크게 조정", attachments),
      createdAt: 1,
      sessionMode: "design",
    };
    const merged = mergeServerMessagesIntoConversation([], [server]);
    expect(merged[0]?.commentAttachments?.[0]?.elementId).toBe("hero-title");
  });

  it("prefers local terminal runStatus when server row is still running without endedAt", () => {
    const local: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "done",
      createdAt: 1,
      runStatus: "succeeded",
      endedAt: 2,
    };
    const server: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "done",
      createdAt: 1,
      runStatus: "running",
      runId: "run-1",
    };
    const merged = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged[0]?.runStatus).toBe("succeeded");
    expect(merged[0]?.endedAt).toBe(2);
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

  it("keeps server completed produced files over a stale local duplicate with the same run id", () => {
    const local: ChatMessage = {
      id: "a-local",
      role: "assistant",
      content: "",
      createdAt: 1,
      startedAt: 1,
      runStatus: "running",
      runId: "run-1",
    };
    const server: ChatMessage = {
      id: "a-server",
      role: "assistant",
      content: "",
      createdAt: 1,
      runStatus: "succeeded",
      runId: "run-1",
      endedAt: 2,
      producedFiles: [{ name: "deck.html", path: "deck.html", mimeType: "text/html", size: 1024 }],
    };

    const merged = mergeServerMessagesIntoConversation([local], [server]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("a-server");
    expect(merged[0]?.runStatus).toBe("succeeded");
    expect(merged[0]?.producedFiles?.[0]?.name).toBe("deck.html");
  });

  it("preserves local error status events when the server row lost them", () => {
    const local: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "partial",
      createdAt: 1,
      runStatus: "failed",
      endedAt: 2,
      events: [
        { kind: "text", text: "partial" },
        {
          kind: "status",
          label: "error",
          detail: "Provider timeout",
          code: "timeout",
        },
      ],
    };
    const server: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "partial",
      createdAt: 1,
      runStatus: "succeeded",
      endedAt: 2,
      events: [{ kind: "text", text: "partial" }],
    };
    const merged = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged[0]?.runStatus).toBe("failed");
    expect(merged[0]?.events).toEqual(local.events);
  });

  it("preserves local prose when terminal server row lost content to sanitize-on-read", () => {
    const local: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "슬라이드를 만들었습니다.",
      events: [{ kind: "text", text: "슬라이드를 만들었습니다." }],
      createdAt: 1,
      runStatus: "succeeded",
      endedAt: 2,
    };
    const server: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      events: [],
      createdAt: 1,
      runStatus: "succeeded",
      endedAt: 2,
    };
    const merged = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged[0]?.content).toBe("슬라이드를 만들었습니다.");
    expect(merged[0]?.events).toEqual([{ kind: "text", text: "슬라이드를 만들었습니다." }]);
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

  it("pins an optimistic in-flight row instead of appending a second empty assistant", () => {
    const user: ChatMessage = {
      id: "u1",
      role: "user",
      content: "슬라이드 만들어줘",
      createdAt: 10,
    };
    const optimistic: ChatMessage = {
      id: "client-a",
      role: "assistant",
      content: "",
      runStatus: "running",
      startedAt: 15,
      createdAt: 15,
    };

    const merged = mergeMissingActiveRunAssistantMessages([user, optimistic], [
      {
        id: "run-1",
        assistantMessageId: "daemon-a",
        agentId: "anthropic-api",
        status: "running",
        createdAt: 20,
      },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      id: "client-a",
      runId: "run-1",
      runStatus: "running",
    });
  });
});

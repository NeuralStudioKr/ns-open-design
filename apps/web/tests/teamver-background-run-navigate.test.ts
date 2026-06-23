import { describe, expect, it } from "vitest";

import { navigateExtrasForBackgroundRun } from "../src/teamver/backgroundRunNavigate";

describe("navigateExtrasForBackgroundRun", () => {
  it("includes conversationId and HTML preview file on succeeded run", () => {
    expect(
      navigateExtrasForBackgroundRun(
        { status: "succeeded", conversationId: "conv-1" },
        { metadata: { entryFile: "output/deck.html" } },
      ),
    ).toEqual({
      conversationId: "conv-1",
      fileName: "deck.html",
    });
  });

  it("includes conversationId only on failed run", () => {
    expect(
      navigateExtrasForBackgroundRun(
        { status: "failed", conversationId: "conv-2" },
        { metadata: { entryFile: "output/deck.html" } },
      ),
    ).toEqual({
      conversationId: "conv-2",
    });
  });

  it("returns empty extras when conversationId is missing", () => {
    expect(
      navigateExtrasForBackgroundRun({ status: "succeeded" }, { metadata: { entryFile: "deck.html" } }),
    ).toEqual({
      fileName: "deck.html",
    });
  });
});

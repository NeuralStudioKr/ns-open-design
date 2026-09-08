import { describe, expect, it } from "vitest";
import { resolvePersistDeckDisplayTitle } from "../../src/teamver/persistDeckDisplayTitle";

describe("resolvePersistDeckDisplayTitle", () => {
  it("keeps a real Korean title over a generic identifier", () => {
    expect(resolvePersistDeckDisplayTitle(
      { title: "기업 AI 도입 효과", identifier: "deck" },
      "기업 AI 도입 효과 PPT 만들어줘",
      "슬라이드",
    )).toBe("기업 AI 도입 효과");
  });

  it("replaces parser identifier/untitled with the persist heal title", () => {
    // b29cd711d4 (루프389/390): a generic deckTitle ("슬라이드") no longer pins the title when the
    // brief still carries a topic — deriveDeckCoverTitleFromBrief extracts "expo" instead.
    // The guard here is unchanged: parser "Response"/"deck" must never become the display title.
    expect(resolvePersistDeckDisplayTitle(
      { title: "Response", identifier: "deck" },
      "expo에 대해서 설명하는 피피티 만들어줘",
      "슬라이드",
    )).toBe("expo");
    expect(resolvePersistDeckDisplayTitle(
      { title: "untitled", identifier: "response" },
      "AI 트렌드 발표자료를 만들어줘",
      "Html Ppt Zhangzara Daisy Days",
    )).toMatch(/AI 트렌드/);
    expect(resolvePersistDeckDisplayTitle(
      { title: "", identifier: "untitled" },
      "",
      "슬라이드",
    )).toBe("슬라이드");
  });
});

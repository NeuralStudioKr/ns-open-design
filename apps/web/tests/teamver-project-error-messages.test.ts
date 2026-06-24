import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

import {
  formatProjectConversationCreateError,
  formatProjectConversationListError,
  formatProjectMessagesLoadError,
} from "../src/teamver/projectErrorMessages";
import { isTeamverEmbedMode } from "../src/teamver/designApiBase";

const mockedEmbedMode = vi.mocked(isTeamverEmbedMode);

describe("project conversation error messages", () => {
  beforeEach(() => {
    mockedEmbedMode.mockReset();
  });

  it("returns English fallbacks for standalone OD", () => {
    mockedEmbedMode.mockReturnValue(false);
    expect(formatProjectConversationCreateError()).toBe(
      "Could not create a conversation for this project.",
    );
    expect(formatProjectConversationListError()).toBe(
      "Could not load conversations for this project.",
    );
    expect(formatProjectMessagesLoadError()).toBe(
      "Could not load messages for this conversation.",
    );
  });

  it("returns Teamver-tone Korean strings in embed mode", () => {
    mockedEmbedMode.mockReturnValue(true);
    expect(formatProjectConversationCreateError()).toBe(
      "슬라이드 프로젝트의 대화를 시작하지 못했습니다.",
    );
    expect(formatProjectConversationListError()).toBe(
      "슬라이드 프로젝트의 대화 목록을 불러오지 못했습니다.",
    );
    expect(formatProjectMessagesLoadError()).toBe(
      "대화의 메시지를 불러오지 못했습니다.",
    );
  });

  it("returns Korean artifact save errors in embed mode", async () => {
    mockedEmbedMode.mockReturnValue(true);
    const {
      formatProjectArtifactRejectedError,
      formatProjectArtifactSaveFailedError,
      formatProjectArtifactStubWarning,
      formatProjectRunErrorForUser,
    } = await import("../src/teamver/projectErrorMessages");
    expect(formatProjectArtifactRejectedError("deck.html", "missing doctype")).toContain(
      "저장을 거부",
    );
    expect(formatProjectArtifactSaveFailedError("deck.html")).toContain("저장하지 못했습니다");
    expect(formatProjectArtifactStubWarning("deck.html", "stub")).toContain("플레이스홀더");
    expect(formatProjectRunErrorForUser(new Error("daemon exploded"))).toContain(
      "슬라이드 실행",
    );
  });
});

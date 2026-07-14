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
      extractProjectRunErrorCode,
      formatProjectRunErrorForUser,
      formatProjectConversationErrorForUser,
      formatProjectForkConversationError,
    } = await import("../src/teamver/projectErrorMessages");
    expect(formatProjectArtifactRejectedError("deck.html", "missing doctype")).toContain(
      "저장을 거부",
    );
    expect(formatProjectArtifactSaveFailedError("deck.html")).toContain("저장에 실패");
    // Generic fallback must never leak developer / infra jargon to end users.
    const generic = formatProjectArtifactSaveFailedError("deck.html");
    expect(generic).not.toContain("daemon");
    expect(generic).not.toContain("로그를 확인");
    // Access-denied path (design-api /access → 403 / project ownership /
    // teamver_project_s3_prefix_required marker) must translate into an
    // actionable permission message, not the generic retry banner.
    expect(
      formatProjectArtifactSaveFailedError("deck.html", { status: 403 }),
    ).toContain("접근 권한이 없어");
    expect(
      formatProjectArtifactSaveFailedError("deck.html", {
        code: "teamver_project_s3_prefix_required",
      }),
    ).toContain("접근 권한이 없어");
    // Not-found path (404 / PROJECT_NOT_FOUND) tells the user to refresh
    // rather than blaming permissions.
    expect(
      formatProjectArtifactSaveFailedError("deck.html", { status: 404 }),
    ).toContain("찾을 수 없어");
    // Unauthorized (401) → re-auth prompt.
    expect(
      formatProjectArtifactSaveFailedError("deck.html", { status: 401 }),
    ).toContain("세션이 만료");
    // Upstream 5xx → transient retry-friendly copy.
    expect(
      formatProjectArtifactSaveFailedError("deck.html", { status: 503 }),
    ).toContain("일시적으로 불안정");
    // Bare fetch/network failure (no status) → network guidance.
    expect(
      formatProjectArtifactSaveFailedError("deck.html", {
        message: "Network error while saving the file",
      }),
    ).toContain("네트워크");
    expect(formatProjectArtifactStubWarning("deck.html", "stub")).toContain("플레이스홀더");
    expect(
      extractProjectRunErrorCode(new Error("proxy 502: PROJECT_STORAGE_UNAVAILABLE sync-down failed")),
    ).toBe("PROJECT_STORAGE_UNAVAILABLE");
    expect(formatProjectRunErrorForUser(new Error("daemon exploded"))).toContain(
      "슬라이드 실행",
    );
    const sessionErr = new Error("session probe failed") as Error & { code?: string };
    sessionErr.code = "session_unreachable";
    expect(formatProjectRunErrorForUser(sessionErr)).toContain("Teamver 세션");
    const unauthorizedErr = new Error("proxy 401: UNAUTHORIZED invalid key") as Error & {
      code?: string;
    };
    unauthorizedErr.code = "UNAUTHORIZED";
    expect(formatProjectRunErrorForUser(unauthorizedErr)).toContain("API 인증");
    expect(
      formatProjectRunErrorForUser(new Error("Missing API key — open Settings and paste one in.")),
    ).toContain("서버 API 키");
    expect(
      formatProjectRunErrorForUser(
        new Error("Your authentication token has expired. Please sign in again."),
      ),
    ).toContain("인증이 만료");
    expect(
      formatProjectConversationErrorForUser(
        new Error("Network request failed"),
        "슬라이드 프로젝트의 대화 목록을 불러오지 못했습니다.",
      ),
    ).toBe("슬라이드 프로젝트의 대화 목록을 불러오지 못했습니다.");
    expect(formatProjectForkConversationError()).toBe("대화를 복제하지 못했습니다.");
  });

  it("passes through raw conversation errors in standalone OD", async () => {
    mockedEmbedMode.mockReturnValue(false);
    const { formatProjectConversationErrorForUser } = await import("../src/teamver/projectErrorMessages");
    expect(
      formatProjectConversationErrorForUser(new Error("custom"), "fallback"),
    ).toBe("custom");
  });
});

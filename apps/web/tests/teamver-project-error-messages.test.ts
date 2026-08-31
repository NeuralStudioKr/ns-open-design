import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock("../src/teamver/teamverEmbedSession", () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => false),
}));

import {
  formatProjectConversationCreateError,
  formatProjectConversationListError,
  formatProjectMessagesLoadError,
} from "../src/teamver/projectErrorMessages";
import { isTeamverEmbedMode } from "../src/teamver/designApiBase";
import { isTeamverEmbedSessionAuthenticated } from "../src/teamver/teamverEmbedSession";

const mockedEmbedMode = vi.mocked(isTeamverEmbedMode);
const mockedSessionAuth = vi.mocked(isTeamverEmbedSessionAuthenticated);

describe("project conversation error messages", () => {
  beforeEach(() => {
    mockedEmbedMode.mockReset();
    mockedSessionAuth.mockReturnValue(false);
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
      formatProjectArtifactRegressionRejectedError,
      formatProjectArtifactRejectedError,
      formatProjectArtifactCommentScopeRejectedError,
      formatProjectArtifactSaveFailedError,
      formatProjectArtifactStubWarning,
      formatProjectRunDeliverableMissingError,
      encodePersistedRunErrorDetail,
      userFacingRunErrorDetail,
      extractPersistedRunErrorDiagnostic,
      formatAutoContinueIncompleteOutputNotice,
      extractProjectRunErrorCode,
      formatPersistedProjectRunError,
      formatProjectRunErrorForUser,
      formatProjectConversationErrorForUser,
      formatProjectForkConversationError,
      looksLikeLowSubstancePersistSkipReason,
      formatProjectRunLowSubstanceDeliverableError,
    } = await import("../src/teamver/projectErrorMessages");
    expect(formatProjectArtifactRejectedError("deck.html", "missing doctype")).toContain(
      '슬라이드 파일 "슬라이드"',
    );
    expect(formatProjectArtifactRejectedError("deck.html", "missing doctype")).not.toContain(
      "deck.html",
    );
    expect(formatProjectArtifactRejectedError("   ", "missing doctype")).toContain(
      '슬라이드 파일 "슬라이드"',
    );
    expect(formatProjectArtifactRejectedError("분기 실적.html", "missing doctype")).toContain(
      '슬라이드 파일 "분기 실적"',
    );
    expect(formatProjectArtifactCommentScopeRejectedError()).toContain("댓글 대상 밖");
    // With a detail arg the message must append the concrete
    // pipeline reason so bug reports include the failure code + reason
    // without needing browser console access.
    const withDetail = formatProjectArtifactCommentScopeRejectedError(
      "deck_patch_merge_failed — Selected targets were unchanged.",
    );
    expect(withDetail).toContain("사유: deck_patch_merge_failed — Selected targets were unchanged.");
    // No detail → no parenthetical suffix (preserves the older UI copy).
    expect(formatProjectArtifactCommentScopeRejectedError()).not.toContain("사유:");
    expect(formatProjectArtifactSaveFailedError("deck.html")).toContain(
      '슬라이드 파일 "슬라이드" 저장에 실패',
    );
    expect(formatProjectArtifactSaveFailedError("deck.html")).not.toContain("deck.html");
    expect(formatProjectRunDeliverableMissingError()).toContain("슬라이드 결과물");
    expect(formatProjectRunDeliverableMissingError()).not.toContain("terminalPersistResultKind=");
    expect(formatProjectRunDeliverableMissingError()).toContain("중간에 끊겼");
    // 루프183 — low-substance / catalog leftover skips must not claim the stream was cut off.
    expect(looksLikeLowSubstancePersistSkipReason("low-substance deck artifact")).toBe(true);
    expect(looksLikeLowSubstancePersistSkipReason("unfilled-catalog-example")).toBe(true);
    expect(looksLikeLowSubstancePersistSkipReason("incomplete-html-document-shell")).toBe(false);
    expect(formatProjectRunLowSubstanceDeliverableError()).toContain("내용이 충분하지");
    expect(formatProjectRunLowSubstanceDeliverableError()).not.toContain("중간에 끊겼");
    expect(formatProjectRunDeliverableMissingError("low-substance deck artifact")).toBe(
      formatProjectRunLowSubstanceDeliverableError(),
    );
    expect(formatProjectRunDeliverableMissingError({
      kind: "skipped-incomplete",
      reason: "unfilled-catalog-example",
    })).toBe(formatProjectRunLowSubstanceDeliverableError());
    expect(formatProjectRunDeliverableMissingError({
      kind: "skipped-incomplete",
      reason: "incomplete-html-document-shell",
    })).toContain("중간에 끊겼");
    const encodedLow = encodePersistedRunErrorDetail(
      formatProjectRunDeliverableMissingError("low-substance deck artifact"),
      { kind: "skipped-incomplete", reason: "low-substance deck artifact" },
    );
    expect(userFacingRunErrorDetail(encodedLow)).toBe(formatProjectRunLowSubstanceDeliverableError());
    expect(userFacingRunErrorDetail(encodedLow)).not.toContain("중간에 끊겼");
    const encoded = encodePersistedRunErrorDetail(formatProjectRunDeliverableMissingError(), {
      kind: "skipped-incomplete",
      reason: "no <section class=\"slide\"> blocks in deck-patch body",
    });
    expect(userFacingRunErrorDetail(encoded)).toBe(formatProjectRunDeliverableMissingError());
    expect(extractPersistedRunErrorDiagnostic(encoded)).toContain(
      "terminalPersistResultKind=skipped-incomplete",
    );
    expect(extractPersistedRunErrorDiagnostic(encoded)).toContain(
      "reason=no <section class=\"slide\"> blocks in deck-patch body",
    );
    const legacy =
      '슬라이드 결과물이 생성되지 않았습니다. (terminalPersistResultKind=skipped-incomplete reason=empty)';
    expect(userFacingRunErrorDetail(legacy)).not.toContain("terminalPersistResultKind=");
    expect(extractPersistedRunErrorDiagnostic(legacy)).toContain(
      "terminalPersistResultKind=skipped-incomplete",
    );
    expect(formatAutoContinueIncompleteOutputNotice()).toContain("자동으로 이어쓰기");
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
    // Unauthorized (401) → re-auth prompt when session memory says logged out.
    expect(
      formatProjectArtifactSaveFailedError("deck.html", { status: 401 }),
    ).toContain("세션이 만료");
    mockedSessionAuth.mockReturnValue(true);
    expect(
      formatProjectArtifactSaveFailedError("deck.html", { status: 401 }),
    ).toContain("연결을 확인");
    // Upstream 5xx → transient retry-friendly copy.
    expect(
      formatProjectArtifactSaveFailedError("deck.html", { status: 503 }),
    ).toContain("일시적으로 불안정");
    // ARTIFACT_REGRESSION (stub guard reject): data-loss prevention path
    // must reassure the user their existing deck is safe on disk and
    // hint at the escape-hatch env var so a deliberate small edit that
    // trips the guard can be salvaged without a mystery banner.
    const regression = formatProjectArtifactSaveFailedError("deck.html", {
      status: 422,
      code: "ARTIFACT_REGRESSION",
      message:
        'New artifact body for identifier "deck" is 1279 bytes, but the largest prior sibling "deck.html" is 21918 bytes.',
    });
    expect(regression).toContain("짧은 초안");
    expect(regression).toContain("기존 슬라이드는 그대로");
    // User-facing copy must NEVER mention internal env vars / ops toggles.
    expect(regression).not.toContain("OD_ARTIFACT_STUB_GUARD");
    expect(regression).not.toContain("daemon");
    // Filename does not have to appear — the reassurance is about the current
    // deck; leaking bare "deck.html" adds noise without user value.
    expect(regression).not.toContain("플레이스홀더");
    // The bare generic "저장에 실패" copy must not fire when we can
    // recognise the ARTIFACT_REGRESSION code — otherwise the improved
    // reassurance-banner regresses to the mystery banner.
    expect(regression).not.toBe(
      `슬라이드 파일 "deck.html" 저장에 실패했습니다. 잠시 후 다시 시도하세요.`,
    );
    // formatProjectArtifactRegressionRejectedError is the shared
    // primitive used by both the client-side pre-write guard and the
    // daemon-side stub-guard reject reaching the client via save-
    // failed. Both entry points must produce byte-identical copy so
    // users never see two different explanations for the same
    // failure. Test the shared helper directly here so a future
    // refactor that inlines one path cannot silently drift.
    const regressionShared = formatProjectArtifactRegressionRejectedError("deck.html");
    expect(regressionShared).toBe(regression);
    // Bare fetch/network failure (no status) → network guidance.
    expect(
      formatProjectArtifactSaveFailedError("deck.html", {
        message: "Network error while saving the file",
      }),
    ).toContain("네트워크");
    expect(formatProjectArtifactStubWarning("deck.html", "stub")).toContain(
      '"슬라이드"은(는) 저장됐지만 플레이스홀더',
    );
    expect(formatProjectArtifactStubWarning("deck.html", "stub")).not.toContain("deck.html");
    expect(
      extractProjectRunErrorCode(new Error("proxy 502: PROJECT_STORAGE_UNAVAILABLE sync-down failed")),
    ).toBe("PROJECT_STORAGE_UNAVAILABLE");
    expect(extractProjectRunErrorCode(new Error("Upstream error: 529"))).toBe(
      "OVERLOADED_ERROR",
    );
    expect(extractProjectRunErrorCode(new Error("prompt is too long: 210000 tokens"))).toBe(
      "CONTEXT_LENGTH_EXCEEDED",
    );
    const anthropicContext = Object.assign(
      new Error("prompt is too long: 220000 tokens > 200000 maximum"),
      { status: 400, error: { type: "invalid_request_error" } },
    );
    expect(extractProjectRunErrorCode(anthropicContext)).toBe("CONTEXT_LENGTH_EXCEEDED");
    expect(formatProjectRunErrorForUser(anthropicContext)).toMatch(/모델 한도를 초과/);
    const anthropicOverloaded = Object.assign(new Error("Overloaded"), {
      status: 529,
      error: { type: "overloaded_error" },
    });
    expect(extractProjectRunErrorCode(anthropicOverloaded)).toBe("OVERLOADED_ERROR");
    const networkErr = new Error("teamver_browser_network_unavailable") as Error & {
      code?: string;
    };
    networkErr.code = "TEAMVER_BROWSER_NETWORK_UNAVAILABLE";
    expect(extractProjectRunErrorCode(networkErr)).toBe("UPSTREAM_UNAVAILABLE");
    const persisted = formatPersistedProjectRunError(new Error("Upstream error: 529"));
    expect(persisted.code).toBe("OVERLOADED_ERROR");
    expect(persisted.userMessage).toContain("AI 서비스에 연결");
    expect(userFacingRunErrorDetail(persisted.detail)).toBe(persisted.userMessage);
    expect(extractPersistedRunErrorDiagnostic(persisted.detail)).toContain("stream-error");
    expect(extractPersistedRunErrorDiagnostic(persisted.detail)).toContain("Upstream error: 529");
    expect(extractPersistedRunErrorDiagnostic(persisted.detail)).toContain("code=OVERLOADED_ERROR");
    const opaque = formatPersistedProjectRunError(new Error("some unclassified boom"));
    expect(opaque.code).toBe("AGENT_EXECUTION_FAILED");
    expect(userFacingRunErrorDetail(opaque.detail)).toContain("슬라이드 실행 중 오류");
    expect(extractPersistedRunErrorDiagnostic(opaque.detail)).toContain("some unclassified boom");
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
    const managedKeyErr = new Error("managed key unavailable") as Error & { code?: string };
    managedKeyErr.code = "MANAGED_KEY_UNAVAILABLE";
    expect(formatProjectRunErrorForUser(managedKeyErr)).toContain("다시 시도");
    expect(formatProjectRunErrorForUser(managedKeyErr)).not.toContain("다시 로그인");
    const upstreamErr = new Error("fetch failed") as Error & { code?: string };
    upstreamErr.code = "UPSTREAM_UNAVAILABLE";
    expect(formatProjectRunErrorForUser(upstreamErr)).toContain("AI 서비스에 연결");
    expect(
      formatProjectRunErrorForUser(new Error("daemon 502: UPSTREAM_UNAVAILABLE teamver project access check failed")),
    ).toContain("AI 서비스에 연결");
    const overloadedErr = new Error("Overloaded") as Error & { code?: string };
    overloadedErr.code = "OVERLOADED_ERROR";
    expect(formatProjectRunErrorForUser(overloadedErr)).toContain("AI 서비스에 연결");
    const internalErr = new Error("bug") as Error & { code?: string };
    internalErr.code = "INTERNAL_ERROR";
    expect(formatProjectRunErrorForUser(internalErr)).toContain("내부 오류");
    expect(formatProjectRunErrorForUser(internalErr)).not.toContain("AI 서비스");
    const missingProjectErr = new Error("daemon 404: PROJECT_NOT_FOUND project not found") as Error & {
      code?: string;
    };
    missingProjectErr.code = "PROJECT_NOT_FOUND";
    expect(formatProjectRunErrorForUser(missingProjectErr)).toContain("프로젝트를 찾을 수 없");
    expect(formatProjectRunErrorForUser(missingProjectErr)).not.toContain("슬라이드 실행 중 오류");
    expect(
      formatProjectRunErrorForUser(
        new Error("Your authentication token has expired. Please sign in again."),
      ),
    ).toContain("슬라이드 실행");
    expect(
      formatProjectConversationErrorForUser(
        new Error("Network request failed"),
        "슬라이드 프로젝트의 대화 목록을 불러오지 못했습니다.",
      ),
    ).toBe("슬라이드 프로젝트의 대화 목록을 불러오지 못했습니다.");
    mockedSessionAuth.mockReturnValue(true);
    expect(
      formatProjectConversationErrorForUser(
        new Error("teamver_daemon_unauthorized"),
        "슬라이드 프로젝트의 대화 목록을 불러오지 못했습니다.",
      ),
    ).toContain("연결");
    const { TeamverDaemonUnauthorizedError } = await import("../src/teamver/teamverDaemonHeaders");
    expect(
      formatProjectConversationErrorForUser(
        new TeamverDaemonUnauthorizedError(),
        "슬라이드 프로젝트의 대화 목록을 불러오지 못했습니다.",
      ),
    ).toContain("연결");
    expect(formatProjectForkConversationError()).toBe("대화를 복제하지 못했습니다.");
  });

  it("keeps standalone save banners on the raw filename", async () => {
    mockedEmbedMode.mockReturnValue(false);
    const {
      formatProjectArtifactRejectedError,
      formatProjectArtifactSaveFailedError,
      formatProjectArtifactStubWarning,
    } = await import("../src/teamver/projectErrorMessages");
    expect(formatProjectArtifactRejectedError("deck.html", "missing doctype")).toContain(
      '"deck.html"',
    );
    expect(formatProjectArtifactSaveFailedError("deck.html")).toContain('"deck.html"');
    expect(formatProjectArtifactStubWarning("deck.html", "stub")).toContain('"deck.html"');
  });

  it("passes through raw conversation errors in standalone OD", async () => {
    mockedEmbedMode.mockReturnValue(false);
    const { formatProjectConversationErrorForUser } = await import("../src/teamver/projectErrorMessages");
    expect(
      formatProjectConversationErrorForUser(new Error("custom"), "fallback"),
    ).toBe("custom");
  });
});

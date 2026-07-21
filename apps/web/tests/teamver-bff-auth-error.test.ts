// @vitest-environment jsdom
import { NetworkError } from "@teamver/app-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, resolveReturnMock, passiveAuthMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  resolveReturnMock: vi.fn((pathname: string, search = "") => `${pathname}${search}`),
  passiveAuthMock: vi.fn(),
}));

vi.mock("../src/teamver/designAuthFlow", () => ({
  redirectToTeamverLoginPreservingRoute: redirectMock,
}));

vi.mock("../src/teamver/teamverEmbedAuthNavigation", () => ({
  resolveEmbedAuthReturnPath: resolveReturnMock,
}));

import {
  classifyTeamverBffAuthFailure,
  formatTeamverEmbedAuthRequiredMessage,
  handleTeamverBffAuthFailure,
  handleTeamverDriveAuthFailure,
  isTeamverBffUnauthorizedError,
  redirectToTeamverLoginFromEmbed,
} from "../src/teamver/teamverBffAuthError";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/teamverEmbedSession", () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => false),
}));

vi.mock("../src/teamver/teamverEmbedPassiveAuth", () => ({
  handleEmbedPassiveUnauthorized: passiveAuthMock,
}));

vi.mock("../src/teamver/mainSsoMismatchRecovery", () => ({
  beginMainSsoMismatchRecovery: vi.fn(() => Promise.resolve()),
}));

import { isTeamverEmbedSessionAuthenticated } from "../src/teamver/teamverEmbedSession";
import { beginMainSsoMismatchRecovery } from "../src/teamver/mainSsoMismatchRecovery";
import { TeamverDaemonUnauthorizedError } from "../src/teamver/teamverDaemonHeaders";
import {
  formatTeamverEmbedOperationFailureMessage,
  notifyTeamverEmbedAuthFailureIfNeeded,
} from "../src/teamver/teamverBffAuthError";

describe("isTeamverBffUnauthorizedError", () => {
  it("matches SDK NetworkError with status 401", () => {
    expect(
      isTeamverBffUnauthorizedError(new NetworkError({ status: 401, message: "unauth" })),
    ).toBe(true);
  });

  it("ignores other NetworkError statuses so we don't route 500/403/429 through re-login", () => {
    expect(
      isTeamverBffUnauthorizedError(new NetworkError({ status: 500, message: "boom" })),
    ).toBe(false);
    expect(
      isTeamverBffUnauthorizedError(new NetworkError({ status: 403, message: "forbidden" })),
    ).toBe(false);
    expect(
      isTeamverBffUnauthorizedError(new NetworkError({ status: 0, message: "network" })),
    ).toBe(false);
  });

  it("matches the plain-Error shape thrown by driveApi.ts on 401", () => {
    // `getTeamverDriveJson` (`teamver-bff/drive/api/…`) does not use the SDK
    // client, so its 401 arrives as `Error("teamver_drive_fetch_failed:401")`.
    expect(
      isTeamverBffUnauthorizedError(new Error("teamver_drive_fetch_failed:401")),
    ).toBe(true);
    expect(
      isTeamverBffUnauthorizedError(new Error("teamver_drive_fetch_failed: 401")),
    ).toBe(true);
  });

  it("does not treat Invalid token as session expiry (often HA/upstream transient)", () => {
    expect(isTeamverBffUnauthorizedError(new Error("Invalid token"))).toBe(false);
    expect(isTeamverBffUnauthorizedError(new Error('{"detail":"Invalid token"}'))).toBe(false);
  });

  it("matches explicit session_expired bodies", () => {
    expect(isTeamverBffUnauthorizedError(new Error("session_expired"))).toBe(true);
  });

  it("matches SDK AuthenticationError status 401", async () => {
    const { AuthenticationError } = await import("@teamver/app-sdk");
    expect(
      isTeamverBffUnauthorizedError(new AuthenticationError({ status: 401, message: "session_expired" })),
    ).toBe(true);
  });

  it("does not match unrelated drive 4xx/5xx codes", () => {
    expect(
      isTeamverBffUnauthorizedError(new Error("teamver_drive_fetch_failed:403")),
    ).toBe(false);
    expect(
      isTeamverBffUnauthorizedError(new Error("teamver_drive_fetch_failed:500")),
    ).toBe(false);
    expect(isTeamverBffUnauthorizedError(new Error("outputs_fetch_failed"))).toBe(false);
  });

  it("does not match non-error values", () => {
    expect(isTeamverBffUnauthorizedError(null)).toBe(false);
    expect(isTeamverBffUnauthorizedError(undefined)).toBe(false);
    expect(isTeamverBffUnauthorizedError("401")).toBe(false);
    expect(isTeamverBffUnauthorizedError({ status: 401 })).toBe(false);
  });
});

describe("classifyTeamverBffAuthFailure", () => {
  beforeEach(() => {
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(false);
  });

  it("returns relogin when session memory is unauthenticated", () => {
    expect(
      classifyTeamverBffAuthFailure(new NetworkError({ status: 401, message: "unauth" })),
    ).toBe("relogin");
  });

  it("returns transient when embed session flag is still authenticated", () => {
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    expect(
      classifyTeamverBffAuthFailure(new NetworkError({ status: 401, message: "unauth" })),
    ).toBe("transient");
  });

  it("handleTeamverBffAuthFailure invokes the matching handler", () => {
    const onRelogin = vi.fn();
    const onTransient = vi.fn();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    expect(
      handleTeamverBffAuthFailure(new NetworkError({ status: 401, message: "unauth" }), {
        onRelogin,
        onTransient,
      }),
    ).toBe(true);
    expect(onTransient).toHaveBeenCalledTimes(1);
    expect(onRelogin).not.toHaveBeenCalled();
  });

  it("handleTeamverDriveAuthFailure silently recovers Main SSO mismatch without relogin CTA", () => {
    const onRelogin = vi.fn();
    const onTransient = vi.fn();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    expect(
      handleTeamverDriveAuthFailure(new Error("teamver_drive_main_sso_user_mismatch"), {
        onRelogin,
        onTransient,
      }),
    ).toBe(true);
    expect(beginMainSsoMismatchRecovery).toHaveBeenCalledTimes(1);
    expect(onTransient).not.toHaveBeenCalled();
    expect(onRelogin).not.toHaveBeenCalled();
  });

  it("handleTeamverDriveAuthFailure prefers retry when Main SSO required but Design still authenticated", () => {
    const onRelogin = vi.fn();
    const onTransient = vi.fn();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    expect(
      handleTeamverDriveAuthFailure(new Error("teamver_drive_main_sso_required"), {
        onRelogin,
        onTransient,
      }),
    ).toBe(true);
    expect(onTransient).toHaveBeenCalledTimes(1);
    expect(onRelogin).not.toHaveBeenCalled();
  });

  it("handleTeamverDriveAuthFailure escalates Main SSO required to relogin when Design is logged out", () => {
    const onRelogin = vi.fn();
    const onTransient = vi.fn();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(false);

    expect(
      handleTeamverDriveAuthFailure(new Error("teamver_drive_main_sso_required"), {
        onRelogin,
        onTransient,
      }),
    ).toBe(true);
    expect(onRelogin).toHaveBeenCalledTimes(1);
    expect(onTransient).not.toHaveBeenCalled();
  });

  it("formatTeamverEmbedAuthRequiredMessage prefers transient copy while authenticated", () => {
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    expect(
      formatTeamverEmbedAuthRequiredMessage("로그인 세션이 만료되었습니다."),
    ).toContain("연결");
  });
});

describe("formatTeamverEmbedOperationFailureMessage", () => {
  beforeEach(() => {
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
  });

  it("maps daemon unauthorized errors to transient copy while authenticated", () => {
    expect(
      formatTeamverEmbedOperationFailureMessage(
        new TeamverDaemonUnauthorizedError(),
        "fallback",
        { logoutMessage: "logout", transientMessage: "transient" },
      ),
    ).toBe("transient");
  });

  it("preserves already-formatted export auth messages", () => {
    expect(
      formatTeamverEmbedOperationFailureMessage(
        new Error("내보내기 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요."),
        "fallback",
      ),
    ).toContain("연결");
  });
});

describe("notifyTeamverEmbedAuthFailureIfNeeded", () => {
  beforeEach(() => {
    passiveAuthMock.mockReset();
  });

  it("notifies passive auth recovery for daemon unauthorized errors", () => {
    notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), "daemon");
    expect(passiveAuthMock).toHaveBeenCalledWith("daemon");
  });

  it("notifies passive auth recovery for BFF 401 errors", () => {
    notifyTeamverEmbedAuthFailureIfNeeded(
      new NetworkError({ status: 401, message: "unauth" }),
      "bff",
    );
    expect(passiveAuthMock).toHaveBeenCalledWith("bff");
  });
});

describe("redirectToTeamverLoginFromEmbed", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    resolveReturnMock.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/projects/PRJ-1/conversations/CVR-1/files/deck.html",
        search: "?ts=1",
      },
    });
  });

  it("delegates to redirectToTeamverLoginPreservingRoute with the current embed route as returnTo", () => {
    redirectToTeamverLoginFromEmbed();
    expect(resolveReturnMock).toHaveBeenCalledWith(
      "/projects/PRJ-1/conversations/CVR-1/files/deck.html",
      "?ts=1",
    );
    expect(redirectMock).toHaveBeenCalledWith({
      returnTo: "/projects/PRJ-1/conversations/CVR-1/files/deck.html?ts=1",
    });
  });
});

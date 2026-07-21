import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/teamver/designBffClient", () => ({
  fetchDesignAuthSession: vi.fn(),
  refreshDesignAuthCookie: vi.fn(),
  probeDesignBffSessionAuthenticated: vi.fn(async () => false),
  isDesignAuthRefreshDeclined: vi.fn(() => false),
  isDesignAuthRefreshDeclineHard: vi.fn(() => false),
}));

vi.mock("../src/teamver/designApiBase", () => ({
  resolveTeamverDriveBffBase: vi.fn(() => "/teamver-bff/drive"),
}));

vi.mock("../src/teamver/driveWorkspaceRecovery", () => ({
  recoverStaleDriveWorkspace: vi.fn(),
}));

vi.mock("../src/teamver/teamverEmbedSession", () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => false),
}));

vi.mock("../src/teamver/mainSsoMismatchRecovery", () => ({
  beginMainSsoMismatchRecovery: vi.fn(() => Promise.resolve()),
}));

import {
  extractDriveAuthBodyText,
  driveErrorCodeForStatus,
  getTeamverDriveJson,
  isDriveMainSsoGateBody,
  isDriveMainSsoRequiredBody,
  isDriveMainSsoUserMismatchBody,
  isDriveWorkspaceForbiddenBody,
  isTeamverDriveMainSsoGateError,
  isTeamverDriveMainSsoRequiredError,
  isTeamverDriveMainSsoUserMismatchError,
  postTeamverDriveJson,
  resetTeamverDriveFetchQueueForTests,
  shouldSkipDriveAuthRefresh,
} from "../src/teamver/driveApi";
import { beginMainSsoMismatchRecovery } from "../src/teamver/mainSsoMismatchRecovery";
import {
  fetchDesignAuthSession,
  isDesignAuthRefreshDeclineHard,
  isDesignAuthRefreshDeclined,
  probeDesignBffSessionAuthenticated,
  refreshDesignAuthCookie,
} from "../src/teamver/designBffClient";
import { recoverStaleDriveWorkspace } from "../src/teamver/driveWorkspaceRecovery";
import { isTeamverEmbedSessionAuthenticated } from "../src/teamver/teamverEmbedSession";

const mockedRefresh = vi.mocked(refreshDesignAuthCookie);
const mockedFetchSession = vi.mocked(fetchDesignAuthSession);
const mockedProbe = vi.mocked(probeDesignBffSessionAuthenticated);
const mockedRecoverWorkspace = vi.mocked(recoverStaleDriveWorkspace);
const mockedEmbedAuthed = vi.mocked(isTeamverEmbedSessionAuthenticated);
const mockedDeclined = vi.mocked(isDesignAuthRefreshDeclined);
const mockedHardDecline = vi.mocked(isDesignAuthRefreshDeclineHard);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("shouldSkipDriveAuthRefresh", () => {
  it("skips terminal BFF / Main auth bodies", () => {
    expect(shouldSkipDriveAuthRefresh("session_expired")).toBe(true);
    expect(shouldSkipDriveAuthRefresh("Unauthorized")).toBe(true);
    expect(shouldSkipDriveAuthRefresh("Invalid token")).toBe(true);
    expect(shouldSkipDriveAuthRefresh("error.authentication")).toBe(true);
    expect(shouldSkipDriveAuthRefresh("missing_access_token")).toBe(true);
    expect(shouldSkipDriveAuthRefresh({ message: "Invalid token" })).toBe(true);
  });

  it("reads DesignDomainError nested error.message as session_expired", () => {
    const body = { error: { code: "unauthorized", message: "session_expired" } };
    expect(extractDriveAuthBodyText(body)).toBe("session_expired");
    expect(shouldSkipDriveAuthRefresh(extractDriveAuthBodyText(body))).toBe(true);
  });

  it("skips Main ACL / workspace forbid bodies (no Apps refresh)", () => {
    expect(shouldSkipDriveAuthRefresh("forbidden")).toBe(true);
    expect(shouldSkipDriveAuthRefresh("error.forbidden")).toBe(true);
    expect(shouldSkipDriveAuthRefresh("error.workspace.not_member")).toBe(true);
    expect(extractDriveAuthBodyText({ message: "error.forbidden" })).toBe("error.forbidden");
    expect(isDriveWorkspaceForbiddenBody("error.forbidden")).toBe(true);
    expect(isDriveWorkspaceForbiddenBody(extractDriveAuthBodyText({ message: "error.forbidden" }))).toBe(
      true,
    );
  });

  it("skips Main SSO required and user-mismatch bodies", () => {
    expect(shouldSkipDriveAuthRefresh("main_sso_required")).toBe(true);
    expect(shouldSkipDriveAuthRefresh("main_sso_user_mismatch")).toBe(true);
  });

  it("does not skip unrelated failures", () => {
    expect(shouldSkipDriveAuthRefresh(null)).toBe(false);
    expect(shouldSkipDriveAuthRefresh({ code: "x" })).toBe(false);
    expect(isDriveWorkspaceForbiddenBody("session_expired")).toBe(false);
  });

  it("classifies Main SSO user mismatch separately from expired Main SSO", () => {
    const mismatch = { detail: "main_sso_user_mismatch", code: "main_sso_user_mismatch" };
    const expired = { detail: "main_sso_required", re_login_scope: "main" };

    expect(shouldSkipDriveAuthRefresh("main_sso_user_mismatch")).toBe(true);
    expect(isDriveMainSsoUserMismatchBody(mismatch)).toBe(true);
    expect(isDriveMainSsoRequiredBody(mismatch)).toBe(false);
    expect(isDriveMainSsoGateBody(mismatch)).toBe(true);
    expect(isDriveMainSsoUserMismatchBody(expired)).toBe(false);
    expect(isDriveMainSsoRequiredBody(expired)).toBe(true);
    expect(isDriveMainSsoGateBody(expired)).toBe(true);
    expect(driveErrorCodeForStatus(401, mismatch)).toBe("teamver_drive_main_sso_user_mismatch");
    expect(driveErrorCodeForStatus(401, expired)).toBe("teamver_drive_main_sso_required");
    expect(isTeamverDriveMainSsoUserMismatchError(new Error("teamver_drive_main_sso_user_mismatch"))).toBe(true);
    expect(isTeamverDriveMainSsoRequiredError(new Error("teamver_drive_main_sso_required"))).toBe(true);
    expect(isTeamverDriveMainSsoGateError(new Error("teamver_drive_main_sso_user_mismatch"))).toBe(true);
  });
});

describe("getTeamverDriveJson", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedRefresh.mockReset();
    mockedFetchSession.mockReset();
    mockedProbe.mockReset();
    mockedProbe.mockResolvedValue(false);
    mockedRecoverWorkspace.mockReset();
    mockedRecoverWorkspace.mockResolvedValue(null);
    mockedEmbedAuthed.mockReset();
    mockedEmbedAuthed.mockReturnValue(false);
    mockedDeclined.mockReset();
    mockedDeclined.mockReturnValue(false);
    mockedHardDecline.mockReset();
    mockedHardDecline.mockReturnValue(false);
    resetTeamverDriveFetchQueueForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls same-origin BFF drive proxy on 200 without refresh", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ shared_drive_id: "sd-1" }));
    const jsonPromise = getTeamverDriveJson("/api/foo");
    const json = await jsonPromise;
    expect(json).toEqual({ sharedDriveId: "sd-1" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/teamver-bff/drive/api/foo",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("retries once after BFF refresh on 401 and returns the second body", async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return new Response("", { status: 401 });
      return jsonResponse({ ok: true });
    });
    mockedRefresh.mockResolvedValue(true);

    const json = await getTeamverDriveJson("/api/foo");

    expect(json).toEqual({ ok: true });
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("soft-retries session_expired once without posting /auth/refresh", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const pending = getTeamverDriveJson("/api/foo");
    await vi.advanceTimersByTimeAsync(400);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedFetchSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not force a session probe when session_expired survives soft retry and embed is cold", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401));

    const pending = getTeamverDriveJson("/api/drive/folder?shallow_tree=true");
    const expectation = expect(pending).rejects.toThrow("teamver_drive_fetch_failed:401");
    await vi.advanceTimersByTimeAsync(400);
    await expectation;
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedFetchSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("recovers session_expired after soft retry when embed still looks signed in", async () => {
    mockedEmbedAuthed.mockReturnValue(true);
    mockedRefresh.mockResolvedValue(false);
    mockedFetchSession.mockResolvedValue({ authenticated: true } as never);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const pending = getTeamverDriveJson("/api/foo");
    await vi.advanceTimersByTimeAsync(400);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedFetchSession).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not recover Invalid token after soft retry (no Apps refresh rotation)", async () => {
    mockedEmbedAuthed.mockReturnValue(true);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ detail: "Invalid token" }, 401));

    const pending = getTeamverDriveJson("/api/foo");
    const expectation = expect(pending).rejects.toThrow("teamver_drive_fetch_failed:401");
    await vi.advanceTimersByTimeAsync(400);
    await expectation;
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedFetchSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("surfaces Main SSO user mismatch without BFF refresh or soft retry", async () => {
    mockedEmbedAuthed.mockReturnValue(true);
    const body = {
      detail: "main_sso_user_mismatch",
      code: "main_sso_user_mismatch",
      re_login_scope: "main",
      login_url: "https://stg.teamver.com/auth/signin",
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(body, 401));

    await expect(getTeamverDriveJson("/api/v2/shared-drive")).rejects.toThrow(
      "teamver_drive_main_sso_user_mismatch",
    );
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedFetchSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(beginMainSsoMismatchRecovery).toHaveBeenCalled();
  });

  it("does not recover session_expired under hard sticky when survival ladder fails", async () => {
    mockedEmbedAuthed.mockReturnValue(true);
    mockedDeclined.mockReturnValue(true);
    mockedHardDecline.mockReturnValue(true);
    mockedRefresh.mockResolvedValue(false);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401));

    const pending = getTeamverDriveJson("/api/foo");
    const expectation = expect(pending).rejects.toThrow("teamver_drive_fetch_failed:401");
    await vi.advanceTimersByTimeAsync(400);
    await expectation;
    // Sticky: fail-fast — no refresh/survival ladder (C1 owns recovery).
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedProbe).not.toHaveBeenCalled();
    expect(mockedFetchSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not recover session_expired under sticky even if refresh would revive", async () => {
    mockedEmbedAuthed.mockReturnValue(true);
    mockedDeclined.mockReturnValue(true);
    mockedHardDecline.mockReturnValue(true);
    mockedRefresh.mockResolvedValue(true);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401));

    const pending = getTeamverDriveJson("/api/foo");
    const expectation = expect(pending).rejects.toThrow("teamver_drive_fetch_failed:401");
    await vi.advanceTimersByTimeAsync(400);
    await expectation;
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedProbe).not.toHaveBeenCalled();
    expect(mockedFetchSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("soft-retries Invalid token once before /auth/refresh", async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return jsonResponse({ detail: "Invalid token" }, 401);
      return jsonResponse({ items: [] });
    });

    const pending = getTeamverDriveJson("/api/v2/shared-drive");
    await vi.advanceTimersByTimeAsync(400);
    const json = await pending;
    expect(json).toEqual({ items: [] });
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws 401 after soft retry without BFF recover for terminal Drive auth bodies", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401));

    const pending = getTeamverDriveJson("/api/foo");
    const expectation = expect(pending).rejects.toThrow("teamver_drive_fetch_failed:401");
    await vi.advanceTimersByTimeAsync(400);
    await expectation;
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedFetchSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws teamver_drive_fetch_failed:401 when refresh declines (no retry)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 401 }));
    mockedRefresh.mockResolvedValue(false);
    mockedFetchSession.mockResolvedValue({ authenticated: false });

    await expect(getTeamverDriveJson("/api/foo")).rejects.toThrow(
      "teamver_drive_fetch_failed:401",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockedFetchSession).toHaveBeenCalledWith({ force: true });
  });

  it("surfaces Main ACL 403 without /auth/refresh when reconciliation cannot fix it", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ message: "error.forbidden" }, 403));
    mockedRecoverWorkspace.mockResolvedValueOnce(null);

    await expect(getTeamverDriveJson("/api/v2/shared-drive", "ws-stale")).rejects.toThrow(
      "teamver_drive_fetch_failed:403",
    );
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedFetchSession).not.toHaveBeenCalled();
    expect(mockedRecoverWorkspace).toHaveBeenCalledWith("ws-stale");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces main_sso_user_mismatch immediately without BFF refresh", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          detail: "main_sso_user_mismatch",
          code: "main_sso_user_mismatch",
          re_login_scope: "main",
          login_url: "https://stg.teamver.com/auth/signin",
        },
        401,
      ),
    );

    await expect(getTeamverDriveJson("/api/v2/shared-drive", "ws-1")).rejects.toThrow(
      "teamver_drive_main_sso_user_mismatch",
    );
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedFetchSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(beginMainSsoMismatchRecovery).toHaveBeenCalled();
  });

  it("surfaces main_sso_required without BFF refresh when Design session memory is logged out", async () => {
    mockedEmbedAuthed.mockReturnValue(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          detail: "main_sso_required",
          code: "main_sso_required",
          re_login_scope: "main",
        },
        401,
      ),
    );

    await expect(getTeamverDriveJson("/api/v2/shared-drive")).rejects.toThrow(
      "teamver_drive_main_sso_required",
    );
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("delay-retries main_sso_required when Design session memory is still authenticated", async () => {
    mockedEmbedAuthed.mockReturnValue(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse(
          {
            detail: "main_sso_required",
            code: "main_sso_required",
            re_login_scope: "main",
          },
          401,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            detail: "main_sso_required",
            code: "main_sso_required",
            re_login_scope: "main",
          },
          401,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ drives: [] }));

    const pending = getTeamverDriveJson("/api/v2/shared-drive");
    await vi.advanceTimersByTimeAsync(400);
    await vi.advanceTimersByTimeAsync(400);
    await expect(pending).resolves.toEqual({ drives: [] });
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("recovers Main ACL 403 by reconciling stale workspace_id and retrying once", async () => {
    let call = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      call += 1;
      if (call === 1) return jsonResponse({ message: "error.forbidden" }, 403);
      const headers = init?.headers as Headers | undefined;
      const wsHeader = headers?.get("X-Workspace-Id") ?? null;
      return jsonResponse({ ok: true, ws: wsHeader });
    });
    mockedRecoverWorkspace.mockResolvedValueOnce("ws-fresh");

    const json = await getTeamverDriveJson("/api/v2/shared-drive", "ws-stale");
    expect(json).toEqual({ ok: true, ws: "ws-fresh" });
    expect(mockedRecoverWorkspace).toHaveBeenCalledWith("ws-stale");
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("forwards X-Workspace-Id header when provided", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({}));
    await getTeamverDriveJson("/api/foo", "  ws-1  ");
    const headers = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("X-Workspace-Id")).toBe("ws-1");
  });
});

describe("postTeamverDriveJson", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedRefresh.mockReset();
    mockedFetchSession.mockReset();
    resetTeamverDriveFetchQueueForTests();
  });

  it("POSTs JSON body to BFF drive proxy", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ items: [] }));
    await postTeamverDriveJson("/api/v2/asset/object-url/batch", { items: [] }, "ws-1");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/teamver-bff/drive/api/v2/asset/object-url/batch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ items: [] }),
      }),
    );
  });
});

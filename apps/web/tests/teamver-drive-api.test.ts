import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/teamver/designBffClient", () => ({
  fetchDesignAuthSession: vi.fn(),
  refreshDesignAuthCookie: vi.fn(),
}));

vi.mock("../src/teamver/designApiBase", () => ({
  resolveTeamverDriveBffBase: vi.fn(() => "/teamver-bff/drive"),
}));

import {
  getTeamverDriveJson,
  postTeamverDriveJson,
  resetTeamverDriveFetchQueueForTests,
  shouldSkipDriveAuthRefresh,
} from "../src/teamver/driveApi";
import { fetchDesignAuthSession, refreshDesignAuthCookie } from "../src/teamver/designBffClient";

const mockedRefresh = vi.mocked(refreshDesignAuthCookie);
const mockedFetchSession = vi.mocked(fetchDesignAuthSession);

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

  it("does not skip unrelated failures", () => {
    expect(shouldSkipDriveAuthRefresh("forbidden")).toBe(false);
    expect(shouldSkipDriveAuthRefresh(null)).toBe(false);
    expect(shouldSkipDriveAuthRefresh({ code: "x" })).toBe(false);
  });
});

describe("getTeamverDriveJson", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedRefresh.mockReset();
    mockedFetchSession.mockReset();
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

  it("tries coalesced BFF refresh when session_expired survives the soft retry", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    mockedRefresh.mockResolvedValue(true);

    const pending = getTeamverDriveJson("/api/foo");
    await vi.advanceTimersByTimeAsync(300);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedFetchSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("forces a fresh session probe when terminal Drive 401 survives soft retry and refresh declines", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    mockedRefresh.mockResolvedValue(false);
    mockedFetchSession.mockResolvedValue({ authenticated: true });

    const pending = getTeamverDriveJson("/api/drive/folder?shallow_tree=true");
    await vi.advanceTimersByTimeAsync(300);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedFetchSession).toHaveBeenCalledWith({ force: true, resetRefreshState: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("soft-retries Invalid token once before /auth/refresh", async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return jsonResponse({ detail: "Invalid token" }, 401);
      return jsonResponse({ items: [] });
    });

    const pending = getTeamverDriveJson("/api/v2/shared-drive");
    await vi.advanceTimersByTimeAsync(300);
    const json = await pending;
    expect(json).toEqual({ items: [] });
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws 401 only after soft retry and BFF refresh both fail", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ detail: "session_expired", login_url: "https://x" }, 401));
    mockedRefresh.mockResolvedValue(false);
    mockedFetchSession.mockResolvedValue({ authenticated: false });

    const pending = getTeamverDriveJson("/api/foo");
    const expectation = expect(pending).rejects.toThrow("teamver_drive_fetch_failed:401");
    await vi.advanceTimersByTimeAsync(300);
    await expectation;
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedFetchSession).toHaveBeenCalledWith({ force: true, resetRefreshState: true });
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
    expect(mockedFetchSession).toHaveBeenCalledWith({ force: true, resetRefreshState: true });
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

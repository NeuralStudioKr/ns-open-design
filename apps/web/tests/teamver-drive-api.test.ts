import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/teamver/designBffClient", () => ({
  refreshDesignAuthCookie: vi.fn(),
}));

import { getTeamverDriveJson } from "../src/teamver/driveApi";
import { refreshDesignAuthCookie } from "../src/teamver/designBffClient";

const mockedRefresh = vi.mocked(refreshDesignAuthCookie);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getTeamverDriveJson", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedRefresh.mockReset();
  });

  it("returns camelCased body on 200 without refresh", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ shared_drive_id: "sd-1" }));
    const json = await getTeamverDriveJson("/api/foo");
    expect(json).toEqual({ sharedDriveId: "sd-1" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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

  it("retries once after BFF refresh on 403 and returns the second body", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return new Response("", { status: 403 });
      return jsonResponse({ ok: true });
    });
    mockedRefresh.mockResolvedValue(true);

    const json = await getTeamverDriveJson("/api/foo");
    expect(json).toEqual({ ok: true });
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
  });

  it("throws teamver_drive_fetch_failed:401 when refresh declines (no retry)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 401 }));
    mockedRefresh.mockResolvedValue(false);

    await expect(getTeamverDriveJson("/api/foo")).rejects.toThrow(
      "teamver_drive_fetch_failed:401",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on non-auth status (e.g. 500)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    await expect(getTeamverDriveJson("/api/foo")).rejects.toThrow(
      "teamver_drive_fetch_failed:500",
    );
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("forwards X-Workspace-Id header when provided", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({}));
    await getTeamverDriveJson("/api/foo", "  ws-1  ");
    const headers = (fetchSpy.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers["X-Workspace-Id"]).toBe("ws-1");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("omits X-Workspace-Id when workspaceId is empty/whitespace", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({}));
    await getTeamverDriveJson("/api/foo", "   ");
    const headers = (fetchSpy.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers["X-Workspace-Id"]).toBeUndefined();
  });
});

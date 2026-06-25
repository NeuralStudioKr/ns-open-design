import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/teamver/designBffClient", () => ({
  refreshDesignAuthCookie: vi.fn(),
}));

vi.mock("../src/teamver/designApiBase", () => ({
  resolveTeamverDriveBffBase: vi.fn(() => "/teamver-bff/drive"),
}));

import { getTeamverDriveJson, postTeamverDriveJson } from "../src/teamver/driveApi";
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

  it("calls same-origin BFF drive proxy on 200 without refresh", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ shared_drive_id: "sd-1" }));
    const json = await getTeamverDriveJson("/api/foo");
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

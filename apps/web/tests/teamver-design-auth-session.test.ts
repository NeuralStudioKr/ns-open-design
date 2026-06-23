// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  resolveTeamverDesignApiBase: vi.fn(() => ""),
  resolveTeamverDesignApiCrossOriginFallback: vi.fn(() => null),
  resolveDesignBffRefreshUrl: vi.fn(() => "/teamver-bff/auth/refresh"),
  redirectToTeamverLogin: vi.fn(),
  resolveTeamverMainApiBaseUrl: vi.fn(() => "https://stg-api.teamver.com"),
}));

const getMock = vi.fn();

vi.mock("@teamver/app-sdk", () => ({
  TeamverClient: class MockTeamverClient {
    http = { get: getMock };
  },
  createLocalStorageWorkspaceStore: vi.fn(() => ({})),
  snakeToCamelDeep: (value: unknown) => value,
  NetworkError: class NetworkError extends Error {
    status: number;
    constructor(opts: { status: number; message: string }) {
      super(opts.message);
      this.status = opts.status;
    }
  },
}));

describe("fetchDesignAuthSession", () => {
  afterEach(() => {
    getMock.mockReset();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("retries session after cookie refresh when first probe is unauthenticated", async () => {
    getMock
      .mockResolvedValueOnce({ authenticated: false, workspaces: [] })
      .mockResolvedValueOnce({
        authenticated: true,
        user: { userId: "user-1" },
        workspaces: [{ id: "WS-1", name: "Alpha" }],
      });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession();

    expect(fetchMock).toHaveBeenCalledWith(
      "/teamver-bff/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(session?.authenticated).toBe(true);
  });

  it("coalesces concurrent session probes into one upstream round-trip", async () => {
    getMock.mockResolvedValue({
      authenticated: true,
      user: { userId: "user-1" },
      workspaces: [],
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const [a, b] = await Promise.all([
      fetchDesignAuthSession(),
      fetchDesignAuthSession(),
    ]);

    expect(a?.authenticated).toBe(true);
    expect(b?.authenticated).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to Main BE refresh when same-origin BFF refresh fails", async () => {
    getMock
      .mockResolvedValueOnce({ authenticated: false, workspaces: [] })
      .mockResolvedValueOnce({
        authenticated: true,
        user: { userId: "user-1" },
        workspaces: [],
      });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/teamver-bff/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://stg-api.teamver.com/api/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(session?.authenticated).toBe(true);
  });
});

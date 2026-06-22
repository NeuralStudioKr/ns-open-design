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
});

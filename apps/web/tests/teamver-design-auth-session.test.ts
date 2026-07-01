// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/teamverAuthCookieHints", () => ({
  hasProbableTeamverAuthCookie: vi.fn(() => {
    if (typeof document === "undefined") return false;
    return document.cookie.includes("teamver_access_token=")
      || document.cookie.includes("teamver_refresh_token=");
  }),
}));

vi.mock("../src/teamver/teamverEmbedSession", () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => false),
}));

vi.mock("../src/teamver/designApiBase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teamver/designApiBase")>();
  return {
    ...actual,
    isTeamverEmbedMode: vi.fn(() => true),
    resolveTeamverDesignApiBase: vi.fn(() => ""),
    resolveTeamverDesignApiCrossOriginFallback: vi.fn(() => null),
    resolveDesignBffRefreshUrl: vi.fn(() => "/teamver-bff/auth/refresh"),
    redirectToTeamverLogin: vi.fn(),
    resolveTeamverMainApiBaseUrl: vi.fn(() => "https://stg-api.teamver.com"),
  };
});

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

import { isTeamverEmbedSessionAuthenticated } from "../src/teamver/teamverEmbedSession";
import { hasProbableTeamverAuthCookie } from "../src/teamver/teamverAuthCookieHints";

async function forceBareAuthCookieHints(): Promise<void> {
  document.cookie = "";
  vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(false);
  vi.mocked(hasProbableTeamverAuthCookie).mockReturnValue(false);
}

describe("fetchDesignAuthSession", () => {
  afterEach(async () => {
    getMock.mockReset();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    document.cookie = "";
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(false);
    vi.mocked(hasProbableTeamverAuthCookie).mockImplementation(() => {
      if (typeof document === "undefined") return false;
      return document.cookie.includes("teamver_access_token=")
        || document.cookie.includes("teamver_refresh_token=");
    });
    const { resetDesignAuthRefreshDeclinedForTests, resetDesignAuthSessionCacheForTests } =
      await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    resetDesignAuthSessionCacheForTests();
  });

  beforeEach(() => {
    document.cookie = "";
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(false);
    vi.mocked(hasProbableTeamverAuthCookie).mockImplementation(() => {
      if (typeof document === "undefined") return false;
      return document.cookie.includes("teamver_access_token=")
        || document.cookie.includes("teamver_refresh_token=");
    });
  });

  it("attempts one BFF refresh without visible cookies, then stops on 400", async () => {
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/teamver-bff/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(session?.authenticated).toBe(false);
  });

  it("retries session after HttpOnly-only refresh succeeds (no visible cookie)", async () => {
    getMock
      .mockResolvedValueOnce({ authenticated: false, workspaces: [] })
      .mockResolvedValueOnce({
        authenticated: true,
        user: { userId: "user-1" },
        workspaces: [{ id: "WS-1", name: "Alpha" }],
      });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session?.authenticated).toBe(true);
  });

  it("retries session after cookie refresh when first probe is unauthenticated", async () => {
    document.cookie = "teamver_access_token=stale";
    getMock
      .mockResolvedValueOnce({ authenticated: false, workspaces: [] })
      .mockResolvedValueOnce({
        authenticated: true,
        user: { userId: "user-1" },
        workspaces: [{ id: "WS-1", name: "Alpha" }],
      });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
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

  it("does not retry refresh after bare BFF 400 on a second session probe", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    await fetchDesignAuthSession();
    await fetchDesignAuthSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call Main BE refresh on bare HttpOnly attempt when BFF returns 502", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("stg-api.teamver.com")),
    ).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/teamver-bff/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(session?.authenticated).toBe(false);
  });

  it("stops after BFF refresh 400 without extra Main BE calls when cookie hint exists", async () => {
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/teamver-bff/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(session?.authenticated).toBe(false);
  });

  // loop 380 — visibility-change auto-refresh must NOT keep retrying a
  // declined `/teamver-bff/auth/refresh`. Previously
  // `invalidateDesignAuthSessionCache()` also reset the sticky decline marker,
  // so every tab focus re-fired the 400. Now `force: true` only busts the
  // session cache; the decline guard stays in place until an explicit
  // `resetRefreshState: true` (banner retry) or new cookie hint appears.
  it("keeps the refresh-decline marker sticky across force:true session probes", async () => {
    document.cookie = "teamver_access_token=stale";
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");

    await fetchDesignAuthSession();
    await fetchDesignAuthSession({ force: true });
    await fetchDesignAuthSession({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resetRefreshState: true on an explicit retry sends a fresh refresh attempt", async () => {
    document.cookie = "teamver_access_token=stale";
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");

    await fetchDesignAuthSession();
    await fetchDesignAuthSession({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Banner "다시 시도" path — explicit decline reset.
    await fetchDesignAuthSession({ force: true, resetRefreshState: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidateDesignAuthSessionCache preserves the refresh-decline guard", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession, invalidateDesignAuthSessionCache } = await import(
      "../src/teamver/designBffClient"
    );

    await fetchDesignAuthSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateDesignAuthSessionCache();
    await fetchDesignAuthSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resetDesignAuthRefreshState releases the decline guard on next probe", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession, resetDesignAuthRefreshState } = await import(
      "../src/teamver/designBffClient"
    );

    await fetchDesignAuthSession();
    await fetchDesignAuthSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetDesignAuthRefreshState();
    await fetchDesignAuthSession({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resetDesignAuthBareRefreshAttempt re-enables HttpOnly-only refresh without clearing 400 decline", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const {
      fetchDesignAuthSession,
      isDesignAuthRefreshDeclined,
      resetDesignAuthBareRefreshAttempt,
    } = await import("../src/teamver/designBffClient");

    await fetchDesignAuthSession();
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetDesignAuthBareRefreshAttempt();
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    await fetchDesignAuthSession({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resetDesignAuthBareRefreshAttempt allows another bare refresh when not declined", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession, resetDesignAuthBareRefreshAttempt } = await import(
      "../src/teamver/designBffClient"
    );

    await fetchDesignAuthSession();
    await fetchDesignAuthSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetDesignAuthBareRefreshAttempt();
    await fetchDesignAuthSession({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

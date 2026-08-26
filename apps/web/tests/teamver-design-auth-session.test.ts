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
  setTeamverEmbedSessionAuthenticated: vi.fn(),
}));

vi.mock("../src/teamver/designApiBase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teamver/designApiBase")>();
  return {
    ...actual,
    isTeamverEmbedMode: vi.fn(() => true),
    isBootstrapAuthMode: vi.fn(() => true),
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
  AuthenticationError: class AuthenticationError extends Error {
    status: number;
    constructor(opts: { status: number; message: string }) {
      super(opts.message);
      this.name = "AuthenticationError";
      this.status = opts.status;
    }
  },
}));

const maybeReconcileMainSsoMock = vi.fn(async () => false);

vi.mock("../src/teamver/teamverMainSsoUserReconcile", () => ({
  maybeReconcileMainSsoWithDesignSession: (...args: unknown[]) =>
    maybeReconcileMainSsoMock(...args),
}));

import { isTeamverEmbedSessionAuthenticated } from "../src/teamver/teamverEmbedSession";
import { hasProbableTeamverAuthCookie } from "../src/teamver/teamverAuthCookieHints";

function authRefreshPostCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes("/auth/refresh"));
}

function expectAuthRefreshPosts(fetchMock: ReturnType<typeof vi.fn>, count: number) {
  expect(authRefreshPostCalls(fetchMock)).toHaveLength(count);
}

async function forceBareAuthCookieHints(): Promise<void> {
  document.cookie = "";
  vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(false);
  vi.mocked(hasProbableTeamverAuthCookie).mockReturnValue(false);
}

describe("fetchDesignAuthSession", () => {
  afterEach(async () => {
    getMock.mockReset();
    maybeReconcileMainSsoMock.mockReset();
    maybeReconcileMainSsoMock.mockResolvedValue(false);
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

  it("does not post BFF refresh for a bare unauthenticated bootstrap session", async () => {
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(session?.authenticated).toBe(false);
    expect(maybeReconcileMainSsoMock).not.toHaveBeenCalled();
  });

  it("gates authenticated session when Main SSO reconcile triggers recovery", async () => {
    maybeReconcileMainSsoMock.mockResolvedValueOnce(true);
    getMock.mockResolvedValue({
      authenticated: true,
      mainSsoStatus: "mismatch",
      user: { userId: "user-a" },
      workspaces: [],
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession({ force: true });

    expect(maybeReconcileMainSsoMock).toHaveBeenCalledTimes(1);
    expect(session?.authenticated).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries session probe after refresh declines when a sibling may have set cookies", async () => {
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    const { NetworkError } = await import("@teamver/app-sdk");
    getMock
      .mockRejectedValueOnce(new NetworkError({ status: 401, message: "session_expired" }))
      .mockResolvedValueOnce({
        authenticated: true,
        user: { userId: "user-1" },
        workspaces: [{ id: "WS-1", name: "Alpha" }],
      });

    vi.useFakeTimers();
    // Refresh 401 → HA probe ladder → sibling session may revive before soft-decline.
    let probeCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/auth/refresh")) {
        return new Response(JSON.stringify({ error: { code: "session_expired" } }), { status: 401 });
      }
      if (String(url).includes("/auth/session-probe")) {
        probeCalls += 1;
        if (probeCalls >= 2) {
          return new Response(null, { status: 204 });
        }
        return new Response(null, { status: 401 });
      }
      return new Response(JSON.stringify({ authenticated: false }), { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const pending = fetchDesignAuthSession({ force: true, resetRefreshState: true });
    // Flush microtasks so refresh schedules its HA soft-retry timer, then advance.
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_200);
    const session = await pending;

    expect(authRefreshPostCalls(fetchMock).length).toBeGreaterThan(0);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(session?.authenticated).toBe(true);
    vi.useRealTimers();
  });

  it("retries session after explicit auth recovery refresh succeeds", async () => {
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
    const session = await fetchDesignAuthSession({ force: true, resetRefreshState: true });

    expectAuthRefreshPosts(fetchMock, 1);
    expect(session?.authenticated).toBe(true);
  });

  it("does not use legacy visible-cookie refresh in bootstrap auth mode", async () => {
    document.cookie = "teamver_access_token=stale";
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(session?.authenticated).toBe(false);
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

  it("does not attempt bare BFF refresh on repeated session probes", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    await fetchDesignAuthSession();
    await fetchDesignAuthSession();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call any refresh endpoint for a bare HttpOnly bootstrap probe", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(session?.authenticated).toBe(false);
  });

  it("does not post BFF refresh from legacy cookie hints in bootstrap mode", async () => {
    document.cookie = "teamver_access_token=stale";
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");
    const session = await fetchDesignAuthSession();

    expect(fetchMock).not.toHaveBeenCalled();
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

    await fetchDesignAuthSession({ force: true, resetRefreshState: true });
    await fetchDesignAuthSession({ force: true });
    await fetchDesignAuthSession({ force: true });

    expectAuthRefreshPosts(fetchMock, 1);
  });

  it("resetRefreshState: true on an explicit retry sends a fresh refresh attempt", async () => {
    document.cookie = "teamver_access_token=stale";
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession } = await import("../src/teamver/designBffClient");

    await fetchDesignAuthSession({ force: true, resetRefreshState: true });
    await fetchDesignAuthSession({ force: true });
    expectAuthRefreshPosts(fetchMock, 1);

    // Banner "다시 시도" path — explicit decline reset.
    await fetchDesignAuthSession({ force: true, resetRefreshState: true });
    expectAuthRefreshPosts(fetchMock, 2);
  });

  it("invalidateDesignAuthSessionCache preserves the refresh-decline guard", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession, invalidateDesignAuthSessionCache } = await import(
      "../src/teamver/designBffClient"
    );

    await fetchDesignAuthSession({ force: true, resetRefreshState: true });
    expectAuthRefreshPosts(fetchMock, 1);

    invalidateDesignAuthSessionCache();
    await fetchDesignAuthSession();
    expectAuthRefreshPosts(fetchMock, 1);
  });

  it("resetDesignAuthRefreshState releases the decline guard on next probe", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession, resetDesignAuthRefreshState } = await import(
      "../src/teamver/designBffClient"
    );

    await fetchDesignAuthSession({ force: true, resetRefreshState: true });
    await fetchDesignAuthSession({ force: true });
    expectAuthRefreshPosts(fetchMock, 1);

    resetDesignAuthRefreshState();
    await fetchDesignAuthSession({ force: true });
    expectAuthRefreshPosts(fetchMock, 1);
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

    await fetchDesignAuthSession({ force: true, resetRefreshState: true });
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    expectAuthRefreshPosts(fetchMock, 1);

    resetDesignAuthBareRefreshAttempt();
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    await fetchDesignAuthSession({ force: true });
    expectAuthRefreshPosts(fetchMock, 1);
  });

  it("resetDesignAuthBareRefreshAttempt allows another bare refresh when not declined", async () => {
    await forceBareAuthCookieHints();
    getMock.mockResolvedValue({ authenticated: false, workspaces: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDesignAuthSession, resetDesignAuthBareRefreshAttempt } = await import(
      "../src/teamver/designBffClient"
    );

    await fetchDesignAuthSession({ force: true, resetRefreshState: true });
    await fetchDesignAuthSession();
    expectAuthRefreshPosts(fetchMock, 1);

    resetDesignAuthBareRefreshAttempt();
    await fetchDesignAuthSession({ force: true });
    expectAuthRefreshPosts(fetchMock, 1);
  });

  it("does not return 15m stale authenticated session on AuthenticationError 401", async () => {
    vi.useFakeTimers();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    const { AuthenticationError } = await import("@teamver/app-sdk");
    getMock
      .mockResolvedValueOnce({
        authenticated: true,
        user: { userId: "user-1" },
        workspaces: [],
      })
      .mockRejectedValueOnce(new AuthenticationError({ status: 401, message: "session_expired" }));

    // Refresh ladder will also 401 — session must not fall back to stale cache.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "session_expired" }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const {
      fetchDesignAuthSession,
      resetDesignAuthRefreshDeclinedForTests,
      resetDesignAuthSessionCacheForTests,
    } = await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    resetDesignAuthSessionCacheForTests();

    const first = await fetchDesignAuthSession({ force: true });
    expect(first?.authenticated).toBe(true);

    const second = fetchDesignAuthSession({ force: true });
    const rejection = expect(second).rejects.toMatchObject({ status: 401 });
    await vi.runAllTimersAsync();
    await rejection;
    resetDesignAuthSessionCacheForTests();
    vi.useRealTimers();
  });
});

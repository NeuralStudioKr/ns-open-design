// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const httpGet = vi.fn();

vi.mock("@teamver/app-sdk", () => ({
  TeamverClient: class MockTeamverClient {
    http = { get: httpGet };
    workspaceStore = {};
  },
  createLocalStorageWorkspaceStore: vi.fn(() => ({})),
  NetworkError: class NetworkError extends Error {
    status: number;
    constructor(init: { status: number; message?: string }) {
      super(init.message ?? `http_${init.status}`);
      this.name = "NetworkError";
      this.status = init.status;
    }
  },
  snakeToCamelDeep: (v: unknown) => v,
}));

vi.mock("../src/teamver/designApiBase", async () => {
  const actual = await vi.importActual<typeof import("../src/teamver/designApiBase")>(
    "../src/teamver/designApiBase",
  );
  return {
    ...actual,
    isTeamverEmbedMode: () => true,
    resolveTeamverDesignApiBase: () => "/teamver-bff",
    resolveDesignBffRefreshUrl: () => "/teamver-bff/auth/refresh",
  };
});

function stubSessionProbe(status: number) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchTeamverRuntimeConfig auth gate (docs-teamver/43)", () => {
  beforeEach(() => {
    httpGet.mockReset();
    vi.resetModules();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "stg-design.teamver.com", href: "https://stg-design.teamver.com/" },
    });
  });

  it("skips HTTP when embed session is unauthenticated", async () => {
    const { setTeamverEmbedSessionAuthenticated, resetTeamverEmbedSessionRelayForTests } =
      await import("../src/teamver/teamverEmbedSession");
    const {
      fetchTeamverRuntimeConfig,
      resetTeamverRuntimeConfigCacheForTests,
    } = await import("../src/teamver/designBffClient");

    resetTeamverEmbedSessionRelayForTests();
    resetTeamverRuntimeConfigCacheForTests();
    setTeamverEmbedSessionAuthenticated(false);

    const value = await fetchTeamverRuntimeConfig();
    expect(value).toBeNull();
    expect(httpGet).not.toHaveBeenCalled();
  });

  it("skips runtime-config GET when session-probe is dead (stale-grace memory)", async () => {
    const { setTeamverEmbedSessionAuthenticated, resetTeamverEmbedSessionRelayForTests } =
      await import("../src/teamver/teamverEmbedSession");
    const {
      fetchTeamverRuntimeConfig,
      resetTeamverRuntimeConfigCacheForTests,
      isTeamverRuntimeConfigAuthBlocked,
      isDesignAuthRefreshDeclined,
    } = await import("../src/teamver/designBffClient");

    resetTeamverEmbedSessionRelayForTests();
    resetTeamverRuntimeConfigCacheForTests();
    setTeamverEmbedSessionAuthenticated(true);

    const fetchMock = stubSessionProbe(401);
    expect(await fetchTeamverRuntimeConfig()).toBeNull();
    expect(httpGet).not.toHaveBeenCalled();
    expect(isTeamverRuntimeConfigAuthBlocked()).toBe(true);
    // Probe-miss must not soft-sticky (would seed force-POST cooldown).
    expect(isDesignAuthRefreshDeclined()).toBe(false);
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes("/auth/session-probe")),
    ).toBe(true);

    // Backoff: no second probe/GET while blocked.
    expect(await fetchTeamverRuntimeConfig({ force: true })).toBeNull();
    expect(httpGet).not.toHaveBeenCalled();
  });

  it("blocks opportunistic refetch after 401 until session re-auth", async () => {
    const { NetworkError } = await import("@teamver/app-sdk");
    const { setTeamverEmbedSessionAuthenticated, resetTeamverEmbedSessionRelayForTests } =
      await import("../src/teamver/teamverEmbedSession");
    const {
      fetchTeamverRuntimeConfig,
      resetTeamverRuntimeConfigCacheForTests,
    } = await import("../src/teamver/designBffClient");

    resetTeamverEmbedSessionRelayForTests();
    resetTeamverRuntimeConfigCacheForTests();
    setTeamverEmbedSessionAuthenticated(true);

    vi.useFakeTimers();
    const refreshFetch = stubSessionProbe(204);

    httpGet.mockRejectedValue(
      new NetworkError({ status: 401, message: "session_expired" }),
    );

    const pending = fetchTeamverRuntimeConfig({ force: true });
    // HA sibling wait only — no POST /auth/refresh ladder.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toBeNull();
    // Initial GET + one HA retry GET. No /auth/refresh.
    expect(httpGet).toHaveBeenCalledTimes(2);
    expect(
      refreshFetch.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh")),
    ).toHaveLength(0);

    expect(await fetchTeamverRuntimeConfig()).toBeNull();
    expect(httpGet).toHaveBeenCalledTimes(2);

    // Re-auth clears the backoff (even if already marked authenticated).
    setTeamverEmbedSessionAuthenticated(true);
    httpGet.mockResolvedValueOnce({
      configured: true,
      apiKeyConfigured: true,
      model: "claude-sonnet-4-6",
    });

    const recovered = await fetchTeamverRuntimeConfig({ force: true });
    expect(recovered?.model).toBe("claude-sonnet-4-6");
    expect(httpGet).toHaveBeenCalledTimes(3);
    expect(
      refreshFetch.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh")),
    ).toHaveLength(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opportunistic visibility reload does not run cookie auth recovery", async () => {
    const { NetworkError } = await import("@teamver/app-sdk");
    const { setTeamverEmbedSessionAuthenticated, resetTeamverEmbedSessionRelayForTests } =
      await import("../src/teamver/teamverEmbedSession");
    const {
      fetchTeamverRuntimeConfig,
      resetTeamverRuntimeConfigCacheForTests,
    } = await import("../src/teamver/designBffClient");

    resetTeamverEmbedSessionRelayForTests();
    resetTeamverRuntimeConfigCacheForTests();
    setTeamverEmbedSessionAuthenticated(true);

    const refreshFetch = stubSessionProbe(204);
    httpGet.mockRejectedValueOnce(
      new NetworkError({ status: 401, message: "session_expired" }),
    );

    expect(await fetchTeamverRuntimeConfig()).toBeNull();
    expect(httpGet).toHaveBeenCalledTimes(1);
    expect(
      refreshFetch.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh")),
    ).toHaveLength(0);

    // Backoff: no second opportunistic GET.
    expect(await fetchTeamverRuntimeConfig()).toBeNull();
    expect(httpGet).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("recovers runtime-config after transient 401 when HA sibling cookie lands", async () => {
    const { NetworkError } = await import("@teamver/app-sdk");
    const { setTeamverEmbedSessionAuthenticated, resetTeamverEmbedSessionRelayForTests } =
      await import("../src/teamver/teamverEmbedSession");
    const {
      fetchTeamverRuntimeConfig,
      resetTeamverRuntimeConfigCacheForTests,
    } = await import("../src/teamver/designBffClient");

    resetTeamverEmbedSessionRelayForTests();
    resetTeamverRuntimeConfigCacheForTests();
    setTeamverEmbedSessionAuthenticated(true);

    vi.useFakeTimers();
    const refreshFetch = stubSessionProbe(204);

    httpGet
      .mockRejectedValueOnce(new NetworkError({ status: 401, message: "session_expired" }))
      .mockResolvedValueOnce({
        configured: true,
        apiKeyConfigured: true,
        model: "claude-sonnet-4-6",
      });

    const pending = fetchTeamverRuntimeConfig({ force: true });
    await vi.advanceTimersByTimeAsync(2_000);
    const value = await pending;

    expect(value?.model).toBe("claude-sonnet-4-6");
    expect(httpGet).toHaveBeenCalledTimes(2);
    // HA retry must not POST /auth/refresh.
    expect(
      refreshFetch.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh")),
    ).toHaveLength(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("force cannot bypass the unauthenticated session gate", async () => {
    const { setTeamverEmbedSessionAuthenticated, resetTeamverEmbedSessionRelayForTests } =
      await import("../src/teamver/teamverEmbedSession");
    const {
      fetchTeamverRuntimeConfig,
      resetTeamverRuntimeConfigCacheForTests,
    } = await import("../src/teamver/designBffClient");

    resetTeamverEmbedSessionRelayForTests();
    resetTeamverRuntimeConfigCacheForTests();
    setTeamverEmbedSessionAuthenticated(false);

    expect(await fetchTeamverRuntimeConfig({ force: true })).toBeNull();
    expect(httpGet).not.toHaveBeenCalled();
  });
});

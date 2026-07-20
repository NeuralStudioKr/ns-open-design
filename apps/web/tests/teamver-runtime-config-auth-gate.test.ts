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

describe("fetchTeamverRuntimeConfig auth gate (docs-teamver/43)", () => {
  beforeEach(() => {
    httpGet.mockReset();
    vi.resetModules();
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
    const refreshFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "session_expired" } }), { status: 401 }),
    );
    vi.stubGlobal("fetch", refreshFetch);

    httpGet.mockRejectedValue(
      new NetworkError({ status: 401, message: "session_expired" }),
    );

    const pending = fetchTeamverRuntimeConfig({ force: true });
    // Cover DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS (400ms) plus soft-retry probes.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toBeNull();
    // Initial GET + HA sibling retry after refresh declines.
    expect(httpGet).toHaveBeenCalledTimes(2);

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
    vi.useRealTimers();
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "session_expired" } }), { status: 401 }),
      ),
    );

    httpGet
      .mockRejectedValueOnce(new NetworkError({ status: 401, message: "session_expired" }))
      .mockResolvedValueOnce({
        configured: true,
        apiKeyConfigured: true,
        model: "claude-sonnet-4-6",
      });

    const pending = fetchTeamverRuntimeConfig({ force: true });
    // Cover DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS (400ms) plus soft-retry probes.
    await vi.advanceTimersByTimeAsync(2_000);
    const value = await pending;

    expect(value?.model).toBe("claude-sonnet-4-6");
    expect(httpGet).toHaveBeenCalledTimes(2);
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

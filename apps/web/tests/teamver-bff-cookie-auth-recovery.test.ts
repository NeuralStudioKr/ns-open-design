import { AuthenticationError, NetworkError } from "@teamver/app-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  isBootstrapAuthMode: vi.fn(() => false),
  resolveTeamverDesignApiBase: vi.fn(() => ""),
  resolveTeamverDesignApiCrossOriginFallback: vi.fn(() => null),
  resolveDesignBffRefreshUrl: vi.fn(() => "/teamver-bff/auth/refresh"),
  prepareTeamverLoginNavigation: vi.fn(),
}));

vi.mock("../src/teamver/teamverEmbedPassiveAuth", () => ({
  handleEmbedPassiveUnauthorized: vi.fn(),
}));

vi.mock("../src/teamver/teamverAuthOrphanJwt", () => ({
  clearOrphanTeamverAuthCookies: vi.fn(),
  isOrphanTeamverJwtAuthFailure: vi.fn(() => false),
}));

vi.mock("../src/teamver/teamverAuthCookieHints", () => ({
  hasProbableTeamverAuthCookie: vi.fn(() => false),
}));

vi.mock("../src/teamver/teamverEmbedSession", () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => false),
}));

vi.mock("../src/teamver/teamverAuthReturn", () => ({
  peekTeamverAuthReturnPending: vi.fn(() => false),
  isLikelyTeamverAuthReturnNavigation: vi.fn(() => false),
}));

import {
  isDesignAuthRefreshDeclined,
  refreshTeamverEmbedAuthBeforeMutating,
  resetDesignAuthRefreshDeclinedForTests,
  withDesignBffCookieAuthRecovery,
} from "../src/teamver/designBffClient";
import { isTeamverEmbedSessionAuthenticated } from "../src/teamver/teamverEmbedSession";

describe("withDesignBffCookieAuthRecovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    resetDesignAuthRefreshDeclinedForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries the original BFF request once after refresh declines, allowing HA sibling cookie recovery", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "session_expired" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new NetworkError({ status: 401, message: "session_expired" }))
      .mockResolvedValueOnce("ok");

    const pending = withDesignBffCookieAuthRecovery(request);
    await vi.advanceTimersByTimeAsync(300);

    await expect(pending).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
    // refresh 401 → /auth/session probe (+ delayed probe) before soft-retry
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("recovers from SDK AuthenticationError (real HTTP 401 mapping)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "session_expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new AuthenticationError({ status: 401, message: "session_expired" }))
      .mockResolvedValueOnce("ok");

    const pending = withDesignBffCookieAuthRecovery(request);
    await vi.advanceTimersByTimeAsync(300);

    await expect(pending).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("clears sticky refresh decline after a successful HA soft-retry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "session_expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new AuthenticationError({ status: 401, message: "session_expired" }))
      .mockResolvedValueOnce("ok");

    const pending = withDesignBffCookieAuthRecovery(request);
    await vi.advanceTimersByTimeAsync(300);
    await expect(pending).resolves.toBe("ok");

    expect(isDesignAuthRefreshDeclined()).toBe(false);
  });

  it("clears sticky decline after soft-retry fails when /auth/session is still authenticated", async () => {
    const fetchMock = vi
      .fn()
      // refreshDesignAuthCookie → POST /auth/refresh 401
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "session_expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      // refresh path: first session probe → unauthenticated (sticky decline)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      // refresh path: delayed session probe → still false
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      // withDesignBffCookieAuthRecovery catch: session still usable after soft-retry miss
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock as typeof fetch);

    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new AuthenticationError({ status: 401, message: "session_expired" }))
      .mockRejectedValueOnce(new AuthenticationError({ status: 401, message: "session_expired" }));

    const pending = withDesignBffCookieAuthRecovery(request);
    const assertion = expect(pending).rejects.toMatchObject({ status: 401 });
    await vi.advanceTimersByTimeAsync(300);
    await assertion;
    expect(isDesignAuthRefreshDeclined()).toBe(false);
  });

  it("does not sticky-decline refresh when /auth/session is still authenticated after 401", async () => {
    vi.useRealTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "session_expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      // Second refresh while POST-suppressed: session-probe only
      .mockResolvedValueOnce(
        new Response(null, { status: 204 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { refreshDesignAuthCookie, isDesignAuthRefreshDeclined, resetDesignAuthRefreshDeclinedForTests } =
      await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    await expect(refreshDesignAuthCookie()).resolves.toBe(true);
    expect(isDesignAuthRefreshDeclined()).toBe(false);
    await expect(refreshDesignAuthCookie()).resolves.toBe(true);
    // 1 refresh POST + 1 probe + 1 suppressed probe (no second POST)
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh"))).toHaveLength(1);
  });

  it("recovers from sticky decline when a later /auth/session probe is authenticated", async () => {
    vi.useRealTimers();
    const fetchMock = vi
      .fn()
      // First refresh: 401 + two failed session probes → soft sticky decline
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "session_expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      // Second refresh while soft-sticky: session probe only (no POST refresh)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { refreshDesignAuthCookie, isDesignAuthRefreshDeclined, resetDesignAuthRefreshDeclinedForTests } =
      await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    await expect(refreshDesignAuthCookie()).resolves.toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);

    await expect(refreshDesignAuthCookie()).resolves.toBe(true);
    expect(isDesignAuthRefreshDeclined()).toBe(false);
    // 1 refresh POST + 2 probes + 1 sticky re-probe (no second POST)
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh"))).toHaveLength(1);
  });

  it("keeps hard sticky after 400 and does not re-probe /auth/session", async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "invalid_refresh" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { refreshDesignAuthCookie, isDesignAuthRefreshDeclined, resetDesignAuthRefreshDeclinedForTests } =
      await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    await expect(refreshDesignAuthCookie()).resolves.toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(refreshDesignAuthCookie()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("refreshTeamverEmbedAuthBeforeMutating", () => {
  beforeEach(() => {
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
  });

  it("skips refresh for short-lived activity", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { refreshTeamverEmbedAuthBeforeMutating } = await import("../src/teamver/designBffClient");
    await refreshTeamverEmbedAuthBeforeMutating({
      activityStartedAt: Date.now() - 30_000,
      minAgeMs: 120_000,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes before mutating when activity exceeded the age threshold", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const { refreshTeamverEmbedAuthBeforeMutating } = await import("../src/teamver/designBffClient");
    await refreshTeamverEmbedAuthBeforeMutating({
      activityStartedAt: Date.now() - 180_000,
      minAgeMs: 120_000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

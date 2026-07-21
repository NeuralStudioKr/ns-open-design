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

function refresh401(): Response {
  return new Response(JSON.stringify({ detail: "session_expired" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function sessionJson(authenticated: boolean): Response {
  return new Response(JSON.stringify({ authenticated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function sessionProbe204(): Response {
  return new Response(null, { status: 204 });
}

function sessionProbe401(): Response {
  return new Response(JSON.stringify({ detail: "session_expired" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(refresh401());
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new NetworkError({ status: 401, message: "session_expired" }))
      .mockResolvedValueOnce("ok");

    const pending = withDesignBffCookieAuthRecovery(request);
    await vi.advanceTimersByTimeAsync(1_200);

    await expect(pending).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
    // refresh 401 → probe + delayed probe + ensure before soft-retry
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it("recovers from SDK AuthenticationError (real HTTP 401 mapping)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(refresh401());
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new AuthenticationError({ status: 401, message: "session_expired" }))
      .mockResolvedValueOnce("ok");

    const pending = withDesignBffCookieAuthRecovery(request);
    await vi.advanceTimersByTimeAsync(1_200);

    await expect(pending).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not Apps-refresh on Main SSO user mismatch 401", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const mismatch = new AuthenticationError({
      status: 401,
      message: "HTTP 401",
      responseBody: {
        detail: "main_sso_user_mismatch",
        code: "main_sso_user_mismatch",
        re_login_scope: "main",
      },
    });
    const request = vi.fn<() => Promise<string>>().mockRejectedValueOnce(mismatch);

    await expect(withDesignBffCookieAuthRecovery(request)).rejects.toBe(mismatch);
    expect(request).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clears sticky refresh decline after a successful HA soft-retry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(refresh401());
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new AuthenticationError({ status: 401, message: "session_expired" }))
      .mockResolvedValueOnce("ok");

    const pending = withDesignBffCookieAuthRecovery(request);
    await vi.advanceTimersByTimeAsync(1_200);
    await expect(pending).resolves.toBe("ok");

    expect(isDesignAuthRefreshDeclined()).toBe(false);
  });

  it("clears sticky decline after soft-retry fails when /auth/session is still authenticated", async () => {
    // After refresh 401 + probe misses → soft sticky. Sibling delayed request
    // still 401: do not trailing-ensure (already ran inside refresh). Sticky
    // stays set so parallel callers skip probe spam.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionJson(false)); // ensure inside refresh
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock as typeof fetch);

    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new AuthenticationError({ status: 401, message: "session_expired" }))
      .mockRejectedValueOnce(new AuthenticationError({ status: 401, message: "session_expired" }));

    const pending = withDesignBffCookieAuthRecovery(request);
    const assertion = expect(pending).rejects.toMatchObject({ status: 401 });
    await vi.advanceTimersByTimeAsync(1_200);
    await assertion;
    expect(isDesignAuthRefreshDeclined()).toBe(true);
  });

  it("does not sticky-decline refresh when session-probe is still valid after 401", async () => {
    vi.useRealTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionProbe204())
      .mockResolvedValueOnce(sessionProbe204());
    vi.stubGlobal("fetch", fetchMock);

    const { refreshDesignAuthCookie, isDesignAuthRefreshDeclined, resetDesignAuthRefreshDeclinedForTests } =
      await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    await expect(refreshDesignAuthCookie()).resolves.toBe(true);
    expect(isDesignAuthRefreshDeclined()).toBe(false);
    await expect(refreshDesignAuthCookie()).resolves.toBe(true);
    // 1 refresh POST + probe + suppressed probe (no second POST)
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh"))).toHaveLength(1);
  });

  it("soft-sticky recovery uses ensure /auth/session after force-POST cooldown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionJson(false))
      // allowSoftForcePost after cooldown: survival probe skipped (seeded);
      // force POST fails then ensure revives session.
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionJson(true));
    vi.stubGlobal("fetch", fetchMock);

    const { refreshDesignAuthCookie, isDesignAuthRefreshDeclined, resetDesignAuthRefreshDeclinedForTests } =
      await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    const first = refreshDesignAuthCookie();
    await vi.advanceTimersByTimeAsync(500);
    await expect(first).resolves.toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    const postsAfterSticky = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/refresh"),
    ).length;

    await vi.advanceTimersByTimeAsync(15_050);
    await expect(refreshDesignAuthCookie({ allowSoftForcePost: true })).resolves.toBe(true);
    expect(isDesignAuthRefreshDeclined()).toBe(false);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh"))).toHaveLength(
      postsAfterSticky + 1,
    );
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/auth/session"))).toBe(true);
  });

  it("soft-sticky force-POSTs refresh after cooldown when ensure also fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionJson(false))
      // allowSoftForcePost after cooldown: skip probe ladder; successful force POST
      // then ensure must confirm before soft sticky clears.
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
      .mockResolvedValueOnce(sessionJson(true));
    vi.stubGlobal("fetch", fetchMock);

    const { refreshDesignAuthCookie, isDesignAuthRefreshDeclined, resetDesignAuthRefreshDeclinedForTests } =
      await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    const first = refreshDesignAuthCookie();
    await vi.advanceTimersByTimeAsync(500);
    await expect(first).resolves.toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);

    await vi.advanceTimersByTimeAsync(15_050);
    await expect(refreshDesignAuthCookie({ allowSoftForcePost: true })).resolves.toBe(true);
    expect(isDesignAuthRefreshDeclined()).toBe(false);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh"))).toHaveLength(2);
  });

  it("soft-sticky skips immediate force-POST after decline (cooldown seed)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionJson(false));
    vi.stubGlobal("fetch", fetchMock);

    const { refreshDesignAuthCookie, isDesignAuthRefreshDeclined, resetDesignAuthRefreshDeclinedForTests } =
      await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    const first = refreshDesignAuthCookie();
    await vi.advanceTimersByTimeAsync(500);
    await expect(first).resolves.toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    const refreshCallsAfterDecline = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/refresh"),
    ).length;

    await expect(refreshDesignAuthCookie({ allowSoftForcePost: true })).resolves.toBe(false);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh")).length,
    ).toBe(refreshCallsAfterDecline);
  });

  it("keeps hard sticky after 400 but allows probe-only survival without POST", async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        return new Response(JSON.stringify({ detail: "invalid_refresh" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/auth/session-probe")) {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { refreshDesignAuthCookie, isDesignAuthRefreshDeclined, resetDesignAuthRefreshDeclinedForTests } =
      await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    await expect(refreshDesignAuthCookie()).resolves.toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh"))).toHaveLength(1);

    // Second call: hard sticky — probe may succeed without another POST.
    await expect(refreshDesignAuthCookie()).resolves.toBe(true);
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh"))).toHaveLength(1);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/auth/session-probe"))).toBe(true);
  });

  it("skips sticky survival probe ladder on repeated soft-sticky refresh calls", async () => {
    const fetchMock = vi
      .fn()
      // First refresh: 401 + probe/probe/ensure miss → soft sticky (seeds cooldown)
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionJson(false))
      // allowSoftForcePost after cooldown: skip probe; force POST + ensure miss
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionJson(false));
    vi.stubGlobal("fetch", fetchMock);

    const { refreshDesignAuthCookie, isDesignAuthRefreshDeclined, resetDesignAuthRefreshDeclinedForTests } =
      await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    const first = refreshDesignAuthCookie();
    await vi.advanceTimersByTimeAsync(500);
    await expect(first).resolves.toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    const probesAfterSticky = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/session-probe"),
    ).length;
    const postsAfterSticky = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/refresh"),
    ).length;

    // Background soft-sticky: seeded skipProbeLadder → no fetches, no force POST.
    await expect(refreshDesignAuthCookie()).resolves.toBe(false);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh")).length,
    ).toBe(postsAfterSticky);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/session-probe")).length,
    ).toBe(probesAfterSticky);

    // Immediate allowSoftForcePost is still blocked by decline-seeded cooldown.
    await expect(refreshDesignAuthCookie({ allowSoftForcePost: true })).resolves.toBe(false);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh")).length,
    ).toBe(postsAfterSticky);

    await vi.advanceTimersByTimeAsync(15_050);
    await expect(refreshDesignAuthCookie({ allowSoftForcePost: true })).resolves.toBe(false);
    const postsAfterForce = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/refresh"),
    ).length;
    const probesAfterForce = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/session-probe"),
    ).length;
    expect(postsAfterForce).toBe(postsAfterSticky + 1);
    expect(probesAfterForce).toBe(probesAfterSticky);

    await expect(refreshDesignAuthCookie({ allowSoftForcePost: true })).resolves.toBe(false);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh")).length,
    ).toBe(postsAfterForce);
  });

  it("does not re-probe session when sticky decline already owns recovery", async () => {
    vi.useRealTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionJson(false));
    vi.stubGlobal("fetch", fetchMock);

    const {
      refreshDesignAuthCookie,
      isDesignAuthRefreshDeclined,
      resetDesignAuthRefreshDeclinedForTests,
      withDesignBffCookieAuthRecovery: recover,
    } = await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    await expect(refreshDesignAuthCookie()).resolves.toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    const probesAfterSticky = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/session-probe"),
    ).length;

    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new AuthenticationError({ status: 401, message: "session_expired" }));
    await expect(recover(request)).rejects.toMatchObject({ status: 401 });

    const probesAfterRecover = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/session-probe"),
    ).length;
    // Sticky path fails fast before the request — no BFF hit / no soft ladder.
    expect(probesAfterRecover).toBe(probesAfterSticky);
    expect(request).toHaveBeenCalledTimes(0);
    const refreshAfterSticky = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/refresh"),
    ).length;
    expect(refreshAfterSticky).toBe(1);
  });

  it("fetchDesignAuthSession while sticky skips hydrate when session-probe is dead", async () => {
    vi.useRealTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionJson(false))
      // C1 sticky quiet path — dead probe, no ensure hydrate
      .mockResolvedValueOnce(sessionProbe401());
    vi.stubGlobal("fetch", fetchMock);

    const {
      refreshDesignAuthCookie,
      fetchDesignAuthSession,
      isDesignAuthRefreshDeclined,
      resetDesignAuthRefreshDeclinedForTests,
    } = await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    await expect(refreshDesignAuthCookie()).resolves.toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    const sessionGetsBefore = fetchMock.mock.calls.filter((c) => {
      const url = String(c[0]);
      return url.includes("/auth/session") && !url.includes("session-probe");
    }).length;

    await expect(fetchDesignAuthSession({ force: true })).resolves.toBeNull();
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    const sessionGetsAfter = fetchMock.mock.calls.filter((c) => {
      const url = String(c[0]);
      return url.includes("/auth/session") && !url.includes("session-probe");
    }).length;
    // Dead probe: no ensure /auth/session hydrate and no recovery ladder.
    expect(sessionGetsAfter).toBe(sessionGetsBefore);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/auth/session-probe"))).toBe(true);
  });

  it("soft sticky quiet clears decline only after authenticated hydrate", async () => {
    vi.useRealTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionJson(false))
      // Quiet: live probe then unauthenticated hydrate — sticky must remain.
      .mockResolvedValueOnce(sessionProbe204())
      .mockResolvedValueOnce(sessionJson(false))
      // Quiet again: live probe + authenticated hydrate — soft clears.
      .mockResolvedValueOnce(sessionProbe204())
      .mockResolvedValueOnce(sessionJson(true));
    vi.stubGlobal("fetch", fetchMock);

    const {
      refreshDesignAuthCookie,
      fetchDesignAuthSession,
      isDesignAuthRefreshDeclined,
      resetDesignAuthRefreshDeclinedForTests,
    } = await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    await expect(refreshDesignAuthCookie()).resolves.toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);

    const failed = await fetchDesignAuthSession({ force: true });
    expect(failed?.authenticated).toBe(false);
    expect(isDesignAuthRefreshDeclined()).toBe(true);
    const refreshCount = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/refresh"),
    ).length;
    expect(refreshCount).toBe(1);

    const recovered = await fetchDesignAuthSession({ force: true });
    expect(recovered?.authenticated).toBe(true);
    expect(isDesignAuthRefreshDeclined()).toBe(false);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh")),
    ).toHaveLength(1);
  });
});

describe("shouldSkipTeamverBffAuthCalls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("skips BFF ladders for soft sticky as well as hard sticky", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refresh401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionProbe401())
      .mockResolvedValueOnce(sessionJson(false));
    vi.stubGlobal("fetch", fetchMock);

    const {
      refreshDesignAuthCookie,
      shouldSkipTeamverBffAuthCalls,
      resetDesignAuthRefreshDeclinedForTests,
    } = await import("../src/teamver/designBffClient");
    resetDesignAuthRefreshDeclinedForTests();
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);

    expect(shouldSkipTeamverBffAuthCalls()).toBe(false);
    await expect(refreshDesignAuthCookie()).resolves.toBe(false);
    expect(shouldSkipTeamverBffAuthCalls()).toBe(true);
  });
});

describe("probeDesignBffSessionAuthenticated", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns false when session-probe 404s without falling back to ensure /auth/session", async () => {
    // Older nginx may 404 the public probe location. Falling back to
    // /auth/session would trigger ensure_bff_session → Main refresh, which
    // defeats the read-only contract of probe and can rotate cookies mid-race.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "not_found" }), {
        status: 404,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { probeDesignBffSessionAuthenticated } = await import(
      "../src/teamver/designBffClient"
    );
    await expect(probeDesignBffSessionAuthenticated()).resolves.toBe(false);
    // Exactly one call — no fallback to /auth/session.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/auth/session-probe");
  });

  it("returns true on 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { probeDesignBffSessionAuthenticated } = await import(
      "../src/teamver/designBffClient"
    );
    await expect(probeDesignBffSessionAuthenticated()).resolves.toBe(true);
  });

  it("returns false on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const { probeDesignBffSessionAuthenticated } = await import(
      "../src/teamver/designBffClient"
    );
    await expect(probeDesignBffSessionAuthenticated()).resolves.toBe(false);
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

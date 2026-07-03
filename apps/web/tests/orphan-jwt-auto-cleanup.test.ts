// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force bootstrap-mode + probable-cookie so shouldAttemptCookieRefresh() returns
// true and the refresh path actually runs. We mock at the module boundary so
// the real `refreshDesignAuthCookie` implementation runs and we can observe the
// C2 orphan-JWT hookup end-to-end.
vi.mock("../src/teamver/designApiBase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teamver/designApiBase")>();
  return {
    ...actual,
    isBootstrapAuthMode: vi.fn(() => true),
    resolveDesignBffRefreshUrl: vi.fn(() => "https://bff.example/teamver-bff/auth/refresh"),
    resolveTeamverMainApiBaseUrl: vi.fn(() => "https://api.example"),
  };
});

vi.mock("../src/teamver/teamverEmbedSession", () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => true),
  setTeamverEmbedSessionAuthenticated: vi.fn(),
  subscribeTeamverEmbedSessionChanged: vi.fn(() => () => {}),
  clearTeamverEmbedSessionState: vi.fn(async () => undefined),
}));

vi.mock("../src/teamver/teamverAuthCookieHints", () => ({
  hasProbableTeamverAuthCookie: vi.fn(() => true),
}));

vi.mock("../src/teamver/teamverAuthReturn", () => ({
  consumeTeamverAuthReturnPending: vi.fn(() => false),
  peekTeamverAuthReturnPending: vi.fn(() => false),
  isLikelyTeamverAuthReturnNavigation: vi.fn(() => false),
}));

import {
  refreshDesignAuthCookie,
  resetDesignAuthRefreshDeclinedForTests,
} from "../src/teamver/designBffClient";
import * as orphanJwt from "../src/teamver/teamverAuthOrphanJwt";

describe("refreshDesignAuthCookie orphan JWT auto-cleanup (C2)", () => {
  let clearOrphanSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetDesignAuthRefreshDeclinedForTests();
    clearOrphanSpy = vi
      .spyOn(orphanJwt, "clearOrphanTeamverAuthCookies")
      .mockResolvedValue(undefined);
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    clearOrphanSpy.mockRestore();
    infoSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("fires clearOrphanTeamverAuthCookies when refresh returns 400 user_not_found", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "user_not_found" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ok = await refreshDesignAuthCookie();
    expect(ok).toBe(false);
    expect(clearOrphanSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("orphan JWT"),
      expect.objectContaining({ status: 400 }),
    );
  });

  it("fires clearOrphanTeamverAuthCookies when refresh returns 401 token.user_not_in_database", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: "token.user_not_in_database" } }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ok = await refreshDesignAuthCookie();
    expect(ok).toBe(false);
    expect(clearOrphanSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire cleanup on a generic 400 with no orphan-JWT body signal", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ok = await refreshDesignAuthCookie();
    expect(ok).toBe(false);
    expect(clearOrphanSpy).not.toHaveBeenCalled();
  });

  it("does NOT fire cleanup when refresh succeeds", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ok = await refreshDesignAuthCookie();
    expect(ok).toBe(true);
    expect(clearOrphanSpy).not.toHaveBeenCalled();
  });
});

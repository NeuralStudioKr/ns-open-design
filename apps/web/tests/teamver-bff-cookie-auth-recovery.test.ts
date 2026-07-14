import { NetworkError } from "@teamver/app-sdk";
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
  resetDesignAuthRefreshDeclinedForTests,
  withDesignBffCookieAuthRecovery,
} from "../src/teamver/designBffClient";

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
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

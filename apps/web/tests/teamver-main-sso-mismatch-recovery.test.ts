// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const clearCookies = vi.fn(async () => undefined);
const clearSession = vi.fn(async () => undefined);
const redirect = vi.fn();

vi.mock("../src/teamver/teamverAuthOrphanJwt", () => ({
  clearOrphanTeamverAuthCookies: () => clearCookies(),
}));

vi.mock("../src/teamver/designAuthFlow", () => ({
  clearDesignAuthSessionFull: () => clearSession(),
  redirectToTeamverLoginPreservingRoute: (options?: { returnTo?: string }) => redirect(options),
}));

vi.mock("../src/teamver/teamverEmbedAuthNavigation", () => ({
  resolveEmbedAuthReturnPath: () => "/p/demo",
}));

import {
  beginMainSsoMismatchRecovery,
  resetMainSsoMismatchRecoveryForTests,
  wasMainSsoMismatchRecoverAttemptedRecently,
} from "../src/teamver/mainSsoMismatchRecovery";

describe("mainSsoMismatchRecovery", () => {
  beforeEach(() => {
    clearCookies.mockClear();
    clearSession.mockClear();
    redirect.mockClear();
    resetMainSsoMismatchRecoveryForTests();
  });

  it("clears Main + Design sessions then redirects with returnTo", async () => {
    await beginMainSsoMismatchRecovery();
    expect(clearCookies).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith({ returnTo: "/p/demo" });
    expect(wasMainSsoMismatchRecoverAttemptedRecently()).toBe(true);
  });

  it("coalesces parallel recoveries into one logout+redirect", async () => {
    // Slow the first await so the second call still sees recoverInflight.
    clearCookies.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 20)),
    );
    const first = beginMainSsoMismatchRecovery();
    const second = beginMainSsoMismatchRecovery();
    expect(second).toBe(first);
    await first;
    expect(clearCookies).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("does not repeat logout while cooldown is active but still retries redirect", async () => {
    await beginMainSsoMismatchRecovery();
    clearCookies.mockClear();
    redirect.mockClear();
    await beginMainSsoMismatchRecovery();
    expect(clearCookies).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith({ returnTo: "/p/demo" });
  });
});

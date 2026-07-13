// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEAMVER_AUTH_RETURN_PENDING_KEY } from "../../src/teamver/teamverAuthReturn";

vi.mock("../../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

describe("teamverEmbedAuthNavigation", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "",
      writable: true,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("strips cosmetic launch params and stashes theme for App boot", async () => {
    window.history.replaceState({}, "", "/?theme=system&teamverDriveIntent=create-slides");
    const { scrubCosmeticLaunchParamsFromBrowserUrl, consumeEmbedLaunchPrefs } = await import(
      "../../src/teamver/teamverEmbedAuthNavigation"
    );

    const prefs = scrubCosmeticLaunchParamsFromBrowserUrl();
    expect(prefs.theme).toBe("system");
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?teamverDriveIntent=create-slides");

    expect(consumeEmbedLaunchPrefs()).toEqual({ theme: "system" });
    expect(consumeEmbedLaunchPrefs()).toEqual({});
  });

  it("defers login redirect while auth return is pending", async () => {
    sessionStorage.setItem(TEAMVER_AUTH_RETURN_PENDING_KEY, String(Date.now()));
    const { shouldDeferEmbedLoginRedirect } = await import(
      "../../src/teamver/teamverEmbedAuthNavigation"
    );
    expect(shouldDeferEmbedLoginRedirect()).toBe(true);
  });

  it("does not defer forever solely because document.referrer is an auth page", async () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://stg.teamver.com/auth/signin",
    });
    const { shouldDeferEmbedLoginRedirect } = await import(
      "../../src/teamver/teamverEmbedAuthNavigation"
    );
    expect(shouldDeferEmbedLoginRedirect()).toBe(false);
  });

  it("normalizes auth return destinations without cosmetic params", async () => {
    const { normalizeEmbedAuthReturnDestination } = await import(
      "../../src/teamver/teamverEmbedAuthNavigation"
    );
    expect(normalizeEmbedAuthReturnDestination("/projects/1?theme=system&tab=files")).toBe(
      "/projects/1?tab=files",
    );
    expect(normalizeEmbedAuthReturnDestination("/auth/callback?theme=system")).toBe("/auth/callback");
  });
});

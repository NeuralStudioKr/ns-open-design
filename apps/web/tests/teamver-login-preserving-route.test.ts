// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTeamverLoginRedirectCooldown } from "../src/teamver/designApiBase";
import * as designApiBase from "../src/teamver/designApiBase";
import { redirectToTeamverLoginPreservingRoute } from "../src/teamver/designAuthFlow";

const RETURN_TO_KEY = "teamver_design_auth_return_to";

describe("redirectToTeamverLoginPreservingRoute", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    resetTeamverLoginRedirectCooldown();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        pathname: "/p/PROJ-1",
        search: "",
        origin: "https://stg-design.teamver.com",
        hostname: "stg-design.teamver.com",
        href: "https://stg-design.teamver.com/p/PROJ-1",
        replace: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("persists returnTo to sessionStorage before redirecting (legacy mode)", () => {
    vi.spyOn(designApiBase, "isBootstrapAuthMode").mockReturnValue(false);
    const redirectSpy = vi
      .spyOn(designApiBase, "redirectToTeamverLogin")
      .mockImplementation(() => {});

    redirectToTeamverLoginPreservingRoute({ returnTo: "/p/PROJ-1" });

    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe("/p/PROJ-1");
    expect(redirectSpy).toHaveBeenCalledWith("/p/PROJ-1");
  });

  it("persists returnTo and skips legacy redirect in bootstrap mode", () => {
    vi.spyOn(designApiBase, "isBootstrapAuthMode").mockReturnValue(true);
    // Legacy redirect should NOT run in bootstrap mode — bootstrap path
    // resolves the Main sign-in URL via BFF config instead.
    const legacyRedirectSpy = vi
      .spyOn(designApiBase, "redirectToTeamverLogin")
      .mockImplementation(() => {});

    redirectToTeamverLoginPreservingRoute({
      workspaceId: "WS-9",
      returnTo: "/p/PROJ-1?tab=chat",
    });

    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe("/p/PROJ-1?tab=chat");
    expect(legacyRedirectSpy).not.toHaveBeenCalled();
  });

  it("ignores non-path returnTo values (defense in depth vs open redirect)", () => {
    vi.spyOn(designApiBase, "isBootstrapAuthMode").mockReturnValue(false);
    vi.spyOn(designApiBase, "redirectToTeamverLogin").mockImplementation(() => {});

    redirectToTeamverLoginPreservingRoute({
      returnTo: "https://evil.example.com/",
    });

    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  it("does not clobber a previously stored returnTo when called without one", () => {
    sessionStorage.setItem(RETURN_TO_KEY, "/p/PRIOR");
    vi.spyOn(designApiBase, "isBootstrapAuthMode").mockReturnValue(false);
    vi.spyOn(designApiBase, "redirectToTeamverLogin").mockImplementation(() => {});

    redirectToTeamverLoginPreservingRoute();

    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe("/p/PRIOR");
  });
});

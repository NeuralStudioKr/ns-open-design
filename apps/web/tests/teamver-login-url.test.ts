// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TEAMVER_AUTH_RETURN_TO_PARAM,
  TEAMVER_AUTH_SIGNIN_PATH,
  TEAMVER_DESIGN_APP_ID,
  buildDesignColdStartLoginUrl,
  redirectToTeamverLogin,
  resolveTeamverLoginUrl,
  resolveTeamverMainOrigin,
} from "../src/teamver/designApiBase";

function setLocation(hostname: string, pathname = "/") {
  const origin = `https://${hostname}`;
  const href = `${origin}${pathname}`;
  const replace = vi.fn();
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    value: {
      href,
      origin,
      hostname,
      pathname,
      replace,
      assign,
    },
    writable: true,
    configurable: true,
  });
  return { replace, assign };
}

describe("resolveTeamverLoginUrl (bootstrap / BFF cold start)", () => {
  afterEach(() => {
    setLocation("localhost");
  });

  it("uses /auth/signin (not legacy /auth/login)", () => {
    expect(TEAMVER_AUTH_SIGNIN_PATH).toBe("/auth/signin");
    setLocation("design.teamver.com");
    expect(resolveTeamverLoginUrl()).toBe(
      buildDesignColdStartLoginUrl({ callbackPath: "/auth/callback" }),
    );
  });

  it("stg-design.teamver.com → cold start with app_id and callback redirect", () => {
    setLocation("stg-design.teamver.com", "/projects/abc");
    expect(resolveTeamverMainOrigin()).toBe("https://stg.teamver.com");
    expect(resolveTeamverLoginUrl()).toBe(
      "https://stg.teamver.com/auth/signin?app_id=teamver-design&redirect_url=https%3A%2F%2Fstg-design.teamver.com%2Fauth%2Fcallback",
    );
  });

  it("buildDesignColdStartLoginUrl includes teamver-design app_id", () => {
    setLocation("stg-design.teamver.com");
    const url = buildDesignColdStartLoginUrl();
    expect(url).toContain(`app_id=${TEAMVER_DESIGN_APP_ID}`);
    expect(url).toContain("redirect_url=");
    expect(url).toContain(encodeURIComponent("https://stg-design.teamver.com/auth/callback"));
  });

  it("redirectToTeamverLogin uses location.replace with cold start URL", () => {
    const { replace } = setLocation("stg-design.teamver.com", "/projects/abc");
    redirectToTeamverLogin();
    expect(replace).toHaveBeenCalledWith(
      "https://stg.teamver.com/auth/signin?app_id=teamver-design&redirect_url=https%3A%2F%2Fstg-design.teamver.com%2Fauth%2Fcallback",
    );
  });
});

describe("resolveTeamverLoginUrl (local dev / Plan B returnTo)", () => {
  afterEach(() => {
    setLocation("localhost");
  });

  it("localhost dev → stg.teamver.com/auth/signin with returnTo", () => {
    setLocation("localhost", "/");
    expect(resolveTeamverLoginUrl()).toBe(
      "https://stg.teamver.com/auth/signin?returnTo=https%3A%2F%2Flocalhost%2F",
    );
  });

  it("127.0.0.1 dev → stg.teamver.com/auth/signin with returnTo", () => {
    setLocation("127.0.0.1", "/");
    expect(resolveTeamverLoginUrl()).toBe(
      "https://stg.teamver.com/auth/signin?returnTo=https%3A%2F%2F127.0.0.1%2F",
    );
  });

  it("accepts explicit returnTo override on localhost", () => {
    setLocation("localhost");
    expect(resolveTeamverLoginUrl("https://localhost/deck/1")).toBe(
      `https://stg.teamver.com/auth/signin?${TEAMVER_AUTH_RETURN_TO_PARAM}=https%3A%2F%2Flocalhost%2Fdeck%2F1`,
    );
  });
});

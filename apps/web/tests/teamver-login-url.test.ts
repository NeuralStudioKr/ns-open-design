// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TEAMVER_AUTH_RETURN_TO_PARAM,
  TEAMVER_AUTH_SIGNIN_PATH,
  redirectToTeamverLogin,
  resolveTeamverLoginUrl,
  resolveTeamverMainOrigin,
} from "../src/teamver/designApiBase";

function setLocation(hostname: string, pathname = "/") {
  const href = `https://${hostname}${pathname}`;
  const replace = vi.fn();
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    value: {
      href,
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

describe("resolveTeamverLoginUrl", () => {
  afterEach(() => {
    setLocation("localhost");
  });

  it("uses /auth/signin (not legacy /auth/login)", () => {
    expect(TEAMVER_AUTH_SIGNIN_PATH).toBe("/auth/signin");
    setLocation("design.teamver.com");
    expect(resolveTeamverLoginUrl()).toBe(
      "https://teamver.com/auth/signin?returnTo=https%3A%2F%2Fdesign.teamver.com%2F",
    );
  });

  it("stg-design.teamver.com → stg.teamver.com/auth/signin with returnTo", () => {
    setLocation("stg-design.teamver.com", "/projects/abc");
    expect(resolveTeamverMainOrigin()).toBe("https://stg.teamver.com");
    expect(resolveTeamverLoginUrl()).toBe(
      "https://stg.teamver.com/auth/signin?returnTo=https%3A%2F%2Fstg-design.teamver.com%2Fprojects%2Fabc",
    );
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

  it("accepts explicit returnTo override", () => {
    setLocation("stg-design.teamver.com");
    expect(resolveTeamverLoginUrl("https://stg-design.teamver.com/deck/1")).toBe(
      `https://stg.teamver.com/auth/signin?${TEAMVER_AUTH_RETURN_TO_PARAM}=https%3A%2F%2Fstg-design.teamver.com%2Fdeck%2F1`,
    );
  });

  it("redirectToTeamverLogin uses location.replace", () => {
    const { replace } = setLocation("stg-design.teamver.com", "/projects/abc");
    redirectToTeamverLogin();
    expect(replace).toHaveBeenCalledWith(
      "https://stg.teamver.com/auth/signin?returnTo=https%3A%2F%2Fstg-design.teamver.com%2Fprojects%2Fabc",
    );
  });
});

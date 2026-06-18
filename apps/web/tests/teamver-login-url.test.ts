// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  TEAMVER_AUTH_SIGNIN_PATH,
  resolveTeamverLoginUrl,
  resolveTeamverMainOrigin,
} from "../src/teamver/designApiBase";

function setHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    value: new URL(`https://${hostname}/`),
    writable: true,
    configurable: true,
  });
}

describe("resolveTeamverLoginUrl", () => {
  afterEach(() => {
    setHostname("localhost");
  });

  it("uses /auth/signin (not legacy /auth/login)", () => {
    expect(TEAMVER_AUTH_SIGNIN_PATH).toBe("/auth/signin");
    setHostname("design.teamver.com");
    expect(resolveTeamverLoginUrl()).toBe("https://teamver.com/auth/signin");
  });

  it("stg-design.teamver.com → stg.teamver.com/auth/signin", () => {
    setHostname("stg-design.teamver.com");
    expect(resolveTeamverMainOrigin()).toBe("https://stg.teamver.com");
    expect(resolveTeamverLoginUrl()).toBe("https://stg.teamver.com/auth/signin");
  });

  it("localhost dev → stg.teamver.com/auth/signin", () => {
    setHostname("localhost");
    expect(resolveTeamverLoginUrl()).toBe("https://stg.teamver.com/auth/signin");
  });

  it("127.0.0.1 dev → stg.teamver.com/auth/signin", () => {
    setHostname("127.0.0.1");
    expect(resolveTeamverLoginUrl()).toBe("https://stg.teamver.com/auth/signin");
  });
});

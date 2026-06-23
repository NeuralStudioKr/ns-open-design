// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { hasProbableTeamverAuthCookie } from "../src/teamver/teamverAuthCookieHints";

describe("hasProbableTeamverAuthCookie", () => {
  it("returns false when no Teamver auth cookies are visible", () => {
    document.cookie = "other=value";
    expect(hasProbableTeamverAuthCookie()).toBe(false);
  });

  it("returns true when teamver_access_token is readable", () => {
    document.cookie = "teamver_access_token=stale";
    expect(hasProbableTeamverAuthCookie()).toBe(true);
  });
});

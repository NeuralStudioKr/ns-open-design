import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isBrowserOffline,
  isLikelyFetchNetworkFailure,
  noteTeamverNetworkBackoff,
  resetTeamverNetworkBackoffForTests,
  shouldSkipTeamverNetworkCalls,
  TEAMVER_BROWSER_NETWORK_BACKOFF_MS,
} from "../../src/teamver/teamverBrowserNetwork";

describe("teamverBrowserNetwork", () => {
  beforeEach(() => {
    resetTeamverNetworkBackoffForTests();
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects navigator offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isBrowserOffline()).toBe(true);
    expect(shouldSkipTeamverNetworkCalls()).toBe(true);
  });

  it("detects fetch transport failures", () => {
    expect(isLikelyFetchNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isLikelyFetchNetworkFailure(new Error("net::ERR_INTERNET_DISCONNECTED"))).toBe(true);
    expect(isLikelyFetchNetworkFailure(new Error("session_expired"))).toBe(false);
  });

  it("backs off background polls after a transport failure", () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    noteTeamverNetworkBackoff();
    expect(shouldSkipTeamverNetworkCalls()).toBe(true);

    now += TEAMVER_BROWSER_NETWORK_BACKOFF_MS - 1;
    expect(shouldSkipTeamverNetworkCalls()).toBe(true);
  });
});

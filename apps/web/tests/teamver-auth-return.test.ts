// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TEAMVER_AUTH_RETURN_PENDING_KEY,
  consumeTeamverAuthReturnPending,
  isLikelyTeamverAuthReturnNavigation,
  markTeamverAuthReturnPending,
  peekTeamverAuthReturnPending,
  shouldForceEmbedAuthRecoveryOnLoad,
} from "../src/teamver/teamverAuthReturn";

describe("teamverAuthReturn", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "",
      writable: true,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("marks and consumes a pending auth return within the TTL", () => {
    markTeamverAuthReturnPending();
    expect(peekTeamverAuthReturnPending()).toBe(true);
    expect(consumeTeamverAuthReturnPending()).toBe(true);
    expect(peekTeamverAuthReturnPending()).toBe(false);
    expect(consumeTeamverAuthReturnPending()).toBe(false);
  });

  it("detects Main FE sign-in referrer as auth return navigation", () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://stg.teamver.com/auth/signin?returnTo=https%3A%2F%2Fstg-design.teamver.com%2F",
    });
    expect(isLikelyTeamverAuthReturnNavigation()).toBe(true);
    expect(shouldForceEmbedAuthRecoveryOnLoad()).toBe(true);
  });

  it("does not treat unrelated referrers as auth return", () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://example.com/",
    });
    expect(isLikelyTeamverAuthReturnNavigation()).toBe(false);
    expect(shouldForceEmbedAuthRecoveryOnLoad()).toBe(false);
  });

  it("expires stale pending flags", () => {
    sessionStorage.setItem(TEAMVER_AUTH_RETURN_PENDING_KEY, String(Date.now() - 11 * 60_000));
    expect(peekTeamverAuthReturnPending()).toBe(false);
    expect(consumeTeamverAuthReturnPending()).toBe(false);
  });
});

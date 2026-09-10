/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearTeamverWorkspaceAutoSwitchedLatch,
  dispatchTeamverWorkspaceAutoSwitched,
  resetTeamverWorkspaceAutoSwitchedLatchForTests,
  subscribeTeamverWorkspaceAutoSwitched,
} from "../../src/teamver/teamverWorkspaceEvents";

afterEach(() => {
  resetTeamverWorkspaceAutoSwitchedLatchForTests();
  vi.useRealTimers();
});

describe("workspace auto-switched latch (0908-N01 H1)", () => {
  it("replays a dispatch that happened before subscribe", async () => {
    dispatchTeamverWorkspaceAutoSwitched({
      from: "WS-A",
      to: "WS-B",
      reason: "app-disabled",
    });

    const seen: Array<{ from: string; to: string }> = [];
    const unsub = subscribeTeamverWorkspaceAutoSwitched((detail) => {
      seen.push({ from: detail.from, to: detail.to });
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toEqual([{ from: "WS-A", to: "WS-B" }]);
    unsub();
  });

  it("does not replay after the notice is cleared", async () => {
    dispatchTeamverWorkspaceAutoSwitched({
      from: "WS-A",
      to: "WS-B",
      reason: "revoked",
    });
    clearTeamverWorkspaceAutoSwitchedLatch();

    const seen: Array<{ from: string; to: string }> = [];
    const unsub = subscribeTeamverWorkspaceAutoSwitched((detail) => {
      seen.push({ from: detail.from, to: detail.to });
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toEqual([]);
    unsub();
  });

  it("does not replay after the latch TTL expires", async () => {
    vi.useFakeTimers();
    dispatchTeamverWorkspaceAutoSwitched({
      from: "WS-A",
      to: "WS-B",
      reason: "app-disabled",
    });
    vi.advanceTimersByTime(60_001);

    const seen: Array<{ from: string; to: string }> = [];
    const unsub = subscribeTeamverWorkspaceAutoSwitched((detail) => {
      seen.push({ from: detail.from, to: detail.to });
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toEqual([]);
    unsub();
  });

  it("still delivers live events to an already-subscribed listener", () => {
    const seen: Array<{ from: string; to: string }> = [];
    const unsub = subscribeTeamverWorkspaceAutoSwitched((detail) => {
      seen.push({ from: detail.from, to: detail.to });
    });

    dispatchTeamverWorkspaceAutoSwitched({
      from: "WS-1",
      to: "WS-2",
      reason: "revoked",
    });

    expect(seen).toEqual([{ from: "WS-1", to: "WS-2" }]);
    unsub();
  });
});

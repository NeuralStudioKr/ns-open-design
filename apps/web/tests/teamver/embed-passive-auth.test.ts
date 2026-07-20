/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatRunStatusResponse } from "@open-design/contracts";

import {
  mergeActiveRunsIntoMessages,
} from "../../src/teamver/backgroundChatRecovery";
import {
  beginTeamverEmbedActiveWork,
  endTeamverEmbedActiveWork,
  hasTeamverEmbedActiveWork,
  resetTeamverEmbedActiveWorkForTests as resetActiveWork,
} from "../../src/teamver/teamverEmbedActiveWork";
import {
  publishTeamverSessionActiveRunProjectIds,
  resetTeamverEmbedSessionActiveRunProjectIdsForTests,
} from "../../src/teamver/teamverEmbedSessionRuns";
import {
  handleEmbedPassiveUnauthorized,
  resetEmbedPassiveAuthForTests,
  TEAMVER_EMBED_PASSIVE_AUTH_EVENT,
} from "../../src/teamver/teamverEmbedPassiveAuth";

vi.mock("../../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  isBootstrapAuthMode: vi.fn(() => true),
  resolveDesignBffRefreshUrl: vi.fn(() => "/teamver-bff/auth/refresh"),
}));

const refreshMock = vi.fn(async () => true);
const prepareReloadMock = vi.fn();
const probeSessionMock = vi.fn(async () => false);
const ensureSessionMock = vi.fn(async () => false);
vi.mock("../../src/teamver/designBffClient", () => ({
  // All four helpers take no arguments in production; drop the spread so
  // strict-tsc does not flag `(...args: unknown[]) => fn(...args)` against
  // a `() => Promise<boolean>` signature.
  refreshDesignAuthCookie: () => refreshMock(),
  prepareDesignAuthSessionReload: () => prepareReloadMock(),
  probeDesignBffSessionAuthenticated: () => probeSessionMock(),
  ensureDesignBffSessionAuthenticated: () => ensureSessionMock(),
}));

const redirectMock = vi.fn();
vi.mock("../../src/teamver/designAuthFlow", () => ({
  redirectToTeamverLoginPreservingRoute: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("../../src/teamver/teamverEmbedSession", () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => false),
}));

import { isTeamverEmbedSessionAuthenticated } from "../../src/teamver/teamverEmbedSession";

describe("mergeActiveRunsIntoMessages", () => {
  it("synthesizes a recoverable assistant stub for active runs missing from listMessages", () => {
    const activeRuns: ChatRunStatusResponse[] = [{
      id: "run-1",
      projectId: "proj-1",
      conversationId: "conv-1",
      assistantMessageId: "asst-1",
      agentId: null,
      status: "running",
      createdAt: 1,
      updatedAt: 2,
    }];
    const merged = mergeActiveRunsIntoMessages(
      [{ id: "user-1", role: "user", content: "hello", createdAt: 0 }],
      activeRuns,
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      id: "asst-1",
      role: "assistant",
      runId: "run-1",
      runStatus: "running",
    });
  });
});

describe("teamverEmbedPassiveAuth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    redirectMock.mockClear();
    prepareReloadMock.mockClear();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue(true);
    probeSessionMock.mockReset();
    probeSessionMock.mockResolvedValue(false);
    ensureSessionMock.mockReset();
    ensureSessionMock.mockResolvedValue(false);
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(false);
    resetEmbedPassiveAuthForTests();
    resetActiveWork();
    resetTeamverEmbedSessionActiveRunProjectIdsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers login redirect while embed work is active", async () => {
    refreshMock.mockResolvedValue(false);
    const events: string[] = [];
    const onAuth = () => {
      events.push("auth");
    };
    window.addEventListener(TEAMVER_EMBED_PASSIVE_AUTH_EVENT, onAuth);
    beginTeamverEmbedActiveWork();
    handleEmbedPassiveUnauthorized("daemon");
    await vi.runAllTimersAsync();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(events).toEqual(["auth"]);
    endTeamverEmbedActiveWork();
    window.removeEventListener(TEAMVER_EMBED_PASSIVE_AUTH_EVENT, onAuth);
  });

  it("does not redirect when cookie refresh recovers the session", async () => {
    refreshMock.mockResolvedValue(true);
    handleEmbedPassiveUnauthorized("bff");
    await vi.runAllTimersAsync();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(prepareReloadMock).not.toHaveBeenCalled();
  });

  it("does not redirect when refresh fails but /auth/session ensure recovers", async () => {
    refreshMock.mockResolvedValue(false);
    probeSessionMock.mockResolvedValue(false);
    ensureSessionMock.mockResolvedValue(true);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.runAllTimersAsync();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(prepareReloadMock).not.toHaveBeenCalled();
  });

  it("does not redirect when embed memory still says authenticated after probes fail", async () => {
    refreshMock.mockResolvedValue(false);
    probeSessionMock.mockResolvedValue(false);
    ensureSessionMock.mockResolvedValue(false);
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.advanceTimersByTimeAsync(0);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.advanceTimersByTimeAsync(0);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(prepareReloadMock).not.toHaveBeenCalled();
  });

  it("does not redirect when refresh fails but /auth/session is still authenticated", async () => {
    refreshMock.mockResolvedValue(false);
    probeSessionMock.mockResolvedValue(true);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.runAllTimersAsync();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(prepareReloadMock).not.toHaveBeenCalled();
  });

  it("does not redirect on a single unrecovered passive 401", async () => {
    refreshMock.mockResolvedValue(false);
    const events: string[] = [];
    const onAuth = () => {
      events.push("auth");
    };
    window.addEventListener(TEAMVER_EMBED_PASSIVE_AUTH_EVENT, onAuth);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.runAllTimersAsync();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(prepareReloadMock).not.toHaveBeenCalled();
    expect(events).toEqual(["auth"]);
    window.removeEventListener(TEAMVER_EMBED_PASSIVE_AUTH_EVENT, onAuth);
  });

  it("does not redirect on parallel unrecovered 401s that share one recovery", async () => {
    refreshMock.mockResolvedValue(false);
    handleEmbedPassiveUnauthorized("daemon");
    handleEmbedPassiveUnauthorized("bff");
    await vi.advanceTimersByTimeAsync(0);
    await vi.runAllTimersAsync();
    // One shared recovery → one failure credit → below threshold (3).
    expect(redirectMock).not.toHaveBeenCalled();
    expect(prepareReloadMock).not.toHaveBeenCalled();
  });

  it("schedules login redirect only after confirmed consecutive unrecovered failures", async () => {
    refreshMock.mockResolvedValue(false);
    probeSessionMock.mockResolvedValue(false);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.advanceTimersByTimeAsync(0);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.advanceTimersByTimeAsync(0);
    // Threshold is 3 — second failure must not redirect.
    expect(redirectMock).not.toHaveBeenCalled();
    handleEmbedPassiveUnauthorized("daemon");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(prepareReloadMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("cancels pending redirect when a later recovery succeeds", async () => {
    refreshMock.mockResolvedValue(false);
    probeSessionMock.mockResolvedValue(false);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.advanceTimersByTimeAsync(0);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.advanceTimersByTimeAsync(0);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.advanceTimersByTimeAsync(0);
    // Timer is armed after consecutive failures; a later recovery must cancel it.
    refreshMock.mockResolvedValue(true);
    handleEmbedPassiveUnauthorized("daemon");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(prepareReloadMock).not.toHaveBeenCalled();
  });

  it("defers login redirect while a background daemon run is active", async () => {
    refreshMock.mockResolvedValue(false);
    const events: string[] = [];
    const onAuth = () => {
      events.push("auth");
    };
    window.addEventListener(TEAMVER_EMBED_PASSIVE_AUTH_EVENT, onAuth);
    endTeamverEmbedActiveWork();
    publishTeamverSessionActiveRunProjectIds(new Set(["proj-bg"]));
    handleEmbedPassiveUnauthorized("daemon");
    await vi.runAllTimersAsync();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(events).toEqual(["auth"]);
    window.removeEventListener(TEAMVER_EMBED_PASSIVE_AUTH_EVENT, onAuth);
  });

  it("tracks active work depth", () => {
    expect(hasTeamverEmbedActiveWork()).toBe(false);
    beginTeamverEmbedActiveWork();
    expect(hasTeamverEmbedActiveWork()).toBe(true);
    endTeamverEmbedActiveWork();
    expect(hasTeamverEmbedActiveWork()).toBe(false);
  });
});

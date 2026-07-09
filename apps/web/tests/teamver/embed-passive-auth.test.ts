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
  handleEmbedPassiveUnauthorized,
  resetEmbedPassiveAuthForTests,
  TEAMVER_EMBED_PASSIVE_AUTH_EVENT,
} from "../../src/teamver/teamverEmbedPassiveAuth";

vi.mock("../../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  isBootstrapAuthMode: vi.fn(() => true),
}));

vi.mock("../../src/teamver/designBffClient", () => ({
  refreshDesignAuthCookie: vi.fn(async () => true),
}));

const redirectMock = vi.fn();
vi.mock("../../src/teamver/designAuthFlow", () => ({
  redirectToTeamverLoginPreservingRoute: (...args: unknown[]) => redirectMock(...args),
}));

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
    resetEmbedPassiveAuthForTests();
    resetActiveWork();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers login redirect while embed work is active", async () => {
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

  it("schedules login redirect when idle after passive 401", async () => {
    handleEmbedPassiveUnauthorized("daemon");
    await vi.runAllTimersAsync();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("tracks active work depth", () => {
    expect(hasTeamverEmbedActiveWork()).toBe(false);
    beginTeamverEmbedActiveWork();
    expect(hasTeamverEmbedActiveWork()).toBe(true);
    endTeamverEmbedActiveWork();
    expect(hasTeamverEmbedActiveWork()).toBe(false);
  });
});

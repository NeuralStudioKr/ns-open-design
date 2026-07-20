import { beforeEach, describe, expect, it } from "vitest";

import {
  decideEmbedBackgroundRunCompletion,
  processEmbedBackgroundRunCompletions,
  resetEmbedRunTrackingRefs,
  seedEmbedRunTrackingFromRuns,
  shouldNotifyEmbedBackgroundRunCompletion,
  buildEmbedKnownProjectIds,
  filterRunsForEmbedKnownProjects,
  noticeStatusForBackgroundRun,
  pruneSessionActiveRunProjectIds,
  buildEmbedActiveRunAllowMissingIds,
} from "../src/teamver/teamverEmbedRunTracking";
import {
  hasTeamverEmbedBackgroundRuns,
  publishTeamverSessionActiveRunProjectIds,
  resetTeamverEmbedSessionActiveRunProjectIdsForTests,
} from "../src/teamver/teamverEmbedSessionRuns";
import type { ChatRunStatusResponse } from "@open-design/contracts";

describe("resetEmbedRunTrackingRefs", () => {
  beforeEach(() => {
    resetTeamverEmbedSessionActiveRunProjectIdsForTests();
  });

  it("clears run ids and publishes empty passive-auth snapshot", () => {
    const refs = {
      activeRunIds: { current: new Set(["r1"]) },
      notifiedBackgroundRunIds: { current: new Set(["r2"]) },
      wasActiveRun: { current: true },
      activeRunSignature: { current: "p1:running:1" },
      sessionActiveRunProjectIds: { current: new Set(["p1"]) },
    };
    publishTeamverSessionActiveRunProjectIds(refs.sessionActiveRunProjectIds.current);
    expect(hasTeamverEmbedBackgroundRuns()).toBe(true);

    resetEmbedRunTrackingRefs(refs);

    expect(refs.activeRunIds.current.size).toBe(0);
    expect(refs.notifiedBackgroundRunIds.current.size).toBe(0);
    expect(refs.wasActiveRun.current).toBe(false);
    expect(refs.activeRunSignature.current).toBe("");
    expect(refs.sessionActiveRunProjectIds.current.size).toBe(0);
    expect(hasTeamverEmbedBackgroundRuns()).toBe(false);
  });
});

describe("decideEmbedBackgroundRunCompletion", () => {
  it("defers while project list is loading, suppresses cross-workspace, notifies in-list", () => {
    const projects = new Map([["p1", {}], ["p2", {}]]);
    expect(decideEmbedBackgroundRunCompletion("p1", projects, true)).toBe("notify");
    expect(decideEmbedBackgroundRunCompletion("p-other", projects, true)).toBe("suppress");
    expect(decideEmbedBackgroundRunCompletion("p1", projects, false)).toBe("defer");
    expect(decideEmbedBackgroundRunCompletion("p1", new Map(), true)).toBe("suppress");
    expect(decideEmbedBackgroundRunCompletion(null, projects, true)).toBe("suppress");
  });

  it("notifies pending-local projects before server list hydration", () => {
    const projects = new Map<string, unknown>();
    const pending = new Set(["p-new"]);
    expect(
      decideEmbedBackgroundRunCompletion("p-new", projects, true, pending),
    ).toBe("notify");
  });

  it("notifies session-active projects when workspace list is empty", () => {
    const projects = new Map<string, unknown>();
    const sessionActive = new Set(["p-in-flight"]);
    expect(
      decideEmbedBackgroundRunCompletion("p-in-flight", projects, true, undefined, sessionActive),
    ).toBe("notify");
    expect(
      decideEmbedBackgroundRunCompletion("p-other", projects, true, undefined, sessionActive),
    ).toBe("suppress");
  });

  it("suppresses locally deleted projects even when session-active", () => {
    const projects = new Map<string, unknown>();
    const sessionActive = new Set(["p-deleted"]);
    const deleted = new Map([["p-deleted", 1]]);
    expect(
      decideEmbedBackgroundRunCompletion(
        "p-deleted",
        projects,
        true,
        undefined,
        sessionActive,
        deleted,
      ),
    ).toBe("suppress");
  });

  it("shouldNotify wrapper matches notify decision", () => {
    const projects = new Map([["p1", {}]]);
    expect(shouldNotifyEmbedBackgroundRunCompletion("p1", projects, true)).toBe(true);
    expect(shouldNotifyEmbedBackgroundRunCompletion("p1", projects, false)).toBe(false);
  });
});

describe("processEmbedBackgroundRunCompletions", () => {
  it("defers notified marking until list settled and picks newest notify candidate", () => {
    const refs = {
      activeRunIds: { current: new Set<string>() },
      notifiedBackgroundRunIds: { current: new Set<string>() },
      wasActiveRun: { current: false },
      activeRunSignature: { current: "" },
      sessionActiveRunProjectIds: { current: new Set<string>() },
    };
    const projects = new Map([["p1", {}]]);
    const completed: ChatRunStatusResponse[] = [
      { id: "r2", projectId: "p1", status: "succeeded", updatedAt: 20, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
      { id: "r1", projectId: "p-other", status: "failed", updatedAt: 30, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
    ];

    const deferred = processEmbedBackgroundRunCompletions(completed, projects, false, refs);
    expect(deferred).toBeUndefined();
    expect(refs.notifiedBackgroundRunIds.current.size).toBe(0);

    const toastRun = processEmbedBackgroundRunCompletions(completed, projects, true, refs);
    expect(toastRun?.id).toBe("r2");
    expect(refs.notifiedBackgroundRunIds.current).toEqual(new Set(["r2", "r1"]));
  });
});

describe("noticeStatusForBackgroundRun", () => {
  it("maps succeeded unfinished runs to incomplete notices", () => {
    expect(noticeStatusForBackgroundRun({
      status: "succeeded",
      endedWithUnfinishedWork: true,
    })).toBe("incomplete");
    expect(noticeStatusForBackgroundRun({
      status: "succeeded",
      endedWithUnfinishedWork: false,
    })).toBe("succeeded");
    expect(noticeStatusForBackgroundRun({
      status: "failed",
      endedWithUnfinishedWork: true,
    })).toBe("failed");
  });
});

describe("seedEmbedRunTrackingFromRuns", () => {
  beforeEach(() => {
    resetTeamverEmbedSessionActiveRunProjectIdsForTests();
  });

  it("tracks active runs and marks terminal runs as already notified", () => {
    const refs = {
      activeRunIds: { current: new Set<string>() },
      notifiedBackgroundRunIds: { current: new Set<string>() },
      wasActiveRun: { current: false },
      activeRunSignature: { current: "" },
      sessionActiveRunProjectIds: { current: new Set<string>() },
    };
    const runs: ChatRunStatusResponse[] = [
      { id: "r1", projectId: "p1", status: "running", updatedAt: 1, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
      { id: "r2", projectId: "p1", status: "succeeded", updatedAt: 2, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
      { id: "q1", projectId: "p2", status: "queued", updatedAt: 3, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
    ];

    seedEmbedRunTrackingFromRuns(refs, runs);

    expect(refs.activeRunIds.current).toEqual(new Set(["r1", "q1"]));
    expect(refs.sessionActiveRunProjectIds.current).toEqual(new Set(["p1", "p2"]));
    expect(refs.notifiedBackgroundRunIds.current).toEqual(new Set(["r2"]));
    expect(hasTeamverEmbedBackgroundRuns()).toBe(true);
  });

  it("tracks active runs only from workspace subset while marking all terminal runs notified", () => {
    const refs = {
      activeRunIds: { current: new Set<string>() },
      notifiedBackgroundRunIds: { current: new Set<string>() },
      wasActiveRun: { current: false },
      activeRunSignature: { current: "" },
      sessionActiveRunProjectIds: { current: new Set<string>() },
    };
    const runs: ChatRunStatusResponse[] = [
      { id: "r1", projectId: "p1", status: "running", updatedAt: 1, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
      { id: "rX", projectId: "p-other", status: "running", updatedAt: 2, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
      { id: "r2", projectId: "p-other", status: "succeeded", updatedAt: 3, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
    ];

    seedEmbedRunTrackingFromRuns(refs, runs, runs.filter((run) => run.projectId === "p1"));

    expect(refs.activeRunIds.current).toEqual(new Set(["r1"]));
    expect(refs.sessionActiveRunProjectIds.current).toEqual(new Set(["p1"]));
    expect(refs.notifiedBackgroundRunIds.current).toEqual(new Set(["r2"]));
  });
});

describe("buildEmbedKnownProjectIds", () => {
  it("merges list, pending-local, session-active, and open project route", () => {
    const known = buildEmbedKnownProjectIds({
      projectIds: ["p1"],
      pendingLocalProjectIds: new Set(["p-new"]),
      sessionActiveRunProjectIds: new Set(["p-in-flight"]),
      openProjectId: "p-deep",
    });
    expect(known).toEqual(new Set(["p1", "p-new", "p-in-flight", "p-deep"]));
  });

  it("excludes locally deleted project ids", () => {
    const known = buildEmbedKnownProjectIds({
      projectIds: ["p1", "p-deleted"],
      locallyDeletedProjectIds: new Map([["p-deleted", 1]]),
    });
    expect(known).toEqual(new Set(["p1"]));
  });
});

describe("filterRunsForEmbedKnownProjects", () => {
  it("drops runs outside the workspace project set", () => {
    const runs: ChatRunStatusResponse[] = [
      { id: "r1", projectId: "p1", status: "running", updatedAt: 1, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
      { id: "r2", projectId: "p-other", status: "running", updatedAt: 2, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
    ];
    const filtered = filterRunsForEmbedKnownProjects(runs, new Set(["p1"]));
    expect(filtered.map((run) => run.id)).toEqual(["r1"]);
  });

  it("returns empty when no known project ids", () => {
    const runs: ChatRunStatusResponse[] = [
      { id: "r1", projectId: "p1", status: "running", updatedAt: 1, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
    ];
    expect(filterRunsForEmbedKnownProjects(runs, new Set())).toEqual([]);
  });
});

describe("pruneSessionActiveRunProjectIds", () => {
  it("drops ids that rejoined the list or were locally deleted", () => {
    const sessionActive = new Set(["p1", "p-orphan", "p-deleted"]);
    const projectsById = new Map([["p1", {}]]);
    const deleted = new Map([["p-deleted", 1]]);

    pruneSessionActiveRunProjectIds(sessionActive, { projectsById, locallyDeletedProjectIds: deleted });

    expect(sessionActive).toEqual(new Set(["p-orphan"]));
  });
});

describe("buildEmbedActiveRunAllowMissingIds", () => {
  it("merges session-active and pending-local minus locally deleted", () => {
    const allow = buildEmbedActiveRunAllowMissingIds({
      sessionActiveRunProjectIds: new Set(["p-in-flight", "p-deleted"]),
      pendingLocalProjectIds: new Set(["p-new", "p-deleted"]),
      locallyDeletedProjectIds: new Map([["p-deleted", 1]]),
    });
    expect(allow).toEqual(new Set(["p-in-flight", "p-new"]));
  });
});

import { describe, expect, it } from "vitest";

import {
  decideEmbedBackgroundRunCompletion,
  processEmbedBackgroundRunCompletions,
  resetEmbedRunTrackingRefs,
  seedEmbedRunTrackingFromRuns,
  shouldNotifyEmbedBackgroundRunCompletion,
} from "../src/teamver/teamverEmbedRunTracking";
import type { ChatRunStatusResponse } from "@open-design/contracts";

describe("resetEmbedRunTrackingRefs", () => {
  it("clears run ids and signature bookkeeping", () => {
    const refs = {
      activeRunIds: { current: new Set(["r1"]) },
      notifiedBackgroundRunIds: { current: new Set(["r2"]) },
      wasActiveRun: { current: true },
      activeRunSignature: { current: "p1:running:1" },
    };

    resetEmbedRunTrackingRefs(refs);

    expect(refs.activeRunIds.current.size).toBe(0);
    expect(refs.notifiedBackgroundRunIds.current.size).toBe(0);
    expect(refs.wasActiveRun.current).toBe(false);
    expect(refs.activeRunSignature.current).toBe("");
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

describe("seedEmbedRunTrackingFromRuns", () => {
  it("tracks active runs and marks terminal runs as already notified", () => {
    const refs = {
      activeRunIds: { current: new Set<string>() },
      notifiedBackgroundRunIds: { current: new Set<string>() },
      wasActiveRun: { current: false },
      activeRunSignature: { current: "" },
    };
    const runs: ChatRunStatusResponse[] = [
      { id: "r1", projectId: "p1", status: "running", updatedAt: 1, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
      { id: "r2", projectId: "p1", status: "succeeded", updatedAt: 2, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
      { id: "q1", projectId: "p2", status: "queued", updatedAt: 3, createdAt: 0, conversationId: null, assistantMessageId: null, agentId: null },
    ];

    seedEmbedRunTrackingFromRuns(refs, runs);

    expect(refs.activeRunIds.current).toEqual(new Set(["r1", "q1"]));
    expect(refs.notifiedBackgroundRunIds.current).toEqual(new Set(["r2"]));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  maybeReportTeamverUsageAfterSave,
  resetTeamverReportedRunIdsForTests,
} from "../src/teamver/maybeReportTeamverUsageAfterSave";
import { finalizeTeamverByokBilling } from "../src/teamver/teamverByokBilling";
import * as designApiBase from "../src/teamver/designApiBase";
import * as designBffClient from "../src/teamver/designBffClient";
import * as reportUsage from "../src/teamver/reportUsage";
import * as teamverByokBilling from "../src/teamver/teamverByokBilling";
import * as activeTeamverWorkspace from "../src/teamver/activeTeamverWorkspace";
import * as teamverDesignAccess from "../src/teamver/teamverDesignAccess";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

const mockPost = vi.fn();

vi.mock("../src/teamver/designBffClient", () => ({
  getDesignBffClient: vi.fn(() => ({
    http: { post: mockPost },
  })),
  withDesignBffCookieAuthRecovery: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../src/teamver/reportUsage", () => ({
  reportTeamverDesignUsage: vi.fn(async () => "UREQ-TEST"),
}));

vi.mock("../src/teamver/activeTeamverWorkspace", () => ({
  resolveActiveTeamverWorkspaceIdForEmbed: vi.fn(async () => "ws-1"),
}));

vi.mock("../src/teamver/teamverDesignAccess", () => ({
  isTeamverDesignAppEnabled: vi.fn(() => true),
}));

describe("teamverByokBilling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finalizeTeamverByokBilling posts camelCase payload to billing endpoint", async () => {
    mockPost.mockResolvedValueOnce({
      ok: true,
      usageId: "u-1",
      billingStatus: "committed",
      creditsCommitted: true,
      creditsAmountT: 9,
    });

    const result = await finalizeTeamverByokBilling({
      workspaceId: "ws-1",
      runId: "msg-1",
      runStatus: "succeeded",
      modelName: "claude-sonnet-4-5",
      inputTokens: 100,
      outputTokens: 50,
      tokenCountSource: "provider_usage",
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/billing/finalize-byok-run",
      expect.objectContaining({
        workspaceId: "ws-1",
        runId: "msg-1",
        runStatus: "succeeded",
        modelName: "claude-sonnet-4-5",
        inputTokens: 100,
        outputTokens: 50,
        tokenCountSource: "provider_usage",
      }),
      expect.objectContaining({ workspaceId: "ws-1", skipAuthHeader: true }),
    );
    expect(result).toEqual({
      ok: true,
      usageId: "u-1",
      billingStatus: "committed",
      creditsCommitted: true,
      creditsAmountT: 9,
      error: null,
      idempotent: false,
    });
  });
});

describe("maybeReportTeamverUsageAfterSave BYOK billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTeamverReportedRunIdsForTests();
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(activeTeamverWorkspace.resolveActiveTeamverWorkspaceIdForEmbed).mockResolvedValue(
      "ws-1",
    );
    vi.mocked(teamverDesignAccess.isTeamverDesignAppEnabled).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finalizes billing before usage report on succeeded BYOK runs", async () => {
    const calls: string[] = [];
    vi.spyOn(teamverByokBilling, "finalizeTeamverByokBilling").mockImplementation(async () => {
      calls.push("billing");
      return {
        ok: true,
        usageId: "u-byok-1",
        billingStatus: "committed",
        creditsCommitted: true,
        creditsAmountT: 42,
      };
    });
    vi.mocked(reportUsage.reportTeamverDesignUsage).mockImplementation(async () => {
      calls.push("usage");
      return "UREQ-TEST";
    });

    const message = {
      id: "assistant-msg-1",
      role: "assistant" as const,
      runStatus: "succeeded",
      events: [{ kind: "usage" as const, inputTokens: 10, outputTokens: 5 }],
    };

    await maybeReportTeamverUsageAfterSave("p1", message, { telemetryFinalized: true });

    expect(calls).toEqual(["billing", "usage"]);
    expect(teamverByokBilling.finalizeTeamverByokBilling).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        runId: "assistant-msg-1",
        runStatus: "succeeded",
      }),
    );
    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        registryUsageId: "u-byok-1",
        billingStatus: "committed",
        creditsCommitted: true,
        creditsAmountT: 42,
      }),
    );
  });

  it("skips billing finalize for failed terminal runs but still reports usage", async () => {
    const billingSpy = vi.spyOn(teamverByokBilling, "finalizeTeamverByokBilling");

    const message = {
      id: "assistant-msg-2",
      role: "assistant" as const,
      runStatus: "failed",
      events: [{ kind: "usage" as const, inputTokens: 1, outputTokens: 1 }],
    };

    await maybeReportTeamverUsageAfterSave("p1", message, { telemetryFinalized: true });

    expect(billingSpy).not.toHaveBeenCalled();
    expect(reportUsage.reportTeamverDesignUsage).toHaveBeenCalledWith(
      expect.not.objectContaining({
        registryUsageId: expect.anything(),
      }),
    );
  });
});

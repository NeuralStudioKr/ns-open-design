import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  maybeReportTeamverUsageAfterSave,
} from "../src/teamver/maybeReportTeamverUsageAfterSave";
import { finalizeTeamverByokBilling } from "../src/teamver/teamverByokBilling";
import * as designApiBase from "../src/teamver/designApiBase";
import * as designBffClient from "../src/teamver/designBffClient";
import * as reportUsage from "../src/teamver/reportUsage";

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
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
  });

  it("does not call FE billing or usage — daemon message PUT is authoritative", async () => {
    const message = {
      id: "assistant-msg-1",
      role: "assistant" as const,
      runStatus: "succeeded",
      events: [{ kind: "usage" as const, inputTokens: 10, outputTokens: 5 }],
    };

    await maybeReportTeamverUsageAfterSave("p1", message, { telemetryFinalized: true });

    expect(mockPost).not.toHaveBeenCalled();
    expect(reportUsage.reportTeamverDesignUsage).not.toHaveBeenCalled();
  });
});

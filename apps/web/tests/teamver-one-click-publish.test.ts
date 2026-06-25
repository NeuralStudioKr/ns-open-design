// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getWorkspaceMock = vi.fn(async () => "ws-1");
const listTargetsMock = vi.fn(async () => [
  {
    id: "shared:SD-1:FLD-EXPORTS",
    label: "Product / Exports",
    description: "팀 드라이브 폴더",
    folderId: "FLD-EXPORTS",
    sharedDriveId: "SD-1",
  },
]);
const publishMock = vi.fn(async () => ({
  projectId: "p1",
  partial: false,
  outputs: [
    {
      id: "out-1",
      kind: "html",
      driveAssetId: "AST-1",
      filename: "Deck.html",
      publishStatus: "ready",
      publishedAt: "2026-06-22T10:00:00Z",
      sizeBytes: 100,
      mimeType: "text/html",
    },
  ],
}));
const designEnabledMock = vi.fn();

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: () => true,
  resolveTeamverDriveAssetUrl: (id: string) => `https://teamver.test/drive/${id}`,
}));

vi.mock("../src/teamver/activeTeamverWorkspace", () => ({
  readActiveTeamverWorkspaceId: (...args: unknown[]) => getWorkspaceMock(...args),
}));

vi.mock("../src/teamver/drivePublishTargets", () => ({
  listTeamverDrivePublishTargets: (...args: unknown[]) => listTargetsMock(...args),
}));

vi.mock("../src/teamver/publishToDrive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teamver/publishToDrive")>();
  return {
    ...actual,
    publishTeamverDesignToDrive: (...args: unknown[]) => publishMock(...args),
  };
});

vi.mock("../src/teamver/teamverDesignAccess", () => ({
  assertTeamverDesignAppEnabled: (...args: unknown[]) => designEnabledMock(...args),
}));

vi.mock("../src/teamver/latestPublishSummary", () => ({
  clearLatestPublishSummaryCache: vi.fn(),
  prefetchLatestPublishSummaries: vi.fn(),
}));

vi.mock("../src/teamver/teamverPublishEvents", () => ({
  notifyTeamverPublishOutputsChanged: vi.fn(),
}));

import {
  buildOneClickPublishToast,
  maybeOneClickPublishToDrive,
} from "../src/teamver/teamverOneClickPublish";

const STORAGE_KEY = "teamver.drive.lastPublishTarget.ws-1.p1";

describe("maybeOneClickPublishToDrive (loop 409)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    designEnabledMock.mockImplementation(() => undefined);
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("skips when no remembered publish target exists", async () => {
    const result = await maybeOneClickPublishToDrive("p1", "deck.html");
    expect(result).toEqual({ status: "skipped", reason: "no_last_target" });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("publishes to the remembered Drive target", async () => {
    window.localStorage.setItem(STORAGE_KEY, "shared:SD-1:FLD-EXPORTS");

    const result = await maybeOneClickPublishToDrive("p1", "deck.html");

    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        artifactFile: "deck.html",
        folderId: "FLD-EXPORTS",
        sharedDriveId: "SD-1",
      }),
    );
    expect(result.status).toBe("published");
    if (result.status === "published") {
      expect(result.output.driveAssetId).toBe("AST-1");
    }
  });

  it("builds a success toast with Drive deep-link", () => {
    const toast = buildOneClickPublishToast({
      status: "published",
      partial: false,
      output: {
        id: "out-1",
        kind: "html",
        driveAssetId: "AST-1",
        filename: "Deck.html",
        publishStatus: "ready",
        sizeBytes: 1,
        mimeType: "text/html",
      },
    });
    expect(toast?.message).toContain("발행했습니다");
    expect(toast?.detailsHref).toBe("https://teamver.test/drive/AST-1");
  });
});

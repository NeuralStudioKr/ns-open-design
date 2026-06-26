import { describe, expect, it, vi, beforeEach } from "vitest";
import { listTeamverDrivePublishRecentAssets } from "../src/teamver/drivePublishRecentAssets";

vi.mock("../src/teamver/driveApi", () => ({
  getTeamverDriveJson: vi.fn(),
}));

import { getTeamverDriveJson } from "../src/teamver/driveApi";

describe("listTeamverDrivePublishRecentAssets", () => {
  beforeEach(() => {
    vi.mocked(getTeamverDriveJson).mockReset();
  });

  it("maps home recent assets to folder publish picks", async () => {
    vi.mocked(getTeamverDriveJson).mockResolvedValue({
      assets: [
        {
          assetId: "A-1",
          name: "deck.html",
          type: "text/html",
          folderId: "FLD-1",
          sizeBytes: 4096,
        },
        {
          assetId: "A-2",
          name: "shared.png",
          type: "image/png",
          folderId: "FLD-2",
          sharedDriveId: "SD-1",
        },
        { assetId: "A-1", name: "dup", folderId: "FLD-9" },
        { assetId: "A-3", name: "no-folder" },
      ],
    });

    const rows = await listTeamverDrivePublishRecentAssets("ws-1", { limit: 8 });
    expect(rows).toEqual([
      {
        assetId: "A-1",
        name: "deck.html",
        mimeType: "text/html",
        sizeBytes: 4096,
        folderId: "FLD-1",
        sharedDriveId: null,
      },
    ]);
    expect(getTeamverDriveJson).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/drive/home/recent"),
      "ws-1",
    );
  });

  it("returns empty list for blank workspace", async () => {
    await expect(listTeamverDrivePublishRecentAssets("  ")).resolves.toEqual([]);
    expect(getTeamverDriveJson).not.toHaveBeenCalled();
  });
});

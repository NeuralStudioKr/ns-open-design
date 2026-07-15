import { afterEach, describe, expect, it, vi } from "vitest";

const getTeamverDriveJson = vi.fn();

vi.mock("../src/teamver/driveApi", () => ({
  getTeamverDriveJson: (...args: unknown[]) => getTeamverDriveJson(...args),
}));

import { invalidateTeamverDriveHomeRecentCaches } from "../src/teamver/driveHomeRecentCache";
import { listTeamverDrivePublishHomeRecentTargets } from "../src/teamver/drivePublishHomeRecent";

describe("listTeamverDrivePublishHomeRecentTargets", () => {
  afterEach(() => {
    getTeamverDriveJson.mockReset();
    invalidateTeamverDriveHomeRecentCaches();
  });

  it("returns empty when workspace is missing", async () => {
    await expect(listTeamverDrivePublishHomeRecentTargets("  ")).resolves.toEqual([]);
    expect(getTeamverDriveJson).not.toHaveBeenCalled();
  });

  it("maps shared drives and recent asset parent folders", async () => {
    getTeamverDriveJson.mockResolvedValue({
      sharedWithMe: [
        { type: "shared_drive", sharedDriveId: "sd-1", name: "Marketing" },
      ],
      assets: [
        {
          assetId: "a1",
          name: "deck.html",
          folderId: "folder-a",
          sharedDriveId: "sd-1",
          sharedDriveName: "Marketing",
        },
        {
          assetId: "a2",
          name: "notes.md",
          folderId: "folder-b",
        },
        {
          assetId: "a3",
          name: "root-file.txt",
          folderId: null,
        },
      ],
    });

    const targets = await listTeamverDrivePublishHomeRecentTargets("ws-1");

    expect(getTeamverDriveJson).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/drive/home/recent"),
      "ws-1",
    );
    expect(targets).toEqual([
      {
        id: "shared:sd-1",
        label: "Marketing",
        description: "공유된 팀 드라이브",
        folderId: null,
        sharedDriveId: "sd-1",
      },
      {
        id: "shared:sd-1:folder-a",
        label: "Marketing",
        description: "최근: deck.html",
        folderId: "folder-a",
        sharedDriveId: "sd-1",
      },
      {
        id: "personal:folder-b",
        label: "내 드라이브",
        description: "최근: notes.md",
        folderId: "folder-b",
        sharedDriveId: null,
      },
    ]);
  });

  it("dedupes folder targets from multiple assets in the same folder", async () => {
    getTeamverDriveJson.mockResolvedValue({
      sharedWithMe: [],
      assets: [
        { assetId: "a1", name: "one.html", folderId: "f1" },
        { assetId: "a2", name: "two.html", folderId: "f1" },
      ],
    });

    const targets = await listTeamverDrivePublishHomeRecentTargets("ws-1");
    expect(targets).toHaveLength(1);
    expect(targets[0]?.description).toBe("최근: one.html");
  });
});

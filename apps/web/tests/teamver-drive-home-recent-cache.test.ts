import { afterEach, describe, expect, it, vi } from "vitest";

const getTeamverDriveJson = vi.fn();

vi.mock("../src/teamver/driveApi", () => ({
  getTeamverDriveJson: (...args: unknown[]) => getTeamverDriveJson(...args),
}));

import { invalidateTeamverDriveHomeRecentCaches } from "../src/teamver/driveHomeRecentCache";
import { listTeamverDriveImportRecent } from "../src/teamver/driveImportList";
import { listTeamverDrivePublishHomeRecentTargets } from "../src/teamver/drivePublishHomeRecent";
import { listTeamverDrivePublishRecentAssets } from "../src/teamver/drivePublishRecentAssets";

describe("drive home recent shared cache", () => {
  afterEach(() => {
    getTeamverDriveJson.mockReset();
    invalidateTeamverDriveHomeRecentCaches();
  });

  it("dedupes concurrent import + publish surfaces onto one /home/recent call", async () => {
    getTeamverDriveJson.mockResolvedValue({
      sharedWithMe: [{ sharedDriveId: "sd-1", name: "Marketing" }],
      assets: [
        {
          assetId: "a1",
          name: "logo.png",
          folderId: "folder-a",
          kind: "image/png",
          sizeBytes: 12,
        },
      ],
    });

    const [importRows, publishAssets, homeTargets] = await Promise.all([
      listTeamverDriveImportRecent({ workspaceId: "ws-1", limit: 16 }),
      listTeamverDrivePublishRecentAssets("ws-1", { limit: 16 }),
      listTeamverDrivePublishHomeRecentTargets("ws-1", { limit: 12 }),
    ]);

    expect(getTeamverDriveJson).toHaveBeenCalledTimes(1);
    expect(importRows[0]).toEqual(
      expect.objectContaining({ assetId: "a1", name: "logo.png" }),
    );
    expect(publishAssets[0]).toEqual(
      expect.objectContaining({ assetId: "a1", folderId: "folder-a" }),
    );
    expect(homeTargets.some((target) => target.id === "shared:sd-1")).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  resolveTeamverMainApiBaseUrl: vi.fn(() => "https://stg-api.teamver.com"),
}));

import { listTeamverDrivePublishTargets } from "../src/teamver/drivePublishTargets";

describe("listTeamverDrivePublishTargets", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists personal folders and shared drive roots", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/drive/folder?shallow_tree=true")) {
        return Response.json({
          root_folder_id: "FLD-MY-ROOT",
          items: [
            {
              folder_id: "FLD-MY-ROOT",
              name: "Root",
              folder_type: "ROOT",
              children: [{ folder_id: "FLD-MY-DESIGNS", name: "Designs" }],
            },
          ],
        });
      }
      if (url.endsWith("/api/v2/shared-drive")) {
        return Response.json({
          data: [
            { id: "SD-1", name: "Product", status: "ACTIVE", workspace_id: "ws-1" },
            { id: "SD-OLD", name: "Archived", status: "ARCHIVED", workspace_id: "ws-1" },
          ],
        });
      }
      if (url.endsWith("/api/v2/shared-drive/SD-1/folder-tree")) {
        return Response.json({ rootFolderId: "FLD-SD-ROOT", items: [] });
      }
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const targets = await listTeamverDrivePublishTargets("ws-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://stg-api.teamver.com/api/drive/folder?shallow_tree=true",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "X-Workspace-Id": "ws-1" }),
      }),
    );
    expect(targets).toEqual([
      expect.objectContaining({
        id: "personal-root",
        folderId: "FLD-MY-ROOT",
        sharedDriveId: null,
      }),
      expect.objectContaining({
        id: "personal:FLD-MY-DESIGNS",
        folderId: "FLD-MY-DESIGNS",
        sharedDriveId: null,
      }),
      expect.objectContaining({
        id: "shared:SD-1",
        label: "Product",
        folderId: "FLD-SD-ROOT",
        sharedDriveId: "SD-1",
      }),
    ]);
  });

  it("falls back to default personal destination when target APIs fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );

    await expect(listTeamverDrivePublishTargets("ws-1")).resolves.toEqual([
      {
        id: "personal-default",
        label: "My Drive",
        description: "Default Drive destination",
        folderId: null,
        sharedDriveId: null,
      },
    ]);
  });
});

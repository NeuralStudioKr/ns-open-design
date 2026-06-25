import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teamver/designApiBase")>();
  return {
    ...actual,
    resolveTeamverDriveBffBase: vi.fn(() => "/teamver-bff/drive"),
  };
});

import {
  listTeamverDrivePublishTargets,
  searchTeamverDrivePublishTargets,
} from "../src/teamver/drivePublishTargets";

describe("listTeamverDrivePublishTargets", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists personal folders and shared drive folders", async () => {
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
        return Response.json({
          rootFolderId: "FLD-SD-ROOT",
          items: [
            {
              folderId: "FLD-SD-ROOT",
              name: "Shared Root",
              folderType: "SHARED_ROOT",
              children: [
                {
                  folderId: "FLD-SD-DESIGN",
                  name: "Design",
                  children: [{ folderId: "FLD-SD-EXPORTS", name: "Exports" }],
                },
              ],
            },
          ],
        });
      }
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const targets = await listTeamverDrivePublishTargets("ws-1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/teamver-bff/drive/api/drive/folder?shallow_tree=true",
    );
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(firstHeaders.get("X-Workspace-Id")).toBe("ws-1");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ credentials: "include", method: "GET" }),
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
      expect.objectContaining({
        id: "shared:SD-1:FLD-SD-DESIGN",
        label: "Product / Design",
        folderId: "FLD-SD-DESIGN",
        sharedDriveId: "SD-1",
      }),
      expect.objectContaining({
        id: "shared:SD-1:FLD-SD-EXPORTS",
        label: "Product /   - Exports",
        folderId: "FLD-SD-EXPORTS",
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
        label: "내 드라이브",
        description: "기본 드라이브 위치",
        folderId: null,
        sharedDriveId: null,
      },
    ]);
  });

  it("honors a larger target limit for picker modal browsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/drive/folder?shallow_tree=true")) {
          return Response.json({
            root_folder_id: "FLD-MY-ROOT",
            items: [
              {
                folder_id: "FLD-MY-ROOT",
                name: "Root",
                folder_type: "ROOT",
                children: Array.from({ length: 32 }, (_, index) => ({
                  folder_id: `FLD-${index}`,
                  name: `Folder ${index}`,
                })),
              },
            ],
          });
        }
        if (url.endsWith("/api/v2/shared-drive")) {
          return Response.json({ data: [] });
        }
        return new Response("missing", { status: 404 });
      }),
    );

    const defaultTargets = await listTeamverDrivePublishTargets("ws-1");
    const modalTargets = await listTeamverDrivePublishTargets("ws-1", { limit: 40 });

    expect(defaultTargets).toHaveLength(28);
    expect(modalTargets).toHaveLength(33);
    expect(modalTargets.at(-1)?.id).toBe("personal:FLD-31");
  });

  it("searches publish folders through Drive search APIs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/v2/shared-drive")) {
          return Response.json({
            data: [{ id: "SD-1", name: "Product", status: "ACTIVE", workspace_id: "ws-1" }],
          });
        }
        if (url.includes("/api/v2/drive/home/search?") && url.includes("shared_drive_id=SD-1")) {
          return Response.json({
            hits: [
              {
                hit_type: "folder",
                folder_id: "FLD-SD-EXPORTS",
                name: "Exports",
                shared_drive_id: "SD-1",
              },
              { hit_type: "asset", asset_id: "AST-1", name: "Deck.html" },
            ],
          });
        }
        if (
          url.includes("/api/drive/list?")
          && url.includes("search=exports")
          && !url.includes("shared_drive_id=SD-1")
        ) {
          return Response.json({
            items: [
              { folder_id: "FLD-MY-EXPORTS", name: "My Exports" },
              { asset_id: "AST-2", name: "Ignored.pdf" },
            ],
          });
        }
        return Response.json({ items: [] });
      }),
    );

    const targets = await searchTeamverDrivePublishTargets("ws-1", "exports");

    expect(targets).toEqual([
      expect.objectContaining({
        id: "personal:FLD-MY-EXPORTS",
        label: "My Exports",
        folderId: "FLD-MY-EXPORTS",
        sharedDriveId: null,
      }),
      expect.objectContaining({
        id: "shared:SD-1:FLD-SD-EXPORTS",
        label: "Product / Exports",
        folderId: "FLD-SD-EXPORTS",
        sharedDriveId: "SD-1",
      }),
    ]);
  });
});

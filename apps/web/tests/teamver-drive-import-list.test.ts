import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teamver/designApiBase")>();
  return {
    ...actual,
    resolveTeamverDriveBffBase: vi.fn(() => "/teamver-bff/drive"),
  };
});

import {
  browseTeamverDriveImportPage,
  filterTeamverDriveImportListRows,
  invalidateTeamverDriveImportCaches,
  listTeamverDriveImportRecent,
  listTeamverDriveImportScopes,
  resolveTeamverDriveImportListFolderId,
  searchTeamverDriveImportRows,
} from "../src/teamver/driveImportList";

describe("driveImportList recent/search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateTeamverDriveImportCaches();
  });

  it("normalizes recent assets from v2 home recent (personal only)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/api/v2/drive/home/recent");
      return Response.json({
        assets: [
          {
            asset_id: "AST-R1",
            name: "logo.png",
            kind: "image/png",
            size_bytes: 900,
          },
          {
            asset_id: "AST-R2",
            name: "team.png",
            kind: "image/png",
            shared_drive_id: "SD-1",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await listTeamverDriveImportRecent({ workspaceId: "ws-1", limit: 8 });
    expect(rows).toEqual([
      expect.objectContaining({
        kind: "asset",
        assetId: "AST-R1",
        name: "logo.png",
        mimeType: "image/png",
        sizeBytes: 900,
      }),
    ]);
  });

  it("merges v2 search and drive list search hits", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/v2/drive/home/search")) {
        return Response.json({
          query: "deck",
          hits: [{ hit_type: "asset", asset_id: "AST-S1", name: "deck.pptx", kind: "file" }],
        });
      }
      if (url.includes("/api/drive/list")) {
        return Response.json({
          data: [
            { asset_id: "AST-S1", name: "deck.pptx", type: "file" },
            { folder_id: "FLD-S1", name: "Decks" },
          ],
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await searchTeamverDriveImportRows({
      workspaceId: "ws-1",
      query: "deck",
      limit: 20,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({ kind: "asset", assetId: "AST-S1", name: "deck.pptx" }),
    );
    expect(rows[1]).toEqual(
      expect.objectContaining({ kind: "folder", folderId: "FLD-S1", name: "Decks" }),
    );
  });

  it("resolves scope root folder_id for personal browse at root", () => {
    expect(
      resolveTeamverDriveImportListFolderId(
        { mode: "personal", folderId: "ROOT-1", label: "내 드라이브" },
        null,
      ),
    ).toBe("ROOT-1");
    expect(
      resolveTeamverDriveImportListFolderId(
        { mode: "shared", sharedDriveId: "SD-1", folderId: "ROOT-SD", label: "팀" },
        null,
      ),
    ).toBe("ROOT-SD");
    expect(
      resolveTeamverDriveImportListFolderId(
        { mode: "personal", folderId: "ROOT-1", label: "내 드라이브" },
        "FLD-CHILD",
      ),
    ).toBe("FLD-CHILD");
  });

  it("filters ROOT and ALL_FILES shell rows like Main FE picker", () => {
    const rows = filterTeamverDriveImportListRows(
      [
        { kind: "folder", folderId: "ROOT-1", name: "내 드라이브", folderType: "ROOT" },
        { kind: "folder", folderId: "ALL-1", name: "전체 파일", folderType: "ALL_FILES" },
        { kind: "folder", folderId: "FLD-1", name: "Projects" },
        { kind: "asset", assetId: "AST-1", name: "a.png" },
      ],
      { rootFolderId: "ROOT-1", sharedDriveId: null, atScopeRoot: true },
    );
    expect(rows.map((row) => (row.kind === "folder" ? row.folderId : row.assetId))).toEqual([
      "FLD-1",
      "AST-1",
    ]);
  });

  it("loads scopes from list rootFolderId without N folder-tree calls", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/drive/folder?shallow_tree=true")) {
        return Response.json({ root_folder_id: "ROOT-P" });
      }
      if (url.endsWith("/api/v2/shared-drive")) {
        // Main list already exposes root_folder_id (camelized by drive client).
        return Response.json([
          { id: "SD-1", name: "개발팀", status: "active", rootFolderId: "ROOT-SD" },
          { id: "SD-2", name: "마케팅", status: "active", rootFolderId: "ROOT-MKT" },
        ]);
      }
      if (url.includes("/folder-tree")) {
        throw new Error(`folder-tree must not run on modal open when list has rootFolderId: ${url}`);
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const scopes = await listTeamverDriveImportScopes("ws-1");
    expect(scopes).toEqual([
      { mode: "personal", folderId: "ROOT-P", label: "내 드라이브" },
      { mode: "shared", sharedDriveId: "SD-1", folderId: "ROOT-SD", label: "개발팀" },
      { mode: "shared", sharedDriveId: "SD-2", folderId: "ROOT-MKT", label: "마케팅" },
    ]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/folder-tree"))).toBe(false);
  });

  it("falls back to folder-tree only when shared-drive list omits rootFolderId", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/drive/folder?shallow_tree=true")) {
        return Response.json({ root_folder_id: "ROOT-P" });
      }
      if (url.endsWith("/api/v2/shared-drive")) {
        return Response.json([{ id: "SD-1", name: "개발팀", status: "active" }]);
      }
      if (url.includes("/folder-tree")) {
        return Response.json({ root_folder_id: "ROOT-SD" });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const scopes = await listTeamverDriveImportScopes("ws-1");
    expect(scopes).toEqual([
      { mode: "personal", folderId: "ROOT-P", label: "내 드라이브" },
      { mode: "shared", sharedDriveId: "SD-1", folderId: "ROOT-SD", label: "개발팀" },
    ]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/folder-tree"))).toHaveLength(1);
  });

  it("browse uses resolved folder_id and cursor pagination", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("folder_id=ROOT-P");
      expect(url).toContain("limit=24");
      if (url.includes("before=cursor-2")) {
        return Response.json({
          data: [{ asset_id: "AST-2", name: "b.png", type: "image/png" }],
          meta: { has_more: false, next_cursor: null },
        });
      }
      return Response.json({
        data: [{ asset_id: "AST-1", name: "a.png", type: "image/png" }],
        meta: { has_more: true, next_cursor: "cursor-2" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const scope = { mode: "personal" as const, folderId: "ROOT-P", label: "내 드라이브" };
    const first = await browseTeamverDriveImportPage({
      workspaceId: "ws-1",
      scope,
      navFolderId: null,
    });
    expect(first.rows).toEqual([
      expect.objectContaining({ kind: "asset", assetId: "AST-1", name: "a.png" }),
    ]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe("cursor-2");

    const second = await browseTeamverDriveImportPage({
      workspaceId: "ws-1",
      scope,
      navFolderId: null,
      before: "cursor-2",
    });
    expect(second.rows).toEqual([
      expect.objectContaining({ kind: "asset", assetId: "AST-2", name: "b.png" }),
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teamver/designApiBase")>();
  return {
    ...actual,
    resolveTeamverMainApiBaseUrl: vi.fn(() => "https://stg-api.teamver.com"),
  };
});

import {
  listTeamverDriveImportRecent,
  searchTeamverDriveImportRows,
} from "../src/teamver/driveImportList";

describe("driveImportList recent/search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes recent assets from v2 home recent", async () => {
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
});

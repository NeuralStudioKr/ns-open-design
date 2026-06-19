import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  resolveTeamverMainApiBaseUrl: vi.fn(() => "https://stg-api.teamver.com"),
}));

import { fetchTeamverDriveImportThumbnails } from "../src/teamver/driveImportThumbnails";

describe("fetchTeamverDriveImportThumbnails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests presigned object URLs for image assets only", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.items).toEqual([
        { asset_id: "AST-IMG", shared_drive_id: null },
      ]);
      return Response.json({
        items: [
          {
            asset_id: "AST-IMG",
            object_url: "https://cdn.example/preview.png",
          },
          {
            asset_id: "AST-DOC",
            error: "not_image",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const urls = await fetchTeamverDriveImportThumbnails({
      workspaceId: "ws-1",
      items: [
        { assetId: "AST-IMG", name: "logo.png", mimeType: "image/png" },
        { assetId: "AST-DOC", name: "notes.txt", mimeType: "text/plain" },
      ],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(urls.get("AST-IMG")).toBe("https://cdn.example/preview.png");
    expect(urls.has("AST-DOC")).toBe(false);
  });

  it("returns empty map when batch request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );

    const urls = await fetchTeamverDriveImportThumbnails({
      workspaceId: "ws-1",
      items: [{ assetId: "AST-IMG", name: "logo.png" }],
    });

    expect(urls.size).toBe(0);
  });
});

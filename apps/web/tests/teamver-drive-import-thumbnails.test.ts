import { afterEach, describe, expect, it, vi } from "vitest";

const postTeamverDriveJson = vi.fn();

vi.mock("../src/teamver/driveApi", () => ({
  postTeamverDriveJson: (...args: unknown[]) => postTeamverDriveJson(...args),
}));

import { fetchTeamverDriveImportThumbnails } from "../src/teamver/driveImportThumbnails";

describe("fetchTeamverDriveImportThumbnails", () => {
  afterEach(() => {
    postTeamverDriveJson.mockReset();
  });

  it("requests presigned object URLs for image assets only", async () => {
    postTeamverDriveJson.mockResolvedValue({
      items: [
        {
          assetId: "AST-IMG",
          objectUrl: "https://cdn.example/preview.png",
        },
        {
          assetId: "AST-DOC",
          error: "not_image",
        },
      ],
    });

    const urls = await fetchTeamverDriveImportThumbnails({
      workspaceId: "ws-1",
      items: [
        { assetId: "AST-IMG", name: "logo.png", mimeType: "image/png" },
        { assetId: "AST-DOC", name: "notes.txt", mimeType: "text/plain" },
      ],
    });

    expect(postTeamverDriveJson).toHaveBeenCalledWith(
      "/api/v2/asset/object-url/batch",
      {
        items: [{ asset_id: "AST-IMG", shared_drive_id: null }],
      },
      "ws-1",
    );
    expect(urls.get("AST-IMG")).toBe("https://cdn.example/preview.png");
    expect(urls.has("AST-DOC")).toBe(false);
  });

  it("returns empty map when batch request fails", async () => {
    postTeamverDriveJson.mockRejectedValue(new Error("teamver_drive_fetch_failed:403"));

    const urls = await fetchTeamverDriveImportThumbnails({
      workspaceId: "ws-1",
      items: [{ assetId: "AST-IMG", name: "logo.png" }],
    });

    expect(urls.size).toBe(0);
  });
});

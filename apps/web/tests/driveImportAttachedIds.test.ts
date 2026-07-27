import { describe, expect, it } from "vitest";
import {
  teamverDriveAssetIdsFromChatAttachments,
  teamverDriveAssetIdsFromImportAssets,
} from "../src/teamver/driveImportAttachedIds";

describe("driveImportAttachedIds", () => {
  it("collects teamver-drive asset ids from chat attachments", () => {
    expect(
      teamverDriveAssetIdsFromChatAttachments([
        { path: "refs/drive/a.png", name: "a.png", kind: "image", source: { type: "teamver-drive", assetId: "AST-1" } },
        { path: "uploads/b.txt", name: "b.txt", kind: "file" },
        { path: "refs/drive/c.png", name: "c.png", kind: "image", source: { type: "teamver-drive", assetId: "AST-1" } },
      ]),
    ).toEqual(["AST-1"]);
  });

  it("collects asset ids from import asset picks", () => {
    expect(
      teamverDriveAssetIdsFromImportAssets([
        { assetId: "AST-A", filename: "a.pdf" },
        { assetId: "AST-B" },
      ]),
    ).toEqual(["AST-A", "AST-B"]);
  });
});

import { describe, expect, it } from "vitest";
import { driveImportedToChatAttachments } from "../src/teamver/importDriveAssets";

describe("driveImportedToChatAttachments", () => {
  it("maps imported assets to chat attachments with image kind", () => {
    const attachments = driveImportedToChatAttachments([
      {
        assetId: "AST-1",
        path: "refs/logo.png",
        name: "logo.png",
        sizeBytes: 1200,
        mimeType: "image/png",
      },
      {
        assetId: "AST-2",
        path: "refs/data.csv",
        name: "data.csv",
        sizeBytes: 88,
        mimeType: "text/csv",
      },
    ]);

    expect(attachments).toEqual([
      { path: "refs/logo.png", name: "logo.png", kind: "image", size: 1200 },
      { path: "refs/data.csv", name: "data.csv", kind: "file", size: 88 },
    ]);
  });
});

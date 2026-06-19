import { describe, expect, it } from "vitest";
import {
  driveImportAssetIconName,
  formatDriveFileSize,
  isDriveImageAsset,
} from "../src/teamver/driveFileVisual";

describe("driveFileVisual", () => {
  it("detects image assets by mime or extension", () => {
    expect(isDriveImageAsset("logo.png")).toBe(true);
    expect(isDriveImageAsset("deck.pptx", "image/png")).toBe(true);
    expect(isDriveImageAsset("data.csv")).toBe(false);
  });

  it("maps extensions to composer icon names", () => {
    expect(driveImportAssetIconName("logo.png")).toBe("image");
    expect(driveImportAssetIconName("deck.pptx")).toBe("present");
    expect(driveImportAssetIconName("sheet.csv")).toBe("file-code");
    expect(driveImportAssetIconName("notes.txt")).toBe("file");
  });

  it("formats file sizes for card subtitles", () => {
    expect(formatDriveFileSize(900)).toBe("900 B");
    expect(formatDriveFileSize(2048)).toBe("2.0 KB");
    expect(formatDriveFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatDriveFileSize(undefined)).toBeNull();
  });
});

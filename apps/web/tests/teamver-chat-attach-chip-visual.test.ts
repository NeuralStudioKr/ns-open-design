import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { driveImportAssetIconName } from "../src/teamver/driveFileVisual";

const webRoot = resolve(import.meta.dirname, "..");
const composer = readFileSync(resolve(webRoot, "src/components/ChatComposer.tsx"), "utf8");
const chatPane = readFileSync(resolve(webRoot, "src/components/ChatPane.tsx"), "utf8");
const chatCss = readFileSync(resolve(webRoot, "src/styles/chat.css"), "utf8");

describe("chat attach chip type icons + display names", () => {
  it("maps common non-image extensions to distinct icons", () => {
    expect(driveImportAssetIconName("brief.pdf")).toBe("file");
    expect(driveImportAssetIconName("pitch.pptx")).toBe("present");
    expect(driveImportAssetIconName("metrics.csv")).toBe("file-code");
    expect(driveImportAssetIconName("cover.png", "image/png")).toBe("image");
  });

  it("wires ChatComposer staged chips to type icons and display filenames", () => {
    expect(composer).toContain("driveImportAssetIconName");
    expect(composer).toContain("TeamverDriveDisplayFileName");
    expect(composer).toContain('data-testid="chat-staged-file-icon"');
    expect(composer).not.toMatch(
      /canPreview \?[\s\S]*?: \(\s*<>\s*<span className="staged-icon"[\s\S]*?<Icon name="file"/,
    );
  });

  it("wires ChatPane history attachments to type icons and display filenames", () => {
    expect(chatPane).toContain("driveImportAssetIconName");
    expect(chatPane).toContain("TeamverDriveDisplayFileName");
    expect(chatPane).toContain('data-testid="chat-history-attach-icon"');
  });

  it("keeps extension-visible truncation styles for staged names", () => {
    expect(chatCss).toContain(".staged-name.teamver-drive-display-filename");
    expect(chatCss).toContain(".teamver-drive-display-filename-ext");
  });
});

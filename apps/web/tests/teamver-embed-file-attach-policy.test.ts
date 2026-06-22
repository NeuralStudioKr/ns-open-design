import { describe, expect, it } from "vitest";
import {
  EMBED_SLIDE_ATTACH_MAX_BYTES,
  embedAttachBlockReason,
  isEmbedAllowedAttachFile,
  shouldApplyEmbedFileAttachPolicy,
} from "../src/teamver/branding/embedFileAttachPolicy";

describe("embedFileAttachPolicy", () => {
  it("applies only in slide-only MVP mode", () => {
    expect(shouldApplyEmbedFileAttachPolicy({ slideOnlyMvp: true })).toBe(true);
    expect(shouldApplyEmbedFileAttachPolicy({ slideOnlyMvp: false })).toBe(false);
  });

  it("allows slide-friendly extensions in embed mode", () => {
    expect(
      isEmbedAllowedAttachFile("logo.png", { slideOnlyMvp: true, mimeType: "image/png" }),
    ).toBe(true);
    expect(isEmbedAllowedAttachFile("deck.pptx", { slideOnlyMvp: true })).toBe(true);
    expect(isEmbedAllowedAttachFile("brief.docx", { slideOnlyMvp: true })).toBe(true);
    expect(isEmbedAllowedAttachFile("notes.md", { slideOnlyMvp: true })).toBe(true);
  });

  it("blocks video and executable extensions in embed mode", () => {
    expect(embedAttachBlockReason("clip.mp4", { slideOnlyMvp: true })).toContain("slide MVP");
    expect(embedAttachBlockReason("setup.exe", { slideOnlyMvp: true })).toContain("slide MVP");
    expect(embedAttachBlockReason("installer.pkg", { slideOnlyMvp: true })).toContain("slide MVP");
    expect(embedAttachBlockReason("virus.scr", { slideOnlyMvp: true })).toContain("slide MVP");
  });

  it("blocks oversize files in embed mode", () => {
    const reason = embedAttachBlockReason("big.pdf", {
      slideOnlyMvp: true,
      sizeBytes: EMBED_SLIDE_ATTACH_MAX_BYTES + 1,
    });
    expect(reason).toContain("50 MB");
  });

  it("does not block standalone OD uploads", () => {
    expect(embedAttachBlockReason("clip.mp4", { slideOnlyMvp: false })).toBeNull();
  });
});

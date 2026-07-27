import { describe, expect, it } from "vitest";
import { splitDriveDisplayFileName } from "../src/teamver/driveFileVisual";

describe("splitDriveDisplayFileName", () => {
  it("splits stem and extension for typical files", () => {
    expect(splitDriveDisplayFileName("quarterly-report-final-v3.pdf")).toEqual({
      full: "quarterly-report-final-v3.pdf",
      stem: "quarterly-report-final-v3",
      extension: ".pdf",
    });
  });

  it("keeps hidden dotfiles without a separate extension", () => {
    expect(splitDriveDisplayFileName(".gitignore")).toEqual({
      full: ".gitignore",
      stem: ".gitignore",
      extension: "",
    });
  });

  it("handles names ending with a dot", () => {
    expect(splitDriveDisplayFileName("weird.")).toEqual({
      full: "weird.",
      stem: "weird.",
      extension: "",
    });
  });

  it("supports multi-dot extensions", () => {
    expect(splitDriveDisplayFileName("archive.tar.gz")).toEqual({
      full: "archive.tar.gz",
      stem: "archive.tar",
      extension: ".gz",
    });
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  canOfferAlternateDrivePublishFormat,
  clearPdfExportBlocked,
  isPdfExportBlocked,
  markPdfExportBlocked,
} from "../src/teamver/drivePublishFormatHealth";

describe("drivePublishFormatHealth", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("blocks and clears PDF export per project in session storage", () => {
    expect(isPdfExportBlocked("proj-1")).toBe(false);
    markPdfExportBlocked("proj-1");
    expect(isPdfExportBlocked("proj-1")).toBe(true);
    clearPdfExportBlocked("proj-1");
    expect(isPdfExportBlocked("proj-1")).toBe(false);
  });

  it("hides alternate PDF follow-up when PDF export is blocked", () => {
    markPdfExportBlocked("proj-1");
    expect(canOfferAlternateDrivePublishFormat("pdf", "proj-1")).toBe(false);
    expect(canOfferAlternateDrivePublishFormat("html", "proj-1")).toBe(true);
  });
});

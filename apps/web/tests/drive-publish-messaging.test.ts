// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  drivePublishMessaging,
  formatHintForSelection,
  publishLabelForFormat,
} from "../src/teamver/drivePublishMessaging";
import {
  readLastPublishFormat,
  resolveInitialPublishFormat,
  writeLastPublishFormat,
} from "../src/teamver/drivePublishLastFormat";

describe("drivePublishMessaging", () => {
  it("frames slide Drive publish as user-selectable PDF or HTML", () => {
    const copy = drivePublishMessaging();
    expect(copy.menuTitlePdf).toContain("PDF");
    expect(copy.menuTitleHtml).toContain("HTML");
    expect(copy.modalSubtitle).toContain("형식");
  });

  it("uses phase-aware publish labels", () => {
    expect(publishLabelForFormat("pdf", false, "generating")).toContain("PDF 생성");
    expect(publishLabelForFormat("pdf", false, "uploading")).toContain("업로드");
    expect(publishLabelForFormat("html", false, "idle")).toContain("HTML");
  });

  it("describes each format with a hint", () => {
    expect(formatHintForSelection("pdf")).toContain("공유");
    expect(formatHintForSelection("html")).toContain("AI");
  });
});

describe("drivePublishLastFormat", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists the last selected format per workspace and project", () => {
    writeLastPublishFormat("ws-1", "proj-1", "html");
    expect(readLastPublishFormat("ws-1", "proj-1")).toBe("html");
    expect(resolveInitialPublishFormat("ws-1", "proj-1", null, false)).toBe("html");
    expect(resolveInitialPublishFormat("ws-1", "proj-1", "pdf", false)).toBe("pdf");
    expect(resolveInitialPublishFormat("ws-1", "proj-1", "pdf", true)).toBe("html");
  });
});

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
    expect(copy.modalSubtitle).toContain("저장 위치");
  });

  it("uses phase-aware publish labels", () => {
    expect(publishLabelForFormat("pdf", false, "generating")).toContain("PDF 생성");
    expect(publishLabelForFormat("pdf", false, "uploading")).toContain("업로드");
    expect(publishLabelForFormat("html", false, "idle")).toContain("HTML");
  });

  it("describes each format with plain-language example and benefit", () => {
    const pdf = formatHintForSelection("pdf");
    expect(pdf).toContain("예:");
    expect(pdf).toContain("바로 열 수");
    expect(pdf).toContain("페이지 한 장");
    expect(pdf).not.toMatch(/설치|동료|됩니다/);

    const html = formatHintForSelection("html");
    expect(html).toContain("예:");
    expect(html).toContain("AI");
    expect(html).toContain("넘기며");
    expect(html).toContain("알려 주고");
    expect(html).toContain("이야기할 수");
    expect(html).not.toMatch(/덱|맥락|원본|브라우저|발표|지금 화면|이어서|좋습니다/);
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

import { describe, expect, it } from "vitest";

import { TEAMVER_OPEN_SOURCE_NOTICES } from "../../src/teamver/branding/openSourceNotices";

describe("TEAMVER_OPEN_SOURCE_NOTICES", () => {
  it("includes Open Design Apache attribution first", () => {
    const openDesign = TEAMVER_OPEN_SOURCE_NOTICES[0];
    expect(openDesign?.id).toBe("open-design");
    expect(openDesign?.license).toBe("Apache License 2.0");
    expect(openDesign?.licenseUrl).toBe("https://www.apache.org/licenses/LICENSE-2.0");
    expect(openDesign?.sourceUrl).toContain("nexu-io/open-design");
  });

  it("includes bundled MIT template notices", () => {
    const ids = TEAMVER_OPEN_SOURCE_NOTICES.map((notice) => notice.id);
    expect(ids).toContain("guizang-ppt");
    expect(ids).toContain("html-ppt");
    expect(
      TEAMVER_OPEN_SOURCE_NOTICES.filter((notice) => notice.license === "MIT License"),
    ).toHaveLength(2);
  });

  it("requires license URL on every notice", () => {
    for (const notice of TEAMVER_OPEN_SOURCE_NOTICES) {
      expect(notice.licenseUrl.startsWith("https://")).toBe(true);
      expect(notice.copyright.trim().length).toBeGreaterThan(0);
    }
  });
});

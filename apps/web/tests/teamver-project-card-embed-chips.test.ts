import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("embed project card meta chips", () => {
  it("keeps publish chip and card-click preview deep-link without a separate preview-open chip", () => {
    const recentProjects = readSource("src/components/RecentProjectsStrip.tsx");
    const designsTab = readSource("src/components/DesignsTab.tsx");

    for (const source of [recentProjects, designsTab]) {
      expect(source).not.toContain("TeamverProjectPreviewChip");
      expect(source).not.toContain("teamver-preview-chip");
      expect(source).toContain("TeamverLatestPublishChip");
      expect(source).toContain("projectOpenOptionsFromPreviewCover");
    }
  });
});

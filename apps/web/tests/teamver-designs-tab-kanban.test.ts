import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("DesignsTab view modes", () => {
  it("does not expose status-column (kanban) view — grid only", () => {
    const designsTab = readSource("src/components/DesignsTab.tsx");

    expect(designsTab).not.toContain("designs-view-kanban");
    expect(designsTab).not.toContain('setView("kanban")');
    expect(designsTab).not.toContain("design-kanban-board");
    expect(designsTab).not.toContain("design-kanban-card-thumb");
    expect(designsTab).toContain('className="design-grid"');
    expect(designsTab).toContain("TeamverLatestPublishChip");
    expect(designsTab).not.toContain("TeamverProjectPreviewChip");
  });

  it("lazy cover loader allows bounded /files fallback for visible cards", () => {
    const lazyCover = readSource("src/teamver/useLazyProjectCover.ts");
    expect(lazyCover).toContain("allowFilesFallback = true");
    expect(lazyCover).toContain("resolveProjectCoverFile(current, { allowFilesFallback })");
    expect(lazyCover).toContain("subscribeProjectCoverClear");
  });

  it("drops coverOverrides when project cover cache is cleared", () => {
    const designsTab = readSource("src/components/DesignsTab.tsx");
    expect(designsTab).toContain("subscribeProjectCoverClear");
    expect(designsTab).toContain("delete next[clearedId]");
  });
});

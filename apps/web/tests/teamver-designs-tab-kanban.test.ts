import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("DesignsTab kanban lazy cover thumb", () => {
  it("wires DesignsTabProjectThumb into kanban cards with defer-until-visible cover loader", () => {
    const designsTab = readSource("src/components/DesignsTab.tsx");
    const drawerCss = readSource("src/styles/workspace/drawer.css");

    expect(designsTab).toContain("design-kanban-card-thumb");
    expect(designsTab).toContain("design-kanban-card-embed-chips");
    expect(designsTab).toContain("TeamverLatestPublishChip");
    expect(designsTab).not.toContain("TeamverProjectPreviewChip");
    expect(drawerCss).toContain(".design-kanban-card-thumb");
    expect(drawerCss).toContain(".design-card-embed-chips");
    expect(drawerCss).toContain(".design-kanban-card-embed-chips");
  });

  it("lazy cover loader allows bounded /files fallback for visible cards", () => {
    const lazyCover = readSource("src/teamver/useLazyProjectCover.ts");
    expect(lazyCover).toContain("allowFilesFallbackOption ?? true");
    expect(lazyCover).toContain("resolveProjectCoverFile(project, { allowFilesFallback })");
  });
});

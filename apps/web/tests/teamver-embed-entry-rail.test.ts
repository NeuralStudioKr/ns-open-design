import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("Teamver embed entry nav rail", () => {
  it("docks the rail and hides collapse/toggle controls in embed", () => {
    const entryShell = readSource("src/components/EntryShell.tsx");
    const entryNavRail = readSource("src/components/EntryNavRail.tsx");
    const teamverCss = readSource("src/styles/teamver.css");
    const drawerCss = readSource("src/styles/workspace/drawer.css");

    expect(entryShell).toContain("entry-shell--teamver-embed");
    expect(entryShell).toContain("const effectiveRailOpen = teamverEmbed || railOpen");
    expect(entryShell).toContain("open={effectiveRailOpen}");
    expect(entryShell).toContain("{!teamverEmbed ? (");
    expect(entryShell).toContain('data-testid="entry-rail-toggle"');

    expect(entryNavRail).toContain("{!teamverEmbed ? (");
    expect(entryNavRail).toContain('data-testid="entry-nav-collapse"');

    expect(teamverCss).toContain(".entry-shell--teamver-embed.entry-shell--no-header .entry");
    expect(teamverCss).toContain(".entry-shell--teamver-embed .entry-rail-toggle");

    expect(drawerCss).not.toContain("grid-template-columns: 56px 1fr !important");
    expect(drawerCss).toContain(".entry-shell--no-header .entry:not(.entry--rail-open)");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("FileWorkspace preview bootstrap", () => {
  it("hydrates pending preview tabs from the last known html artifact", () => {
    const source = readSource("src/components/FileWorkspace.tsx");
    expect(source).toContain("stalePreviewBootstrapFile");
    expect(source).toContain("selectAutoOpenProducedHtml(visibleFiles)");
    expect(source).toContain("resolvedPreviewFile");
    expect(source).toMatch(/resolvedPreviewFile \? \([\s\S]*<FileViewer/);
  });

  it("bounds infinite pending-tab loading while streaming stays true", () => {
    const source = readSource("src/components/FileWorkspace.tsx");
    expect(source).toContain("streamingPreviewGraceElapsed");
    expect(source).toContain("setTimeout(() => setStreamingPreviewGraceElapsed(true), 12_000)");
    expect(source).toContain(
      "Always re-arm on tab/stream change so a previous ghost's elapsed grace",
    );
    expect(source).toContain("cannot immediately settle the next pending tab");
    // Pending tab shows loading only — ghost resolve retargets/closes; do not
    // flash previewUnavailable while the file list is still catching up.
    expect(source).toMatch(/pendingPreviewTab \? \([\s\S]*fileViewer\.loading/);
    expect(source).not.toMatch(
      /pendingPreviewTab \? \([\s\S]*fileViewer\.previewUnavailable/,
    );
  });

  it("keeps liveHtml after streaming ends until artifact html is cleared", () => {
    const source = readSource("src/components/FileWorkspace.tsx");
    expect(source).toContain("liveHtml={artifactHtml?.trim() ? artifactHtml : undefined}");
    expect(source).not.toContain("liveHtml={streaming && artifactHtml ? artifactHtml : undefined}");
  });
});

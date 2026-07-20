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
      "(streaming && !streamingPreviewGraceElapsed) || previewTabPending",
    );
  });
});

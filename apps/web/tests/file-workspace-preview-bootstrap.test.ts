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
    expect(source).toContain("selectAutoOpenProducedHtml(visibleFiles, { projectFiles: visibleFiles })");
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
    expect(source).toContain("visibleFilesSignature");
    expect(source).toContain("pendingTabDiskHtml");
    expect(source).toContain("repairArtifactDocumentHeadIfNeeded(text)");
    expect(source).toContain("rememberStablePreviewSource(projectId, activeTab, repaired)");
    expect(source).toContain("reason: 'disk-bootstrap'");
    expect(source).toMatch(/visibleFilesSignature,\s*\n\s*\]\);/);
    // Pending tab shows loading only — ghost resolve retargets/closes; do not
    // flash previewUnavailable while the file list is still catching up.
    expect(source).toMatch(/pendingPreviewTab \? \([\s\S]*fileViewer\.loading/);
    expect(source).not.toMatch(
      /pendingPreviewTab \? \([\s\S]*fileViewer\.previewUnavailable/,
    );
    // Hold→paint remounts via prefix in the iframe key (same as FileViewer).
    expect(source).toContain(
      "key={`${memoryOnlyPreview.fileName ?? 'memory-preview'}:${memoryOnlyPreviewMountKey}`}",
    );
    expect(source).not.toMatch(
      /key=\{`\$\{memoryOnlyPreview\.fileName[^`]*memoryPreviewPrefix/,
    );
  });

  it("keeps liveHtml after streaming ends until artifact html is cleared", () => {
    const source = readSource("src/components/FileWorkspace.tsx");
    expect(source).toContain("liveHtml={artifactHtml?.trim() ? artifactHtml : undefined}");
    expect(source).toContain("userBrief={previewUserBrief}");
    expect(source).toContain("lastVisibleUserBrief(messages)");
    expect(source).not.toContain("liveHtml={streaming && artifactHtml ? artifactHtml : undefined}");
  });

  it("heals attachment image srcs and injects base href for memory-only preview", () => {
    const source = readSource("src/components/FileWorkspace.tsx");
    expect(source).toContain("prepareMemoryOnlySlidePreviewSrcDoc");
    expect(source).toContain("userBrief: previewUserBrief");
    expect(source).toContain("previewHealAttachmentPaths");
    expect(source).toContain("memoryOnlyPreviewSrcDoc");
    expect(source).not.toMatch(
      /viewer-memory-preview__frame[\s\S]*srcDoc=\{memoryOnlyPreview\.html\}/,
    );
    // Teamver: never settle/paint memory-only without a scoped preview prefix.
    expect(source).toContain("!memoryPreviewPrefixSettled || !memoryPreviewPrefix");
    expect(source).toContain("retryDelaysMs");
  });

  it("heals Write-tool short-circuit disk HTML before open", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("healDiskHtmlAttachmentImageSrcs");
    expect(source).toContain("Write-tool short-circuit skips persistArtifact");
  });
});

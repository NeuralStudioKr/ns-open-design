import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("FileViewer streaming slide preview", () => {
  it("gates live iframe updates on repaired html stability during streaming", () => {
    const source = readSource("src/components/FileViewer.tsx");

    expect(source).toContain("repairArtifactDocumentHead(candidate)");
    expect(source).toContain("isArtifactHtmlStableForPreview(repaired)");
    expect(source).toContain("repairArtifactDocumentHead(liveHtml)");
    expect(source).toContain("scheduleDeckPreviewFitNudges");
    expect(source).toContain("scheduleDeckPreviewFitNudges(frame, overlayPreviewScale)");
    expect(source).toContain("scheduleDeckPreviewFitNudges(iframeRef.current, overlayPreviewScale)");
    expect(source).toContain("artifact-preview-streaming-veil");
    expect(source).toContain("artifact-preview-streaming-veil__card");
    expect(source).toContain('name="spinner"');
    expect(source).toContain("artifact-preview-streaming-veil__backdrop");
    expect(source).toContain("data-testid=\"artifact-preview-streaming-veil\"");
    expect(source).toContain("is-streaming-unstable");
    expect(source).toContain("fileViewer.updatingPreview");
    expect(source).toContain("&& source != null");
  });

  it("keeps last stable preview during disk refresh instead of blanking source", () => {
    const source = readSource("src/components/FileViewer.tsx");
    const start = source.indexOf("const fileChanged = sourceFileKeyRef.current !== sourceFileKey");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 420);
    expect(block).toContain("lastStablePreviewSourceRef.current");
    expect(block).not.toMatch(/setSource\(null\)[\s\S]*setSource\(null\)/);
  });

  it("clears stable snapshot when preview artifact identity changes", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("lastStablePreviewIdentityRef");
    expect(source).toMatch(
      /artifactIdentity[\s\S]*lastStablePreviewIdentityRef\.current !== artifactIdentity[\s\S]*lastStablePreviewSourceRef\.current = null/,
    );
  });
});

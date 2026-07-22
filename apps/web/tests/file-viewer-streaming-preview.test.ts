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
    expect(source).toContain("showStreamingEmptyVeil");
    expect(source).toContain("showStreamingPreviewVeil");
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

  it("splits liveHtml apply from disk fetch so token churn cannot cancel debounce", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("liveHtmlPaintsPreview");
    expect(source).toContain("hasLiveHtml");
    expect(source).toContain("acceptPreviewHtmlCandidate");
    expect(source).toContain("HTML_PREVIEW_DISK_FETCH_DEBOUNCE_MS");
    expect(source).toContain("HTML_PREVIEW_SOURCE_WALL_MS");
    expect(source).toContain(
      "Unstable live stream with no prior stable frame: fall through to disk",
    );
    expect(source).toContain("previewSourceFetchGenerationRef");
    expect(source).toContain("Debounce refresh-key churn so soft-sticky auth recovery");
    // Disk effect must not list liveHtml itself — only paint gate + streaming.
    expect(source).toMatch(
      /hasLiveHtml,\s*\n\s*liveHtmlPaintsPreview,\s*\n\s*streaming,\s*\n\s*projectId,/,
    );
    expect(source).toMatch(/setTimeout\(runFetch, HTML_PREVIEW_DISK_FETCH_DEBOUNCE_MS\)/);
  });

  it("keeps streaming veil over unavailable while live HTML is incomplete", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain(
      "Do not gate on !sourceLoadFailed — mid-stream incomplete disk used to flip",
    );
    expect(source).toContain("Do NOT flip unavailable here");
    expect(source).toContain("if (streaming) setSourceLoadFailed(false)");
    expect(source).not.toContain(
      "Incomplete disk HTML with no stable frame — surface unavailable",
    );
    // Post-stream incomplete must not immediately setSourceLoadFailed(true).
    expect(source).not.toMatch(
      /acceptPreviewHtmlCandidate\(text, lastStablePreviewSourceRef\)[\s\S]{0,280}setSourceLoadFailed\(true\)/,
    );
  });

  it("soft-retries incomplete disk after stream and re-arms wall", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("armPreviewSourceWall");
    expect(source).toContain(
      "Incomplete/leaky disk with no stable frame. Soft-retry once after",
    );
    expect(source).toContain(
      "if (streaming && hasLiveHtml && liveHtmlPaintsPreview) return",
    );
    expect(source).toContain("Clear sticky unavailable for this attempt");
  });

  it("soft-retries transient null disk fetches without flipping unavailable", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("Auth blip / soft-sticky / unlink race: one soft retry");
    expect(source).toContain("softRetryTimer");
    expect(source).toContain("abort.signal.aborted");
  });

  it("gates empty unavailable on sourceLoadFailed only (not dead prefix check)", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("useUrlLoadPreview");
    const marker = "data-testid=\"artifact-preview-streaming-veil\"";
    const start = source.indexOf(marker);
    expect(start).toBeGreaterThan(0);
    const emptyBranch = source.slice(start, start + 900);
    expect(emptyBranch).toContain("sourceLoadFailed");
    expect(emptyBranch).toContain("fileViewer.previewUnavailable");
    expect(emptyBranch).not.toContain("embedPreviewPrefix == null");
  });

  it("keeps disk debounce at or under ProjectView file-changed coalesce maxWait", () => {
    const viewer = readSource("src/components/FileViewer.tsx");
    const projectView = readSource("src/components/ProjectView.tsx");
    const debounceMatch = viewer.match(
      /const HTML_PREVIEW_DISK_FETCH_DEBOUNCE_MS = (\d+)/,
    );
    const maxWaitMatch = projectView.match(/maxWait:\s*(\d+)/);
    expect(debounceMatch?.[1]).toBeTruthy();
    expect(maxWaitMatch?.[1]).toBeTruthy();
    expect(Number(debounceMatch![1])).toBeLessThanOrEqual(Number(maxWaitMatch![1]));
  });

  it("uses a narrow preview streaming signal instead of broad action-disabled state", () => {
    const workspace = readSource("src/components/FileWorkspace.tsx");
    const projectView = readSource("src/components/ProjectView.tsx");

    expect(workspace).toContain("previewStreaming?: boolean");
    expect(workspace).toContain("streaming={previewStreaming ?? streaming}");
    expect(projectView).toContain("streaming={currentConversationActionDisabled}");
    expect(projectView).toContain(
      "previewStreaming={currentConversationStreaming || currentConversationAwaitingActiveRunAttach}",
    );
  });

  it("arms disk wall once per artifact identity (not on refresh churn)", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("previewSourceWallIdentityRef");
    expect(source).toContain("previewSourceWallTimerRef");
    expect(source).toContain(
      "Intentionally leave previewSourceWallTimerRef armed across refresh churn",
    );
    expect(source).toContain(
      "acceptPreviewHtmlCandidate(text, lastStablePreviewSourceRef)",
    );
    expect(source).not.toContain("structurallyComplete");
    expect(source).toContain("previewSourceWallIdentityRef.current = null");
    expect(source).toMatch(
      /lastStablePreviewIdentityRef\.current !== artifactIdentity[\s\S]*setSource\(null\)[\s\S]*setLiveHtmlPaintsPreview\(false\)/,
    );
  });
});

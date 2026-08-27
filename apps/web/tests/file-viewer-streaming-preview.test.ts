import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("FileViewer streaming slide preview", () => {
  it('keeps deck fit scale at 1 for compact and framework decks so host zoom does not reflow', () => {
    const source = readSource('src/components/FileViewer.tsx');
    expect(source).toContain('const needsDeckHostViewportFit = compactApiStackedDeck || frameworkDeckPreview');
    expect(source).toContain('deckHostViewportFitActive');
    expect(source).toContain('needsDeckHostViewportFitStickyRef');
    expect(source).toMatch(
      /const deckPreviewFitScale = deckHostViewportFitActive \? 1 : overlayPreviewScale/,
    );
    expect(source).toMatch(
      /const deckPreviewFitOptions = useMemo\(\s*\(\) => \(deckHostViewportFitActive[\s\S]*FIXED_STAGE_DECK_FIT_OPTIONS/,
    );
    expect(source).toContain('onAfterNudge');
    expect(source).toContain('tipRemasureOnDeckNudgeRef');
  });

  it('does not remount or clear last-stable on filesRefreshKey churn', () => {
    const source = readSource('src/components/FileViewer.tsx');
    const start = source.indexOf('Agent / manual writes bump `filesRefreshKey`');
    expect(start).toBeGreaterThan(0);
    const effectEnd = source.indexOf('}, [filesRefreshKey, projectId, file.name]);', start);
    expect(effectEnd).toBeGreaterThan(start);
    const block = source.slice(start, effectEnd);
    expect(block).toContain('invalidateCachedPreviewSource');
    expect(block).toContain('setReloadKey');
    expect(block).not.toContain('lastStablePreviewSourceRef.current = null');
    // Immediate remount on every filesRefresh is forbidden; reloadKey refetch only.
    expect(block).not.toMatch(/setSrcDocTransportResetKey\(\(key\) => key \+ 1\)/);
    expect(block).toContain('do NOT clear last-stable');
  });

  it('holds srcDoc until preview prefix settles (no early no-base paint)', () => {
    const source = readSource('src/components/FileViewer.tsx');
    // Never settle=true with a null prefix (that left a permanent blank canvas).
    // Soft background remint recovers late auth/warm seeds without toolbar refresh.
    expect(source).toContain('scheduleBackgroundRemint');
    expect(source).toContain('Stay unsettled — never paint without a scoped base');
    expect(source).not.toContain('Allow first paint without base; a later successful retry remounts');
    expect(source).toContain('Do NOT fail-open after');
    expect(source).not.toMatch(
      /setTimeout\(\(\) => \{\s*if \(!cancelled\) setEmbedPreviewPrefixSettled\(true\);\s*\}, 10_000\)/,
    );
  });

  it('remounts srcDoc on hold→paint via mount key (never in-place empty→HTML)', () => {
    const source = readSource('src/components/FileViewer.tsx');
    expect(source).toContain('resolveSrcDocPreviewMountKey');
    expect(source).toContain('srcDocPreviewMountKey');
    expect(source).toContain('key={srcDocPreviewMountKey}');
    expect(source).toContain('hold→paint is a fresh iframe');
    expect(source).toContain('Explicit refresh must remint Teamver preview scope');
    expect(source).toMatch(
      /function reloadHtmlPreview\(\) \{[\s\S]{0,500}?invalidateTeamverProjectPreviewPrefix\(projectId\)/,
    );
    expect(source).toMatch(
      /function reloadHtmlPreview\(\) \{[\s\S]{0,500}?setEmbedAuthRecoveryNonce/,
    );
  });

  it('keeps a host ResizeObserver fit recovery loop for intermittent letterbox', () => {
    const source = readSource('src/components/FileViewer.tsx');
    expect(source).toContain('Persistent host→iframe fit recovery');
    expect(source).toContain("data?.type !== 'od:stacked-deck-ready'");
    expect(source).toContain('nudgeDeckPreviewFit');
    expect(source).toContain('Intentionally omit `srcDoc`');
  });

  it('remounts srcDoc when non-streaming deck HTML is replaced', () => {
    const source = readSource('src/components/FileViewer.tsx');
    expect(source).toContain('lastDeckPreviewSourceRef');
    expect(source).toContain('once per non-streaming content change on the srcDoc transport');
    expect(source).toContain('wasStreamingDeckPreviewRef');
    expect(source).toContain('leftStreaming');
  });

  it('re-nudges deck fit when the page becomes visible again', () => {
    const source = readSource('src/components/FileViewer.tsx');
    expect(source).toContain("document.addEventListener('visibilitychange', recover)");
    expect(source).toContain("window.addEventListener('pageshow', recover)");
  });

  it('arms follow-up untilSized after every host-viewport request', () => {
    const source = readSource('src/components/FileViewer.tsx');
    expect(source).toContain('Always arm a short follow-up window');
    expect(source).toMatch(
      /postDeckHostViewportToIframe\(target, deckPreviewFitScale, deckPreviewFitOptions\);\s*cancelZeroSizeRetry/,
    );
  });

  it('seeds embed preview prefix from cache so image→deck tab remounts do not hold empty srcDoc', () => {
    const source = readSource('src/components/FileViewer.tsx');
    expect(source).toContain('peekTeamverProjectPreviewPrefix');
    expect(source).toContain('Seed settled=true when a cached prefix already exists');
    expect(source).toContain('Cached peek lets image→deck tab switches paint immediately');
  });

  it('keys HtmlViewer by project+file so tab switches remount cleanly', () => {
    const source = readSource('src/components/FileViewer.tsx');
    expect(source).toMatch(/<HtmlViewer\s+key=\{`\$\{projectId\}\\0\$\{file\.name\}`\}/);
  });

  it("passes the user brief into deck srcdoc so leftover catalog examples can be scrubbed", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("userBrief?: string | null");
    expect(source).toMatch(/buildSrcdoc\(previewSource, \{[\s\S]*?userBrief,/);
    expect(source).toMatch(/buildSrcdoc\(previewSource, \{[\s\S]*?scrubLeftoverCatalog: true/);
    expect(source).toMatch(/buildSrcdoc\(html, \{[\s\S]*?userBrief,/);
    expect(source).toMatch(/buildSrcdoc\(html, \{[\s\S]*?scrubLeftoverCatalog: true/);
  });

  it("gates live iframe updates on repaired html stability during streaming", () => {
    const source = readSource("src/components/FileViewer.tsx");

    expect(source).toContain("repairArtifactDocumentHeadIfNeeded(candidate)");
    expect(source).toContain("isArtifactHtmlStableForPreview(repaired)");
    expect(source).toContain("repairArtifactDocumentHeadIfNeeded(liveHtml)");
    expect(source).toContain("scheduleDeckPreviewFitNudges");
    expect(source).toContain("if (needsDeckHostViewportFit) {");
    expect(source).toContain("schedulePostDeckHostViewportUntilSized(");
    expect(source).toContain("artifact-preview-streaming-veil");
    expect(source).toContain("artifact-preview-streaming-veil__card");
    expect(source).toContain('name="spinner"');
    expect(source).toContain("artifact-preview-streaming-veil__backdrop");
    expect(source).toContain("data-testid=\"artifact-preview-streaming-veil\"");
    expect(source).toContain("is-streaming-unstable");
    expect(source).toContain("fileViewer.updatingPreview");
    expect(source).toContain("showStreamingEmptyVeil");
    expect(source).toContain("showStreamingPreviewVeil");
    expect(source).toContain("showStreamingAwaitingLiveHtml");
  });

  it("keeps last stable preview during disk refresh instead of blanking source", () => {
    const source = readSource("src/components/FileViewer.tsx");
    const start = source.indexOf("const fileChanged = sourceFileKeyRef.current !== sourceFileKey");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 420);
    expect(block).toContain("lastStablePreviewSourceRef.current");
    expect(block).not.toMatch(/setSource\(null\)[\s\S]*setSource\(null\)/);
  });

  it("reseeds stable snapshot from preview cache when artifact identity changes", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("lastStablePreviewIdentityRef");
    expect(source).toContain("readCachedPreviewSource");
    // Identity change must not keep the previous file's last-stable bytes;
    // seed from the module cache for the new identity (or null).
    expect(source).toMatch(
      /lastStablePreviewIdentityRef\.current !== artifactIdentity[\s\S]*lastStablePreviewSourceRef\.current = cachedPreview/,
    );
  });

  it("splits liveHtml apply from disk fetch so token churn cannot cancel debounce", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("liveHtmlPaintsPreview");
    expect(source).toContain("hasLiveHtml");
    expect(source).toContain("acceptPreviewHtmlCandidate");
    expect(source).toContain("healOfficialMagazineLayoutDensity");
    expect(source).toContain("hoistDeckHostStylesToHead");
    expect(source).toContain("HTML_PREVIEW_DISK_FETCH_DEBOUNCE_MS");
    expect(source).toContain("HTML_PREVIEW_SOURCE_WALL_MS");
    expect(source).toContain(
      "Unstable live stream with no prior stable frame: fall through to disk",
    );
    expect(source).toContain("previewSourceFetchGenerationRef");
    expect(source).toContain("Debounce refresh-key churn so soft-sticky auth recovery");
    // Disk effect must not list liveHtml / liveHtmlPaintsPreview — paint gate via ref.
    expect(source).toMatch(
      /hasLiveHtml,\s*\n\s*streaming,\s*\n\s*projectId,/,
    );
    expect(source).toContain("liveHtmlPaintsPreviewRef.current");
    expect(source).not.toMatch(
      /hasLiveHtml,\s*\n\s*liveHtmlPaintsPreview,\s*\n\s*streaming,/,
    );
    expect(source).toMatch(
      /setTimeout\(\s*runFetch,\s*coldFirstPaint \? 0 : HTML_PREVIEW_DISK_FETCH_DEBOUNCE_MS,?\s*\)/,
    );
  });

  it("refuses to pin slide-less repaired shells as last-stable preview", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("hasSalvageableDeckSlideContent");
    expect(source).toContain("sourceHasDeckSlideMarkup");
    expect(source).toContain("htmlHasDeckSlideHost");
    expect(source).toContain(
      "Never pin that as last-stable when the candidate itself",
    );
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
      "Incomplete/leaky disk with no stable frame. Retry briefly after",
    );
    expect(source).toContain("scheduleSoftRetry");
    expect(source).toContain(
      "if (streaming && hasLiveHtml && liveHtmlPaintsPreviewRef.current) return",
    );
    expect(source).toContain("Clear sticky unavailable for this attempt");
  });

  it("soft-retries transient null disk fetches without flipping unavailable", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("Auth blip / S3-read lag / unlink+add race");
    expect(source).toContain("HTML_PREVIEW_SOURCE_FIRST_RETRY_MS");
    expect(source).toContain("HTML_PREVIEW_SOURCE_RETRY_MAX_MS");
    expect(source).toContain("HTML_PREVIEW_SOURCE_MAX_SOFT_RETRIES");
    expect(source).toContain("previewSourceRetryUntilRef");
    expect(source).toContain("softRetryTimer");
    expect(source).toContain("softRetryCount");
    expect(source).toContain("abort.signal.aborted");
    expect(source).toContain("liveHtmlPaintsPreviewRef");
    expect(source).toContain(
      "re-entry often sets streaming while disk/auth is still catching up",
    );
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
    expect(workspace).toContain("streaming={previewStreaming ?? false}");
    expect(projectView).toContain("streaming={currentConversationActionDisabled}");
    expect(projectView).toContain("previewStreaming={previewPanelStreaming}");
    expect(projectView).toContain(
      "currentConversationStreaming || currentConversationAwaitingActiveRunAttach",
    );
    expect(projectView).toContain("shouldCatchUpReattachTextFromSeed");
    expect(projectView).toContain("reattachReplayRemainderAfterSeed");
    expect(projectView).toContain("resolvePrimaryDeckFile");
    expect(workspace).toContain("reason: 'streaming'");
    expect(workspace).toContain("artifact-preview-streaming-veil");
  });

  it("preserves the active deck slide index when saving panel comments", () => {
    const source = readSource("src/components/FileViewer.tsx");
    const start = source.indexOf("async function savePanelComment");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 900);

    expect(block).toContain("withDeckSlideIndex(targetFromSnapshot(activeCommentTarget))");
  });

  it("arms disk wall once per artifact identity (not on refresh churn)", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("previewSourceWallIdentityRef");
    expect(source).toContain("previewSourceWallTimerRef");
    expect(source).toContain("liveHtmlPaintsPreviewRef");
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

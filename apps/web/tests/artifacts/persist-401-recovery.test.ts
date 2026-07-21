import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the demo-critical recovery path where a run's HTML artifact
 * completes streaming but the daemon session has silently expired mid-run,
 * so writeProjectTextFileDetailed returns 401. Without these behaviors the
 * user sees "완료됨 · N 출력" with an empty preview panel (the exact demo
 * failure that motivated §pendingWriteRecovery + memory-only preview).
 *
 * All assertions are source-code shape checks so they can run without
 * mounting ProjectView; the actual runtime is exercised by unit tests
 * against pendingWriteRecovery and by the wider integration suite.
 */

const webRoot = resolve(import.meta.dirname, "..", "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("ProjectView persist-401 recovery", () => {
  const source = readSource("src/components/ProjectView.tsx");

  it("stashes the failed write payload when writeProjectTextFileDetailed returns 401", () => {
    // The stash must live inside the persistArtifact 401 branch so it only
    // fires on auth failure — non-auth errors (permission / validation)
    // must not queue silent retries that would spam the daemon later.
    expect(source).toContain("if (result.status === 401)");
    expect(source).toMatch(
      /if \(result\.status === 401\)[\s\S]{0,1500}stashPendingArtifactWrite\(\{/,
    );
    // The payload must be a faithful snapshot of the exact write we tried
    // (projectId + fileName + htmlBody + manifest) — anything less and the
    // replay would fabricate a new artifact instead of resurrecting the run.
    expect(source).toMatch(
      /stashPendingArtifactWrite\(\{[\s\S]{0,240}projectId:\s*project\.id,[\s\S]{0,240}fileName,[\s\S]{0,240}htmlBody,[\s\S]{0,240}artifactManifest:/,
    );
  });

  it("clears the stash on a successful subsequent write for the same fileName", () => {
    // A newer 2xx write supersedes the stashed replay — otherwise the
    // recovery listener would blindly re-PUT older bytes over the fresh
    // file on the next auth event.
    expect(source).toMatch(
      /if \(result\.ok\) \{[\s\S]{0,300}clearPendingArtifactWrite\(project\.id, file\.name\)/,
    );
  });

  it("replays stashed writes when the passive-auth-recovered event fires", () => {
    expect(source).toContain(
      "import { TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT }",
    );
    // The listener must both (a) fire on mount for the sign-in-return path
    // that lands a fresh cookie without dispatching the event, and (b)
    // subscribe to the event for background recovery mid-session.
    expect(source).toMatch(
      /window\.addEventListener\(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT,\s*onRecovered\)/,
    );
    expect(source).toContain("listPendingArtifactWrites(projectId)");
    expect(source).toContain("writeProjectTextFileDetailed(\n            entry.projectId");
  });

  it("does not replay stashed writes while auth refresh is sticky-declined", () => {
    expect(source).toMatch(
      /const replay = async \(\) => \{[\s\S]{0,300}if \(isDesignAuthRefreshDeclined\(\)\) return;/,
    );
  });

  it("drops the stash on non-401 replay failures so the listener does not loop", () => {
    expect(source).toMatch(
      /else if \(result\.status !== 401\)[\s\S]{0,200}clearPendingArtifactWrite\(entry\.projectId, entry\.fileName\)/,
    );
  });

  it("wires pendingRecoveryPreview through to FileWorkspace so the memory-only fallback can render", () => {
    expect(source).toContain(
      "const [pendingRecoveryPreview, setPendingRecoveryPreview]",
    );
    expect(source).toContain("pendingArtifactRecovery={pendingRecoveryPreview}");
    // A new run must clear the fallback so an ended-in-401 previous deck
    // does not ghost the fresh turn while it streams.
    expect(source).toMatch(
      /setArtifact\(null\);[\s\S]{0,400}setPendingRecoveryPreview\(null\)/,
    );
  });

  it("switches the workspace onto the (yet-nonexistent) file tab on stash so the fallback renders", () => {
    // Without this, a user answering questions and hitting 401 on write
    // stays on QUESTIONS_TAB after "완료됨" and never sees the fallback iframe.
    // FileWorkspace.memoryOnlyPreview only fires inside a preview-file tab
    // slot in the render ladder, so we need to punch the activeTab across
    // to the file name that lives only in the stash.
    expect(source).toMatch(
      /if \(stashed\) \{[\s\S]{0,1500}requestOpenFile\(fileName\);/,
    );
  });
});

describe("FileWorkspace memory-only preview fallback", () => {
  const source = readSource("src/components/FileWorkspace.tsx");

  it("declares the pendingArtifactRecovery prop as an optional { fileName, html } snapshot", () => {
    expect(source).toContain("pendingArtifactRecovery?: { fileName: string; html: string } | null");
    expect(source).toContain("pendingArtifactRecovery = null,");
  });

  it("only paints the fallback when the HTML is stable enough for an iframe", () => {
    // Never flash mid-stream truncated CDN URLs / partial documents as a
    // fallback — that is what isArtifactHtmlStableForPreview gates.
    expect(source).toContain("import { isArtifactHtmlStableForPreview }");
    expect(source).toMatch(
      /memoryOnlyPreview[\s\S]{0,600}isArtifactHtmlStableForPreview\(pendingArtifactRecovery\.html\)/,
    );
  });

  it("only paints the fallback on the tab that matches the stashed fileName", () => {
    expect(source).toContain(
      "previewFileMatchesTab({ name: pendingArtifactRecovery.fileName }, activeTab)",
    );
  });

  it("renders the fallback iframe with a session-scoped banner between the FileViewer and pendingPreviewTab branches", () => {
    // Order matters: fallback sits AFTER resolvedPreviewFile (so a real file
    // still wins) and BEFORE pendingPreviewTab (so the fallback beats the
    // grey loading spinner) — otherwise the panel would either steal focus
    // from an intentional file selection or stay empty during the outage.
    expect(source).toMatch(
      /resolvedPreviewFile \? \([\s\S]*?<FileViewer[\s\S]*?\/>\s*\)\s*:\s*memoryOnlyPreview \? \([\s\S]*?srcDoc=\{memoryOnlyPreview\.html\}/,
    );
    expect(source).toMatch(
      /memoryOnlyPreview \? \([\s\S]*?workspace\.memoryOnlyPreviewSessionBanner[\s\S]*?\)\s*:\s*pendingPreviewTab/,
    );
  });

  it("only feeds the fallback from the stash (never from bare artifactHtml)", () => {
    // Deliberately narrow: `artifactHtml` alone must not populate the
    // fallback, otherwise a previous run's in-memory HTML could paint on
    // top of an unrelated tab whose file was deleted. The stash carries
    // the concrete fileName tied to persistArtifact + requestOpenFile.
    expect(source).toMatch(
      /const memoryOnlyPreview = useMemo[\s\S]{0,400}if \(!pendingArtifactRecovery\?\.html\) return null;/,
    );
    expect(source).not.toMatch(
      /memoryOnlyPreview = useMemo[\s\S]{0,600}artifactHtml\?\.trim/,
    );
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("ProjectView message loading", () => {
  it("does not let auxiliary preview/run lookups fail the persisted chat reload", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const loadMessagesWithRetry = async () =>");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 1600);

    expect(source).toContain("const safeFetchPreviewComments = async () =>");
    expect(source).toContain("const safeListActiveChatRuns = async () =>");
    expect(block).toContain("const list = await listMessages(project.id, activeConversationId)");
    expect(block).toContain("safeFetchPreviewComments()");
    expect(block).toContain("safeListActiveChatRuns()");
    expect(block).not.toContain("fetchPreviewComments(project.id, activeConversationId)");
    expect(block).not.toContain("listActiveChatRuns(project.id, activeConversationId)");
  });

  it("keeps daemon reattach probes best-effort so transient run API failures do not kill recovery", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const attachRecoverableRuns = async () =>");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 2400);

    expect(block).toContain("let activeRuns: Awaited<ReturnType<typeof listActiveChatRuns>> = []");
    expect(block).toContain("activeRuns = await listActiveChatRuns(project.id, reattachConversationId)");
    expect(block).toContain("active daemon runs reattach probe skipped");
    expect(block).toContain("listProjectRuns().catch");
    expect(block).toContain("daemon run history reattach probe skipped");
  });

  it("retries the API background stream probe after a transient failure", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("api background recovery stream probe skipped");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start - 900, start + 1800);

    expect(block).toContain("let retryTimer: number | null = null");
    expect(block).toContain("retryTimer = window.setTimeout");
    expect(block).toContain("setReattachNonce((value) => value + 1)");
    expect(block).toContain("if (retryTimer !== null) window.clearTimeout(retryTimer)");
    expect(block).toContain("reattachNonce");
    expect(source).toContain("BYOK_BACKGROUND_RECOVERY_AUTH_RETRY_MS = BYOK_PROXY_AUTH_BACKOFF_MS");
    expect(source).toContain("err instanceof ActiveByokProxyAuthTransientError");
    expect(source).toContain("? BYOK_BACKGROUND_RECOVERY_AUTH_RETRY_MS");
  });

  it("recovers an existing edited HTML output when produced-file diff is empty", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const helperStart = source.indexOf("function selectTouchedHtmlOutputFromEvents");
    expect(helperStart).toBeGreaterThan(0);
    const helperBlock = source.slice(helperStart, helperStart + 1400);
    expect(helperBlock).toContain("toolName !== 'write' && toolName !== 'edit'");
    expect(helperBlock).toContain("decideAutoOpenAfterWrite(filePath, filesSnapshot, options)");
    expect(helperBlock).toContain("isHtmlProjectFile(file)");

    const autoOpenStart = source.indexOf("const autoOpenRecoveredHtmlOutput = useCallback");
    expect(autoOpenStart).toBeGreaterThan(0);
    const autoOpenBlock = source.slice(autoOpenStart, autoOpenStart + 1700);
    expect(autoOpenBlock).toContain("selectAutoOpenProducedHtml(produced)");
    expect(autoOpenBlock).toContain("selectTouchedHtmlOutputFromEvents(message.events, filesSnapshot");
    expect(autoOpenBlock).toContain("branding: { slideOnlyMvp }");

    const fallbackUses = source.match(/selectTouchedHtmlOutputFromEvents\(/g) ?? [];
    expect(fallbackUses.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("selectTouchedHtmlOutputFromEvents(message.events, nextFiles");
    expect(source).toContain("selectTouchedHtmlOutputFromEvents(latestAssistantMsg.events, nextFiles");
  });

  it("routes BYOK memory extraction through daemon auth recovery without active workspace preflight", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("fetchTeamverDaemon('/api/memory/extract'");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 1500);

    expect(block).toContain("teamverProjectId: project.id");
    expect(block).toContain("skipTeamverWorkspaceHeaders: true");
    expect(block).toContain("preTurnMemoryDaemonUnauthorized = memoryResponse.status === 401");
    expect(block).toContain("isDesignAuthRefreshDeclined()");
    expect(block).toContain("handlers.onError(new TeamverDaemonUnauthorizedError())");
    expect(block).toContain("return true");
    expect(source).not.toContain("fetch('/api/memory/extract'");
  });

  it("preflights embed API runs through daemon project access before starting the model stream", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const memoryStart = source.indexOf("fetchTeamverDaemon('/api/memory/extract'");
    expect(memoryStart).toBeGreaterThan(0);
    const streamStart = source.indexOf("void streamMessage(config", memoryStart);
    expect(streamStart).toBeGreaterThan(memoryStart);
    const block = source.slice(memoryStart, streamStart);

    expect(block).toContain("fetchTeamverDaemon(");
    expect(block).toContain("`/api/projects/${encodeURIComponent(project.id)}`");
    expect(block).toContain("cache: 'no-store'");
    expect(block).toContain("teamverProjectId: project.id");
    expect(block).toContain("accessResponse.status === 401");
    expect(block).toContain("handlers.onError(new TeamverDaemonUnauthorizedError())");
    expect(block).toContain("return true");
  });

  it("replays stashed artifact writes without shifting write arguments", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const replay = async () =>");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 2600);

    expect(block).toContain("const pending = listPendingArtifactWrites(projectId)");
    expect(block).toContain("writeProjectTextFileDetailed(");
    expect(block).toContain("entry.projectId,\n            entry.fileName,\n            entry.htmlBody");
    expect(block).not.toContain("entry.projectId,\n            entry.projectId,\n            entry.fileName");
    expect(block).toContain("clearPendingArtifactWrite(entry.projectId, entry.fileName)");
  });

  it("clears pending write recovery state when a fresh run starts", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const marker = source.indexOf("updateConversationLatestRun(config.mode === 'daemon' ? 'running' : 'queued')");
    expect(marker).toBeGreaterThan(0);
    const start = source.indexOf("setArtifact(null);", marker);
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 500);

    expect(block).toContain("clearProjectPendingArtifactWrites(project.id)");
    expect(block).toContain("setPendingRecoveryPreview(null)");
  });

  it("passes pending artifact recovery into the workspace preview fallback", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("<FileWorkspace");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 6000);

    expect(block).toContain("artifactHtml={artifact?.html}");
    expect(block).toContain("pendingArtifactRecovery={pendingRecoveryPreview}");
  });

  it("runs auto-open recovery after message load so refresh restores the last completed HTML preview", () => {
    const source = readSource("src/components/ProjectView.tsx");

    expect(source).toContain("conversationRecoveryAttemptedRef");
    expect(source).toContain("conversationRecoveryAttemptedRef.current.clear()");
    expect(source).toContain("conversationRecoveryAttemptedRef.current.has(activeConversationId)");
    expect(source).toContain("conversationRecoveryAttemptedRef.current.add(activeConversationId)");

    const start = source.indexOf(
      "conversationRecoveryAttemptedRef.current.add(activeConversationId)",
    );
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 1500);
    expect(block).toContain("!isInFlightAssistantMessage(m)");
    expect(block).toContain("refreshProjectFiles().catch");
    expect(block).toContain(
      "messagesConversationIdRef.current !== activeConversationId",
    );
    expect(block).toContain("autoOpenRecoveredHtmlOutput(");
    // Ordering matters — autoOpenRecoveredHtmlOutput short-circuits on the
    // first match so the newest completion must be tried first.
    expect(block).toContain(".slice()");
    expect(block).toContain(".reverse()");
  });

  it("logs the silent-skip and no-produced-HTML paths so a completed run with an empty preview has a breadcrumb", () => {
    const source = readSource("src/components/ProjectView.tsx");

    expect(source).toContain(
      "[teamver] artifact write skipped as incomplete document shell",
    );
    expect(source).toContain(
      "[teamver] stream terminal auto-open produced no HTML",
    );
    expect(source).toContain("hadParsedArtifact: Boolean(parsedArtifact?.html)");
  });
});

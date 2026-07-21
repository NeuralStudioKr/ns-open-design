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

  it("passes Teamver slide-only media policy into API-mode system prompts", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("return composeSystemPrompt({");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 1800);

    expect(block).toContain("mediaExecution: mediaExecutionPolicyForProjectMetadata(project.metadata");
    expect(block).toContain("slideOnlyMvp");
    expect(block).toContain("streamFormat: config.mode === 'api' ? 'plain' : undefined");
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
    expect(block).toContain("const openedRecoveredHtml = autoOpenRecoveredHtmlOutput(");
    expect(block).toContain("if (openedRecoveredHtml) return");
    // Ordering matters — autoOpenRecoveredHtmlOutput short-circuits on the
    // first match so the newest completion must be tried first.
    expect(block).toContain(".slice()");
    expect(block).toContain(".reverse()");
  });

  it("auto-continues a recovered incomplete-output row after reload when no HTML exists", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const openedRecoveredHtml = autoOpenRecoveredHtmlOutput(");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 5000);

    expect(block).toContain("AUTO_CONTINUE_STATUS_CODE");
    expect(block).toContain("conversationAutoContinueCountRef.current.set(");
    expect(block).toContain("nextAutoContinueCount >= AUTO_CONTINUE_MAX_PER_CONVERSATION");
    expect(block).toContain("message.runStatus === 'failed'");
    expect(block).toContain("message.resumable === true");
    expect(block).toContain("event.code === 'incomplete_output'");
    expect(block).toContain("formatAutoContinueIncompleteOutputNotice()");
    expect(block).toContain("appendErrorStatusEvent(");
    expect(block).toContain("saveMessage(project.id, activeConversationId, updatedAssistant");
    expect(block).toContain("handleSendRef.current");
    expect(block).toContain("AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT");
    expect(block).toContain("AUTO_CONTINUE_ENTRY_FROM");
  });

  it("auto-continues a background-recovered incomplete-output row once proxy streams drain", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const openedRecoveredHtml = autoOpenRecoveredHtmlOutput(");
    const secondStart = source.indexOf("const openedRecoveredHtml = autoOpenRecoveredHtmlOutput(", start + 1);
    expect(secondStart).toBeGreaterThan(0);
    const block = source.slice(secondStart, secondStart + 4600);

    expect(block).toContain("const proxyStillActive = matchingActiveStreams.length > 0");
    expect(block).toContain("!openedRecoveredHtml && !stillInflight && !proxyStillActive");
    expect(block).toContain("trackedAssistantIds.has(message.id)");
    expect(block).toContain("event.code === 'incomplete_output'");
    expect(block).toContain("AUTO_CONTINUE_MAX_PER_CONVERSATION");
    expect(block).toContain("formatAutoContinueIncompleteOutputNotice()");
    expect(block).toContain("saveMessage(project.id, recoveryConversationId, updatedAssistant");
    expect(block).toContain("finishRecovery()");
    expect(block).toContain("handleSendRef.current");
    expect(block).toContain("AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT");
  });

  it("keeps the no-produced-HTML terminal path quiet in the browser console", () => {
    const source = readSource("src/components/ProjectView.tsx");

    expect(source).toContain(
      "[teamver] artifact write skipped as incomplete document shell",
    );
    expect(source).not.toContain(
      "[teamver] stream terminal auto-open produced no HTML",
    );
  });

  it("does not finalize an incomplete HTML artifact shell as a successful run", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const persistStart = source.indexOf("const persistArtifact = useCallback");
    expect(persistStart).toBeGreaterThan(0);
    const persistBlock = source.slice(persistStart, persistStart + 4200);

    expect(persistBlock).toContain("Promise<ArtifactPersistResult>");
    expect(persistBlock).toContain("isIncompleteHtmlDocumentShell(artifactToPersist.html)");
    expect(persistBlock).toContain("kind: 'skipped-incomplete'");
    // Validation refusals still surface a refusal banner; incomplete shells
    // must stay quiet so they do not contradict the automatic-continue notice.
    expect(persistBlock).toContain("formatProjectArtifactRejectedError(");
    const shellStart = source.indexOf(
      "if (isIncompleteHtmlDocumentShell(artifactToPersist.html))",
      persistStart,
    );
    expect(shellStart).toBeGreaterThan(persistStart);
    const shellBlock = source.slice(shellStart, shellStart + 900);
    expect(shellBlock).toContain("kind: 'skipped-incomplete'");
    expect(shellBlock).not.toContain("setError(");
    expect(shellBlock).not.toContain("formatProjectArtifactRejectedError(");

    const autoOpenStart = source.indexOf("const scheduleStreamRunHtmlAutoOpen");
    expect(autoOpenStart).toBeGreaterThan(0);
    const autoOpenBlock = source.slice(autoOpenStart, autoOpenStart + 12000);

    expect(autoOpenBlock).toContain("const persistResult = await persistArtifact(");
    expect(autoOpenBlock).toContain("terminalArtifactPersistFailed = shouldFailRunForArtifactPersistResult(persistResult)");
    expect(autoOpenBlock).toContain("formatProjectRunDeliverableMissingError()");
    expect(autoOpenBlock).toContain("resolveTerminalArtifactToPersist(");
    expect(autoOpenBlock).toContain("htmlAutoOpenGenerationRef");
    expect(autoOpenBlock).toContain("isLatestTerminalAutoOpen");
    expect(autoOpenBlock).toContain("shouldFailSlideRunForMissingHtmlDeliverable(");
    expect(autoOpenBlock).toContain("runStatus: 'failed'");
    expect(autoOpenBlock).toContain("resumable: true");
    expect(autoOpenBlock).toContain("updateConversationLatestRun('failed'");
    expect(autoOpenBlock).toContain("shouldAutoContinueForIncompleteOutput({");
    expect(autoOpenBlock).toContain("formatAutoContinueIncompleteOutputNotice()");
    expect(autoOpenBlock).toContain("AUTO_CONTINUE_STATUS_CODE");
    expect(autoOpenBlock).toContain("AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT");
    expect(autoOpenBlock).toContain("isLiveLocalStreamBlockingAutoContinue({");
    expect(autoOpenBlock).toContain("AUTO_CONTINUE_ENTRY_FROM");
    expect(autoOpenBlock).toContain("rollbackAutoContinueCount(");
    expect(autoOpenBlock).toContain("conversationAutoContinueCountRef.current");
    expect(autoOpenBlock).toContain("autoContinueTimerRef.current = window.setTimeout");
    expect(autoOpenBlock).toContain("if (runIsVisible() && !canAutoContinue) setError(deliverableError)");
    // The 600ms auto-continue fire path must clear phantom BYOK recovery
    // streaming and only block on a live AbortController / other conversation.
    // Also abort if the user switched projects/conversations so a late timer
    // from project A cannot inject into project B's brand-new chat.
    expect(autoOpenBlock).toContain("const scheduledProjectId = project.id");
    expect(autoOpenBlock).toContain("const scheduledConversationId = runConversationId");
    expect(autoOpenBlock).toContain("project.id !== scheduledProjectId");
    expect(autoOpenBlock).toContain("messagesConversationIdRef.current === scheduledConversationId");
    expect(autoOpenBlock).toContain("clearStreamingMarker(scheduledConversationId)");
    expect(autoOpenBlock).toContain("targetConversationId: scheduledConversationId");
    expect(source).toContain("meta?.entryFrom === AUTO_CONTINUE_ENTRY_FROM && !abortRef.current");
    // Keep this path quiet in production DevTools. The user-facing assistant
    // status event is the observable signal; console noise made previous demo
    // failures look scarier than they were.
    expect(autoOpenBlock).not.toContain("[teamver] terminal failure - auto-continue decision");
    expect(autoOpenBlock).not.toContain("[teamver] auto-continue firing");
    expect(autoOpenBlock).not.toContain("[teamver] auto-continue was queued or rejected by handleSend");
    // This recovery is for content incompleteness, not an embed-level submit
    // permission check. Gating it on the composer button state made the
    // capped continue silently fail when the UI was still settling.
    expect(autoOpenBlock).not.toContain("!embedSubmitDisabled");
    expect(autoOpenBlock).not.toContain("embedSubmitDisabledAtFire: embedSubmitDisabled");
    expect(source).toContain("const handleSendRef = useRef(handleSend)");
    expect(source).toContain("handleSendRef.current = handleSend");
  });
});

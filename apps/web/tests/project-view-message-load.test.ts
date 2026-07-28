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
    const end = source.indexOf("onProjectsRefresh,\n    scheduleConversationMessageRefresh,\n    reattachNonce,");
    const block = source.slice(start, end > start ? end : start + 12_000);

    expect(block).toContain("let activeRuns: Awaited<ReturnType<typeof listActiveChatRuns>> = []");
    expect(block).toContain("activeRuns = await listActiveChatRuns(project.id, reattachConversationId)");
    expect(block).toContain("active daemon runs reattach probe skipped");
    expect(block).toContain("listProjectRuns().catch");
    expect(block).toContain("daemon run history reattach probe skipped");
    expect(block).toContain("isDaemonRunCancelPending(run)");
    expect(block).toContain("wasUserStoppedAssistantTurn");
    expect(block).toContain("shouldReattachDaemonRunEvents");
    expect(block).toContain("requestDaemonRunCancel");
    expect(block).toContain("isLocallyTerminalAssistantMessage(message)");
  });

  it("retries the API background stream probe after a transient failure", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("api background recovery stream probe skipped");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start - 900, start + 3200);

    expect(block).toContain("let retryTimer: number | null = null");
    expect(block).toContain("retryTimer = window.setTimeout");
    expect(block).toContain("setReattachNonce((value) => value + 1)");
    expect(block).toContain("if (retryTimer !== null) window.clearTimeout(retryTimer)");
    expect(block).toContain("reattachNonce");
    expect(block).toContain("wasUserStoppedAssistantTurn");
    expect(block).toContain("isLocallyTerminalAssistantMessage(existing)");
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

  it("keeps BYOK memory extraction best-effort even when daemon auth is stale", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("fetchTeamverDaemon('/api/memory/extract'");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 1500);

    expect(block).toContain("teamverProjectId: project.id");
    expect(block).toContain("skipTeamverWorkspaceHeaders: true");
    expect(block).toContain("skipEmbedAuthRecovery: true");
    expect(block).toContain("memoryResponse.status === 401");
    expect(block).toContain("pre-turn memory extraction skipped after daemon 401");
    expect(block).toContain("memory extraction must never block");
    expect(block).not.toContain("handlers.onError(new TeamverDaemonUnauthorizedError())");
    expect((source.match(/skipEmbedAuthRecovery: true/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain("fetch('/api/memory/extract'");
    expect(source).toContain("const userText = stripUserVisibleUserMessageText(prompt).trim()");
    expect(source).not.toContain("const userText = (userMsg.content ?? '').trim()");
    expect(source).toContain("const assistantText = stripAllClosedArtifacts(accumulatedAssistantText).trim()");
    expect(source).toContain("assistantMessage: assistantText");
  });

  it("does not run a separate embed project access preflight before the model stream", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const memoryStart = source.indexOf("fetchTeamverDaemon('/api/memory/extract'");
    expect(memoryStart).toBeGreaterThan(0);
    const streamStart = source.indexOf("void streamMessage(config", memoryStart);
    expect(streamStart).toBeGreaterThan(memoryStart);
    const block = source.slice(memoryStart, streamStart);

    expect(block).not.toContain("`/api/projects/${encodeURIComponent(project.id)}`");
    expect(block).not.toContain("accessResponse.status === 401");
    expect(block).not.toContain("project access preflight");
    expect(source.slice(streamStart, streamStart + 3200)).toContain("projectId: project.id");
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

  it("loads selected template snapshots for deck projects when templateId is present", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const tplId = project.metadata?.templateId");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 900);

    expect(block).toContain("if (tplId) {");
    expect(block).toContain("await getTemplate(tplId)");
    expect(block).not.toContain("project.metadata?.kind === 'template' && tplId");
  });

  it("uses this turn's selected skillIds when composing API-mode prompts", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const signature = source.indexOf("skillIdOverride?: string | null");
    expect(signature).toBeGreaterThan(0);
    const composeBlock = source.slice(signature, signature + 3200);

    expect(composeBlock).toContain("const effectiveSkillId = skillIdOverride ?? project.skillId");
    expect(composeBlock).toContain("skills.find((s) => s.id === effectiveSkillId)");
    expect(composeBlock).toContain("await fetchDesignTemplate(effectiveSkillId)");

    expect(composeBlock).toContain("await fetchPluginLocalSkill(pluginIdForLocalSkill)");

    const callStart = source.indexOf("const effectiveSkillId =\n          (Array.isArray(meta?.skillIds)");
    expect(callStart).toBeGreaterThan(0);
    const callBlock = source.slice(callStart, callStart + 1100);
    expect(callBlock).toContain("meta.skillIds[0]");
    expect(callBlock).toContain("meta?.context?.pluginIds");
    expect(callBlock).toContain("pluginIdForLocalSkill");
    expect(callBlock).toContain("composedSystemPrompt(");
  });

  it("passes design templates into the project chat composer skill picker", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const memoStart = source.indexOf("const chatComposerSkills = useMemo");
    expect(memoStart).toBeGreaterThan(0);
    const memoBlock = source.slice(memoStart, memoStart + 700);

    expect(memoBlock).toContain("for (const skill of [...skills, ...designTemplates])");
    expect(memoBlock).toContain("seen.has(skill.id)");

    const paneStart = source.indexOf("<ChatPane");
    expect(paneStart).toBeGreaterThan(0);
    const paneBlock = source.slice(paneStart, paneStart + 1600);
    expect(paneBlock).toContain("skills={chatComposerSkills}");
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
    expect(block).toContain("const openedRecoveredHtml = await autoOpenRecoveredHtmlOutput(");
    expect(block).toContain("if (openedRecoveredHtml) return");
    // Ordering matters — autoOpenRecoveredHtmlOutput short-circuits on the
    // first match so the newest completion must be tried first.
    expect(block).toContain(".slice()");
    expect(block).toContain(".reverse()");
  });

  it("auto-continues a recovered incomplete-output row after reload when no HTML exists", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const openedRecoveredHtml = await autoOpenRecoveredHtmlOutput(");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 7000);

    expect(block).toContain("AUTO_CONTINUE_STATUS_CODE");
    expect(block).toContain("syncAutoContinueCountFromMessages(");
    expect(block).toContain("findIncompleteSlideAssistantForRecovery(");
    expect(block).toContain("pendingAutoContinueConversationIdRef.current === activeConversationId");
    expect(block).toContain("attemptEmergencySlideDeckRecovery(");
    expect(block).toContain("canFireAutoContinueForConversation(autoContinueCount)");
    expect(block).toContain("formatAutoContinueIncompleteOutputNotice()");
    expect(block).toContain("appendErrorStatusEvent(");
    expect(block).toContain("saveMessage(project.id, activeConversationId, updatedAssistant");
    expect(block).toContain("handleSendRef.current");
    expect(block).toContain("buildAutoContinueIncompleteOutputPrompt");
    expect(block).toContain("AUTO_CONTINUE_ENTRY_FROM");
    expect(block).toContain("const scheduledProjectId = project.id");
    expect(block).toContain("project.id !== scheduledProjectId");
  });

  it("auto-continues a background-recovered incomplete-output row once proxy streams drain", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const openedRecoveredHtml = await autoOpenRecoveredHtmlOutput(");
    const secondStart = source.indexOf("const openedRecoveredHtml = await autoOpenRecoveredHtmlOutput(", start + 1);
    expect(secondStart).toBeGreaterThan(0);
    const block = source.slice(secondStart, secondStart + 7200);

    expect(block).toContain("const proxyStillActive = matchingActiveStreams.length > 0");
    expect(block).toContain("!openedRecoveredHtml && !stillInflight && !proxyStillActive");
    expect(block).toContain("findIncompleteSlideAssistantForRecovery(");
    expect(block).toContain("restrictToMessageIds: trackedAssistantIds");
    expect(block).toContain("canFireAutoContinueForConversation(autoContinueCount)");
    expect(block).toContain("formatAutoContinueIncompleteOutputNotice()");
    expect(block).toContain("saveMessage(project.id, recoveryConversationId, updatedAssistant");
    expect(block).toContain("finishRecovery()");
    expect(block).toContain("handleSendRef.current");
    expect(block).toContain("buildAutoContinueIncompleteOutputPrompt");
    expect(block).toContain("const scheduledProjectId = project.id");
    expect(block).toContain("project.id !== scheduledProjectId");
  });

  it("keeps the no-produced-HTML terminal path quiet in the browser console", () => {
    const source = readSource("src/components/ProjectView.tsx");

    expect(source).not.toContain(
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
    // Bumped window from 5200 to 7000 chars when the deck-patch interceptor
    // (isDeckPatchArtifactType + tryApplyDeckPatchAgainstCurrentDeck) added a
    // ~1.5KB prelude at the top of persistArtifact.
    const persistBlock = source.slice(persistStart, persistStart + 12000);

    expect(persistBlock).toContain("Promise<ArtifactPersistResult>");
    expect(persistBlock).toContain("preferDeck: slideOnlyMvp");
    expect(persistBlock).toContain("isIncompleteHtmlDocumentShell(artifactToPersist.html)");
    expect(persistBlock).toContain("kind: 'skipped-incomplete'");
    // deck-patch interceptor must run BEFORE the incomplete-shell / validate
    // gates so partial patches never get rejected as "not a full document".
    expect(persistBlock).toContain("isElementPatchArtifactType(art.artifactType)");
    expect(persistBlock).toContain("tryApplyElementPatchesAgainstCurrentDeck(");
    expect(persistBlock).toContain("isDeckPatchArtifactType(art.artifactType)");
    expect(persistBlock).toContain("tryApplyDeckPatchAgainstCurrentDeck(");
    expect(persistBlock).toContain("kind: 'scope-rejected'");
    // Validation refusals still surface a refusal banner; incomplete shells
    // must stay quiet so they do not contradict the automatic-continue notice.
    expect(persistBlock).toContain("formatProjectArtifactRejectedError(");
    const shellStart = source.indexOf(
      "if (isIncompleteHtmlDocumentShell(artifactToPersist.html))",
      persistStart,
    );
    expect(shellStart).toBeGreaterThan(persistStart);
    const shellBlock = source.slice(shellStart, shellStart + 520);
    expect(shellBlock).toContain("kind: 'skipped-incomplete'");
    expect(shellBlock).not.toContain("setError(");
    expect(shellBlock).not.toContain("formatProjectArtifactRejectedError(");

    const autoOpenStart = source.indexOf("const scheduleStreamRunHtmlAutoOpen");
    expect(autoOpenStart).toBeGreaterThan(0);
    const autoOpenBlock = source.slice(autoOpenStart, autoOpenStart + 18000);

    expect(autoOpenBlock).toContain("const rawFinalText = streamedText || fullText || latestAssistantMsg.content || ''");
    expect(autoOpenBlock).toContain("const persistResult = await persistArtifact(");
    expect(autoOpenBlock).toContain("terminalArtifactPersistFailed = shouldFailRunForArtifactPersistResult(persistResult)");
    expect(autoOpenBlock).toContain("formatProjectRunDeliverableMissingError()");
    expect(autoOpenBlock).toContain("resolveTerminalArtifactToPersist(");
    expect(autoOpenBlock).toContain("rawFinalText,\n              artifactFromStandaloneHtml");
    expect(autoOpenBlock).toContain("finalText: rawFinalText");
    expect(autoOpenBlock).toContain("terminalPersistResult = persistResult");
    expect(autoOpenBlock).toContain("formatProjectArtifactSaveFailedError(terminalPersistResult.fileName");
    expect(autoOpenBlock).toContain("htmlAutoOpenGenerationRef");
    expect(autoOpenBlock).toContain("isLatestTerminalAutoOpen");
    expect(autoOpenBlock).toContain("shouldFailSlideRunForMissingHtmlDeliverable(");
    expect(autoOpenBlock).toContain("resolveSlideProducedHtmlToOpen(");
    expect(autoOpenBlock).toContain("runStatus: 'failed'");
    expect(autoOpenBlock).toContain("resumable: true");
    expect(autoOpenBlock).toContain("updateConversationLatestRun('failed'");
    expect(autoOpenBlock).toContain("syncAutoContinueCountFromMessages(");
    expect(autoOpenBlock).toContain("shouldAutoContinueForIncompleteOutput({");
    expect(autoOpenBlock).toContain("attemptEmergencySlideDeckRecovery(");
    expect(autoOpenBlock).toContain("formatAutoContinueIncompleteOutputNotice()");
    expect(autoOpenBlock).toContain("AUTO_CONTINUE_STATUS_CODE");
    expect(autoOpenBlock).toContain("buildAutoContinueIncompleteOutputPrompt");
    expect(autoOpenBlock).toContain("extractAutoContinueContextFromAssistant");
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
    const handleSendStart = source.indexOf("const handleSend = useCallback(");
    expect(handleSendStart).toBeGreaterThan(0);
    // Keep this window broad enough for the prompt preparation block above
    // the auto-continue counter reset; this test asserts the ordering contract,
    // not an exact source distance.
    const handleSendBlock = source.slice(handleSendStart, handleSendStart + 7200);
    expect(handleSendBlock).toContain("isAutoContinueIncompleteOutputPrompt(prompt)");
    expect(handleSendBlock).toContain("conversationAutoContinueCountRef.current.set(runConversationId, 0)");
    // Comment-edit path must plumb the deck-patch nudge, while keeping the
    // current deck source attached. Prior assistant artifact history is not
    // reliable after refresh/queue/background reattach; without deck.html the
    // model can claim the selected text does not exist.
    expect(handleSendBlock).toContain("promptWithSlideCommentEditPatchInstruction(");
    expect(handleSendBlock).not.toContain("skipDeckHtml: slideOnlyMvp && scopedCommentAttachments.length > 0");
  });

  it("self-heals leaked composer streaming markers after terminal turns settle", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("shouldClearPhantomStreamingMarker({");
    expect(source).toContain("if (apiBackgroundRecoveryRef.current) return;");
    expect(source).toContain("backgroundRecoveryActive: apiBackgroundRecoveryRef.current");
    expect(source).toContain("clearStreamingMarker(activeConversationId)");
    const autoOpenStart = source.indexOf("const scheduleStreamRunHtmlAutoOpen = (fullText: string, delayMs = 0) =>");
    expect(autoOpenStart).toBeGreaterThan(0);
    const finallyStart = source.indexOf("const noFinalizeInFlight = htmlAutoOpenFinalizeInProgressRef.current.size === 0");
    expect(finallyStart).toBeGreaterThan(autoOpenStart);
    expect(source).toContain("conversationStillMarked");
    expect(source).toContain("clearStreamingMarker(runConversationId)");
  });

  it("keeps scoped comment deck edits element-bound even when comments only have selectors", () => {
    const source = readSource("src/components/ProjectView.tsx");

    expect(source).toContain("function domSelectorCommentElementId");
    expect(source).toContain("function selectorCommentElementIds");
    expect(source).toContain("'data-od-id', 'data-screen-label', 'data-od-source-path', 'data-od-runtime-id'");
    expect(source).toContain("...selectorCommentElementIds(attachment.selector)");
    expect(source).toContain("return `dom:${trimmed}`");
    expect(source).toContain("domSelectorCommentElementId(attachment.selector)");
    expect(source).toContain("...selectorCommentElementIds(member.selector)");
    expect(source).toContain("domSelectorCommentElementId(member.selector)");

    const guardStart = source.indexOf("async function fullDeckEditStaysInsideCommentScope");
    expect(guardStart).toBeGreaterThan(0);
    const guardBlock = source.slice(guardStart, guardStart + 3600);
    expect(guardBlock).toContain("const hasElementScopedComment");
    expect(guardBlock).toContain("const targetUnresolved");
    expect(guardBlock).toContain("beforeMasked.maskedCount !== afterMasked.maskedCount");
    expect(guardBlock).toContain("code: 'full_deck_comment_target_unresolved'");
    expect(guardBlock).toContain("scoped full-deck guard rejected unresolved comment target");

    expect(source).toContain("mergeManualEditTargetsFromSource");
    expect(source).toContain("function mergeScopedCommentTargetsFromPatchedDeck");
    expect(source).toContain("commentAttachments: runCommentAttachmentsRef.current");
    expect(source).toContain("instructionText: runVisiblePromptRef.current");
    expect(source).toContain("instructionText: [attachment.comment, input.instructionText].filter(Boolean).join");
    expect(source).toContain("const scopedCommentAttachments = filterUsableCommentAttachments(hydratedCommentAttachments)");
    expect(source).toContain("commentAttachmentCount: scopedCommentAttachments.length");
    expect(source).toContain("commentAttachments: scopedCommentAttachments");
  });

  it("hydrates missing deck comment slide indexes before scoped edit prompts", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("hydrateDeckCommentSlideIndexes");
    expect(source).toContain("extractTopLevelSlideSections(html)");
    expect(source).toContain("inferSlideIndexFromDeckHtml(html, attachment)");
    expect(source).toContain(":nth-of-type");
    expect(source).toContain("const scopedCommentAttachments = filterUsableCommentAttachments(hydratedCommentAttachments)");
    expect(source).not.toContain(".filter((attachment) => !slideOnlyMvp || hasValidDeckSlideIndex(attachment))");
  });

  it("recovers deck comment slide index for single-slide decks and DOM-selector elementIds", () => {
    // Behavioral coverage lives in `infer-slide-index-from-deck-html.test.ts`.
    // This source-level check pins the shortcuts that make the
    // behavioral scenarios possible so they don't regress silently
    // (e.g. by moving the single-slide branch back below the ambiguous
    // needle path). Keep both in sync.
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("if (sections.length === 1) return 0");
    expect(source).toContain("elementId.startsWith('dom:')");
    expect(source).toContain("body\\s*>\\s*(?:[a-z0-9-]+\\s*>\\s*)*section:nth-of-type");
  });

  it("returns undefined from scopedCommentSlideIndexes when no attachment carries a valid slide index", () => {
    // Regression: previously we returned `[]` in this case which flowed
    // into applyDeckPatch as a strict-reject allow-set (every op
    // rejected as "outside comment scope") and into
    // fullDeckEditStaysInsideCommentScope as `comment_scope_missing_slide`.
    // Both surfaced as `deck_patch_merge_failed` even when the model
    // response was fine. Returning `undefined` here means "no scope
    // restriction" so the deck-patch and full-deck paths behave the
    // same as unscoped edits.
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("const unique = [...new Set(indexes)]");
    expect(source).toContain("return unique.length > 0 ? unique : undefined");
  });

  it("passes hint to maskManualEditTargets so full-deck guards respect the same hint fallback", () => {
    // `maskManualEditTargets` accepts a hints array symmetric with
    // `mergeManualEditTargetsFromSource` so a click id that no longer
    // resolves structurally on either side of the diff can still be
    // located via currentText/htmlHint. Without hints the full-deck
    // guard's target masking failed → the guard reported
    // "target unresolved" while the scoped merge could have recovered
    // via hint. Both paths must use the same signal set.
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("const hints = ids.map((id) => ({");
    expect(source).toContain("maskManualEditTargets(\n");
    expect(source).toContain("hints,\n");
  });

  it("does not replace a whole slide when element-scoped comment merge fails", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).not.toContain("function tryMergeSingleSlideScopedArtifact");
    expect(source).not.toContain("isScopedVisualStyleInstruction");
    expect(source).toContain("return { ok: false, code: 'deck_patch_merge_failed', reason: scoped.reason }");
    expect(source).toContain("function coerceDeckPatchToAllowedScope");
    expect(source).toContain("isElementPatchArtifactType");
    expect(source).toContain("graftPatchedTargetElementFromSource");
  });

  it("accepts a slide-level style-only diff when element merge said targets were unchanged", () => {
    // Behavioral coverage: merge-scoped-comment-style-fallback.test.ts.
    // This source-level pin ensures the narrow fallback code path
    // remains wired up. Users typing "회사 이름 눈에 잘 띄게 수정" get a
    // deck-patch that carries a slide-level <style> block; without
    // this branch the target's own outerHTML is byte-identical to
    // current source, mergeManualEditTargetsFromSource returns
    // "Selected targets were unchanged.", and the whole scoped merge
    // hard-rejects the model's legitimate style edit as
    // "선택한 댓글 대상 밖의 변경".
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("slideDiffIsStyleOnly");
    expect(source).toContain("extractSlideByIndex");
    expect(source).toContain("normalizeSlideStructure");
    expect(source).toContain("accepted slide-level fallback");
    expect(source).toContain("merged.reason === 'Selected targets were unchanged.'");
  });

  it("also accepts a slide-level swap when the target text survives the model rewrite", () => {
    // Second-tier fallback for cases where the model kept the
    // captured target text (attachment.currentText) somewhere in the
    // patched slide but dropped data-od-id / restructured the target
    // element (common when the model wraps existing text in a new
    // span for emphasis). Behavioral coverage:
    // merge-scoped-comment-style-fallback.test.ts.
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("targetTextPreservedInPatchedSlide");
    expect(source).toContain("collapseTargetTextForMatch");
    expect(source).toContain("'No matching targets found to merge.'");
    expect(source).toContain("fallback: kind");
  });

  it("retries applyDeckPatch without the scope guard when the model targeted a plausible sibling slide", () => {
    // Third-tier fallback (top layer): when the strict scope apply
    // rejects because the model's data-slide-index differs from the
    // captured attachment.slideIndex, we retry once WITHOUT the scope
    // guard and rely on mergeScoped to verify the model's slide via
    // targetTextPreservedInPatchedSlide. This unblocks the common
    // case where the deck bridge captured a stale active slide index
    // at click time. If the narrow merge produces no narrowing on
    // the relaxed retry, we still reject — that's the safety rail
    // against silently accepting a wholly-different slide.
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("scopeRejectionCanRetry");
    expect(source).toContain("outside attached comment scope");
    expect(source).toContain("is not allowed for scoped comment edits");
    expect(source).toContain("mergedScopeRelaxed");
    expect(source).toContain("scope-relaxed apply produced no narrowed match — rejecting");
  });

  it("waits for embed boot and retries stuck message loads on re-entry", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("waitForTeamverEmbedBoot");
    expect(source).toContain("MESSAGE_LOAD_STUCK_RETRY_MS");
    expect(source).toContain("setMessagesInitialized(true)");
    expect(source).toMatch(
      /loadConversationsWithRetry[\s\S]{0,200}await waitForTeamverEmbedBoot\(\)/,
    );
    expect(source).toMatch(
      /loadMessagesWithRetry[\s\S]{0,200}await waitForTeamverEmbedBoot\(\)/,
    );
  });
});

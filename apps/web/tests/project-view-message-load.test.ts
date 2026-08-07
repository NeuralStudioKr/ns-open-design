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

  it("replays terminal daemon success when no slide HTML was recovered during page leave", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const shouldReplayTerminalSucceededDeliverable =");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 2600);

    expect(block).toContain("slideOnlyMvp");
    expect(block).toContain("status.status === 'succeeded'");
    expect(block).toContain("!(message.producedFiles ?? []).some(isHtmlProjectFile)");
    expect(block).toContain("&& !shouldReplayTerminalSucceededDeliverable");
    expect(block).toContain("shouldReplayTerminalSucceededDeliverable\n          ||");
    expect(source).toContain("initialLastEventId: needsFullReplay ? null : message.lastRunEventId ?? null");
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
    expect(autoOpenBlock).toContain("selectAutoOpenProducedHtml(produced, { projectFiles: filesSnapshot })");
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

  it("injects selected deck template skillIds into daemon runs from project metadata", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("enrichChatSendMetaWithProjectDeckTemplate(meta, project.metadata)");
    expect(source).toContain("resolveDeckTemplateSkillId(project.metadata, meta)");
  });

  it("uses this turn's selected skillIds when composing API-mode prompts", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const signature = source.indexOf("skillIdOverride?: string | null");
    expect(signature).toBeGreaterThan(0);
    const composeBlock = source.slice(signature, signature + 5600);

    expect(composeBlock).toContain("const effectiveSkillId = skillIdOverride ?? project.skillId");
    expect(composeBlock).toContain("skills.find((s) => s.id === effectiveSkillId)");
    expect(composeBlock).toContain("await fetchDesignTemplate(effectiveSkillId)");
    expect(composeBlock).toContain("selectedDeckTemplateMetadata(project.metadata)");
    expect(composeBlock).toContain("primaryDeckSkillId");
    expect(composeBlock).toContain("pluginIdForLocalSkill !== primaryDeckSkillId");
    expect(composeBlock).toContain("secondaryScenarioSkillBody");
    expect(composeBlock).toContain("shouldWrapSelectedTemplate");
    expect(composeBlock).toContain("await fetchPluginLocalSkill(pluginIdForLocalSkill)");

    const callStart = source.indexOf("const effectiveSkillId = resolveDeckTemplateSkillId(project.metadata, meta)");
    expect(callStart).toBeGreaterThan(0);
    const callBlock = source.slice(callStart, callStart + 1200);
    expect(callBlock).toContain("resolveDeckTemplateSkillId(project.metadata, meta)");
    expect(callBlock).toContain("resolveScenarioPluginIdForLocalSkill(");
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
    // Bumped window from 7000 to 8000 when the auto-continue site
    // grew the `extractCommentAttachmentsForAutoContinue` scope
    // preservation block. Keep just enough head-room; the block
    // still asserts the same ordering contract, only over slightly
    // more source.
    const block = source.slice(start, start + 11000);

    expect(block).toContain("attachAutoContinueIncompleteOutputNotice(");
    expect(block).toContain("syncAutoContinueCountFromMessages(");
    expect(block).toContain("findIncompleteSlideAssistantForRecovery(");
    expect(block).toContain("pendingAutoContinueConversationIdRef.current === activeConversationId");
    expect(block).toContain("attemptEmergencySlideDeckRecovery(");
    expect(block).toContain("scopedCommentAttachmentCount:");
    expect(block).toContain("canFireAutoContinueForConversation(autoContinueCount, recoveryAutoContinueMax)");
    expect(block).toContain("formatAutoContinueIncompleteOutputNotice()");
    expect(block).toContain("formatProjectRunDeliverableMissingError()");
    expect(block).toContain("saveMessage(project.id, activeConversationId, updatedAssistant");
    expect(block).toContain("handleSendRef.current");
    // resolveAutoContinuePrompt replaced buildAutoContinueIncompleteOutputPrompt
    // in commit 7a80a8688 so the scoped comment auto-continue can route to a
    // dedicated element-patch retry instead of the full-deck rewrite prompt.
    expect(block).toContain("resolveAutoContinuePrompt");
    expect(block).toContain("renderCommentAttachmentContext(autoContinueCommentAttachments, {");
    expect(block).toContain("includeQueryComments: true");
    expect(block).toContain("scopedUserInstruction");
    expect(block).toContain("AUTO_CONTINUE_ENTRY_FROM");
    expect(block).toContain("const scheduledProjectId = project.id");
    expect(block).toContain("project.id !== scheduledProjectId");
  });

  it("auto-continues a background-recovered incomplete-output row once proxy streams drain", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const openedRecoveredHtml = await autoOpenRecoveredHtmlOutput(");
    const secondStart = source.indexOf("const openedRecoveredHtml = await autoOpenRecoveredHtmlOutput(", start + 1);
    expect(secondStart).toBeGreaterThan(0);
    const block = source.slice(secondStart, secondStart + 10500);

    expect(block).toContain("const proxyStillActive = matchingActiveStreams.length > 0");
    expect(block).toContain("!openedRecoveredHtml && !stillInflight && !proxyStillActive");
    expect(block).toContain("findIncompleteSlideAssistantForRecovery(");
    expect(block).toContain("restrictToMessageIds: trackedAssistantIds");
    expect(block).toContain("canFireAutoContinueForConversation(autoContinueCount, recoveryAutoContinueMax)");
    expect(block).toContain("formatAutoContinueIncompleteOutputNotice()");
    expect(block).toContain("saveMessage(project.id, recoveryConversationId, updatedAssistant");
    expect(block).toContain("finishRecovery()");
    expect(block).toContain("handleSendRef.current");
    // resolveAutoContinuePrompt replaced buildAutoContinueIncompleteOutputPrompt.
    // See sibling block above for the rationale (element-patch retry routing).
    expect(block).toContain("resolveAutoContinuePrompt");
    expect(block).toContain("renderCommentAttachmentContext(autoContinueCommentAttachments, {");
    expect(block).toContain("includeQueryComments: true");
    expect(block).toContain("scopedUserInstruction");
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

  it("sanitizes every HTML artifact persist once at the terminal write gate", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const persistStart = source.indexOf("const persistArtifact = useCallback");
    expect(persistStart).toBeGreaterThan(0);
    const persistBlock = source.slice(persistStart, persistStart + 22000);
    // Terminal scrub after salvage/repair/stabilize — not 2–4× early passes.
    expect(persistBlock).toContain("htmlBody = sanitizeManualEditFullSource(htmlBody)");
    expect(persistBlock).toContain("Single terminal scrub after salvage/repair/stabilize");
    // Must not reintroduce early full-source scrubs on recovered/scoped decks.
    expect(persistBlock).not.toContain(
      "html: sanitizeManualEditFullSource(recoveredHtml)",
    );
    expect(persistBlock).not.toContain(
      "html: sanitizeManualEditFullSource(artifactToPersist.html)",
    );
    expect(persistBlock).not.toMatch(
      /artifactType\s*===\s*['"]deck['"][\s\S]{0,240}sanitizeManualEditFullSource/,
    );
  });

  it("rejects scoped edits that sanitize down to a no-op instead of auto-continuing", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const persistStart = source.indexOf("const persistArtifact = useCallback");
    expect(persistStart).toBeGreaterThan(0);
    const persistBlock = source.slice(persistStart, persistStart + 24000);
    expect(persistBlock).toContain("htmlBodyBeforeSanitize");
    expect(persistBlock).toContain("scoped edit scrubbed to no-op");
    expect(persistBlock).toContain(
      "scoped comment edit only contained unsafe markup that was scrubbed",
    );
    expect(persistBlock).toContain("kind: 'rejected'");
  });

  it("reuses one disk HTML fetch and skips double visual-mark stabilize", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const persistStart = source.indexOf("const persistArtifact = useCallback");
    expect(persistStart).toBeGreaterThan(0);
    const persistBlock = source.slice(persistStart, persistStart + 28000);
    expect(persistBlock).toContain("const readDiskHtml = async");
    expect(persistBlock).toContain("diskHtmlForTarget");
    expect(persistBlock).toContain("currentHtml: diskHtmlForTarget");
    expect(persistBlock).toContain("visualMarksAlreadyStabilized");
    expect(persistBlock).toContain("kind: 'skipped-noop'");
    expect(persistBlock).toContain("!visualMarksAlreadyStabilized");
  });

  it("threads currentHtml into merge helpers and stabilizes element-patch visual marks", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const elementStart = source.indexOf("async function tryApplyElementPatchesAgainstCurrentDeck");
    expect(elementStart).toBeGreaterThan(0);
    const elementBlock = source.slice(elementStart, elementStart + 6500);
    expect(elementBlock).toContain("currentHtml?: string | null");
    // Element-patch folds through finalize (intent + stabilize + conditional scrub).
    expect(elementBlock).toContain("finalizeScopedDeckMergeHtml({");
    expect(elementBlock).toContain("alreadySanitized: true");
    expect(elementBlock).toContain("currentSlides: input.currentSlides");
    expect(elementBlock).toContain("mergedSlides");
    const deckStart = source.indexOf("async function tryApplyDeckPatchAgainstCurrentDeck");
    expect(deckStart).toBeGreaterThan(0);
    const deckBlock = source.slice(deckStart, deckStart + 4500);
    expect(deckBlock).toContain("currentHtml?: string | null");
    // Parse-fail fallbacks reuse persist sections (graft / template / element).
    expect(deckBlock).toContain("currentSlides: input.currentSlides");
    expect(deckBlock).toContain("graftVisualMarksIntoDeckHtml(currentHtml, input.commentAttachments, {");
    expect(source).not.toContain("function scopedCommentSlideIndexes(");
    const guardStart = source.indexOf("async function fullDeckEditStaysInsideCommentScope");
    expect(guardStart).toBeGreaterThan(0);
    const guardBlock = source.slice(guardStart, guardStart + 5500);
    expect(guardBlock).toContain("beforeSlides");
    expect(guardBlock).toContain("afterSlides");
    expect(guardBlock).toContain("diffDeckSlideIndexes(currentHtml, input.nextHtml, {");
    // Full-deck guard: one nextHtml parse → mask clone + intent.
    expect(guardBlock).toContain("const nextDoc = parseManualEditSource(input.nextHtml)");
    expect(guardBlock).toContain("nextDoc.cloneNode(true)");
    expect(guardBlock).toMatch(/parsedDoc:\s*nextDoc/);
    const salvageStart = source.indexOf("async function trySalvageScopedFullDeckRewrite");
    expect(salvageStart).toBeGreaterThan(0);
    const salvageBlock = source.slice(salvageStart, salvageStart + 2500);
    expect(salvageBlock).toContain("currentSlides?: readonly");
    expect(salvageBlock).toContain("patchedSlides");
    expect(salvageBlock).toContain("finalizeScopedDeckMergeHtml({");
    expect(salvageBlock).toContain("mergedSlides: scoped.sections");
    expect(source).toContain("beforeSlides: persistCommentSections");
    expect(source).toContain("currentSlides: persistCommentSections");
    expect(source).toContain("stabilizeVisualMarkDeckHtml(");
    expect(source).toMatch(
      /stabilizeVisualMarkDeckHtml\(\s*currentDeckHtml,\s*htmlBody,\s*persistCommentAttachments,\s*\{/,
    );
  });

  it("sanitizes FileViewer manual-edit saves before revision push", () => {
    const source = readSource("src/components/FileViewer.tsx");
    expect(source).toContain("contentToSave");
    expect(source).toContain("sanitize: isManualEditFullHtmlDocument(baseSource)");
    expect(source).toContain("captureTargetSnapshot: patch.kind === 'set-style'");
    expect(source).toContain("captureTargetSnapshots: true");
    expect(source).toContain("parseManualEditSource(baseSource)");
    expect(source).toContain("reconcileManualEditDraftAfterNoOpFlush");
    expect(source).toContain("One Document for all pending/selected targets");
    expect(source).toContain("One Document for snapshot + multi-select inspector merge");
    expect(source).toContain("contentUnchanged");
    expect(source).toContain("const contentToSave = result.source");
    expect(source).toContain("setSource(contentToSave)");
    expect(source).toContain("pinManualEditSavedSource(contentToSave)");
    expect(source).toContain("setRevisionContentCache(projectId, file.name, saved.revision.id, contentToSave)");
    expect(source).toContain("readManualEditTargetSnapshot");
    expect(source).toContain("manualEditHistoryConfirmCanSkipDiskFetch");
    expect(source).toContain("result.targetSnapshot");
  });

  it("batches element-patch apply and scoped comment mask on one Document", () => {
    const elementSource = readSource("src/artifacts/element-patch.ts");
    expect(elementSource).toContain("applyManualEditPatchMutation");
    expect(elementSource).toContain("parseManualEditSource(html)");
    expect(elementSource).toContain("serializeManualEditSource(doc, html)");
    expect(elementSource).toContain("sanitizeManualEditDocumentInPlace(doc)");
    const viewSource = readSource("src/components/ProjectView.tsx");
    expect(viewSource).toContain("maskManualEditTargetsOnDocument");
    expect(viewSource).toContain("parseManualEditSource(source)");
    expect(viewSource).toContain("attachmentMergeHint(attachment)");
    expect(viewSource).toContain("Visual / id-less comments have nothing to mask");
    expect(viewSource).toContain("patchHtmlAlreadySanitized");
    expect(viewSource).toContain("!patchHtmlAlreadySanitized");
    expect(viewSource).toContain("resolvePersistCommentScope");
    expect(viewSource).toContain("Group by deck path so one reconcileCommentScopeForPersist");
    expect(viewSource).toContain("finalizeScopedDeckMergeHtml");
    expect(viewSource).toContain("reconcileCommentScopeForPersist");
    expect(viewSource).toContain("patchHtmlAlreadySanitized = true");
    expect(viewSource).toContain(
      "Prefer the same one-pass persist-scope walk used elsewhere",
    );
    const deckSource = readSource("src/edit-mode/scoped-deck-patch.ts");
    expect(deckSource).toContain("sanitizeManualEditFullSource(repairedHtml)");
    expect(deckSource).toContain("extractDeckBodyContent");
    expect(deckSource).toContain("reconcileCommentAttachmentForDeck(deckHtml, attachment, parsedDoc");
    expect(deckSource).toContain("options?.sanitize === false");
    expect(deckSource).toContain("idBearingDocs");
    expect(deckSource).toContain("finalizeScopedDeckMergeHtml");
    expect(deckSource).toContain("sanitizeManualEditDocumentInPlace(parsedDoc)");
    expect(deckSource).toContain("listChangedDeckSlideIndexesFromSections");
    expect(deckSource).toContain("sameHtml");
    expect(deckSource).toContain("querySelector('.od-visual-mark-target')");
    expect(deckSource).toContain("One section materialization for all attachments");
    expect(deckSource).toContain("currentSlides: sections");
    expect(deckSource).toContain("One section materialization for text-verify + label conflict");
    expect(deckSource).toContain("sharedCurrentSlides");
    expect(deckSource).toContain("sharedPatchedSlides");
    expect(deckSource).toContain("patchedSlides: sharedPatchedSlides");
    expect(deckSource).toContain("mergedSlides: scoped.sections");
    expect(deckSource).toContain("sections: nextSlides");
    expect(deckSource).toContain("any comment scope");
    expect(deckSource).toContain("alreadySanitized?: boolean");
    expect(deckSource).toContain("mergedSlides?: readonly { outerHtml: string }[]");
    expect(deckSource).toContain("allPatchesVerified");
    expect(deckSource).toContain("refreshSectionsIfNeeded");
    expect(viewSource).toContain("persistCommentSections");
    expect(viewSource).toContain("currentSlides: persistCommentSections");
  });

  it("does not finalize an incomplete HTML artifact shell as a successful run", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const persistStart = source.indexOf("const persistArtifact = useCallback");
    expect(persistStart).toBeGreaterThan(0);
    // Bumped window from 5200 to 7000 chars when the deck-patch interceptor
    // (isDeckPatchArtifactType + tryApplyDeckPatchAgainstCurrentDeck) added a
    // ~1.5KB prelude at the top of persistArtifact. Bumped again to 14000
    // chars when the element-patch/deck-patch salvage helpers and the empty
    // deck-patch → auto-continue routing widened the prelude further, then
    // 16000 for the client-side artifact-regression pre-write guard, then
    // 18000 when the empty-element-patch → auto-continue routing
    // (without client-side fast-path salvage) landed, then 24000 for
    // readDiskHtml cache + visualMarksAlreadyStabilized + skipped-noop.
    const persistBlock = source.slice(persistStart, persistStart + 24000);

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
    expect(source).toContain("function routeScopedCommentPersistFailure");
    expect(source).toContain("kind: 'scope-rejected'");
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
    const autoOpenBlock = source.slice(autoOpenStart, autoOpenStart + 24000);

    expect(autoOpenBlock).toContain("const rawFinalText = streamedText || fullText || latestAssistantMsg.content || ''");
    expect(autoOpenBlock).toContain("const persistResult = await persistArtifact(");
    expect(autoOpenBlock).toContain("terminalArtifactPersistFailed = shouldFailRunForArtifactPersistResult(persistResult)");
    // deliverableError fallback now feeds the persist-result kind through
    // so the "결과물이 생성되지 않았습니다" banner in a copied bug report
    // includes `terminalPersistResultKind=<kind>` (or `no-artifact` for
    // null). Previously the fallback was a bare no-arg call and future
    // reports could not distinguish "model returned nothing" from
    // "persist returned skipped-incomplete" without browser console.
    expect(autoOpenBlock).toContain("formatProjectRunDeliverableMissingError({");
    expect(autoOpenBlock).toContain("kind: terminalPersistResult?.kind ?? null,");
    expect(autoOpenBlock).toContain("terminalPersistResult?.kind === 'rejected'");
    expect(autoOpenBlock).toContain("resolveTerminalArtifactToPersist(");
    expect(autoOpenBlock).toContain("rawFinalText,\n              artifactFromStandaloneHtml");
    expect(autoOpenBlock).toContain("finalText: rawFinalText");
    expect(autoOpenBlock).toContain("terminalPersistResult = persistResult");
    expect(autoOpenBlock).toContain("formatProjectArtifactSaveFailedError(terminalPersistResult.fileName");
    // deliverableError must surface the specific `rejected.reason` (e.g., the
    // "empty deck-patch artifact on unscoped run" copy) instead of the generic
    // "결과물이 생성되지 않았습니다" banner. Otherwise the user only sees the
    // catch-all after auto-continue exhausts, hiding the actual model glitch.
    expect(autoOpenBlock).toContain("terminalPersistResult?.kind === 'rejected' && terminalPersistResult.reason");
    expect(autoOpenBlock).toContain("formatProjectArtifactRejectedError(");
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
    expect(autoOpenBlock).toContain("attachAutoContinueIncompleteOutputNotice(");
    expect(autoOpenBlock).toContain("attachPersistedChatError(prev, deliverableError, deliverableErrorCode)");
    // resolveAutoContinuePrompt replaces the older direct
    // buildAutoContinueIncompleteOutputPrompt call so scoped comment
    // retries can route to an element-patch specific retry prompt
    // instead of forcing full deck regeneration (commit 7a80a8688).
    expect(autoOpenBlock).toContain("resolveAutoContinuePrompt");
    expect(autoOpenBlock).toContain("hydrateQueryContextCommentAttachments(");
    expect(autoOpenBlock).toContain("renderCommentAttachmentContext(autoContinueCommentAttachments");
    expect(autoOpenBlock).toContain("includeQueryComments: true");
    expect(autoOpenBlock).toContain("scopedCommentContext");
    expect(autoOpenBlock).toContain("scopedCommentAttachmentCount:");
    expect(autoOpenBlock).toContain("scopedUserInstruction");
    expect(autoOpenBlock).toContain("stripUserVisibleUserMessageText(");
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
    const handleSendBlock = source.slice(handleSendStart, handleSendStart + 9600);
    expect(handleSendBlock).toContain("isAutoContinueIncompleteOutputPrompt(prompt)");
    expect(handleSendBlock).toContain("conversationAutoContinueCountRef.current.set(runConversationId, 0)");
    expect(handleSendBlock).toContain("scopedCommentAttachments.length > 0");
    expect(handleSendBlock).toContain("chatAttachmentForProjectFile(existingDeck)");
    // Comment-edit path must plumb the deck-patch nudge, while keeping the
    // current deck source attached. Prior assistant artifact history is not
    // reliable after refresh/queue/background reattach; without deck.html the
    // model can claim the selected text does not exist.
    expect(handleSendBlock).toContain("promptWithSlideCommentEditPatchInstruction(");
    expect(handleSendBlock).toContain("commentAttachments: scopedCommentAttachments");
    expect(handleSendBlock).not.toContain("skipDeckHtml: slideOnlyMvp && scopedCommentAttachments.length > 0");
  });

  it("preserves comment scope on manual Continue and Retry (regression: scoped edit lost scope on user-initiated resume)", () => {
    // Bug (2026-07-29 round-review): the three auto-continue timers
    // were fixed to pass extractCommentAttachmentsForAutoContinue(...)
    // as the third handleSend arg, but the manual affordance
    // handleResumeRun still hardcoded `[]`. A user who clicked
    // "Continue" after a scoped comment edit failed would see the
    // retry silently drop scope — deck-patch / full-deck guards fell
    // silent again and the model was free to rewrite the whole deck.
    //
    // Pin the source-level shape of both entry points: manual
    // Continue must feed the originating user turn's attachments back
    // through the sendNow-shaped handleSend call. Retry is handled by
    // the retryTarget spread in handleSend itself (the userMsg
    // preserves commentAttachments unless explicitly overridden), so
    // we only source-pin the Continue path.
    const source = readSource("src/components/ProjectView.tsx");

    const resumeStart = source.indexOf("const handleResumeRun = useCallback");
    expect(resumeStart).toBeGreaterThan(0);
    const resumeBlock = source.slice(resumeStart, resumeStart + 800);
    expect(resumeBlock).toContain("extractCommentAttachmentsForAutoContinue(");
    expect(resumeBlock).toContain("findPrecedingUserMessage(messagesRef.current, assistantMessage.id)");
    expect(resumeBlock).toContain("runCommentAttachmentsRef.current");
    expect(resumeBlock).toContain("RESUME_CONTINUE_PROMPT");
    expect(resumeBlock).toContain("entryFrom: 'resume_continue'");
    // Do not pass an empty third arg — that was the regression shape.
    expect(resumeBlock).not.toMatch(/handleSend\(RESUME_CONTINUE_PROMPT, \[\], \[\],/);
  });

  it("routes empty deck-patch and salvages misrouted deck/element-patch bodies at the persist gate", () => {
    // Bug (2026-07-29 round-review): only ONE direction of the
    // artifact-type salvage was implemented — element-patch bodies
    // that looked like deck-patch were re-routed, but deck-patch
    // bodies that looked like element-patch were not, so a model
    // mis-picking the wrapper still yielded a scary "선택 대상 밖
    // 변경" banner. Also, empty deck-patch bodies were rejected
    // immediately instead of being routed to auto-continue like their
    // empty element-patch siblings, so a scoped run whose model
    // returned <artifact type="deck-patch"></artifact> could not
    // recover automatically.
    //
    // Pin both routings at the source level so a future refactor
    // cannot silently drop them.
    const source = readSource("src/components/ProjectView.tsx");

    // Predicate helpers must exist and stay exported (their tests
    // live in apps/web/tests/artifact-routing-salvage.test.ts).
    expect(source).toContain("export function elementPatchBodyLooksLikeDeckPatch");
    expect(source).toContain("export function deckPatchBodyLooksLikeElementPatch");
    expect(source).toContain("export function isElementPatchEmptyBody");
    expect(source).toContain("export function isDeckPatchEmptyBody");

    // deck-patch → element-patch salvage: parse failed + body looks
    // like element-patch → fall back to element-patch pipeline. This
    // is the mirror of the existing element-patch → deck-patch route.
    const deckPatchStart = source.indexOf("async function tryApplyDeckPatchAgainstCurrentDeck");
    expect(deckPatchStart).toBeGreaterThan(0);
    const deckPatchBlock = source.slice(deckPatchStart, deckPatchStart + 2400);
    expect(deckPatchBlock).toContain("deckPatchBodyLooksLikeElementPatch(input.patchBody)");
    expect(deckPatchBlock).toContain("[deck-patch] body looks like element-patch — falling back");
    expect(deckPatchBlock).toContain("tryApplyElementPatchesAgainstCurrentDeck({");

    // Empty deck-patch routing: scoped run → skipped-incomplete;
    // unscoped run → rejected with a specific banner. Mirrors the
    // empty element-patch policy.
    const persistStart = source.indexOf("const persistArtifact = useCallback");
    expect(persistStart).toBeGreaterThan(0);
    const persistBlock = source.slice(persistStart, persistStart + 14000);
    expect(persistBlock).toContain(
      "isDeckPatchEmptyBody(art.html ?? '', merged.reason)",
    );
    expect(persistBlock).toContain(
      "[deck-patch] routing scoped empty deck-patch to auto-continue",
    );
    expect(persistBlock).toContain(
      "[deck-patch] rejecting unscoped empty deck-patch",
    );
    expect(persistBlock).toContain(
      "The model emitted an empty deck-patch artifact on a run without a scoped comment target.",
    );
  });

  it("routes scoped empty element-patch failures to auto-continue without client-side fast-path salvage", () => {
    // Bug (2026-07-29): scoped comment edits that produced empty
    // <artifact type="element-patch"> bodies exhausted auto-continue and
    // surfaced "결과물이 생성되지 않았습니다". The durable fix is richer model
    // context (comment in scope block, concrete patch template on first turn)
    // plus hydrated scoped auto-continue — not a client-side regex fast-path.
    const source = readSource("src/components/ProjectView.tsx");

    expect(source).not.toContain("tryApplyCommentEditFastPathAgainstCurrentDeck");
    expect(source).not.toContain("buildManualEditCommentFastPath");
    expect(source).not.toContain("salvagedByFastPath");
    expect(source).not.toContain("[element-patch] applied scoped comment fast-path");
    expect(source).not.toContain("[deck-patch] applied scoped comment fast-path");
    expect(source).not.toContain("[teamver] terminal-auto-open scoped comment fast-path");

    const fastPathSource = readSource("src/components/manualEditCommentFastPath.ts");
    expect(fastPathSource).toContain("return null");

    expect(source).toContain("[element-patch] routing scoped edit to auto-continue");
    expect(source).toContain("commentAttachments: scopedCommentAttachments");
    expect(source).toContain("buildConcreteElementPatchTemplate(autoContinueCommentAttachments)");
    expect(source).toContain("hydrateQueryContextCommentAttachments(");
    expect(source).toContain("shouldRouteScopedCommentEditToAutoContinue");
    const persistRoutingSource = readSource("src/edit-mode/scoped-comment-persist.ts");
    expect(persistRoutingSource).toContain("outside attached comment scope");
    expect(persistRoutingSource).toContain("No valid element targets in attached comment scope.");
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
    const patchSource = readSource("src/edit-mode/scoped-deck-patch.ts");
    const viewSource = readSource("src/components/ProjectView.tsx");

    expect(patchSource).toContain("function domSelectorCommentElementId");
    expect(patchSource).toContain("function selectorCommentElementIds");
    expect(patchSource).toContain("'data-od-id', 'data-screen-label', 'data-od-source-path', 'data-od-runtime-id'");
    expect(patchSource).toContain("...selectorCommentElementIds(attachment.selector)");
    expect(patchSource).toContain("return `dom:${trimmed}`");
    expect(patchSource).toContain("domSelectorCommentElementId(attachment.selector)");
    expect(patchSource).toContain("...selectorCommentElementIds(member.selector)");
    expect(patchSource).toContain("domSelectorCommentElementId(member.selector)");

    const guardStart = viewSource.indexOf("async function fullDeckEditStaysInsideCommentScope");
    expect(guardStart).toBeGreaterThan(0);
    const guardBlock = viewSource.slice(guardStart, guardStart + 3600);
    expect(guardBlock).toContain("const hasElementScopedComment");
    expect(guardBlock).toContain("const targetUnresolved");
    expect(guardBlock).toContain("beforeMasked.maskedCount !== afterMasked.maskedCount");
    expect(guardBlock).toContain("code: 'full_deck_comment_target_unresolved'");
    expect(guardBlock).toContain("scoped full-deck guard rejected unresolved comment target");

    expect(patchSource).toContain("mergeManualEditTargetsFromSource");
    expect(patchSource).toContain("function mergeScopedCommentTargetsFromPatchedDeck");
    expect(viewSource).toContain("commentAttachments: persistCommentAttachments");
    expect(viewSource).toContain("instructionText: runVisiblePromptRef.current");
    expect(patchSource).toContain("scopedCommentInstructionText");
    expect(viewSource).toContain("const scopedCommentAttachments = filterUsableCommentAttachments(hydratedCommentAttachments)");
    expect(viewSource).toContain("commentAttachmentCount: scopedCommentAttachments.length");
    expect(viewSource).toContain("commentAttachments: scopedCommentAttachments");
  });

  it("hydrates missing deck comment slide indexes before scoped edit prompts", () => {
    const viewSource = readSource("src/components/ProjectView.tsx");
    const patchSource = readSource("src/edit-mode/scoped-deck-patch.ts");
    expect(viewSource).toContain("hydrateDeckCommentSlideIndexes");
    expect(viewSource).toContain("reconcileCommentAttachmentForDeck");
    expect(viewSource).toContain("resolvePersistCommentAttachments");
    expect(patchSource).toContain(":nth-of-type");
    expect(viewSource).toContain("const scopedCommentAttachments = filterUsableCommentAttachments(hydratedCommentAttachments)");
    expect(viewSource).not.toContain(".filter((attachment) => !slideOnlyMvp || hasValidDeckSlideIndex(attachment))");
  });

  it("recovers deck comment slide index for single-slide decks and DOM-selector elementIds", () => {
    const patchSource = readSource("src/edit-mode/scoped-deck-patch.ts");
    expect(patchSource).toContain("if (sections.length === 1) return 0");
    expect(patchSource).toContain("elementId.startsWith('dom:')");
    expect(patchSource).toContain("body\\s*>\\s*(?:[a-z0-9-]+\\s*>\\s*)*section:nth-of-type");
  });

  it("returns undefined from scopedCommentSlideIndexes when no attachment carries a valid slide index", () => {
    const patchSource = readSource("src/edit-mode/scoped-deck-patch.ts");
    expect(patchSource).toContain("const unique = [...new Set(indexes)]");
    expect(patchSource).toContain("return unique.length > 0 ? unique : undefined");
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
    const viewSource = readSource("src/components/ProjectView.tsx");
    const patchSource = readSource("src/edit-mode/scoped-deck-patch.ts");
    expect(viewSource).not.toContain("function tryMergeSingleSlideScopedArtifact");
    expect(viewSource).not.toContain("isScopedVisualStyleInstruction");
    expect(patchSource).toContain("return { ok: false, reason: lastReason }");
    expect(patchSource).toContain("function coerceDeckPatchToAllowedScope");
    expect(viewSource).toContain("isElementPatchArtifactType");
    expect(patchSource).toContain("graftPatchedTargetElementFromSource");
  });

  it("accepts a slide-level style-only diff when element merge said targets were unchanged", () => {
    const patchSource = readSource("src/edit-mode/scoped-deck-patch.ts");
    expect(patchSource).toContain("slideDiffIsStyleOnly");
    expect(patchSource).toContain("extractSlideByIndex");
    expect(patchSource).toContain("normalizeSlideStructure");
    expect(patchSource).toContain("accepted slide-level fallback");
    expect(patchSource).toContain("merged.reason === 'Selected targets were unchanged.'");
  });

  it("also accepts a slide-level swap when the target text survives the model rewrite", () => {
    const patchSource = readSource("src/edit-mode/scoped-deck-patch.ts");
    expect(patchSource).toContain("targetTextPreservedInPatchedSlide");
    expect(patchSource).toContain("collapseTargetTextForMatch");
    expect(patchSource).toContain("'No matching targets found to merge.'");
    expect(patchSource).toContain("fallback: kind");
  });

  it("retries applyDeckPatch without the scope guard when the model targeted a plausible sibling slide", () => {
    const patchSource = readSource("src/edit-mode/scoped-deck-patch.ts");
    expect(patchSource).toContain("scopeRejectionCanRetry");
    expect(patchSource).toContain("outside attached comment scope");
    expect(patchSource).toContain("is not allowed for scoped comment edits");
    expect(patchSource).toContain("targets slideIndex \\d+ but deck has \\d+ slides");
    expect(patchSource).toContain("mergedScopeRelaxed");
    expect(patchSource).toContain("scope-relaxed apply produced no narrowed match — rejecting");
    expect(patchSource).toContain("code: 'deck_patch_merge_failed'");
  });

  it("uses every identity anchor the attachment carries for the text-preserved fallback", () => {
    const patchSource = readSource("src/edit-mode/scoped-deck-patch.ts");
    expect(patchSource).toContain("extractTargetIdentityAnchors");
    expect(patchSource).toContain("podMembers");
    expect(patchSource).toContain("collapseTargetTextForMatch");
    expect(patchSource).toContain("candidate.length < 2");
  });

  it("preserves comment attachments on auto-continue retries so scope guards stay engaged", () => {
    // Bug (2026-07-29): auto-continue passed `[]` for the third
    // `commentAttachments` arg on all three call sites. That
    // stripped the scope block from `<attached-preview-comments>`
    // AND left `scopedCommentSlideIndexes` returning `undefined` on
    // the retry, so the deck-patch / full-deck scope guards fell
    // silent. A model that had failed a scoped edit on the
    // original turn was free to rewrite the whole deck on retry —
    // the reported 8-slide → 1-slide regression that showed up as
    // a stub-guard warning after a scoped comment turn.
    //
    // Fix: pipe the originating user message's `commentAttachments`
    // (or `runCommentAttachmentsRef` fallback) through to the retry
    // so scope stays intact.
    const source = readSource("src/components/ProjectView.tsx");
    const scopeSource = readSource("src/runtime/auto-continue-comment-scope.ts");
    expect(scopeSource).toContain("export function extractCommentAttachmentsForAutoContinue");
    expect(scopeSource).toContain("export function findPrecedingUserMessage");
    // Each of the three auto-continue call sites must now pass the
    // preserved attachments instead of the historical `[]`. Assert
    // by counting call-site invocations of the helper — if any
    // regressed back to the `[]` shape the count would drop.
    const helperCalls = (source.match(/extractCommentAttachmentsForAutoContinue\(/g) ?? []).length;
    expect(helperCalls).toBeGreaterThanOrEqual(3);
  });

  it("only routes empty element-patch to auto-continue for scoped comment runs", () => {
    // Bug (2026-07-29): the previous 'empty element-patch → skipped-incomplete'
    // routing fired for BOTH scoped and unscoped runs. On a fresh
    // deck project where the model mistakenly picked element-patch,
    // the retry loop couldn't converge (element-patch is the wrong
    // contract for greenfield generation), so we burned 3
    // auto-continue attempts and eventually surfaced a misleading
    // 'incomplete_output' banner instead of the actual reason.
    //
    // Fix: gate the auto-continue routing on
    //   persistCommentAttachments.length > 0
    // For unscoped empty-artifact responses, return `rejected` with a
    // clear message so the user sees the actual failure without a
    // 15-second retry-timeout wait.
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("const runIsScoped = persistCommentAttachments.length > 0");
    expect(source).toContain("runIsScoped &&");
    expect(source).toContain("routing scoped edit to auto-continue");
    expect(source).toContain("rejecting unscoped empty artifact");
    // Rejected path must carry a specific reason so the banner
    // clearly points at the model failure. Guard against a future
    // refactor that swaps the message for the empty string.
    expect(source).toContain(
      "The model emitted an empty element-patch artifact on a run without a scoped comment target.",
    );
  });

  it("skips emergency deck salvage for scoped preview-comment edits", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("scopedCommentAttachmentCount:");
    expect(source).toContain("terminalAutoContinueCommentAttachments");
    expect(source).toContain("recoveryCommentAttachments");
  });

  it("routes scoped full-deck rewrite diff failures to auto-continue", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("function routeScopedCommentPersistFailure");
    expect(source).toContain("shouldRouteScopedCommentEditToAutoContinue");
    expect(source).toContain("salvaged scoped full-deck rewrite via narrow merge");
    expect(source).toContain("routing scoped full-deck rewrite to auto-continue");
  });

  it("salvages empty element-patch bodies from assistant source text before failing", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("resolveElementPatchBodyForApply");
    expect(source).toContain("sourceText");
    expect(source).toContain("salvaged patch body from assistant output");
    expect(source).toContain("buildConcreteElementPatchTemplate");
  });

  it("routes empty element-patch responses through auto-continue instead of the scope banner", () => {
    // Bug (2026-07-29): the model emitted
    //   <artifact type="element-patch" identifier="deck"></artifact>
    // with an empty body. `parseElementPatch` returned
    // 'empty element-patch body', bubbled up as
    // `deck_patch_parse_failed`, and the caller wrapped that as
    // `scope-rejected` → user saw the misleading "선택 대상 밖 변경"
    // banner. persistArtifact now recognizes the empty-body /
    // no-<patch>-blocks sentinels and returns `skipped-incomplete`
    // so the standard auto-continue path fires. Behavioural coverage:
    // element-patch-empty-fallback.test.ts.
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("isElementPatchEmptyBody");
    expect(source).toContain("'empty element-patch body'");
    expect(source).toContain("'no <patch> blocks in element-patch body'");
    expect(source).toContain("routing to auto-continue");
    // The salvage path also kicks in when the wrapper contains
    // deck-patch-shaped content — we route through
    // tryApplyDeckPatchAgainstCurrentDeck rather than rejecting.
    expect(source).toContain("elementPatchBodyLooksLikeDeckPatch");
    expect(source).toContain("body looks like deck-patch — falling back");
  });

  it("surfaces the underlying scope-rejected reason in the user-facing banner", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("formatProjectArtifactCommentScopeRejectedError(");
    expect(source).toContain("[terminalPersistResult.code, terminalPersistResult.reason]");
  });

  it("blocks tiny placeholder artifacts before they overwrite an existing deck", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("function findClientArtifactRegression");
    expect(source).toContain("ARTIFACT_REGRESSION_MIN_PRIOR_BYTES");
    expect(source).toContain("ARTIFACT_REGRESSION_MIN_RATIO");
    expect(source).toContain("blocked placeholder artifact regression before save");
    expect(source).toContain("kind: 'artifact-regression'");
    expect(source).toContain("? 'artifact_regression'");
  });

  it("skips low-substance deck artifacts before marking slide generation complete", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("isLowSubstanceSlideDeckArtifact");
    expect(source).toContain("normalizedArtifactType === 'deck'");
    expect(source).toContain("reason: 'low-substance deck artifact'");
    expect(source).toContain("kind: 'skipped-incomplete'");
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

  it("keeps chat-visible errors on the live streaming buffer and assistant events", () => {
    const source = readSource("src/components/ProjectView.tsx");
    expect(source).toContain("const surfaceChatVisibleError = useCallback(");
    expect(source).toContain("attachPersistedChatError(m, detail, code)");
    expect(source).toContain("liveAssistantMutatorRef");
    expect(source).toContain("live.apply((prev) => attachPersistedChatError(prev, detail, code))");
    expect(source).toContain("liveAssistantMutatorRef.current = {\n        assistantId,");
    // Hard reload clears ephemeral React error — durable path must remain.
    const loadStart = source.indexOf("const loadMessagesWithRetry = async () =>");
    expect(loadStart).toBeGreaterThan(0);
    expect(source.slice(loadStart, loadStart + 2200)).toContain("setError(null)");
  });

  it("delays soft-refresh on failed runs so durable status:error can win merge races", () => {
    const source = readSource("src/components/ProjectView.tsx");
    // Main chat path and reattach path both delay failed soft-refresh.
    expect(source).toMatch(
      /runStatus === 'failed'[\s\S]{0,200}window\.setTimeout\(\(\) => \{[\s\S]{0,120}scheduleConversationMessageRefresh/,
    );
    expect(source).toContain("applyTerminalRunStatusToAssistant");
    expect(source).toContain("attachPersistedChatError(prev, detail, errorCode)");
    expect(source).toContain("attachPersistedChatError(prev, msg, errorCode)");
  });
});

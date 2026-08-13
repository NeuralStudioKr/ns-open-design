import { useCallback, useEffect, useId, useMemo, useRef, useState, useLayoutEffect, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { devLog } from '../lib/devLog';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { createArtifactManifest, inferLegacyManifest } from '../artifacts/manifest';
import type { ArtifactManifest } from '../artifacts/types';
import { resolveHtmlPointerArtifactTarget } from '../artifacts/pointer';
import {
  isIncompleteHtmlDocumentShell,
  isLowSubstanceSlideDeckArtifact,
  validateHtmlArtifact,
} from '../artifacts/validate';
import {
  diffDeckSlideIndexes,
  extractDeckBodyContent,
  extractTopLevelSlideSections,
  isDeckPatchArtifactType,
  parseDeckPatchWithSalvage,
} from '../artifacts/deck-patch';
import {
  applyElementPatches,
  isElementPatchArtifactType,
  parseElementPatch,
  resolveElementPatchBodyForApply,
  type ElementPatchTargetHint,
} from '../artifacts/element-patch';
import {
  applyScopedDeckPatchToHtml,
  attachmentMergeHint,
  inferSlideIndexFromDeckHtml,
  mergeScopedCommentTargetsFromPatchedDeck,
  finalizeScopedDeckMergeHtml,
  reconcileCommentScopeForPersist,
  resolveElementPatchAllowedSlideIndexes,
  scopedCommentElementIds,
  graftVisualMarksIntoDeckHtml,
  stabilizeVisualMarkDeckHtml,
  hasElementScopedCommentAttachments,
  isDrawnVisualMarkAttachment,
  shouldClientGraftVisualMarkWithoutAi,
  isVisualCommentAttachment,
  scopedCommentSlideIndexesFromAttachments,
  type DeckPatchMergeResult,
  type ScopedDeckPersistFailureCode,
} from '../edit-mode/scoped-deck-patch';

export {
  applyScopedDeckPatchToHtml,
  extractSlideByIndex,
  inferSlideIndexFromDeckHtml,
  mergeScopedCommentTargetsFromPatchedDeck,
  resolveScopedCommentSlideCandidates,
  slideDiffIsStyleOnly,
  targetTextPreservedInPatchedSlide,
} from '../edit-mode/scoped-deck-patch';
import { validateCommentEditIntentRespected } from '../edit-mode/comment-edit-intent';
import { shouldRouteScopedCommentEditToAutoContinue } from '../edit-mode/scoped-comment-persist';
import {
  clearPendingArtifactWrite,
  clearProjectPendingArtifactWrites,
  listPendingArtifactWrites,
  peekLatestPendingArtifactWrite,
  stashPendingArtifactWrite,
} from '../artifacts/pendingWriteRecovery';
import { isClosedSoftSalvageDeckHtml } from '../artifacts/deck-html-content';
import {
  recoverBestHtmlDocumentFromText,
  recoverHtmlArtifactFromPrecedingDocument,
  salvageTruncatedHtmlDocument,
} from '../artifacts/recover';
import {
  artifactPreviewFromInFlightContent,
  stripAllClosedArtifacts,
} from '../artifacts/strip';
import {
  EMERGENCY_DECK_FALLBACK_STATUS_CODE,
  looksLikeSlideOutline,
} from '../artifacts/emergency-deck';
import { createArtifactParser } from '../artifacts/parser';
import {
  findFirstQuestionForm,
  isQuestionFormTurnContent,
  parsePartialQuestionForm,
  type QuestionForm,
} from '../artifacts/question-form';

export { isQuestionFormTurnContent } from '../artifacts/question-form';
import { parseSubmittedAnswers } from './QuestionForm';
import {
  questionFormForSlideOnlyDisplay,
  resolveSlideOnlyQuestionFormFromContent,
} from '../teamver/branding/embedSlideOnlyQuestionForm';
import { useI18n } from '../i18n';
import { useTeamverT } from '../teamver/branding/useTeamverT';
import { streamMessage } from '../providers/anthropic';
import { EXPLICIT_PROXY_STOP_REASON, requestProxyAbort } from '../providers/proxyAbort';
import {
  ActiveByokProxyAuthTransientError,
  BYOK_PROXY_AUTH_BACKOFF_MS,
  listActiveByokProxyStreams,
  shouldSkipByokProxyActivePoll,
} from '../providers/byokProxyActive';
import {
  fetchChatRunStatus,
  fetchVelaLoginStatus,
  listActiveChatRuns,
  listProjectRuns,
  reattachDaemonRun,
  reportChatRunFeedback,
  requestDaemonRunCancel,
  streamViaDaemon,
} from '../providers/daemon';
import { fetchElevenLabsVoiceOptions } from '../providers/elevenlabs-voices';
import { normalizeCustomReason } from '@open-design/contracts/analytics';
import {
  deletePreviewComment,
  fetchConnectorStatuses,
  fetchPreviewComments,
  fetchDesignSystem,
  fetchDesignTemplate,
  fetchProjectDesignSystemPackageAudit,
  fetchLiveArtifacts,
  fetchProjectFiles,
  fetchProjectFileText,
  fetchSkill,
  patchPreviewCommentStatus,
  projectRawUrl,
  pushProjectFileRevision,
  restoreProjectFileRevision,
  uploadProjectFiles,
  upsertPreviewComment,
  writeProjectTextFileDetailed,
  deleteProjectFile,
} from '../providers/registry';
import { useProjectFileEvents, type ProjectEvent } from '../providers/project-events';
import { useCoalescedCallback } from '../hooks/useCoalescedCallback';
import {
  composeSystemPrompt,
  renderPluginBlock,
  type AudioVoiceOption,
  type MemorySystemPromptResponse,
  type ResearchOptions,
} from '@open-design/contracts';
import { repairArtifactDocumentHeadIfNeeded } from '../runtime/artifact-document-head';
import { embedUiLabel } from '../teamver/embedUiLabels';
import {
  deriveAgentRevisionLabel,
  mapArtifactTypeToRevisionSource,
} from '../runtime/file-revision-agent';
import {
  getActiveRevisionSequence,
  setActiveRevisionSequence,
} from '../runtime/revision-active-sequence';
import { setRevisionContentCache } from '../runtime/revision-content-cache';
import {
  emitRevisionPush,
  emitRevisionUndo,
} from '../runtime/revision-analytics';
import {
  enrichChatSendMetaWithProjectDeckTemplate,
  resolveDeckTemplateSkillId,
  resolveScenarioPluginIdForLocalSkill,
  selectedDeckTemplateMetadata,
  selectedDeckTemplateTitleStub,
  wrapSelectedDeckTemplateSkillBody,
} from '../runtime/selected-deck-template';
import { CANVAS_CREATE_SLIDES_PLUGIN_ID } from '../teamver/canvasSlideLaunch';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  projectKindToTracking,
} from '@open-design/contracts/analytics';
import type {
  TrackingArtifactKind,
  TrackingDesignSystemApplyTargetKind,
  TrackingDesignSystemOrigin,
  TrackingDesignSystemStatusValue,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackArtifactHeaderClick,
  trackComposerBarClick,
  trackDesignSystemApplyResult,
  trackPageView,
} from '../analytics/events';
import {
  clearOnboardingSessionId,
  peekOnboardingSessionId,
} from '../analytics/onboarding-session';
import { navigate } from '../router';
import { agentDisplayName, agentModelDisplayName } from '../utils/agentLabels';
import { isMacPlatform } from '../utils/platform';
import {
  canAutoRenameProjectFromPrompt,
  deriveProjectNameForCreate,
  extractUserPromptForNaming,
  summarizeProjectNameFromUserTurn,
} from '../utils/projectName';
import {
  apiProtocolAgentId,
  apiProtocolModelLabel,
  usesAnthropicProxy,
} from '../utils/apiProtocol';
import { cleanupByokRetryArtifacts } from '../runtime/byok-retry-artifact-gc';
import { playSound, showCompletionNotification } from '../utils/notifications';
import { randomUUID } from '../utils/uuid';
import {
  excludeAttachmentsBackedByVisualScreenshots,
  projectFilePathBasename,
  projectFilePathsReferToSameFile,
  projectFileResolvedPath,
} from '../utils/projectFilePaths';
import { reconcileProjectRawFileMissingCache } from '../utils/projectFileFetchCache';
import {
  resolveCanonicalProjectImagePath,
  rewriteAttachmentImageSrcs,
} from '../utils/rewriteAttachmentImageSrcs';
import { healDiskHtmlAttachmentImageSrcs } from '../utils/healDiskHtmlAttachmentImageSrcs';
import { mergeImageMentionAttachments } from '../utils/recoverChatAttachmentsFromMentions';
import {
  stageReadableUploadedAttachments,
  uploadedImagesReadableOnDisk,
} from '../utils/uploadedImagesReadable';
import { DEFAULT_NOTIFICATIONS } from '../state/config';
import type { TodoItem } from '../runtime/todos';
import {
  appendErrorStatusEvent,
  appendWarningStatusEvent,
  attachPersistedChatError,
  attachAutoContinueIncompleteOutputNotice,
  clearDurableDeliverableErrorsAfterRecovery,
  messageHasPersistedChatError,
  messageHasVisibleProse,
} from '../runtime/chat-events';
import {
  AUTO_CONTINUE_ENTRY_FROM,
  AUTO_CONTINUE_MAX_PER_CONVERSATION,
  RESUME_CONTINUE_PROMPT,
  extractAutoContinueContextFromAssistant,
  isAutoContinueIncompleteOutputPrompt,
  isLiveLocalStreamBlockingAutoContinue,
  resolveAutoContinueMaxAttempts,
  resolveAutoContinuePrompt,
  rollbackAutoContinueCount,
  shouldAutoContinueForIncompleteOutput,
} from '../runtime/resume';
import { COMPACT_DECK_SLIDE_COUNT_GUIDANCE } from '../runtime/deckGuidance';
import {
  extractCommentAttachmentsForAutoContinue,
  findPrecedingUserMessage,
} from '../runtime/auto-continue-comment-scope';
import {
  attemptEmergencySlideDeckRecovery,
  attemptFinalOutlineDeckFallback,
  canFireAutoContinueForConversation,
  collectSlideReferencePathsFromMessages,
  extractRequestedSlideCountHintFromMessages,
  findIncompleteSlideAssistantForRecovery,
  isEmergencyArtifactPersistSuccess,
  OUTLINE_DECK_FALLBACK_STATUS_CODE,
  resolveSlideProducedHtmlToOpen,
  syncAutoContinueCountFromMessages,
  verifySlideProducedHtmlDeliverable,
} from '../runtime/slide-deliverable-recovery';
import { tryPersistClientVisualMarksOnSend } from '../runtime/client-visual-mark-persist';
import { resolveSlideTurnKindForSend } from '../runtime/chat-message-render';
import {
  buildDesignSystemPackageAuditRepairPrompt,
  summarizeDesignSystemPackageAudit,
} from '../runtime/design-system-package-audit';
import { isLiveArtifactTabId, liveArtifactTabId } from '../types';
import {
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE,
  isDesignSystemWorkspacePrompt,
} from '../design-system-auto-prompt';
import {
  createConversation,
  deleteConversation as deleteConversationApi,
  fetchAppliedPluginSnapshot,
  getTemplate,
  installGeneratedPluginFolder,
  listConversations,
  listMessages,
  loadTabs,
  patchConversation,
  patchProject,
  saveMessage,
  startGeneratedPluginShareTask,
  cacheTabsLocally,
  persistTabsToDaemonNow,
  listPlugins,
  type SaveMessageOptions,
  waitGeneratedPluginShareTask,
} from '../state/projects';
import {
  createMessagePersistScheduler,
  resolveMessagePersistThrottleMs,
} from '../state/messagePersistSchedule';
import type { AppliedPluginSnapshot, ChatAnalyticsEntryFrom, ChatSessionMode, FileRevision, InstalledPluginRecord, WorkspaceContextItem } from '@open-design/contracts';
import type {
  AgentEvent,
  AgentInfo,
  AppConfig,
  Artifact,
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  ChatMessageFeedbackChange,
  Conversation,
  DesignSystemSummary,
  OpenTabsState,
  Project,
  ProjectMetadata,
  PreviewComment,
  PreviewCommentAttachment,
  PreviewCommentTarget,
  ProjectFile,
  ProjectTemplate,
  LiveArtifactEventItem,
  LiveArtifactSummary,
  SkillSummary,
} from '../types';
import { historyWithApiAttachmentContext } from '../api-attachment-context';
import {
  fetchApiWebFetchContexts,
  historyWithApiWebFetchContext,
} from '../api-web-fetch-context';
import {
  buildConcreteDeckPatchTemplateForVisualMarks,
  buildConcretePatchTemplatesForCommentAttachments,
  chatAttachmentsFromPreviewCommentFiles,
  commentsToAttachments,
  dedupeCommentAttachments,
  elementPatchCoerceHintsFromCommentAttachments,
  filterUsableCommentAttachments,
  hasUserTypedVisualAnnotationRequest,
  historyWithCommentAttachmentContext,
  hydrateQueryContextCommentAttachments,
  isScreenshotOnlyVisualCommentTarget,
  isVisualMarkPlacementOnlyCommentAttachments,
  mergeAttachedComments,
  mergePreviewCommentAttachments,
  messageContentWithCommentAttachments,
  queuedSlideNavTarget,
  reconcileUserCommentAttachments,
  removeAttachedComment,
  renderCommentAttachmentContext,
  resolveCommentEditPersistTargetFileName,
  SLIDE_COMMENT_EDIT_PATCH_INSTRUCTION_MARKER,
  stripUserVisibleUserMessageText,
  visibleCommentEditInstruction,
} from '../comments';
import {
  computeProducedFiles,
  resolveTurnStartFileBaseline,
} from '../produced-files';
import { buildPptxExportPrompt } from '../lib/build-pptx-export-prompt';
import {
  maskManualEditTargetsOnDocument,
  elementPatchReasonTargetsSyntheticVisualMark,
  parseManualEditSource,
  sanitizeManualEditFullSource,
  serializeManualEditSource,
} from '../edit-mode/source-patches';
import { AvatarMenu } from './AvatarMenu';
import { EntrySettingsMenu } from './EntrySettingsMenu';
import { HandoffButton } from './HandoffButton';
import { useTeamverBranding } from '../teamver/branding/TeamverBrandingProvider';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import { waitForTeamverEmbedBoot } from '../teamver/teamverEmbedBoot';
import { registerTeamverProjectIfNeeded } from '../teamver/projectRegistry';
import {
  refreshDesignAuthCookie,
  refreshTeamverEmbedAuthBeforeMutating,
  isDesignAuthRefreshDeclined,
} from '../teamver/designBffClient';
import { notifyTeamverEmbedAuthFailureIfNeeded } from '../teamver/teamverBffAuthError';
import { fetchTeamverDaemon, TeamverDaemonUnauthorizedError } from '../teamver/teamverDaemonHeaders';
import { TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT } from '../teamver/teamverEmbedPassiveAuth';
import {
  readRememberedTeamverProjectConversation,
  rememberTeamverProjectConversation,
} from '../teamver/teamverProjectConversationMemory';
import { shouldInjectOdPersonalMemoryIntoPrompt } from '../teamver/odMemoryPromptPolicy';
import { hasChatApiCredentials } from '../teamver/chatApiCredentials';
import { shouldUseManagedProxyApiKey } from '../providers/api-proxy';
import {
  formatProjectConversationCreateError,
  formatProjectConversationListError,
  formatProjectConversationErrorForUser,
  formatProjectMessagesLoadError,
  formatProjectArtifactRegressionRejectedError,
  formatProjectArtifactRejectedError,
  formatProjectArtifactSaveFailedError,
  formatProjectArtifactStubWarning,
  formatProjectArtifactCommentScopeRejectedError,
  formatProjectRunDeliverableMissingError,
  encodePersistedRunErrorDetail,
  formatAutoContinueIncompleteOutputNotice,
  formatEmergencyDeckFallbackNotice,
  formatOutlineDeckFallbackNotice,
  extractProjectRunErrorCode,
  formatProjectRunErrorForUser,
  formatProjectRunStalledErrorForUser,
  formatProjectForkConversationError,
} from '../teamver/projectErrorMessages';
import { subscribeTeamverWorkspaceChanged } from '../teamver/teamverWorkspaceEvents';
import { shouldSkipWorkspaceSwitchSideEffects } from '../teamver/workspaceSwitchGuards';
import { readActiveTeamverWorkspaceId } from '../teamver/activeTeamverWorkspace';
import { dispatchTeamverBackgroundChat, dispatchTeamverBackgroundRunInactive } from '../teamver/teamverBackgroundChatEvents';
import {
  BYOK_BACKGROUND_RECOVERY_POLL_MS,
  conversationAwaitingQuestionFormAnswer,
  conversationHasRecoverableBackgroundChat,
  findInFlightAssistantMessages,
  findRecoverableBackgroundAssistantMessage,
  isDaemonRunCancelPending,
  isInFlightAssistantMessage,
  isLocallyTerminalAssistantMessage,
  isRecoverableDaemonRunMessage,
  mergeActiveRunsIntoMessages,
  reattachReplayRemainderAfterSeed,
  rememberUserStoppedAssistantTurn,
  resolveRunRecoveryBannerPhase,
  shouldCatchUpReattachTextFromSeed,
  shouldFullReplayReattachedRun,
  shouldPollStaleDaemonRun,
  shouldForceFailStaleDaemonRun,
  shouldPollStaleApiRun,
  shouldForceFailStaleApiRun,
  applyTerminalRunStatusToAssistant,
  patchStaleApiAssistantFailure,
  TEAMVER_STALE_API_RUN_POLL_MS,
  shouldClearPhantomStreamingMarker,
  shouldReattachDaemonRunEvents,
  terminalAssistantPatchFromRunStatus,
  TEAMVER_STALE_RUN_POLL_MS,
  shouldShowRunRecoveryBannerInChat,
  wasUserStoppedAssistantTurn,
  type RunRecoveryBannerPhase,
} from '../teamver/backgroundChatRecovery';
import { TeamverRunRecoveryBanner } from '../teamver/components/TeamverRunRecoveryBanner';
import {
  beginTeamverEmbedActiveWork,
  endTeamverEmbedActiveWork,
} from '../teamver/teamverEmbedActiveWork';
import { subscribeTeamverEmbedSessionChanged } from '../teamver/teamverEmbedSession';
import { consumeTeamverPublishMenuArm, maybeArmTeamverPublishMenuAfterRunSuccess } from '../teamver/teamverPostRunNavigation';
import {
  looksLikeDeckDeliverablePromiseProse,
  looksLikeDeckIntentProse,
} from '../teamver/deckDeliverableProse';
import { resolveEmbedSlideDesignSystemId } from '../teamver/embedSlideDesignSystem';
import { fetchPluginLocalSkill } from '../teamver/fetchPluginLocalSkill';
import { throwIfProjectCommentUploadIncomplete } from '../teamver/projectUploadErrors';
import { stripLeakedPseudoToolXml } from '../utils/stripLeakedPseudoToolXml';
import {
  sanitizeChatMessageLeakedPseudoTool,
  type SanitizeChatMessageOptions,
} from '../utils/sanitizeChatMessageLeakedPseudoTool';
import { sanitizeAssistantProseForDisplay } from '../runtime/internalAgentMarkup';
import {
  dedupeConversationAssistantRows,
  patchInFlightAssistantForActiveRun,
  resolveLastAssistantMessageIndex,
} from '../runtime/conversation-message-dedupe';
import { Icon } from './Icon';
import { DesignSystemPicker } from './DesignSystemPicker';
import { PluginDetailsModal } from './PluginDetailsModal';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { ChatPane } from './ChatPane';
import type { QuestionFormOpenRequest } from './AssistantMessage';
import type { ChatSendMeta } from './ChatComposer';
import {
  CritiqueTheaterMount,
  useCritiqueTheaterEnabled,
} from './Theater';
import { useIframeKeepAlivePool } from './IframeKeepAlivePool';
import {
  decideAutoOpenAfterWrite,
  selectAutoOpenProducedHtml,
} from './auto-open-file';
import { selectInitialDesignPreviewFile } from './design-files/designArtifacts';
import {
  cleanupRootHtmlReferenceLeaks,
  deleteRootHtmlReferenceLeakIfPresent,
} from '../teamver/branding/cleanupRootHtmlReferenceLeaks';
import {
  isCanonicalDeckProjectPath,
  isEmbedSupportingProjectFile,
  resolveCanonicalDeckEntryPath,
} from '../teamver/branding/embedDeliverableFilePolicy';
import { clearProjectCoverCache } from '../teamver/projectCoverLoader';
import {
  artifactBaseNameForPersist,
  artifactVersionTabsToClose,
  collapseArtifactVersionOpenTabs,
  normalizeSlideOnlyArtifactContractType,
  resolveArtifactPersistFileName,
  resolveSlideOnlySkipDiscoveryBrief,
  shouldDeferSlideOnlyDiscoveryArtifactPersist,
} from './artifact-persist';
import { buildRepoImportPrompt, designSystemNeedsRepoConnect } from './design-system-github-evidence';
import { collectReferencedJsxNames } from '../runtime/jsx-module-refs';
import { FileWorkspace } from './FileWorkspace';
import {
  type PluginFolderAgentAction,
} from './design-files/pluginFolderActions';
import { SHARE_TO_COMMUNITY_PROMPT } from './share-to-community/shareToCommunityPrompt';
import { CenteredLoader } from './Loading';
import type { SettingsSection } from './SettingsDialog';
import { Toast } from './Toast';
import { useDesignMdState } from '../hooks/useDesignMdState';
import { useFinalizeProject } from '../hooks/useFinalizeProject';
import { useProjectDetail } from '../hooks/useProjectDetail';
import { useTerminalLaunch } from '../hooks/useTerminalLaunch';
import { buildContinueInCliToast } from '../lib/build-continue-in-cli-toast';
import { buildClipboardPrompt } from '../lib/build-clipboard-prompt';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { TEAMVER_DECK_MIN_MAX_TOKENS } from '../state/maxTokens';
import { byokChatToolNamesForProtocol } from '../state/apiProtocols';
import { effectiveAgentModelChoice } from './agentModelSelection';
import { mediaExecutionPolicyForProjectMetadata } from '../media/execution-policy';
import { mediaModelProviderId } from '../media/models';
import {
  useByokImageModelOptions,
  useByokVideoModelOptions,
  useByokSpeechModelOptions,
} from '../media/aihubmix-image-models';
import {
  buildFinalizeCredentialsMissingToast,
  buildFinalizeRequest,
} from '../lib/resolve-finalize-request';


type ProjectChatSendMeta = ChatSendMeta & {
  queueOnly?: boolean;
  retryOfAssistantId?: string;
  sessionMode?: ChatSessionMode;
  /** Overrides the run_created / run_finished `entry_from` analytics prop for
   *  this send (e.g. 'resume_continue' from the resumable-failure Continue
   *  action). Behavior never depends on it; it only shapes PostHog props. */
  entryFrom?: ChatAnalyticsEntryFrom;
};

const DAEMON_REATTACH_MISSING_RUN_GRACE_MS = 90_000;
const DAEMON_REATTACH_MISSING_RUN_RETRY_MS = 2_000;
const BYOK_BACKGROUND_RECOVERY_AUTH_RETRY_MS = BYOK_PROXY_AUTH_BACKOFF_MS;
/** Re-arm message load when conversation switch hangs (auth hang, aborted fetch). */
const MESSAGE_LOAD_STUCK_RETRY_MS = 12_000;

export function mergeSavedPreviewComment(current: PreviewComment[], saved: PreviewComment): PreviewComment[] {
  const existingIndex = current.findIndex((comment) => comment.id === saved.id);
  if (existingIndex < 0) return [...current, saved];
  return current.map((comment, index) => (index === existingIndex ? saved : comment));
}

function shouldRetryRecentDaemonRunLookup(message: ChatMessage, now = Date.now()): boolean {
  if (message.role !== 'assistant') return false;
  if (message.endedAt !== undefined) return false;
  const startedAt = message.startedAt ?? message.createdAt;
  if (!startedAt) return true;
  return now - startedAt < DAEMON_REATTACH_MISSING_RUN_GRACE_MS;
}

function shouldRetryMissingDaemonRunLookup(message: ChatMessage, now = Date.now()): boolean {
  if (message.runId) return false;
  return shouldRetryRecentDaemonRunLookup(message, now);
}

function messageHasInFlightRunFields(local: ChatMessage): boolean {
  if (isActiveRunStatus(local.runStatus)) return true;
  if (local.endedAt !== undefined) return false;
  if (local.startedAt !== undefined) return true;
  if (local.runId && !isTerminalRunStatus(local.runStatus)) return true;
  return false;
}

function mergeServerMessageWithLocal(server: ChatMessage, local?: ChatMessage): ChatMessage {
  if (!local) return reconcileUserCommentAttachments(server);
  const merged: ChatMessage = { ...server };
  if (!server.commentAttachments?.length && local.commentAttachments?.length) {
    merged.commentAttachments = local.commentAttachments;
  }
  if (!server.attachments?.length && local.attachments?.length) {
    merged.attachments = local.attachments;
  }
  if (!server.sessionMode && local.sessionMode) {
    merged.sessionMode = local.sessionMode;
  }
  if (!server.runContext && local.runContext) {
    merged.runContext = local.runContext;
  }
  if (!server.appliedPluginSnapshot && local.appliedPluginSnapshot) {
    merged.appliedPluginSnapshot = local.appliedPluginSnapshot;
  }
  if (!server.producedFiles?.length && local.producedFiles?.length) {
    merged.producedFiles = local.producedFiles;
  }
  if (!server.preTurnFileNames?.length && local.preTurnFileNames?.length) {
    merged.preTurnFileNames = local.preTurnFileNames;
  }
  if (!server.slideTurnKind && local.slideTurnKind) {
    merged.slideTurnKind = local.slideTurnKind;
  }
  if (!server.lastRunEventId && local.lastRunEventId) {
    merged.lastRunEventId = local.lastRunEventId;
  }
  if (!server.startedAt && local.startedAt) {
    merged.startedAt = local.startedAt;
  }
  if (!server.endedAt && local.endedAt) {
    merged.endedAt = local.endedAt;
  }
  if (
    local.endedAt !== undefined
    && isTerminalRunStatus(local.runStatus)
    && (server.endedAt === undefined || !isTerminalRunStatus(server.runStatus))
  ) {
    merged.endedAt = local.endedAt;
    merged.runStatus = local.runStatus;
  } else if (!server.runStatus && local.runStatus) {
    merged.runStatus = local.runStatus;
  } else if (
    local.runStatus
    && isActiveRunStatus(local.runStatus)
    && !isTerminalRunStatus(server.runStatus)
    && server.endedAt === undefined
    && (!server.runStatus || !isActiveRunStatus(server.runStatus))
  ) {
    merged.runStatus = local.runStatus;
  }
  if (!merged.runId && local.runId) {
    merged.runId = local.runId;
  }
  // During an in-flight turn the daemon persist throttle can lag behind the
  // live SSE buffer. Reattach recovery must not replace a streamed
  // `<question-form>` (or any partial assistant text) with a stale server row.
  const localContent = local.content ?? '';
  const serverContent = server.content ?? '';
  if (messageHasInFlightRunFields(local) && !isTerminalRunStatus(server.runStatus)) {
    if (localContent.length > serverContent.length) {
      merged.content = localContent;
    }
    const localEventCount = local.events?.length ?? 0;
    const serverEventCount = server.events?.length ?? 0;
    if (localEventCount > serverEventCount && local.events) {
      merged.events = local.events;
    }
  } else if (
    // Daemon append-only persist cannot shrink after the FE streaming buffer
    // strips closed markup / CDN debris. Prefer the shorter, already-sanitized
    // local when the server row is a strict extension OR when sanitizing the
    // server content yields the local text (mid-string scrub).
    localContent.length > 0
    && localContent.length < serverContent.length
  ) {
    if (serverContent.startsWith(localContent)) {
      merged.content = localContent;
      if (local.events) merged.events = local.events;
    } else {
      const cleanedServer = sanitizeAssistantProseForDisplay(serverContent, {
        stripCodeFences: true,
      });
      if (
        cleanedServer === localContent
        || cleanedServer.trimEnd() === localContent.trimEnd()
      ) {
        merged.content = localContent;
        if (local.events) merged.events = local.events;
      }
    }
  } else if (
    messageHasVisibleProse(local)
    && !messageHasVisibleProse(server)
    && (isTerminalRunStatus(server.runStatus) || isTerminalRunStatus(local.runStatus))
  ) {
    merged.content = localContent;
    if (local.events?.length) merged.events = local.events;
  }
  // Keepalive omit-events / partial upsert can drop status:error cards from the
  // server row while the local buffer still has them. Prefer local so re-entry
  // and soft refresh do not hide a chat error the user already saw.
  if (messageHasPersistedChatError(local) && !messageHasPersistedChatError(merged)) {
    merged.events = local.events;
    if (local.runStatus === 'failed') {
      merged.runStatus = 'failed';
      merged.endedAt = local.endedAt ?? merged.endedAt ?? Date.now();
    }
  }
  return reconcileUserCommentAttachments(merged);
}

/**
 * Stable chat display order after a server merge.
 *
 * Prefer the local conversation order whenever it still contains every id —
 * that matches what the user watched stream in (user then assistant). Falling
 * back to createdAt + user-before-assistant on ties covers the case where a
 * concurrent upsert raced position assignment and the server returned the
 * pair flipped, or where a failed user-message PUT left the local user row
 * as "local-only" and the naive append put it after the assistant.
 */
export function orderConversationMessages(
  messages: ChatMessage[],
  preferredOrder?: readonly ChatMessage[],
): ChatMessage[] {
  if (messages.length <= 1) return messages;
  if (preferredOrder && preferredOrder.length > 0) {
    const preferredIndex = new Map(preferredOrder.map((m, i) => [m.id, i]));
    if (messages.every((m) => preferredIndex.has(m.id))) {
      return [...messages].sort(
        (a, b) => (preferredIndex.get(a.id) ?? 0) - (preferredIndex.get(b.id) ?? 0),
      );
    }
  }
  return [...messages].sort((a, b) => {
    const aTime = typeof a.createdAt === 'number' ? a.createdAt : 0;
    const bTime = typeof b.createdAt === 'number' ? b.createdAt : 0;
    if (aTime !== bTime) return aTime - bTime;
    if (a.role !== b.role) {
      if (a.role === 'user') return -1;
      if (b.role === 'user') return 1;
    }
    return a.id.localeCompare(b.id);
  });
}

export function mergeServerMessagesIntoConversation(
  current: ChatMessage[],
  serverMessages: ChatMessage[],
): ChatMessage[] {
  const currentById = new Map(current.map((message) => [message.id, message]));
  const serverIds = new Set(serverMessages.map((message) => message.id));
  const merged = serverMessages.map((message) =>
    mergeServerMessageWithLocal(message, currentById.get(message.id)),
  );
  for (const message of current) {
    if (!serverIds.has(message.id)) merged.push(message);
  }
  return dedupeConversationAssistantRows(orderConversationMessages(merged, current));
}

function synthesizeAssistantMessageForActiveRun(run: {
  id?: string | null;
  assistantMessageId?: string | null;
  agentId?: string | null;
  status?: ChatMessage['runStatus'];
  createdAt?: number | null;
}): ChatMessage | null {
  const assistantMessageId = run.assistantMessageId?.trim();
  if (!assistantMessageId) return null;
  const now = Date.now();
  const createdAt =
    typeof run.createdAt === 'number' && Number.isFinite(run.createdAt)
      ? run.createdAt
      : now;
  return {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    createdAt,
    startedAt: createdAt,
    ...(run.id ? { runId: run.id } : {}),
    runStatus: isActiveRunStatus(run.status) ? run.status : 'running',
    ...(run.agentId ? { agentId: run.agentId } : {}),
  };
}

export function mergeMissingActiveRunAssistantMessages(
  messages: ChatMessage[],
  runs: readonly {
    id?: string | null;
    assistantMessageId?: string | null;
    agentId?: string | null;
    status?: ChatMessage['runStatus'];
    createdAt?: number | null;
    cancelRequested?: boolean;
  }[],
): ChatMessage[] {
  if (runs.length === 0) return messages;
  let working = [...messages];
  const seen = new Set(working.map((message) => message.id));
  const recovered: ChatMessage[] = [];
  for (const run of runs) {
    if (run.cancelRequested) continue;
    if (
      wasUserStoppedAssistantTurn({
        runId: run.id,
        assistantMessageId: run.assistantMessageId,
      })
    ) {
      continue;
    }
    const assistantMessageId = run.assistantMessageId?.trim();
    if (!assistantMessageId) continue;
    if (seen.has(assistantMessageId)) {
      const existing = working.find((message) => message.id === assistantMessageId);
      if (existing && isLocallyTerminalAssistantMessage(existing)) continue;
      continue;
    }
    if (run.id?.trim() && working.some((m) => m.role === 'assistant' && m.runId === run.id)) {
      continue;
    }
    const patched = patchInFlightAssistantForActiveRun(working, run, runs);
    if (patched) {
      working = patched;
      seen.clear();
      for (const message of working) seen.add(message.id);
      continue;
    }
    const message = synthesizeAssistantMessageForActiveRun(run);
    if (!message) continue;
    seen.add(assistantMessageId);
    recovered.push(message);
  }
  const merged =
    recovered.length > 0 ? [...working, ...recovered] : working;
  return dedupeConversationAssistantRows(merged);
}

interface Props {
  project: Project;
  routeFileName: string | null;
  /**
   * Routed conversation id. When set (the URL is
   * `/projects/:id/conversations/:cid[/...]`), the project view picks
   * this conversation as active instead of defaulting to `list[0]`.
   * Falls through to the default picker if the conversation does not
   * exist (e.g. the run was deleted between the route landing and the
   * conversation list loading). Issue #1505. Optional so existing
   * test harnesses that mount ProjectView with a stub props bag do
   * not have to be updated; production callers in `App.tsx` always
   * pass the value from `useRoute()`.
   */
  routeConversationId?: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  // Mentionable functional skills — already filtered by config.disabledSkills
  // upstream, so this drives only the chat composer's @-picker scope. For
  // resolving an existing project's `skillId` (which can also point at a
  // design template after the skills/design-templates split) use
  // `designTemplates` as a fallback in composedSystemPrompt() and in the
  // skill-name / skill-mode lookups below.
  skills: SkillSummary[];
  // All known design templates (unfiltered). Required so projects created
  // from the Templates surface keep composing the template body in API
  // mode even when the user later disables the template in Settings.
  designTemplates: SkillSummary[];
  designSystems: DesignSystemSummary[];
  daemonLive: boolean;
  onModeChange: (mode: AppConfig['mode']) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onApiModelChange?: (model: string) => void;
  onRefreshAgents: () => void;
  onThemeChange?: (theme: AppConfig['theme']) => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onOpenAmrSettings?: () => void;
  onOpenMcpSettings?: () => void;
  onBrowsePlugins?: () => void;
  onOpenConnectors?: () => void;
  // Pet wiring forwarded to the chat composer so users can adopt /
  // wake / tuck a pet without leaving the project view.
  onAdoptPetInline?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  onBack: () => void;
  onClearPendingPrompt: () => void;
  onTouchProject: () => void;
  onProjectChange: (next: Project) => void;
  onProjectsRefresh: () => void;
  onChangeDefaultDesignSystem?: (designSystemId: string | null) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  /** Embed — block chat/run submit when workspace Design app is disabled. */
  embedSubmitDisabled?: boolean;
  onEmbedSubmitBlocked?: () => void;
}

interface QueuedChatSend {
  id: string;
  conversationId: string;
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ProjectChatSendMeta;
  createdAt: number;
}

function queuedChatSendFingerprint(
  prompt: string,
  attachments: ChatAttachment[],
  commentAttachments: ChatCommentAttachment[],
): string {
  const attachmentPaths = attachments.map((attachment) => attachment.path).sort().join('\n');
  const visualSemantic = commentAttachments
    .map((attachment) => {
      const screenshotPath = String(attachment.screenshotPath || '').trim();
      const slideIndex =
        typeof attachment.slideIndex === 'number' && Number.isFinite(attachment.slideIndex)
          ? String(attachment.slideIndex)
          : '';
      const comment = String(attachment.comment || '').trim();
      const markKind = String(attachment.markKind || '').trim();
      const elementBase = String(attachment.elementId || '')
        .trim()
        .replace(/-visual-[a-zA-Z0-9_-]+$/, '');
      return `${screenshotPath}\0${slideIndex}\0${comment}\0${markKind}\0${elementBase}`;
    })
    .sort()
    .join('\n');
  return `${prompt.trim()}\0${attachmentPaths}\0${visualSemantic}`;
}

interface QueuedChatSendUpdate {
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ChatSendMeta;
}

let liveArtifactEventSequence = 0;
const CHAT_PANEL_WIDTH_STORAGE_KEY = 'open-design.project.chatPanelWidth';
const DEFAULT_CHAT_PANEL_WIDTH = 460;
const MIN_CHAT_PANEL_WIDTH = 345;
const MAX_CHAT_PANEL_WIDTH = 720;
const COMMENT_INSPECTOR_PANEL_WIDTH = 320;
const MIN_WORKSPACE_PANEL_WIDTH = 400;
const SPLIT_RESIZE_HANDLE_WIDTH = 8;
const CHAT_PANEL_KEYBOARD_STEP = 16;
const DESIGN_SYSTEM_AUDIT_AUTO_REPAIR_ATTEMPTS = 2;
// Survives ProjectView route unmounts so returning to a conversation does not
// attach a second SSE consumer while the original background consumer lives.
const locallyConsumedDaemonRunIds = new Set<string>();

function releaseLocallyConsumedDaemonRun(runId: string | null | undefined): void {
  const id = runId?.trim();
  if (!id) return;
  locallyConsumedDaemonRunIds.delete(id);
}

/** Detach the primary stream SSE without POST /cancel — daemon run keeps going. */
function detachPrimaryRunStreamWithoutCancel(
  abortRef: MutableRefObject<AbortController | null>,
  cancelRef: MutableRefObject<AbortController | null>,
  ownedRunId: string | null,
): void {
  abortRef.current?.abort();
  abortRef.current = null;
  cancelRef.current = null;
  releaseLocallyConsumedDaemonRun(ownedRunId);
}
// Trailing-debounce window for the canonical (daemon + SQLite) tab-state write.
// Embedded-browser navigation bursts settle well within this; the local cache
// is written immediately so nothing is lost if the daemon write is coalesced.
const TAB_PERSIST_DEBOUNCE_MS = 400;
const MIN_NORMAL_SPLIT_WIDTH =
  MIN_CHAT_PANEL_WIDTH + SPLIT_RESIZE_HANDLE_WIDTH + MIN_WORKSPACE_PANEL_WIDTH;
type DesignSystemReviewEntry = NonNullable<ProjectMetadata['designSystemReview']>[string];
type DesignSystemReviewAgentTask = NonNullable<DesignSystemReviewEntry['agentTask']>;
interface DesignSystemReviewDetails {
  feedback?: string;
  files?: string[];
  agentTask?: DesignSystemReviewAgentTask;
}

function workspacePanelMinWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return MIN_WORKSPACE_PANEL_WIDTH;
  return splitWidth < MIN_NORMAL_SPLIT_WIDTH ? 0 : MIN_WORKSPACE_PANEL_WIDTH;
}

function maxChatPanelWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return MAX_CHAT_PANEL_WIDTH;
  const workspaceMinWidth = workspacePanelMinWidthForSplit(splitWidth);
  const viewportAwareMax = splitWidth - SPLIT_RESIZE_HANDLE_WIDTH - workspaceMinWidth;
  return Math.max(0, Math.min(MAX_CHAT_PANEL_WIDTH, Math.floor(viewportAwareMax)));
}

function clampPreferredChatPanelWidth(width: number): number {
  return Math.min(MAX_CHAT_PANEL_WIDTH, Math.max(MIN_CHAT_PANEL_WIDTH, Math.round(width)));
}

function clampChatPanelWidth(width: number, maxWidth = MAX_CHAT_PANEL_WIDTH): number {
  const effectiveMax = Math.max(0, Math.min(MAX_CHAT_PANEL_WIDTH, Math.floor(maxWidth)));
  const effectiveMin = Math.min(MIN_CHAT_PANEL_WIDTH, effectiveMax);
  return Math.min(effectiveMax, Math.max(effectiveMin, Math.round(width)));
}

function designSystemFeedbackAttachments(
  projectFiles: ProjectFile[],
  sectionFiles: string[],
): ChatAttachment[] {
  const fileLookup = new Map(projectFiles.map((file) => [file.name, file]));
  return sectionFiles
    .map((name) => fileLookup.get(name))
    .filter((file): file is ProjectFile => Boolean(file))
    .slice(0, 8)
    .map((file) => ({
      path: file.name,
      name: file.name,
      kind: file.kind === 'image' ? 'image' : 'file',
      size: file.size,
    }));
}

function chatAttachmentsFromPreviewCommentImages(
  images: PreviewCommentAttachment[] | undefined,
): ChatAttachment[] {
  if (!Array.isArray(images)) return [];
  const seen = new Set<string>();
  const out: ChatAttachment[] = [];
  for (const image of images) {
    const path = image.path.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push({
      path,
      name: image.name.trim() || path.split('/').pop() || path,
      kind: 'image',
    });
  }
  return out;
}

function mergeChatAttachments(...groups: ChatAttachment[][]): ChatAttachment[] {
  const seen = new Set<string>();
  const out: ChatAttachment[] = [];
  for (const group of groups) {
    for (const attachment of group) {
      const path = attachment.path.trim();
      if (!path) continue;
      const dedupeKey = projectFilePathBasename(path).toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push({ ...attachment, path });
    }
  }
  return out;
}

function attachmentsIncludeProjectFilePath(
  attachments: readonly ChatAttachment[],
  filePath: string,
): boolean {
  const normalized = filePath.trim();
  if (!normalized) return false;
  const base = normalized.split('/').pop() ?? normalized;
  return attachments.some((attachment) => {
    const path = attachment.path.trim();
    const name = attachment.name.trim();
    return path === normalized || name === normalized || path === base || name === base;
  });
}

function chatAttachmentForProjectFile(file: ProjectFile): ChatAttachment {
  const path = file.path?.trim() || file.name;
  return {
    path,
    name: file.name,
    kind: 'file',
    ...(typeof file.size === 'number' ? { size: file.size } : {}),
  };
}

function isProjectHtmlFile(file: ProjectFile): boolean {
  return file.kind === 'html' || /\.html?$/i.test(file.path?.trim() || file.name);
}

function isCanonicalDeckFileName(fileName: string): boolean {
  const base = (fileName.split('/').pop() ?? fileName).toLowerCase();
  return /^deck(?:[-_.].*)?\.html?$/.test(base);
}

/**
 * On-disk Teamver deck for *edit* auto-attach / prompt branching.
 * Must NOT fall back to leftover non-deck HTML (about.html, etc.) — that would
 * mark a first create as an "existing deck edit" and drive create/edit miscopy.
 */
export function resolveCanonicalDeckFileForEdit(
  files: readonly ProjectFile[],
  entryFile?: string | null,
): ProjectFile | null {
  const deliverables = files.filter(
    (file) =>
      isProjectHtmlFile(file)
      && !isEmbedSupportingProjectFile(file, { projectFiles: files }),
  );
  if (deliverables.length === 0) return null;
  const preferred = entryFile?.trim();
  if (preferred) {
    // NFC-tolerant match: metadata.entryFile may be NFC while listFiles bytes
    // are NFD (macOS legacy). Byte-exact `===` selected the wrong deck.
    const match = deliverables.find(
      (file) =>
        projectFilePathsReferToSameFile(file.name, preferred)
        || projectFilePathsReferToSameFile(file.path, preferred),
    );
    if (match && isCanonicalDeckFileName(match.name)) return match;
  }
  return deliverables.find((file) => isCanonicalDeckFileName(file.name)) ?? null;
}

function resolvePrimaryDeckFile(
  files: readonly ProjectFile[],
  entryFile?: string | null,
): ProjectFile | null {
  const deliverables = files.filter(
    (file) =>
      isProjectHtmlFile(file)
      && !isEmbedSupportingProjectFile(file, { projectFiles: files }),
  );
  if (deliverables.length === 0) return null;
  const preferred = entryFile?.trim();
  if (preferred) {
    const match = deliverables.find(
      (file) =>
        projectFilePathsReferToSameFile(file.name, preferred)
        || projectFilePathsReferToSameFile(file.path, preferred),
    );
    if (match) return match;
  }
  const deckNamed = deliverables.find((file) => isCanonicalDeckFileName(file.name));
  if (deckNamed) return deckNamed;
  return selectInitialDesignPreviewFile(deliverables, entryFile ?? null);
}

function resolvePrimaryDeckFilePath(
  files: readonly ProjectFile[],
  entryFile?: string | null,
): string | null {
  const deck = resolvePrimaryDeckFile(files, entryFile);
  if (!deck) return null;
  return deck.path?.trim() || deck.name;
}

/**
 * Best-effort active slide index for the client visual-mark graft when
 * reconciliation can't infer one from the deck HTML. Falls back to the
 * attachment's carried `slideIndex` (from the draw overlay's slide bridge)
 * or, as a last resort, slide 0.
 */
function activeDeckSlideIndexForVisualMarkGraft(
  attachments: readonly ChatCommentAttachment[],
): number {
  for (const attachment of attachments) {
    const index = attachment.slideIndex;
    if (typeof index === 'number' && Number.isFinite(index) && index >= 0) {
      return Math.floor(index);
    }
  }
  return 0;
}

function visualAnnotationAutoContinueFlags(
  attachments: readonly ChatCommentAttachment[],
): { visualMarkOnly: boolean; visualAnnotationEdit: boolean } {
  const usable = filterUsableCommentAttachments(attachments);
  return {
    visualMarkOnly: isVisualMarkPlacementOnlyCommentAttachments(usable),
    visualAnnotationEdit: usable.some(hasUserTypedVisualAnnotationRequest),
  };
}

async function hydrateDeckCommentSlideIndexes(input: {
  projectId: string;
  attachments: readonly ChatCommentAttachment[];
  projectFiles: readonly ProjectFile[];
  entryFile?: string | null;
}): Promise<ChatCommentAttachment[]> {
  const primaryDeckPath = resolvePrimaryDeckFilePath(input.projectFiles, input.entryFile);
  const htmlCache = new Map<string, string | null>();
  const readDeckHtml = async (filePath: string): Promise<string | null> => {
    const normalized = filePath.trim() || primaryDeckPath || '';
    if (!normalized) return null;
    if (htmlCache.has(normalized)) return htmlCache.get(normalized) ?? null;
    const html = await fetchProjectFileText(input.projectId, normalized, { cache: 'no-store' });
    htmlCache.set(normalized, html);
    return html;
  };
  // Group by deck path so one reconcileCommentScopeForPersist covers all
  // attachments on that deck (was per-attachment double slide reconcile).
  const groups = new Map<string, { indexes: number[]; attachments: ChatCommentAttachment[] }>();
  const passthrough: Array<{ index: number; attachment: ChatCommentAttachment }> = [];
  input.attachments.forEach((attachment, index) => {
    const rawPath = String(attachment.filePath || '').trim();
    const deckPath =
      /\.html?$/i.test(rawPath) ? rawPath : (primaryDeckPath || rawPath);
    if (!deckPath || !/\.html?$/i.test(deckPath)) {
      passthrough.push({ index, attachment });
      return;
    }
    const group = groups.get(deckPath) ?? { indexes: [], attachments: [] };
    group.indexes.push(index);
    group.attachments.push({ ...attachment, filePath: deckPath });
    groups.set(deckPath, group);
  });
  const out: ChatCommentAttachment[] = input.attachments.slice();
  for (const item of passthrough) {
    out[item.index] = item.attachment;
  }
  for (const [deckPath, group] of groups) {
    const html = await readDeckHtml(deckPath);
    if (!html) {
      for (let i = 0; i < group.attachments.length; i += 1) {
        out[group.indexes[i]!] = group.attachments[i]!;
      }
      continue;
    }
    const scope = reconcileCommentScopeForPersist(html, group.attachments);
    for (let i = 0; i < scope.attachments.length; i += 1) {
      out[group.indexes[i]!] = scope.attachments[i]!;
    }
  }
  return out;
}

const SLIDE_ATTACHMENT_DELIVERABLE_INSTRUCTION_MARKER = '[Deliverable instruction]';
const EXISTING_DECK_EDIT_INSTRUCTION_MARKER = '[Existing deck edit]';
const SLIDE_IMAGE_EMBED_INSTRUCTION_MARKER = '[Attached image embed]';

const SLIDE_IMAGE_PATH_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

export function imageAttachmentPathsForSlideEmbed(
  attachments: readonly ChatAttachment[],
  projectFilePaths?: readonly string[],
): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  const index = projectFilePaths ?? [];
  for (const attachment of attachments) {
    const rawPath = attachment.path.trim();
    if (!rawPath) continue;
    const path = index.length > 0
      ? resolveCanonicalProjectImagePath(rawPath, index)
      : rawPath;
    if (!path || seen.has(path)) continue;
    const isImage =
      attachment.kind === 'image' || SLIDE_IMAGE_PATH_RE.test(path) || SLIDE_IMAGE_PATH_RE.test(attachment.name);
    if (!isImage) continue;
    // Auto-attached deck.html is never an embeddable image asset.
    if (/\.html?$/i.test(path)) continue;
    seen.add(path);
    paths.push(path);
    if (paths.length >= 12) break;
  }
  return paths;
}

/** Keep image + deck.html attachments across auto-continue so embed contracts survive retries. */
export function chatAttachmentsForAutoContinueImageEmbed(
  originUser: {
    attachments?: readonly ChatAttachment[] | null;
    content?: string | null;
  } | null | undefined,
  projectFilePaths?: readonly string[],
): ChatAttachment[] {
  // Recover `@image` / `[Attached image embed]` paths when attachments_json
  // lagged — otherwise retries lose the embed contract and greenfield 8→2.
  const attachments = mergeImageMentionAttachments(
    originUser?.attachments,
    originUser?.content,
  );
  const index = projectFilePaths ?? [];
  const out: ChatAttachment[] = [];
  const seen = new Set<string>();
  for (const attachment of attachments) {
    const rawPath = attachment.path.trim();
    if (!rawPath) continue;
    // Upgrade basename mentions to refs/drive/… so retries advertise the
    // exact on-disk path (matches what persist heal writes to deck.html).
    const path = index.length > 0
      ? resolveCanonicalProjectImagePath(rawPath, index)
      : rawPath;
    if (seen.has(path)) continue;
    const isHtml = /\.html?$/i.test(path);
    const isImage =
      attachment.kind === 'image'
      || SLIDE_IMAGE_PATH_RE.test(path)
      || SLIDE_IMAGE_PATH_RE.test(attachment.name);
    if (!isHtml && !isImage) continue;
    seen.add(path);
    const name = attachment.name?.trim() || path.split('/').pop() || attachment.name;
    out.push(path === rawPath ? attachment : { ...attachment, path, name });
    if (out.length >= 16) break;
  }
  return out;
}

function slideImageEmbedInstruction(imagePaths: readonly string[]): string {
  return [
    SLIDE_IMAGE_EMBED_INSTRUCTION_MARKER,
    'The user attached image file(s) to place into the slide deck.',
    'This is a surgical insert into the EXISTING deck — do NOT regenerate a new short deck.',
    'Embed each image with its exact project-relative path (copy the path characters verbatim, including any `refs/drive/` or timestamp prefix).',
    'Never invent URLs, never use data: URIs, never strip directory prefixes, never rename the file, and do not omit the images:',
    ...imagePaths.map((path) => `- <img src="${path}" alt="" style="max-width:100%;height:auto;object-fit:contain">`),
    'Preferred deliverable: `<artifact type="deck-patch">` with one `<section class="slide" data-slide-index="{N}">` that COPIES the full current target slide HTML from the attached deck, then INSERTS the `<img>` above.',
    'Use `set-image` only when replacing an existing `<img>` element. Use `set-outer-html` only for a local container that already exists on that slide.',
    'Hard rule: NEVER reduce the number of `<section class="slide">` blocks vs the attached on-disk deck (e.g. do not turn 8 slides into 2).',
    'Do NOT emit a greenfield 2-slide wireframe. Keep every other slide unchanged unless the user explicitly asks for a redesign.',
  ].join('\n');
}

function slideAttachmentDeliverableInstruction(
  attachments: ChatAttachment[],
  projectFilePaths?: readonly string[],
): string {
  const index = projectFilePaths ?? [];
  const files = attachments
    .map((attachment) => {
      const raw = attachment.path.trim();
      if (!raw) return '';
      return index.length > 0 ? resolveCanonicalProjectImagePath(raw, index) : raw;
    })
    .filter(Boolean)
    .slice(0, 12);
  const fileList = files.length > 0
    ? `\nReference files to read/use:\n${files.map((path) => `- ${path}`).join('\n')}`
    : '';
  const imagePaths = imageAttachmentPathsForSlideEmbed(attachments, projectFilePaths);
  const imageEmbed = imagePaths.length > 0
    ? `\n${slideImageEmbedInstruction(imagePaths)}`
    : '';
  return [
    SLIDE_ATTACHMENT_DELIVERABLE_INSTRUCTION_MARKER,
    'The attached/uploaded files are reference material for this slide deck request.',
    'Read them for TEXTUAL content — headings, body copy, callouts, section names, tables, image references — but do NOT treat any attachment as the final deliverable.',
    '**Do NOT preserve the source attachment\'s visual styling.** The attached HTML (Canvas / Drive) may have its own background colors, gradients, font-families, borders, decorative accents, and section chrome. Those belong to the source page, NOT to the generated deck. Palette, typography, borders, shadows, and motif language for the deck come exclusively from the Selected deck template kit / Visual summary in the system prompt (or from the active design system when no template is selected) — never from the attached source HTML.',
    'Do not copy, rename, or save any attachment HTML (including Canvas exports under `refs/...`) into the project root.',
    'Emit ONE complete Teamver compact deck artifact (`<artifact type="deck" identifier="deck">`) that persists as `deck.html`, with one filled `<section class="slide">` per requested slide count '
    + `(${COMPACT_DECK_SLIDE_COUNT_GUIDANCE}), body-first inline styles, and no \`<head>\`, nav, or print scaffolding.`,
    'Do not finish with prose only, do not stop after an outline, and do not stop before `</artifact>`.',
    fileList,
    imageEmbed,
  ].filter(Boolean).join('\n');
}

/**
 * Strip a previously-injected `[Deliverable instruction]` (greenfield block)
 * from a persisted prompt. Retry / auto-continue turns re-play the failed
 * user message content; without this the greenfield contract survives even
 * after we've learned this is actually an existing-deck edit — the model
 * then sees conflicting "emit ONE complete deck" + "edit the existing deck"
 * instructions and defaults back to a fresh short deck, tripping stub-guard
 * on every retry.
 */
export function stripGreenfieldDeliverableInstruction(prompt: string): string {
  const idx = prompt.indexOf(`\n\n${SLIDE_ATTACHMENT_DELIVERABLE_INSTRUCTION_MARKER}`);
  if (idx < 0) return prompt;
  return prompt.slice(0, idx).trimEnd();
}

export function promptWithSlideAttachmentDeliverableInstruction(
  prompt: string,
  attachments: ChatAttachment[],
  options: {
    slideOnlyMvp: boolean;
    /**
     * Comment-driven turns already have `<attached-preview-comments>` context
     * telling the model to change ONLY the pinned elements. Reinjecting the
     * "emit ONE complete deck" pressure here forces the model to regenerate
     * every slide's HTML on a one-element edit, which is the primary cause of
     * 2+ minute round-trips (see runtime/resume + system prompt in
     * `packages/contracts/src/prompts/system.ts`). Suppress it for comment
     * edits so the scope block wins; deck-only sends (uploads without any
     * comment target) still get the full deliverable pressure.
     */
    commentAttachmentCount?: number;
    /** Follow-up edit with the current deck auto-attached — not a greenfield generate. */
    existingDeckEdit?: boolean;
    /** Current `/files` paths — upgrade basename attachments to refs/drive/… */
    projectFilePaths?: readonly string[];
  },
): string {
  if (!options.slideOnlyMvp || attachments.length === 0) return prompt;
  // Comment edits suppress full-deck deliverable pressure (scope block wins),
  // but attached images still need an exact <img src> contract — otherwise
  // board/memo "이 이미지 넣어줘" turns have no path to copy.
  if ((options.commentAttachmentCount ?? 0) > 0 || options.existingDeckEdit) {
    // Retry / auto-continue path: the persisted first-turn content may already
    // carry a stale `[Deliverable instruction]` from the failed greenfield
    // send. Strip it now that we know this is really an existing-deck edit,
    // otherwise the model sees two conflicting contracts and regenerates a
    // fresh short deck (same failure as the first turn — infinite retry loop).
    const cleanedPrompt = stripGreenfieldDeliverableInstruction(prompt);
    const imagePaths = imageAttachmentPathsForSlideEmbed(
      attachments,
      options.projectFilePaths,
    );
    if (imagePaths.length === 0) return cleanedPrompt;
    if (cleanedPrompt.includes(SLIDE_IMAGE_EMBED_INSTRUCTION_MARKER)) return cleanedPrompt;
    const visiblePrompt = cleanedPrompt.trim() || '첨부 이미지를 슬라이드에 넣어줘.';
    return `${visiblePrompt}\n\n${slideImageEmbedInstruction(imagePaths)}`;
  }
  if (prompt.includes(SLIDE_ATTACHMENT_DELIVERABLE_INSTRUCTION_MARKER)) return prompt;
  const visiblePrompt = prompt.trim() || '첨부 파일을 참고해서 슬라이드 덱을 만들어줘.';
  return `${visiblePrompt}\n\n${slideAttachmentDeliverableInstruction(
    attachments,
    options.projectFilePaths,
  )}`;
}

/**
 * Nudges the model into emitting structured element patches on comment edits.
 * Element-patch maps directly to ManualEditPatch and avoids slide-level merge
 * guards. Deck-patch remains the fallback when slide structure must change.
 */
function slideCommentEditPatchInstruction(commentAttachmentCount: number): string {
  return [
    SLIDE_COMMENT_EDIT_PATCH_INSTRUCTION_MARKER,
    `The ${commentAttachmentCount === 1 ? 'attached preview comment targets' : `${commentAttachmentCount} attached preview comments target`} specific element(s) on specific slide(s). Preferred deliverable is a structured element patch, not a full deck rewrite:`,
    '',
    '<artifact type="element-patch" identifier="deck">',
    '  <patch target-id="{elementId}" slide-index="{N}" kind="set-text">replacement text</patch>',
    '  <patch target-id="{elementId}" slide-index="{N}" kind="set-style">{"fontSize":"32px","fontWeight":"700","color":"#ef4444"}</patch>',
    '  <patch target-id="{elementId}" slide-index="{N}" kind="set-outer-html">&lt;tag style="..."&gt;…&lt;/tag&gt;</patch>',
    '</artifact>',
    '',
    '- The `element-patch` artifact MUST contain at least one non-empty `<patch ...>...</patch>` block. Never emit an empty `<artifact type="element-patch"></artifact>` or a patch with empty body.',
    '- If you are unsure which operation to use, still emit the smallest safe patch for the pinned target: style-only requests use `set-style`, wording requests use `set-text`, markup-only requests use `set-outer-html`.',
    '- Never answer with a question when a pinned comment target is attached. Use the provided target context and emit a patch for that target.',
    '- `target-id` MUST match the comment `elementId` (or a selector id from `<attached-preview-comments>`).',
    '- Copy `target-id` exactly from the numbered comment header / `scopeLock`; do NOT invent tag-like ids such as `h1`, `h2`, `p`, or `section.slide.active` from the visible UI label.',
    '- Never target page roots such as `body`, `html`, `document`, `dom:body`, or `dom:html`. If the visible label says `h1`/`h2`, use the concrete attached element id / scopeLock for that heading, not a root selector.',
    '- Do NOT use `dom:body > …` CSS paths as `target-id` unless they appear verbatim in `scopeLock` / `elementId`. Prefer stable ids such as `data-od-id` values from the comment attachment.',
    '- `slide-index="{N}"` uses the 0-based index from `slideIndex:` in `<attached-preview-comments>`.',
    '- `kind` is one of: `set-text`, `set-style` (JSON object), `set-outer-html`, `set-link` (JSON), `set-image` (JSON), `set-attributes` (JSON), `remove-element`.',
    '- Apply the user request to ONLY the pinned target element. Do not change siblings, slide wrappers, or global CSS unless the user explicitly asks for slide-wide changes.',
    '- For arbitrary natural-language requests (visibility, tone, layout tweaks), interpret the intent and emit the smallest valid element patch — never ask the user to rephrase.',
    '- When the user asks to make text bigger/smaller/bolder/more visible (e.g. "크게", "키워", "눈에 띄게") WITHOUT changing the words: use `kind="set-style"` with `fontSize` / `fontWeight` / `color`. Keep every character of `currentText` exactly as-is — never use `set-text`, `remove-element`, or empty the element.',
    '- When the user asks for layout/wrapping tweaks without changing the words (e.g. "줄바꿈 없이 한줄로", "한 줄로", "nowrap"): use `kind="set-outer-html"` on the pinned element (remove `<br>` / wrap markup) OR `kind="set-style"` with `{"whiteSpace":"nowrap"}`. Never use `set-text` when the target contains `<br>` or nested tags.',
    '- When the user asks for alignment/spacing tweaks without changing the words (e.g. "가운데 정렬", "왼쪽 맞춤"): use `kind="set-style"` with `textAlign` / spacing fields. Keep `currentText` verbatim.',
    '- When the user asks to replace the text ("\'새 문구\'로 수정", "멘트를 …로", "copy to …"): use `kind="set-text"` with the new text only.',
    '- When the user asks to delete/remove the pinned element ("삭제", "제거", "지워"): use `kind="remove-element"` with an empty patch body.',
    '',
    'Fallback when multiple elements or slide structure must change:',
    '<artifact type="deck-patch" identifier="deck"><section class="slide" data-slide-index="{N}">…full slide replacement…</section></artifact>',
    '',
    '- Deck-patch: one `<section class="slide">` per touched slide only; preserve `data-od-id` on the comment target.',
    '- Full `<artifact type="deck">` only for deck-wide edits (new slide, reorder, global CSS).',
  ].join('\n');
}

export function promptWithSlideCommentEditPatchInstruction(
  prompt: string,
  options: {
    slideOnlyMvp: boolean;
    commentAttachmentCount: number;
    commentAttachments?: readonly ChatCommentAttachment[];
  },
): string {
  if (!options.slideOnlyMvp || options.commentAttachmentCount <= 0) return prompt;
  if (prompt.includes(SLIDE_COMMENT_EDIT_PATCH_INSTRUCTION_MARKER)) return prompt;
  const visiblePrompt = prompt.trim() || '이 코멘트에 맞춰 슬라이드를 수정해줘.';
  const usableAttachments = options.commentAttachments
    ? filterUsableCommentAttachments(options.commentAttachments)
    : [];
  const visualMarkPlacementOnly =
    usableAttachments.length > 0
    && usableAttachments.every(
      (attachment) =>
        isScreenshotOnlyVisualCommentTarget(attachment)
        && shouldClientGraftVisualMarkWithoutAi(attachment),
    );
  const visualAnnotationEdit = usableAttachments.some(
    (attachment) => hasUserTypedVisualAnnotationRequest(attachment),
  );
  const parts = [
    `${visiblePrompt}\n\n${slideCommentEditPatchInstruction(options.commentAttachmentCount)}`,
  ];
  if (visualAnnotationEdit) {
    parts.push(
      '',
      '[Visual annotation edit]',
      '- The user drew a box or typed a note on the screenshot to show WHICH content to change (font size, color, copy, layout).',
      '- Do NOT add decorative overlay divs (`od-visual-mark-target`) or paste icons unless the note explicitly asks for a shape.',
      '- Apply the annotation note to the real slide content inside the boxed region from <attached-preview-comments> (use pagePosition bounds and slideIndex).',
      '- Prefer element-patch set-style / set-text on elements overlapping that region; preserve all other slide content.',
      '- Do NOT use element-patch for synthetic `visual-mark-*` ids — resolve real `data-od-id` targets from the deck HTML.',
    );
  }
  if (visualMarkPlacementOnly) {
    parts.push(
      '',
      '[Visual mark edit]',
      '- The user drew on the screenshot (red strokes) to show WHERE and WHAT shape/icon to add (e.g. a heart).',
      '- Do NOT delete, clear, or redesign the slide. Preserve every existing element, text block, image, and style on the target slide.',
      '- Add ONLY the requested mark (SVG/icon) inside the marked box coordinates from <attached-preview-comments>.',
      '- Never emit a deck-patch that replaces the slide with an empty shell or a single overlay div.',
      '- If you emit deck-patch, COPY the full current slide HTML from disk and INSERT `<div class="od-visual-mark-target">…</div>` before `</section>`.',
      '- Do NOT use element-patch for synthetic `visual-mark-*` ids — they are not in the deck DOM.',
    );
  }
  const concreteTemplate = options.commentAttachments?.length
    ? buildConcretePatchTemplatesForCommentAttachments(options.commentAttachments)
    : null;
  if (concreteTemplate) {
    parts.push(
      '',
      visualMarkPlacementOnly
        ? 'PREFERRED OUTPUT — deck-patch that COPIES the full existing slide section then ADDS the visual mark div (see template). Do not remove sibling content:'
        : 'REQUIRED OUTPUT — respond with ONLY this artifact block (no greeting, no question-form, no deck rewrite). Copy target-id and slide-index exactly; replace only the patch body text:',
      concreteTemplate,
    );
  }
  return parts.join('\n');
}

function slideExistingDeckEditInstruction(
  deckPath: string,
  imagePaths: readonly string[] = [],
): string {
  const lines = [
    EXISTING_DECK_EDIT_INSTRUCTION_MARKER,
    `This project already has a completed slide deck saved as \`${deckPath}\` (see <attached-project-files> above).`,
    'This turn is an edit to that deck — do NOT claim there is no completed deck in this conversation.',
    'Read the attached deck HTML and apply the user request.',
    'Prefer `<artifact type="element-patch">` with `<patch target-id="…" slide-index="{N}" kind="…">` for single-element edits.',
    'Use `<artifact type="deck-patch">` when inserting images or changing slide structure; COPY the full current target slide HTML then apply the minimal change.',
    'Full `<artifact type="deck">` only for explicit redesigns — and you MUST keep at least the same slide count as the attached deck.',
    'Hard rule: NEVER collapse the deck (e.g. 8 slides → 2). Preserving every existing slide is more important than polish.',
    'If you emit a short status sentence, use edit tone only ("수정 반영 중" / "Applying your edits"). Never "초안이 생성", "creating the deck", or "draft is ready".',
  ];
  if (imagePaths.length > 0) {
    // Prefer the dedicated [Attached image embed] block when present; otherwise
    // list exact paths so comment/existing-deck turns still have copyable srcs.
    lines.push(
      'When the user asks to place attached images into the deck, emit deck-patch that copies the target slide and inserts `<img>` using these exact project-relative paths (copy characters verbatim):',
      ...imagePaths.map((path) => `- ${path}`),
    );
  }
  return lines.join('\n');
}

/** Nudges follow-up text edits when the current deck file is auto-attached for API context. */
export function promptWithExistingDeckEditInstruction(
  prompt: string,
  options: {
    slideOnlyMvp: boolean;
    deckPath: string;
    imagePaths?: readonly string[];
  },
): string {
  if (!options.slideOnlyMvp) return prompt;
  const deckPath = options.deckPath.trim();
  if (!deckPath) return prompt;
  if (prompt.includes(EXISTING_DECK_EDIT_INSTRUCTION_MARKER)) return prompt;
  const visiblePrompt = prompt.trim() || '슬라이드 덱을 수정해줘.';
  return `${visiblePrompt}\n\n${slideExistingDeckEditInstruction(deckPath, options.imagePaths ?? [])}`;
}

async function tryApplyElementPatchesAgainstCurrentDeck(input: {
  projectId: string;
  fileName: string;
  patchBody: string;
  sourceText?: string;
  allowedSlideIndexes?: readonly number[];
  commentAttachments?: readonly ChatCommentAttachment[];
  instructionText?: string;
  /** When set, skip a second disk fetch (persistArtifact cache). */
  currentHtml?: string | null;
  /** Pre-materialized sections from persist reconcile. */
  currentSlides?: readonly { outerHtml: string; openTag: string }[];
}): Promise<DeckPatchMergeResult> {
  const resolvedBody = resolveElementPatchBodyForApply({
    patchBody: input.patchBody,
    sourceText: input.sourceText,
    coerceHints: elementPatchCoerceHintsFromCommentAttachments(input.commentAttachments ?? []),
    instructionText: input.instructionText,
  });
  if (resolvedBody !== input.patchBody) {
    devLog.warn('[element-patch] salvaged patch body from assistant output', {
      fileName: input.fileName,
      beforeLength: (input.patchBody ?? '').length,
      afterLength: resolvedBody.length,
    });
  }
  const parsed = parseElementPatch(resolvedBody);
  if (!parsed.ok) {
    // Salvage: the model wrapped deck-patch content (or a full
    // `<section class="slide">` block) in an `element-patch` artifact
    // by mistake. Route the same body through the deck-patch pipeline
    // so we still narrow to the comment target instead of failing
    // with a scary "선택 대상 밖 변경" banner. This covers the common
    // model glitch where the artifact type is off-by-one for the
    // content shape.
    if (elementPatchBodyLooksLikeDeckPatch(resolvedBody)) {
      devLog.warn('[element-patch] body looks like deck-patch — falling back', {
        fileName: input.fileName,
        parseReason: parsed.reason,
      });
      return await tryApplyDeckPatchAgainstCurrentDeck({
        projectId: input.projectId,
        fileName: input.fileName,
        patchBody: resolvedBody,
        allowedSlideIndexes: input.allowedSlideIndexes,
        commentAttachments: input.commentAttachments,
        instructionText: input.instructionText,
        currentHtml: input.currentHtml,
        currentSlides: input.currentSlides,
      });
    }
    devLog.warn('[element-patch] parse failed', {
      fileName: input.fileName,
      reason: parsed.reason,
      bodyLength: (resolvedBody ?? '').length,
    });
    return { ok: false, code: 'deck_patch_parse_failed', reason: parsed.reason };
  }
  const currentHtml = input.currentHtml !== undefined
    ? input.currentHtml
    : await fetchProjectFileText(input.projectId, input.fileName, {
      cache: 'no-store',
    });
  if (!currentHtml) {
    return {
      ok: false,
      code: 'deck_patch_current_unreadable',
      reason: 'current deck file unreadable',
    };
  }
  const allowedTargetIds = input.commentAttachments?.flatMap((attachment) => scopedCommentElementIds(attachment)) ?? [];
  if (
    hasElementScopedCommentAttachments(input.commentAttachments)
    && allowedTargetIds.length === 0
  ) {
    return {
      ok: false,
      code: 'deck_patch_merge_failed',
      reason: 'No valid element targets in attached comment scope.',
    };
  }
  const allowedSlideIndexes = resolveElementPatchAllowedSlideIndexes({
    currentHtml,
    patches: parsed.patches,
    allowedSlideIndexes: input.allowedSlideIndexes,
    commentAttachments: input.commentAttachments,
    currentSlides: input.currentSlides,
  });
  const applied = applyElementPatches({
    currentHtml,
    patches: parsed.patches,
    allowedSlideIndexes,
    allowedTargetIds,
    targetHints: elementPatchTargetHintsFromCommentAttachments(input.commentAttachments ?? []),
    commentAttachments: input.commentAttachments,
    instructionText: input.instructionText,
  });
  if (!applied.ok) {
    if (
      elementPatchReasonTargetsSyntheticVisualMark(applied.reason)
      && elementPatchBodyLooksLikeDeckPatch(resolvedBody)
    ) {
      devLog.warn('[element-patch] visual-mark target — falling back to deck-patch', {
        fileName: input.fileName,
        reason: applied.reason,
      });
      return await tryApplyDeckPatchAgainstCurrentDeck({
        projectId: input.projectId,
        fileName: input.fileName,
        patchBody: resolvedBody,
        allowedSlideIndexes: input.allowedSlideIndexes,
        commentAttachments: input.commentAttachments,
        instructionText: input.instructionText,
        currentHtml,
        currentSlides: input.currentSlides,
      });
    }
    devLog.warn('[element-patch] apply failed', { fileName: input.fileName, reason: applied.reason });
    return { ok: false, code: 'deck_patch_merge_failed', reason: applied.reason };
  }
  // Mirror deck-patch finalize (intent + stabilize + conditional sanitize).
  // applyElementPatches already sanitized — skip no-op-stabilize re-scrub.
  const mergedSlides = (input.commentAttachments?.length ?? 0) > 0
    ? extractTopLevelSlideSections(extractDeckBodyContent(applied.html))
    : undefined;
  return finalizeScopedDeckMergeHtml({
    currentHtml,
    mergedHtml: applied.html,
    commentAttachments: input.commentAttachments ?? [],
    instructionText: input.instructionText,
    currentSlides: input.currentSlides,
    mergedSlides,
    alreadySanitized: true,
  });
}

function elementPatchTargetHintsFromCommentAttachments(
  commentAttachments: readonly ChatCommentAttachment[],
): ElementPatchTargetHint[] {
  const hints: ElementPatchTargetHint[] = [];
  for (const attachment of commentAttachments) {
    if (isScreenshotOnlyVisualCommentTarget(attachment)) {
      hints.push({
        targetIds: [],
        ...(typeof attachment.slideIndex === 'number' &&
        Number.isInteger(attachment.slideIndex) &&
        attachment.slideIndex >= 0
          ? { slideIndex: Math.floor(attachment.slideIndex) }
          : {}),
        id: attachment.elementId,
        currentText: attachment.currentText,
        instructionText: attachment.comment,
        htmlHint: attachment.htmlHint,
        selector: attachment.selector,
      });
      continue;
    }
    const targetIds = scopedCommentElementIds(attachment);
    if (targetIds.length === 0) {
      // Visual+DOM without resolvable ids still contributes slide/context hints.
      if (!isVisualCommentAttachment(attachment)) continue;
    }
    hints.push({
      targetIds,
      ...(typeof attachment.slideIndex === 'number' &&
      Number.isInteger(attachment.slideIndex) &&
      attachment.slideIndex >= 0
        ? { slideIndex: Math.floor(attachment.slideIndex) }
        : {}),
      id: attachment.elementId,
      currentText: attachment.currentText,
      instructionText: attachment.comment,
      htmlHint: attachment.htmlHint,
      selector: attachment.selector,
    });
  }
  return hints;
}

/**
 * True when a body claimed to be `<artifact type="element-patch">` in
 * fact looks like deck-patch content — the model produced
 * `<section class="slide" data-slide-index="N">…</section>` inside
 * the wrong wrapper. Detect this so we can salvage the response by
 * routing the same body through `tryApplyDeckPatchAgainstCurrentDeck`
 * instead of rejecting the whole edit as a parse failure.
 */
export function elementPatchBodyLooksLikeDeckPatch(body: string | null | undefined): boolean {
  const source = String(body ?? '');
  if (!source.trim()) return false;
  return /<section\b[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*')/i.test(
    source,
  );
}

/**
 * True when the element-patch parse failure reason indicates the
 * model emitted the artifact wrapper but no actual patches inside
 * (empty body or non-<patch> filler content). These responses are a
 * model glitch — the user's edit intent was recognized, the artifact
 * type was picked, but the content vanished. Auto-continue handles
 * this class of "incomplete deliverable" naturally, so we route
 * these through `skipped-incomplete` instead of surfacing them as a
 * scope violation.
 */
function routeScopedCommentPersistFailure(input: {
  fileName: string;
  code: ScopedDeckPersistFailureCode;
  reason: string;
  runIsScoped: boolean;
  logLabel: string;
}): Extract<ArtifactPersistResult, { kind: 'skipped-incomplete' | 'scope-rejected' }> {
  if (input.runIsScoped && shouldRouteScopedCommentEditToAutoContinue(input.code, input.reason)) {
    devLog.warn(`[${input.logLabel}] routing scoped edit to auto-continue`, {
      fileName: input.fileName,
      code: input.code,
      reason: input.reason,
    });
    return {
      kind: 'skipped-incomplete',
      fileName: input.fileName,
      reason: input.reason,
    };
  }
  return {
    kind: 'scope-rejected',
    fileName: input.fileName,
    code: input.code,
    reason: input.reason,
  };
}

export function isElementPatchEmptyBody(reason: string): boolean {
  return (
    reason === 'empty element-patch body' ||
    reason === 'no <patch> blocks in element-patch body' ||
    // Model emitted `<patch … kind="set-text"></patch>` (empty body) or
    // invalid set-style JSON — same recovery path as a missing patch block.
    reason.startsWith('element-patch could not parse ')
  );
}

/**
 * True when a `<artifact type="deck-patch">` body carries no
 * `<section class="slide">` blocks at all — the wrapper is present
 * but there is nothing to merge. Equivalent to the empty
 * element-patch case; for a scoped comment run we treat this as an
 * incomplete deliverable and route to auto-continue instead of a
 * scary "선택 대상 밖 변경" banner.
 */
export function isDeckPatchEmptyBody(body: string, reason: string): boolean {
  if (reason !== 'no <section class="slide"> blocks in deck-patch body') return false;
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return true;
  return !/<patch\b/i.test(trimmed);
}

/**
 * True when the deck-patch parse failed and the body actually looks
 * like element-patch content (contains `<patch>` blocks and no
 * `<section class="slide">` wrapper). Symmetric to
 * `elementPatchBodyLooksLikeDeckPatch` — covers the reverse model
 * glitch where the artifact type is off-by-one for the content shape.
 */
export function deckPatchBodyLooksLikeElementPatch(body: string | null | undefined): boolean {
  const source = String(body ?? '');
  if (!source.trim()) return false;
  if (/<section\b[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*')/i.test(source)) {
    return false;
  }
  // Allow ">" inside quoted attrs (dom:body > section… target-ids).
  return /<patch\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.test(source);
}


async function tryApplyDeckPatchAgainstCurrentDeck(input: {
  projectId: string;
  fileName: string;
  patchBody: string;
  allowedSlideIndexes?: readonly number[];
  commentAttachments?: readonly ChatCommentAttachment[];
  instructionText?: string;
  /** When set, skip a second disk fetch (persistArtifact cache). */
  currentHtml?: string | null;
  /** Pre-materialized sections from persist reconcile. */
  currentSlides?: readonly { outerHtml: string; openTag: string }[];
}): Promise<DeckPatchMergeResult> {
  // Fetch current deck first so parse can recover missing
  // `data-slide-index` via data-screen-label / comment scope.
  const currentHtml = input.currentHtml !== undefined
    ? input.currentHtml
    : await fetchProjectFileText(input.projectId, input.fileName, {
      cache: 'no-store',
    });
  if (!currentHtml) {
    devLog.warn('[deck-patch] current deck file unreadable', {
      projectId: input.projectId,
      fileName: input.fileName,
    });
    return {
      ok: false,
      code: 'deck_patch_current_unreadable',
      reason: 'current deck file unreadable',
    };
  }
  const parsed = parseDeckPatchWithSalvage(input.patchBody, {
    fallbackSlideIndexes: input.allowedSlideIndexes,
    currentHtml,
  });
  if (!parsed.ok) {
    const grafted = input.commentAttachments
      ? graftVisualMarksIntoDeckHtml(currentHtml, input.commentAttachments, {
        currentSlides: input.currentSlides,
      })
      : null;
    if (grafted) {
      devLog.warn('[deck-patch] applied client visual-mark graft fallback', {
        fileName: input.fileName,
        parseReason: parsed.reason,
      });
      // graftVisualMarksIntoDeckHtml already full-source sanitized.
      return { ok: true, html: grafted, sanitized: true };
    }
    const visualTemplate = input.commentAttachments
      ? buildConcreteDeckPatchTemplateForVisualMarks(input.commentAttachments)
      : null;
    if (visualTemplate) {
      const salvaged = parseDeckPatchWithSalvage(visualTemplate, {
        fallbackSlideIndexes: input.allowedSlideIndexes,
        currentHtml,
      });
      if (salvaged.ok) {
        const salvagedResult = applyScopedDeckPatchToHtml({
          currentHtml,
          patch: salvaged.patch,
          allowedSlideIndexes: input.allowedSlideIndexes,
          commentAttachments: input.commentAttachments,
          instructionText: input.instructionText,
          currentSlides: input.currentSlides,
        });
        if (salvagedResult.ok) {
          devLog.warn('[deck-patch] applied client visual-mark template fallback', {
            fileName: input.fileName,
            parseReason: parsed.reason,
          });
          return salvagedResult;
        }
      }
    }
    // Symmetric salvage: the model wrapped element-patch content
    // (a list of `<patch>` blocks) in a `deck-patch` artifact by
    // mistake. Route the same body through the element-patch
    // pipeline so we still narrow to the comment target instead of
    // failing with a scary "선택 대상 밖 변경" banner. Mirrors the
    // `elementPatchBodyLooksLikeDeckPatch` salvage in
    // `tryApplyElementPatchesAgainstCurrentDeck`.
    if (deckPatchBodyLooksLikeElementPatch(input.patchBody)) {
      devLog.warn('[deck-patch] body looks like element-patch — falling back', {
        fileName: input.fileName,
        parseReason: parsed.reason,
      });
      return await tryApplyElementPatchesAgainstCurrentDeck({
        projectId: input.projectId,
        fileName: input.fileName,
        patchBody: input.patchBody,
        allowedSlideIndexes: input.allowedSlideIndexes,
        commentAttachments: input.commentAttachments,
        instructionText: input.instructionText,
        currentHtml,
        currentSlides: input.currentSlides,
      });
    }
    devLog.warn('[deck-patch] parse failed', { fileName: input.fileName, reason: parsed.reason });
    return { ok: false, code: 'deck_patch_parse_failed', reason: parsed.reason };
  }
  const result = applyScopedDeckPatchToHtml({
    currentHtml,
    patch: parsed.patch,
    allowedSlideIndexes: input.allowedSlideIndexes,
    commentAttachments: input.commentAttachments,
    instructionText: input.instructionText,
    currentSlides: input.currentSlides,
  });
  if (!result.ok) {
    devLog.warn('[deck-patch] scoped deck patch failed', {
      fileName: input.fileName,
      code: result.code,
      reason: result.reason,
      allowedSlideIndexes: input.allowedSlideIndexes,
    });
  }
  return result;
}

async function resolvePersistCommentScope(input: {
  projectId: string;
  fileName: string;
  commentAttachments: readonly ChatCommentAttachment[];
  /** When set, skip a second disk fetch (persistArtifact cache). */
  currentHtml?: string | null;
}): Promise<{
  attachments: readonly ChatCommentAttachment[];
  allowedSlideIndexes?: number[];
  sections?: readonly { outerHtml: string; openTag: string }[];
}> {
  if (input.commentAttachments.length === 0) {
    return { attachments: input.commentAttachments };
  }
  const currentHtml = input.currentHtml !== undefined
    ? input.currentHtml
    : await fetchProjectFileText(input.projectId, input.fileName, {
      cache: 'no-store',
    });
  if (!currentHtml) {
    return {
      attachments: input.commentAttachments,
      allowedSlideIndexes: scopedCommentSlideIndexesFromAttachments(input.commentAttachments),
    };
  }
  // One pass: reconcile attachments + allowed slide indexes (was reconcile then
  // scopedCommentSlideIndexesFromDeck with duplicate candidate/infer walks).
  return reconcileCommentScopeForPersist(currentHtml, input.commentAttachments);
}

async function fullDeckEditStaysInsideCommentScope(input: {
  projectId: string;
  fileName: string;
  nextHtml: string;
  allowedSlideIndexes: readonly number[];
  commentAttachments: readonly ChatCommentAttachment[];
  /** When set, skip a second disk fetch (persistArtifact cache). */
  currentHtml?: string | null;
  /** Pre-materialized current sections from persist reconcile. */
  beforeSlides?: readonly { outerHtml: string }[];
}): Promise<
  | { ok: true; afterSlides: ReturnType<typeof extractTopLevelSlideSections> }
  | {
    ok: false;
    code: ScopedDeckPersistFailureCode;
    reason: string;
    /** Present once nextHtml sections were materialized (salvage reuse). */
    afterSlides?: ReturnType<typeof extractTopLevelSlideSections>;
  }
> {
  const currentHtml = input.currentHtml !== undefined
    ? input.currentHtml
    : await fetchProjectFileText(input.projectId, input.fileName, {
      cache: 'no-store',
    });
  if (!currentHtml) {
    devLog.warn('[deck-patch] scoped full-deck guard could not read current deck', {
      projectId: input.projectId,
      fileName: input.fileName,
    });
    return {
      ok: false,
      code: 'full_deck_current_unreadable',
      reason: 'current deck file unreadable',
    };
  }
  let allowedSlideIndexes = [...input.allowedSlideIndexes];
  // Prefer persist-reconcile sections; empty-allowed still reconciles once.
  let beforeSlides = input.beforeSlides;
  if (allowedSlideIndexes.length === 0) {
    // Prefer the same one-pass persist-scope walk used elsewhere (reconcile +
    // candidates + infer) instead of a second scopedCommentSlideIndexesFromDeck.
    const scope = reconcileCommentScopeForPersist(currentHtml, input.commentAttachments);
    const inferred = scope.allowedSlideIndexes;
    beforeSlides = beforeSlides ?? scope.sections;
    if (inferred && inferred.length > 0) {
      allowedSlideIndexes = inferred;
    } else {
      return {
        ok: false,
        code: 'comment_scope_missing_slide',
        reason: 'comment attachments did not include a valid slide index',
      };
    }
  }
  // Materialize after once; share into slide diff + salvage on reject.
  const afterSlides = extractTopLevelSlideSections(extractDeckBodyContent(input.nextHtml));
  const diff = diffDeckSlideIndexes(currentHtml, input.nextHtml, {
    beforeSlides,
    afterSlides,
  });
  if (!diff.ok) {
    devLog.warn('[deck-patch] scoped full-deck guard could not diff deck', {
      fileName: input.fileName,
      reason: diff.reason,
    });
    return { ok: false, code: 'full_deck_diff_failed', reason: diff.reason, afterSlides };
  }
  const allowed = new Set(allowedSlideIndexes);
  const outsideScope = diff.changedSlideIndexes.filter((slideIndex) => !allowed.has(slideIndex));
  if (outsideScope.length > 0) {
    devLog.warn('[deck-patch] scoped full-deck guard rejected outside-scope changes', {
      fileName: input.fileName,
      changedSlideIndexes: diff.changedSlideIndexes,
      allowedSlideIndexes,
    });
    return {
      ok: false,
      code: 'full_deck_outside_slide_scope',
      reason: `changed slides outside comment scope: ${outsideScope.join(', ')}`,
      afterSlides,
    };
  }
  const hasElementScopedComment = input.commentAttachments.some((attachment) =>
    scopedCommentElementIds(attachment).length > 0,
  );
  // One parse of nextHtml for intent; mask mutates a clone when element-scoped.
  const nextDoc = parseManualEditSource(input.nextHtml);
  // Visual / id-less comments have nothing to mask — skip 2× full-deck parse.
  if (hasElementScopedComment) {
    const beforeMasked = maskScopedCommentTargets(currentHtml, input.commentAttachments);
    const afterMaskDoc = nextDoc
      ? (nextDoc.cloneNode(true) as Document)
      : null;
    const afterMasked = maskScopedCommentTargets(
      input.nextHtml,
      input.commentAttachments,
      afterMaskDoc,
    );
    const targetUnresolved = !beforeMasked.ok
      || !afterMasked.ok
      || beforeMasked.maskedCount === 0
      || beforeMasked.maskedCount !== afterMasked.maskedCount;
    if (targetUnresolved) {
      devLog.warn('[deck-patch] scoped full-deck guard rejected unresolved comment target', {
        fileName: input.fileName,
        beforeMaskedCount: beforeMasked.ok ? beforeMasked.maskedCount : 0,
        afterMaskedCount: afterMasked.ok ? afterMasked.maskedCount : 0,
      });
      return {
        ok: false,
        code: 'full_deck_comment_target_unresolved',
        reason: 'comment target could not be resolved in the current and updated deck',
        afterSlides,
      };
    }
    if (
      beforeMasked.ok &&
      afterMasked.ok &&
      beforeMasked.maskedCount > 0 &&
      beforeMasked.maskedCount === afterMasked.maskedCount &&
      beforeMasked.source !== afterMasked.source
    ) {
      devLog.warn('[deck-patch] scoped full-deck guard rejected non-target changes inside target slide', {
        fileName: input.fileName,
        maskedCount: beforeMasked.maskedCount,
      });
      return {
        ok: false,
        code: 'full_deck_outside_element_scope',
        reason: 'non-target changes inside the selected slide',
        afterSlides,
      };
    }
  }
  // Match deck/element-patch: presentation-only edits must not wipe pinned text
  // even when the full-deck rewrite stays inside slide/mask scope.
  const intent = validateCommentEditIntentRespected({
    mergedHtml: input.nextHtml,
    commentAttachments: input.commentAttachments,
    parsedDoc: nextDoc,
  });
  if (!intent.ok) {
    return {
      ok: false,
      code: 'comment_edit_intent_violated',
      reason: intent.reason,
      afterSlides,
    };
  }
  return { ok: true, afterSlides };
}

async function trySalvageScopedFullDeckRewrite(input: {
  projectId: string;
  fileName: string;
  patchedHtml: string;
  commentAttachments: readonly ChatCommentAttachment[];
  instructionText?: string;
  /** When set, skip a second disk fetch (persistArtifact cache). */
  currentHtml?: string | null;
  /** Pre-materialized current sections from persist reconcile. */
  currentSlides?: readonly { outerHtml: string; openTag?: string }[];
  /** Pre-materialized patched sections from full-deck guard (avoid rematerialize). */
  patchedSlides?: readonly { outerHtml: string; openTag?: string }[];
}): Promise<{ ok: true; html: string; sanitized: true } | { ok: false; reason: string }> {
  const currentHtml = input.currentHtml !== undefined
    ? input.currentHtml
    : await fetchProjectFileText(input.projectId, input.fileName, {
      cache: 'no-store',
    });
  if (!currentHtml) {
    return { ok: false, reason: 'current deck file unreadable' };
  }
  // Prefer guard-shared sections; otherwise materialize once for merge + finalize.
  const patchedSlides = input.patchedSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(input.patchedHtml));
  const scoped = mergeScopedCommentTargetsFromPatchedDeck({
    currentHtml,
    patchedHtml: input.patchedHtml,
    commentAttachments: input.commentAttachments,
    instructionText: input.instructionText,
    currentSlides: input.currentSlides,
    patchedSlides,
  });
  if (!scoped.ok) {
    return { ok: false, reason: scoped.reason };
  }
  if (!scoped.narrowed) {
    return { ok: false, reason: 'full-deck rewrite produced no narrowed scoped match' };
  }
  // Mirror applyScopedDeckPatchToHtml finalize (intent + stabilize + sanitize fold).
  const finalized = finalizeScopedDeckMergeHtml({
    currentHtml,
    mergedHtml: scoped.html,
    commentAttachments: input.commentAttachments,
    instructionText: input.instructionText,
    currentSlides: input.currentSlides,
    mergedSlides: scoped.sections,
  });
  if (!finalized.ok) {
    return { ok: false, reason: finalized.reason };
  }
  return { ok: true, html: finalized.html, sanitized: true };
}

function maskScopedCommentTargets(
  source: string,
  commentAttachments: readonly ChatCommentAttachment[],
  /** When set, mutate this Document (caller may pass a clone of a shared parse). */
  parsedDoc?: Document | null,
): { ok: true; source: string; maskedCount: number } | { ok: false } {
  // One DOMParser pass for all attachments (was N× parse/serialize).
  const doc = parsedDoc ?? parseManualEditSource(source);
  if (!doc) return { ok: false };
  let maskedCount = 0;
  for (const attachment of commentAttachments) {
    if (
      !(
        typeof attachment.slideIndex === 'number' &&
        Number.isInteger(attachment.slideIndex) &&
        attachment.slideIndex >= 0
      )
    ) {
      continue;
    }
    const ids = scopedCommentElementIds(attachment);
    if (ids.length === 0) continue;
    // Reuse the same hint set the scoped merge uses so the mask
    // path resolves the target via currentText/htmlHint/selector when the
    // click id no longer maps structurally. Symmetric with
    // mergeScopedCommentTargetsFromPatchedDeck / attachmentMergeHint.
    const hints = ids.map((id) => ({
      id,
      ...attachmentMergeHint(attachment),
    }));
    maskedCount += maskManualEditTargetsOnDocument(
      doc,
      ids,
      { slideIndex: Math.floor(attachment.slideIndex) },
      hints,
      maskedCount,
    );
  }
  if (maskedCount === 0) return { ok: false };
  return {
    ok: true,
    source: serializeManualEditSource(doc, source),
    maskedCount,
  };
}

function historyWithWorkspaceContext(
  history: ChatMessage[],
  messageId: string,
  context: ChatSendMeta['context'] | undefined,
): ChatMessage[] {
  const items = context?.workspaceItems ?? [];
  if (items.length === 0) return history;
  const block = [
    '',
    '',
    '<active-workspace-context>',
    'Open Design selected the currently focused workspace tab as the default context for this turn.',
    ...items.map((item, index) => {
      const details = [
        item.path ? `path: ${item.path}` : null,
        item.absolutePath && !isTeamverEmbedMode()
          ? `absolute: ${item.absolutePath}`
          : null,
        item.url ? `url: ${item.url}` : null,
        item.title ? `title: ${item.title}` : null,
        item.tabId ? `tab: ${item.tabId}` : null,
      ].filter(Boolean).join(' | ');
      return `${index + 1}. ${item.kind}: ${item.label}${details ? ` | ${details}` : ''}`;
    }),
    '</active-workspace-context>',
  ].join('\n');
  return history.map((message) =>
    message.id === messageId && message.role === 'user'
      ? { ...message, content: `${message.content}${block}` }
      : message,
  );
}

function commentTaskQuery(attachment: ChatCommentAttachment): string {
  return (attachment.comment ?? '').trim();
}

/** Drawing screenshots uploaded with this user turn are not assistant output. */
function userVisualUploadBaselineNames(
  attachments: readonly ChatCommentAttachment[],
): string[] {
  const names: string[] = [];
  for (const attachment of attachments) {
    const screenshot = String(attachment.screenshotPath || '').trim();
    if (screenshot) {
      names.push(projectFilePathBasename(screenshot));
      names.push(screenshot);
    }
  }
  return names;
}

function designSystemNeedsWorkPrompt(
  sectionTitle: string,
  feedback: string,
  sectionFiles: string[],
): string {
  const fileList =
    sectionFiles.length > 0
      ? sectionFiles.map((name) => `- @${name}`).join('\n')
      : '- No generated files are registered for this section yet.';
  return (
    `Needs work on the design system section "${sectionTitle}".\n\n` +
    `User feedback:\n${feedback}\n\n` +
    `Relevant section files:\n${fileList}\n\n` +
    'Revise the design-system project files directly. Keep DESIGN.md, tokens, previews, UI kit examples, and assets consistent with the feedback. ' +
    'After editing, summarize what changed and which files should be reviewed again.'
  );
}

function readSavedChatPanelWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_CHAT_PANEL_WIDTH;
  try {
    const raw = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed)
      ? clampPreferredChatPanelWidth(parsed)
      : DEFAULT_CHAT_PANEL_WIDTH;
  } catch {
    return DEFAULT_CHAT_PANEL_WIDTH;
  }
}

function saveChatPanelWidth(width: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CHAT_PANEL_WIDTH_STORAGE_KEY,
      String(clampPreferredChatPanelWidth(width)),
    );
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
}

/** Reattach design-template / skill registry description lost at frontmatter strip. */
function prependSkillDetailVisualSummary(
  body: string,
  description: string | null | undefined,
): string {
  const trimmedBody = body.trim();
  const desc = typeof description === 'string' ? description.trim() : '';
  if (!trimmedBody || !desc) return trimmedBody;
  if (
    trimmedBody.includes('## Visual summary (from template frontmatter)')
    || trimmedBody.includes(desc)
  ) {
    return trimmedBody;
  }
  return `## Visual summary (from template frontmatter)\n\n${desc}\n\n${trimmedBody}`;
}

function autoSendFirstMessageKey(projectId: string): string {
  return `od:auto-send-first:${projectId}`;
}

function autoSendAttachmentsKey(projectId: string): string {
  return `od:auto-send-attachments:${projectId}`;
}

function designSystemAuditAutoRepairKey(projectId: string): string {
  return `od:design-system-audit-auto-repair:${projectId}`;
}

function readAutoSendAttachments(projectId: string): ChatAttachment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(autoSendAttachmentsKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredChatAttachment);
  } catch {
    return [];
  }
}

function clearAutoSendSession(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(autoSendFirstMessageKey(projectId));
    window.sessionStorage.removeItem(autoSendAttachmentsKey(projectId));
  } catch {
    /* ignore */
  }
}

function markDesignSystemAuditAutoRepairEligible(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      designSystemAuditAutoRepairKey(projectId),
      String(DESIGN_SYSTEM_AUDIT_AUTO_REPAIR_ATTEMPTS),
    );
  } catch {
    /* ignore */
  }
}

function consumeDesignSystemAuditAutoRepair(projectId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = designSystemAuditAutoRepairKey(projectId);
    const raw = window.sessionStorage.getItem(key);
    const attemptsRemaining = raw ? Number.parseInt(raw, 10) : 0;
    if (!Number.isFinite(attemptsRemaining) || attemptsRemaining <= 0) {
      window.sessionStorage.removeItem(key);
      return false;
    }
    const nextAttemptsRemaining = attemptsRemaining - 1;
    if (nextAttemptsRemaining > 0) {
      window.sessionStorage.setItem(key, String(nextAttemptsRemaining));
    } else {
      window.sessionStorage.removeItem(key);
    }
    return true;
  } catch {
    return false;
  }
}

function clearDesignSystemAuditAutoRepair(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(designSystemAuditAutoRepairKey(projectId));
  } catch {
    /* ignore */
  }
}

function isDesignSystemWorkspaceMetadata(metadata: ProjectMetadata | undefined): boolean {
  return metadata?.importedFrom === 'design-system';
}

function isStoredChatAttachment(value: unknown): value is ChatAttachment {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === 'string' &&
    record.path.length > 0 &&
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    (record.kind === 'image' || record.kind === 'file') &&
    (record.size === undefined || typeof record.size === 'number') &&
    (record.order === undefined || typeof record.order === 'number')
  );
}

function workspaceContextItemEqual(
  a: WorkspaceContextItem | null,
  b: WorkspaceContextItem | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.label === b.label &&
    (a.tabId ?? '') === (b.tabId ?? '') &&
    (a.path ?? '') === (b.path ?? '') &&
    (a.absolutePath ?? '') === (b.absolutePath ?? '') &&
    (a.url ?? '') === (b.url ?? '') &&
    (a.title ?? '') === (b.title ?? '')
  );
}

function workspaceContextItemsEqual(
  a: WorkspaceContextItem[],
  b: WorkspaceContextItem[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => workspaceContextItemEqual(item, b[index] ?? null));
}

function appendLiveArtifactEventItem(
  prev: LiveArtifactEventItem[],
  event: LiveArtifactEventItem['event'],
): LiveArtifactEventItem[] {
  liveArtifactEventSequence += 1;
  const next = [...prev, { id: liveArtifactEventSequence, event }];
  return next.length > 50 ? next.slice(next.length - 50) : next;
}

export function projectSplitClassName(workspaceFocused: boolean): string {
  return workspaceFocused ? 'split split-focus' : 'split';
}

// React key for the on-screen question form. Deliberately does NOT include the
// form's parsed `id`: there is at most one (first) form per assistant message,
// so `${conversation}:${message}` is already a stable, unique identity for the
// occurrence. Folding the parsed id in would remount the panel mid-stream — the
// preview shows the `discovery` fallback until the body `id` streams in, and a
// form that emits answerable questions before its `id` would flip identity
// while the user is mid-answer, dropping their selections. A distinct later
// form lives in a different assistant message, so it still gets its own key
// (and replays the reveal) without relying on the id.
export function buildQuestionFormKey(
  conversationId: string | null,
  assistantMessageId: string | null,
  hasForm: boolean,
): string | null {
  return conversationId && assistantMessageId && hasForm
    ? `${conversationId}:${assistantMessageId}`
    : null;
}

type ProjectSplitStyle = CSSProperties & {
  '--project-chat-panel-width': string;
  '--project-workspace-panel-track': string;
};

export function projectSplitStyle(
  workspaceFocused: boolean,
  chatPanelWidth: number,
  workspacePanelTrack: string,
): ProjectSplitStyle | undefined {
  if (workspaceFocused) return undefined;
  return {
    '--project-chat-panel-width': `${chatPanelWidth}px`,
    '--project-workspace-panel-track': workspacePanelTrack,
    gridTemplateColumns: `${chatPanelWidth}px ${SPLIT_RESIZE_HANDLE_WIDTH}px ${workspacePanelTrack}`,
  };
}

function applySplitChatPanelWidth(
  split: HTMLDivElement | null,
  width: number,
  workspacePanelTrack: string,
): void {
  if (!split) return;
  split.style.setProperty('--project-chat-panel-width', `${width}px`);
  split.style.gridTemplateColumns =
    `${width}px ${SPLIT_RESIZE_HANDLE_WIDTH}px ${workspacePanelTrack}`;
}

function shouldFetchElevenLabsVoiceOptions(project: Project): boolean {
  const metadata = project.metadata;
  return metadata?.kind === 'audio'
    && metadata.audioKind === 'speech'
    && metadata.audioModel === 'elevenlabs-v3'
    && !metadata.voice;
}

// The media model the user picked in the New Project → Media dialog, keyed by
// surface. For BYOK providers (AIHubMix) media is produced by the generate_*
// chat tools whose default model comes from the per-request byok*Model field —
// NOT the `od media generate` dispatcher — so without this seed the dialog pick
// is dropped and the conversation falls back to the Settings default. Returns
// undefined for non-media projects (and when the field is empty) so callers fall
// back to the Settings default exactly as before. The daemon re-validates the id
// against the active provider's registry, so a mismatched pick is safely ignored.
function projectMediaModelSeed(
  metadata: ProjectMetadata | null | undefined,
  surface: 'image' | 'video' | 'speech',
): string | undefined {
  if (!metadata) return undefined;
  if (surface === 'image' && metadata.kind === 'image') {
    return metadata.imageModel?.trim() || undefined;
  }
  if (surface === 'video' && metadata.kind === 'video') {
    return metadata.videoModel?.trim() || undefined;
  }
  if (surface === 'speech' && metadata.kind === 'audio' && metadata.audioKind === 'speech') {
    return metadata.audioModel?.trim() || undefined;
  }
  return undefined;
}

function projectMediaVoiceSeed(
  metadata: ProjectMetadata | null | undefined,
): string | undefined {
  if (metadata?.kind === 'audio' && metadata.audioKind === 'speech') {
    return metadata.voice?.trim() || undefined;
  }
  return undefined;
}

// Carry the creation-time model pick into the conversation ONLY when it belongs
// to the active BYOK provider. Guards against clobbering a user's Settings
// default with a model from a different provider — e.g. a SenseAudio user whose
// image project was created with the dialog's default `gpt-image-2` keeps their
// configured SenseAudio model instead of being forced to the registry default.
// AIHubMix's live (`aihubmix-` prefixed) ids resolve via mediaModelProviderId
// without waiting on the async catalogue, so the AIHubMix path still seeds.
function byokModelSeedForProtocol(
  metadata: ProjectMetadata | null | undefined,
  surface: 'image' | 'video' | 'speech',
  protocol: string | undefined,
): string | undefined {
  const picked = projectMediaModelSeed(metadata, surface);
  if (!picked) return undefined;
  return mediaModelProviderId(picked) === protocol ? picked : undefined;
}

function projectEventToAgentEvent(evt: ProjectEvent): LiveArtifactEventItem['event'] | null {
  if (evt.type === 'file-changed') return null;
  if (evt.type === 'conversation-created') return null;
  if (evt.type === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: evt.action,
      projectId: evt.projectId,
      artifactId: evt.artifactId,
      title: evt.title,
      refreshStatus: evt.refreshStatus,
    };
  }
  return {
    kind: 'live_artifact_refresh',
    phase: evt.phase,
    projectId: evt.projectId,
    artifactId: evt.artifactId,
    refreshId: evt.refreshId,
    title: evt.title,
    refreshedSourceCount: evt.refreshedSourceCount,
    error: evt.error,
  };
}

type ArtifactPersistResult =
  | { kind: 'persisted'; fileName: string; parentRevisionId?: string | null }
  | { kind: 'pointer'; fileName: string }
  | { kind: 'skipped-duplicate'; fileName: string }
  | { kind: 'skipped-incomplete'; fileName: string; reason?: string }
  /** Benign no-op (post-sanitize equals disk) — must not arm auto-continue. */
  | { kind: 'skipped-noop'; fileName: string; reason?: string }
  | { kind: 'scope-rejected'; fileName: string; code: ScopedDeckPersistFailureCode; reason: string }
  | { kind: 'artifact-regression'; fileName: string; reason: string }
  | { kind: 'rejected'; fileName: string; reason: string }
  | { kind: 'save-failed'; fileName: string; status?: number; code?: string; message?: string }
  | { kind: 'auth-replay-queued'; fileName: string }
  | { kind: 'skipped-discovery-turn'; fileName: string };

export function shouldFailRunForArtifactPersistResult(
  result: ArtifactPersistResult | null,
  options?: { scopedCommentEdit?: boolean },
): boolean {
  // A truncated shell, a structural refusal, or a real write failure must
  // move the run into the recovery path. Auth-replay-queued keeps the run
  // as succeeded visually because memory preview + replay own that case.
  // Scoped comment edits that hit skipped-duplicate mean the model turn
  // produced HTML identical to disk — treat as incomplete so auto-continue
  // can retry instead of painting "완료됨" over an unchanged slide.
  // skipped-noop is intentionally excluded: the edit was a calm no-op.
  return result?.kind === 'skipped-incomplete'
    || result?.kind === 'rejected'
    || result?.kind === 'save-failed'
    || result?.kind === 'scope-rejected'
    || result?.kind === 'artifact-regression'
    || result?.kind === 'skipped-discovery-turn'
    || (result?.kind === 'skipped-duplicate' && options?.scopedCommentEdit);
}

const ARTIFACT_REGRESSION_MIN_PRIOR_BYTES = 8192;
const ARTIFACT_REGRESSION_MIN_RATIO = 0.35;

function countDeckSlideSections(html: string): number {
  // Must match applyDeckPatch / extractSlideByIndex: naive `[^>]*` regexes undercount
  // when slide open-tags contain `>` inside quoted attrs (style calc/content).
  return extractTopLevelSlideSections(extractDeckBodyContent(html)).length;
}

function findClientArtifactRegression(input: {
  fileName: string;
  htmlBody: string;
  projectFiles: readonly ProjectFile[];
}): { fileName: string; priorSize: number; newSize: number; reason: string } | null {
  const fileName = input.fileName.trim();
  if (!fileName.toLowerCase().endsWith('.html')) return null;
  const newSize = new Blob([input.htmlBody]).size;
  const prior = input.projectFiles.find((file) => {
    const name = (file.path ?? file.name).trim();
    return name === fileName || file.name.trim() === fileName;
  });
  const priorSize = typeof prior?.size === 'number' && Number.isFinite(prior.size)
    ? prior.size
    : 0;
  if (priorSize < ARTIFACT_REGRESSION_MIN_PRIOR_BYTES) return null;
  if (newSize >= priorSize * ARTIFACT_REGRESSION_MIN_RATIO) return null;
  return {
    fileName,
    priorSize,
    newSize,
    reason:
      `New artifact body for "${fileName}" is ${newSize} bytes, but the current file is ${priorSize} bytes. ` +
      'This looks like a placeholder/regression and was not written over the existing deck.',
  };
}

/** Block full-deck writes that collapse slide count (e.g. 8 → 2) even when byte size looks fine. */
export function findClientSlideCountRegression(input: {
  fileName: string;
  htmlBody: string;
  priorHtml: string | null | undefined;
  /**
   * Existing-deck / image-embed / comment-scoped turns: reject ANY slide drop
   * (8→6 still destroys content). Greenfield generates keep the hard-collapse
   * threshold so intentional shorter drafts are not over-blocked.
   */
  strict?: boolean;
}): { fileName: string; priorCount: number; newCount: number; reason: string } | null {
  const fileName = input.fileName.trim();
  if (!fileName.toLowerCase().endsWith('.html')) return null;
  const priorHtml = input.priorHtml?.trim();
  if (!priorHtml) return null;
  const priorCount = countDeckSlideSections(priorHtml);
  const newCount = countDeckSlideSections(input.htmlBody);
  if (priorCount < 3 || newCount <= 0) return null;
  if (newCount >= priorCount) return null;
  const dropped = priorCount - newCount;
  const collapsedHard = input.strict
    ? dropped >= 1
    : newCount <= Math.floor(priorCount * 0.5) || dropped >= 3;
  if (!collapsedHard) return null;
  return {
    fileName,
    priorCount,
    newCount,
    reason:
      `New artifact for "${fileName}" has ${newCount} slides, but the current deck has ${priorCount}. ` +
      'Slide-count collapse was blocked so the existing deck is preserved.',
  };
}

export function ProjectView({
  project,
  routeFileName,
  routeConversationId = null,
  config,
  agents,
  skills,
  designTemplates,
  designSystems,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiModelChange,
  onRefreshAgents,
  onThemeChange,
  onOpenSettings,
  onOpenAmrSettings,
  onOpenMcpSettings,
  onBrowsePlugins,
  onOpenConnectors,
  onAdoptPetInline,
  onTogglePet,
  onOpenPetSettings,
  onBack,
  onClearPendingPrompt,
  onTouchProject,
  onProjectChange,
  onProjectsRefresh,
  onChangeDefaultDesignSystem,
  onDesignSystemsRefresh,
  embedSubmitDisabled = false,
  onEmbedSubmitBlocked,
}: Props) {
  const { locale } = useI18n();
  const t = useTeamverT();
  const analytics = useAnalytics();
  const {
    hideStudioExecutionControls,
    hideHandoffButton,
    hideLocalWorkspaceControls,
    hideExternalShareSurfaces,
    hideAssistantThinkingDetails,
    slideOnlyMvp,
    enabled: teamverEmbedEnabled,
  } = useTeamverBranding();
  const embedSlideDesignSystemFallbackId = useMemo(
    () =>
      isTeamverEmbedMode()
        ? resolveEmbedSlideDesignSystemId({
            explicitId: null,
            workspaceDefaultId: config.designSystemId,
            designSystems,
          })
        : null,
    [config.designSystemId, designSystems],
  );
  const iframeKeepAlivePool = useIframeKeepAlivePool();
  const handleThemeChange = onThemeChange ?? (() => {});
  // P0 page_view page_name=chat_panel — fire once per project mount.
  // ProjectView outlives conversation switches (ChatPane is keyed by
  // activeConversationId so it remounts when the user switches chats,
  // but this component does not), so page_view stays a "chat-panel
  // entry" metric instead of becoming a "conversation switch" count.
  // Reviewer #2285 (mrcfps, 2026-05-20 04:08) flagged the previous
  // ChatComposer-level emit for skewing the funnel.
  const chatPanelPageViewFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (chatPanelPageViewFiredRef.current === project.id) return;
    chatPanelPageViewFiredRef.current = project.id;
    trackPageView(analytics.track, { page_name: 'chat_panel' });
    // Onboarding's 4th step ("生成进度页") fires here, not in
    // `DesignSystemDetailView`: the Generate path navigates
    // straight to the project's chat_panel, not to the design
    // system detail surface. If an onboarding session id is still
    // in sessionStorage we stamp the funnel's last row here and
    // clear so any later DS visit doesn't inherit the attribution.
    // E2E (2026-05-21) confirmed this is the only path users
    // actually take — observed: page_view chat_panel fires, but
    // page_view design_system_project never did because that
    // route isn't visited from the embedded onboarding generate.
    const onboardingSessionId = peekOnboardingSessionId();
    if (onboardingSessionId) {
      trackPageView(analytics.track, {
        page_name: 'onboarding',
        area: 'generation_progress',
        step_index: 'progress',
        step_name: 'generation',
        onboarding_session_id: onboardingSessionId,
      });
      clearOnboardingSessionId();
    }
  }, [analytics.track, project.id]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );
  const activeSessionMode = activeConversation?.sessionMode ?? 'design';
  const [messagesConversationId, setMessagesConversationId] = useState<string | null>(null);
  const [failedMessagesConversationId, setFailedMessagesConversationId] = useState<string | null>(null);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [messageLoadRetryNonce, setMessageLoadRetryNonce] = useState(0);
  const [conversationLoadRetryNonce, setConversationLoadRetryNonce] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
  const [activePluginActionPaths, setActivePluginActionPaths] = useState<Set<string>>(() => new Set());
  const [hiddenAssistantPluginActionPaths, setHiddenAssistantPluginActionPaths] = useState<Set<string>>(() => new Set());
  const [forceStreamingPluginMessageIds, setForceStreamingPluginMessageIds] = useState<Set<string>>(() => new Set());
  // Ephemeral, live-only accumulation of a tool call's streaming JSON input,
  // keyed by tool-use id (globally unique per run). Fed by `onToolInputDelta`
  // while the model is still emitting `input_json_delta`; dropped per-id once
  // the full `tool_use` lands and wiped when the run ends. Never persisted —
  // see daemon `daemonAgentPayloadToPersistedAgentEvent` (returns null).
  // `seq` records how many persisted events existed when the tool started
  // streaming, so the renderer can place the live card at the tool call's
  // position in the message (text before it = preamble, after it = hedging).
  const [liveToolInput, setLiveToolInput] = useState<Record<string, { name: string; text: string; seq: number }>>({});
  // True once the initial DB read for the active conversation has settled.
  // Auto-send gates on this so it can't fire before listMessages resolves and
  // race-clobber the freshly-pushed user + assistant placeholder. Without
  // this, the auto-send writes [user, assistant] into state, then the still
  // in-flight listMessages PUT response arrives, runs setMessages(list), and
  // wipes both — leaving the daemon's run with no client-side message to
  // attach the runId to.
  const [messagesInitialized, setMessagesInitialized] = useState(false);
  const [previewComments, setPreviewComments] = useState<PreviewComment[]>([]);
  // Mirror so the send-now interrupt path can read the current statuses
  // synchronously without re-creating its callback on every comment change.
  const previewCommentsRef = useRef<PreviewComment[]>([]);
  useEffect(() => {
    previewCommentsRef.current = previewComments;
  }, [previewComments]);
  const [attachedComments, setAttachedComments] = useState<PreviewComment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);
  const [runRecoveryBanner, setRunRecoveryBanner] = useState<{
    conversationId: string;
    phase: RunRecoveryBannerPhase;
    savedChars: number;
    runStatus: 'queued' | 'running';
  } | null>(null);
  const runRecoveryBannerTrackRef = useRef<{
    conversationId: string;
    assistantMessageId: string;
  } | null>(null);
  const [reattachNonce, setReattachNonce] = useState(0);
  // Safety net: drop any live tool-input partials whose tool never produced a
  // full `tool_use` (run errored/canceled mid-call) once streaming settles.
  useEffect(() => {
    if (!streaming) setLiveToolInput((prev) => (Object.keys(prev).length ? {} : prev));
  }, [streaming]);
  const [error, setError] = useState<string | null>(null);
  const [audioVoiceOptionsError, setAudioVoiceOptionsError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  // Post-refresh recovery snapshot for the memory-only preview fallback.
  // Seeded from sessionStorage when a previous run's persistArtifact hit a
  // daemon 401 and stashed the payload; kept in state so FileWorkspace can
  // render the deck while the auth-recovery replay retries the write. Cleared
  // by the replay effect on successful write (or by the user starting a new
  // run, which drops `artifact` state; see §persistArtifact + §replay effect).
  const [pendingRecoveryPreview, setPendingRecoveryPreview] = useState<{
    fileName: string;
    html: string;
  } | null>(() => {
    if (typeof window === 'undefined') return null;
    // NOTE: `project.id` is not stable across re-renders during the boot
    // pass; useState initializer runs once, so we seed lazily inside a
    // dedicated effect below to key off the current project id.
    return null;
  });
  const [filesRefresh, setFilesRefresh] = useState(0);
  // True while a working-dir replace is reindexing the new folder. Surfaced
  // to the Design Files panel so the file list shows a loading state instead
  // of silently sitting on the old tree for the few seconds the scan takes.
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const projectFilesRef = useRef<ProjectFile[]>([]);
  const [liveArtifacts, setLiveArtifacts] = useState<LiveArtifactSummary[]>([]);
  const [liveArtifactEvents, setLiveArtifactEvents] = useState<LiveArtifactEventItem[]>([]);
  const [workspaceFocused, setWorkspaceFocused] = useState(false);
  const [commentInspectorActive, setCommentInspectorActive] = useState(false);
  const commentInspectorPortalId = useId();
  const leftInspectorActive = commentInspectorActive;
  // Per-session override for the BYOK chat's generate_image tool. Seeded once
  // from the New Project → Media model pick (project.metadata.imageModel) — but
  // only when that pick belongs to the active BYOK provider (see
  // byokModelSeedForProtocol) — falling back to the Settings default
  // (config.byokImageModel) otherwise. Subsequent selections live only in this
  // component's state — page refresh / project switch resets to this seed.
  // Persistent defaults live in Settings → BYOK → Image generation model.
  const [byokImageModelOverride, setByokImageModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(project.metadata, 'image', config.apiProtocol) ?? config.byokImageModel ?? '',
  );
  // Same per-session override for the BYOK chat's generate_video tool, seeded
  // from the project's videoModel pick (provider-gated), then Settings.
  const [byokVideoModelOverride, setByokVideoModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(project.metadata, 'video', config.apiProtocol) ?? config.byokVideoModel ?? '',
  );
  // Same per-session overrides for the BYOK chat's generate_speech tool (model +
  // voice), seeded from the project's speech pick (provider-gated), then Settings.
  const [byokSpeechModelOverride, setByokSpeechModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(project.metadata, 'speech', config.apiProtocol) ?? config.byokSpeechModel ?? '',
  );
  // Voice only carries when the speech model itself is carried (same provider),
  // so a cross-provider voice id never leaks into the request.
  const [byokSpeechVoiceOverride, setByokSpeechVoiceOverride] = useState<string>(
    () => (byokModelSeedForProtocol(project.metadata, 'speech', config.apiProtocol)
      ? projectMediaVoiceSeed(project.metadata)
      : undefined) ?? config.byokSpeechVoice ?? '',
  );
  // Live model option lists (same hooks the composer/Settings pickers use) so
  // the chat "default" (no explicit pick) resolves to the FIRST catalogue model
  // shown in the dropdown — not a hardcoded id. The daemon keeps its own
  // fallback for when the catalogue hasn't loaded.
  const byokImageModelOptionsPV = useByokImageModelOptions(config.apiProtocol);
  const byokVideoModelOptionsPV = useByokVideoModelOptions(config.apiProtocol);
  const byokSpeechModelOptionsPV = useByokSpeechModelOptions(config.apiProtocol);
  // PR #974 round 7 (mrcfps @ useDesignMdState.ts:131): counter that
  // bumps on file-changed SSE events, live_artifact* events, and the
  // chat streaming-completion edge so the staleness chip stays in sync
  // with the underlying mtimes / conversation updatedAt as the user
  // keeps working post-finalize. The hook treats it as a dep and
  // recomputes whenever it changes.
  const [designMdRefreshKey, setDesignMdRefreshKey] = useState(0);
  // ----- Continue in CLI / Finalize design package wiring (#451) -----
  // The toast surface is shared between Finalize errors and the
  // success/fallback toasts emitted from handleContinueInCli.
  const projectDetail = useProjectDetail(project.id);
  const designFilesRootLabel = useMemo(() => {
    if (hideLocalWorkspaceControls) {
      return project.name.trim() || t('designFiles.crumbs');
    }
    const baseDir =
      projectDetail.project?.metadata?.baseDir ?? project.metadata?.baseDir;
    return typeof baseDir === 'string'
      ? baseDir.split(/[/\\]/).filter(Boolean).pop()
      : undefined;
  }, [
    hideLocalWorkspaceControls,
    project.name,
    project.metadata?.baseDir,
    projectDetail.project?.metadata?.baseDir,
    t,
  ]);
  const designMdState = useDesignMdState(project.id, designMdRefreshKey);
  const finalize = useFinalizeProject(project.id);
  const terminalLauncher = useTerminalLaunch();
  const [projectActionsToast, setProjectActionsToast] = useState<{
    message: string;
    details: string | null;
    code?: string | null;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [chatSeed, setChatSeed] = useState<{ id: string; value: string } | null>(null);
  const [autoAuditRepairSeed, setAutoAuditRepairSeed] =
    useState<{ id: string; value: string } | null>(null);
  const [chatPanelWidth, setChatPanelWidth] = useState(readSavedChatPanelWidth);
  const [chatPanelMaxWidth, setChatPanelMaxWidth] = useState(MAX_CHAT_PANEL_WIDTH);
  const [workspacePanelMinWidth, setWorkspacePanelMinWidth] = useState(MIN_WORKSPACE_PANEL_WIDTH);
  const [resizingChatPanel, setResizingChatPanel] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const chatPanelWidthRef = useRef(chatPanelWidth);
  const preferredChatPanelWidthRef = useRef(chatPanelWidth);
  const resizeStartPreferredWidthRef = useRef(chatPanelWidth);
  const chatPanelMaxWidthRef = useRef(chatPanelMaxWidth);
  const resizeStateRef = useRef<{
    startClientX: number;
    startWidth: number;
    isRtl: boolean;
    hasMoved: boolean;
  } | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pendingPointerClientXRef = useRef<number | null>(null);
  // The persisted set of open tabs + active tab. Persisted via PUT on every
  // change; loaded once when the project mounts.
  const [openTabsState, setOpenTabsState] = useState<OpenTabsState>({
    tabs: [],
    active: null,
  });
  // Artifact context for the header actions (settings gear, handoff) that live
  // in this workspace's header alongside FileViewer's present/share/download.
  // Mirrors the artifact_id / artifact_kind that FileViewer attaches, derived
  // from the currently-active file tab, so all artifact_header analytics carry
  // the same dimensions. Undefined on non-file tabs (e.g. the file list).
  const headerArtifact = useMemo<{
    artifact_id?: string;
    artifact_kind?: TrackingArtifactKind;
  }>(() => {
    const activeName = openTabsState.active;
    const file = activeName
      ? projectFiles.find((entry) => entry.name === activeName) ?? null
      : null;
    if (!file) return {};
    return {
      artifact_id: anonymizeArtifactId({ projectId: project.id, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    };
  }, [openTabsState.active, projectFiles, project.id]);
  const routeFileNameRef = useRef(routeFileName);
  routeFileNameRef.current = routeFileName;
  const [activeWorkspaceContext, setActiveWorkspaceContext] =
    useState<WorkspaceContextItem | null>(null);
  const [workspaceContexts, setWorkspaceContexts] = useState<WorkspaceContextItem[]>([]);
  const tabsLoadedRef = useRef(false);
  const tabsHydratedFromSavedStateRef = useRef(false);
  const hasAppliedInitialPrimaryOpenRef = useRef(false);
  const openTabsStateRef = useRef(openTabsState);
  useEffect(() => {
    openTabsStateRef.current = openTabsState;
  }, [openTabsState]);
  // Routed to FileWorkspace — bumped whenever the user clicks "open" on a
  // tool card, an attachment chip, or a produced-file chip in chat. We
  // include a nonce so re-clicking the same name after the user closed the
  // tab still focuses it.
  const [openRequest, setOpenRequest] = useState<{
    name: string;
    nonce: number;
    closeTabs?: string[];
  } | null>(null);
  // Like `openRequest`, but additionally asks the preview workspace to open the
  // file's Share/Export menu. Drives the "Share" next-step action: it reuses the
  // existing export/deploy surface rather than introducing a new share backend.
  const [shareRequest, setShareRequest] = useState<{ name: string; nonce: number } | null>(null);
  // Parallel to shareRequest, but opens the workspace's Download/Export menu.
  const [downloadRequest, setDownloadRequest] = useState<{ name: string; nonce: number } | null>(null);
  // When a queued chat send starts processing, ask the workspace to flip the
  // deck preview to the slide its marked element lives on, so the user watches
  // the edit land in context instead of staying parked on slide 1. Mirrors the
  // `shareRequest` nonce signal: FileWorkspace matches `name` against the open
  // file and FileViewer consumes each nonce once.
  const [slideNavRequest, setSlideNavRequest] = useState<
    { name: string; slideIndex: number; nonce: number } | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const primaryOwnedDaemonRunIdRef = useRef<string | null>(null);
  // Runs explicitly superseded by a "send now" interrupt. Their abort
  // controller is recorded here synchronously — before handleStop() clears the
  // active refs — so the run's late terminal callbacks (which the daemon still
  // delivers for a canceled run) can be recognized as stale and skip every
  // current-run side effect, independent of abortRef churn. A WeakSet so a
  // finished run's controller is collected once nothing else references it.
  const supersededRunsRef = useRef<WeakSet<AbortController>>(new WeakSet());
  const streamingConversationIdRef = useRef<string | null>(null);
  const [queuedChatSends, setQueuedChatSends] = useState<QueuedChatSend[]>([]);
  const queuedChatSendsRef = useRef<QueuedChatSend[]>([]);
  const sendTextBufferRef = useRef<BufferedTextUpdates | null>(null);
  const reattachTextBuffersRef = useRef<Set<BufferedTextUpdates>>(new Set());
  const reattachControllersRef = useRef<Map<string, AbortController>>(new Map());
  const reattachCancelControllersRef = useRef<Map<string, AbortController>>(new Map());
  const missingRunLookupRetryTimersRef = useRef<Map<string, number>>(new Map());
  const apiBackgroundRecoveryRef = useRef(false);
  const apiRecoveryBannerRef = useRef<{
    conversationId: string;
    assistantMessageIds: readonly string[];
  } | null>(null);
  const completedReattachRunsRef = useRef<Set<string>>(new Set());
  const startingQueuedChatSendIdRef = useRef<string | null>(null);
  const [queuedAutoStartTick, setQueuedAutoStartTick] = useState(0);
  const skillCache = useRef<Map<string, string>>(new Map());
  const pluginSkillCache = useRef<Map<string, string>>(new Map());
  const designCache = useRef<Map<string, string>>(new Map());
  const templateCache = useRef<Map<string, ProjectTemplate>>(new Map());
  // We auto-save the most recent artifact to the project folder. Track the
  // last name we persisted so re-renders during streaming don't spawn
  // duplicate writes.
  const savedArtifactRef = useRef<string | null>(null);
  /** Dedupe stream onDone vs onRunStatus terminal HTML auto-open for the same assistant row. */
  const htmlAutoOpenClaimedRef = useRef<Set<string>>(new Set());
  /** Last-wins generation per assistant row — early onRunStatus timers must not finalize before onDone flush. */
  const htmlAutoOpenGenerationRef = useRef<Map<string, number>>(new Map());
  /** While terminal persist/auto-open runs, BYOK recovery must not re-arm streaming UI. */
  const htmlAutoOpenFinalizeInProgressRef = useRef<Set<string>>(new Set());
  /** Preview-comment edits must update the annotated deck file, not mint siblings. */
  const runPersistTargetFileRef = useRef<string | null>(null);
  /**
   * Per-run skip-discovery pin from turn meta / Canvas template pick.
   * Persist must not wait on React `project.metadata` settling — a stale false
   * here turns truncated turn-1 HTML into `skipped-discovery-turn`.
   */
  const runSkipDiscoveryBriefRef = useRef(false);
  /** Deck-patch from comment edits may only touch slides named by these attachments. */
  const runCommentAttachmentsRef = useRef<ChatCommentAttachment[]>([]);
  /** Image/file attachments for the active run — used to heal <img src> when /files lags. */
  const runAttachmentsRef = useRef<ChatAttachment[]>([]);
  /** Reactive copy of run attachment paths for FileWorkspace/FileViewer preview heal. */
  const [previewHealAttachmentPaths, setPreviewHealAttachmentPaths] = useState<string[]>([]);
  /** User-visible text for the active run; model-only prompt suffixes are excluded. */
  const runVisiblePromptRef = useRef<string>('');
  const htmlAutoOpenTimerRef = useRef<number | null>(null);
  /**
   * Gates the message-load auto-open recovery to the first load per
   * conversation within a mount. Once the user has seen the recovery
   * (or a manual tab pick has settled), a subsequent conversation-switch
   * back must not override their choice.
   */
  const conversationRecoveryAttemptedRef = useRef<Set<string>>(new Set());
  /**
   * Counts how many times the automatic "결과물이 완성되지 않아 이어쓰기"
   * recovery has fired inside a given conversation, keyed by conversationId.
   *
   * The recovery is capped at AUTO_CONTINUE_MAX_PER_CONVERSATION so a
   * genuinely-broken turn (e.g. the model keeps emitting the same
   * shell-then-stop pattern) cannot loop us into an infinite auto-continue
   * spend. Manual "다시 시도" via the failed-run card still works past the
   * cap; only the automatic path stops after the configured cap.
   *
   * Scoped per conversation (not per assistant) because a fresh continue-turn
   * that itself fails would land as a new assistantId and would otherwise
   * pass a per-assistant dedup — that is exactly the loop we want to prevent.
   */
  const conversationAutoContinueCountRef = useRef<Map<string, number>>(new Map());
  /** Pending automatic-continue timer; cleared on project/conversation switch / unmount. */
  const autoContinueTimerRef = useRef<number | null>(null);
  /** Conversation id that owns the pending auto-continue timer (for cap rollback). */
  const pendingAutoContinueConversationIdRef = useRef<string | null>(null);
  /** True while the 600ms auto-continue timer is armed — ChatPane hides Retry. */
  const [autoContinuePending, setAutoContinuePending] = useState(false);
  /**
   * Live streaming buffer mutator for the in-flight assistant row. `surfaceChatVisibleError`
   * updates React `messages` + saves, but the stream scheduler persists from a separate
   * `latestAssistantMsg` closure — keep that buffer in sync so a later PUT cannot wipe
   * a just-persisted status:error card.
   */
  const liveAssistantMutatorRef = useRef<{
    assistantId: string;
    apply: (updater: (prev: ChatMessage) => ChatMessage) => void;
  } | null>(null);

  const clearPendingAutoContinueTimer = useCallback((options?: { rollback?: boolean }) => {
    if (autoContinueTimerRef.current === null) {
      pendingAutoContinueConversationIdRef.current = null;
      setAutoContinuePending(false);
      return;
    }
    window.clearTimeout(autoContinueTimerRef.current);
    autoContinueTimerRef.current = null;
    const scheduledId = pendingAutoContinueConversationIdRef.current;
    pendingAutoContinueConversationIdRef.current = null;
    setAutoContinuePending(false);
    if (options?.rollback && scheduledId) {
      rollbackAutoContinueCount(conversationAutoContinueCountRef.current, scheduledId);
    }
  }, []);

  useEffect(() => {
    htmlAutoOpenClaimedRef.current.clear();
    htmlAutoOpenGenerationRef.current.clear();
    runCommentAttachmentsRef.current = [];
    runVisiblePromptRef.current = '';
    runPersistTargetFileRef.current = null;
    runSkipDiscoveryBriefRef.current = false;
    conversationRecoveryAttemptedRef.current.clear();
    conversationAutoContinueCountRef.current.clear();
    if (htmlAutoOpenTimerRef.current !== null) {
      window.clearTimeout(htmlAutoOpenTimerRef.current);
      htmlAutoOpenTimerRef.current = null;
    }
    clearPendingAutoContinueTimer();
    return () => {
      if (htmlAutoOpenTimerRef.current !== null) {
        window.clearTimeout(htmlAutoOpenTimerRef.current);
        htmlAutoOpenTimerRef.current = null;
      }
      clearPendingAutoContinueTimer();
    };
  }, [project.id, clearPendingAutoContinueTimer]);

  // Abort a pending automatic-continue when the user switches chats inside
  // the same project — otherwise a late timer can inject into the new chat.
  // Rollback the consumed retry slot so the previous conversation can still
  // recover if the user switches back.
  useEffect(() => {
    clearPendingAutoContinueTimer({ rollback: true });
    return () => {
      clearPendingAutoContinueTimer({ rollback: true });
    };
  }, [activeConversationId, clearPendingAutoContinueTimer]);

  // Pending Write tool invocations: tool_use_id -> destination basename.
  // When the matching tool_result lands we refresh the file list and open
  // the file as a tab once. Keying off the tool_use_id (rather than
  // diffing the file list at end-of-turn) lets us auto-open the moment
  // the agent's Write actually completes, without the previous synthetic
  // "live" tab that was causing flicker against manual opens.
  const pendingWritesRef = useRef<Map<string, string>>(new Map());
  // Filled after `finalizeSlideOnlyDeckArtifacts` is defined — early message-load
  // emergency recovery calls through this ref so it never closes over a stale
  // or TDZ callback.
  const finalizeSlideOnlyDeckArtifactsRef = useRef<
    (filesSnapshot: ProjectFile[], deckFileName?: string | null) => Promise<ProjectFile[]>
  >(async (files) => files);
  // Track which conversation the current messages belong to, so we can
  // correctly gate new-conversation creation even during async loads.
  const messagesConversationIdRef = useRef<string | null>(null);
  const creatingConversationRef = useRef(false);
  // Last conversation id this view pushed into the URL. Lets the
  // route -> active-conversation sync tell a genuine external navigation
  // apart from the URL merely lagging a local conversation switch.
  const lastSyncedConversationIdRef = useRef<string | null>(null);
  // Live mirror of the currently-viewed project id. Used to bail out of
  // the conversation-created async refresh (#1361) if the user switches
  // projects while the refetch is in flight — the existing project-load
  // effects use the same kind of cancellation guard.
  const projectIdRef = useRef(project.id);
  useEffect(() => {
    projectIdRef.current = project.id;
  }, [project.id]);
  useEffect(() => {
    setChatSeed(null);
    setAutoAuditRepairSeed(null);
    const restored = loadQueuedChatSends(project.id);
    queuedChatSendsRef.current = restored;
    setQueuedChatSends(restored);
    if (restored.length > 0) {
      devLog.info(
        '[teamver] chat-queue: restored on project mount',
        { projectId: project.id, count: restored.length },
      );
    }
  }, [project.id]);
  // Monotonic token bumped on every `conversation-created` refresh dispatch.
  // Two rapid events (e.g. concurrent routine runs against the same reused
  // project, #1502) can start overlapping `listConversations` calls; if the
  // later request resolves first with N+1 conversations and the earlier
  // request resolves afterwards with only N, an unconditional
  // `setConversations(list)` would drop the newest conversation. Each
  // dispatch captures the token at start; only the dispatch whose token
  // still equals `conversationsRefreshTokenRef.current` at await-return is
  // allowed to apply its result.
  const conversationsRefreshTokenRef = useRef(0);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const currentConversationHasActiveRun = useMemo(
    () => conversationHasRecoverableBackgroundChat(
      messages,
      config.mode === 'daemon' ? 'daemon' : 'api',
    ),
    [messages, config.mode],
  );
  const inFlightAssistantSignature = useMemo(
    () => findInFlightAssistantMessages(messages).map((message) => message.id).join(','),
    [messages],
  );
  const currentConversationLoading = Boolean(
    activeConversationId
      && messagesConversationId !== activeConversationId
      && failedMessagesConversationId !== activeConversationId,
  );

  // Auth blips or aborted fetches can leave the chat spinner up indefinitely
  // without setting failedMessagesConversationId — re-arm load once per hang.
  useEffect(() => {
    if (!activeConversationId || !currentConversationLoading) return;
    const conversationId = activeConversationId;
    const timer = window.setTimeout(() => {
      if (messagesConversationIdRef.current !== conversationId) {
        if (!isDesignAuthRefreshDeclined()) {
          setMessageLoadRetryNonce((nonce) => nonce + 1);
        }
      }
    }, MESSAGE_LOAD_STUCK_RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [activeConversationId, currentConversationLoading, messageLoadRetryNonce]);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    let cancelled = false;
    void waitForTeamverEmbedBoot().then(() => {
      if (cancelled) return;
      if (conversationLoadError) {
        setConversationLoadRetryNonce((nonce) => nonce + 1);
        return;
      }
      if (
        activeConversationId
        && failedMessagesConversationId === activeConversationId
      ) {
        setMessageLoadRetryNonce((nonce) => nonce + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    project.id,
    activeConversationId,
    conversationLoadError,
    failedMessagesConversationId,
  ]);

  const currentConversationStreaming = streaming && streamingConversationId === activeConversationId;
  const currentConversationQueueDisabled = currentConversationLoading
    || failedMessagesConversationId === activeConversationId;

  // The discovery question form lives in the right-hand Questions tab. We
  // derive it from the latest assistant message: if that message embeds a
  // <question-form> block, the panel renders it. The form is interactive
  // only while it's the most recent turn and the user hasn't answered yet
  // (an answer arrives as a following "[form answers …]" user message).
  const lastAssistantIndex = useMemo(
    () => resolveLastAssistantMessageIndex(messages),
    [messages],
  );
  const lastAssistantContent =
    lastAssistantIndex >= 0 ? messages[lastAssistantIndex]?.content ?? '' : '';
  const lastAssistantMessageId =
    lastAssistantIndex >= 0 ? messages[lastAssistantIndex]?.id ?? null : null;
  const resolvedQuestionForm = useMemo(
    () =>
      resolveSlideOnlyQuestionFormFromContent(lastAssistantContent, {
        slideOnlyMvp,
        enabled: teamverEmbedEnabled,
      }, { locale }),
    [lastAssistantContent, slideOnlyMvp, teamverEmbedEnabled, locale],
  );
  const questionForm: QuestionForm | null = resolvedQuestionForm.form;
  const questionFormSubmittedAnswers = useMemo(() => {
    if (!questionForm) return undefined;
    for (let i = lastAssistantIndex + 1; i < messages.length; i++) {
      const m = messages[i];
      if (m?.role !== 'user') continue;
      const parsed = parseSubmittedAnswers(questionForm, m.content ?? '');
      if (parsed) return parsed;
    }
    return undefined;
  }, [questionForm, lastAssistantIndex, messages]);
  const questionsGenerating = resolvedQuestionForm.generating;
  const questionFormPreview = useMemo(
    () =>
      questionsGenerating
        ? questionFormForSlideOnlyDisplay(parsePartialQuestionForm(lastAssistantContent), {
            slideOnlyMvp,
            enabled: teamverEmbedEnabled,
          }, { locale, allowFallback: true })
        : null,
    [questionsGenerating, lastAssistantContent, slideOnlyMvp, teamverEmbedEnabled, locale],
  );
  // The active (latest, unanswered) form stays editable the whole time it's on
  // screen — while it streams in AND while the turn is still busy — so it never
  // flickers between the locked (grey) and interactive (accent) styles.
  // Submission is gated separately by the panel via `submitDisabled`/generating.
  const questionFormActive =
    (!!questionForm || questionsGenerating) && questionFormSubmittedAnswers === undefined;
  const awaitingQuestionFormAnswer = useMemo(
    () => conversationAwaitingQuestionFormAnswer(messages),
    [messages],
  );
  const currentConversationAwaitingActiveRunAttach =
    currentConversationHasActiveRun
    && !currentConversationStreaming
    && !awaitingQuestionFormAnswer;
  const previewPanelStreaming =
    currentConversationStreaming || currentConversationAwaitingActiveRunAttach;

  // Re-entry / BYOK background recovery: paint partial streamed deck HTML on
  // the preview panel before SSE deltas reconnect (artifact state is cleared on
  // unmount). Use recoverable eligibility (not only startedAt in-flight) so
  // daemon runId-only rows still rehydrate.
  useEffect(() => {
    if (!activeConversationId) return;
    if (!currentConversationHasActiveRun && !previewPanelStreaming) return;
    const recoveryMode = config.mode === 'daemon' ? 'daemon' : 'api';
    const inflight =
      findRecoverableBackgroundAssistantMessage(messages, recoveryMode)
      ?? findInFlightAssistantMessages(messages)[0];
    if (!inflight?.content?.trim()) return;
    const preview = artifactPreviewFromInFlightContent(inflight.content);
    if (!preview) return;
    setArtifact((prev) => {
      const nextHtml = preview.html;
      if (prev?.html && prev.html.length > nextHtml.length) return prev;
      if (
        prev
        && prev.html === nextHtml
        && prev.identifier === preview.identifier
        && prev.artifactType === preview.artifactType
      ) {
        return prev;
      }
      return {
        identifier: preview.identifier,
        artifactType: preview.artifactType,
        title: preview.title,
        html: nextHtml,
      };
    });
  }, [
    activeConversationId,
    config.mode,
    currentConversationHasActiveRun,
    messages,
    previewPanelStreaming,
  ]);

  const currentConversationBusy = currentConversationLoading
    || currentConversationStreaming
    || currentConversationAwaitingActiveRunAttach;
  const currentConversationSendDisabled = currentConversationLoading
    || failedMessagesConversationId === activeConversationId
    || currentConversationAwaitingActiveRunAttach
    || embedSubmitDisabled;
  const currentConversationActionDisabled =
    currentConversationSendDisabled || currentConversationStreaming;
  // Mirror `questionFormActive`'s unanswered gate: once the user answers, the
  // Questions tab closes, so the auto-focus nonce must not treat an answered
  // form as a freshly appeared one.
  const hasQuestions =
    Boolean(questionForm || questionsGenerating) && questionFormSubmittedAnswers === undefined;
  // Stable identity for the current form occurrence, used to remember that its
  // one-by-one reveal already played. Keyed on the conversation + the hosting
  // assistant message id (not the message index, and NOT the parsed form id —
  // see buildQuestionFormKey). The assistant message id is allocated once and
  // kept in place across the streaming→persisted swap (same `assistantId`
  // throughout), so it survives the brief unmount/re-focus of the Questions tab
  // without replaying the animation, yet differs for every distinct form
  // occurrence (each lives in its own assistant message).
  const questionFormKey = useMemo(
    () =>
      buildQuestionFormKey(
        activeConversationId,
        lastAssistantMessageId,
        Boolean(questionForm ?? questionFormPreview),
      ),
    [activeConversationId, lastAssistantMessageId, questionForm, questionFormPreview],
  );

  // Release #3661: let a past question form be manually re-opened in the
  // Questions panel. Layered on top of main's stable questionFormKey (#3644) —
  // the `displayed*` values fall back to the live form when nothing is manually
  // pinned, so both fixes coexist.
  const [manualQuestionFormRequest, setManualQuestionFormRequest] =
    useState<QuestionFormOpenRequest | null>(null);
  useEffect(() => {
    setManualQuestionFormRequest(null);
  }, [project.id, activeConversationId]);
  useEffect(() => {
    if (hasQuestions && questionFormKey) setManualQuestionFormRequest(null);
  }, [hasQuestions, questionFormKey]);
  const displayedQuestionForm = manualQuestionFormRequest?.form ?? questionForm;
  const displayedQuestionFormPreview = manualQuestionFormRequest ? null : questionFormPreview;
  const displayedQuestionFormSubmittedAnswers =
    manualQuestionFormRequest?.submittedAnswers ?? questionFormSubmittedAnswers;
  const displayedQuestionFormActive = manualQuestionFormRequest ? false : questionFormActive;
  const displayedQuestionsGenerating = manualQuestionFormRequest ? false : questionsGenerating;
  const displayedQuestionFormKey = manualQuestionFormRequest
    ? `${activeConversationId ?? 'conversation'}:${manualQuestionFormRequest.messageId}:${manualQuestionFormRequest.form.id}:manual`
    : questionFormKey;

  // Auto-switch the workspace to the Questions tab when a new discovery form
  // first appears, and let the chat banner re-focus it on click. The nonce
  // bump is what FileWorkspace listens to.
  const [questionsFocusNonce, setQuestionsFocusNonce] = useState(0);
  const prevHasQuestionsRef = useRef(false);
  useEffect(() => {
    if (hasQuestions && !prevHasQuestionsRef.current) {
      setQuestionsFocusNonce((n) => n + 1);
    }
    prevHasQuestionsRef.current = hasQuestions;
  }, [hasQuestions]);
  const focusQuestionsRequest = useMemo(
    () => (questionsFocusNonce > 0 ? { nonce: questionsFocusNonce } : null),
    [questionsFocusNonce],
  );
  const submittedAnswersForQuestionFormRequest = useCallback((request: QuestionFormOpenRequest) => {
    const assistantIndex = messages.findIndex((m) => m.id === request.messageId);
    if (assistantIndex < 0) return null;
    for (let i = assistantIndex + 1; i < messages.length; i++) {
      const m = messages[i];
      if (!m) continue;
      if (m.role === 'assistant') break;
      if (m.role !== 'user') continue;
      const parsed = parseSubmittedAnswers(request.form, m.content ?? '');
      if (parsed) return parsed;
    }
    return null;
  }, [messages]);
  const openQuestionsTab = useCallback((request?: QuestionFormOpenRequest) => {
    if (request) {
      const opensCurrentLiveForm =
        request.messageId === lastAssistantMessageId
        && questionForm?.id === request.form.id
        && questionFormSubmittedAnswers === undefined;
      if (opensCurrentLiveForm) {
        setManualQuestionFormRequest(null);
      } else {
        setManualQuestionFormRequest({
          ...request,
          submittedAnswers:
            request.submittedAnswers ?? submittedAnswersForQuestionFormRequest(request) ?? undefined,
        });
      }
    }
    setQuestionsFocusNonce((n) => n + 1);
  }, [
    lastAssistantMessageId,
    questionForm,
    questionFormSubmittedAnswers,
    submittedAnswersForQuestionFormRequest,
  ]);

  const currentConversationQueuedItems = activeConversationId
    ? queuedChatSends
        .filter((item) => item.conversationId === activeConversationId)
        .map((item) => {
          const queuedItem = {
            id: item.id,
            prompt: item.prompt,
            attachments: item.attachments,
            commentAttachments: item.commentAttachments,
          };
          if (item.meta === undefined) return queuedItem;
          return { ...queuedItem, meta: item.meta };
        })
    : [];
  const newConversationDisabled = creatingConversation;
  const activeCompletionNotificationRunsRef = useRef<Set<string>>(new Set());
  const completedNotificationRunsRef = useRef<Set<string>>(new Set());

  // Load conversations on project switch. If none exist (older projects
  // pre-conversations, or a freshly created one whose default seed got
  // dropped), create one on the fly.
  useEffect(() => {
    let cancelled = false;
    setConversations([]);
    setActiveConversationId(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setMessageLoadRetryNonce(0);
    setConversationLoadError(null);
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setError(null);
    setAudioVoiceOptionsError(null);
    setArtifact(null);
    savedArtifactRef.current = null;
    pendingWritesRef.current.clear();
    const loadConversationsWithRetry = async () => {
      if (isTeamverEmbedMode()) {
        await waitForTeamverEmbedBoot();
      }
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await listConversations(project.id);
        } catch (err) {
          lastError = err;
          // Soft sticky / HA cookie race: daemon fetch already runs survival
          // refresh, but conversation list is the project re-entry critical
          // path — one explicit soft recovery before the next attempt when
          // hard sticky is not owning the tab.
          if (
            err instanceof TeamverDaemonUnauthorizedError
            && !isDesignAuthRefreshDeclined()
            && attempt < 2
          ) {
            // Before sticky: one soft revive. Once soft/hard sticky owns the
            // tab, C1 / 「다시 시도」 own recovery — do not POST refresh here.
            await refreshDesignAuthCookie();
          }
          if (attempt < 2) {
            await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
          }
        }
      }
      throw lastError;
    };
    (async () => {
      try {
        const list = await loadConversationsWithRetry();
        if (cancelled) return;
        if (list.length === 0) {
          const fresh = await createConversation(project.id);
          if (cancelled) return;
          if (fresh) {
            setConversations([fresh]);
            setActiveConversationId(fresh.id);
          } else {
            throw new Error(formatProjectConversationCreateError());
          }
        } else {
          setConversations(list);
          // Issue #1505: when the URL deep-links to a specific
          // conversation, prefer that one. Falls through to list[0]
          // when the routed id is null or no longer present (the
          // routine row may have been deleted between the route
          // landing and the conversation list loading).
          const routedMatch = routeConversationId
            ? list.find((c) => c.id === routeConversationId) ?? null
            : null;
          const rememberedId = readRememberedTeamverProjectConversation(project.id);
          const rememberedMatch = rememberedId
            ? list.find((c) => c.id === rememberedId) ?? null
            : null;
          const nextActiveId = routedMatch
            ? routedMatch.id
            : rememberedMatch
              ? rememberedMatch.id
              : list[0]!.id;
          setActiveConversationId(nextActiveId);
          rememberTeamverProjectConversation(project.id, nextActiveId);
        }
      } catch (err) {
        if (cancelled) return;
        const message = formatProjectConversationErrorForUser(err, formatProjectConversationListError());
        setConversations([]);
        setActiveConversationId(null);
        setConversationLoadError(message);
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, conversationLoadRetryNonce]);

  useEffect(() => {
    if (!activeConversationId) return;
    rememberTeamverProjectConversation(project.id, activeConversationId);
  }, [project.id, activeConversationId]);

  // Issue #1505: when the URL changes the routed conversation id while
  // we are already inside the project (e.g. the user clicks "Open
  // project" on a different routine history row in the same project),
  // switch the active conversation without re-fetching the list.
  // Guards: only acts when the routed id is non-null AND present in
  // the already-loaded list, and only when it differs from the current
  // active id. Falls through to a no-op for stale / missing routes so
  // the default picker above keeps its result.
  useEffect(() => {
    if (!routeConversationId) {
      lastSeenRouteConversationIdRef.current = null;
      return;
    }
    if (conversations.length === 0) return;
    if (routeConversationId === activeConversationId) return;
    // When the route still points at the conversation this view last
    // pushed to the URL, the mismatch means a local switch (new
    // conversation, history pick) moved activeConversationId ahead and
    // the URL sync below has not caught up yet. Following the stale
    // route here would fight that sync and remount ChatPane in a loop,
    // so only react to a genuinely external navigation.
    if (routeConversationId === lastSyncedConversationIdRef.current) return;
    if (lastSeenRouteConversationIdRef.current === routeConversationId) return;
    lastSeenRouteConversationIdRef.current = routeConversationId;
    const match = conversations.find((c) => c.id === routeConversationId);
    if (!match) return;
    setActiveConversationId(routeConversationId);
  }, [routeConversationId, conversations, activeConversationId]);

  useEffect(() => {
    setWorkspaceFocused(false);
  }, [project.id]);

  // Load messages whenever the active conversation changes. This happens
  // on project mount (after conversations load) and on user-triggered
  // conversation switches.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setMessagesInitialized(false);
      setPreviewComments([]);
      setAttachedComments([]);
      setMessagesConversationId(null);
      setFailedMessagesConversationId(null);
      messagesConversationIdRef.current = null;
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      return;
    }
    // Reset the initialized flag so auto-send waits for the new
    // conversation's DB read to settle before checking messages.length.
    setMessagesInitialized(false);
    let cancelled = false;
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setArtifact(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    savedArtifactRef.current = null;
    pendingWritesRef.current.clear();
    if (messagesConversationIdRef.current !== activeConversationId) {
      messagesConversationIdRef.current = null;
    }
    (async () => {
      const safeFetchPreviewComments = async () => {
        try {
          return await fetchPreviewComments(project.id, activeConversationId);
        } catch (err) {
          devLog.debug('[project] preview comments load skipped', err);
          return [];
        }
      };
      const safeListActiveChatRuns = async () => {
        if (config.mode !== 'daemon') return [];
        try {
          return await listActiveChatRuns(project.id, activeConversationId);
        } catch (err) {
          devLog.debug('[project] active daemon runs load skipped', err);
          return [];
        }
      };
      const loadMessagesWithRetry = async () => {
        if (isTeamverEmbedMode()) {
          await waitForTeamverEmbedBoot();
        }
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const list = await listMessages(project.id, activeConversationId);
            const [comments, activeRuns] = await Promise.all([
              safeFetchPreviewComments(),
              safeListActiveChatRuns(),
            ]);
            return [list, comments, activeRuns] as const;
          } catch (err) {
            lastError = err;
            // Soft sticky / HA cookie race: mirror conversation-list recovery
            // so a transient 401 does not land as an empty chat after refresh.
            if (
              err instanceof TeamverDaemonUnauthorizedError
              && !isDesignAuthRefreshDeclined()
              && attempt < 2
            ) {
              // Before sticky: one soft revive. Once soft/hard sticky owns the
              // tab, C1 / 「다시 시도」 own recovery — do not POST refresh here.
              await refreshDesignAuthCookie();
            }
            if (attempt < 2) {
              await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
            }
          }
        }
        throw lastError;
      };
      try {
        const [list, comments, activeRuns] = await loadMessagesWithRetry();
        if (cancelled) return;
        const mergedMessages = mergeActiveRunsIntoMessages(list, activeRuns);
        setMessages(mergedMessages);
        setMessagesInitialized(true);
        if (activeRuns.length > 0) {
          setReattachNonce((value) => value + 1);
        }
        // Tombstone filter must apply here too: a fresh conversation reload
        // (auth recovery / visibility retry) can otherwise resurrect a
        // just-deleted memo while the daemon DELETE is still in flight.
        setPreviewComments(filterLocallyDeletedPreviewComments(comments));
        setAttachedComments([]);
        setArtifact(null);
        setError(null);
        savedArtifactRef.current = null;
        pendingWritesRef.current.clear();
        messagesConversationIdRef.current = activeConversationId;
        setMessagesConversationId(activeConversationId);
        setFailedMessagesConversationId(null);
        // Refresh preview after a completed run survives a reload / cross-tab
        // switch. autoOpenRecoveredHtmlOutput previously only fired from the
        // API background recovery loop, so a refresh AFTER onRunStatus
        // 'succeeded' left the workspace on whatever tab was persisted
        // regardless of the new deck.html. The claim ref short-circuits
        // re-opens for messages an in-session stream already handled, and
        // conversationRecoveryAttemptedRef gates to the first load per
        // conversation so a subsequent manual tab pick is never overridden.
        if (!conversationRecoveryAttemptedRef.current.has(activeConversationId)) {
          conversationRecoveryAttemptedRef.current.add(activeConversationId);
          void (async () => {
            // autoOpenRecoveredHtmlOutput short-circuits on the first match,
            // so pass the terminal assistant ids in newest→oldest order to
            // prioritize the most recent completed HTML output.
            const terminalAssistantIds = new Set<string>(
              mergedMessages
                .filter((m) => m.role === 'assistant' && !isInFlightAssistantMessage(m))
                .slice()
                .reverse()
                .map((m) => m.id),
            );
            if (terminalAssistantIds.size === 0) return;
            const filesForRecovery = projectFilesRef.current.length > 0
              ? projectFilesRef.current
              : await refreshProjectFiles().catch(() => [] as ProjectFile[]);
            if (cancelled) return;
            if (messagesConversationIdRef.current !== activeConversationId) return;
            const openedRecoveredHtml = await autoOpenRecoveredHtmlOutput(
              mergedMessages,
              terminalAssistantIds,
              filesForRecovery,
            );
            if (openedRecoveredHtml) return;
            if (pendingAutoContinueConversationIdRef.current === activeConversationId) return;
            const autoContinueCount = syncAutoContinueCountFromMessages(
              conversationAutoContinueCountRef.current,
              activeConversationId,
              mergedMessages,
            );
            const incompleteAssistant = findIncompleteSlideAssistantForRecovery(mergedMessages);
            const recoveryCommentAttachments = incompleteAssistant
              ? extractCommentAttachmentsForAutoContinue(
                  findPrecedingUserMessage(mergedMessages, incompleteAssistant.id),
                  null,
                )
              : [];
            const recoveryAutoContinueMax = resolveAutoContinueMaxAttempts({
              scopedCommentAttachmentCount: recoveryCommentAttachments.length,
              visualMarkOnly: visualAnnotationAutoContinueFlags(recoveryCommentAttachments).visualMarkOnly,
            });
            // Prefer emergency salvage BEFORE burning auto-continue slots when
            // the stream already contains model-authored HTML (matches live finalize).
            if (incompleteAssistant && slideOnlyMvp) {
              const incompleteIndex = mergedMessages.findIndex(
                (message) => message.id === incompleteAssistant.id,
              );
              const beforeFileNames = resolveTurnStartFileBaseline(
                incompleteAssistant.preTurnFileNames,
                filesForRecovery,
              );
              const emergency = await attemptEmergencySlideDeckRecovery({
                slideOnlyMvp,
                producedHtmlToOpen: null,
                scopedCommentAttachmentCount: recoveryCommentAttachments.length,
                outlineMessages: mergedMessages.slice(0, incompleteIndex + 1),
                finalText: incompleteAssistant.content,
                projectFiles: filesForRecovery,
                beforeFileNames,
                startedAt: incompleteAssistant.startedAt ?? incompleteAssistant.createdAt ?? Date.now(),
                persistArtifact,
                refreshProjectFiles,
                readProjectHtml,
                computeProducedFiles,
              });
              if (emergency.recovered && emergency.htmlToOpen) {
                const emergencyNotice = formatEmergencyDeckFallbackNotice();
                const updatedAssistant = {
                  ...appendWarningStatusEvent(
                    clearDurableDeliverableErrorsAfterRecovery(incompleteAssistant),
                    emergencyNotice,
                    EMERGENCY_DECK_FALLBACK_STATUS_CODE,
                  ),
                  producedFiles: emergency.produced,
                  runStatus: 'succeeded' as const,
                  resumable: false,
                  endedAt: incompleteAssistant.endedAt ?? Date.now(),
                };
                setMessages((current) =>
                  current.map((message) =>
                    message.id === updatedAssistant.id ? updatedAssistant : message,
                  ),
                );
                void saveMessage(project.id, activeConversationId, updatedAssistant, {
                  telemetryFinalized: true,
                });
                const filesAfterEmergency = await refreshProjectFiles();
                await finalizeSlideOnlyDeckArtifactsRef.current(
                  filesAfterEmergency,
                  emergency.htmlToOpen,
                );
                maybeArmTeamverPublishMenuAfterRunSuccess(project.id, emergency.htmlToOpen);
                requestOpenFile(emergency.htmlToOpen);
                return;
              }
            }
            if (!canFireAutoContinueForConversation(autoContinueCount, recoveryAutoContinueMax)) {
              return;
            }
            if (!incompleteAssistant) return;
            conversationAutoContinueCountRef.current.set(
              activeConversationId,
              autoContinueCount + 1,
            );
            const autoContinueNotice = formatAutoContinueIncompleteOutputNotice();
            const updatedAssistant = attachAutoContinueIncompleteOutputNotice(
              incompleteAssistant,
              autoContinueNotice,
              formatProjectRunDeliverableMissingError(),
            );
            setMessages((current) =>
              current.map((message) =>
                message.id === updatedAssistant.id ? updatedAssistant : message,
              ),
            );
            void saveMessage(project.id, activeConversationId, updatedAssistant, {
              telemetryFinalized: true,
            });
            if (autoContinueTimerRef.current !== null) {
              window.clearTimeout(autoContinueTimerRef.current);
            }
            const scheduledProjectId = project.id;
            const scheduledConversationId = activeConversationId;
            pendingAutoContinueConversationIdRef.current = scheduledConversationId;
            setAutoContinuePending(true);
            autoContinueTimerRef.current = window.setTimeout(() => {
              autoContinueTimerRef.current = null;
              pendingAutoContinueConversationIdRef.current = null;
              setAutoContinuePending(false);
              if (project.id !== scheduledProjectId) {
                rollbackAutoContinueCount(
                  conversationAutoContinueCountRef.current,
                  scheduledConversationId,
                );
                return;
              }
              if (messagesConversationIdRef.current !== scheduledConversationId) {
                rollbackAutoContinueCount(
                  conversationAutoContinueCountRef.current,
                  scheduledConversationId,
                );
                return;
              }
              if (!abortRef.current) {
                if (apiBackgroundRecoveryRef.current) {
                  apiBackgroundRecoveryRef.current = false;
                  clearApiBackgroundRecoveryBanner();
                }
                if (streamingConversationIdRef.current === scheduledConversationId) {
                  clearStreamingMarker(scheduledConversationId);
                }
              }
              if (
                isLiveLocalStreamBlockingAutoContinue({
                  abortController: abortRef.current,
                  streamingConversationId: streamingConversationIdRef.current,
                  targetConversationId: scheduledConversationId,
                })
              ) {
                rollbackAutoContinueCount(
                  conversationAutoContinueCountRef.current,
                  scheduledConversationId,
                );
                return;
              }
              const sendNow = handleSendRef.current;
              if (!sendNow) {
                rollbackAutoContinueCount(
                  conversationAutoContinueCountRef.current,
                  scheduledConversationId,
                );
                return;
              }
              const attempt =
                conversationAutoContinueCountRef.current.get(scheduledConversationId) ?? 1;
              const autoContinueCtx =
                extractAutoContinueContextFromAssistant(incompleteAssistant);
              const autoContinueCommentAttachments = hydrateQueryContextCommentAttachments(
                extractCommentAttachmentsForAutoContinue(
                  findPrecedingUserMessage(mergedMessages, incompleteAssistant?.id),
                  runCommentAttachmentsRef.current,
                ),
                visibleCommentEditInstruction(
                  findPrecedingUserMessage(mergedMessages, incompleteAssistant?.id)?.content,
                ),
              );
              const autoContinueOriginUser = findPrecedingUserMessage(
                mergedMessages,
                incompleteAssistant?.id,
              );
              const scopedCommentContext =
                autoContinueCommentAttachments.length > 0
                  ? renderCommentAttachmentContext(autoContinueCommentAttachments, {
                      includeQueryComments: true,
                    })
                  : null;
              const concretePatchTemplate =
                autoContinueCommentAttachments.length > 0
                  ? buildConcretePatchTemplatesForCommentAttachments(autoContinueCommentAttachments)
                  : null;
              const autoContinueVisualFlags = visualAnnotationAutoContinueFlags(
                autoContinueCommentAttachments,
              );
              const autoContinuePrompt = resolveAutoContinuePrompt({
                commentAttachmentCount: autoContinueCommentAttachments.length,
                visualMarkOnly: autoContinueVisualFlags.visualMarkOnly,
                visualAnnotationEdit: autoContinueVisualFlags.visualAnnotationEdit,
                scopedCommentContext,
                scopedUserInstruction: autoContinueOriginUser
                  ? stripUserVisibleUserMessageText(autoContinueOriginUser.content).trim()
                  : null,
                concretePatchTemplate,
                incompleteOutput: {
                  attempt,
                  referenceFiles: collectSlideReferencePathsFromMessages(mergedMessages),
                  slideCountHint: extractRequestedSlideCountHintFromMessages(mergedMessages),
                  existingDeckPath: resolvePrimaryDeckFilePath(
                    filesForRecovery,
                    project.metadata?.entryFile,
                  ),
                  ...autoContinueCtx,
                },
              });
              // Comment scope + image/deck attachments must survive the retry.
              // Empty attachments here caused image-embed turns to lose their
              // exact src paths and fall through to greenfield full-deck
              // regeneration (often collapsing 8 slides → 2).
              const started = sendNow(
                autoContinuePrompt,
                chatAttachmentsForAutoContinueImageEmbed(autoContinueOriginUser, projectFilesRef.current.map((file) => String(file.path || file.name || "").trim()).filter(Boolean)),
                autoContinueCommentAttachments,
                { entryFrom: AUTO_CONTINUE_ENTRY_FROM },
              );
              void Promise.resolve(started).then((ok) => {
                if (ok === false) {
                  rollbackAutoContinueCount(
                    conversationAutoContinueCountRef.current,
                    scheduledConversationId,
                  );
                }
              });
            }, 600);
          })();
        }
      } catch (err) {
        if (cancelled) return;
        const message = formatProjectConversationErrorForUser(err, formatProjectMessagesLoadError());
        setMessages([]);
        setPreviewComments([]);
        setAttachedComments([]);
        setArtifact(null);
        setError(message);
        savedArtifactRef.current = null;
        pendingWritesRef.current.clear();
        messagesConversationIdRef.current = null;
        setMessagesConversationId(null);
        setFailedMessagesConversationId(activeConversationId);
        setMessagesInitialized(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, activeConversationId, messageLoadRetryNonce, config.mode]);

  useEffect(() => {
    if (!streaming) return;
    beginTeamverEmbedActiveWork();
    return () => {
      endTeamverEmbedActiveWork();
    };
  }, [streaming]);

  useEffect(() => {
    return () => {
      // Daemon runs outlive this route, but the browser-side SSE consumer must
      // detach on unmount so a remount can reattach and restore Stop/streaming
      // UI. Explicit Stop still owns cancelRef and POST /api/runs/:id/cancel.
      sendTextBufferRef.current = null;
      detachPrimaryRunStreamWithoutCancel(
        abortRef,
        cancelRef,
        primaryOwnedDaemonRunIdRef.current,
      );
      for (const textBuffer of reattachTextBuffersRef.current) textBuffer.cancel();
      reattachTextBuffersRef.current.clear();
      for (const controller of reattachControllersRef.current.values()) {
        if (abortRef.current === controller) abortRef.current = null;
        controller.abort();
      }
      for (const controller of reattachCancelControllersRef.current.values()) {
        // Route changes should only detach the browser-side SSE listener.
        // Aborting this signal maps to POST /cancel, so leave the daemon run alive.
        if (cancelRef.current === controller) cancelRef.current = null;
      }
      reattachControllersRef.current.clear();
      reattachCancelControllersRef.current.clear();
      for (const timer of missingRunLookupRetryTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      missingRunLookupRetryTimersRef.current.clear();
    };
  }, [project.id, activeConversationId]);

  const cancelSendTextBuffer = useCallback((flushPending = false) => {
    const buffer = sendTextBufferRef.current;
    if (flushPending) {
      buffer?.flush();
      buffer?.finalizeForHistoryDisplay?.();
    }
    buffer?.cancel();
    sendTextBufferRef.current = null;
  }, []);

  const cancelReattachTextBuffers = useCallback((flushPending = false) => {
    for (const textBuffer of reattachTextBuffersRef.current) {
      if (flushPending) {
        textBuffer.flush();
        textBuffer.finalizeForHistoryDisplay?.();
      }
      textBuffer.cancel();
    }
    reattachTextBuffersRef.current.clear();
  }, []);

  const clearRunRecoveryBannerState = useCallback((conversationId?: string | null) => {
    const tracked = runRecoveryBannerTrackRef.current;
    const trackedAssistantId = tracked?.assistantMessageId ?? null;
    const trackedConversationId = conversationId ?? tracked?.conversationId ?? activeConversationId;
    if (trackedAssistantId && trackedConversationId) {
      dispatchTeamverBackgroundChat({
        projectId: project.id,
        conversationId: trackedConversationId,
        assistantMessageId: trackedAssistantId,
        active: false,
      });
    }
    runRecoveryBannerTrackRef.current = null;
    setRunRecoveryBanner(null);
  }, [activeConversationId, project.id]);

  const finalizeRunRecoveryBannerForMessage = useCallback((
    conversationId: string,
    assistantMessageId: string,
  ) => {
    if (runRecoveryBannerTrackRef.current?.assistantMessageId === assistantMessageId) {
      clearRunRecoveryBannerState(conversationId);
      return;
    }
    dispatchTeamverBackgroundChat({
      projectId: project.id,
      conversationId,
      assistantMessageId,
      active: false,
    });
  }, [clearRunRecoveryBannerState, project.id]);

  const clearApiBackgroundRecoveryBanner = useCallback(() => {
    const tracked = apiRecoveryBannerRef.current;
    if (!tracked) return;
    for (const assistantMessageId of tracked.assistantMessageIds) {
      dispatchTeamverBackgroundChat({
        projectId: project.id,
        conversationId: tracked.conversationId,
        assistantMessageId,
        active: false,
      });
    }
    apiRecoveryBannerRef.current = null;
    clearRunRecoveryBannerState(tracked.conversationId);
  }, [clearRunRecoveryBannerState, project.id]);

  /** Detach browser-side run streams without POST /cancel — run continues as background. */
  const detachLocalRunStreamConsumers = useCallback(() => {
    cancelSendTextBuffer(false);
    cancelReattachTextBuffers(false);
    detachPrimaryRunStreamWithoutCancel(
      abortRef,
      cancelRef,
      primaryOwnedDaemonRunIdRef.current,
    );
    for (const runId of reattachControllersRef.current.keys()) {
      releaseLocallyConsumedDaemonRun(runId);
    }
    for (const controller of reattachControllersRef.current.values()) {
      controller.abort();
    }
    reattachControllersRef.current.clear();
    reattachCancelControllersRef.current.clear();
    clearApiBackgroundRecoveryBanner();
    clearRunRecoveryBannerState();
    apiBackgroundRecoveryRef.current = false;
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setStreaming(false);
  }, [cancelReattachTextBuffers, cancelSendTextBuffer, clearApiBackgroundRecoveryBanner, clearRunRecoveryBannerState]);

  const notifyCompletedRun = useCallback((last: ChatMessage) => {
    // Round 7 (mrcfps @ useDesignMdState.ts:131): a chat turn just
    // settled — conversation updatedAt almost certainly moved, so
    // recompute DESIGN.md staleness even when the turn produced no
    // file mutations or live artifacts.
    setDesignMdRefreshKey((n) => n + 1);

    const status = last.runStatus;
    if (status !== 'succeeded' && status !== 'failed') return;

    const cfg = config.notifications ?? DEFAULT_NOTIFICATIONS;
    if (cfg.soundEnabled) {
      playSound(status === 'succeeded' ? cfg.successSoundId : cfg.failureSoundId);
    }

    if (cfg.desktopEnabled) {
      // Successes only interrupt when the user is on another tab/window.
      // Failures alert regardless — losing a long agent run silently is
      // worse than a small interruption when the page is in focus.
      const isHidden = typeof document !== 'undefined' && document.hidden;
      const isFocused = typeof document === 'undefined' ? true : document.hasFocus();
      if (status === 'failed' || isHidden || !isFocused) {
        const title = status === 'succeeded'
          ? t('notify.successTitle')
          : t('notify.failureTitle');
        const fallbackBody = status === 'succeeded'
          ? t('notify.successBody')
          : t('notify.failureBody');
        const trimmed = (last.content ?? '').trim();
        const body = trimmed ? trimmed.slice(0, 80) : fallbackBody;
        void showCompletionNotification({
          status,
          title,
          body,
          onClick: () => {
            if (typeof window !== 'undefined') window.focus();
          },
        });
      }
    }
  }, [config.notifications, t]);

  // Fire completion feedback from assistant run-status transitions rather than
  // from the local SSE listener state. A run can finish while its conversation
  // is detached; when the user returns, the terminal status should still produce
  // the one completion notification for runs this view previously saw active.
  useEffect(() => {
    const completedMessages: ChatMessage[] = [];
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      const keys = message.runId ? [message.runId, message.id] : [message.id];
      if (isActiveRunStatus(message.runStatus)) {
        for (const key of keys) activeCompletionNotificationRunsRef.current.add(key);
        continue;
      }
      if (message.runStatus !== 'succeeded' && message.runStatus !== 'failed') continue;
      if (!keys.some((key) => activeCompletionNotificationRunsRef.current.has(key))) continue;
      if (keys.some((key) => completedNotificationRunsRef.current.has(key))) continue;
      for (const key of keys) completedNotificationRunsRef.current.add(key);
      completedMessages.push(message);
    }

    for (const message of completedMessages) notifyCompletedRun(message);
  }, [messages, notifyCompletedRun]);

  // Hydrate the open-tabs state once per project. After this initial
  // load, every mutation flows through saveTabsState() which keeps DB +
  // local state coherent.
  useEffect(() => {
    let cancelled = false;
    tabsLoadedRef.current = false;
    tabsHydratedFromSavedStateRef.current = false;
    hasAppliedInitialPrimaryOpenRef.current = false;
    setOpenTabsState({ tabs: [], active: null });
    (async () => {
      const state = await loadTabs(project.id);
      if (cancelled) return;
      const routeActive = routeFileNameRef.current;
      let nextState = routeActive
        ? {
            ...state,
            tabs: state.tabs.includes(routeActive)
              ? state.tabs
              : [...state.tabs, routeActive],
            active: routeActive,
          }
        : state;
      // Generation may have persisted every Write as an open tab. Collapse
      // numbered artifact siblings (`foo.html`/`foo-2.html`) on re-entry so
      // the workspace does not reopen the whole version history.
      const collapsedTabs = collapseArtifactVersionOpenTabs(
        nextState.tabs,
        nextState.active,
      );
      const tabsCollapsed = collapsedTabs.length !== nextState.tabs.length;
      if (tabsCollapsed) {
        const nextActive =
          nextState.active && collapsedTabs.includes(nextState.active)
            ? nextState.active
            : collapsedTabs[collapsedTabs.length - 1] ?? null;
        nextState = { ...nextState, tabs: collapsedTabs, active: nextActive };
      }
      if (routeActive || tabsCollapsed) {
        nextState = cacheTabsLocally(project.id, nextState);
        void persistTabsToDaemonNow(project.id, nextState);
      }
      tabsHydratedFromSavedStateRef.current = state.hasSavedState === true;
      setOpenTabsState(nextState);
      tabsLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Debounce the canonical (daemon + SQLite) tab-state write. The embedded
  // browser fans out url/title/favicon updates in bursts on a single page load
  // (did-navigate, did-navigate-in-page, page-title-updated, favicon), and each
  // used to be a localStorage write + HTTP PUT + SQLite UPDATE + re-render.
  // We keep React state and the local cache IMMEDIATE (so the UI and a reload
  // are never stale) and coalesce only the daemon PUT.
  const tabsDaemonSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDaemonTabsRef = useRef<OpenTabsState | null>(null);
  const flushTabsDaemonSave = useCallback(() => {
    if (tabsDaemonSaveTimerRef.current != null) {
      clearTimeout(tabsDaemonSaveTimerRef.current);
      tabsDaemonSaveTimerRef.current = null;
    }
    const pending = pendingDaemonTabsRef.current;
    pendingDaemonTabsRef.current = null;
    if (pending) void persistTabsToDaemonNow(project.id, pending);
  }, [project.id]);

  const persistTabsState = useCallback(
    (next: OpenTabsState) => {
      setOpenTabsState(next);
      if (!tabsLoadedRef.current) return;
      // Immediate, cheap, synchronous — keeps the cache canonical for reload.
      const stamped = cacheTabsLocally(project.id, next);
      pendingDaemonTabsRef.current = stamped;
      if (tabsDaemonSaveTimerRef.current != null) {
        clearTimeout(tabsDaemonSaveTimerRef.current);
      }
      tabsDaemonSaveTimerRef.current = setTimeout(() => {
        tabsDaemonSaveTimerRef.current = null;
        const pending = pendingDaemonTabsRef.current;
        pendingDaemonTabsRef.current = null;
        if (pending) void persistTabsToDaemonNow(project.id, pending);
      }, TAB_PERSIST_DEBOUNCE_MS);
    },
    [project.id],
  );

  // Flush any pending tab write when the project changes or the view unmounts,
  // so a fast project switch / close doesn't leave the daemon a debounce behind.
  useEffect(() => flushTabsDaemonSave, [flushTabsDaemonSave]);

  const handleActiveWorkspaceContextChange = useCallback((next: WorkspaceContextItem | null) => {
    setActiveWorkspaceContext((current) =>
      workspaceContextItemEqual(current, next) ? current : next,
    );
  }, []);

  const handleWorkspaceContextsChange = useCallback((next: WorkspaceContextItem[]) => {
    setWorkspaceContexts((current) =>
      workspaceContextItemsEqual(current, next) ? current : next,
    );
  }, []);

  const removeProjectFilesLocally = useCallback((names: readonly string[]) => {
    if (names.length === 0) return;
    const deleted = new Set(names);
    setProjectFiles((current) => {
      const next = current.filter((file) => !deleted.has(file.name));
      projectFilesRef.current = next;
      return next;
    });
  }, []);

  const refreshProjectFiles = useCallback(async (): Promise<ProjectFile[]> => {
    if (isTeamverEmbedMode()) {
      await waitForTeamverEmbedBoot();
    }
    const next = await fetchProjectFiles(project.id);
    projectFilesRef.current = next;
    setProjectFiles(next);
    return next;
  }, [project.id]);

  /**
   * Canvas→Slide: pin metadata.entryFile to the real deck and delete root HTML
   * that only duplicates an imported refs/ Canvas source (so project cards and
   * the file tree stop treating the Canvas copy as the deliverable).
   */
  const finalizeSlideOnlyDeckArtifacts = useCallback(
    async (
      filesSnapshot: ProjectFile[],
      deckFileName?: string | null,
    ): Promise<ProjectFile[]> => {
      if (!slideOnlyMvp) return filesSnapshot;
      const candidate = (deckFileName ?? '').trim();
      const fromCandidate =
        candidate && isCanonicalDeckProjectPath(candidate) ? candidate.replace(/\\/g, '/') : null;
      const entryPath =
        fromCandidate
        ?? resolveCanonicalDeckEntryPath(filesSnapshot);
      if (entryPath) {
        const currentEntry = project.metadata?.entryFile?.trim() ?? '';
        if (currentEntry !== entryPath) {
          const metadata = {
            ...(project.metadata ?? {}),
            kind: 'deck' as const,
            entryFile: entryPath,
          };
          const updated: Project = {
            ...project,
            metadata,
            updatedAt: Date.now(),
          };
          onProjectChange(updated);
          clearProjectCoverCache(project.id);
          try {
            // Await so DesignsTab / cover-hints see entryFile before the user
            // lands back on the project list (fire-and-forget left Canvas pins).
            await patchProject(project.id, { metadata });
          } catch {
            // Local state already pinned the deck entry.
          }
        }
      }
      const deleted = await cleanupRootHtmlReferenceLeaks({
        projectId: project.id,
        files: filesSnapshot,
        slideOnlyMvp: true,
        deleteFile: deleteProjectFile,
      });
      if (deleted.length === 0) return filesSnapshot;
      removeProjectFilesLocally(deleted);
      return refreshProjectFiles();
    },
    [
      slideOnlyMvp,
      project,
      onProjectChange,
      removeProjectFilesLocally,
      refreshProjectFiles,
    ],
  );
  finalizeSlideOnlyDeckArtifactsRef.current = finalizeSlideOnlyDeckArtifacts;

  useEffect(() => {
    projectFilesRef.current = projectFiles;
  }, [projectFiles]);

  // Cache HTML file contents so the auto-open module check (issue #2744) does
  // not re-fetch unchanged entries on every Write. Keyed by file name with the
  // mtime stored alongside, so a rewrite REPLACES the file's single entry
  // rather than accreting a new key. Bounded by the project's HTML file count.
  const htmlContentCacheRef = useRef<Map<string, { mtime: number; text: string | null }>>(
    new Map(),
  );
  const readProjectHtml = useCallback(
    async (name: string): Promise<string | null> => {
      // NFC-tolerant `/files` lookup: metadata / model paths are NFC while
      // listFiles disk bytes can be NFD. Byte-exact `entry.name === name`
      // otherwise ignored mtime cache and forced a raw fetch every time.
      const file = projectFilesRef.current.find((entry) =>
        projectFilePathsReferToSameFile(entry.name, name)
        || projectFilePathsReferToSameFile(entry.path, name),
      );
      const mtime = file?.mtime ?? 0;
      const cached = htmlContentCacheRef.current.get(name);
      if (cached && cached.mtime === mtime) return cached.text;
      // Probe raw + NFC + NFD forms so an NFC caller can reach an NFD-on-disk
      // deck.html (macOS legacy). Return the first form that returns 200.
      const candidates: string[] = [name];
      try {
        const nfc = name.normalize('NFC');
        if (nfc !== name) candidates.push(nfc);
      } catch { /* ignore */ }
      try {
        const nfd = name.normalize('NFD');
        if (nfd !== name && !candidates.includes(nfd)) candidates.push(nfd);
      } catch { /* ignore */ }
      for (const candidate of candidates) {
        try {
          const response = await fetchTeamverDaemon(projectRawUrl(project.id, candidate), {
            teamverProjectId: project.id,
          });
          if (response.ok) {
            const text = await response.text();
            htmlContentCacheRef.current.set(name, { mtime, text });
            return text;
          }
        } catch {
          // Try next candidate.
        }
      }
      htmlContentCacheRef.current.set(name, { mtime, text: null });
      return null;
    },
    [project.id],
  );

  const refreshLiveArtifacts = useCallback(async (): Promise<LiveArtifactSummary[]> => {
    const next = await fetchLiveArtifacts(project.id);
    setLiveArtifacts(next);
    return next;
  }, [project.id]);

  const refreshWorkspaceItems = useCallback(async (): Promise<ProjectFile[]> => {
    const [nextFiles] = await Promise.all([refreshProjectFiles(), refreshLiveArtifacts()]);
    return nextFiles;
  }, [refreshLiveArtifacts, refreshProjectFiles]);

  /**
   * Chat-visible errors must ride on the assistant message's status:error
   * events (and usually `runStatus: failed`). The ephemeral `error` React
   * state is cleared on every message reload, so setError-only paths vanish
   * after page re-entry.
   */
  const surfaceChatVisibleError = useCallback(
    (detail: string, code?: string) => {
      if (!detail?.trim()) return;
      setError(detail);
      const conversationId = activeConversationId;
      if (!conversationId) return;
      setMessages((curr) => {
        let targetId: string | null = null;
        for (let i = curr.length - 1; i >= 0; i -= 1) {
          if (curr[i]?.role === 'assistant') {
            targetId = curr[i]!.id;
            break;
          }
        }
        if (!targetId) return curr;
        const live = liveAssistantMutatorRef.current;
        if (live?.assistantId === targetId) {
          live.apply((prev) => attachPersistedChatError(prev, detail, code));
        }
        return curr.map((m) => {
          if (m.id !== targetId) return m;
          const updated = attachPersistedChatError(m, detail, code);
          if (!isPhantomDaemonRunMessage(updated)) {
            void saveMessage(project.id, conversationId, updated);
          }
          return updated;
        });
      });
    },
    [activeConversationId, project.id],
  );

  useEffect(() => {
    if (!tabsLoadedRef.current) return;
    if (hasAppliedInitialPrimaryOpenRef.current) return;
    if (routeFileName) return;
    if (openTabsState.active || openTabsState.tabs.length > 0) {
      hasAppliedInitialPrimaryOpenRef.current = true;
      return;
    }
    if (tabsHydratedFromSavedStateRef.current) {
      hasAppliedInitialPrimaryOpenRef.current = true;
      return;
    }
    const primaryFile = selectPrimaryProjectFile(projectFiles);
    if (!primaryFile) return;
    hasAppliedInitialPrimaryOpenRef.current = true;
    persistTabsState({ tabs: [primaryFile.name], active: primaryFile.name });
  }, [openTabsState.active, openTabsState.tabs.length, persistTabsState, projectFiles, routeFileName]);

  const requestOpenFile = useCallback((name: string) => {
    if (!name) return;
    const closeTabs = artifactVersionTabsToClose(
      name,
      openTabsStateRef.current.tabs,
    );
    setOpenRequest({
      name,
      nonce: Date.now(),
      ...(closeTabs.length > 0 ? { closeTabs } : {}),
    });
  }, []);

  const persistArtifact = useCallback(
    async (
      art: Artifact,
      projectFilesSnapshot?: ProjectFile[],
      sourceText?: string,
      activityStartedAt?: number,
    ): Promise<ArtifactPersistResult> => {
      {
        const artifactHtml = typeof art.html === 'string' ? art.html.trim() : '';
        const selectedTemplateId =
          selectedDeckTemplateMetadata(project.metadata)?.id
          ?? project.metadata?.selectedDeckTemplateId
          ?? null;
        if (
          shouldDeferSlideOnlyDiscoveryArtifactPersist(messagesRef.current, {
            slideOnlyMvp,
            skipDiscoveryBrief: resolveSlideOnlySkipDiscoveryBrief({
              projectSkipDiscoveryBrief: project.metadata?.skipDiscoveryBrief === true,
              projectKind: project.metadata?.kind ?? null,
              selectedDeckTemplateId: selectedTemplateId,
              runSkipDiscoveryBrief: runSkipDiscoveryBriefRef.current,
            }),
            // Any streamed HTML (including truncated shells) means generation
            // started — never discovery-skip; let salvage / auto-continue run.
            hasArtifactHtml: artifactHtml.length > 0,
            hasCompleteHtmlArtifact: Boolean(
              artifactHtml
                && !isIncompleteHtmlDocumentShell(art.html)
                && validateHtmlArtifact(art.html).ok,
            ),
          })
        ) {
          return { kind: 'skipped-discovery-turn', fileName: artifactBaseNameForPersist(art) };
        }
      }
      let effectiveArt = art;
      const currentProjectFilesForPatch = projectFilesSnapshot ?? projectFilesRef.current;
      const targetFileName = resolveArtifactPersistFileName(
        art,
        currentProjectFilesForPatch,
        openTabsStateRef.current.active,
        {
          preferredFileName: runPersistTargetFileRef.current,
          slideOnlyMvp,
        },
      );
      // One disk read per persist — reused for reconcile / merge / scope /
      // stabilize / noop / duplicate (helpers accept currentHtml).
      let diskHtmlCache: { fileName: string; html: string | null } | null = null;
      const readDiskHtml = async (name: string): Promise<string | null> => {
        if (diskHtmlCache?.fileName === name) return diskHtmlCache.html;
        const html = await fetchProjectFileText(project.id, name, { cache: 'no-store' });
        diskHtmlCache = { fileName: name, html };
        return html;
      };
      const diskHtmlForTarget = await readDiskHtml(targetFileName);
      const persistCommentScope = await resolvePersistCommentScope({
        projectId: project.id,
        fileName: targetFileName,
        commentAttachments: runCommentAttachmentsRef.current,
        currentHtml: diskHtmlForTarget,
      });
      const persistCommentAttachments = persistCommentScope.attachments;
      let scopedAllowedSlideIndexes = persistCommentScope.allowedSlideIndexes
        ?? scopedCommentSlideIndexesFromAttachments(persistCommentAttachments);
      // Reuse reconcile sections for applyScoped / element-patch rediscovery.
      const persistCommentSections = persistCommentScope.sections;
      // deck-patch / element-patch merges already run stabilizeVisualMarkDeckHtml
      // when comment attachments are present — skip a second full-deck pass.
      const visualMarksAlreadyStabilized =
        isElementPatchArtifactType(art.artifactType)
        || isDeckPatchArtifactType(art.artifactType);
      // element-patch / deck-patch apply sanitize before serialize.
      let patchHtmlAlreadySanitized = false;
      // `deck-patch` short-circuits the full-deck emit path. Comment-driven
      // edits carry `<artifact type="deck-patch">` bodies whose sections list
      // ONLY the changed `<section class="slide">` blocks; we merge them into
      // the current deck file here and then fall through to the normal
      // full-deck write path with the merged HTML. See
      // `apps/web/src/artifacts/deck-patch.ts` for the wire contract and the
      // reasoning around output-token cost (a 10-slide deck at ~2–4KB per
      // slide costs 60–120s of streaming for a one-word text change without
      // this pipeline).
      // Comment-driven edits prefer `<artifact type="element-patch">` (structured
      // ManualEditPatch ops applied directly to the pinned element). When the
      // model still emits `<artifact type="deck-patch">`, we merge slide
      // sections and narrow to the comment target with graft fallbacks.
      if (isElementPatchArtifactType(art.artifactType)) {
        const merged = await tryApplyElementPatchesAgainstCurrentDeck({
          projectId: project.id,
          fileName: targetFileName,
          patchBody: art.html,
          sourceText,
          allowedSlideIndexes: scopedAllowedSlideIndexes,
          commentAttachments: persistCommentAttachments,
          instructionText: runVisiblePromptRef.current,
          currentHtml: diskHtmlForTarget,
          currentSlides: persistCommentSections,
        });
        if (!merged.ok) {
          // Empty / patch-less element-patch means the model chose the
          // element-patch contract but did not actually produce a
          // patch. When the run has scoped comment attachments, we
          // route through `skipped-incomplete` so the standard
          // auto-continue path retries the model turn — the scope
          // block is what the model was following in the first place,
          // so re-prompting under the same scope is likely to converge.
          //
          // For unscoped runs (no comment attachments — e.g. a fresh
          // deck generation where the model mistakenly picked
          // element-patch), auto-continue does NOT help: the
          // element-patch contract doesn't match the intent, so
          // re-prompting the model with a "continue where you left
          // off" message will not correct that. Bail out fast with a
          // `rejected` result so the user gets a clear
          // "저장 거부" banner naming the actual reason (empty artifact
          // body) instead of burning three auto-continue retries and
          // eventually landing on the generic `incomplete_output`
          // banner. The rejection reason is surfaced verbatim so the
          // user (and future ops) can distinguish "model returned an
          // empty edit artifact" from "no artifact produced at all".
          const runIsScoped = persistCommentAttachments.length > 0;
          if (
            runIsScoped &&
            (isElementPatchEmptyBody(merged.reason) ||
              shouldRouteScopedCommentEditToAutoContinue(merged.code, merged.reason))
          ) {
            devLog.warn('[element-patch] routing scoped edit to auto-continue', {
              fileName: targetFileName,
              code: merged.code,
              reason: merged.reason,
            });
            return {
              kind: 'skipped-incomplete',
              fileName: targetFileName,
              reason: merged.reason,
            };
          } else if (isElementPatchEmptyBody(merged.reason) && !runIsScoped) {
            devLog.warn('[element-patch] rejecting unscoped empty artifact', {
              fileName: targetFileName,
              reason: merged.reason,
            });
            return {
              kind: 'rejected',
              fileName: targetFileName,
              reason:
                'The model emitted an empty element-patch artifact on a run without a scoped comment target. Retry with a clearer request or use full deck generation.',
            };
          }
          return routeScopedCommentPersistFailure({
            fileName: targetFileName,
            code: merged.code,
            reason: merged.reason,
            runIsScoped,
            logLabel: 'element-patch',
          });
        } else {
          effectiveArt = { ...art, html: merged.html, artifactType: 'deck' };
          patchHtmlAlreadySanitized = true;
        }
      } else if (isDeckPatchArtifactType(art.artifactType)) {
        const merged = await tryApplyDeckPatchAgainstCurrentDeck({
          projectId: project.id,
          fileName: targetFileName,
          patchBody: art.html,
          allowedSlideIndexes: scopedAllowedSlideIndexes,
          commentAttachments: persistCommentAttachments,
          instructionText: runVisiblePromptRef.current,
          currentHtml: diskHtmlForTarget,
          currentSlides: persistCommentSections,
        });
        if (!merged.ok) {
          const runIsScoped = persistCommentAttachments.length > 0;
          if (
            runIsScoped &&
            shouldRouteScopedCommentEditToAutoContinue(merged.code, merged.reason)
          ) {
            devLog.warn('[deck-patch] scoped merge missed comment target — routing to auto-continue', {
              fileName: targetFileName,
              code: merged.code,
              reason: merged.reason,
            });
            return {
              kind: 'skipped-incomplete',
              fileName: targetFileName,
              reason: merged.reason,
            };
          }
          // Empty deck-patch body — model chose deck-patch contract
          // but produced no <section class="slide"> blocks. Route
          // scoped runs to auto-continue (retry will retain the same
          // comment scope). For unscoped runs an empty deck-patch is
          // unrecoverable via retry, so surface it clearly.
          if (
            merged.code === 'deck_patch_parse_failed' &&
            isDeckPatchEmptyBody(art.html ?? '', merged.reason)
          ) {
            if (runIsScoped) {
              devLog.warn('[deck-patch] routing scoped empty deck-patch to auto-continue', {
                fileName: targetFileName,
                reason: merged.reason,
              });
              return {
                kind: 'skipped-incomplete',
                fileName: targetFileName,
                reason: merged.reason,
              };
            }
            devLog.warn('[deck-patch] rejecting unscoped empty deck-patch', {
              fileName: targetFileName,
              reason: merged.reason,
            });
            return {
              kind: 'rejected',
              fileName: targetFileName,
              reason:
                'The model emitted an empty deck-patch artifact on a run without a scoped comment target. Retry with a clearer request or use full deck generation.',
            };
          }
          return routeScopedCommentPersistFailure({
            fileName: targetFileName,
            code: merged.code,
            reason: merged.reason,
            runIsScoped,
            logLabel: 'deck-patch',
          });
        } else {
          effectiveArt = { ...art, html: merged.html, artifactType: 'deck' };
          patchHtmlAlreadySanitized = true;
        }
      } else if (scopedAllowedSlideIndexes && effectiveArt.html) {
        const scopeResult = await fullDeckEditStaysInsideCommentScope({
          projectId: project.id,
          fileName: targetFileName,
          nextHtml: effectiveArt.html,
          allowedSlideIndexes: scopedAllowedSlideIndexes,
          commentAttachments: persistCommentAttachments,
          currentHtml: diskHtmlForTarget,
          beforeSlides: persistCommentSections,
        });
        if (!scopeResult.ok) {
          // Model emitted a full deck on a scoped comment turn (often after
          // auto-continue). Salvage via emergency recovery would hit the same
          // guard — try narrow merge first, then route to scoped auto-continue
          // instead of a hard scope-rejected banner that reads like "you edited
          // the wrong slide".
          const runIsScoped = persistCommentAttachments.length > 0;
          let scopeCheckPassed = false;
          if (runIsScoped) {
            const salvaged = await trySalvageScopedFullDeckRewrite({
              projectId: project.id,
              fileName: targetFileName,
              patchedHtml: effectiveArt.html,
              commentAttachments: persistCommentAttachments,
              instructionText: runVisiblePromptRef.current,
              currentHtml: diskHtmlForTarget,
              currentSlides: persistCommentSections,
              patchedSlides: scopeResult.afterSlides,
            });
            if (salvaged.ok) {
              devLog.warn('[deck-patch] salvaged scoped full-deck rewrite via narrow merge', {
                fileName: targetFileName,
                code: scopeResult.code,
              });
              effectiveArt = { ...effectiveArt, html: salvaged.html };
              patchHtmlAlreadySanitized = true;
              scopeCheckPassed = true;
            } else if (
              shouldRouteScopedCommentEditToAutoContinue(scopeResult.code, salvaged.reason)
              || shouldRouteScopedCommentEditToAutoContinue(scopeResult.code, scopeResult.reason)
            ) {
              devLog.warn('[deck-patch] routing scoped full-deck rewrite to auto-continue', {
                fileName: targetFileName,
                code: scopeResult.code,
                reason: salvaged.reason,
                salvageFailed: true,
              });
              return {
                kind: 'skipped-incomplete',
                fileName: targetFileName,
                reason: salvaged.reason,
              };
            }
          }
          if (!scopeCheckPassed) {
            return routeScopedCommentPersistFailure({
              fileName: targetFileName,
              code: scopeResult.code,
              reason: scopeResult.reason,
              runIsScoped,
              logLabel: 'deck-patch',
            });
          }
        }
        // Full-deck scope acceptance: terminal sanitize below covers the write.
      }
      const recoveredHtml = recoverHtmlArtifactFromPrecedingDocument({
        artifactHtml: effectiveArt.html,
        identifier: effectiveArt.identifier,
        sourceText,
      });
      // Recovery may pull a preceding document — terminal sanitize below
      // scrubs it once after salvage/repair/stabilize mutations.
      let artifactToPersist = recoveredHtml
        ? { ...effectiveArt, html: recoveredHtml }
        : effectiveArt;
      const baseName = artifactBaseNameFor(effectiveArt);
      const ext = artifactExtensionFor(effectiveArt);
      const currentProjectFiles = projectFilesSnapshot ?? projectFilesRef.current;
      const fileName = resolveArtifactPersistFileName(
        artifactToPersist,
        currentProjectFiles,
        openTabsStateRef.current.active,
        {
          preferredFileName: runPersistTargetFileRef.current,
          slideOnlyMvp,
        },
      );
      if (ext === '.html') {
        const pointerTarget = resolveHtmlPointerArtifactTarget({
          content: artifactToPersist.html,
          candidateFileName: fileName,
          projectFiles: currentProjectFiles,
        });
        if (pointerTarget) {
          if (savedArtifactRef.current === pointerTarget) {
            return { kind: 'skipped-duplicate', fileName: pointerTarget };
          }
          savedArtifactRef.current = pointerTarget;
          requestOpenFile(pointerTarget);
          return { kind: 'pointer', fileName: pointerTarget };
        }
      }
      // Pre-write structural gate for HTML artifacts (#50, #1143). Reject
      // bodies that obviously aren't a complete document — usually a one-line
      // prose summary the model emitted inside a deck artifact
      // when only Edit-tool changes happened this turn. Without this guard,
      // such content lands as a phantom HTML file in the project panel.
      if (ext === '.html') {
        // Mid-stream truncation (max_tokens) often leaves a multi-KB deck
        // with real <section class="slide"> content but no </html>. Closing
        // the document here salvages a previewable file instead of skipping
        // the write and burning an auto-continue turn that usually truncates
        // again the same way. Run BEFORE the terminal sanitize so we parse once.
        // Auto-repair truncated max_tokens decks: close unmatched slides +
        // </body></html> when real slide copy already exists. Soft truncation
        // quality is applied inside salvage — do NOT re-reject with the
        // stricter incomplete/low-substance gates or previewable salvage is
        // thrown away and the user only sees incomplete_output.
        const salvaged = salvageTruncatedHtmlDocument(artifactToPersist.html);
        if (salvaged) {
          artifactToPersist = { ...artifactToPersist, html: salvaged };
        }
        // Upstream resolveTerminal / bestArtifact may already have closed the
        // truncated body. Re-running salvage then returns null — still trust
        // closed soft-quality decks so strict incomplete/low-substance cannot
        // throw away the same previewable HTML.
        const trustSoftTruncationSalvage =
          Boolean(salvaged)
          || isClosedSoftSalvageDeckHtml(artifactToPersist.html);
        // Empty scaffolds can pass the 64-char length gate once a charset
        // meta is present — still skip silently so we never write phantoms
        // or flash 「저장을 거부했습니다」 during deck generation.
        if (
          !trustSoftTruncationSalvage
          && isIncompleteHtmlDocumentShell(artifactToPersist.html)
        ) {
          // Quiet skip — do NOT setError here. The terminal auto-open path
          // owns user-facing messaging (deliverable-missing banner and/or
          // the automatic-continue notice). Flashing 「저장을 거부했습니다:
          // incomplete HTML document shell」 mid/end-turn contradicted the
          // auto-continue banner and looked like a product failure during demos.
          return {
            kind: 'skipped-incomplete',
            fileName,
            reason: 'incomplete-html-document-shell',
          };
        }
        const normalizedArtifactType = normalizeSlideOnlyArtifactContractType(
          artifactToPersist.artifactType,
          slideOnlyMvp,
        );
        if (
          !trustSoftTruncationSalvage
          && normalizedArtifactType === 'deck'
          && isLowSubstanceSlideDeckArtifact(artifactToPersist.html)
        ) {
          return {
            kind: 'skipped-incomplete',
            fileName,
            reason: 'low-substance deck artifact',
          };
        }
        const validation = validateHtmlArtifact(artifactToPersist.html);
        if (!validation.ok) {
          surfaceChatVisibleError(
            formatProjectArtifactRejectedError(
              art.identifier || art.title || 'untitled',
              validation.reason,
            ),
            'artifact_rejected',
          );
          return { kind: 'rejected', fileName, reason: validation.reason };
        }
      }
      const title = art.title || art.identifier || fileName;
      let htmlBody =
        ext === '.html'
          ? repairArtifactDocumentHeadIfNeeded(artifactToPersist.html)
          : artifactToPersist.html;
      if (
        ext === '.html'
        && persistCommentAttachments.some(isVisualCommentAttachment)
        && !visualMarksAlreadyStabilized
      ) {
        const currentDeckHtml = await readDiskHtml(fileName);
        if (currentDeckHtml) {
          htmlBody = stabilizeVisualMarkDeckHtml(
            currentDeckHtml,
            htmlBody,
            persistCommentAttachments,
            {
              currentSlides: persistCommentSections,
              mergedSlides: extractTopLevelSlideSections(extractDeckBodyContent(htmlBody)),
            },
          );
        }
      }
      const htmlBodyBeforeSanitize = htmlBody;
      if (ext === '.html' && !patchHtmlAlreadySanitized) {
        // Single terminal scrub after salvage/repair/stabilize — avoids
        // 2–4× DOMParser passes on the same multi-KB deck per persist.
        // element/deck-patch success already sanitized upstream.
        htmlBody = sanitizeManualEditFullSource(htmlBody);
      }
      if (ext === '.html') {
        // Heal model-emitted <img src> that used a human/original filename
        // (or sanitized basename without the upload timestamp prefix) instead
        // of the real on-disk path from /upload. Union turn attachments so
        // Drive `refs/drive/…` heals even when /files has not refreshed yet.
        const attachmentPaths = runAttachmentsRef.current
          .map((attachment) => attachment.path.trim())
          .filter(Boolean);
        const projectPaths = [
          ...currentProjectFiles.map(
            (file) => String(file.path || file.name || '').trim(),
          ),
          ...attachmentPaths,
        ].filter(Boolean);
        htmlBody = rewriteAttachmentImageSrcs(htmlBody, projectPaths, {
          preferredPaths: attachmentPaths,
        });
      }
      if (ext === '.html' && persistCommentAttachments.length > 0) {
        const currentScopedHtml = await readDiskHtml(fileName);
        if (
          currentScopedHtml
          && normalizeHtmlForRecoveredArtifactComparison(currentScopedHtml)
            === normalizeHtmlForRecoveredArtifactComparison(htmlBody)
        ) {
          // Model "edited" only unsafe markup that sanitize removed — reject
          // explicitly instead of skipped-incomplete (auto-continue churn).
          if (
            normalizeHtmlForRecoveredArtifactComparison(currentScopedHtml)
            !== normalizeHtmlForRecoveredArtifactComparison(htmlBodyBeforeSanitize)
          ) {
            devLog.warn('[deck-patch] scoped edit scrubbed to no-op', {
              fileName,
            });
            return {
              kind: 'rejected',
              fileName,
              reason: 'scoped comment edit only contained unsafe markup that was scrubbed',
            };
          }
          devLog.warn('[deck-patch] scoped edit produced no disk change', {
            fileName,
          });
          return {
            kind: 'skipped-noop',
            fileName,
            reason: 'scoped comment edit did not change the deck on disk',
          };
        }
      }
      if (savedArtifactRef.current === fileName) {
        const currentHtml = await readDiskHtml(fileName);
        if (
          normalizeHtmlForRecoveredArtifactComparison(currentHtml)
          === normalizeHtmlForRecoveredArtifactComparison(htmlBody)
        ) {
          return { kind: 'skipped-duplicate', fileName };
        }
      }
      savedArtifactRef.current = fileName;
      if (isTeamverEmbedMode()) {
        await refreshTeamverEmbedAuthBeforeMutating({ activityStartedAt });
      }
      const contractArtifactType = normalizeSlideOnlyArtifactContractType(
        artifactToPersist.artifactType,
        slideOnlyMvp,
      );
      const metadata = {
        identifier: art.identifier,
        artifactType: contractArtifactType,
        inferred: false,
      };
      const manifest =
        ext === '.html'
          ? createArtifactManifest({
              entry: fileName,
              title,
              artifactType: contractArtifactType,
              preferDeck: slideOnlyMvp,
              sourceSkillId: project.skillId ?? undefined,
              designSystemId: project.designSystemId,
              metadata,
            })
          : inferLegacyManifest({
              entry: fileName,
              title,
              metadata: {
                ...metadata,
                sourceSkillId: project.skillId ?? undefined,
                designSystemId: project.designSystemId,
              },
            });
      const regression = findClientArtifactRegression({
        fileName,
        htmlBody,
        projectFiles: currentProjectFiles,
      });
      if (regression) {
        devLog.warn('[teamver] blocked placeholder artifact regression before save', {
          fileName: regression.fileName,
          priorSize: regression.priorSize,
          newSize: regression.newSize,
        });
        // Use the unified regression-rejected banner so both the
        // client-side pre-write guard (this branch) and the daemon
        // stub-guard reject (surfaced later via
        // formatProjectArtifactSaveFailedError → save-failed
        // ARTIFACT_REGRESSION branch → the same helper) share one
        // reassurance copy. `regression.reason` (the technical byte-
        // count sentence) is kept in the console log above for
        // diagnostics and in the artifact-regression persist result
        // for downstream analytics, but the on-screen banner explains
        // what happened + reassures about the preserved deck + names
        // the escape-hatch env var, so users don't stare at a mixed-
        // language "저장을 거부: New artifact body …" reason.
        surfaceChatVisibleError(
          formatProjectArtifactRegressionRejectedError(regression.fileName),
          'artifact_regression',
        );
        return {
          kind: 'artifact-regression',
          fileName: regression.fileName,
          reason: regression.reason,
        };
      }
      // Dense 2-slide rewrites can pass the byte-size check while destroying
      // an 8-slide deck after an image-insert turn. Block slide-count collapse
      // even on comment-scoped persists (image+pin turns previously skipped
      // this guard and still collapsed 8→2). Existing-deck / image-embed turns
      // use strict mode so soft shrink (8→6) is also rejected.
      if (ext === '.html') {
        try {
          const priorHtml = await readDiskHtml(fileName);
          const runImagePaths = imageAttachmentPathsForSlideEmbed(runAttachmentsRef.current);
          const strictSlideCount =
            persistCommentAttachments.length > 0
            || runImagePaths.length > 0
            || Boolean(runPersistTargetFileRef.current);
          const slideRegression = findClientSlideCountRegression({
            fileName,
            htmlBody,
            priorHtml,
            strict: strictSlideCount,
          });
          if (slideRegression) {
            devLog.warn('[teamver] blocked slide-count collapse before save', {
              fileName: slideRegression.fileName,
              priorCount: slideRegression.priorCount,
              newCount: slideRegression.newCount,
              commentScoped: persistCommentAttachments.length > 0,
              strict: strictSlideCount,
            });
            surfaceChatVisibleError(
              formatProjectArtifactRegressionRejectedError(slideRegression.fileName),
              'artifact_regression',
            );
            return {
              kind: 'artifact-regression',
              fileName: slideRegression.fileName,
              reason: slideRegression.reason,
            };
          }
        } catch {
          // Soft-fail — missing prior HTML should not block otherwise-valid saves.
        }
      }
      const truncateAfterSequence = getActiveRevisionSequence(project.id, fileName);
      const assistantMessageId = [...messagesRef.current]
        .reverse()
        .find((message) => message.role === 'assistant')?.id;
      const result = ext === '.html'
        ? await pushProjectFileRevision(
          project.id,
          fileName,
          {
            content: htmlBody,
            source: mapArtifactTypeToRevisionSource(artifactToPersist.artifactType),
            label: deriveAgentRevisionLabel(persistCommentAttachments, title),
            ...(manifest ? { artifactManifest: manifest } : {}),
            ...(activeConversationId ? { conversationId: activeConversationId } : {}),
            ...(assistantMessageId ? { assistantMessageId } : {}),
            ...(typeof truncateAfterSequence === 'number'
              ? { truncateAfterSequence }
              : {}),
          },
        )
        : await writeProjectTextFileDetailed(
          project.id,
          fileName,
          htmlBody,
          { artifactManifest: manifest ?? undefined },
        );
      if (result.ok) {
        const file = result.file;
        const pushedRevision = ext === '.html' && 'revision' in result
          ? (result as { ok: true; revision: FileRevision; file: ProjectFile }).revision
          : null;
        // A newer successful write supersedes any stashed replay for this
        // exact filename — the file the user is looking at is now the one
        // on disk, not the pre-401 in-memory snapshot.
        clearPendingArtifactWrite(project.id, file.name);
        setPendingRecoveryPreview((prev) =>
          prev && prev.fileName === file.name ? null : prev,
        );
        setFilesRefresh((n) => n + 1);
        // Surface the daemon's stub-guard warning when it fires in `warn`
        // mode (the default). Without this the warning would land in the
        // file metadata silently and the user would never see that the
        // model shipped a placeholder.
        if (file.stubGuardWarning) {
          // Warn-mode stub guard: file still persisted. Keep as session banner
          // (not runStatus:failed) so a successful deliverable is not marked failed.
          setError(
            formatProjectArtifactStubWarning(file.name, file.stubGuardWarning.message),
          );
        }
        // Auto-open the freshly-persisted artifact as a tab so the user
        // sees it without an extra click. The Write-tool path already does
        // this for tool-emitted files; this handles the artifact-tag path.
        requestOpenFile(file.name);
        if (pushedRevision) {
          setRevisionContentCache(project.id, file.name, pushedRevision.id, htmlBody);
          setActiveRevisionSequence(project.id, file.name, pushedRevision.sequence);
          emitRevisionPush(
            analytics.track,
            project.id,
            projectKindToTracking(project.metadata?.kind, project.metadata?.videoModel),
            file.name,
            pushedRevision,
            'agent_persist',
          );
          // Undo only when we have a real parent revision id — comments alone
          // must not surface an action that POSTs /revisions/null/restore.
          if (typeof pushedRevision.parentRevisionId === 'string') {
            const parentRevisionId = pushedRevision.parentRevisionId;
            const restoredFileName = file.name;
            setProjectActionsToast({
              message: embedUiLabel('AI edit saved', 'AI 편집을 저장했습니다'),
              details: restoredFileName,
              actionLabel: embedUiLabel('Undo', '실행 취소'),
              onAction: () => {
                void (async () => {
                  const restored = await restoreProjectFileRevision(
                    project.id,
                    restoredFileName,
                    parentRevisionId,
                  );
                  if (!restored.ok) return;
                  const cursorRevision = restored.revision;
                  emitRevisionUndo(
                    analytics.track,
                    project.id,
                    projectKindToTracking(project.metadata?.kind, project.metadata?.videoModel),
                    restoredFileName,
                    cursorRevision,
                    'agent_toast',
                  );
                  // Demote SSOT before refresh; drop in-memory tip HTML so
                  // liveHtml cannot repaint the agent tip over restored disk.
                  setActiveRevisionSequence(project.id, restoredFileName, cursorRevision.sequence);
                  setArtifact(null);
                  setFilesRefresh((count) => count + 1);
                  setProjectActionsToast(null);
                })();
              },
            });
          }
        }
        return {
          kind: 'persisted',
          fileName: file.name,
          parentRevisionId: pushedRevision?.parentRevisionId ?? null,
        };
      } else {
        // Clear the saved-artifact ref so the streaming layer can retry
        // the write (idempotent by fileName) once auth or the daemon
        // recovers, regardless of which failure branch we take below.
        savedArtifactRef.current = '';
        let stashedForAutoRetry = false;
        if (result.status === 401) {
          notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
          // Session expired between stream completion and this write. The
          // model has already produced the deck (we just watched it stream
          // in) and re-running the turn wastes minutes of tokens. Stash the
          // exact payload so the auth-recovery listener can PUT the same
          // bytes once the cookie is refreshed / the user re-authenticates.
          // FileWorkspace also reads `pendingRecoveryPreview` to render a
          // memory-only preview so the user is not staring at an empty
          // panel while the retry ladder runs in the background.
          const stashed = stashPendingArtifactWrite({
            projectId: project.id,
            fileName,
            htmlBody,
            artifactManifest: manifest ?? undefined,
          });
          if (stashed) {
            stashedForAutoRetry = true;
            setPendingRecoveryPreview({ fileName, html: htmlBody });
            // Punch the workspace onto the (still-nonexistent) file tab so
            // FileWorkspace's memoryOnlyPreview branch actually renders.
            // Otherwise a user who answered a question form stays on the
            // Questions tab after "완료됨" and never sees the fallback iframe
            // — the recovery is invisible to them because our fallback sits
            // inside the preview-file tab slot in the render ladder.
            requestOpenFile(fileName);
          } else {
            devLog.warn('[teamver] failed to stash artifact for auth-recovery replay', {
              projectId: project.id,
              fileName,
              htmlLength: htmlBody.length,
            });
          }
        }
        // When we already stashed the payload for automatic replay AND put
        // up the memory-preview banner ("세션 만료 — 다시 로그인하면 자동
        // 재시도"), do not additionally set a top-of-page "저장 실패, 다시
        // 로그인한 뒤 시도하세요" error. The two banners contradict each
        // other and would train the user to think a manual retry is
        // required when the recovery loop is already armed. The passive
        // auth banner (via notifyTeamverEmbedAuthFailureIfNeeded) still
        // fires so the user knows the session lapsed.
        //
        // All other failure classes (403 permission, 404 gone, 5xx, network,
        // stash-failure fallback) still surface the actionable error, since
        // they either require a manual action or indicate no recovery is
        // scheduled.
        if (!stashedForAutoRetry) {
          surfaceChatVisibleError(
            formatProjectArtifactSaveFailedError(fileName, {
              status: result.status,
              code: result.code,
              message: result.message,
            }),
            result.code ?? 'artifact_save_failed',
          );
        }
        if (stashedForAutoRetry) return { kind: 'auth-replay-queued', fileName };
        return {
          kind: 'save-failed',
          fileName,
          status: result.status,
          code: result.code,
          message: result.message,
        };
      }
    },
    [
      project.id,
      project.designSystemId,
      project.skillId,
      project.metadata?.skipDiscoveryBrief,
      project.metadata?.kind,
      project.metadata?.selectedDeckTemplateId,
      requestOpenFile,
      slideOnlyMvp,
      activeConversationId,
      surfaceChatVisibleError,
    ],
  );

  // Auth-recovery replay: when the embed cookie is refreshed after a session
  // outage that left an HTML artifact stranded in memory (§persistArtifact 401
  // path), retry the exact write we stashed so the deck the user just watched
  // stream in lands on daemon disk without asking the model to regenerate it.
  //
  // The replay is idempotent by fileName: writeProjectTextFileDetailed clears
  // the stash on 2xx, so a subsequent recovery event does nothing. If the
  // retry itself 401s (a rare double-outage), persistArtifact's stash path
  // simply re-runs and the entry stays queued for the next recovery.
  //
  // Also seeds `pendingRecoveryPreview` on mount / project switch so the
  // memory-only preview fallback (FileWorkspace) can show the deck even after
  // a hard refresh that dropped `artifact` state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const projectId = project.id;
    const seed = peekLatestPendingArtifactWrite(projectId);
    setPendingRecoveryPreview(
      seed ? { fileName: seed.fileName, html: seed.htmlBody } : null,
    );

    const replay = async () => {
      // Soft/hard sticky: C1 owns recovery. Replaying PUTs here only floods
      // daemon 401s until the user clicks 「다시 시도」 / escalate clears decline.
      if (isDesignAuthRefreshDeclined()) return;
      const pending = listPendingArtifactWrites(projectId);
      if (pending.length === 0) return;
      let anySucceeded = false;
      let anyRemaining = false;
      for (const entry of pending) {
        if (cancelled) return;
        try {
          const result = await writeProjectTextFileDetailed(
            entry.projectId,
            entry.fileName,
            entry.htmlBody,
            {
              artifactManifest: (entry.artifactManifest as ArtifactManifest | undefined),
            },
          );
          if (cancelled) return;
          if (result.ok) {
            anySucceeded = true;
            clearPendingArtifactWrite(entry.projectId, entry.fileName);
            savedArtifactRef.current = result.file.name;
            requestOpenFile(result.file.name);
          } else if (result.status !== 401) {
            // Non-auth failure — the retry will never help; drop the stash.
            clearPendingArtifactWrite(entry.projectId, entry.fileName);
            devLog.warn('[teamver] pending artifact replay failed non-401; dropping', {
              projectId: entry.projectId,
              fileName: entry.fileName,
              status: result.status,
              code: result.code,
            });
          } else {
            anyRemaining = true;
          }
        } catch (err) {
          if (cancelled) return;
          anyRemaining = true;
          devLog.warn('[teamver] pending artifact replay threw', {
            projectId: entry.projectId,
            fileName: entry.fileName,
            err,
          });
        }
      }
      if (cancelled) return;
      if (anySucceeded) setFilesRefresh((n) => n + 1);
      // Once every stashed replay lands, the memory-only fallback would
      // double-render the same bytes the FileViewer just picked up from
      // disk — clear it so we do not confuse the user with a duplicate
      // banner over their now-persistent deck.
      if (!anyRemaining) setPendingRecoveryPreview(null);
    };
    // Some recovery paths land the fresh cookie via a probe/ensure that
    // does not fire the passive-auth event (e.g. explicit sign-in return).
    // A one-shot mount replay covers that case; subsequent recoveries wait
    // for the event.
    void replay();
    const onRecovered = () => {
      void replay();
    };
    // `TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT` covers the background 401
    // ladder in handleEmbedPassiveUnauthorized / schedulePassiveLoginRedirect.
    // The manual "다시 시도" button in TeamverSessionBanner goes through
    // useTeamverEmbed.refresh which fires PASSIVE_AUTH_RECOVERED only on the
    // isSessionExpiredError revive branch — the normal success path only
    // fires SESSION_CHANGED (and only when embedSessionAuthenticated flipped,
    // which it did not if the memory flag stayed sticky-true through the
    // outage). We subscribe to the session-changed helper as a second
    // trigger so a "flag was already true → refresh confirmed" recovery
    // still drains our stash. The `authenticated` filter avoids re-running
    // replay on sign-out transitions.
    window.addEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, onRecovered);
    const unsubscribeSessionChanged = subscribeTeamverEmbedSessionChanged(
      ({ authenticated }) => {
        if (authenticated) void replay();
      },
    );
    return () => {
      cancelled = true;
      window.removeEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, onRecovered);
      unsubscribeSessionChanged();
    };
  }, [project.id, requestOpenFile]);

  const artifactFromStandaloneHtml = useCallback((sourceText: string): Artifact | null => {
    const html = recoverBestHtmlDocumentFromText(sourceText);
    if (!html) return null;
    return {
      identifier: 'response',
      artifactType: 'deck',
      title: 'Response',
      html,
    };
  }, []);

  // Set of project file names that the chat surface uses to decide whether
  // a tool card's path is openable as a tab. Recomputed on every file-list
  // change; tool cards just read from the set.
  const projectFileNames = useMemo(() => {
    const names = new Set<string>();
    for (const file of projectFiles) {
      const name = file.name?.trim();
      const path = file.path?.trim();
      if (name) names.add(name);
      if (path) names.add(path);
      const resolved = projectFileResolvedPath(file);
      if (resolved) names.add(resolved);
    }
    return names;
  }, [projectFiles]);

  useEffect(() => {
    reconcileProjectRawFileMissingCache(project.id, projectFileNames);
  }, [project.id, projectFileNames]);

  const activeProjectFileName = useMemo(
    () => (
      openTabsState.active && projectFileNames.has(openTabsState.active)
        ? openTabsState.active
        : null
    ),
    [openTabsState.active, projectFileNames],
  );
  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );

  // Keep the @-picker's source of truth fresh: every refreshSignal bump
  // (artifact saved, sketch saved, image uploaded) refetches; on first
  // mount we also do an initial pull so attachments staged before the
  // agent has written anything still see the user's pasted images.
  useEffect(() => {
    void refreshWorkspaceItems().catch(() => {
      // The daemon probe can briefly lag behind a just-started local
      // runtime. Retry when daemonLive flips or the explicit refresh key
      // changes instead of leaving the project view in its empty shell.
    });
  }, [daemonLive, refreshWorkspaceItems, filesRefresh]);

  // Live-reload: when the daemon's chokidar watcher reports a file change,
  // bump filesRefresh so the file list refetches with new mtimes — which
  // propagates through to FileViewer iframes via PR #384's ?v=${mtime}
  // cache-bust, triggering an automatic preview reload without a click.
  //
  // Coalesce the refresh: agent rewrites surface to chokidar as an
  // `unlink` + `add` (+ later `change`) burst within a single tick (#2195).
  // Refreshing the file list on the intermediate `unlink` makes the open
  // tab's active file vanish for one frame before the `add` restores it,
  // and FileWorkspace's "tab no longer on disk" path then drops the user
  // out of their preview. A short trailing wait absorbs the burst; the
  // maxWait cap stops a sustained edit storm from starving the UI.
  // Keep maxWait ≥ HtmlViewer `HTML_PREVIEW_DISK_FETCH_DEBOUNCE_MS` (200)
  // so refresh-key churn cannot cancel every scheduled disk preview fetch.
  const refreshFilesAndDesignMd = useCallback(() => {
    setFilesRefresh((n) => n + 1);
    // Round 7 (mrcfps): file mutations are the dominant staleness signal
    // post-finalize — bump the refresh key so DESIGN.md staleness
    // recomputes against the new mtimes.
    setDesignMdRefreshKey((n) => n + 1);
  }, []);
  const coalescedFileChangedRefresh = useCoalescedCallback(
    refreshFilesAndDesignMd,
    { wait: 80, maxWait: 250 },
  );
  const handleProjectEvent = useCallback((evt: ProjectEvent) => {
    if (evt.type === 'file-changed') {
      iframeKeepAlivePool.evictProject(project.id);
      coalescedFileChangedRefresh();
      return;
    }
    if (evt.type === 'conversation-created') {
      // A new conversation was inserted into this project by a path the
      // open project view can't observe through its own state (currently:
      // Routines "Run now" in reuse-an-existing-project mode, #1361).
      // Refetch the conversation list so the new entry becomes visible
      // without requiring the user to leave and re-enter the project.
      // Deliberately do NOT change the active conversation here — the
      // user keeps their current context. Auto-switch is a separate UX
      // decision tracked in #1361.
      if (evt.projectId !== project.id) return;
      const capturedProjectId = project.id;
      const myToken = ++conversationsRefreshTokenRef.current;
      void (async () => {
        try {
          const list = await listConversations(capturedProjectId);
          // Bail if the user switched projects while this request was in
          // flight (#1361 review, Codex P1). The captured project id is the
          // one we asked the daemon about; the live ref is the one the
          // user is looking at right now. If they don't match, applying
          // the list would overwrite the new project's sidebar with
          // stale data from the old one.
          if (projectIdRef.current !== capturedProjectId) return;
          // Bail if a newer conversation-created event already dispatched
          // its own refresh after us (#1361 review, lefarcen P2). With two
          // rapid events the later request may resolve first; if this
          // earlier request resolves afterwards it would drop the newer
          // conversation. Only the latest dispatch is allowed to apply.
          if (conversationsRefreshTokenRef.current !== myToken) return;
          setConversations(list);
        } catch {
          // Defensive: refresh failed (network blip, daemon gone). The
          // next project mount or another conversation-created event
          // will retry; no need to surface an error here.
        }
      })();
      return;
    }
    const agentEvent = projectEventToAgentEvent(evt);
    if (!agentEvent) return;
    setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, agentEvent));
    void refreshLiveArtifacts();
    onProjectsRefresh();
    // Live artifact events come from chat-turn-emitted artifacts; they
    // also imply the conversation transcript changed.
    setDesignMdRefreshKey((n) => n + 1);
  }, [coalescedFileChangedRefresh, iframeKeepAlivePool, onProjectsRefresh, refreshLiveArtifacts, project.id]);
  useProjectFileEvents(project.id, daemonLive, handleProjectEvent);

  const activePromptContextSignature = useMemo(() => {
    const skill = project.skillId
      ? (skills.find((s) => s.id === project.skillId) ??
        designTemplates.find((s) => s.id === project.skillId))
      : null;
    const designSystem = project.designSystemId
      ? designSystems.find((d) => d.id === project.designSystemId)
      : null;
    return JSON.stringify({
      designSystem: designSystem
        ? {
            id: designSystem.id,
            title: designSystem.title,
            category: designSystem.category,
            summary: designSystem.summary,
            source: designSystem.source ?? null,
          }
        : null,
      skill: skill
        ? {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            mode: skill.mode,
            source: skill.source ?? null,
            upstream: skill.upstream,
          }
        : null,
    });
  }, [designSystems, designTemplates, project.designSystemId, project.skillId, skills]);
  const chatComposerSkills = useMemo(() => {
    if (designTemplates.length === 0) return skills;
    const seen = new Set<string>();
    const combined: SkillSummary[] = [];
    for (const skill of [...skills, ...designTemplates]) {
      if (seen.has(skill.id)) continue;
      seen.add(skill.id);
      combined.push(skill);
    }
    return combined;
  }, [designTemplates, skills]);
  const previousPromptContextSignatureRef = useRef(activePromptContextSignature);
  useEffect(() => {
    if (previousPromptContextSignatureRef.current === activePromptContextSignature) return;
    previousPromptContextSignatureRef.current = activePromptContextSignature;
    iframeKeepAlivePool.evictProject(project.id, { includeActive: true });
  }, [activePromptContextSignature, iframeKeepAlivePool, project.id]);

  // When the URL points at a specific file, fire an open request so the
  // FileWorkspace promotes it to an active tab. We watch routeFileName
  // (the parsed segment) so back/forward navigation triggers the same path.
  useEffect(() => {
    if (!routeFileName) return;
    requestOpenFile(routeFileName);
  }, [routeFileName, requestOpenFile]);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    if (!routeFileName) return;
    // Consume stale post-run publish arms on file deep-link entry, but do not
    // open Drive UI automatically. Drive publish is a user-initiated action;
    // otherwise simply entering `/files/deck.html` can surface the modal even
    // when no Drive button was clicked.
    consumeTeamverPublishMenuArm(project.id, routeFileName);
  }, [project.id, routeFileName]);

  // Sync the URL when the active tab changes, so reload + share-link both
  // land back on the same view. Replace (not push) on tab activation so the
  // history stack doesn't fill with every tab click.
  // Composite sync key: tracks BOTH the active file target AND the active
  // conversation id, so a conversation-only change (e.g. `listConversations`
  // resolves after `loadTabs` hydrated the active tab, or the user picks a
  // different conversation under the same tab) still triggers the navigate
  // and pushes `/conversations/:cid` into the URL. Keying only on the file
  // target lost that update because the early-return saw `target` unchanged
  // and skipped the navigate (lefarcen P1 on PR #1508).
  const lastSyncedRouteKeyRef = useRef<string | null>(null);
  const lastSeenRouteConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    const target = openTabsState.active && (
      openTabsState.tabs.includes(openTabsState.active)
      || projectFileNames.has(openTabsState.active)
      || isLiveArtifactTabId(openTabsState.active)
    )
      ? openTabsState.active
      : null;
    const nextKey = `${activeConversationId ?? ''}:${target ?? ''}`;
    if (nextKey === lastSyncedRouteKeyRef.current) return;
    lastSyncedRouteKeyRef.current = nextKey;
    lastSyncedConversationIdRef.current = activeConversationId;
    // PerishCode + Codex P1 on PR #1508: the prior version of this
    // sync stripped any `/conversations/:cid` segment from the URL as
    // soon as a tab became active, which regressed the deep-link
    // behavior the parent commit was meant to add (reload / share
    // would fall back to `list[0]` instead of the routed run's
    // conversation). Thread the active conversation id so the URL
    // always reflects the conversation the project view is actually
    // showing, matching how `fileName` already tracks the active tab.
    navigate(
      {
        kind: 'project',
        projectId: project.id,
        conversationId: activeConversationId,
        fileName: target,
      },
      { replace: true },
    );
  }, [openTabsState.active, projectFileNames, project.id, activeConversationId]);

  const handleEnsureProject = useCallback(async (): Promise<string | null> => {
    return project.id;
  }, [project.id]);

  const composedSystemPrompt = useCallback(async (
    sessionModeOverride: ChatSessionMode = activeSessionMode,
    designSystemIdOverride?: string | null,
    skillIdOverride?: string | null,
    pluginIdForLocalSkill?: string | null,
    pluginBlock?: string | null,
    turnDeckTemplateMeta?: Pick<
      ProjectChatSendMeta,
      'selectedDeckTemplateId' | 'selectedDeckTemplateTitle' | 'skipDiscoveryBrief'
    > | null,
    slideEditContracts?: {
      includeCommentEditPatchRule?: boolean;
      includeExistingDeckImageEditRule?: boolean;
    } | null,
  ): Promise<string> => {
    let skillBody: string | undefined;
    let skillName: string | undefined;
    let skillMode: SkillSummary['mode'] | undefined;
    let designSystemBody: string | undefined;
    let designSystemTitle: string | undefined;

    // Prefer persisted project metadata, then this-turn Canvas/Drive pin.
    // Confirm flows `patchProject` then send immediately; React state can
    // still be stale on the first compose, which previously dropped the
    // selected template and re-summarized the visual contract away.
    const selectedTemplate = selectedDeckTemplateMetadata(
      project.metadata,
      turnDeckTemplateMeta,
    );
    if (selectedTemplate) {
      const cached = pluginSkillCache.current.get(selectedTemplate.id);
      // Bust pre-kit caches so Daisy Days / Zhangzara templates reload with
      // example.html CSS tokens instead of a prose-only visual summary.
      const cachedLooksRich =
        typeof cached === 'string'
        && cached.includes('## Template visual kit (from example.html)');
      if (cached !== undefined && cachedLooksRich) {
        skillBody = cached;
        skillName = selectedTemplate.title ?? skillName;
        skillMode = 'deck';
      } else {
        // Picker ids are plugin install ids (`example-html-ppt-…`). Prefer the
        // plugin-local SKILL (with frontmatter visual summary + example.html
        // visual kit) before the design-template registry.
        const local = await fetchPluginLocalSkill(selectedTemplate.id);
        if (local) {
          skillBody = local.body;
          skillName = selectedTemplate.title ?? local.name;
          skillMode = 'deck';
          pluginSkillCache.current.set(selectedTemplate.id, local.body);
        } else {
          const bareDesignTemplateId = selectedTemplate.id.startsWith('example-')
            ? selectedTemplate.id.slice('example-'.length)
            : null;
          const summary =
            skills.find((s) => s.id === selectedTemplate.id) ??
            designTemplates.find((s) => s.id === selectedTemplate.id) ??
            (bareDesignTemplateId
              ? designTemplates.find((s) => s.id === bareDesignTemplateId)
              : undefined);
          skillName = selectedTemplate.title ?? summary?.name;
          skillMode = summary?.mode ?? 'deck';
          const detail =
            (await fetchSkill(selectedTemplate.id)) ??
            (await fetchDesignTemplate(selectedTemplate.id)) ??
            (bareDesignTemplateId
              ? await fetchDesignTemplate(bareDesignTemplateId)
              : null);
          if (detail) {
            const detailBody = prependSkillDetailVisualSummary(
              detail.body,
              detail.description,
            );
            skillBody = detailBody;
            pluginSkillCache.current.set(selectedTemplate.id, detailBody);
          }
        }
      }
    }

    const effectiveSkillId = skillIdOverride ?? project.skillId;
    if (
      !skillBody?.trim()
      && effectiveSkillId
      && effectiveSkillId !== selectedTemplate?.id
    ) {
      // effectiveSkillId can resolve to either root after the
      // skills/design-templates split; check both lists so a template-backed
      // project keeps composing its template body when running in API mode.
      const summary =
        skills.find((s) => s.id === effectiveSkillId) ??
        designTemplates.find((s) => s.id === effectiveSkillId);
      skillName = summary?.name;
      skillMode = summary?.mode;
      const cached = skillCache.current.get(effectiveSkillId);
      if (cached !== undefined) {
        skillBody = cached;
      } else {
        const detail =
          (await fetchSkill(effectiveSkillId)) ??
          (await fetchDesignTemplate(effectiveSkillId));
        if (detail) {
          skillBody = detail.body;
          skillCache.current.set(effectiveSkillId, detail.body);
        } else {
          // Deck community plugins pin project.skillId to the plugin id
          // (huashu-slides, etc.) — not a global skill/design-template row.
          const local = await fetchPluginLocalSkill(effectiveSkillId);
          if (local) {
            skillBody = local.body;
            skillName = local.name;
            skillMode = skillMode ?? 'deck';
            skillCache.current.set(effectiveSkillId, local.body);
          }
        }
      }
    }
    // Scenario plugin SKILL stays available as a secondary compose block when
    // a visual/primary skill already filled skillBody — do not drop structure
    // rules. Gate on primary id (metadata OR this-turn skillIdOverride), not
    // React metadata alone: Canvas/Drive confirm patches metadata then sends
    // immediately, so project.metadata can still be stale on the first turn.
    const primaryDeckSkillId =
      selectedTemplate?.id
      ?? (typeof skillIdOverride === 'string' && skillIdOverride.trim()
        ? skillIdOverride.trim()
        : null)
      ?? (typeof project.skillId === 'string' && project.skillId.trim()
        ? project.skillId.trim()
        : null);
    let secondaryScenarioSkillBody: string | undefined;
    let secondaryScenarioSkillName: string | undefined;
    if (
      pluginIdForLocalSkill
      && pluginIdForLocalSkill !== primaryDeckSkillId
    ) {
      const cached = pluginSkillCache.current.get(pluginIdForLocalSkill);
      if (cached !== undefined) {
        if (!skillBody?.trim() && !selectedTemplate) {
          // Never promote the scenario (simple-deck) body into the primary
          // slot when a visual template was selected — that made the wrapped
          // "Selected deck template" section contain Simple Deck itself.
          skillBody = cached;
        } else if (skillBody?.trim()) {
          secondaryScenarioSkillBody = cached;
          secondaryScenarioSkillName = pluginIdForLocalSkill;
        } else {
          secondaryScenarioSkillBody = cached;
          secondaryScenarioSkillName = pluginIdForLocalSkill;
        }
      } else {
        const local = await fetchPluginLocalSkill(pluginIdForLocalSkill);
        if (local) {
          pluginSkillCache.current.set(pluginIdForLocalSkill, local.body);
          if (!skillBody?.trim() && !selectedTemplate) {
            skillBody = local.body;
            skillName = local.name;
          } else {
            secondaryScenarioSkillBody = local.body;
            secondaryScenarioSkillName = local.name;
          }
        }
      }
    }
    if (!skillBody?.trim() && selectedTemplate) {
      skillBody = selectedDeckTemplateTitleStub(
        selectedTemplate.title?.trim() || selectedTemplate.id,
      );
      skillName = selectedTemplate.title?.trim() || selectedTemplate.id;
      skillMode = 'deck';
    }
    const shouldWrapSelectedTemplate =
      Boolean(skillBody?.trim())
      && (
        Boolean(selectedTemplate)
        || (
          Boolean(skillIdOverride?.trim())
          && skillMode === 'deck'
          && skillIdOverride !== pluginIdForLocalSkill
        )
      );
    if (shouldWrapSelectedTemplate) {
      const title =
        skillName?.trim()
        || selectedTemplate?.title
        || 'selected deck template';
      skillBody = wrapSelectedDeckTemplateSkillBody(skillBody!, title);
    }
    // Do NOT wrap every deck skill as "user explicitly picked this template".
    // That false framing ran for default Simple Deck / no-template paths and
    // fought the summarized Visual style reference + Neutral compact contract.
    const secondary = secondaryScenarioSkillBody?.trim();
    // Teamver slide-only BYOK: never splice the default scenario SKILL
    // (example-simple-deck) into the selected visual template body. That
    // append lived under `## Selected deck template — MUST MATCH`, so the
    // model treated Simple Deck's light/dark hero rhythm as the visual
    // contract ("기본 템플릿이 이용되고 있다") even when the picked
    // template had loaded. Compact deck framework already covers structure.
    const omitSecondaryScenarioForSelectedTemplate =
      Boolean(selectedTemplate)
      && slideOnlyMvp
      && config.mode === 'api';
    if (
      skillBody?.trim()
      && secondary
      && !skillBody.includes(secondary)
      && !omitSecondaryScenarioForSelectedTemplate
    ) {
      const secondaryName = secondaryScenarioSkillName?.trim() || 'scenario';
      skillBody += `\n\n---\n\n## Composed skill — ${secondaryName}\n\n${secondary}`;
    }
    // Selected visual template owns palette/fonts via example.html kit.
    // Skip loading Neutral Modern (or any DS) body into BYOK compose — even a
    // "SECONDARY" DESIGN.md still steers the model toward sparse corporate.
    const omitDesignSystemForSelectedTemplate =
      Boolean(selectedTemplate)
      && slideOnlyMvp
      && config.mode === 'api';
    if (!omitDesignSystemForSelectedTemplate && (designSystemIdOverride ?? project.designSystemId)) {
      const effectiveDesignSystemId = designSystemIdOverride ?? project.designSystemId;
      const summary = designSystems.find((d) => d.id === effectiveDesignSystemId);
      designSystemTitle = summary?.title;
      const cached = effectiveDesignSystemId
        ? designCache.current.get(effectiveDesignSystemId)
        : undefined;
      if (cached !== undefined) {
        designSystemBody = cached;
      } else if (effectiveDesignSystemId) {
        const detail = await fetchDesignSystem(effectiveDesignSystemId);
        if (detail) {
          designSystemBody = detail.body;
          designCache.current.set(effectiveDesignSystemId, detail.body);
        }
      }
    }
    let template: ProjectTemplate | undefined;
    const tplId = project.metadata?.templateId;
    if (tplId) {
      const cached = templateCache.current.get(tplId);
      if (cached) {
        template = cached;
      } else {
        const fetched = await getTemplate(tplId);
        if (fetched) {
          templateCache.current.set(tplId, fetched);
          template = fetched;
        }
      }
    }
    // Fold in the auto-memory block so BYOK / API-mode chats see the
    // same Personal-memory section a daemon-side CLI chat would. Teamver
    // embed intentionally skips OD personal memory: workspace/project
    // registry state is the authority there, and global OD memories can
    // leak stale context from another Teamver project into a fresh run.
    let memoryBody: string | undefined;
    if (shouldInjectOdPersonalMemoryIntoPrompt()) {
      try {
        const resp = await fetch('/api/memory/system-prompt');
        if (resp.ok) {
          const json = (await resp.json()) as MemorySystemPromptResponse;
          if (typeof json.body === 'string' && json.body.trim().length > 0) {
            memoryBody = json.body;
          }
        }
      } catch {
        // Ignore; memory injection is best-effort.
      }
    }
    let audioVoiceOptions: AudioVoiceOption[] | undefined;
    let audioVoiceOptionsLookupError: string | undefined;
    if (shouldFetchElevenLabsVoiceOptions(project)) {
      try {
        audioVoiceOptions = await fetchElevenLabsVoiceOptions();
        setAudioVoiceOptionsError(null);
      } catch (err) {
        const message = err instanceof Error
          ? err.message
          : 'ElevenLabs voice list could not be loaded.';
        audioVoiceOptionsLookupError = message;
        setAudioVoiceOptionsError(message);
      }
    } else {
      setAudioVoiceOptionsError(null);
    }
    const composeMetadata: ProjectMetadata = {
      kind: project.metadata?.kind ?? (selectedTemplate || turnDeckTemplateMeta?.skipDiscoveryBrief === true
        ? 'deck'
        : 'prototype'),
      ...(project.metadata ?? {}),
      ...(turnDeckTemplateMeta?.skipDiscoveryBrief === true
        ? { kind: 'deck' as const, skipDiscoveryBrief: true }
        : {}),
      ...(selectedTemplate
        ? {
            selectedDeckTemplateId: selectedTemplate.id,
            ...(selectedTemplate.title || skillName
              ? {
                  selectedDeckTemplateTitle:
                    selectedTemplate.title
                    || skillName
                    || undefined,
                }
              : {}),
          }
        : {}),
    };
    return composeSystemPrompt({
      skillBody,
      skillName,
      skillMode,
      designSystemBody,
      designSystemTitle,
      memoryBody,
      metadata: composeMetadata,
      template,
      pluginBlock: pluginBlock ?? undefined,
      audioVoiceOptions,
      audioVoiceOptionsError: audioVoiceOptionsLookupError,
      streamFormat: config.mode === 'api' ? 'plain' : undefined,
      byokToolNames:
        config.mode === 'api'
          ? byokChatToolNamesForProtocol(config.apiProtocol)
          : undefined,
      mediaExecution: mediaExecutionPolicyForProjectMetadata(composeMetadata, {
        slideOnlyMvp,
      }),
      sessionMode: sessionModeOverride,
      locale,
      userInstructions: config.customInstructions,
      ...(slideEditContracts?.includeCommentEditPatchRule === true
        ? { includeCommentEditPatchRule: true }
        : {}),
      ...(slideEditContracts?.includeExistingDeckImageEditRule === true
        ? { includeExistingDeckImageEditRule: true }
        : {}),
    });
  }, [
    project.skillId,
    project.designSystemId,
    project.metadata,
    skills,
    designTemplates,
    designSystems,
    config.mode,
    config.apiProtocol,
    config.customInstructions,
    activeSessionMode,
    slideOnlyMvp,
    locale,
  ]);

  const persistMessage = useCallback(
    (m: ChatMessage, options?: SaveMessageOptions) => {
      if (!activeConversationId) return;
      // Source-level guard against the "Working 24m+ / Waiting for first
      // output" UI: never write a daemon assistant row that is still
      // queued/running but has no runId. Until POST /api/runs returns the
      // runId, the message is purely in-flight on the client; persisting it
      // here creates a row that nothing can ever reattach to (daemon never
      // saw the runId, client lost the response). Once onRunCreated assigns
      // a runId — or the run finishes terminally — this guard lets the row
      // through normally.
      if (isPhantomDaemonRunMessage(m)) return;
      void saveMessage(project.id, activeConversationId, m, options);
    },
    [project.id, activeConversationId],
  );

  const persistMessageById = useCallback(
    (messageId: string, options?: SaveMessageOptions) => {
      if (!activeConversationId) return;
      setMessages((curr) => {
        const found = curr.find((m) => m.id === messageId);
        if (found && !isPhantomDaemonRunMessage(found)) {
          void saveMessage(project.id, activeConversationId, found, options);
        }
        return curr;
      });
    },
    [project.id, activeConversationId],
  );

  const updateMessageById = useCallback(
    (
      messageId: string,
      updater: (message: ChatMessage) => ChatMessage,
      persist = false,
      persistOptions?: SaveMessageOptions,
    ) => {
      setMessages((curr) => {
        let saved: ChatMessage | null = null;
        const next = curr.map((m) => {
          if (m.id !== messageId) return m;
          const updated = updater(m);
          saved = updated;
          return updated;
        });
        // Same phantom guard as persistMessage: skip writes for a daemon
        // assistant row that is still in-flight (active runStatus, no runId).
        // The runId-arriving update from onRunCreated passes through because
        // the updater sets runId before this check runs.
        if (persist && saved && activeConversationId && !isPhantomDaemonRunMessage(saved)) {
          void saveMessage(project.id, activeConversationId, saved, persistOptions);
        }
        return next;
      });
    },
    [project.id, activeConversationId],
  );

  const appendConversationMessage = useCallback(
    (
      conversationId: string,
      message: ChatMessage,
      options?: SaveMessageOptions,
      persist = true,
    ) => {
      if (
        activeConversationId === conversationId
        || messagesConversationIdRef.current === conversationId
      ) {
        setMessages((curr) => dedupeConversationAssistantRows([...curr, message]));
      }
      if (persist) void saveMessage(project.id, conversationId, message, options);
    },
    [activeConversationId, project.id],
  );

  const replaceConversationMessage = useCallback(
    (
      conversationId: string,
      message: ChatMessage,
      options?: SaveMessageOptions,
      persist = true,
    ) => {
      if (
        activeConversationId === conversationId
        || messagesConversationIdRef.current === conversationId
      ) {
        setMessages((curr) => curr.map((item) => (item.id === message.id ? message : item)));
      }
      if (persist) void saveMessage(project.id, conversationId, message, options);
    },
    [activeConversationId, project.id],
  );

  const refreshConversationMessagesFromServer = useCallback(
    async (conversationId: string) => {
      if (messagesConversationIdRef.current !== conversationId) return;
      // Soft/hard sticky: C1 owns recovery — listMessages GETs only add 401 noise.
      if (isDesignAuthRefreshDeclined()) return;
      try {
        const serverMessages = await listMessages(project.id, conversationId);
        if (messagesConversationIdRef.current !== conversationId) return;
        setMessages((current) => mergeServerMessagesIntoConversation(current, serverMessages));
        setMessagesInitialized(true);
        setMessagesConversationId(conversationId);
        setFailedMessagesConversationId(null);
      } catch (err) {
        devLog.warn('Failed to refresh conversation messages after run completion', err);
      }
    },
    [project.id],
  );

  const scheduleConversationMessageRefresh = useCallback(
    (conversationId: string) => {
      window.setTimeout(() => {
        void refreshConversationMessagesFromServer(conversationId);
      }, 150);
    },
    [refreshConversationMessagesFromServer],
  );

  const autoOpenRecoveredHtmlOutput = useCallback(async (
    messagesSnapshot: readonly ChatMessage[],
    assistantMessageIds: ReadonlySet<string>,
    filesSnapshot: readonly ProjectFile[],
  ): Promise<boolean> => {
    for (const assistantMessageId of assistantMessageIds) {
      if (htmlAutoOpenClaimedRef.current.has(assistantMessageId)) continue;
      const message = messagesSnapshot.find((item) => item.id === assistantMessageId);
      if (!message || message.role !== 'assistant' || isInFlightAssistantMessage(message)) continue;
      const produced = message.producedFiles?.length
        ? message.producedFiles
        : computeProducedFiles(
            resolveTurnStartFileBaseline(message.preTurnFileNames, filesSnapshot),
            filesSnapshot,
          ) ?? [];
      let htmlToOpen = selectAutoOpenProducedHtml(produced, { projectFiles: filesSnapshot })
        ?? selectTouchedHtmlOutputFromEvents(message.events, filesSnapshot, {
          branding: { slideOnlyMvp },
        });
      if (slideOnlyMvp) {
        if (htmlToOpen) {
          htmlToOpen = await resolveSlideProducedHtmlToOpen(
            htmlToOpen,
            null,
            readProjectHtml,
          );
        }
        if (!htmlToOpen) {
          const deckPath = resolveCanonicalDeckEntryPath(filesSnapshot);
          if (deckPath) {
            htmlToOpen = await verifySlideProducedHtmlDeliverable(deckPath, readProjectHtml);
          }
        }
        if (!htmlToOpen) continue;
        await finalizeSlideOnlyDeckArtifacts([...filesSnapshot], htmlToOpen);
      } else if (!htmlToOpen) {
        continue;
      }
      htmlAutoOpenClaimedRef.current.add(assistantMessageId);
      maybeArmTeamverPublishMenuAfterRunSuccess(project.id, htmlToOpen);
      requestOpenFile(htmlToOpen);
      if (!message.producedFiles?.length && produced.length > 0) {
        updateMessageById(
          assistantMessageId,
          (prev) => ({ ...prev, producedFiles: produced }),
          true,
          { telemetryFinalized: true },
        );
      }
      return true;
    }
    return false;
  }, [
    project.id,
    readProjectHtml,
    requestOpenFile,
    slideOnlyMvp,
    updateMessageById,
    finalizeSlideOnlyDeckArtifacts,
  ]);

  const markStreamingConversation = useCallback((conversationId: string) => {
    streamingConversationIdRef.current = conversationId;
    setStreaming(true);
    setStreamingConversationId(conversationId);
  }, []);

  const clearStreamingMarker = useCallback((conversationId?: string | null) => {
    const next = clearStreamingConversationMarker(
      streamingConversationIdRef.current,
      conversationId,
    );
    if (next === streamingConversationIdRef.current) return;
    streamingConversationIdRef.current = next;
    setStreamingConversationId(next);
    setStreaming(next !== null);
  }, []);

  const clearActiveRunRefs = useCallback((
    conversationId: string,
    controller: AbortController,
    cancelController: AbortController,
  ) => {
    if (!shouldClearActiveRunRefs(streamingConversationIdRef.current, conversationId)) {
      return false;
    }
    if (abortRef.current !== controller || cancelRef.current !== cancelController) {
      return false;
    }
    abortRef.current = null;
    cancelRef.current = null;
    return true;
  }, []);

  const clearCurrentRunStreamingMarker = useCallback((
    conversationId: string,
    controller: AbortController,
    cancelController: AbortController,
  ) => {
    if (!clearActiveRunRefs(conversationId, controller, cancelController)) return false;
    clearStreamingMarker(conversationId);
    return true;
  }, [clearActiveRunRefs, clearStreamingMarker]);

  useEffect(() => {
    if (apiBackgroundRecoveryRef.current) return;
    if (
      !shouldClearPhantomStreamingMarker({
        streaming,
        streamingConversationId,
        activeConversationId,
        loading: currentConversationLoading,
        awaitingQuestionFormAnswer,
        hasActiveRun: currentConversationHasActiveRun,
        backgroundRecoveryActive: apiBackgroundRecoveryRef.current,
      })
    ) {
      return;
    }
    abortRef.current = null;
    cancelRef.current = null;
    apiBackgroundRecoveryRef.current = false;
    clearApiBackgroundRecoveryBanner();
    clearStreamingMarker(activeConversationId);
  }, [
    activeConversationId,
    awaitingQuestionFormAnswer,
    clearApiBackgroundRecoveryBanner,
    clearStreamingMarker,
    currentConversationHasActiveRun,
    currentConversationLoading,
    inFlightAssistantSignature,
    streaming,
    streamingConversationId,
  ]);

  const handleAssistantFeedback = useCallback(
    (assistantMessage: ChatMessage, change: ChatMessageFeedbackChange) => {
      const now = Date.now();
      updateMessageById(
        assistantMessage.id,
        (prev) =>
          change
            ? {
                ...prev,
                feedback: {
                  rating: change.rating,
                  reasonCodes: change.reasonCodes,
                  customReason: change.customReason,
                  reasonsSubmittedAt: change.reasonsSubmittedAt,
                  createdAt:
                    prev.feedback?.rating === change.rating
                      ? prev.feedback.createdAt
                      : now,
                  updatedAt: now,
                },
              }
            : {
                ...prev,
                feedback: undefined,
              },
        true,
      );
      // Forward affirmative ratings to the daemon → Langfuse `score-create`.
      // Clears (change=null) are skipped — Langfuse scores are append-only,
      // and the rating is also captured by the PostHog event so a clear is
      // recoverable downstream if we ever need it.
      const runId = assistantMessage.runId;
      if (change && runId && activeConversationId) {
        void reportChatRunFeedback({
          runId,
          projectId: project.id,
          conversationId: activeConversationId,
          assistantMessageId: assistantMessage.id,
          rating: change.rating,
          reasonCodes: change.reasonCodes ?? [],
          hasCustomReason: !!change.customReason,
          customReason: normalizeCustomReason(change.customReason),
        });
      }
    },
    [updateMessageById, activeConversationId, project.id],
  );

  const auditDesignSystemWorkspaceAfterRun = useCallback(
    async (assistantMessageId: string) => {
      if (!isDesignSystemWorkspaceMetadata(project.metadata)) return;
      try {
        const audit = await fetchProjectDesignSystemPackageAudit(project.id);
        if (!audit) return;
        const auditSummary = summarizeDesignSystemPackageAudit(audit);
        updateMessageById(
          assistantMessageId,
          (prev) => ({
            ...prev,
            events: [...(prev.events ?? []), { kind: 'status', label: 'audit', detail: auditSummary }],
          }),
          true,
          { telemetryFinalized: true },
        );
        const repairPrompt = buildDesignSystemPackageAuditRepairPrompt(audit);
        if (repairPrompt) {
          const seed = { id: `audit-${Date.now()}`, value: repairPrompt };
          setChatSeed(seed);
          if (consumeDesignSystemAuditAutoRepair(project.id)) {
            setAutoAuditRepairSeed(seed);
          }
        } else {
          clearDesignSystemAuditAutoRepair(project.id);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        updateMessageById(
          assistantMessageId,
          (prev) => ({
            ...prev,
            events: [
              ...(prev.events ?? []),
              { kind: 'status', label: 'audit', detail: `Package audit could not run: ${detail}` },
            ],
          }),
          true,
          { telemetryFinalized: true },
        );
      }
    },
    [project.id, project.metadata, updateMessageById],
  );

  // Preview-comment DELETE and status PATCH can race the periodic refresh:
  // if the fetch begins before DELETE lands on the daemon, the deleted row
  // returns in `next` and would resurrect in the side panel. Track locally
  // deleted ids for a short window and drop them from any refresh merge.
  const locallyDeletedPreviewCommentsRef = useRef<Map<string, number>>(new Map());
  const noteLocallyDeletedPreviewComment = useCallback((commentId: string) => {
    locallyDeletedPreviewCommentsRef.current.set(commentId, Date.now());
  }, []);
  const filterLocallyDeletedPreviewComments = useCallback(
    (comments: readonly PreviewComment[]): PreviewComment[] => {
      const tombstones = locallyDeletedPreviewCommentsRef.current;
      if (tombstones.size === 0) return comments as PreviewComment[];
      const now = Date.now();
      for (const [id, at] of tombstones) {
        if (now - at > 60_000) tombstones.delete(id);
      }
      if (tombstones.size === 0) return comments as PreviewComment[];
      return comments.filter((comment) => !tombstones.has(comment.id));
    },
    [],
  );

  const refreshPreviewComments = useCallback(async () => {
    if (!activeConversationId) return;
    const raw = await fetchPreviewComments(project.id, activeConversationId);
    const next = filterLocallyDeletedPreviewComments(raw);
    setPreviewComments(next);
    setAttachedComments((current) =>
      current
        .map((attached) => next.find((comment) => comment.id === attached.id))
        .filter((comment): comment is PreviewComment => Boolean(comment)),
    );
  }, [project.id, activeConversationId, filterLocallyDeletedPreviewComments]);

  const savePreviewComment = useCallback(
    async (target: PreviewCommentTarget, note: string, attachAfterSave: boolean, images: File[] = []) => {
      if (!activeConversationId) return null;
      // Upload any attached images first so the saved comment carries durable
      // file paths — this is what lets the comment list / re-opened popover
      // re-display the images instead of losing them on echo.
      let uploadedAttachments: PreviewCommentAttachment[] | undefined;
      if (images.length > 0) {
        const result = await uploadProjectFiles(project.id, images);
        throwIfProjectCommentUploadIncomplete(result, images.length);
        const ready = await uploadedImagesReadableOnDisk(project.id, result.uploaded);
        const staged = stageReadableUploadedAttachments(result.uploaded, ready);
        uploadedAttachments = staged.staged.map((file) => ({ path: file.path, name: file.name }));
        await refreshProjectFiles().catch(() => undefined);
      }
      // Existing lookup MUST match slideIndex too: the daemon uniqueness key is
      // (conversation, filePath, elementId, slideIndex), so two comments with
      // the same elementId on different deck slides are distinct rows. Merging
      // attachments across slides used to cross-pollinate uploads.
      const targetSlideIndex = typeof target.slideIndex === 'number' && Number.isFinite(target.slideIndex)
        ? Math.floor(target.slideIndex)
        : undefined;
      const existing = previewComments.find(
        (comment) =>
          comment.filePath === target.filePath
          && comment.elementId === target.elementId
          && (targetSlideIndex === undefined || comment.slideIndex === targetSlideIndex),
      );
      const attachments = mergePreviewCommentAttachments(existing?.attachments, uploadedAttachments);
      const saved = await upsertPreviewComment(project.id, activeConversationId, {
        target,
        note,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      if (!saved) return null;
      setPreviewComments((current) => mergeSavedPreviewComment(current, saved));
      setAttachedComments((current) =>
        attachAfterSave ? mergeAttachedComments(current, saved) : current.map((comment) => comment.id === saved.id ? saved : comment),
      );
      return saved;
    },
    [project.id, activeConversationId, previewComments, refreshProjectFiles],
  );

  const removePreviewComment = useCallback(
    async (commentId: string) => {
      if (!activeConversationId) return;
      const removedComment = previewComments.find((comment) => comment.id === commentId);
      const removedAttachedIndex = attachedComments.findIndex(
        (comment) => comment.id === commentId,
      );
      const removedAttached = removedAttachedIndex >= 0
        ? attachedComments[removedAttachedIndex]
        : null;
      // Optimistic drop first, tombstone against refresh races, then daemon DELETE.
      noteLocallyDeletedPreviewComment(commentId);
      setPreviewComments((current) => current.filter((comment) => comment.id !== commentId));
      setAttachedComments((current) => removeAttachedComment(current, commentId));
      const ok = await deletePreviewComment(project.id, activeConversationId, commentId);
      if (!ok) {
        // Rollback: daemon still has the row. Restore local UI to match, and
        // clear the tombstone so future refreshes will re-render it too.
        locallyDeletedPreviewCommentsRef.current.delete(commentId);
        if (removedComment) {
          setPreviewComments((current) =>
            current.some((comment) => comment.id === commentId)
              ? current
              : [...current, removedComment],
          );
        }
        if (removedAttached) {
          setAttachedComments((current) =>
            current.some((comment) => comment.id === commentId)
              ? current
              : mergeAttachedComments(current, removedAttached),
          );
        }
        setError(embedUiLabel(
          'Failed to delete the memo. Please try again.',
          '메모를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        ));
      }
    },
    [
      project.id,
      activeConversationId,
      noteLocallyDeletedPreviewComment,
      previewComments,
      attachedComments,
    ],
  );

  const attachPreviewComment = useCallback((comment: PreviewComment) => {
    setAttachedComments((current) => mergeAttachedComments(current, comment));
  }, []);

  const detachPreviewComment = useCallback((commentId: string) => {
    setAttachedComments((current) => removeAttachedComment(current, commentId));
  }, []);

  const patchAttachedStatuses = useCallback(
    async (attachments: ChatCommentAttachment[], status: PreviewComment['status']) => {
      if (!activeConversationId || attachments.length === 0) return;
      const persistedAttachments = attachments.filter(
        (attachment) => attachment.source !== 'board-batch',
      );
      if (persistedAttachments.length === 0) return;
      setPreviewComments((current) =>
        current.map((comment) =>
          persistedAttachments.some((attachment) => attachment.id === comment.id)
            ? { ...comment, status }
            : comment,
        ),
      );
      await Promise.all(
        persistedAttachments.map((attachment) =>
          patchPreviewCommentStatus(project.id, activeConversationId, attachment.id, status),
        ),
      );
      void refreshPreviewComments();
    },
    [project.id, activeConversationId, refreshPreviewComments],
  );

  useEffect(() => {
    clearRunRecoveryBannerState();
  }, [activeConversationId, clearRunRecoveryBannerState]);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    const wasHiddenRef = { current: false };
    const bumpReattach = () => {
      if (document.visibilityState !== 'visible' || !wasHiddenRef.current) return;
      // Soft/hard sticky: C1 owns recovery — visibility must not restart
      // reattach/BYOK effects that would burst after sticky clears.
      if (isDesignAuthRefreshDeclined()) return;
      setReattachNonce((value) => value + 1);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true;
        return;
      }
      bumpReattach();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', bumpReattach);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', bumpReattach);
    };
  }, []);

  useEffect(() => {
    if (!isTeamverEmbedMode() || config.mode !== 'daemon' || !daemonLive || !activeConversationId) return;
    const staleMessages = findInFlightAssistantMessages(messages).filter((message) =>
      shouldPollStaleDaemonRun(message),
    );
    if (staleMessages.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      // Soft/hard sticky: C1 owns recovery. Stale-run status GETs only add
      // nginx 401 noise while declined.
      if (isDesignAuthRefreshDeclined()) return;
      const targets = findInFlightAssistantMessages(messages).filter((message) =>
        shouldPollStaleDaemonRun(message),
      );
      for (const message of targets) {
        const runId = message.runId?.trim();
        if (!runId) continue;
        const status = await fetchChatRunStatus(runId);
        if (cancelled) return;
        if (status) {
          const patch = terminalAssistantPatchFromRunStatus(status);
          if (patch) {
            updateMessageById(
              message.id,
              (prev) => applyTerminalRunStatusToAssistant(prev, status),
              true,
            );
            clearStreamingMarker(activeConversationId);
            scheduleConversationMessageRefresh(activeConversationId);
            continue;
          }
        }
        if (shouldForceFailStaleDaemonRun(message)) {
          updateMessageById(
            message.id,
            (prev) =>
              attachPersistedChatError(
                {
                  ...prev,
                  endedAt: prev.endedAt ?? Date.now(),
                },
                formatProjectRunErrorForUser(
                  Object.assign(new Error('AGENT_EXECUTION_FAILED'), {
                    code: 'AGENT_EXECUTION_FAILED',
                  }),
                ),
                'AGENT_EXECUTION_FAILED',
              ),
            true,
          );
          clearStreamingMarker(activeConversationId);
          scheduleConversationMessageRefresh(activeConversationId);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, TEAMVER_STALE_RUN_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeConversationId,
    clearStreamingMarker,
    config.mode,
    daemonLive,
    messages,
    scheduleConversationMessageRefresh,
    updateMessageById,
  ]);

  useEffect(() => {
    if (config.mode !== 'api' || !activeConversationId || streaming) return;
    if (isDesignAuthRefreshDeclined()) return;

    let cancelled = false;
    const poll = () => {
      if (cancelled) return;
      const targets = findInFlightAssistantMessages(messages).filter((message) =>
        shouldPollStaleApiRun(message),
      );
      for (const message of targets) {
        if (!shouldForceFailStaleApiRun(message)) continue;
        updateMessageById(
          message.id,
          (prev) => patchStaleApiAssistantFailure(prev, formatProjectRunStalledErrorForUser()),
          true,
        );
        clearStreamingMarker(activeConversationId);
        scheduleConversationMessageRefresh(activeConversationId);
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, TEAMVER_STALE_API_RUN_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeConversationId,
    clearStreamingMarker,
    config.mode,
    messages,
    scheduleConversationMessageRefresh,
    streaming,
    updateMessageById,
  ]);

  useEffect(() => {
    if (config.mode !== 'daemon' || !daemonLive || !activeConversationId || streaming) return;
    // Soft/hard sticky: C1 owns recovery — reattach daemon GETs only add 401 noise.
    if (isDesignAuthRefreshDeclined()) return;
    let cancelled = false;
    const reattachConversationId = activeConversationId;

    const scheduleReattachRetry = (messageId: string, runId: string | null) => {
      const key = `${reattachConversationId}:${messageId}:${runId ?? 'missing-run'}`;
      if (missingRunLookupRetryTimersRef.current.has(key)) return;
      const retryTimer = window.setTimeout(() => {
        missingRunLookupRetryTimersRef.current.delete(key);
        if (cancelled || isDesignAuthRefreshDeclined()) return;
        setReattachNonce((value) => value + 1);
      }, DAEMON_REATTACH_MISSING_RUN_RETRY_MS);
      missingRunLookupRetryTimersRef.current.set(key, retryTimer);
    };

    const attachRecoverableRuns = async () => {
      if (isDesignAuthRefreshDeclined()) return;
      let activeRuns: Awaited<ReturnType<typeof listActiveChatRuns>> = [];
      try {
        activeRuns = await listActiveChatRuns(project.id, reattachConversationId);
      } catch (err) {
        devLog.debug('[project] active daemon runs reattach probe skipped', err);
      }
      let messagesSnapshot = messages;
      if ((activeRuns?.length ?? 0) > 0) {
        try {
          const serverMessages = await listMessages(project.id, reattachConversationId);
          if (cancelled) return;
          messagesSnapshot = mergeMissingActiveRunAssistantMessages(
            mergeServerMessagesIntoConversation(messages, serverMessages),
            activeRuns,
          );
          setMessages(messagesSnapshot);
        } catch {
          // Best-effort — reattach still uses in-memory rows.
          messagesSnapshot = mergeMissingActiveRunAssistantMessages(messagesSnapshot, activeRuns);
          setMessages(messagesSnapshot);
        }
      }

      const recoverableById = new Map<string, ChatMessage>();
      for (const message of messagesSnapshot) {
        if (isRecoverableDaemonRunMessage(message)) {
          recoverableById.set(message.id, message);
        }
      }
      // Active daemon runs may still list a turn the user already Stop'd
      // (cancel grace keeps status=`running` + cancelRequested). Never force
      // those terminal/stopped rows back into the reattach set.
      for (const run of activeRuns ?? []) {
        const assistantMessageId = run.assistantMessageId?.trim();
        if (!assistantMessageId) continue;
        if (isDaemonRunCancelPending(run)) continue;
        if (
          wasUserStoppedAssistantTurn({
            runId: run.id,
            assistantMessageId,
          })
        ) {
          continue;
        }
        const message = messagesSnapshot.find((item) => item.id === assistantMessageId);
        if (!message || message.role !== 'assistant') continue;
        if (isLocallyTerminalAssistantMessage(message)) continue;
        recoverableById.set(message.id, message);
      }
      const recoverableMessages = [...recoverableById.values()];
      if (recoverableMessages.length === 0) {
        // Still reconcile cancel-pending active runs so UI stays canceled/idle.
        for (const run of activeRuns ?? []) {
          if (!isDaemonRunCancelPending(run) && !wasUserStoppedAssistantTurn({
            runId: run.id,
            assistantMessageId: run.assistantMessageId,
          })) {
            continue;
          }
          const assistantMessageId = run.assistantMessageId?.trim();
          if (!assistantMessageId || !run.id) continue;
          rememberUserStoppedAssistantTurn({
            runId: run.id,
            assistantMessageId,
          });
          void requestDaemonRunCancel(run.id);
          updateMessageById(
            assistantMessageId,
            (prev) => {
              if (isLocallyTerminalAssistantMessage(prev) && prev.runStatus === 'canceled') {
                return prev;
              }
              return {
                ...prev,
                runStatus: 'canceled',
                endedAt: prev.endedAt ?? Date.now(),
              };
            },
            true,
          );
          completedReattachRunsRef.current.add(run.id);
        }
        return;
      }

      const latestInFlightAssistant = findInFlightAssistantMessages(messagesSnapshot)[0] ?? null;

      const missingRunIdMessages = recoverableMessages.filter((m) => !m.runId);
      const historicalRuns = missingRunIdMessages.length > 0
        ? (await listProjectRuns().catch((err) => {
            devLog.debug('[project] daemon run history reattach probe skipped', err);
            return [];
          })).filter(
            (run) => run.projectId === project.id && run.conversationId === reattachConversationId,
          )
        : [];
      if (cancelled) return;
      const activeByMessage = new Map(
        (activeRuns ?? [])
          .filter((run) => run.assistantMessageId)
          .map((run) => [run.assistantMessageId!, run]),
      );
      const historicalByMessage = new Map(
        historicalRuns
          .filter((run) => run.assistantMessageId)
          .map((run) => [run.assistantMessageId!, run]),
      );

      for (const message of recoverableMessages) {
        if (cancelled) return;
        const activeRun = activeByMessage.get(message.id) ?? null;
        const fallbackRun = !message.runId
          ? activeByMessage.get(message.id) ?? historicalByMessage.get(message.id) ?? null
          : null;
        const runId = activeRun?.id ?? message.runId ?? fallbackRun?.id;
        // Self-heal phantom 'running' rows: when the message has no runId
        // and the daemon has no active run mapped to it, the original send
        // POST was lost (daemon restart mid-flight, the user navigated
        // away before /api/runs returned, or a network blip). Leaving the
        // message as 'running' is what produces the "Waiting for first
        // output — Working 24m+" UI the user reported. Mark it failed so
        // the composer is interactive again and the user can re-send.
        if (!runId) {
          if (shouldRetryMissingDaemonRunLookup(message)) {
            if (isTeamverEmbedMode() && message.id === latestInFlightAssistant?.id) {
              runRecoveryBannerTrackRef.current = {
                conversationId: reattachConversationId,
                assistantMessageId: message.id,
              };
              setRunRecoveryBanner({
                conversationId: reattachConversationId,
                phase: 'connecting',
                savedChars: (message.content ?? '').trim().length,
                runStatus: 'running',
              });
              dispatchTeamverBackgroundChat({
                projectId: project.id,
                conversationId: reattachConversationId,
                assistantMessageId: message.id,
                active: true,
              });
            }
            scheduleReattachRetry(message.id, null);
            continue;
          }
          // Phantom running row with no runId — must persist a durable
          // status:error so hard reload can rebuild the Retry panel.
          updateMessageById(
            message.id,
            (prev) =>
              attachPersistedChatError(
                {
                  ...prev,
                  endedAt: prev.endedAt ?? Date.now(),
                },
                formatProjectRunErrorForUser(
                  Object.assign(new Error('AGENT_EXECUTION_FAILED'), {
                    code: 'AGENT_EXECUTION_FAILED',
                  }),
                ),
                'AGENT_EXECUTION_FAILED',
              ),
            true,
          );
          continue;
        }
        const ownsActiveConsumer =
          reattachControllersRef.current.has(runId)
          || primaryOwnedDaemonRunIdRef.current === runId;
        if (locallyConsumedDaemonRunIds.has(runId) && ownsActiveConsumer) continue;
        if (locallyConsumedDaemonRunIds.has(runId) && !ownsActiveConsumer) {
          releaseLocallyConsumedDaemonRun(runId);
        }
        if (reattachControllersRef.current.has(runId)) continue;
        if (completedReattachRunsRef.current.has(runId)) continue;

        if ((activeRun || fallbackRun) && !message.runId) {
          updateMessageById(
            message.id,
            (prev) => ({ ...prev, runId, runStatus: (activeRun ?? fallbackRun)!.status }),
            true,
          );
        }

        const status = activeRun ?? fallbackRun ?? await fetchChatRunStatus(runId);
        if (cancelled) return;
        if (!status) {
          if (shouldRetryRecentDaemonRunLookup(message)) {
            if (isTeamverEmbedMode() && message.id === latestInFlightAssistant?.id) {
              runRecoveryBannerTrackRef.current = {
                conversationId: reattachConversationId,
                assistantMessageId: message.id,
              };
              setRunRecoveryBanner({
                conversationId: reattachConversationId,
                phase: 'connecting',
                savedChars: (message.content ?? '').trim().length,
                runStatus: 'running',
              });
              dispatchTeamverBackgroundChat({
                projectId: project.id,
                conversationId: reattachConversationId,
                assistantMessageId: message.id,
                active: true,
              });
            }
            scheduleReattachRetry(message.id, runId);
            continue;
          }
          // Run id existed locally but daemon has no status — persist a
          // durable error so hard reload still rebuilds Retry UI.
          updateMessageById(
            message.id,
            (prev) =>
              attachPersistedChatError(
                {
                  ...prev,
                  endedAt: prev.endedAt ?? Date.now(),
                },
                formatProjectRunErrorForUser(
                  Object.assign(new Error('AGENT_EXECUTION_FAILED'), {
                    code: 'AGENT_EXECUTION_FAILED',
                  }),
                ),
                'AGENT_EXECUTION_FAILED',
              ),
            true,
          );
          completedReattachRunsRef.current.add(runId);
          continue;
        }

        const userStopped = wasUserStoppedAssistantTurn({
          runId,
          assistantMessageId: message.id,
        });
        const cancelPending = isDaemonRunCancelPending(status) || userStopped;
        if (cancelPending) {
          rememberUserStoppedAssistantTurn({
            runId,
            assistantMessageId: message.id,
          });
          void requestDaemonRunCancel(runId);
          updateMessageById(
            message.id,
            (prev) => ({
              ...prev,
              runStatus: 'canceled',
              endedAt: prev.endedAt ?? Date.now(),
              ...(status.resumable !== undefined ? { resumable: status.resumable } : {}),
            }),
            true,
          );
          completedReattachRunsRef.current.add(runId);
          scheduleConversationMessageRefresh(reattachConversationId);
          continue;
        }

        const shouldReplayTerminalSucceededDeliverable =
          slideOnlyMvp
          && status.status === 'succeeded'
          && !(message.producedFiles ?? []).some(isHtmlProjectFile);

        if (!shouldReattachDaemonRunEvents(message, status) && !shouldReplayTerminalSucceededDeliverable) {
          if (isTerminalRunStatus(status.status) || isLocallyTerminalAssistantMessage(message)) {
            updateMessageById(
              message.id,
              (prev) => {
                if (isLocallyTerminalAssistantMessage(prev) && !isActiveRunStatus(status.status)) {
                  return {
                    ...prev,
                    ...(status.resumable !== undefined ? { resumable: status.resumable } : {}),
                  };
                }
                if (isTerminalRunStatus(status.status)) {
                  return {
                    ...prev,
                    runStatus: status.status,
                    endedAt: prev.endedAt ?? Date.now(),
                    ...(status.resumable !== undefined ? { resumable: status.resumable } : {}),
                  };
                }
                return prev;
              },
              true,
            );
            completedReattachRunsRef.current.add(runId);
            scheduleConversationMessageRefresh(reattachConversationId);
          }
          continue;
        }

        updateMessageById(
          message.id,
          (prev) => {
            // Never revive a locally terminal/canceled row from a still-active
            // daemon status (Stop → leave → re-entry race).
            if (isLocallyTerminalAssistantMessage(prev)) return prev;
            return {
              ...prev,
              runStatus: status.status,
              ...(status.resumable !== undefined ? { resumable: status.resumable } : {}),
            };
          },
          true,
        );

        if (
          !shouldReplayTerminalSucceededDeliverable
          && !isActiveRunStatus(status.status)
          && isTerminalRunStatus(status.status)
        ) {
          completedReattachRunsRef.current.add(runId);
          scheduleConversationMessageRefresh(reattachConversationId);
          continue;
        }

        const needsFullReplay =
          shouldReplayTerminalSucceededDeliverable
          || (isActiveRunStatus(status.status) && shouldFullReplayReattachedRun(message));
        const savedChars = (message.content ?? '').trim().length;
        if (
          isTeamverEmbedMode()
          && isActiveRunStatus(status.status)
          && message.id === latestInFlightAssistant?.id
        ) {
          runRecoveryBannerTrackRef.current = {
            conversationId: reattachConversationId,
            assistantMessageId: message.id,
          };
          setRunRecoveryBanner({
            conversationId: reattachConversationId,
            phase: resolveRunRecoveryBannerPhase(
              status.status === 'queued' ? 'queued' : 'running',
              savedChars,
            ),
            savedChars,
            runStatus: status.status === 'queued' ? 'queued' : 'running',
          });
          dispatchTeamverBackgroundChat({
            projectId: project.id,
            conversationId: reattachConversationId,
            assistantMessageId: message.id,
            active: true,
          });
        }
        const controller = new AbortController();
        const cancelController = new AbortController();
        reattachControllersRef.current.set(runId, controller);
        reattachCancelControllersRef.current.set(runId, cancelController);
        if (!isTerminalRunStatus(status.status)) {
          abortRef.current = controller;
          cancelRef.current = cancelController;
          markStreamingConversation(reattachConversationId);
        }
        if (needsFullReplay) {
          // Clear stream buffers for replay, but keep producedFiles — wiping
          // them makes the assistant row vanish in Teamver embed until SSE
          // refills, and a failed replay leaves the bubble permanently empty.
          updateMessageById(
            message.id,
            (prev) => ({ ...prev, content: '', events: [] }),
          );
        }

        const persistScheduler = createMessagePersistScheduler(
          (options) => {
            persistMessageById(message.id, options);
          },
          resolveMessagePersistThrottleMs(),
        );
        const persistSoon = () => {
          persistScheduler.persistSoon();
        };
        const persistNow = (options?: SaveMessageOptions) => {
          textBuffer.flush();
          persistScheduler.persistNow(options);
        };
        let parser = createArtifactParser();
        let parsedArtifact: Artifact | null = null;
        let liveHtml = '';
        const seededContent = needsFullReplay ? '' : (message.content ?? '');
        let replayedContent = seededContent;
        // Content checkpoint without lastRunEventId → SSE starts at event 0.
        // Catch up silently until the stream meets the seed, then append only
        // the remainder so chat/preview are not duplicated.
        const catchUpFromSeed =
          !needsFullReplay && shouldCatchUpReattachTextFromSeed(message);
        let sseCatchUpBuffer = '';
        let catchUpComplete = !catchUpFromSeed;
        const applyContentDelta = (delta: string) => {
          for (const ev of parser.feed(delta)) {
            if (ev.type === 'artifact:start') {
              liveHtml = '';
              parsedArtifact = {
                identifier: ev.identifier,
                artifactType: normalizeSlideOnlyArtifactContractType(ev.artifactType, slideOnlyMvp),
                title: ev.title,
                html: '',
              };
              setArtifact(parsedArtifact);
            } else if (ev.type === 'artifact:chunk') {
              liveHtml += ev.delta;
              parsedArtifact = parsedArtifact
                ? { ...parsedArtifact, html: liveHtml }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: liveHtml,
                  };
              setArtifact((prev) =>
                prev
                  ? { ...prev, html: liveHtml }
                  : {
                      identifier: ev.identifier,
                      title: '',
                      html: liveHtml,
                    },
              );
            } else if (ev.type === 'artifact:end') {
              parsedArtifact = parsedArtifact
                ? { ...parsedArtifact, html: ev.fullContent }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: ev.fullContent,
                  };
              setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
            }
          }
        };
        const rewriteLiveContent = (fullContent: string) => {
          // Sanitize shrank previously emitted bytes — reset the artifact
          // parser and replay the full cleaned snapshot so CDN/host debris
          // cannot stick in liveHtml.
          parser = createArtifactParser();
          liveHtml = '';
          parsedArtifact = null;
          applyContentDelta(fullContent);
        };
        if (!needsFullReplay && message.content) {
          applyContentDelta(message.content);
        }
        const textBuffer = createBufferedTextUpdates({
          updateMessage: (updater) => updateMessageById(message.id, updater),
          persistSoon,
          flushAndPersistNow: () => persistNow({ keepalive: true }),
          onContentDelta: applyContentDelta,
          onContentRewrite: rewriteLiveContent,
          stripCodeFences: hideAssistantThinkingDetails && !slideOnlyMvp,
        });
        reattachTextBuffersRef.current.add(textBuffer);
        const unregisterTextBuffer = () => {
          reattachTextBuffersRef.current.delete(textBuffer);
        };

        void reattachDaemonRun({
          runId,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          initialLastEventId: needsFullReplay ? null : message.lastRunEventId ?? null,
          handlers: {
            onDelta: (delta) => {
              if (!catchUpComplete) {
                sseCatchUpBuffer += delta;
                const catchUp = reattachReplayRemainderAfterSeed(seededContent, sseCatchUpBuffer);
                if (catchUp.status === 'waiting') {
                  return;
                }
                catchUpComplete = true;
                if (catchUp.status === 'rewrite') {
                  // Seed (often sanitized) diverged from raw SSE — replace
                  // instead of appending the full replay (would duplicate).
                  replayedContent = catchUp.content;
                  updateMessageById(
                    message.id,
                    (prev) => ({ ...prev, content: catchUp.content }),
                  );
                  rewriteLiveContent(catchUp.content);
                  if (isTeamverEmbedMode()) {
                    const nextChars = replayedContent.trim().length;
                    setRunRecoveryBanner((prev) => {
                      if (!prev || prev.conversationId !== reattachConversationId) return prev;
                      return {
                        ...prev,
                        phase: 'live',
                        runStatus: 'running',
                        savedChars: Math.max(prev.savedChars, nextChars),
                      };
                    });
                  }
                  return;
                }
                const remainder = catchUp.remainder;
                if (!remainder) return;
                replayedContent += remainder;
                if (isTeamverEmbedMode()) {
                  const nextChars = replayedContent.trim().length;
                  setRunRecoveryBanner((prev) => {
                    if (!prev || prev.conversationId !== reattachConversationId) return prev;
                    return {
                      ...prev,
                      phase: 'live',
                      runStatus: 'running',
                      savedChars: Math.max(prev.savedChars, nextChars),
                    };
                  });
                }
                textBuffer.appendContent(remainder);
                return;
              }
              replayedContent += delta;
              if (isTeamverEmbedMode()) {
                const nextChars = replayedContent.trim().length;
                setRunRecoveryBanner((prev) => {
                  if (!prev || prev.conversationId !== reattachConversationId) return prev;
                  return {
                    ...prev,
                    phase: 'live',
                    runStatus: 'running',
                    savedChars: Math.max(prev.savedChars, nextChars),
                  };
                });
              }
              textBuffer.appendContent(delta);
            },
            onAgentEvent: (ev) => {
              textBuffer.appendEvent(ev);
            },
            onDone: () => {
              // A reattached run interrupted by a "send now" still receives a
              // late onDone from the daemon. Decide ownership first, then bail
              // BEFORE any current-run side effect (committing buffered text,
              // repainting the artifact preview via setArtifact, re-finalizing
              // the message) — only release this run's bookkeeping. See the
              // streamViaDaemon onDone for the ownership rationale.
              const runMayFinalize =
                !supersededRunsRef.current.has(controller);
              if (runMayFinalize) textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
              if (!runMayFinalize) return;
              finalizeRunRecoveryBannerForMessage(reattachConversationId, message.id);
              for (const ev of parser.flush()) {
                if (ev.type === 'artifact:end') {
                  parsedArtifact = parsedArtifact
                    ? { ...parsedArtifact, html: ev.fullContent }
                    : {
                        identifier: ev.identifier,
                        title: '',
                        html: ev.fullContent,
                      };
                  setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
                }
              }
              updateMessageById(
                message.id,
                (prev) => ({
                  ...prev,
                  // Keep buffer-sanitized content/events — never overwrite with
                  // raw replay bytes (would re-expose thinking/tool XML).
                  content: prev.content,
                  events: prev.events,
                  runStatus: resolveSucceededRunStatus(prev.runStatus),
                  endedAt: prev.endedAt ?? Date.now(),
                }),
                true,
                { telemetryFinalized: true },
              );
              void (async () => {
                const preTurn = message.preTurnFileNames;
                let nextFiles = await refreshProjectFiles();
                // Use the turn-start snapshot when available so reload
                // recovers files produced before the artifact write too;
                // fall back to the current list for legacy messages.
                const beforeFileNames = resolveTurnStartFileBaseline(preTurn, nextFiles);
                let recoveredExistingArtifact: ProjectFile | null = null;
                let replayPersistResult: ArtifactPersistResult | null = null;
                const artifactToPersist = parsedArtifact?.html
                  ? parsedArtifact
                  : artifactFromStandaloneHtml(replayedContent);
                // Stream onDone may have already opened the HTML for this same
                // assistant row. Claim once so reattach + late stream events
                // can't fire two `requestOpenFile` for the same row.
                const claimHtmlAutoOpenForMessage = (): boolean => {
                  if (htmlAutoOpenClaimedRef.current.has(message.id)) return false;
                  htmlAutoOpenClaimedRef.current.add(message.id);
                  return true;
                };
                if (artifactToPersist?.html) {
                  if (isQuestionFormTurnContent(replayedContent)) {
                    await auditDesignSystemWorkspaceAfterRun(message.id);
                    return;
                  }
                  const producedBeforeFallback = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
                  const runStartedAt = status.createdAt || message.startedAt || message.createdAt;
                  const reattachScopedComments = (message.commentAttachments?.length ?? 0) > 0;
                  recoveredExistingArtifact = findExistingArtifactProjectFile(
                    artifactToPersist,
                    nextFiles,
                    { minMtime: runStartedAt },
                  ) ?? (reattachScopedComments
                    ? null
                    : await findSameTurnHtmlWriteForRecoveredArtifact({
                      artifactHtml: artifactToPersist.html,
                      producedFiles: producedBeforeFallback,
                      readProjectHtml,
                      allowAnyHtmlWrite: message.agentId === 'claude',
                    }));
                  if (recoveredExistingArtifact) {
                    savedArtifactRef.current = recoveredExistingArtifact.name;
                    try {
                      const diskHtml = await readProjectHtml(recoveredExistingArtifact.name);
                      if (diskHtml) {
                        const attachmentPaths = runAttachmentsRef.current
                          .map((attachment) => attachment.path.trim())
                          .filter(Boolean);
                        const projectPaths = [
                          ...nextFiles.map((file) => String(file.path || file.name || '').trim()),
                          ...attachmentPaths,
                        ].filter(Boolean);
                        const { html: healed, changed } = await healDiskHtmlAttachmentImageSrcs({
                          html: diskHtml,
                          projectFilePaths: projectPaths,
                          preferredAttachmentPaths: attachmentPaths,
                        });
                        if (changed) {
                          await writeProjectTextFileDetailed(
                            project.id,
                            recoveredExistingArtifact.name,
                            healed,
                          );
                          nextFiles = await refreshProjectFiles();
                        }
                      }
                    } catch {
                      // Soft-fail — preview heal may still cover this turn.
                    }
                    if (claimHtmlAutoOpenForMessage()) {
                      maybeArmTeamverPublishMenuAfterRunSuccess(
                        project.id,
                        recoveredExistingArtifact.name,
                      );
                      requestOpenFile(recoveredExistingArtifact.name);
                    }
                  } else {
                    replayPersistResult = await persistArtifact(
                      artifactToPersist,
                      nextFiles,
                      replayedContent,
                      runStartedAt,
                    );
                    if (
                      shouldFailRunForArtifactPersistResult(replayPersistResult, {
                        scopedCommentEdit: runCommentAttachmentsRef.current.length > 0,
                      })
                    ) {
                      const endedAt = Date.now();
                      const detail = encodePersistedRunErrorDetail(
                        formatProjectRunDeliverableMissingError(),
                        {
                          kind: replayPersistResult?.kind ?? null,
                          reason:
                            replayPersistResult && 'reason' in replayPersistResult
                              ? replayPersistResult.reason ?? null
                              : null,
                        },
                      );
                      updateMessageById(
                        message.id,
                        (prev) => ({
                          ...attachPersistedChatError(prev, detail, 'incomplete_output'),
                          endedAt: prev.endedAt ?? endedAt,
                          resumable: true,
                        }),
                        true,
                        { telemetryFinalized: true },
                      );
                      return;
                    }
                    nextFiles = await refreshProjectFiles();
                  }
                }
                const diff = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
                let produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
                let producedHtmlToOpen = selectAutoOpenProducedHtml(produced, { projectFiles: nextFiles })
                  ?? selectTouchedHtmlOutputFromEvents(message.events, nextFiles, {
                    branding: { slideOnlyMvp },
                  });
                if (slideOnlyMvp) {
                  producedHtmlToOpen = await resolveSlideProducedHtmlToOpen(
                    producedHtmlToOpen,
                    replayPersistResult,
                    readProjectHtml,
                  );
                  nextFiles = await finalizeSlideOnlyDeckArtifacts(
                    nextFiles,
                    producedHtmlToOpen,
                  );
                }
                produced = mergeRecoveredArtifact(
                  produced,
                  projectFileFromPersistedHtmlFallback(
                    producedHtmlToOpen,
                    replayPersistResult,
                    Date.now(),
                  ),
                );
                if (producedHtmlToOpen && claimHtmlAutoOpenForMessage()) {
                  maybeArmTeamverPublishMenuAfterRunSuccess(project.id, producedHtmlToOpen);
                  requestOpenFile(producedHtmlToOpen);
                }
                if (produced.length > 0) {
                  updateMessageById(
                    message.id,
                    (prev) => ({ ...prev, producedFiles: produced }),
                    true,
                    { telemetryFinalized: true },
                  );
                }
                await auditDesignSystemWorkspaceAfterRun(message.id);
              })();
              onProjectsRefresh();
            },
            onError: (err) => {
              const errorCode = extractProjectRunErrorCode(err);
              const resumable = (err as Error & { resumable?: boolean }).resumable === true;
              // A superseded reattached run must not paint a global failure
              // banner or re-finalize its message over the replacement run.
              const runMayFinalize =
                !supersededRunsRef.current.has(controller);
              textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              if (runMayFinalize) {
                const detail = formatProjectRunErrorForUser(err);
                setError(detail);
                // Single persist: durable status:error + failed (+ resumable).
                // Do not call persistNow afterward — that can race a second
                // PUT from a pre-error snapshot before messagesRef syncs.
                updateMessageById(
                  message.id,
                  (prev) => ({
                    ...attachPersistedChatError(prev, detail, errorCode),
                    resumable,
                  }),
                  true,
                  { telemetryFinalized: true },
                );
              }
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
              finalizeRunRecoveryBannerForMessage(reattachConversationId, message.id);
            },
          },
          onRunStatus: (runStatus) => {
            textBuffer.flush();
            updateMessageById(
              message.id,
              (prev) => ({
                ...prev,
                runStatus,
                endedAt: isTerminalRunStatus(runStatus) ? prev.endedAt ?? Date.now() : prev.endedAt,
              }),
              false,
            );
            if (runStatus === 'canceled') {
              textBuffer.flush();
              textBuffer.finalizeForHistoryDisplay?.();
              textBuffer.cancel();
              unregisterTextBuffer();
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
            }
            if (isTerminalRunStatus(runStatus)) {
              if (runStatus === 'failed') {
                // Let onError attach status:error before the terminal persist.
                persistSoon();
              } else {
                persistNow(
                  runStatus === 'canceled' ? { telemetryFinalized: true } : undefined,
                );
              }
            } else {
              persistSoon();
            }
            if (isTerminalRunStatus(runStatus)) {
              finalizeRunRecoveryBannerForMessage(reattachConversationId, message.id);
              // Delay soft-refresh on failed so onError's durable error wins
              // the merge race (symmetric with the main chat path).
              if (runStatus === 'failed') {
                window.setTimeout(() => {
                  if (cancelled) return;
                  scheduleConversationMessageRefresh(reattachConversationId);
                }, 500);
              } else {
                scheduleConversationMessageRefresh(reattachConversationId);
              }
            }
          },
          onRunEventId: (lastRunEventId) => {
            textBuffer.flush();
            updateMessageById(message.id, (prev) => ({ ...prev, lastRunEventId }));
            persistSoon();
          },
        })
          .catch((err) => {
            // Skip AbortError (expected on interrupt) and any error from a run
            // that was tagged superseded by a send-now interrupt — it must not
            // surface a global failure over the replacement.
            const runMayFinalize =
              !supersededRunsRef.current.has(controller);
            if ((err as Error).name !== 'AbortError' && runMayFinalize) {
              const errorCode = extractProjectRunErrorCode(err);
              const resumable = (err as Error & { resumable?: boolean }).resumable === true;
              const msg = formatProjectRunErrorForUser(err);
              setError(msg);
              updateMessageById(
                message.id,
                (prev) => ({
                  ...attachPersistedChatError(prev, msg, errorCode),
                  resumable,
                }),
                true,
                { telemetryFinalized: true },
              );
              finalizeRunRecoveryBannerForMessage(reattachConversationId, message.id);
            }
          })
          .finally(() => {
            textBuffer.flush();
            textBuffer.cancel();
            unregisterTextBuffer();
            persistScheduler.cancel();
            reattachControllersRef.current.delete(runId);
            reattachCancelControllersRef.current.delete(runId);
            clearActiveRunRefs(reattachConversationId, controller, cancelController);
          });
      }
    };

    void attachRecoverableRuns();
    return () => {
      cancelled = true;
    };
  }, [
    daemonLive,
    config.mode,
    activeConversationId,
    streaming,
    messages,
    project.id,
    updateMessageById,
    persistMessageById,
    auditDesignSystemWorkspaceAfterRun,
    markStreamingConversation,
    clearStreamingMarker,
    clearActiveRunRefs,
    clearCurrentRunStreamingMarker,
    refreshProjectFiles,
    readProjectHtml,
    persistArtifact,
    requestOpenFile,
    onProjectsRefresh,
    scheduleConversationMessageRefresh,
    reattachNonce,
    slideOnlyMvp,
    finalizeSlideOnlyDeckArtifacts,
  ]);

  useEffect(() => {
    if (config.mode !== 'api' || !daemonLive || !activeConversationId) return;
    if (streaming && abortRef.current) return;
    if (findInFlightAssistantMessages(messages).length > 0) return;
    let cancelled = false;
    let retryTimer: number | null = null;
    const recoveryConversationId = activeConversationId;
    void (async () => {
      if (isDesignAuthRefreshDeclined() || shouldSkipByokProxyActivePoll()) {
        // Do not bump reattachNonce while sticky — that re-entered the effect
        // every auth-retry interval and kept scheduling daemon work.
        return;
      }
      let activeStreams: Awaited<ReturnType<typeof listActiveByokProxyStreams>>;
      try {
        activeStreams = await listActiveByokProxyStreams(project.id);
      } catch (err) {
        devLog.debug('[teamver] api background recovery stream probe skipped', {
          projectId: project.id,
          conversationId: recoveryConversationId,
          error: err,
        });
        const retryDelay = err instanceof ActiveByokProxyAuthTransientError
          ? BYOK_BACKGROUND_RECOVERY_AUTH_RETRY_MS
          : BYOK_BACKGROUND_RECOVERY_POLL_MS;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          if (!cancelled) setReattachNonce((value) => value + 1);
        }, retryDelay);
        return;
      }
      if (cancelled) return;
      const matchingStreams = activeStreams.filter((stream) => {
        const streamConversationId = stream.conversationId?.trim();
        if (streamConversationId && streamConversationId !== recoveryConversationId) {
          return false;
        }
        const assistantMessageId = stream.assistantMessageId?.trim();
        if (
          wasUserStoppedAssistantTurn({
            assistantMessageId,
          })
        ) {
          return false;
        }
        if (assistantMessageId) {
          const existing = messages.find((message) => message.id === assistantMessageId);
          if (existing && isLocallyTerminalAssistantMessage(existing)) return false;
        }
        return true;
      });
      const nextMessages = mergeMissingActiveRunAssistantMessages(
        messages,
        matchingStreams.map((stream) => ({
          id: null,
          assistantMessageId: stream.assistantMessageId,
          status: 'running' as const,
          createdAt: stream.registeredAt,
        })),
      );
      if (nextMessages === messages) return;
      setMessages(nextMessages);
      for (const message of findInFlightAssistantMessages(nextMessages)) {
        dispatchTeamverBackgroundChat({
          projectId: project.id,
          conversationId: recoveryConversationId,
          assistantMessageId: message.id,
          active: true,
        });
      }
    })();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [
    config.mode,
    daemonLive,
    activeConversationId,
    streaming,
    inFlightAssistantSignature,
    messages,
    project.id,
    reattachNonce,
  ]);

  // Embed BYOK (`mode=api`) has no daemon run row — after page detach the
  // upstream proxy may still drain on the daemon. Poll messages/files and
  // restore Stop/streaming UI until the turn settles or proxy streams end.
  useEffect(() => {
    if (config.mode !== 'api' || !daemonLive || !activeConversationId) return;
    const initialInflightMessages = findInFlightAssistantMessages(messages);
    if (initialInflightMessages.length === 0) return;
    // Question-form turns idle on the server while waiting for answers — not a
    // background recovery scenario. Keep composer/form submit enabled.
    if (conversationAwaitingQuestionFormAnswer(messages)) return;
    if (
      initialInflightMessages.some((message) =>
        htmlAutoOpenFinalizeInProgressRef.current.has(message.id),
      )
    ) {
      return;
    }
    // A live local stream already owns this conversation — do not compete.
    if (
      streamingConversationIdRef.current === activeConversationId
      && abortRef.current
    ) {
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    let idlePollsWithoutProxy = 0;
    let recoveryStreamingArmed = false;
    const recoveryConversationId = activeConversationId;
    const trackedAssistantIds = new Set(initialInflightMessages.map((message) => message.id));
    const activatedAssistantIds = new Set<string>();
    apiRecoveryBannerRef.current = {
      conversationId: recoveryConversationId,
      assistantMessageIds: [...trackedAssistantIds],
    };

    const activateRecoveryUi = (messagesSnapshot: readonly ChatMessage[] = messages) => {
      if (trackedAssistantIds.size === 0) return;
      apiRecoveryBannerRef.current = {
        conversationId: recoveryConversationId,
        assistantMessageIds: [...trackedAssistantIds],
      };
      apiBackgroundRecoveryRef.current = true;
      if (!recoveryStreamingArmed) {
        markStreamingConversation(recoveryConversationId);
        recoveryStreamingArmed = true;
      }
      if (isTeamverEmbedMode()) {
        const inflight = findInFlightAssistantMessages(messagesSnapshot).filter((message) =>
          trackedAssistantIds.has(message.id),
        );
        const savedChars = Math.max(
          0,
          ...inflight.map((message) => (message.content ?? '').trim().length),
        );
        setRunRecoveryBanner({
          conversationId: recoveryConversationId,
          phase: resolveRunRecoveryBannerPhase('running', savedChars),
          savedChars,
          runStatus: 'running',
        });
        runRecoveryBannerTrackRef.current = inflight[0]
          ? {
              conversationId: recoveryConversationId,
              assistantMessageId: inflight[0].id,
            }
          : null;
      }
      for (const assistantMessageId of trackedAssistantIds) {
        if (activatedAssistantIds.has(assistantMessageId)) continue;
        activatedAssistantIds.add(assistantMessageId);
        dispatchTeamverBackgroundChat({
          projectId: project.id,
          conversationId: recoveryConversationId,
          assistantMessageId,
          active: true,
        });
      }
    };

    for (const message of initialInflightMessages) {
      dispatchTeamverBackgroundChat({
        projectId: project.id,
        conversationId: recoveryConversationId,
        assistantMessageId: message.id,
        active: true,
      });
      activatedAssistantIds.add(message.id);
    }
    activateRecoveryUi();

    const clearPollTimer = () => {
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
      }
    };

    const finishRecovery = () => {
      apiBackgroundRecoveryRef.current = false;
      if (abortRef.current && cancelRef.current) {
        clearCurrentRunStreamingMarker(
          recoveryConversationId,
          abortRef.current,
          cancelRef.current,
        );
      } else {
        clearStreamingMarker(recoveryConversationId);
      }
      clearApiBackgroundRecoveryBanner();
      clearPollTimer();
    };

    const scheduleNextPoll = (delayMs = BYOK_BACKGROUND_RECOVERY_POLL_MS) => {
      clearPollTimer();
      pollTimer = window.setTimeout(() => {
        void pollRecovery();
      }, delayMs);
    };

    const pollRecovery = async () => {
      if (cancelled) return;
      // Soft/hard sticky / BYOK auth backoff: do not keep hitting proxy/active
      // + listMessages while C1 owns recovery.
      if (isDesignAuthRefreshDeclined() || shouldSkipByokProxyActivePoll()) {
        // Back off while C1 owns recovery, but keep the poll chain alive so
        // re-entry after sticky does not strand in-flight BYOK turns.
        scheduleNextPoll(BYOK_BACKGROUND_RECOVERY_AUTH_RETRY_MS);
        return;
      }
      let activeStreams: Awaited<ReturnType<typeof listActiveByokProxyStreams>>;
      try {
        activeStreams = await listActiveByokProxyStreams(project.id);
      } catch (err) {
        const isAuthTransient = err instanceof ActiveByokProxyAuthTransientError;
        const log = isAuthTransient ? devLog.debug : devLog.warn;
        log('[teamver] api background recovery stream poll failed', {
          projectId: project.id,
          conversationId: recoveryConversationId,
          error: err instanceof Error ? err.message : String(err),
        });
        scheduleNextPoll(
          isAuthTransient
            ? BYOK_BACKGROUND_RECOVERY_AUTH_RETRY_MS
            : BYOK_BACKGROUND_RECOVERY_POLL_MS,
        );
        return;
      }
      if (cancelled) return;
      const matchingActiveStreams = activeStreams.filter((stream) => {
        const streamConversationId = stream.conversationId?.trim();
        return !streamConversationId || streamConversationId === recoveryConversationId;
      });
      for (const stream of matchingActiveStreams) {
        const assistantMessageId = stream.assistantMessageId?.trim();
        if (assistantMessageId) trackedAssistantIds.add(assistantMessageId);
      }
      activateRecoveryUi();

      let stillInflight = false;
      let mergedMessages: ChatMessage[] = messages;
      try {
        const serverMessages = await listMessages(project.id, recoveryConversationId);
        if (cancelled) return;
        const recoveredMessages = mergeServerMessagesIntoConversation(messages, serverMessages).map((message) => {
          if (
            trackedAssistantIds.has(message.id)
            && message.role === 'assistant'
            && message.endedAt === undefined
            && message.startedAt === undefined
          ) {
            return { ...message, startedAt: message.createdAt || Date.now() };
          }
          return message;
        });
        mergedMessages = recoveredMessages;
        stillInflight = findInFlightAssistantMessages(recoveredMessages).length > 0;
        setMessages((current) => {
          const nextMessages = mergeServerMessagesIntoConversation(current, serverMessages).map((message) => {
            if (
              trackedAssistantIds.has(message.id)
              && message.role === 'assistant'
              && message.endedAt === undefined
              && message.startedAt === undefined
            ) {
              return { ...message, startedAt: message.createdAt || Date.now() };
            }
            return message;
          });
          return nextMessages;
        });
      } catch {
        // Fall through — proxy-active check still gates recovery exit.
      }
      if (cancelled) return;
      if (stillInflight) {
        activateRecoveryUi(mergedMessages);
      }
      let nextFiles: Awaited<ReturnType<typeof refreshProjectFiles>>;
      try {
        nextFiles = await refreshProjectFiles();
      } catch (err) {
        devLog.warn('[teamver] api background recovery file refresh failed', {
          projectId: project.id,
          conversationId: recoveryConversationId,
          error: err,
        });
        scheduleNextPoll();
        return;
      }
      if (cancelled) return;
      const openedRecoveredHtml = await autoOpenRecoveredHtmlOutput(
        mergedMessages,
        trackedAssistantIds,
        nextFiles,
      );

      const proxyStillActive = matchingActiveStreams.length > 0;
      if (!openedRecoveredHtml && !stillInflight && !proxyStillActive) {
        if (pendingAutoContinueConversationIdRef.current === recoveryConversationId) {
          finishRecovery();
          return;
        }
        const autoContinueCount = syncAutoContinueCountFromMessages(
          conversationAutoContinueCountRef.current,
          recoveryConversationId,
          mergedMessages,
        );
        const incompleteAssistant = findIncompleteSlideAssistantForRecovery(
          mergedMessages,
          { restrictToMessageIds: trackedAssistantIds },
        );
        const recoveryCommentAttachments = incompleteAssistant
          ? extractCommentAttachmentsForAutoContinue(
              findPrecedingUserMessage(mergedMessages, incompleteAssistant.id),
              null,
            )
          : [];
        const recoveryAutoContinueMax = resolveAutoContinueMaxAttempts({
          scopedCommentAttachmentCount: recoveryCommentAttachments.length,
          visualMarkOnly: visualAnnotationAutoContinueFlags(recoveryCommentAttachments).visualMarkOnly,
        });
        // Prefer emergency salvage before auto-continue (same as live finalize / reload).
        if (incompleteAssistant && slideOnlyMvp) {
          const incompleteIndex = mergedMessages.findIndex(
            (message) => message.id === incompleteAssistant.id,
          );
          const beforeFileNames = resolveTurnStartFileBaseline(
            incompleteAssistant.preTurnFileNames,
            nextFiles,
          );
          const emergency = await attemptEmergencySlideDeckRecovery({
            slideOnlyMvp,
            producedHtmlToOpen: null,
            scopedCommentAttachmentCount: recoveryCommentAttachments.length,
            outlineMessages: mergedMessages.slice(0, incompleteIndex + 1),
            finalText: incompleteAssistant.content,
            projectFiles: nextFiles,
            beforeFileNames,
            startedAt: incompleteAssistant.startedAt ?? incompleteAssistant.createdAt ?? Date.now(),
            persistArtifact,
            refreshProjectFiles,
            readProjectHtml,
            computeProducedFiles,
          });
          if (emergency.recovered && emergency.htmlToOpen) {
            const emergencyNotice = formatEmergencyDeckFallbackNotice();
            const updatedAssistant = {
              ...appendWarningStatusEvent(
                clearDurableDeliverableErrorsAfterRecovery(incompleteAssistant),
                emergencyNotice,
                EMERGENCY_DECK_FALLBACK_STATUS_CODE,
              ),
              producedFiles: emergency.produced,
              runStatus: 'succeeded' as const,
              resumable: false,
              endedAt: incompleteAssistant.endedAt ?? Date.now(),
            };
            setMessages((current) =>
              current.map((message) =>
                message.id === updatedAssistant.id ? updatedAssistant : message,
              ),
            );
            void saveMessage(project.id, recoveryConversationId, updatedAssistant, {
              telemetryFinalized: true,
            });
            const filesAfterEmergency = await refreshProjectFiles();
            await finalizeSlideOnlyDeckArtifacts(
              filesAfterEmergency,
              emergency.htmlToOpen,
            );
            maybeArmTeamverPublishMenuAfterRunSuccess(project.id, emergency.htmlToOpen);
            requestOpenFile(emergency.htmlToOpen);
            finishRecovery();
            return;
          }
        }
        if (!canFireAutoContinueForConversation(autoContinueCount, recoveryAutoContinueMax)) {
          finishRecovery();
          return;
        }
        if (incompleteAssistant) {
          conversationAutoContinueCountRef.current.set(
            recoveryConversationId,
            autoContinueCount + 1,
          );
          const autoContinueNotice = formatAutoContinueIncompleteOutputNotice();
          const updatedAssistant = attachAutoContinueIncompleteOutputNotice(
            incompleteAssistant,
            autoContinueNotice,
            formatProjectRunDeliverableMissingError(),
          );
          setMessages((current) =>
            current.map((message) =>
              message.id === updatedAssistant.id ? updatedAssistant : message,
            ),
          );
          void saveMessage(project.id, recoveryConversationId, updatedAssistant, {
            telemetryFinalized: true,
          });
          finishRecovery();
          if (autoContinueTimerRef.current !== null) {
            window.clearTimeout(autoContinueTimerRef.current);
          }
          const scheduledProjectId = project.id;
          const scheduledConversationId = recoveryConversationId;
          pendingAutoContinueConversationIdRef.current = scheduledConversationId;
          setAutoContinuePending(true);
          autoContinueTimerRef.current = window.setTimeout(() => {
            autoContinueTimerRef.current = null;
            pendingAutoContinueConversationIdRef.current = null;
            setAutoContinuePending(false);
            if (project.id !== scheduledProjectId) {
              rollbackAutoContinueCount(
                conversationAutoContinueCountRef.current,
                scheduledConversationId,
              );
              return;
            }
            if (messagesConversationIdRef.current !== scheduledConversationId) {
              rollbackAutoContinueCount(
                conversationAutoContinueCountRef.current,
                scheduledConversationId,
              );
              return;
            }
            if (
              isLiveLocalStreamBlockingAutoContinue({
                abortController: abortRef.current,
                streamingConversationId: streamingConversationIdRef.current,
                targetConversationId: scheduledConversationId,
              })
            ) {
              rollbackAutoContinueCount(
                conversationAutoContinueCountRef.current,
                scheduledConversationId,
              );
              return;
            }
            const sendNow = handleSendRef.current;
            if (!sendNow) {
              rollbackAutoContinueCount(
                conversationAutoContinueCountRef.current,
                scheduledConversationId,
              );
              return;
            }
            const attempt =
              conversationAutoContinueCountRef.current.get(scheduledConversationId) ?? 1;
            const autoContinueCtx =
              extractAutoContinueContextFromAssistant(incompleteAssistant);
            const autoContinueCommentAttachments = hydrateQueryContextCommentAttachments(
              extractCommentAttachmentsForAutoContinue(
                findPrecedingUserMessage(mergedMessages, incompleteAssistant?.id),
                runCommentAttachmentsRef.current,
              ),
              visibleCommentEditInstruction(
                findPrecedingUserMessage(mergedMessages, incompleteAssistant?.id)?.content,
              ),
            );
            const autoContinueOriginUser = findPrecedingUserMessage(
              mergedMessages,
              incompleteAssistant?.id,
            );
            const scopedCommentContext =
              autoContinueCommentAttachments.length > 0
                ? renderCommentAttachmentContext(autoContinueCommentAttachments, {
                    includeQueryComments: true,
                  })
                : null;
            const concretePatchTemplate =
              autoContinueCommentAttachments.length > 0
                ? buildConcretePatchTemplatesForCommentAttachments(autoContinueCommentAttachments)
                : null;
            const autoContinueVisualFlags = visualAnnotationAutoContinueFlags(
              autoContinueCommentAttachments,
            );
            const autoContinuePrompt = resolveAutoContinuePrompt({
              commentAttachmentCount: autoContinueCommentAttachments.length,
              visualMarkOnly: autoContinueVisualFlags.visualMarkOnly,
              visualAnnotationEdit: autoContinueVisualFlags.visualAnnotationEdit,
              scopedCommentContext,
              scopedUserInstruction: autoContinueOriginUser
                ? stripUserVisibleUserMessageText(autoContinueOriginUser.content).trim()
                : null,
              concretePatchTemplate,
              incompleteOutput: {
                attempt,
                referenceFiles: collectSlideReferencePathsFromMessages(mergedMessages),
                slideCountHint: extractRequestedSlideCountHintFromMessages(mergedMessages),
                existingDeckPath: resolvePrimaryDeckFilePath(
                  nextFiles,
                  project.metadata?.entryFile,
                ),
                ...autoContinueCtx,
              },
            });
            // Preserve comment scope + image/deck attachments so image-embed
            // retries keep exact src paths and existing-deck edit contracts.
            const started = sendNow(
              autoContinuePrompt,
              chatAttachmentsForAutoContinueImageEmbed(autoContinueOriginUser, projectFilesRef.current.map((file) => String(file.path || file.name || "").trim()).filter(Boolean)),
              autoContinueCommentAttachments,
              { entryFrom: AUTO_CONTINUE_ENTRY_FROM },
            );
            void Promise.resolve(started).then((ok) => {
              if (ok === false) {
                rollbackAutoContinueCount(
                  conversationAutoContinueCountRef.current,
                  scheduledConversationId,
                );
              }
            });
          }, 600);
          return;
        }
      }
      if (trackedAssistantIds.size === 0 && !proxyStillActive) {
        finishRecovery();
        return;
      }
      if (!proxyStillActive && stillInflight) {
        idlePollsWithoutProxy += 1;
        if (idlePollsWithoutProxy >= 3) {
          const stalledDetail = formatProjectRunStalledErrorForUser();
          const abandoned = findInFlightAssistantMessages(mergedMessages).filter((message) =>
            trackedAssistantIds.has(message.id),
          );
          for (const message of abandoned) {
            updateMessageById(
              message.id,
              (prev) => patchStaleApiAssistantFailure(prev, stalledDetail),
              true,
            );
            dispatchTeamverBackgroundChat({
              projectId: project.id,
              conversationId: recoveryConversationId,
              assistantMessageId: message.id,
              active: false,
            });
          }
          clearStreamingMarker(recoveryConversationId);
          scheduleConversationMessageRefresh(recoveryConversationId);
          finishRecovery();
          return;
        }
      } else {
        idlePollsWithoutProxy = 0;
      }

      if (!stillInflight && !proxyStillActive) {
        finishRecovery();
        return;
      }
      scheduleNextPoll();
    };

    void pollRecovery();
    return () => {
      cancelled = true;
      clearPollTimer();
      if (recoveryStreamingArmed) {
        clearStreamingMarker(recoveryConversationId);
      }
      apiBackgroundRecoveryRef.current = false;
      clearApiBackgroundRecoveryBanner();
      // Keep App-level background-run tracking when this route unmounts — the
      // upstream proxy/daemon run may still be draining while the user is on
      // home. finishRecovery() and explicit run completion clear active:false.
    };
  }, [
    config.mode,
    daemonLive,
    activeConversationId,
    inFlightAssistantSignature,
    project.id,
    markStreamingConversation,
    refreshProjectFiles,
    autoOpenRecoveredHtmlOutput,
    clearCurrentRunStreamingMarker,
    clearStreamingMarker,
    scheduleConversationMessageRefresh,
    clearApiBackgroundRecoveryBanner,
    reattachNonce,
    updateMessageById,
  ]);

  const commitQueuedChatSends = useCallback((next: QueuedChatSend[]) => {
    queuedChatSendsRef.current = next;
    setQueuedChatSends(next);
    saveQueuedChatSends(project.id, next);
  }, [project.id]);

  // Only tear down in-flight BYOK streams when the active workspace actually
  // changes. Cross-tab BroadcastChannel relay (B2) can re-emit the same
  // workspaceId; without this guard we detached streams mid-run (e.g. during
  // the onboarding question-form) even though the user never switched workspace.
  const embedActiveWorkspaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    let cancelled = false;
    void readActiveTeamverWorkspaceId().then((id) => {
      if (cancelled) return;
      embedActiveWorkspaceIdRef.current = id?.trim() || null;
    });
    return subscribeTeamverWorkspaceChanged(({ workspaceId }) => {
      const trimmed = workspaceId.trim();
      if (!trimmed) return;
      if (shouldSkipWorkspaceSwitchSideEffects(embedActiveWorkspaceIdRef.current, trimmed)) {
        embedActiveWorkspaceIdRef.current = trimmed;
        return;
      }
      embedActiveWorkspaceIdRef.current = trimmed;
      setError(null);
      setConversationLoadError(null);
      detachLocalRunStreamConsumers();
      commitQueuedChatSends([]);
    });
  }, [commitQueuedChatSends, detachLocalRunStreamConsumers]);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    return subscribeTeamverEmbedSessionChanged(({ authenticated }) => {
      if (authenticated) return;
      setError(null);
      setConversationLoadError(null);
      detachLocalRunStreamConsumers();
      // Preserve queued sends across a session-expiry round-trip. Users
      // frequently line up several prompts, and quietly wiping them here
      // was silent data loss. Queue is already persisted in localStorage,
      // so the login redirect + ProjectView re-mount will restore it via
      // `loadQueuedChatSends(project.id)` and the auto-start effect will
      // resume dispatch. Log preservation for observability.
      const preservedCount = queuedChatSendsRef.current.length;
      if (preservedCount > 0) {
        devLog.info(
          '[teamver] chat-queue: preserved across session expiry',
          { projectId: project.id, count: preservedCount },
        );
      }
    });
  }, [detachLocalRunStreamConsumers, project.id]);

  // Sticky-paused reattach / BYOK recovery effects resume when auth returns
  // (session-changed forceEvent or passive recovered) without sticky timers.
  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    const resume = () => setReattachNonce((value) => value + 1);
    const onRecovered = () => resume();
    window.addEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, onRecovered);
    const unsubscribe = subscribeTeamverEmbedSessionChanged(({ authenticated }) => {
      if (authenticated) resume();
    });
    return () => {
      window.removeEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, onRecovered);
      unsubscribe();
    };
  }, []);

  // Re-entry / visibility: transient daemon 401 or soft-sticky can leave an
  // empty chat or failed conversation list until auth recovers. Retry loads
  // without waiting for manual conversation switches.
  const retryStaleProjectConversationData = useCallback(
    (options?: { retryStuckMessageLoad?: boolean; forceAfterAuthRecovery?: boolean }) => {
      if (!options?.forceAfterAuthRecovery && isDesignAuthRefreshDeclined()) return;
      let bumped = false;
      if (conversationLoadError) {
        setConversationLoadRetryNonce((nonce) => nonce + 1);
        bumped = true;
      }
      if (activeConversationId) {
        if (failedMessagesConversationId === activeConversationId) {
          setMessageLoadRetryNonce((nonce) => nonce + 1);
          bumped = true;
        } else if (
          options?.retryStuckMessageLoad
          && messagesConversationId !== activeConversationId
        ) {
          setMessageLoadRetryNonce((nonce) => nonce + 1);
          bumped = true;
        }
      }
      if (bumped) {
        setFilesRefresh((nonce) => nonce + 1);
        setReattachNonce((value) => value + 1);
      }
    },
    [
      activeConversationId,
      conversationLoadError,
      failedMessagesConversationId,
      messagesConversationId,
    ],
  );

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    const onAuthReady = () => {
      retryStaleProjectConversationData({
        retryStuckMessageLoad: true,
        forceAfterAuthRecovery: true,
      });
    };
    window.addEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, onAuthReady);
    const unsubscribe = subscribeTeamverEmbedSessionChanged(({ authenticated }) => {
      if (authenticated) onAuthReady();
    });
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      retryStaleProjectConversationData();
    };
    const onPageShow = () => {
      retryStaleProjectConversationData({ retryStuckMessageLoad: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, onAuthReady);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [retryStaleProjectConversationData]);

  const enqueueChatSend = useCallback((item: QueuedChatSend) => {
    const fingerprint = queuedChatSendFingerprint(
      item.prompt,
      item.attachments,
      item.commentAttachments,
    );
    const duplicate = queuedChatSendsRef.current.some((existing) =>
      existing.conversationId === item.conversationId
      && queuedChatSendFingerprint(
        existing.prompt,
        existing.attachments,
        existing.commentAttachments,
      ) === fingerprint
    );
    if (duplicate) return;
    const next = [...queuedChatSendsRef.current, item];
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const removeQueuedChatSend = useCallback((id: string) => {
    const next = queuedChatSendsRef.current.filter((item) => item.id !== id);
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const updateQueuedChatSend = useCallback((id: string, update: QueuedChatSendUpdate) => {
    const next = queuedChatSendsRef.current.map((item) => {
      if (item.id !== id) return item;
      const meta = stripQueueOnlyFromMeta(update.meta);
      const updated: QueuedChatSend = {
        ...item,
        prompt: update.prompt,
        attachments: update.attachments,
        commentAttachments: update.commentAttachments,
      };
      if (meta === undefined) delete updated.meta;
      else updated.meta = meta;
      return updated;
    });
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const prioritizeQueuedChatSend = useCallback((id: string) => {
    const item = queuedChatSendsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    const next = [item, ...queuedChatSendsRef.current.filter((candidate) => candidate.id !== id)];
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const reorderCurrentConversationQueuedChatSends = useCallback((orderedIds: string[]) => {
    if (!activeConversationId || orderedIds.length === 0) return;
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    const current = queuedChatSendsRef.current;
    const originalConversationItems = current.filter(
      (item) => item.conversationId === activeConversationId,
    );
    const sortedConversationItems = [...originalConversationItems].sort((a, b) => {
      const aOrder = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
    if (
      sortedConversationItems.every((item, index) => item.id === originalConversationItems[index]?.id)
    ) {
      return;
    }
    let cursor = 0;
    const next = current.map((item) => {
      if (item.conversationId !== activeConversationId) return item;
      return sortedConversationItems[cursor++] ?? item;
    });
    commitQueuedChatSends(next);
  }, [activeConversationId, commitQueuedChatSends]);

  const queueChatSendForCurrentConversation = useCallback((input: {
    attachments: ChatAttachment[];
    commentAttachments: ChatCommentAttachment[];
    conversationId: string;
    meta?: ProjectChatSendMeta;
    prompt: string;
  }) => {
    const queuedMeta = stripQueueOnlyFromMeta(input.meta);
    enqueueChatSend({
      id: randomUUID(),
      conversationId: input.conversationId,
      prompt: input.prompt,
      attachments: input.attachments,
      commentAttachments: input.commentAttachments,
      ...(queuedMeta === undefined ? {} : { meta: queuedMeta }),
      createdAt: Date.now(),
    });
    if (input.commentAttachments.length > 0) {
      const reservedCommentIds = new Set(
        input.commentAttachments
          .filter((attachment) => attachment.source !== 'board-batch')
          .map((attachment) => attachment.id),
      );
      setAttachedComments((current) =>
        current.filter((comment) => !reservedCommentIds.has(comment.id)),
      );
      if (reservedCommentIds.size > 0) {
        setPreviewComments((current) =>
          current.map((comment) =>
            reservedCommentIds.has(comment.id)
              ? { ...comment, status: 'applying' }
              : comment,
          ),
        );
        void Promise.all(
          Array.from(reservedCommentIds, (commentId) =>
            patchPreviewCommentStatus(project.id, input.conversationId, commentId, 'applying'),
          ),
        ).catch(() => {});
      }
    }
  }, [enqueueChatSend, project.id]);

  const handleSend = useCallback(
    async (
      prompt: string,
      attachments: ChatAttachment[],
      commentAttachments: ChatCommentAttachment[] = commentsToAttachments(attachedComments),
      meta?: ProjectChatSendMeta,
      baseMessages?: ChatMessage[],
    ) => {
      if (embedSubmitDisabled && meta?.entryFrom !== AUTO_CONTINUE_ENTRY_FROM) {
        onEmbedSubmitBlocked?.();
        return false;
      }
      meta = enrichChatSendMetaWithProjectDeckTemplate(meta, project.metadata);
      if (!activeConversationId) return false;
      if (messagesConversationIdRef.current !== activeConversationId) return false;
      const runSessionMode = meta?.sessionMode ?? activeSessionMode;
      const retryTarget = meta?.retryOfAssistantId
        ? resolveRetryTarget(messages, meta.retryOfAssistantId)
        : null;
      if (meta?.retryOfAssistantId && !retryTarget) return false;
      if (retryTarget && config.mode === 'api') {
        try {
          const deleted = await cleanupByokRetryArtifacts(
            project.id,
            projectFiles,
            retryTarget.failedAssistant,
          );
          if (deleted.length > 0) await refreshProjectFiles();
        } catch {
          // Best-effort GC — retry must not block on stale artifact cleanup.
        }
      }
      const runContext = meta?.context ?? retryTarget?.userMsg.runContext;
      const historyBase = retryTarget ? retryTarget.priorMessages : baseMessages ?? messages;
      if (
        !retryTarget &&
        !prompt.trim() &&
        attachments.length === 0 &&
        commentAttachments.length === 0
      ) return false;
      const isAutoContinueSend =
        meta?.entryFrom === AUTO_CONTINUE_ENTRY_FROM
        || isAutoContinueIncompleteOutputPrompt(prompt);
      let filesSnapshot = projectFiles;
      if (
        commentAttachments.some(
          (attachment) =>
            Boolean(attachment.markKind)
            || String(attachment.screenshotPath || '').trim().length > 0,
        )
        || attachments.some(
          (attachment) =>
            attachment.kind === 'image'
            || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(attachment.path),
        )
      ) {
        filesSnapshot = await refreshProjectFiles().catch(() => projectFiles);
      }
      const hydratedCommentAttachments = commentAttachments.length > 0
        ? await hydrateDeckCommentSlideIndexes({
          projectId: project.id,
          attachments: commentAttachments,
          projectFiles: filesSnapshot,
          entryFile: project.metadata?.entryFile ?? null,
        })
        : commentAttachments;
      const scopedCommentAttachments = filterUsableCommentAttachments(
        dedupeCommentAttachments(hydratedCommentAttachments),
      );
      let effectiveAttachments = excludeAttachmentsBackedByVisualScreenshots(
        mergeChatAttachments(
          attachments,
          chatAttachmentsFromPreviewCommentFiles(scopedCommentAttachments, filesSnapshot),
          ...scopedCommentAttachments.map((attachment) =>
            chatAttachmentsFromPreviewCommentImages(attachment.imageAttachments),
          ),
        ),
        scopedCommentAttachments,
      );
      let autoAttachedDeckPath: string | null = null;
      // Scoped comment edits (including auto-continue retries) must keep the
      // on-disk deck attached so the model can emit element-patch / deck-patch
      // against real target ids instead of guessing from stale chat prose.
      if (slideOnlyMvp && scopedCommentAttachments.length > 0) {
        const existingDeck = resolveCanonicalDeckFileForEdit(
          filesSnapshot,
          project.metadata?.entryFile ?? null,
        );
        if (existingDeck) {
          const deckPath = existingDeck.path?.trim() || existingDeck.name;
          if (
            deckPath
            && !attachmentsIncludeProjectFilePath(effectiveAttachments, deckPath)
          ) {
            effectiveAttachments = mergeChatAttachments(
              effectiveAttachments,
              [chatAttachmentForProjectFile(existingDeck)],
            );
          }
          autoAttachedDeckPath = deckPath;
        }
      }
      // Disk *canonical* deck is enough — first-turn interrupt + retry often has
      // no prior assistant in historyBase, but the project already has deck.html.
      // Do not treat leftover about.html / notes.html as an existing deck edit.
      if (slideOnlyMvp && scopedCommentAttachments.length === 0) {
        const existingDeck = resolveCanonicalDeckFileForEdit(
          filesSnapshot,
          project.metadata?.entryFile ?? null,
        );
        if (existingDeck) {
          const deckPath = existingDeck.path?.trim() || existingDeck.name;
          if (
            deckPath
            && !attachmentsIncludeProjectFilePath(effectiveAttachments, deckPath)
          ) {
            effectiveAttachments = mergeChatAttachments(
              effectiveAttachments,
              [chatAttachmentForProjectFile(existingDeck)],
            );
          }
          // Always mark existing-deck edit — even when deck.html was already
          // in attachments, and even on auto-continue retries — so image-insert
          // turns get the surgical contract instead of greenfield full-deck
          // pressure (which collapses 8-slide decks to 2).
          autoAttachedDeckPath = deckPath;
        } else if (slideOnlyMvp) {
          // Fallback root-cause guard: `/files` may 502 or hydrate empty on
          // a cold sibling pod, so `filesSnapshot` is empty even though the
          // project already has a deck. If the SEND ATTACHMENTS themselves
          // reference a canonical deck HTML (composer auto-attach, previous
          // assistant echo, auto-continue seed), treat this turn as an
          // existing-deck edit — otherwise the greenfield instruction slips
          // through and the model regenerates a fresh 2-slide placeholder
          // (which stub-guard then correctly rejects, but the whole turn is
          // wasted).
          const attachedDeck = effectiveAttachments.find((attachment) => {
            const attachPath = String(attachment.path || attachment.name || '').trim();
            return attachPath && isCanonicalDeckFileName(attachPath);
          });
          if (attachedDeck) {
            autoAttachedDeckPath = attachedDeck.path?.trim() || attachedDeck.name;
          } else if (retryTarget || isAutoContinueSend) {
            // On auto-continue / retry, the failed assistant's origin user
            // typically had a deck attachment or the project already had a
            // deck. Refusing to mark existing-deck-edit here loops the same
            // greenfield → 2-slide → stub-guard reject failure on every retry.
            const historyDeck = (retryTarget?.userMsg.attachments ?? []).find(
              (attachment) => isCanonicalDeckFileName(String(attachment.path || attachment.name || '')),
            );
            if (historyDeck) {
              autoAttachedDeckPath = historyDeck.path?.trim() || historyDeck.name;
            }
          }
        }
      }
      const instructionAttachments = retryTarget
        ? mergeChatAttachments(retryTarget.userMsg.attachments ?? [], effectiveAttachments)
        : effectiveAttachments;
      // Prefer this-turn's filesSnapshot over the ref (which may have been
      // wiped by a mid-flight /files 502 into projectFilesRef state). Falls
      // back to the ref only when the snapshot is empty AND the ref has
      // stuff — that combination should never happen because the snapshot
      // is `refreshProjectFiles().catch(() => projectFiles)` earlier, but
      // the guard costs nothing and matches the existing-deck fallback.
      const filesSnapshotForEmbed = filesSnapshot.length > 0
        ? filesSnapshot
        : projectFilesRef.current;
      const projectFilePathsForEmbed = filesSnapshotForEmbed.map((file) =>
        String(file.path || file.name || '').trim(),
      ).filter(Boolean);
      const modelPromptBase = promptWithSlideAttachmentDeliverableInstruction(
        retryTarget ? retryTarget.userMsg.content || prompt : prompt,
        instructionAttachments,
        {
          slideOnlyMvp,
          commentAttachmentCount: scopedCommentAttachments.length,
          existingDeckEdit: autoAttachedDeckPath != null,
          projectFilePaths: projectFilePathsForEmbed,
        },
      );
      // On Teamver slide-only comment edits, nudge the model into the
      // partial-deck `<artifact type="deck-patch">` contract instead of
      // regenerating the whole deck. Merge / fallback live in `persistArtifact`
      // + `applyDeckPatch` — a malformed patch, out-of-range slideIndex, or
      // missing current deck cleanly falls through to auto-continue full-deck.
      let modelPrompt = promptWithSlideCommentEditPatchInstruction(modelPromptBase, {
        slideOnlyMvp,
        commentAttachmentCount: scopedCommentAttachments.length,
        commentAttachments: scopedCommentAttachments,
      });
      if (autoAttachedDeckPath) {
        modelPrompt = promptWithExistingDeckEditInstruction(modelPrompt, {
          slideOnlyMvp,
          deckPath: autoAttachedDeckPath,
          imagePaths: imageAttachmentPathsForSlideEmbed(effectiveAttachments),
        });
      }
      if (!retryTarget && meta?.queueOnly) {
        queueChatSendForCurrentConversation({
          conversationId: activeConversationId,
          prompt: modelPrompt,
          attachments: effectiveAttachments,
          commentAttachments: scopedCommentAttachments,
          meta: { ...(meta ?? {}), sessionMode: runSessionMode },
        });
        return false;
      }
      // Automatic continue must bypass a phantom-busy state (BYOK background
      // recovery / stale reattach marker) when no real local abort is active.
      // Without this, the setTimeout(600ms) that fires the auto-continue burns
      // its slot on a false-positive busy signal and the user is stuck with an
      // incomplete assistant row despite the "이어쓰기 시도 중" notice.
      const bypassBusyForAutoContinue = meta?.entryFrom === AUTO_CONTINUE_ENTRY_FROM && !abortRef.current;
      const bypassBusyForQueuedDrain = meta?.drainQueuedSend === true;
      if (currentConversationBusy && !bypassBusyForAutoContinue && !bypassBusyForQueuedDrain) {
        queueChatSendForCurrentConversation({
          conversationId: activeConversationId,
          prompt: modelPrompt,
          attachments: effectiveAttachments,
          commentAttachments: scopedCommentAttachments,
          meta: { ...(meta ?? {}), sessionMode: runSessionMode },
        });
        return false;
      }
      setChatSeed(null);
      const runConversationId = activeConversationId;
      // Manual retries and fresh user turns get a full auto-continue budget.
      // Without this reset, a conversation that exhausted the cap on earlier
      // incomplete_output rows would never auto-recover on the next real send.
      if (!isAutoContinueSend) {
        conversationAutoContinueCountRef.current.set(runConversationId, 0);
      }
      clearRunRecoveryBannerState(runConversationId);
      setError(null);
      const startedAt = Date.now();
      const persistedUserContent = scopedCommentAttachments.length > 0
        ? messageContentWithCommentAttachments(modelPrompt, scopedCommentAttachments)
        : modelPrompt;
      const userMsg: ChatMessage = retryTarget
        ? {
            ...retryTarget.userMsg,
            content: persistedUserContent,
            attachments: instructionAttachments.length > 0
              ? instructionAttachments
              : retryTarget.userMsg.attachments,
            ...(scopedCommentAttachments.length > 0 && !isAutoContinueSend
              ? { commentAttachments: scopedCommentAttachments }
              : {}),
          }
        : {
            id: randomUUID(),
            role: 'user',
            content: persistedUserContent,
            createdAt: startedAt,
            sessionMode: runSessionMode,
            ...(meta?.appliedPluginSnapshot
              ? { appliedPluginSnapshot: meta.appliedPluginSnapshot }
              : {}),
            ...(runContext ? { runContext } : {}),
            attachments: effectiveAttachments.length > 0 ? effectiveAttachments : undefined,
            ...(scopedCommentAttachments.length > 0 && !isAutoContinueSend
              ? { commentAttachments: scopedCommentAttachments }
              : {}),
          };
      const runCommentAttachments = scopedCommentAttachments;
      runCommentAttachmentsRef.current = runCommentAttachments;
      runVisiblePromptRef.current = stripUserVisibleUserMessageText(prompt).trim();
      const runAttachmentsRaw = mergeChatAttachments(
        userMsg.attachments ?? [],
        ...runCommentAttachments.map((attachment) =>
          chatAttachmentsFromPreviewCommentImages(attachment.imageAttachments),
        ),
      );
      // Upgrade basename-only recovered mentions to refs/drive/… so persist +
      // preview heal preferredPaths do not poison exact-match against a 404 root src.
      const runAttachments = runAttachmentsRaw.map((attachment) => {
        const raw = attachment.path.trim();
        if (!raw || !SLIDE_IMAGE_PATH_RE.test(raw)) return attachment;
        const canonical = resolveCanonicalProjectImagePath(raw, projectFilePathsForEmbed);
        if (!canonical || canonical === raw) return attachment;
        return {
          ...attachment,
          path: canonical,
          name: attachment.name?.trim() || projectFilePathBasename(canonical),
        };
      });
      runAttachmentsRef.current = runAttachments;
      setPreviewHealAttachmentPaths(
        runAttachments
          .map((attachment) => attachment.path.trim())
          .filter(Boolean),
      );
      runSkipDiscoveryBriefRef.current = resolveSlideOnlySkipDiscoveryBrief({
        projectSkipDiscoveryBrief: project.metadata?.skipDiscoveryBrief === true,
        projectKind: project.metadata?.kind ?? null,
        selectedDeckTemplateId:
          selectedDeckTemplateMetadata(project.metadata, meta)?.id
          ?? meta?.selectedDeckTemplateId
          ?? project.metadata?.selectedDeckTemplateId
          ?? null,
        runSkipDiscoveryBrief: meta?.skipDiscoveryBrief === true,
      });
      const commentPersistTarget = resolveCommentEditPersistTargetFileName(
        runCommentAttachments,
      );
      if (commentPersistTarget) {
        runPersistTargetFileRef.current = commentPersistTarget;
      } else if (slideOnlyMvp) {
        // Canvas/Drive source turns must persist as deck.html (or an existing
        // canonical deck*.html). Never prefer a root leak of refs/*.html —
        // refs may not be in projectFilesRef yet when the turn starts.
        const hasRefsHtmlAttachment = runAttachments.some((attachment) => {
          const path = attachment.path.replace(/\\/g, '/');
          return path.startsWith('refs/') && /\.html?$/i.test(path);
        });
        const existingDeck = resolvePrimaryDeckFile(
          projectFilesRef.current,
          project.metadata?.entryFile,
        );
        const existingDeckName = existingDeck?.path?.trim() || existingDeck?.name || null;
        if (hasRefsHtmlAttachment) {
          runPersistTargetFileRef.current =
            existingDeckName && isCanonicalDeckFileName(existingDeckName)
              ? existingDeckName
              : 'deck.html';
        } else {
          runPersistTargetFileRef.current = existingDeckName;
        }
      } else {
        runPersistTargetFileRef.current = null;
      }
      const selectedAgent =
        config.mode === 'daemon' && config.agentId
          ? agentsById.get(config.agentId)
          : null;
      const selectedAgentChoice =
        config.mode === 'daemon' && config.agentId
          ? config.agentModels?.[config.agentId]
          : undefined;
      const effectiveSelectedAgentChoice = effectiveAgentModelChoice(
        selectedAgent,
        selectedAgentChoice,
      );
      const assistantAgentId =
        config.mode === 'daemon'
          ? config.agentId ?? undefined
          : apiProtocolAgentId(config.apiProtocol);
      const assistantAgentName =
        config.mode === 'daemon'
          ? agentModelDisplayName(
              config.agentId,
              selectedAgent?.name,
              effectiveSelectedAgentChoice?.model,
            )
          : apiProtocolModelLabel(config.apiProtocol, config.model);
      // Client visual-mark fast path: placement-only marks (pen heart, etc.) graft
      // locally. Box marks and typed overlay notes route to AI — they mean
      // "change this region" (font size, copy, layout), not "paste a decoration".
      const runIsAllClientGraftVisualMarks =
        runCommentAttachments.length > 0
        && runCommentAttachments.every((attachment) =>
          shouldClientGraftVisualMarkWithoutAi(attachment),
        );
      if (
        slideOnlyMvp
        && !retryTarget
        && !isAutoContinueSend
        && runIsAllClientGraftVisualMarks
      ) {
        const clientVisual = await tryPersistClientVisualMarksOnSend({
          projectId: project.id,
          commentAttachments: runCommentAttachments,
          projectFiles: filesSnapshot,
          entryFile: project.metadata?.entryFile ?? null,
          conversationId: runConversationId,
          activeDeckSlideIndex: activeDeckSlideIndexForVisualMarkGraft(runCommentAttachments),
        });
        if (clientVisual.ok) {
          const doneAt = Date.now();
          const fastPathAssistantId = randomUUID();
          const fastPathAssistant: ChatMessage = {
            id: fastPathAssistantId,
            role: 'assistant',
            content: embedUiLabel(
              'Added the visual mark to your slide.',
              '슬라이드에 시각 마크를 추가했습니다.',
            ),
            agentId: assistantAgentId,
            agentName: assistantAgentName,
            createdAt: doneAt,
            runStatus: 'succeeded',
            startedAt,
            endedAt: doneAt,
            preTurnFileNames: [
              ...new Set([
                ...projectFilesRef.current.map((f) => f.name),
                ...userVisualUploadBaselineNames(scopedCommentAttachments),
              ]),
            ],
            ...(slideOnlyMvp ? { slideTurnKind: 'edit' as const } : {}),
          };
          const fastPathHistory = [...historyBase, userMsg];
          setMessages(dedupeConversationAssistantRows([...fastPathHistory, fastPathAssistant]));
          void saveMessage(project.id, runConversationId, userMsg)
            .then(() => saveMessage(project.id, runConversationId, fastPathAssistant))
            .catch(() => {});
          emitRevisionPush(
            analytics.track,
            project.id,
            projectKindToTracking(project.metadata?.kind, project.metadata?.videoModel),
            clientVisual.fileName,
            clientVisual.revision,
            'manual_edit',
          );
          setFilesRefresh((count) => count + 1);
          await refreshProjectFiles().catch(() => undefined);
          requestOpenFile(clientVisual.fileName);
          void patchAttachedStatuses(runCommentAttachments, 'resolved');
          const consumedCommentIds = new Set(runCommentAttachments.map((attachment) => attachment.id));
          setAttachedComments((current) =>
            current.filter((comment) => !consumedCommentIds.has(comment.id)),
          );
          setConversations((curr) =>
            curr.map((conversation) =>
              conversation.id === runConversationId
                ? {
                    ...conversation,
                    updatedAt: doneAt,
                    latestRun: {
                      status: 'succeeded',
                      startedAt,
                      endedAt: doneAt,
                      durationMs: Math.max(0, doneAt - startedAt),
                    },
                  }
                : conversation,
            ),
          );
          onTouchProject();
          return true;
        }
      }
      const preTurnFileNames = [
        ...new Set([
          ...projectFilesRef.current.map((f) => f.name),
          ...userVisualUploadBaselineNames(scopedCommentAttachments),
        ]),
      ];
      const slideTurnKind = resolveSlideTurnKindForSend({
        slideOnlyMvp,
        preTurnFileNames,
        existingDeckAttached: autoAttachedDeckPath != null,
      });
      const assistantId = randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        agentId: assistantAgentId,
        agentName: assistantAgentName,
        events: [],
        // +1ms so createdAt tie-breaks never put the assistant above its
        // triggering user message after a server merge / position race.
        createdAt: startedAt + 1,
        runStatus: config.mode === 'daemon' ? 'running' : undefined,
        startedAt,
        preTurnFileNames,
        ...(slideTurnKind ? { slideTurnKind } : {}),
      };
      let latestAssistantMsg: ChatMessage = assistantMsg;
      const updateConversationLatestRun = (
        status: NonNullable<ChatMessage['runStatus']>,
        endedAt?: number,
      ) => {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === runConversationId
              ? {
                  ...conversation,
                  updatedAt: endedAt ?? startedAt,
                  latestRun: {
                    status,
                    startedAt,
                    ...(endedAt === undefined
                      ? {}
                      : {
                          endedAt,
                          durationMs: Math.max(0, endedAt - startedAt),
                        }),
                  },
                }
              : conversation,
          ),
        );
      };
      activeCompletionNotificationRunsRef.current.add(assistantId);
      const nextHistory = retryTarget
        ? [...retryTarget.priorMessages, userMsg]
        : [...historyBase, userMsg];
      const nextVisibleMessages = retryTarget
        ? [...nextHistory, ...retryTarget.preservedAttempts, assistantMsg]
        : [...nextHistory, assistantMsg];
      setMessages(dedupeConversationAssistantRows(nextVisibleMessages));
      markStreamingConversation(runConversationId);
      if (config.mode === 'api') {
        dispatchTeamverBackgroundChat({
          projectId: project.id,
          conversationId: runConversationId,
          assistantMessageId: assistantId,
          active: true,
        });
      }
      updateConversationLatestRun(config.mode === 'daemon' ? 'running' : 'queued');
      setArtifact(null);
      // A fresh run supersedes the previous run's stranded-in-memory deck;
      // dropping the fallback here prevents the memory-only preview from
      // ghosting the new turn while it streams.
      clearProjectPendingArtifactWrites(project.id);
      setPendingRecoveryPreview(null);
      savedArtifactRef.current = null;
      onTouchProject();
      // Persist user BEFORE assistant so daemon `position` assignment cannot
      // race the assistant ahead of its trigger. A flipped pair used to make
      // the chat render AI → user after scheduleConversationMessageRefresh.
      // Daemon assistant rows without runId are still skipped by persistMessage
      // (phantom guard); API mode writes the empty assistant shell after the
      // user row lands. Merge-order repair covers the rare user-PUT failure.
      if (!retryTarget) {
        void Promise.resolve(saveMessage(project.id, runConversationId, userMsg))
          .then(() => {
            persistMessage(assistantMsg);
          })
          .catch(() => {
            persistMessage(assistantMsg);
          });
      } else {
        persistMessage(assistantMsg);
      }
      if (runCommentAttachments.length > 0) {
        void patchAttachedStatuses(runCommentAttachments, 'applying');
        const consumedCommentIds = new Set(runCommentAttachments.map((attachment) => attachment.id));
        setAttachedComments((current) =>
          current.filter((comment) => !consumedCommentIds.has(comment.id)),
        );
      }
      // If this is the first turn, derive a working title from the prompt
      // so the conversation is identifiable in the dropdown without a
      // round-trip through the agent.
      if (!retryTarget && historyBase.length === 0) {
        const title = isDesignSystemWorkspacePrompt(prompt)
          ? DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE
          : summarizeProjectNameFromUserTurn(prompt)
            || extractUserPromptForNaming(prompt).slice(0, 60).trim()
            || prompt.slice(0, 60).trim();
        if (title) {
          setConversations((curr) =>
            curr.map((c) =>
              c.id === runConversationId ? { ...c, title } : c,
            ),
          );
          void patchConversation(project.id, runConversationId, { title });
        }
        let projectName = summarizeProjectNameFromUserTurn(prompt);
        if (!projectName && canAutoRenameProjectFromPrompt(project)) {
          const fallback = deriveProjectNameForCreate({ prompt });
          if (fallback && fallback !== 'Untitled') projectName = fallback;
        }
        if (
          projectName &&
          projectName !== project.name &&
          canAutoRenameProjectFromPrompt(project)
        ) {
          const metadata = project.metadata
            ? { ...project.metadata, nameSource: 'prompt' as const }
            : undefined;
          const updated: Project = {
            ...project,
            name: projectName,
            ...(metadata ? { metadata } : {}),
            updatedAt: Date.now(),
          };
          onProjectChange(updated);
          void patchProject(project.id, {
            name: projectName,
            ...(metadata ? { metadata } : {}),
          }).then((patched) => {
            if (patched && isTeamverEmbedMode()) {
              void registerTeamverProjectIfNeeded(patched).catch((err) => {
                devLog.warn('[teamver] registry sync after prompt rename failed', err);
              });
            }
          });
        }
      }

      // Snapshot the file list at turn-start so we can diff after the
      // agent finishes and surface anything new (e.g. a generated .pptx)
      // as download chips on the assistant message.
      const beforeFileNames = new Set(preTurnFileNames);

      let parser = createArtifactParser();
      let parsedArtifact: Artifact | null = null;
      let liveHtml = '';
      let streamedText = '';
      // Best complete artifact seen so far in this turn. Prevents a
      // later `<artifact>` block with only a shell body (e.g. the model
      // opened a second, empty artifact after a valid one) from overwriting
      // an earlier good deliverable. Terminal auto-open falls back to this
      // when the live parsedArtifact ended up incomplete.
      let bestArtifactSoFar: Artifact | null = null;
      let runStopReason: string | undefined;
      const runIsVisible = () =>
        messagesConversationIdRef.current === runConversationId;

      const scheduleStreamRunHtmlAutoOpen = (fullText: string, delayMs = 0) => {
        const generation = (htmlAutoOpenGenerationRef.current.get(assistantId) ?? 0) + 1;
        htmlAutoOpenGenerationRef.current.set(assistantId, generation);
        const isLatestTerminalAutoOpen = () =>
          htmlAutoOpenGenerationRef.current.get(assistantId) === generation;

        const execute = () => {
          if (delayMs === 0 && htmlAutoOpenTimerRef.current !== null) {
            window.clearTimeout(htmlAutoOpenTimerRef.current);
            htmlAutoOpenTimerRef.current = null;
          }
          void (async () => {
            htmlAutoOpenFinalizeInProgressRef.current.add(assistantId);
            try {
            if (!isLatestTerminalAutoOpen()) return;
            let nextFiles = await refreshProjectFiles();
            const rawFinalText = streamedText || fullText || latestAssistantMsg.content || '';
            const finalText = latestAssistantMsg.content?.trim()
              ? latestAssistantMsg.content
              : rawFinalText;
            if (isQuestionFormTurnContent(finalText)) {
              await auditDesignSystemWorkspaceAfterRun(latestAssistantMsg.id);
              return;
            }
            let terminalArtifactPersistFailed = false;
            // Track the *kind* of the persist result separately so the
            // auto-continue gate below can distinguish "content is bad"
            // (skipped-incomplete / rejected) from "content is fine, save
            // failed for infra reasons" (save-failed on 5xx/network/etc.).
            // Auto-continuing on the latter would just waste tokens on a
            // second identical deliverable that would fail to save the same
            // way — the retry belongs to the user in that case.
            let terminalPersistResultKind: ArtifactPersistResult['kind'] | null = null;
            let terminalPersistResult: ArtifactPersistResult | null = null;
            const hadIncompleteParsedArtifact = Boolean(
              parsedArtifact?.html && isIncompleteHtmlDocumentShell(parsedArtifact.html),
            );

            // If the live parsedArtifact ended up incomplete (e.g. the model
            // emitted a valid deck first and an empty shell afterwards),
            // restore the best complete artifact we saw during this turn.
            // resolveTerminalArtifactToPersist already prefers a standalone
            // <!doctype html> fallback found in the raw text, but that path
            // misses artifacts the parser emitted as `<artifact>` blocks
            // before the trailing empty one clobbered our reference.
            const effectiveParsedArtifact: Artifact | null =
              hadIncompleteParsedArtifact
                && bestArtifactSoFar?.html
                && isUsableDeckHtmlArtifact(bestArtifactSoFar.html)
                ? bestArtifactSoFar
                : parsedArtifact;

            const artifactToPersist = resolveTerminalArtifactToPersist(
              effectiveParsedArtifact,
              rawFinalText,
              artifactFromStandaloneHtml,
            );
            if (artifactToPersist?.html) {
              const producedBeforeFallback = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
              const scopedCommentPersist = runCommentAttachmentsRef.current.length > 0;
              const sameTurnHtmlWrite = scopedCommentPersist
                ? null
                : await findSameTurnHtmlWriteForRecoveredArtifact({
                  artifactHtml: artifactToPersist.html,
                  producedFiles: producedBeforeFallback,
                  readProjectHtml,
                  allowAnyHtmlWrite: assistantAgentId === 'claude',
                });
              if (sameTurnHtmlWrite) {
                savedArtifactRef.current = sameTurnHtmlWrite.name;
                // Write-tool short-circuit skips persistArtifact's img-src heal.
                // Heal on disk now so reload/export do not keep alt-only paths.
                try {
                  const diskHtml = await readProjectHtml(sameTurnHtmlWrite.name);
                  if (diskHtml) {
                    const attachmentPaths = runAttachmentsRef.current
                      .map((attachment) => attachment.path.trim())
                      .filter(Boolean);
                    const projectPaths = [
                      ...nextFiles.map((file) => String(file.path || file.name || '').trim()),
                      ...attachmentPaths,
                    ].filter(Boolean);
                    const { html: healed, changed } = await healDiskHtmlAttachmentImageSrcs({
                      html: diskHtml,
                      projectFilePaths: projectPaths,
                      preferredAttachmentPaths: attachmentPaths,
                    });
                    if (changed) {
                      await writeProjectTextFileDetailed(
                        project.id,
                        sameTurnHtmlWrite.name,
                        healed,
                      );
                      nextFiles = await refreshProjectFiles();
                    }
                  }
                } catch {
                  // Soft-fail — FileViewer preview heal may still cover this turn.
                }
                if (runIsVisible()) {
                  maybeArmTeamverPublishMenuAfterRunSuccess(project.id, sameTurnHtmlWrite.name);
                  requestOpenFile(sameTurnHtmlWrite.name);
                }
              } else {
                const persistResult = await persistArtifact(
                  artifactToPersist,
                  nextFiles,
                  rawFinalText,
                  startedAt,
                );
                terminalArtifactPersistFailed = shouldFailRunForArtifactPersistResult(
                  persistResult,
                  { scopedCommentEdit: scopedCommentPersist },
                );
                terminalPersistResultKind = persistResult?.kind ?? null;
                terminalPersistResult = persistResult;
                nextFiles = await refreshProjectFiles();
              }
            }

            if (!isLatestTerminalAutoOpen()) return;

            let produced = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
            let producedHtmlToOpen = selectAutoOpenProducedHtml(produced, { projectFiles: nextFiles })
              ?? selectTouchedHtmlOutputFromEvents(latestAssistantMsg.events, nextFiles, {
                branding: { slideOnlyMvp },
              });
            if (slideOnlyMvp) {
              producedHtmlToOpen = await resolveSlideProducedHtmlToOpen(
                producedHtmlToOpen,
                terminalPersistResult,
                readProjectHtml,
              );
              nextFiles = await finalizeSlideOnlyDeckArtifacts(
                nextFiles,
                producedHtmlToOpen,
              );
            }
            produced = mergeRecoveredArtifact(
              produced,
              projectFileFromPersistedHtmlFallback(
                producedHtmlToOpen,
                terminalPersistResult,
                Date.now(),
              ),
            );
            const shouldFailMissingSlideHtml = shouldFailSlideRunForMissingHtmlDeliverable({
              slideOnlyMvp,
              producedHtmlToOpen,
              parsedArtifact: effectiveParsedArtifact,
              liveHtml,
              finalText: rawFinalText,
              terminalArtifactPersistFailed,
            });
            if (shouldFailMissingSlideHtml) {
              terminalArtifactPersistFailed = true;
            }
            // Persist already failed ⇒ shouldFailSlideRunForMissingHtmlDeliverable
            // returns false (double-count guard). Still treat "no HTML on disk"
            // as a missing-slide signal so rejected / discovery-skip can arm AC.
            const missingSlideDeliverableForAutoContinue =
              shouldFailMissingSlideHtml
              || (slideOnlyMvp && !producedHtmlToOpen && terminalArtifactPersistFailed);

            if (producedHtmlToOpen && runIsVisible()) {
              maybeArmTeamverPublishMenuAfterRunSuccess(project.id, producedHtmlToOpen);
              requestOpenFile(producedHtmlToOpen);
              const navTarget = queuedSlideNavTarget(runCommentAttachmentsRef.current, {
                fallbackDeckFilePath: producedHtmlToOpen,
              });
              if (navTarget) {
                setSlideNavRequest({
                  name: navTarget.filePath,
                  slideIndex: navTarget.slideIndex,
                  nonce: Date.now(),
                });
              }
            }

            if (!isLatestTerminalAutoOpen()) return;

            const endedAt = Date.now();
            if (terminalArtifactPersistFailed) {
              const deliverableError =
                terminalPersistResult?.kind === 'save-failed'
                  ? formatProjectArtifactSaveFailedError(terminalPersistResult.fileName, {
                      status: terminalPersistResult.status,
                      code: terminalPersistResult.code,
                      message: terminalPersistResult.message,
                    })
                  : terminalPersistResult?.kind === 'artifact-regression'
                    ? formatProjectArtifactRegressionRejectedError(
                        terminalPersistResult.fileName,
                      )
                  : terminalPersistResult?.kind === 'scope-rejected'
                    ? formatProjectArtifactCommentScopeRejectedError(
                        [terminalPersistResult.code, terminalPersistResult.reason]
                          .filter(Boolean)
                          .join(' — '),
                      )
                  : terminalPersistResult?.kind === 'rejected' && terminalPersistResult.reason
                    ? formatProjectArtifactRejectedError(
                        terminalPersistResult.fileName || 'untitled',
                        terminalPersistResult.reason,
                      )
                  : encodePersistedRunErrorDetail(
                      formatProjectRunDeliverableMissingError(),
                      {
                        kind: terminalPersistResult?.kind ?? null,
                        reason:
                          terminalPersistResult && 'reason' in terminalPersistResult
                            ? terminalPersistResult.reason ?? null
                            : null,
                      },
                    );
              const deliverableErrorCode = terminalPersistResult?.kind === 'scope-rejected'
                ? terminalPersistResult.code
                : terminalPersistResult?.kind === 'artifact-regression'
                  ? 'artifact_regression'
                : 'incomplete_output';
              const autoContinueCount = syncAutoContinueCountFromMessages(
                conversationAutoContinueCountRef.current,
                runConversationId,
                messagesRef.current,
              );
              const terminalAutoContinueCommentAttachments = extractCommentAttachmentsForAutoContinue(
                retryTarget?.userMsg ?? userMsg,
                runCommentAttachmentsRef.current,
              );
              const terminalAutoContinueVisualFlags = visualAnnotationAutoContinueFlags(
                terminalAutoContinueCommentAttachments,
              );
              const canAutoContinue = shouldAutoContinueForIncompleteOutput({
                runIsVisible: runIsVisible(),
                autoContinueCount,
                scopedCommentAttachmentCount: terminalAutoContinueCommentAttachments.length,
                maxPerConversation: resolveAutoContinueMaxAttempts({
                  scopedCommentAttachmentCount: terminalAutoContinueCommentAttachments.length,
                  visualMarkOnly: terminalAutoContinueVisualFlags.visualMarkOnly,
                }),
                terminalPersistResultKind,
                terminalPersistResultCode:
                  terminalPersistResult?.kind === 'scope-rejected'
                    ? terminalPersistResult.code
                    : null,
                terminalPersistResultReason:
                  terminalPersistResult && 'reason' in terminalPersistResult
                    ? terminalPersistResult.reason ?? null
                    : null,
                hadIncompleteParsedArtifact,
                shouldFailMissingSlideHtml: missingSlideDeliverableForAutoContinue,
                shouldRouteScopedCommentEditToAutoContinue,
              });

              let emergencyRecovered = false;
              let emergencyProduced = produced;
              // Only salvage model-authored HTML from the stream. Never synthesize
              // a skeleton outline deck here — that used to mark junk as succeeded
              // and skip auto-continue. If salvage misses, fall through to retry.
              const streamLooksLikeHtmlDeliverable =
                /<!doctype\s+html|<html\b|<body\b|<section\b[^>]*\bslide\b|<artifact\b/i
                  .test(rawFinalText);
              if (
                slideOnlyMvp
                && !producedHtmlToOpen
                && streamLooksLikeHtmlDeliverable
              ) {
                const outlineMessages = retryTarget
                  ? [...historyBase, latestAssistantMsg]
                  : [...historyBase, userMsg, latestAssistantMsg];
                const emergency = await attemptEmergencySlideDeckRecovery({
                  slideOnlyMvp,
                  producedHtmlToOpen,
                  scopedCommentAttachmentCount: terminalAutoContinueCommentAttachments.length,
                  outlineMessages,
                  finalText: rawFinalText,
                  projectFiles: nextFiles,
                  beforeFileNames,
                  startedAt,
                  persistArtifact,
                  refreshProjectFiles,
                  readProjectHtml,
                  computeProducedFiles,
                });
                emergencyRecovered = emergency.recovered;
                emergencyProduced = emergency.produced;
                if (emergency.htmlToOpen) {
                  nextFiles = await finalizeSlideOnlyDeckArtifacts(
                    await refreshProjectFiles(),
                    emergency.htmlToOpen,
                  );
                  if (runIsVisible()) {
                    maybeArmTeamverPublishMenuAfterRunSuccess(project.id, emergency.htmlToOpen);
                    requestOpenFile(emergency.htmlToOpen);
                  }
                }
              }

              // Absolute last-resort fallback: when auto-continue has burned
              // through every retry AND stream salvage did not recover any
              // authored HTML, synthesize a minimal placeholder deck from
              // the outline signals already in the conversation (numbered
              // outlines, bullet lists, Canvas source-brief `Visible
              // headings: A / B / C` lines). This intentionally violates
              // the regular "never synthesize a skeleton deck" rule so the
              // user never lands on a raw "생성 실패" banner after a series
              // of failed retries — but only after every earlier recovery
              // has failed. The synth deck is marked with a distinct
              // OUTLINE_DECK_FALLBACK_STATUS_CODE and comes with an
              // "임시 슬라이드" notice so the user immediately knows to hit
              // "다시 시도" for a completed deck.
              let outlineFallbackRecovered = false;
              let outlineFallbackProduced = produced;
              if (
                !emergencyRecovered
                && !canAutoContinue
                && slideOnlyMvp
                && !producedHtmlToOpen
                && terminalAutoContinueCommentAttachments.length === 0
              ) {
                const fallbackMessages = retryTarget
                  ? [...historyBase, latestAssistantMsg]
                  : [...historyBase, userMsg, latestAssistantMsg];
                const outlineFallback = await attemptFinalOutlineDeckFallback({
                  slideOnlyMvp,
                  producedHtmlToOpen,
                  scopedCommentAttachmentCount: terminalAutoContinueCommentAttachments.length,
                  outlineMessages: fallbackMessages,
                  finalText: rawFinalText,
                  projectFiles: nextFiles,
                  beforeFileNames,
                  startedAt,
                  persistArtifact,
                  refreshProjectFiles,
                  readProjectHtml,
                  computeProducedFiles,
                });
                outlineFallbackRecovered = outlineFallback.recovered;
                outlineFallbackProduced = outlineFallback.produced;
                if (outlineFallback.htmlToOpen) {
                  nextFiles = await finalizeSlideOnlyDeckArtifacts(
                    await refreshProjectFiles(),
                    outlineFallback.htmlToOpen,
                  );
                  if (runIsVisible()) {
                    maybeArmTeamverPublishMenuAfterRunSuccess(project.id, outlineFallback.htmlToOpen);
                    requestOpenFile(outlineFallback.htmlToOpen);
                  }
                }
              }

              if (emergencyRecovered) {
                const emergencyNotice = formatEmergencyDeckFallbackNotice();
                updateAssistant((prev) => ({
                  ...appendWarningStatusEvent(
                    clearDurableDeliverableErrorsAfterRecovery(prev),
                    emergencyNotice,
                    EMERGENCY_DECK_FALLBACK_STATUS_CODE,
                  ),
                  producedFiles: emergencyProduced,
                  runStatus: resolveSucceededRunStatus(prev.runStatus),
                  resumable: false,
                  endedAt: prev.endedAt ?? endedAt,
                }));
                updateConversationLatestRun('succeeded', endedAt);
              } else if (outlineFallbackRecovered) {
                // Outline-only fallback: mark the run as SUCCEEDED (never
                // "실패") with a warning notice + resumable retry, so the
                // user sees a saved deck instead of a hard failure card.
                // Keep `resumable: true` so the failed-run retry dock still
                // renders and users can regenerate a full deck.
                const outlineNotice = formatOutlineDeckFallbackNotice();
                updateAssistant((prev) => ({
                  ...appendWarningStatusEvent(
                    clearDurableDeliverableErrorsAfterRecovery(prev),
                    outlineNotice,
                    OUTLINE_DECK_FALLBACK_STATUS_CODE,
                  ),
                  producedFiles: outlineFallbackProduced,
                  runStatus: resolveSucceededRunStatus(prev.runStatus),
                  resumable: true,
                  endedAt: prev.endedAt ?? endedAt,
                }));
                updateConversationLatestRun('succeeded', endedAt);
              } else {
              // Decide whether to fire the capped automatic continue BEFORE
              // we finalize the assistant card, so the status event we append
              // matches the branch we actually take. Both branches leave the
              // run as failed+resumable — the manual "다시 시도" affordance
              // stays available regardless — but the visible status label
              // changes (auto-continue notice vs. plain deliverable-missing
              // error).
              // When auto-continue is armed, suppress the top-of-page
              // "결과물이 생성되지 않았습니다" banner — it contradicts the
              // assistant-card "이어쓰기 시도 중" notice and trains the user
              // to think a manual retry is required. Cap-exhausted / infra
              // failures still surface the deliverable error.
              if (runIsVisible() && !canAutoContinue) setError(deliverableError);
              if (canAutoContinue) {
                conversationAutoContinueCountRef.current.set(
                  runConversationId,
                  autoContinueCount + 1,
                );
                const autoContinueNotice = formatAutoContinueIncompleteOutputNotice();
                // Durable incomplete_output under the transient notice so a
                // hard reload can rebuild Retry after AUTO_CONTINUE is no
                // longer "pending" in this session.
                updateAssistant((prev) => ({
                  ...attachAutoContinueIncompleteOutputNotice(
                    prev,
                    autoContinueNotice,
                    deliverableError,
                    deliverableErrorCode,
                  ),
                  producedFiles: produced,
                  endedAt: prev.endedAt ?? endedAt,
                }));
              } else {
                updateAssistant((prev) => ({
                  ...attachPersistedChatError(prev, deliverableError, deliverableErrorCode),
                  producedFiles: produced,
                  runStatus: 'failed',
                  resumable: true,
                  endedAt: prev.endedAt ?? endedAt,
                }));
              }
              updateConversationLatestRun('failed', endedAt);
              if (canAutoContinue) {
                // Fire the automatic continue after the failed-assistant
                // row commits. Without this delay, handleSend samples
                // `currentConversationHasActiveRun` while the message still
                // looks in-flight and silently QUEUES the continue (burning
                // a retry slot). 600ms is conservative given the notice paint.
                if (autoContinueTimerRef.current !== null) {
                  window.clearTimeout(autoContinueTimerRef.current);
                }
                const scheduledProjectId = project.id;
                const scheduledConversationId = runConversationId;
                pendingAutoContinueConversationIdRef.current = scheduledConversationId;
                setAutoContinuePending(true);
                autoContinueTimerRef.current = window.setTimeout(() => {
                  autoContinueTimerRef.current = null;
                  pendingAutoContinueConversationIdRef.current = null;
                  setAutoContinuePending(false);
                  // Abort if the user switched projects/conversations — otherwise
                  // a late timer from project A would inject the recovery prompt
                  // into project B's brand-new chat.
                  if (project.id !== scheduledProjectId) {
                    rollbackAutoContinueCount(
                      conversationAutoContinueCountRef.current,
                      scheduledConversationId,
                    );
                    return;
                  }
                  const conversationStillActive =
                    messagesConversationIdRef.current === scheduledConversationId;
                  if (!conversationStillActive) {
                    rollbackAutoContinueCount(
                      conversationAutoContinueCountRef.current,
                      scheduledConversationId,
                    );
                    return;
                  }
                  // Drop phantom BYOK recovery "streaming" so React-state
                  // busy does not queue this send. Real local streams keep
                  // abortRef and are blocked below.
                  if (!abortRef.current) {
                    if (apiBackgroundRecoveryRef.current) {
                      apiBackgroundRecoveryRef.current = false;
                      clearApiBackgroundRecoveryBanner();
                    }
                    if (streamingConversationIdRef.current === scheduledConversationId) {
                      clearStreamingMarker(scheduledConversationId);
                    }
                  }
                  const liveStreamBlocking = isLiveLocalStreamBlockingAutoContinue({
                    abortController: abortRef.current,
                    streamingConversationId: streamingConversationIdRef.current,
                    targetConversationId: scheduledConversationId,
                  });
                  const sendNow = handleSendRef.current;
                  if (liveStreamBlocking || !sendNow) {
                    rollbackAutoContinueCount(
                      conversationAutoContinueCountRef.current,
                      scheduledConversationId,
                    );
                    return;
                  }
                  const attempt =
                    conversationAutoContinueCountRef.current.get(runConversationId) ?? 1;
                  // Prefer the recovered best-so-far artifact when it exists;
                  // otherwise fall back to the (potentially incomplete) live
                  // parsedArtifact so the auto-continue prompt can echo the
                  // partial HTML for the model to complete instead of writing
                  // from scratch.
                  const partialHtmlForAutoContinue =
                    (bestArtifactSoFar?.html && isUsableDeckHtmlArtifact(bestArtifactSoFar.html)
                      ? bestArtifactSoFar.html
                      : parsedArtifact?.html)
                    ?? liveHtml
                    ?? null;
                  const autoContinueMessages = retryTarget
                    ? [...historyBase, latestAssistantMsg]
                    : [...historyBase, userMsg, latestAssistantMsg];
                  const originatingUserMsg = retryTarget?.userMsg ?? userMsg;
                  const autoContinueCommentAttachments = hydrateQueryContextCommentAttachments(
                    terminalAutoContinueCommentAttachments,
                    visibleCommentEditInstruction(originatingUserMsg.content),
                  );
                  const scopedCommentContext =
                    autoContinueCommentAttachments.length > 0
                      ? renderCommentAttachmentContext(autoContinueCommentAttachments, {
                          includeQueryComments: true,
                        })
                      : null;
                  const scopedUserInstruction = stripUserVisibleUserMessageText(
                    (retryTarget?.userMsg ?? userMsg).content,
                  ).trim();
                  const concretePatchTemplate =
                    autoContinueCommentAttachments.length > 0
                      ? buildConcretePatchTemplatesForCommentAttachments(autoContinueCommentAttachments)
                      : null;
                  const scopedFailureReason =
                    terminalPersistResult?.kind === 'skipped-incomplete'
                    || terminalPersistResult?.kind === 'scope-rejected'
                      ? terminalPersistResult.reason ?? null
                      : null;
                  const autoContinueVisualFlags = visualAnnotationAutoContinueFlags(
                    autoContinueCommentAttachments,
                  );
                  const autoContinuePrompt = resolveAutoContinuePrompt({
                    commentAttachmentCount: autoContinueCommentAttachments.length,
                    visualMarkOnly: autoContinueVisualFlags.visualMarkOnly,
                    visualAnnotationEdit: autoContinueVisualFlags.visualAnnotationEdit,
                    scopedCommentEditFailureReason: scopedFailureReason,
                    scopedCommentContext,
                    scopedUserInstruction,
                    concretePatchTemplate,
                    incompleteOutput: {
                      attempt,
                      truncatedByMaxTokens: runStopReason === 'max_tokens',
                      referenceFiles: collectSlideReferencePathsFromMessages(autoContinueMessages),
                      slideCountHint: extractRequestedSlideCountHintFromMessages(autoContinueMessages),
                      existingDeckPath: resolvePrimaryDeckFilePath(
                        projectFiles,
                        project.metadata?.entryFile,
                      ),
                      ...extractAutoContinueContextFromAssistant(latestAssistantMsg, {
                        partialHtml: partialHtmlForAutoContinue,
                        planOutline: rawFinalText,
                      }),
                    },
                  });
                  // Preserve comment scope + image/deck attachments on retry.
                  // Without file attachments, image-embed contracts vanish and
                  // the model regenerates a short greenfield deck (8→2).
                  const started = sendNow(
                    autoContinuePrompt,
                    chatAttachmentsForAutoContinueImageEmbed(originatingUserMsg, projectFilesRef.current.map((file) => String(file.path || file.name || "").trim()).filter(Boolean)),
                    autoContinueCommentAttachments,
                    { entryFrom: AUTO_CONTINUE_ENTRY_FROM },
                  );
                  void Promise.resolve(started).then((ok) => {
                    if (ok === false) {
                      rollbackAutoContinueCount(
                        conversationAutoContinueCountRef.current,
                        scheduledConversationId,
                      );
                    }
                  });
                }, 600);
              }
              }
            } else {
              updateAssistant((prev) => ({
                ...prev,
                producedFiles: produced,
                runStatus: resolveSucceededRunStatus(prev.runStatus),
                endedAt: prev.endedAt ?? endedAt,
              }));
              updateConversationLatestRun(
                resolveSucceededRunStatus(latestAssistantMsg.runStatus) ?? 'succeeded',
                endedAt,
              );
            }

            void saveMessage(project.id, runConversationId, latestAssistantMsg, {
              telemetryFinalized: true,
            });
            await auditDesignSystemWorkspaceAfterRun(assistantId);
            } finally {
              htmlAutoOpenFinalizeInProgressRef.current.delete(assistantId);
              const latestGeneration = isLatestTerminalAutoOpen();
              const noFinalizeInFlight = htmlAutoOpenFinalizeInProgressRef.current.size === 0;
              const conversationStillMarked =
                streamingConversationIdRef.current === runConversationId;
              // Superseded finalize passes can still own the only leaked streaming
              // marker when a newer generation bails before clearStreamingMarker.
              if (!latestGeneration && !(noFinalizeInFlight && conversationStillMarked)) {
                return;
              }
              runPersistTargetFileRef.current = null;
              runSkipDiscoveryBriefRef.current = false;
              runCommentAttachmentsRef.current = [];
              clearStreamingMarker(runConversationId);
              if (apiBackgroundRecoveryRef.current) {
                apiBackgroundRecoveryRef.current = false;
                clearApiBackgroundRecoveryBanner();
              }
              if (runIsVisible()) {
                setArtifact(null);
              }
            }
          })();
        };
        if (delayMs > 0) {
          if (htmlAutoOpenTimerRef.current !== null) {
            window.clearTimeout(htmlAutoOpenTimerRef.current);
          }
          htmlAutoOpenTimerRef.current = window.setTimeout(() => {
            htmlAutoOpenTimerRef.current = null;
            execute();
          }, delayMs);
        } else {
          execute();
        }
      };

      const updateAssistant = (updater: (prev: ChatMessage) => ChatMessage) => {
        latestAssistantMsg = updater(latestAssistantMsg);
        if (!runIsVisible()) return;
        setMessages((curr) =>
          curr.map((m) => {
            if (m.id !== assistantId) return m;
            return latestAssistantMsg;
          }),
        );
      };
      liveAssistantMutatorRef.current = {
        assistantId,
        apply: (updater) => {
          latestAssistantMsg = updater(latestAssistantMsg);
        },
      };
      const assistantPersist = createMessagePersistScheduler(
        (options) => {
          void saveMessage(project.id, runConversationId, latestAssistantMsg, options);
        },
        resolveMessagePersistThrottleMs(),
      );
      const persistAssistantSoon = () => {
        assistantPersist.persistSoon();
      };
      const persistAssistantNowKeepalive = () => {
        assistantPersist.persistNow({ keepalive: true });
      };
      const pushEvent = (ev: AgentEvent) => {
        textBuffer.flush();
        updateAssistant((prev) => ({ ...prev, events: [...(prev.events ?? []), ev] }));
        if (ev.kind === 'live_artifact') {
          if (!runIsVisible()) {
            persistAssistantSoon();
            return;
          }
          setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, ev));
          void refreshLiveArtifacts().then(() => {
            if (ev.action !== 'deleted') requestOpenFile(liveArtifactTabId(ev.artifactId));
          });
          onProjectsRefresh();
          return;
        }
        if (ev.kind === 'live_artifact_refresh') {
          if (!runIsVisible()) {
            persistAssistantSoon();
            return;
          }
          setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, ev));
          void refreshLiveArtifacts();
          onProjectsRefresh();
          return;
        }
        if (ev.kind === 'status' && ev.label === 'error') {
          assistantPersist.persistNow();
        } else {
          persistAssistantSoon();
        }
        // Track Write tool invocations so we can auto-open the destination
        // file the moment the agent finishes writing it. The file-creating
        // tools we care about: Write (new file), Edit (existing file —
        // surfacing the freshly-modified file is also useful).
        if (ev.kind === 'tool_use') {
          // The authoritative input has landed; drop the live partial so the
          // card renders from the parsed `tool_use.input` instead of the
          // mid-token JSON fragment.
          setLiveToolInput((prev) => {
            if (!(ev.id in prev)) return prev;
            const next = { ...prev };
            delete next[ev.id];
            return next;
          });
        }
        if (ev.kind === 'tool_use' && ((ev.name === 'Write' || ev.name === 'write') || ev.name === 'Edit')) {
          const input = ev.input as { file_path?: unknown; filePath?: unknown } | null;
          const filePath = input?.file_path ?? input?.filePath;
          if (typeof filePath === 'string' && filePath.length > 0) {
            // Preserve the full path so decideAutoOpenAfterWrite can do a
            // path-suffix match against the project's relative file paths.
            // Reducing to a basename here would lose the segment alignment
            // we need to disambiguate same-basename collisions across the
            // project tree and outside it.
            pendingWritesRef.current.set(ev.id, filePath);
          }
        }
        if (ev.kind === 'tool_result') {
          const filePath = pendingWritesRef.current.get(ev.toolUseId);
          if (filePath) {
            pendingWritesRef.current.delete(ev.toolUseId);
            if (!ev.isError) {
              // Refresh first so FileWorkspace's file list (and the tab
              // body) sees the new content before we ask it to focus.
              // Only auto-open if the file actually landed in the project's
              // file list — otherwise an out-of-project Write (e.g. an
              // upstream repo edit) would spawn a permanent placeholder tab.
              void refreshProjectFiles().then(async (nextFiles) => {
                // Canvas→Slide: delete root HTML that only copies a refs/
                // source as soon as Write lands — do not wait for deck.html.
                if (slideOnlyMvp) {
                  const deletedLeak = await deleteRootHtmlReferenceLeakIfPresent({
                    projectId: project.id,
                    files: nextFiles,
                    slideOnlyMvp: true,
                    writtenPath: filePath,
                    deleteFile: deleteProjectFile,
                  });
                  if (deletedLeak) {
                    removeProjectFilesLocally([deletedLeak]);
                    nextFiles = await refreshProjectFiles();
                  } else {
                    const writtenRel = nextFiles.find((file) => {
                      const rel = (file.path ?? file.name).replace(/\\/g, '/');
                      return (
                        filePath === rel
                        || (filePath.length > rel.length && filePath.endsWith(`/${rel}`))
                      );
                    });
                    const deckRel = writtenRel
                      ? (writtenRel.path?.trim() || writtenRel.name)
                      : null;
                    if (deckRel && isCanonicalDeckProjectPath(deckRel)) {
                      nextFiles = await finalizeSlideOnlyDeckArtifacts(nextFiles, deckRel);
                    }
                  }
                }
                // A .jsx/.tsx loaded by a sibling HTML entry is a module of a
                // multi-file React prototype, not a standalone page — don't
                // strand the user on a dead-end preview tab. Issue #2744.
                const moduleFileNames = /\.(jsx|tsx)$/i.test(filePath)
                  ? await collectReferencedJsxNames(nextFiles, readProjectHtml)
                  : undefined;
                const decision = decideAutoOpenAfterWrite(filePath, nextFiles, {
                  moduleFileNames,
                  branding: { slideOnlyMvp },
                });
                if (decision.shouldOpen && decision.fileName) {
                  if (runIsVisible()) requestOpenFile(decision.fileName);
                }
              });
            }
          }
        }
      };

      const applyContentDelta = (delta: string) => {
        for (const ev of parser.feed(delta)) {
          if (ev.type === 'artifact:start') {
            liveHtml = '';
            parsedArtifact = {
              identifier: ev.identifier,
              artifactType: normalizeSlideOnlyArtifactContractType(ev.artifactType, slideOnlyMvp),
              title: ev.title,
              html: '',
            };
            if (runIsVisible()) setArtifact(parsedArtifact);
          } else if (ev.type === 'artifact:chunk') {
            liveHtml += ev.delta;
            parsedArtifact = parsedArtifact
              ? { ...parsedArtifact, html: liveHtml }
              : {
                  identifier: ev.identifier,
                  title: '',
                  html: liveHtml,
                };
            if (runIsVisible()) {
              setArtifact((prev) =>
                prev
                  ? { ...prev, html: liveHtml }
                  : {
                      identifier: ev.identifier,
                      title: '',
                      html: liveHtml,
                    },
              );
            }
          } else if (ev.type === 'artifact:end') {
            parsedArtifact = parsedArtifact
              ? { ...parsedArtifact, html: ev.fullContent }
              : {
                  identifier: ev.identifier,
                  title: '',
                  html: ev.fullContent,
                };
            if (runIsVisible()) {
              setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
            }
            // Track the best completed artifact from this turn. When the
            // model emits an empty-shell followup after a full deck, or a
            // full deck after a plan sketch, we must not silently persist
            // the smaller/broken one. Preference: the artifact whose body
            // passes the incomplete-shell gate; among those, the longer wins.
            try {
              const candidate = parsedArtifact;
              const salvagedHtml = candidate?.html
                ? salvageTruncatedHtmlDocument(candidate.html)
                : null;
              const effective = salvagedHtml && candidate
                ? { ...candidate, html: salvagedHtml }
                : candidate;
              // Soft-salvaged decks count as usable even when the stricter
              // incomplete-shell ratio still flags empty trailing placeholders.
              const candidateOk = isUsableDeckHtmlArtifact(effective?.html)
                || Boolean(salvagedHtml);
              const bestOk = isUsableDeckHtmlArtifact(bestArtifactSoFar?.html);
              if (candidateOk && (!bestOk || (effective?.html?.length ?? 0) > (bestArtifactSoFar?.html?.length ?? 0))) {
                bestArtifactSoFar = effective;
              } else if (!bestArtifactSoFar && effective) {
                bestArtifactSoFar = effective;
              } else if (!bestArtifactSoFar && candidate) {
                bestArtifactSoFar = candidate;
              }
            } catch { /* defensive — never throw from stream handling */ }
          }
        }
      };

      const rewriteLiveContent = (fullContent: string) => {
        parser = createArtifactParser();
        liveHtml = '';
        parsedArtifact = null;
        bestArtifactSoFar = null;
        applyContentDelta(fullContent);
      };

      const textBuffer = createBufferedTextUpdates({
        updateMessage: updateAssistant,
        persistSoon: persistAssistantSoon,
        flushAndPersistNow: persistAssistantNowKeepalive,
        onContentDelta: applyContentDelta,
        onContentRewrite: rewriteLiveContent,
        stripCodeFences: hideAssistantThinkingDetails && !slideOnlyMvp,
      });
      sendTextBufferRef.current = textBuffer;
      const releaseOwnTextBuffer = () => {
        textBuffer.cancel();
        if (sendTextBufferRef.current === textBuffer) {
          sendTextBufferRef.current = null;
        }
      };

      const controller = new AbortController();
      const cancelController = new AbortController();
      let ownedDaemonRunId: string | null = null;
      const releaseOwnedDaemonRun = () => {
        if (!ownedDaemonRunId) return;
        releaseLocallyConsumedDaemonRun(ownedDaemonRunId);
        if (primaryOwnedDaemonRunIdRef.current === ownedDaemonRunId) {
          primaryOwnedDaemonRunIdRef.current = null;
        }
        ownedDaemonRunId = null;
      };
      abortRef.current = controller;
      cancelRef.current = cancelController;
      const handlers = {
        onDelta: (delta: string) => {
          streamedText += delta;
          textBuffer.appendContent(delta);
        },
        onAgentEvent: (ev: AgentEvent) => {
          if (ev.kind === 'text') textBuffer.appendTextEvent(ev.text);
          else pushEvent(ev);
        },
        onToolInputDelta: (id: string, name: string, delta: string) => {
          if (!runIsVisible()) return;
          setLiveToolInput((prev) => ({
            ...prev,
            [id]: {
              name,
              text: (prev[id]?.text ?? '') + delta,
              // Pin the tool's stream position the first time we see it: the
              // count of events already on the message is everything the model
              // emitted before the tool call (its preamble). Buffered text
              // (appendTextEvent) isn't flushed into `events` until the next
              // frame, so add 1 for any still-pending preamble chunk — it will
              // commit as one text event just before this tool's position.
              seq:
                prev[id]?.seq ??
                ((latestAssistantMsg.events?.length ?? 0) + (textBuffer.hasPendingText() ? 1 : 0)),
            },
          }));
        },
        onDone: (fullText = '') => {
          // The daemon delivers onDone even for a canceled run, so a run
          // superseded by a "send now" interrupt can still land here and must
          // not apply its completion side effects over the replacement. A run
          // may finalize unless it was tagged superseded at interrupt time
          // (recorded before handleStop cleared the refs), which is reliable
          // even before the replacement send attaches — unlike abortRef, whose
          // terminal onRunStatus / handleStop churn make it ambiguous here.
          const runMayFinalize =
            !supersededRunsRef.current.has(controller);
          if (!runMayFinalize) {
            releaseOwnTextBuffer();
            releaseOwnedDaemonRun();
            return;
          }
          textBuffer.flush();
          releaseOwnTextBuffer();
          for (const ev of parser.flush()) {
            if (ev.type === 'artifact:end') {
              parsedArtifact = parsedArtifact
                ? { ...parsedArtifact, html: ev.fullContent }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: ev.fullContent,
                  };
              if (runIsVisible()) {
                setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
              }
              // Same best-artifact tracking as mid-stream artifact:end —
              // unclosed blocks only land here via flush(), and without
              // this the trailing truncated deck is invisible to
              // resolveTerminalArtifactToPersist's bestArtifactSoFar fallback.
              try {
                const candidate = parsedArtifact;
                const salvagedHtml = candidate?.html
                  ? salvageTruncatedHtmlDocument(candidate.html)
                  : null;
                const effective = salvagedHtml && candidate
                  ? { ...candidate, html: salvagedHtml }
                  : candidate;
                const candidateOk = isUsableDeckHtmlArtifact(effective?.html)
                  || Boolean(salvagedHtml);
                const bestOk = isUsableDeckHtmlArtifact(bestArtifactSoFar?.html);
                if (candidateOk && (!bestOk || (effective?.html?.length ?? 0) > (bestArtifactSoFar?.html?.length ?? 0))) {
                  bestArtifactSoFar = effective;
                } else if (!bestArtifactSoFar && effective) {
                  bestArtifactSoFar = effective;
                } else if (!bestArtifactSoFar && candidate) {
                  bestArtifactSoFar = candidate;
                }
              } catch { /* defensive — never throw from stream handling */ }
            }
          }
          const emptyApiResponse =
            config.mode === 'api' &&
            !fullText.trim() &&
            !streamedText.trim() &&
            !liveHtml.trim();
          if (emptyApiResponse) {
            const endedAt = Date.now();
            const diagnostic = t('assistant.emptyResponseMessage');
            updateAssistant(
              (prev) => ({
                ...prev,
                endedAt,
                runStatus: 'failed',
                events: [
                  ...(prev.events ?? []),
                  { kind: 'status', label: 'empty_response', detail: config.model },
                  { kind: 'text', text: diagnostic },
                ],
              }),
            );
            void saveMessage(project.id, runConversationId, latestAssistantMsg, {
              telemetryFinalized: true,
            });
            if (runCommentAttachments.length > 0) {
              void patchAttachedStatuses(runCommentAttachments, 'failed');
            }
            const ownsCurrentRun = clearCurrentRunStreamingMarker(
              runConversationId,
              controller,
              cancelController,
            );
            if (ownsCurrentRun) updateConversationLatestRun('failed', endedAt);
            runPersistTargetFileRef.current = null;
            runSkipDiscoveryBriefRef.current = false;
            runCommentAttachmentsRef.current = [];
            void refreshProjectFiles();
            onProjectsRefresh();
            releaseOwnedDaemonRun();
            return;
          }
          if (runCommentAttachments.length > 0) {
            void patchAttachedStatuses(runCommentAttachments, 'needs_review');
          }
          const ownsCurrentRun = clearCurrentRunStreamingMarker(
            runConversationId,
            controller,
            cancelController,
          );
          if (ownsCurrentRun) {
            // Defer endedAt / succeeded / failed to scheduleStreamRunHtmlAutoOpen
            // so slide-only runs never flash "완료됨" before deliverable checks.
          }
          if (config.mode === 'api') {
            dispatchTeamverBackgroundChat({
              projectId: project.id,
              conversationId: runConversationId,
              assistantMessageId: assistantId,
              active: false,
            });
          }
          scheduleStreamRunHtmlAutoOpen(fullText);
          onProjectsRefresh();
          releaseOwnedDaemonRun();
        },
        onError: (err: Error) => {
          const endedAt = Date.now();
          const errorCode = extractProjectRunErrorCode(err);
          const resumable = (err as Error & { resumable?: boolean }).resumable === true;
          // A run superseded by a "send now" interrupt can still surface a
          // late disconnect error (e.g. a canceled stream that lost its
          // terminal SSE). It must not paint a global failure banner or
          // re-finalize its already-canceled assistant message once it was
          // tagged superseded. See the onDone above for the ownership rationale.
          const runMayFinalize =
            !supersededRunsRef.current.has(controller);
          textBuffer.flush();
          releaseOwnTextBuffer();
          let finalizedAssistant = latestAssistantMsg;
          if (runMayFinalize) {
            const detail = formatProjectRunErrorForUser(err);
            if (runIsVisible()) setError(detail);
            updateAssistant((prev) => {
              const withError = attachPersistedChatError(prev, detail, errorCode);
              finalizedAssistant = {
                ...withError,
                endedAt: withError.endedAt ?? endedAt,
                runStatus: config.mode === 'api' || prev.runId || isActiveRunStatus(prev.runStatus)
                  ? 'failed'
                  : withError.runStatus,
                resumable,
              };
              return finalizedAssistant;
            });
            if (runCommentAttachments.length > 0) {
              void patchAttachedStatuses(runCommentAttachments, 'failed');
            }
          }
          const ownsCurrentRun = clearCurrentRunStreamingMarker(
            runConversationId,
            controller,
            cancelController,
          );
          if (ownsCurrentRun) updateConversationLatestRun('failed', endedAt);
          runPersistTargetFileRef.current = null;
          runSkipDiscoveryBriefRef.current = false;
          runCommentAttachmentsRef.current = [];
          void saveMessage(project.id, runConversationId, finalizedAssistant, {
            telemetryFinalized: true,
          });
          if (config.mode === 'api' && runMayFinalize) {
            dispatchTeamverBackgroundChat({
              projectId: project.id,
              conversationId: runConversationId,
              assistantMessageId: assistantId,
              active: false,
            });
          }
          void refreshProjectFiles();
          releaseOwnedDaemonRun();
        },
      };

      if (config.mode === 'daemon') {
        if (!config.agentId) {
          handlers.onError(new Error('Pick a local agent first (top bar).'));
          return true;
        }
        const choice = effectiveSelectedAgentChoice;
        // v2 analytics: when the active project is a DS workspace
        // (created by `prepareCreatedDesignSystemProject`, identifiable
        // by `metadata.importedFrom === 'design-system'`), every run
        // started from this composer is a DS-variant run. Pass
        // analyticsHints so the daemon emits run_created /
        // run_finished under `page_name=design_system_project`,
        // `area=design_system_generation`, `project_kind=design_system`.
        // The first-ever message into a DS workspace is the auto-sent
        // generation kickoff (entry_from=`onboarding_design_system` is
        // the doc's name for "DS create flow handed off to the agent");
        // subsequent messages are review-driven regenerations
        // (`regenerate_from_review`). Use `messages.length === 0` —
        // truer than autoSendFirstMessageRef which races StrictMode
        // remounts + sessionStorage clears.
        const isDesignSystemWorkspaceProject =
          project.metadata?.importedFrom === 'design-system';
        const dsEntryFrom: 'onboarding_design_system' | 'regenerate_from_review' =
          messages.length === 0
            ? 'onboarding_design_system'
            : 'regenerate_from_review';
        const dsAnalyticsHints = isDesignSystemWorkspaceProject
          ? {
              entryFrom: dsEntryFrom,
              projectKind: 'design_system' as const,
              designSystemRunContext: {
                origin: 'manual_create' as const,
              },
            }
          : undefined;
        // A caller-supplied entry_from (e.g. 'resume_continue' from the
        // resumable-failure Continue action) overrides the DS default so the
        // run is attributed to the affordance that started it.
        const runAnalyticsHints =
          meta?.entryFrom
            ? { ...(dsAnalyticsHints ?? {}), entryFrom: meta.entryFrom }
            : dsAnalyticsHints;
        void streamViaDaemon({
          agentId: config.agentId,
          history: nextHistory,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          handlers,
          projectId: project.id,
          conversationId: runConversationId,
          assistantMessageId: assistantId,
          clientRequestId: randomUUID(),
          skillId: project.skillId ?? null,
          skillIds: Array.isArray(meta?.skillIds) ? meta.skillIds : [],
          context: runContext,
          pluginInputs: meta?.pluginInputs,
          designSystemId: meta?.designSystemId ?? project.designSystemId ?? null,
          selectedDeckTemplateId: meta?.selectedDeckTemplateId ?? null,
          selectedDeckTemplateTitle: meta?.selectedDeckTemplateTitle ?? null,
          attachments: runAttachments.map((a) => a.path),
          commentAttachments: runCommentAttachments,
          sessionMode: runSessionMode,
          appliedPluginSnapshotId:
            meta?.appliedPluginSnapshotId ?? meta?.appliedPluginSnapshot?.snapshotId ?? null,
          research: meta?.research,
          mediaExecution: mediaExecutionPolicyForProjectMetadata(project.metadata, {
            slideOnlyMvp,
          }),
          model: choice?.model ?? null,
          reasoning: choice?.reasoning ?? null,
          locale,
          ...(runAnalyticsHints ? { analyticsHints: runAnalyticsHints } : {}),
          onRunCreated: (runId) => {
            ownedDaemonRunId = runId;
            primaryOwnedDaemonRunIdRef.current = runId;
            locallyConsumedDaemonRunIds.add(runId);
            const pinnedAssistant = {
              ...latestAssistantMsg,
              runId,
              runStatus: 'queued' as const,
            };
            latestAssistantMsg = pinnedAssistant;
            // The view may already be on a different project/conversation;
            // pin the daemon run to the original row so returning can reattach.
            void saveMessage(project.id, runConversationId, pinnedAssistant);
            updateMessageById(assistantId, (prev) => ({ ...prev, runId, runStatus: 'queued' }));
          },
          onRunStatus: (runStatus) => {
            const endedAt = isTerminalRunStatus(runStatus) ? Date.now() : undefined;
            const runMayFinalize =
              !supersededRunsRef.current.has(controller);
            const deferredTerminalSuccess =
              slideOnlyMvp && runStatus === 'succeeded';
            updateAssistant(
              (prev) => ({
                ...prev,
                runStatus: deferredTerminalSuccess ? 'running' : runStatus,
                endedAt: endedAt === undefined || deferredTerminalSuccess
                  ? prev.endedAt
                  : prev.endedAt ?? endedAt,
              }),
            );
            if (!runMayFinalize) return;
            if (runStatus === 'canceled') {
              textBuffer.flush();
              textBuffer.finalizeForHistoryDisplay?.();
            }
            if (isTerminalRunStatus(runStatus) && !deferredTerminalSuccess) {
              if (runStatus === 'failed') {
                // Prefer onError's attachPersistedChatError + save to land first.
                // A premature persistNow of failed-without-error races soft refresh
                // and hard-reload windows before the status:error event exists.
                assistantPersist.persistSoon();
              } else {
                assistantPersist.persistNow(
                  runStatus === 'canceled' ? { telemetryFinalized: true } : undefined,
                );
              }
            } else {
              assistantPersist.persistSoon();
            }
            if (!deferredTerminalSuccess) {
              updateConversationLatestRun(runStatus, endedAt);
            }
            if (isTerminalRunStatus(runStatus)) {
              clearCurrentRunStreamingMarker(runConversationId, controller, cancelController);
              if (runStatus === 'failed') {
                window.setTimeout(() => {
                  scheduleConversationMessageRefresh(runConversationId);
                }, 500);
              } else {
                scheduleConversationMessageRefresh(runConversationId);
              }
            }
          },
          onRunEventId: (lastRunEventId) => {
            updateAssistant((prev) => ({ ...prev, lastRunEventId }));
            persistAssistantSoon();
          },
        }).finally(releaseOwnedDaemonRun);
        return true;
      } else {
        // Mirror the daemon chat-route memory hook for BYOK chats. The
        // CLI path runs `extractFromMessage` BEFORE composing the prompt
        // (so an explicit "remember: X" / "我是 X" marker in this turn's
        // user message lands in memory in time for this turn's system
        // prompt), then queues `extractWithLLM` on child close (so the
        // small-model pass picks up implicit facts from the full
        // user+assistant exchange). BYOK chats never hit that route, so
        // we replicate both phases here against `/api/memory/extract`.
        // Without this, the Memory tab / model picker is a no-op for
        // BYOK users even though the UI saves model + index + entries
        // for that mode.
        const userText = stripUserVisibleUserMessageText(prompt).trim();
        // Snapshot the live BYOK chat config so the daemon can run
        // "Same as chat" memory extraction against the same vendor /
        // key / baseUrl / apiVersion the user is chatting with. The
        // daemon never persists BYOK creds itself, so this per-call
        // signal is the only way `pickProvider()` can avoid falling
        // through to env / media-config (which is wrong for BYOK)
        // when no explicit memory model override is set. The picker
        // re-syncs an *explicit* override when chat config drifts;
        // this snapshot covers the implicit "Same as chat" default.
        const byokChatProvider =
          config.apiProtocol && hasChatApiCredentials(config)
            ? {
                provider: config.apiProtocol,
                ...(shouldUseManagedProxyApiKey(config)
                  ? { useManagedApiKey: true }
                  : { apiKey: config.apiKey }),
                baseUrl: config.baseUrl,
                apiVersion:
                  config.apiProtocol === 'azure'
                    ? config.apiVersion ?? ''
                    : '',
              }
            : undefined;
        if (userText.length > 0) {
          try {
            const memoryResponse = await fetchTeamverDaemon('/api/memory/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              teamverProjectId: project.id,
              skipTeamverWorkspaceHeaders: true,
              skipEmbedAuthRecovery: true,
              body: JSON.stringify({
                userMessage: userText,
                projectId: project.id,
                conversationId: runConversationId,
                chatProvider: byokChatProvider,
              }),
            });
            if (memoryResponse.status === 401) {
              devLog.debug('[teamver] pre-turn memory extraction skipped after daemon 401');
            }
          } catch {
            // Best-effort: memory extraction must never block the
            // chat. The daemon's SSE bus will catch up the Memory tab
            // on the next event.
          }
        }
        const effectiveDesignSystemId = meta?.designSystemId ?? project.designSystemId ?? null;
        const effectiveSkillId = resolveDeckTemplateSkillId(project.metadata, meta);
        const selectedDeckTemplateForTurn = selectedDeckTemplateMetadata(project.metadata, meta);
        let pluginBlock: string | undefined;
        let appliedSnapshotPluginId = meta?.appliedPluginSnapshot?.pluginId ?? null;
        const pluginBlockRole =
          selectedDeckTemplateForTurn && slideOnlyMvp
            ? ('scenario-only' as const)
            : ('primary' as const);
        if (meta?.appliedPluginSnapshot) {
          pluginBlock = renderPluginBlock(meta.appliedPluginSnapshot, { role: pluginBlockRole });
        } else if (project.appliedPluginSnapshotId) {
          const snap = await fetchAppliedPluginSnapshot(project.appliedPluginSnapshotId);
          appliedSnapshotPluginId = snap?.pluginId ?? null;
          if (snap) pluginBlock = renderPluginBlock(snap, { role: pluginBlockRole });
        }
        const pluginIdForLocalSkill = resolveScenarioPluginIdForLocalSkill(
          project.metadata,
          meta,
          appliedSnapshotPluginId,
        );
        const systemPrompt = await composedSystemPrompt(
          runSessionMode,
          effectiveDesignSystemId,
          effectiveSkillId,
          pluginIdForLocalSkill,
          pluginBlock ?? null,
          {
            ...(meta?.selectedDeckTemplateId || selectedDeckTemplateForTurn
              ? {
                  selectedDeckTemplateId:
                    meta?.selectedDeckTemplateId || selectedDeckTemplateForTurn?.id,
                  selectedDeckTemplateTitle:
                    meta?.selectedDeckTemplateTitle || selectedDeckTemplateForTurn?.title,
                }
              : {}),
            ...(resolveSlideOnlySkipDiscoveryBrief({
              projectSkipDiscoveryBrief: project.metadata?.skipDiscoveryBrief === true,
              projectKind: project.metadata?.kind ?? null,
              selectedDeckTemplateId: selectedDeckTemplateForTurn?.id ?? null,
              runSkipDiscoveryBrief: meta?.skipDiscoveryBrief === true,
            })
              ? { skipDiscoveryBrief: true }
              : {}),
          },
          {
            includeCommentEditPatchRule: runCommentAttachments.length > 0,
            includeExistingDeckImageEditRule:
              autoAttachedDeckPath != null
              || imageAttachmentPathsForSlideEmbed(effectiveAttachments).length > 0,
          },
        );
        const webFetchContexts = await fetchApiWebFetchContexts(userMsg.content);
        const apiHistory = await historyWithApiAttachmentContext(
          historyWithApiWebFetchContext(
            historyWithCommentAttachmentContext(
              historyWithWorkspaceContext(nextHistory, userMsg.id, runContext),
            ),
            userMsg.id,
            webFetchContexts,
          ),
          userMsg.id,
          project.id,
          projectFiles,
          { omitNativeImageAttachments: usesAnthropicProxy(config) },
        );
        pushEvent({ kind: 'status', label: 'requesting', detail: config.model });
        let accumulatedAssistantText = '';
        const streamStartedAt = Date.now();
        runStopReason = undefined;
        void streamMessage(config, systemPrompt, apiHistory, controller.signal, {
          onDelta: (delta) => {
            accumulatedAssistantText += delta;
            handlers.onDelta(delta);
            handlers.onAgentEvent({ kind: 'text', text: delta });
          },
          onThinkingDelta: (delta) => {
            handlers.onAgentEvent({ kind: 'thinking', text: delta });
          },
          onUsage: (usage) => {
            if (usage.stopReason) runStopReason = usage.stopReason;
            pushEvent({
              kind: 'usage',
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              ...(usage.model ? { model: usage.model } : {}),
              ...(usage.cacheReadInputTokens != null && usage.cacheReadInputTokens > 0
                ? { cacheReadInputTokens: usage.cacheReadInputTokens }
                : {}),
              ...(usage.cacheCreationInputTokens != null && usage.cacheCreationInputTokens > 0
                ? { cacheCreationInputTokens: usage.cacheCreationInputTokens }
                : {}),
              ...(config.apiProtocol ? { apiProtocol: config.apiProtocol } : {}),
              latencyMs: Date.now() - streamStartedAt,
              ...(usage.stopReason ? { stopReason: usage.stopReason } : {}),
            });
          },
          onDone: () => {
            handlers.onDone(accumulatedAssistantText);
            const assistantText = stripAllClosedArtifacts(accumulatedAssistantText).trim();
            if (userText.length === 0 || assistantText.length === 0) return;
            void fetchTeamverDaemon('/api/memory/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              teamverProjectId: project.id,
              skipTeamverWorkspaceHeaders: true,
              skipEmbedAuthRecovery: true,
              body: JSON.stringify({
                userMessage: userText,
                assistantMessage: assistantText,
                projectId: project.id,
                conversationId: runConversationId,
                chatProvider: byokChatProvider,
              }),
            }).catch(() => {
              // Best-effort: see comment above on the pre-turn call.
            });
          },
          onError: handlers.onError,
        }, {
          projectId: project.id,
          conversationId: runConversationId,
          projectFileNames,
          // Daemon-side billing reconciliation (PR1 §3.6): the proxy stages
          // usage SSE frames keyed by this id so the terminal message PUT
          // can finalize Strategy-B billing even if the FE drops the PUT
          // (browser close / network hiccup) after receiving usage.
          assistantMessageId: assistantId,
          // SenseAudio BYOK chat reads this to pre-fill the tool param's
          // default model. Prefer the live composer override; fall back
          // to the Settings default when the composer dropdown is on
          // "use default". Other protocols ignore unknown body fields.
          byokImageModel:
            byokImageModelOverride || config.byokImageModel || byokImageModelOptionsPV[0]?.id,
          byokVideoModel:
            byokVideoModelOverride || config.byokVideoModel || byokVideoModelOptionsPV[0]?.id,
          byokSpeechModel:
            byokSpeechModelOverride || config.byokSpeechModel || byokSpeechModelOptionsPV[0]?.id,
          byokSpeechVoice: byokSpeechVoiceOverride || config.byokSpeechVoice,
          minOutputTokens: slideOnlyMvp ? TEAMVER_DECK_MIN_MAX_TOKENS : undefined,
        });
        return true;
      }
    },
    [
      attachedComments,
      activeConversationId,
      activeSessionMode,
      currentConversationBusy,
      embedSubmitDisabled,
      onEmbedSubmitBlocked,
      queueChatSendForCurrentConversation,
      messages,
      config,
      locale,
      agentsById,
      // Per-session BYOK image/video model overrides are read inside this
      // callback (see the streamMessage context below). Without them in the
      // deps, the dropdown updates its state + display but handleSend keeps a
      // stale closure and sends the previously selected model.
      byokImageModelOverride,
      byokVideoModelOverride,
      byokSpeechModelOverride,
      byokSpeechVoiceOverride,
      byokImageModelOptionsPV,
      byokVideoModelOptionsPV,
      byokSpeechModelOptionsPV,
      composedSystemPrompt,
      onTouchProject,
      project.id,
      project.name,
      projectFiles,
      projectFileNames,
      refreshProjectFiles,
      refreshLiveArtifacts,
      readProjectHtml,
      requestOpenFile,
      persistMessage,
      persistMessageById,
      auditDesignSystemWorkspaceAfterRun,
      patchAttachedStatuses,
      updateMessageById,
      markStreamingConversation,
      clearStreamingMarker,
      clearCurrentRunStreamingMarker,
      scheduleConversationMessageRefresh,
      onProjectsRefresh,
      onProjectChange,
      slideOnlyMvp,
      finalizeSlideOnlyDeckArtifacts,
    ],
  );

  // Keep a ref that always points at the latest `handleSend`. The
  // `scheduleStreamRunHtmlAutoOpen` helper lives inside `handleSend`'s
  // closure, so it can only reach the *current* `handleSend` via this ref —
  // referencing the callback directly would either capture the previous
  // render's copy (stale deps) or introduce a recursive `useCallback`
  // dependency. The `useLayoutEffect` sync runs before any paint that could
  // schedule an auto-continue, so the ref is fresh by the time the terminal
  // auto-open branch fires.
  const handleSendRef = useRef(handleSend);
  useLayoutEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // Cancel every in-flight run for the current conversation (the user's own
  // streaming turn plus any reattached runs), mark their assistant messages
  // canceled, and drop the streaming state. Defined here — ahead of the
  // queued-send handlers — because "send now" interrupts the active run to
  // make room for the prioritized send.
  const handleStop = useCallback(() => {
    const stoppedAt = Date.now();
    cancelSendTextBuffer(true);
    cancelReattachTextBuffers(true);
    if (config.mode === 'api' && (apiBackgroundRecoveryRef.current || !abortRef.current)) {
      // Only abort BYOK proxy streams that belong to the currently active
      // conversation. The daemon already tenant-scopes by workspace, but
      // without this filter Stop in conversation A would cancel a
      // background run in conversation B (same project, same workspace),
      // breaking the multi-conversation background-run policy.
      // Streams missing a conversationId (legacy or race) are skipped —
      // they'll drain naturally per the "page exit → background" policy.
      const conversationForStop = activeConversationId;
      void listActiveByokProxyStreams(project.id)
        .then((streams) => {
          for (const stream of streams) {
            if (!conversationForStop) continue;
            if (stream.conversationId !== conversationForStop) continue;
            requestProxyAbort(stream.streamId, {
              conversationId: conversationForStop,
            });
          }
        })
        .catch((err) => {
          devLog.warn('[teamver] explicit proxy stop active stream lookup failed', {
            projectId: project.id,
            conversationId: conversationForStop,
            error: err,
          });
        });
    }
    // BYOK proxy cancellation policy (PR1 §3.5): the explicit Stop
    // button is the ONLY abort path that should propagate to the
    // upstream LLM fetch on the daemon. We mark the abort reason so
    // `streamProxyEndpoint` can issue `POST /api/proxy/abort` for this
    // class of cancellation only. Page-exit / supersede paths abort
    // without a reason so the daemon lets the stream drain naturally
    // (background scratch sync-up still runs at run-end).
    cancelRef.current?.abort(EXPLICIT_PROXY_STOP_REASON);
    cancelRef.current = null;
    for (const controller of reattachCancelControllersRef.current.values()) {
      controller.abort(EXPLICIT_PROXY_STOP_REASON);
    }
    reattachCancelControllersRef.current.clear();
    abortRef.current?.abort(EXPLICIT_PROXY_STOP_REASON);
    abortRef.current = null;
    for (const controller of reattachControllersRef.current.values()) {
      controller.abort(EXPLICIT_PROXY_STOP_REASON);
    }
    reattachControllersRef.current.clear();
    clearApiBackgroundRecoveryBanner();
    apiBackgroundRecoveryRef.current = false;
    const stopConversationId = activeConversationId ?? streamingConversationIdRef.current;
    setMessages((curr) => {
      const sanitizeOnStop: SanitizeChatMessageOptions = {
        stripCodeFences: hideAssistantThinkingDetails && !slideOnlyMvp,
      };
      const { messages: next, finalized } = finalizeActiveAssistantMessagesOnStop(
        curr,
        stoppedAt,
        sanitizeOnStop,
      );
      const stoppedRows = finalized.length > 0
        ? finalized
        : curr.filter((message) => isStoppableAssistantMessage(message));
      for (const message of stoppedRows) {
        rememberUserStoppedAssistantTurn({
          runId: message.runId,
          assistantMessageId: message.id,
        });
      }
      if (config.mode === 'api' && stopConversationId) {
        for (const message of stoppedRows) {
          dispatchTeamverBackgroundChat({
            projectId: project.id,
            conversationId: stopConversationId,
            assistantMessageId: message.id,
            active: false,
          });
        }
      }
      for (const message of finalized) persistMessage(message, { telemetryFinalized: true });
      return next;
    });
    if (config.mode === 'daemon' || config.mode === 'api') {
      dispatchTeamverBackgroundRunInactive({ projectId: project.id });
    }
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
  }, [activeConversationId, cancelSendTextBuffer, cancelReattachTextBuffers, clearApiBackgroundRecoveryBanner, config.mode, hideAssistantThinkingDetails, persistMessage, project.id, slideOnlyMvp]);

  // Flip the deck preview to the slide a queued send's marked element lives on
  // the moment that send starts processing. No-op for plain prompts or marks
  // without a slide index; FileWorkspace/FileViewer ignore it unless the named
  // file is the open deck.
  const armSlideNavForQueuedSend = useCallback((item: QueuedChatSend) => {
    // Screenshot-only visuals need an HTML deck fallback. Prefer entryFile
    // (canonical deck) over an active non-HTML / wrong-sibling tab.
    const active = openTabsStateRef.current.active?.trim() || '';
    const entry = project.metadata?.entryFile?.trim() || '';
    const htmlEntry = /\.html?$/i.test(entry) ? entry : '';
    const htmlActive = /\.html?$/i.test(active) ? active : '';
    const fallbackDeck = htmlEntry || htmlActive || null;
    const target = queuedSlideNavTarget(item.commentAttachments, {
      fallbackDeckFilePath: fallbackDeck,
    });
    if (!target) return;
    setSlideNavRequest({ name: target.filePath, slideIndex: target.slideIndex, nonce: Date.now() });
  }, [project.metadata?.entryFile]);

  const sendQueuedChatSendNow = useCallback((id: string) => {
    const item = queuedChatSendsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    if (currentConversationBusy) {
      // "Send now" while the agent is still working: the user has explicitly
      // chosen this turn over the in-flight one, so interrupt the running run
      // and move this item to the front. Stopping flips the conversation out
      // of its busy state, and the auto-start effect below then flushes the
      // now-first queued send — reusing the same path as a natural completion,
      // so runs never overlap.
      //
      // Record the runs we're superseding BEFORE handleStop() clears the active
      // refs. The daemon still delivers a late terminal callback for the
      // canceled run; tagging its controller here lets those callbacks be
      // recognized as stale and skip every current-run side effect, even if the
      // replacement send hasn't attached yet.
      if (abortRef.current) supersededRunsRef.current.add(abortRef.current);
      for (const controller of reattachControllersRef.current.values()) {
        supersededRunsRef.current.add(controller);
      }
      // The interrupted turn moved its preview-comment attachments to
      // 'applying' when it started; since we now suppress its terminal
      // callbacks, reset them to 'open' so they don't stay stuck mid-apply.
      // Reset ONLY the in-flight run's comments: queued sends (including the
      // one being prioritized) also hold their attachments in 'applying', and
      // those must stay reserved — the replacement run re-applies them. The
      // in-flight run's comments are exactly the 'applying' ones not owned by
      // any queued send.
      const queuedCommentIds = new Set(
        queuedChatSendsRef.current.flatMap((send) =>
          send.commentAttachments.map((attachment) => attachment.id),
        ),
      );
      const stuckApplying = previewCommentsRef.current.filter(
        (comment) => comment.status === 'applying' && !queuedCommentIds.has(comment.id),
      );
      if (stuckApplying.length > 0) {
        const resetIds = new Set(stuckApplying.map((comment) => comment.id));
        setPreviewComments((current) =>
          current.map((comment) =>
            resetIds.has(comment.id) ? { ...comment, status: 'open' } : comment,
          ),
        );
        void Promise.all(
          stuckApplying.map((comment) =>
            patchPreviewCommentStatus(project.id, comment.conversationId, comment.id, 'open'),
          ),
        ).catch(() => {});
      }
      prioritizeQueuedChatSend(id);
      handleStop();
      return;
    }
    void (async () => {
      armSlideNavForQueuedSend(item);
      const started = await handleSend(
        item.prompt,
        item.attachments,
        item.commentAttachments,
        { ...(item.meta ?? {}), drainQueuedSend: true },
      );
      if (started) removeQueuedChatSend(id);
    })();
  }, [armSlideNavForQueuedSend, currentConversationBusy, handleSend, handleStop, prioritizeQueuedChatSend, project.id, removeQueuedChatSend]);

  useEffect(() => {
    if (currentConversationBusy) {
      startingQueuedChatSendIdRef.current = null;
      return;
    }
    if (startingQueuedChatSendIdRef.current) return;
    if (!activeConversationId) return;
    if (messagesConversationIdRef.current !== activeConversationId) return;
    const next = queuedChatSendsRef.current.find(
      (item) => item.conversationId === activeConversationId,
    );
    if (!next) return;
    startingQueuedChatSendIdRef.current = next.id;
    armSlideNavForQueuedSend(next);
    void (async () => {
      const started = await handleSend(
        next.prompt,
        next.attachments,
        next.commentAttachments,
        { ...(next.meta ?? {}), drainQueuedSend: true },
      );
      if (!started) {
        if (startingQueuedChatSendIdRef.current === next.id) {
          startingQueuedChatSendIdRef.current = null;
        }
        return;
      }
      removeQueuedChatSend(next.id);
      window.setTimeout(() => {
        if (startingQueuedChatSendIdRef.current !== next.id) return;
        startingQueuedChatSendIdRef.current = null;
        setQueuedAutoStartTick((tick) => tick + 1);
      }, 0);
    })();
  }, [
    activeConversationId,
    armSlideNavForQueuedSend,
    currentConversationBusy,
    queuedAutoStartTick,
    queuedChatSends,
    handleSend,
    removeQueuedChatSend,
  ]);

  const handleRetry = useCallback(
    (assistantMessage: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      if (currentConversationHasActiveRun) return;
      void handleSend('', [], [], { retryOfAssistantId: assistantMessage.id });
    },
    [currentConversationActionDisabled, currentConversationHasActiveRun, handleSend],
  );

  // "Continue" on a resumable failed run: send a fresh turn in the same
  // conversation. For a session-resuming runtime (Claude) the daemon persisted
  // the failed run's CLI session, so this turn resumes it (`--resume`) and the
  // agent continues from its committed work instead of restarting. Mirrors the
  // "Continue remaining tasks" affordance; unlike Retry it does not replay the
  // prior turn from scratch. Tagged `entryFrom: 'resume_continue'` so
  // run_created / run_finished can quantify how often resume fires and whether
  // it recovers (the whole point is to show the mechanism lowers failure rate).
  const handleResumeRun = useCallback(
    (assistantMessage: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      // Preserve the failed run's comment scope on manual "Continue"
      // just like the auto-continue paths do. Without this, a user
      // who clicks Continue after a scoped comment edit failed
      // sends the retry as an unscoped run — the deck-patch scope
      // guards go silent and the model can rewrite the whole deck.
      const resumeCommentAttachments = extractCommentAttachmentsForAutoContinue(
        findPrecedingUserMessage(messagesRef.current, assistantMessage.id),
        runCommentAttachmentsRef.current,
      );
      void handleSend(RESUME_CONTINUE_PROMPT, [], resumeCommentAttachments, {
        entryFrom: 'resume_continue',
      });
    },
    [currentConversationActionDisabled, handleSend],
  );

  // "Switch to AMR & retry" from the failed-run card: switch the run to AMR,
  // open Settings on the AMR controls so the user can sign in / authorize /
  // top up, and arm an auto-retry that fires once AMR is selected AND signed
  // in (see the effect below).
  const [pendingAmrRetry, setPendingAmrRetry] = useState<ChatMessage | null>(null);
  const handleSwitchToAmrAndRetry = useCallback(
    (failedAssistant: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      onModeChange('daemon');
      onAgentChange('amr');
      onOpenAmrSettings?.();
      setPendingAmrRetry(failedAssistant);
    },
    [currentConversationActionDisabled, onModeChange, onAgentChange, onOpenAmrSettings],
  );
  // PR #3157: Antigravity's `agy -p` cannot complete OAuth on its own,
  // so the auth banner offers a one-click "Sign in via terminal"
  // button that POSTs to the daemon. The daemon opens a system
  // Terminal running `agy` (osascript / x-terminal-emulator /
  // `cmd /c start`); the user finishes Google sign-in there and then
  // clicks Retry to redo the chat run. We don't auto-retry because
  // the OAuth completion happens externally with no reliable signal
  // back to the chat — the secondary Retry button on the same banner
  // covers the manual case.
  const handleLaunchAntigravityOauth = useCallback(async () => {
    try {
      const { launchAntigravityOauth } = await import('../providers/daemon');
      const result = await launchAntigravityOauth();
      if (!result.ok) {
        // Surface the daemon-side reason so the user knows whether
        // the spawn failed because of missing osascript / unsupported
        // platform / etc. instead of silently swallowing it.
        devLog.warn('[antigravity] oauth-launch failed:', result.error);
      }
    } catch (err) {
      devLog.warn('[antigravity] oauth-launch threw:', err);
    }
  }, []);
  // Poll the AMR login status while a retry is armed, rather than only reacting
  // to the AmrLoginPill's status event — the user may close Settings (which
  // unmounts the pill and stops its polling) before finishing sign-in in the
  // browser. Polling here keeps working regardless of the pill's lifecycle.
  // Fires once AMR is the selected agent AND the account is signed in.
  useEffect(() => {
    if (!pendingAmrRetry) return;
    let cancelled = false;
    const tryRetry = async () => {
      if (cancelled) return;
      if (!(config.mode === 'daemon' && config.agentId === 'amr')) return;
      const status = await fetchVelaLoginStatus().catch(() => null);
      if (cancelled || status?.loggedIn !== true) return;
      setPendingAmrRetry(null);
      handleRetry(pendingAmrRetry);
    };
    void tryRetry();
    const interval = setInterval(() => void tryRetry(), 2000);
    // Give up after a few minutes so we never poll forever.
    const stop = setTimeout(() => {
      if (!cancelled) setPendingAmrRetry(null);
    }, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [pendingAmrRetry, config.mode, config.agentId, handleRetry]);

  useEffect(() => {
    if (!autoAuditRepairSeed) return;
    if (!activeConversationId) return;
    if (!messagesInitialized) return;
    if (currentConversationBusy) return;
    const repairText = autoAuditRepairSeed.value.trim();
    setAutoAuditRepairSeed(null);
    if (!repairText) return;
    void handleSend(repairText, [], []);
  }, [
    activeConversationId,
    autoAuditRepairSeed,
    currentConversationBusy,
    handleSend,
    messagesInitialized,
  ]);

  const handleSendBoardCommentAttachments = useCallback(
    async (commentAttachments: ChatCommentAttachment[], images: File[] = []) => {
      if (currentConversationQueueDisabled) return false;
      if (commentAttachments.length === 0 && images.length === 0) return false;
      setWorkspaceFocused(false);
      setCommentInspectorActive(false);
      // Upload any attached images once, then send or queue. Each comment becomes
      // its own task (so multiple notes => multiple tasks); the images ride along
      // the first task rather than being duplicated across every note.
      let uploaded: ChatAttachment[] = [];
      if (images.length > 0) {
        const result = await uploadProjectFiles(project.id, images);
        throwIfProjectCommentUploadIncomplete(result, images.length);
        const ready = await uploadedImagesReadableOnDisk(project.id, result.uploaded);
        const staged = stageReadableUploadedAttachments(result.uploaded, ready);
        uploaded = staged.staged;
        await refreshProjectFiles().catch(() => undefined);
      }
      const queueBoardSend = currentConversationBusy;
      if (commentAttachments.length === 0) {
        if (uploaded.length > 0) {
          await handleSend(
            '',
            uploaded,
            [],
            queueBoardSend ? { queueOnly: true } : undefined,
          );
        }
        return true;
      }
      for (let i = 0; i < commentAttachments.length; i++) {
        const commentAttachment = commentAttachments[i]!;
        const savedImages = chatAttachmentsFromPreviewCommentImages(commentAttachment.imageAttachments);
        const prompt = commentTaskQuery(commentAttachment);
        // When the conversation is idle, start the first board comment immediately
        // (OD parity). Additional notes in the same batch still queue so we never
        // overlap runs. While a run is in-flight, queue everything.
        const meta =
          queueBoardSend || i > 0 ? { queueOnly: true as const } : undefined;
        await handleSend(
          prompt,
          mergeChatAttachments(i === 0 ? uploaded : [], savedImages),
          [commentAttachment],
          meta,
        );
      }
      return true;
    },
    [handleSend, project.id, currentConversationQueueDisabled, currentConversationBusy, refreshProjectFiles],
  );
  const commentQueueOnSend = currentConversationBusy && !currentConversationQueueDisabled;

  const handleContinueRemainingTasks = useCallback(
    (_assistantMessage: ChatMessage, todos: TodoItem[]) => {
      if (currentConversationActionDisabled || todos.length === 0) return;
      const remainingList = todos
        .map((todo, i) => {
          const label =
            todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content;
          return `${i + 1}. [${todo.status}] ${label}`;
        })
        .join('\n');
      const prompt =
        'Continue the remaining unfinished tasks from the previous run. ' +
        'Do not redo completed work. Focus only on these unfinished todos:\n\n' +
        `${remainingList}\n\n` +
        'Before making changes, inspect the current project files as needed. ' +
        'Update TodoWrite as you complete each remaining task.';
      void handleSend(prompt, [], []);
    },
    [currentConversationActionDisabled, handleSend],
  );

  const selectedPluginActionAgent =
    config.mode === 'daemon' && config.agentId
      ? agentsById.get(config.agentId)
      : null;
  const selectedPluginActionChoice =
    config.mode === 'daemon' && config.agentId
      ? config.agentModels?.[config.agentId]
      : undefined;
  const effectiveSelectedPluginActionChoice = effectiveAgentModelChoice(
    selectedPluginActionAgent,
    selectedPluginActionChoice,
  );
  const pluginWorkflowAgentName =
    config.mode === 'daemon'
      ? agentModelDisplayName(
          config.agentId,
          selectedPluginActionAgent?.name,
          effectiveSelectedPluginActionChoice?.model,
        )
      : apiProtocolModelLabel(config.apiProtocol, config.model);

  const handlePluginFolderAgentAction = useCallback(
    async (relativePath: string, action: PluginFolderAgentAction) => {
      if (currentConversationActionDisabled || !activeConversationId) return;
      setHiddenAssistantPluginActionPaths((prev) => new Set(prev).add(relativePath));
      if (action === 'install') {
        setActivePluginActionPaths((prev) => new Set(prev).add(relativePath));
        let outcome;
        try {
          outcome = await installGeneratedPluginFolder(project.id, relativePath);
        } finally {
          setActivePluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          setHiddenAssistantPluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
        }
        if (!outcome.ok) throw new Error(outcome.message);
        return { message: outcome.message };
      }
      const conversationId = activeConversationId;
      const shareAction = action === 'publish' ? 'publish-github' : 'contribute-open-design';
      setActivePluginActionPaths((prev) => new Set(prev).add(relativePath));
      let taskStart;
      try {
        taskStart = await startGeneratedPluginShareTask(project.id, relativePath, shareAction);
      } catch (error) {
        setActivePluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        setHiddenAssistantPluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        throw error;
      }
      const startedAt = taskStart.startedAt;
      const messageId = randomUUID();
      const updateConversationLatestRun = (
        status: NonNullable<ChatMessage['runStatus']>,
        endedAt?: number,
      ) => {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  updatedAt: endedAt ?? startedAt,
                  latestRun: {
                    status,
                    startedAt,
                    ...(endedAt === undefined
                      ? {}
                      : {
                          endedAt,
                          durationMs: Math.max(0, endedAt - startedAt),
                        }),
                  },
                }
              : conversation,
          ),
        );
      };
      const progressMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: pluginWorkflowStartContent(action, relativePath),
        agentName: pluginWorkflowAgentName,
        events: pluginWorkflowPlannedEvents(action, relativePath),
        createdAt: startedAt,
        startedAt,
        runStatus: 'running',
      };
      setForceStreamingPluginMessageIds((prev) => new Set(prev).add(messageId));
      appendConversationMessage(conversationId, progressMessage, undefined, false);
      updateConversationLatestRun('running');
      void (async () => {
        let since = 0;
        let liveEvents = [...pluginWorkflowPlannedEvents(action, relativePath)];
        let liveContent = pluginWorkflowStartContent(action, relativePath);
        while (true) {
          const snapshot = await waitGeneratedPluginShareTask(taskStart.taskId, since, 25_000);
          since = snapshot.nextSince;
          if (snapshot.progress.length > 0) {
            const newTextEvents = snapshot.progress
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => ({ kind: 'text' as const, text: `${line}\n` }));
            liveEvents = [
              ...liveEvents.filter((event, index) => !(index === liveEvents.length - 1 && event.kind === 'status' && event.label === 'working')),
              ...newTextEvents,
              { kind: 'status', label: 'working', detail: pluginWorkflowTitle(action) },
            ];
            liveContent = `${liveContent}\n\n${snapshot.progress.map((line) => line.trim()).filter(Boolean).join('\n')}`.trim();
            replaceConversationMessage(
              conversationId,
              {
                ...progressMessage,
                content: liveContent,
                events: liveEvents,
                runStatus: 'running',
              },
              undefined,
              false,
            );
          }
          if (snapshot.status === 'running' || snapshot.status === 'queued') continue;
          const endedAt = snapshot.endedAt ?? Date.now();
          setActivePluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          setHiddenAssistantPluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          if (snapshot.status === 'done' && snapshot.result) {
            setForceStreamingPluginMessageIds((prev) => {
              const next = new Set(prev);
              next.delete(messageId);
              return next;
            });
            replaceConversationMessage(
              conversationId,
              {
                ...progressMessage,
                content: pluginWorkflowSuccessContent(
                  action,
                  relativePath,
                  snapshot.result.message,
                  snapshot.result.url,
                  snapshot.result.log,
                ),
                events: pluginWorkflowResultEvents(
                  action,
                  relativePath,
                  snapshot.result.message,
                  snapshot.result.url,
                  snapshot.result.log,
                  true,
                  liveEvents,
                ),
                endedAt,
                runStatus: 'succeeded',
              },
              { telemetryFinalized: true },
            );
            updateConversationLatestRun('succeeded', endedAt);
            return;
          }
          const errorMessage = snapshot.error?.message || `${pluginWorkflowTitle(action)} failed.`;
          setForceStreamingPluginMessageIds((prev) => {
            const next = new Set(prev);
            next.delete(messageId);
            return next;
          });
          replaceConversationMessage(
            conversationId,
            {
              ...progressMessage,
              content: pluginWorkflowFailureContent(
                action,
                relativePath,
                errorMessage,
                snapshot.error?.log,
              ),
              events: pluginWorkflowResultEvents(
                action,
                relativePath,
                errorMessage,
                undefined,
                snapshot.error?.log,
                false,
                liveEvents,
              ),
              endedAt,
              runStatus: 'failed',
            },
            { telemetryFinalized: true },
          );
          updateConversationLatestRun('failed', endedAt);
          return;
        }
      })().catch((err) => {
        const endedAt = Date.now();
        setForceStreamingPluginMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        setActivePluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        setHiddenAssistantPluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        replaceConversationMessage(
          conversationId,
          {
            ...progressMessage,
            content: pluginWorkflowFailureContent(
              action,
              relativePath,
              err instanceof Error ? err.message : String(err),
            ),
            events: pluginWorkflowResultEvents(
              action,
              relativePath,
              err instanceof Error ? err.message : String(err),
              undefined,
              [],
              false,
            ),
            endedAt,
            runStatus: 'failed',
          },
          { telemetryFinalized: true },
        );
        updateConversationLatestRun('failed', endedAt);
      });
      return;
    },
    [
      activeConversationId,
      appendConversationMessage,
      currentConversationActionDisabled,
      pluginWorkflowAgentName,
      project.id,
      replaceConversationMessage,
    ],
  );

  // "Share to Open Design" — kicks off the bundled `od-share-to-community`
  // scenario in the active conversation. We just inject the trigger prompt
  // through the standard chat-send path; the agent then loads SKILL.md and
  // drives the rest. Keep this preparing state alive for the resulting chat
  // run so the action reads as async packaging instead of instant sharing.
  const [shareToOpenDesignBusyMessageId, setShareToOpenDesignBusyMessageId] = useState<string | null>(null);
  const shareToOpenDesignBusyMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!shareToOpenDesignBusyMessageIdRef.current || currentConversationBusy) return;
    shareToOpenDesignBusyMessageIdRef.current = null;
    setShareToOpenDesignBusyMessageId(null);
  }, [currentConversationBusy]);
  const handleShareToOpenDesign = useCallback((assistantMessageId: string) => {
    if (currentConversationActionDisabled || shareToOpenDesignBusyMessageIdRef.current) return;
    shareToOpenDesignBusyMessageIdRef.current = assistantMessageId;
    setShareToOpenDesignBusyMessageId(assistantMessageId);
    void Promise.resolve(handleSend(SHARE_TO_COMMUNITY_PROMPT, [], []))
      .then((started) => {
        if (started) return;
        shareToOpenDesignBusyMessageIdRef.current = null;
        setShareToOpenDesignBusyMessageId(null);
      })
      .catch(() => {
        shareToOpenDesignBusyMessageIdRef.current = null;
        setShareToOpenDesignBusyMessageId(null);
      });
  }, [currentConversationActionDisabled, handleSend]);

  const sentDesignSystemReviewTaskKeysRef = useRef<Set<string>>(new Set());
  const persistDesignSystemReviewEntry = useCallback((
    sectionTitle: string,
    entry: DesignSystemReviewEntry,
  ) => {
    const baseMetadata: ProjectMetadata = {
      kind: project.metadata?.kind ?? 'other',
      ...project.metadata,
    };
    const metadata: ProjectMetadata = {
      ...baseMetadata,
      designSystemReview: {
        ...(baseMetadata.designSystemReview ?? {}),
        [sectionTitle]: entry,
      },
    };
    onProjectChange({ ...project, metadata });
    void patchProject(project.id, { metadata });
  }, [onProjectChange, project]);

  const sendDesignSystemFeedback = useCallback((
    sectionTitle: string,
    feedback: string,
    sectionFiles: string[],
  ): DesignSystemReviewAgentTask | void => {
    const cleanFeedback = feedback.trim();
    if (!cleanFeedback) return;
    const prompt = designSystemNeedsWorkPrompt(sectionTitle, cleanFeedback, sectionFiles);
    const queuedAt = new Date().toISOString();
    if (!activeConversationId || !messagesInitialized || currentConversationActionDisabled) {
      return {
        status: 'queued',
        prompt,
        queuedAt,
      };
    }
    const task: DesignSystemReviewAgentTask = {
      status: 'sent',
      prompt,
      queuedAt,
      sentAt: queuedAt,
    };
    sentDesignSystemReviewTaskKeysRef.current.add(`${sectionTitle}:${queuedAt}`);
    void handleSend(prompt, designSystemFeedbackAttachments(projectFiles, sectionFiles), []);
    return task;
  }, [
    activeConversationId,
    currentConversationActionDisabled,
    handleSend,
    messagesInitialized,
    projectFiles,
  ]);
  const persistDesignSystemReviewDecision = useCallback((
    sectionTitle: string,
    decision: DesignSystemReviewEntry['decision'],
    details?: DesignSystemReviewDetails,
  ) => {
    const entry: DesignSystemReviewEntry = {
      decision,
      updatedAt: new Date().toISOString(),
    };
    if (details?.feedback) entry.feedback = details.feedback;
    if (details?.files) entry.files = details.files;
    if (details?.agentTask) entry.agentTask = details.agentTask;
    persistDesignSystemReviewEntry(sectionTitle, entry);
  }, [persistDesignSystemReviewEntry]);
  useEffect(() => {
    if (!activeConversationId || !messagesInitialized || currentConversationActionDisabled) return;
    const queued = Object.entries(project.metadata?.designSystemReview ?? {}).find(
      ([, entry]) =>
        entry.decision === 'needs-work'
        && Boolean(entry.feedback?.trim())
        && entry.agentTask?.status === 'queued',
    );
    if (!queued) return;
    const [sectionTitle, entry] = queued;
    const task = entry.agentTask;
    if (!task) return;
    const taskKey = `${sectionTitle}:${task.queuedAt}`;
    if (sentDesignSystemReviewTaskKeysRef.current.has(taskKey)) return;
    sentDesignSystemReviewTaskKeysRef.current.add(taskKey);
    const sectionFiles = entry.files ?? [];
    const prompt = task.prompt || designSystemNeedsWorkPrompt(
      sectionTitle,
      entry.feedback ?? '',
      sectionFiles,
    );
    const sentAt = new Date().toISOString();
    persistDesignSystemReviewEntry(sectionTitle, {
      ...entry,
      agentTask: {
        ...task,
        status: 'sent',
        prompt,
        sentAt,
      },
    });
    void handleSend(prompt, designSystemFeedbackAttachments(projectFiles, sectionFiles), []);
  }, [
    activeConversationId,
    currentConversationActionDisabled,
    handleSend,
    messagesInitialized,
    persistDesignSystemReviewEntry,
    project.metadata?.designSystemReview,
    projectFiles,
  ]);

  const handleExportAsPptx = useCallback(
    (fileName: string) => {
      if (currentConversationActionDisabled) return;
      const prompt = buildPptxExportPrompt(fileName);
      const attachment: ChatAttachment = {
        path: fileName,
        name: fileName,
        kind: 'file',
      };
      void handleSend(prompt, [attachment], []);
    },
    [currentConversationActionDisabled, handleSend],
  );

  const handleNewConversation = useCallback(async () => {
    if (creatingConversationRef.current) return;
    // Only block if we're sure the current conversation is empty:
    // messages must be loaded AND match the active conversation.
    if (
      messagesConversationIdRef.current === activeConversationId &&
      messages.length === 0
    ) {
      return;
    }
    // Any recovery banner belonging to the outgoing conversation is
    // scoped to that conversationId; clear it here so `byokBackgroundChatsRef`
    // in App.tsx (single-key-per-projectId) does not carry a stale "active"
    // flag into the new conversation.
    clearApiBackgroundRecoveryBanner();
    creatingConversationRef.current = true;
    setCreatingConversation(true);
    setConversationLoadError(null);
    try {
      const fresh = await createConversation(project.id);
      if (!fresh) throw new Error(formatProjectConversationCreateError());
      // Eagerly clear messages and update ref so rapid clicks don't create
      // duplicate empty conversations before the effect resolves.
      setMessages([]);
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      setMessagesConversationId(null);
      messagesConversationIdRef.current = fresh.id;
      setConversations((curr) => [fresh, ...curr]);
      setActiveConversationId(fresh.id);
      // Push the new conversation id into the URL synchronously so the
      // route-sync effect sees a matching `routeConversationId` before
      // it can revert `activeConversationId`. Without this, the route-sync
      // effect can fight the conversation switch, preventing users from
      // switching back to older conversations after creating a new one.
      navigate(
        {
          kind: 'project',
          projectId: project.id,
          conversationId: fresh.id,
          fileName: openTabsState.active ?? null,
        },
        { replace: true },
      );
      setError(null);
    } catch (err) {
      const message = formatProjectConversationErrorForUser(err, formatProjectConversationCreateError());
      setConversationLoadError(message);
      setError(message);
    } finally {
      creatingConversationRef.current = false;
      setCreatingConversation(false);
    }
  }, [clearApiBackgroundRecoveryBanner, project.id, activeConversationId, messages.length, navigate, openTabsState.active]);

  const handleSelectConversation = useCallback((id: string) => {
    if (id === activeConversationId && failedMessagesConversationId !== id) return;
    // The recovery banner is keyed by conversationId inside
    // `apiRecoveryBannerRef`, but the Task Center / PetOverlay listen to
    // per-projectId events. Dropping the banner for the outgoing
    // conversation here prevents a persistent "still running" indicator on
    // the OD host after the user pivots to a different chat.
    clearApiBackgroundRecoveryBanner();
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setArtifact(null);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setConversationLoadError(null);
    messagesConversationIdRef.current = null;
    setActiveConversationId(id);
    // Push the new conversation id into the URL synchronously so the
    // route-sync effect at L512 sees a matching `routeConversationId`
    // before it can find the previous conversation in the list and
    // revert `activeConversationId` to it. Without this, the same
    // effect that fights handleNewConversation also fights chat
    // switching, ping-ponging until React's nested-update guard fires.
    navigate(
      {
        kind: 'project',
        projectId: project.id,
        conversationId: id,
        fileName: openTabsState.active ?? null,
      },
      { replace: true },
    );
    setMessageLoadRetryNonce((nonce) => nonce + 1);
  }, [clearApiBackgroundRecoveryBanner, activeConversationId, failedMessagesConversationId, project.id, openTabsState.active]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const ok = await deleteConversationApi(project.id, id);
      if (!ok) return;
      // The deleted conversation may have owned an unanswered
      // `<question-form>`, which the daemon counts toward the project's
      // `needsInput` flag in `/api/projects`. Home cards render that
      // flag from the cached projects payload, so without refreshing
      // it here the `Needs input` badge survives the deletion until
      // the next manual reload.
      onProjectsRefresh();
      setConversations((curr) => {
        const next = curr.filter((c) => c.id !== id);
        if (next.length === 0) {
          // Re-seed so the project always has at least one conversation
          // to write into.
          void createConversation(project.id).then((fresh) => {
            if (fresh) {
              setConversations([fresh]);
              setActiveConversationId(fresh.id);
            }
          });
        } else if (id === activeConversationId) {
          setActiveConversationId(next[0]!.id);
        }
        return next;
      });
    },
    [project.id, activeConversationId, onProjectsRefresh],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim() || null;
      setConversations((curr) =>
        curr.map((c) => (c.id === id ? { ...c, title: trimmed } : c)),
      );
      await patchConversation(project.id, id, { title: trimmed });
    },
    [project.id],
  );

  const handleConversationSessionModeChange = useCallback(
    async (id: string, sessionMode: ChatSessionMode) => {
      setConversations((curr) =>
        curr.map((conversation) =>
          conversation.id === id ? { ...conversation, sessionMode } : conversation,
        ),
      );
      const updated = await patchConversation(project.id, id, { sessionMode });
      if (updated) {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === id ? { ...conversation, ...updated } : conversation,
          ),
        );
      }
    },
    [project.id],
  );

  const handleActiveConversationSessionModeChange = useCallback(
    (sessionMode: ChatSessionMode) => {
      if (!activeConversationId) return;
      void handleConversationSessionModeChange(activeConversationId, sessionMode);
    },
    [activeConversationId, handleConversationSessionModeChange],
  );

  const handleForkFromMessage = useCallback(
    async (assistantMessage: ChatMessage) => {
      if (!activeConversationId || forkingMessageId) return;
      // Forking creates a new conversation — the recovery banner tied to
      // the source conversation must not leak into the fork.
      clearApiBackgroundRecoveryBanner();
      setForkingMessageId(assistantMessage.id);
      setConversationLoadError(null);
      try {
        const sourceTitle = activeConversation?.title?.trim();
        const forkTitle = sourceTitle
          ? t('chat.forkedConversationTitle', { title: sourceTitle })
          : undefined;
        // Seed the fork from the messages the user is actually looking at,
        // up to and including the fork point. A run that errored or had its
        // connection reset before its assistant message was persisted leaves
        // that message in memory only; copying from the database by id would
        // 404 and silently drop the fork. Sending the in-memory snapshot makes
        // the fork resilient to that gap.
        const forkIndex = messages.findIndex((m) => m.id === assistantMessage.id);
        const seedMessages =
          forkIndex >= 0 ? messages.slice(0, forkIndex + 1) : [...messages, assistantMessage];
        const fresh = await createConversation(project.id, forkTitle, {
          seedFromConversationId: activeConversationId,
          forkAfterMessageId: assistantMessage.id,
          sessionMode: activeSessionMode,
          seedMessages,
        });
        if (!fresh) throw new Error(t('chat.forkConversationFailed'));
        setMessages([]);
        setPreviewComments([]);
        setAttachedComments([]);
        setArtifact(null);
        setStreaming(false);
        streamingConversationIdRef.current = null;
        setStreamingConversationId(null);
        setMessagesConversationId(null);
        messagesConversationIdRef.current = null;
        setFailedMessagesConversationId(null);
        setConversations((curr) => [fresh, ...curr.filter((c) => c.id !== fresh.id)]);
        setActiveConversationId(fresh.id);
        navigate(
          {
            kind: 'project',
            projectId: project.id,
            conversationId: fresh.id,
            fileName: openTabsState.active ?? null,
          },
          { replace: true },
        );
        onProjectsRefresh();
        setError(null);
      } catch (err) {
        const message = formatProjectConversationErrorForUser(
          err,
          isTeamverEmbedMode() ? formatProjectForkConversationError() : t('chat.forkConversationFailed'),
        );
        setConversationLoadError(message);
        setError(message);
      } finally {
        setForkingMessageId(null);
      }
    },
    [
      activeConversationId,
      activeConversation?.title,
      activeSessionMode,
      clearApiBackgroundRecoveryBanner,
      forkingMessageId,
      messages,
      navigate,
      onProjectsRefresh,
      openTabsState.active,
      project.id,
      t,
    ],
  );

  const handleProjectRename = useCallback(
    (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === project.name) return;
      const metadata = project.metadata
        ? { ...project.metadata, nameSource: 'user' as const }
        : undefined;
      const updated: Project = {
        ...project,
        name: trimmed,
        ...(metadata ? { metadata } : {}),
        updatedAt: Date.now(),
      };
      onProjectChange(updated);
      void patchProject(project.id, {
        name: trimmed,
        ...(metadata ? { metadata } : {}),
      });
    },
    [project, onProjectChange],
  );

  const projectTitleEditRef = useRef<HTMLSpanElement>(null);
  const focusProjectTitleForRename = useCallback(() => {
    const el = projectTitleEditRef.current;
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }, []);

  const activeConversationChatState = useMemo(
    () =>
      activeConversationId
        ? {
	            conversationId: activeConversationId,
	            messages,
	            streaming: currentConversationStreaming,
	            loading: currentConversationLoading,
	            sendDisabled: currentConversationSendDisabled,
            queuedItems: currentConversationQueuedItems,
            error: conversationLoadError ?? error ?? audioVoiceOptionsError,
            onSend: handleSend,
            onRetry: handleRetry,
            onStop: handleStop,
            onRemoveQueuedSend: removeQueuedChatSend,
            onUpdateQueuedSend: updateQueuedChatSend,
            onReorderQueuedSends: reorderCurrentConversationQueuedChatSends,
            onSendQueuedNow: sendQueuedChatSendNow,
            onAssistantFeedback: handleAssistantFeedback,
          }
        : undefined,
    [
      activeConversationId,
      audioVoiceOptionsError,
      conversationLoadError,
	      currentConversationQueuedItems,
	      currentConversationSendDisabled,
	      currentConversationLoading,
	      currentConversationStreaming,
      error,
      handleAssistantFeedback,
      handleRetry,
      handleSend,
      handleStop,
      messages,
      removeQueuedChatSend,
      reorderCurrentConversationQueuedChatSends,
      sendQueuedChatSendNow,
      updateQueuedChatSend,
    ],
  );

  const handleChangeDesignSystemId = useCallback(
    (nextId: string | null) => {
      if ((project.designSystemId ?? null) === nextId) return;
      // `design_system_apply_result` studio variant. The existing
      // NewProjectPanel picker fires the same event under
      // `page_name=home`; this in-project header picker fires under
      // `page_name=studio` so the funnel sees applies from both
      // surfaces. `target_project_kind` derives from
      // `project.metadata.kind`.
      const target =
        (projectKindToTracking(project.metadata?.kind ?? null, project.metadata?.videoModel) ?? 'unknown') as TrackingDesignSystemApplyTargetKind;
      const picked = nextId
        ? designSystems.find((d) => d.id === nextId)
        : null;
      const origin: TrackingDesignSystemOrigin | undefined = picked
        ? picked.source === 'user'
          ? 'manual_create'
          : picked.source === 'built-in'
            ? 'official_preset'
            : picked.source === 'installed'
              ? 'template'
              : 'unknown'
        : undefined;
      const status: TrackingDesignSystemStatusValue | undefined = picked
        ? picked.status === 'draft' || picked.status === 'published'
          ? picked.status
          : 'unknown'
        : undefined;
      if (nextId === null) {
        trackDesignSystemApplyResult(analytics.track, {
          page_name: 'studio',
          area: 'design_system_picker',
          action: 'clear_selection',
          result: 'success',
          target_project_kind: target,
          design_system_applied: false,
          design_system_selection_mode: 'none',
          is_default: false,
          is_auto_selected: false,
          available_design_system_count: designSystems.length,
          duration_ms: 0,
        });
      } else {
        trackDesignSystemApplyResult(analytics.track, {
          page_name: 'studio',
          area: 'design_system_picker',
          action: 'select_design_system',
          result: 'success',
          target_project_kind: target,
          design_system_id: nextId,
          design_system_source: origin,
          design_system_status: status,
          design_system_applied: true,
          design_system_selection_mode: 'manual',
          is_default: false,
          is_auto_selected: false,
          available_design_system_count: designSystems.length,
          duration_ms: 0,
        });
      }
      const updated: Project = {
        ...project,
        designSystemId: nextId,
        updatedAt: Date.now(),
      };
      onProjectChange(updated);
      void patchProject(project.id, { designSystemId: nextId });
    },
    [project, onProjectChange, designSystems, analytics.track],
  );

  const projectMeta = useMemo(() => {
    // Design system is rendered by the adjacent picker chip — keep the
    // bare meta string focused on skill / mode so the two surfaces
    // don't show the same label twice.
    const summary =
      skills.find((s) => s.id === project.skillId) ??
      designTemplates.find((s) => s.id === project.skillId);
    const skill = summary?.name;
    return skill ?? t('project.metaFreeform');
  }, [skills, designTemplates, project.skillId, t]);

  const activeDesignSystemSummary = useMemo(() => {
    if (!project.designSystemId) return null;
    return designSystems.find((d) => d.id === project.designSystemId) ?? null;
  }, [designSystems, project.designSystemId]);

  const designSystemProject = useMemo(() => {
    if (project.metadata?.importedFrom !== 'design-system') return null;
    if (!project.designSystemId) return null;
    return designSystems.find((d) => d.id === project.designSystemId) ?? null;
  }, [designSystems, project.designSystemId, project.metadata?.importedFrom]);
  const designSystemActivityEvents = useMemo(
    () => designSystemProject ? latestDesignSystemActivityEvents(messages) : [],
    [designSystemProject, messages],
  );
  const connectRepoNeeded = useMemo(
    () => designSystemNeedsRepoConnect(designSystemProject, projectFiles.map((file) => file.name)),
    [designSystemProject, projectFiles],
  );
  // Only the connect-repo CTA copy depends on this (connect vs re-import), so
  // resolve it lazily and only while the CTA is actually showing. Tri-state:
  // `undefined` means the status fetch has not resolved yet, which keeps the
  // CTA neutral and disabled so a fast click can't fire the wrong action.
  const [githubConnected, setGithubConnected] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!connectRepoNeeded) {
      setGithubConnected(undefined);
      return;
    }
    let aborted = false;
    const controller = new AbortController();
    const refresh = () => {
      void fetchConnectorStatuses({ signal: controller.signal }).then((statuses) => {
        if (!aborted) setGithubConnected(statuses.github?.status === 'connected');
      });
    };
    refresh();
    // Connecting GitHub happens in the Connectors dialog or an external OAuth
    // window, neither of which changes connectRepoNeeded. Re-check on focus so
    // the CTA flips from "Connect GitHub" to "Import repo" when the user returns.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      aborted = true;
      controller.abort();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [connectRepoNeeded]);

  // Signal that pushes a draft into the chat composer (the "Import repo" CTA).
  const [composerDraftSignal, setComposerDraftSignal] = useState<{ text: string; nonce: number }>();
  // One handler for both the review banner and the chat CTA. When GitHub is
  // not connected it opens Connectors; once connected it prefills the composer
  // with the import instruction so the user can review and send it.
  const handleConnectRepo = useCallback(() => {
    // Status not resolved yet; the CTA is disabled in this window, but guard
    // anyway so a stray call can't route a connected account to Connectors.
    if (githubConnected === undefined) return;
    if (githubConnected) {
      setComposerDraftSignal({
        text: buildRepoImportPrompt(designSystemProject, projectFiles.map((file) => file.name)),
        nonce: Date.now(),
      });
    } else {
      onOpenSettings('composio');
    }
  }, [githubConnected, onOpenSettings, designSystemProject, projectFiles]);

  // "Next step" affordance handlers (shown under the last assistant message
  // once it produced a previewable HTML artifact). Share reuses the preview
  // workspace's existing Share/Export menu. The featured design-toolbox rows are
  // driven by ChatPane's composer ref, so ProjectView no longer wires them here.
  const handleArtifactShare = useCallback(
    (fileName: string) => {
      requestOpenFile(fileName);
      setShareRequest({ name: fileName, nonce: Date.now() });
    },
    [requestOpenFile],
  );
  // Mirrors share, but opens the workspace's Download/Export menu (PDF / image /
  // zip / standalone HTML / save-as-template) instead of a bare file download.
  const handleArtifactDownload = useCallback(
    (fileName: string) => {
      requestOpenFile(fileName);
      setDownloadRequest({ name: fileName, nonce: Date.now() });
    },
    [requestOpenFile],
  );

  const handleBrowserUsePrompt = useCallback((text: string) => {
    setWorkspaceFocused(false);
    setComposerDraftSignal({
      text,
      nonce: Date.now(),
    });
  }, []);

  const isDeck = useMemo(
    () =>
      slideOnlyMvp
      || project.metadata?.kind === 'deck'
      || (skills.find((s) => s.id === project.skillId) ??
        designTemplates.find((s) => s.id === project.skillId))?.mode === 'deck',
    [slideOnlyMvp, project.metadata?.kind, skills, designTemplates, project.skillId],
  );
  const chatResizeLabel = t('project.resizeChatPanel');
  const workspacePanelTrack =
    workspacePanelMinWidth === 0
      ? 'minmax(0, 1fr)'
      : `minmax(${workspacePanelMinWidth}px, 1fr)`;
  const splitLeftPanelWidth = leftInspectorActive
    ? COMMENT_INSPECTOR_PANEL_WIDTH
    : chatPanelWidthRef.current;
  const chatPanelAriaMinWidth = Math.min(MIN_CHAT_PANEL_WIDTH, chatPanelMaxWidth);

  const renderPreferredChatPanelWidth = useCallback((
    preferredWidth: number,
    maxWidth = chatPanelMaxWidthRef.current,
    options: { commitState?: boolean } = {},
  ): number => {
    const next = clampChatPanelWidth(preferredWidth, maxWidth);
    chatPanelWidthRef.current = next;
    applySplitChatPanelWidth(splitRef.current, next, workspacePanelTrack);
    if (options.commitState !== false) setChatPanelWidth(next);
    return next;
  }, [workspacePanelTrack]);

  const applyChatPanelWidth = useCallback((
    width: number,
    options: { commitState?: boolean } = {},
  ): number => {
    const nextPreferred = clampPreferredChatPanelWidth(
      clampChatPanelWidth(width, chatPanelMaxWidthRef.current),
    );
    preferredChatPanelWidthRef.current = nextPreferred;
    return renderPreferredChatPanelWidth(nextPreferred, chatPanelMaxWidthRef.current, options);
  }, [renderPreferredChatPanelWidth]);

  const finishChatPanelResize = useCallback((saveFinalWidth = true) => {
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    if (pointerFrameRef.current !== null) {
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    pendingPointerClientXRef.current = null;
    resizeStateRef.current = null;
    setResizingChatPanel(false);
    if (saveFinalWidth) {
      const finalWidth = renderPreferredChatPanelWidth(preferredChatPanelWidthRef.current);
      saveChatPanelWidth(finalWidth);
    }
  }, [renderPreferredChatPanelWidth]);

  useEffect(() => {
    chatPanelWidthRef.current = chatPanelWidth;
    applySplitChatPanelWidth(splitRef.current, chatPanelWidth, workspacePanelTrack);
  }, [chatPanelWidth, workspacePanelTrack]);

  useEffect(() => {
    chatPanelMaxWidthRef.current = chatPanelMaxWidth;
  }, [chatPanelMaxWidth]);

  useLayoutEffect(() => {
    const split = splitRef.current;
    if (!split) return undefined;

    const updateAllowedWidth = () => {
      const splitWidth = split.clientWidth;
      const nextWorkspaceMin = workspacePanelMinWidthForSplit(splitWidth);
      const nextMax = maxChatPanelWidthForSplit(splitWidth);
      chatPanelMaxWidthRef.current = nextMax;
      setWorkspacePanelMinWidth(nextWorkspaceMin);
      setChatPanelMaxWidth(nextMax);
      renderPreferredChatPanelWidth(preferredChatPanelWidthRef.current, nextMax);
    };

    updateAllowedWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateAllowedWidth);
      observer.observe(split);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateAllowedWidth);
    return () => window.removeEventListener('resize', updateAllowedWidth);
  }, [renderPreferredChatPanelWidth]);

  useEffect(() => () => finishChatPanelResize(false), [finishChatPanelResize]);

  const handleChatResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const split = splitRef.current;
    if (!split) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerCleanupRef.current?.();
    setResizingChatPanel(true);
    resizeStartPreferredWidthRef.current = preferredChatPanelWidthRef.current;

    const updateWidthFromClientX = (clientX: number) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const delta = clientX - state.startClientX;
      if (delta === 0 && !state.hasMoved) return;
      state.hasMoved = true;
      const rawWidth = state.startWidth + (state.isRtl ? -delta : delta);
      applyChatPanelWidth(rawWidth, { commitState: false });
    };

    const flushPendingPointerMove = () => {
      if (pointerFrameRef.current !== null) {
        cancelAnimationFrame(pointerFrameRef.current);
        pointerFrameRef.current = null;
      }
      const clientX = pendingPointerClientXRef.current;
      pendingPointerClientXRef.current = null;
      if (clientX !== null) updateWidthFromClientX(clientX);
    };

    resizeStateRef.current = {
      startClientX: event.clientX,
      startWidth: chatPanelWidthRef.current,
      isRtl: window.getComputedStyle(split).direction === 'rtl',
      hasMoved: false,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      pendingPointerClientXRef.current = moveEvent.clientX;
      if (pointerFrameRef.current !== null) return;
      pointerFrameRef.current = requestAnimationFrame(() => {
        pointerFrameRef.current = null;
        flushPendingPointerMove();
      });
    };
    const handlePointerEnd = () => {
      flushPendingPointerMove();
      finishChatPanelResize(true);
    };
    const handlePointerCancel = () => {
      flushPendingPointerMove();
      preferredChatPanelWidthRef.current = resizeStartPreferredWidthRef.current;
      renderPreferredChatPanelWidth(resizeStartPreferredWidthRef.current);
      finishChatPanelResize(false);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handlePointerCancel);
    };

    pointerCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handlePointerCancel);
  }, [applyChatPanelWidth, finishChatPanelResize, renderPreferredChatPanelWidth]);

  const handleChatResizeBlur = useCallback(() => {
    if (!pointerCleanupRef.current) return;
    preferredChatPanelWidthRef.current = resizeStartPreferredWidthRef.current;
    renderPreferredChatPanelWidth(resizeStartPreferredWidthRef.current);
    finishChatPanelResize(false);
  }, [finishChatPanelResize, renderPreferredChatPanelWidth]);

  const handleChatResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null;
    const split = splitRef.current;
    const isRtl = split ? window.getComputedStyle(split).direction === 'rtl' : false;
    if (event.key === 'ArrowLeft') {
      nextWidth = chatPanelWidthRef.current + (isRtl ? 1 : -1) * CHAT_PANEL_KEYBOARD_STEP;
    } else if (event.key === 'ArrowRight') {
      nextWidth = chatPanelWidthRef.current + (isRtl ? -1 : 1) * CHAT_PANEL_KEYBOARD_STEP;
    } else if (event.key === 'Home') {
      nextWidth = MIN_CHAT_PANEL_WIDTH;
    } else if (event.key === 'End') {
      nextWidth = chatPanelMaxWidthRef.current;
    }
    if (nextWidth === null) return;
    event.preventDefault();
    const next = applyChatPanelWidth(nextWidth);
    saveChatPanelWidth(next);
  }, [applyChatPanelWidth]);

  // Hand the pending prompt to ChatPane exactly once per project. The local
  // project-scoped snapshot survives the conversation-id remount, while the
  // persisted pendingPrompt is cleared so refreshes and later entries do not
  // re-seed the composer.
  //
  // PluginLoopHome auto-send case: when the project was created with
  // `autoSendFirstMessage`, app.tsx left a sessionStorage flag telling us
  // to fire the prompt as a real user message immediately. We must NOT
  // seed initialDraft in that case — otherwise the textarea echoes the
  // prompt while it is also streaming as the first user message. The ref
  // captures the prompt independently so downstream effects can still
  // dispatch the auto-send without going through initialDraft.
  const autoSendSeedRef = useRef<string | null>(null);
  const autoSendAttachmentsRef = useRef<ChatAttachment[] | null>(null);
  const autoSendFirstMessageRef = useRef(false);
  if (autoSendSeedRef.current === null) {
    let isAutoSend = false;
    try {
      isAutoSend = Boolean(
        window.sessionStorage.getItem(autoSendFirstMessageKey(project.id)),
      );
    } catch {
      /* sessionStorage may be unavailable; treat as manual flow. */
    }
    autoSendFirstMessageRef.current = isAutoSend;
    autoSendSeedRef.current = isAutoSend ? (project.pendingPrompt ?? '') : '';
    autoSendAttachmentsRef.current = isAutoSend ? readAutoSendAttachments(project.id) : [];
  }
  const [initialDraft, setInitialDraft] = useState<
    { projectId: string; value: string } | undefined
  >(
    autoSendSeedRef.current || !project.pendingPrompt
      ? undefined
      : { projectId: project.id, value: project.pendingPrompt },
  );
  useEffect(() => {
    const pendingPrompt = project.pendingPrompt;
    if (!pendingPrompt) return;
    if (autoSendFirstMessageRef.current) {
      onClearPendingPrompt();
      return;
    }
    setInitialDraft((current) =>
      current?.projectId === project.id
        ? current
        : { projectId: project.id, value: pendingPrompt },
    );
    onClearPendingPrompt();
  }, [project.id, project.pendingPrompt, onClearPendingPrompt]);
  const chatInitialDraft =
    chatSeed?.value ?? (initialDraft?.projectId === project.id ? initialDraft.value : undefined);

  // Continue in CLI / Finalize design package handlers + keyboard
  // shortcut wiring. Close to the JSX so the data flow is easy to
  // trace from the toolbar back to its sources.
  const handleFinalize = useCallback(() => {
    const request = buildFinalizeRequest(config);
    if (!request) {
      setProjectActionsToast(buildFinalizeCredentialsMissingToast(config));
      return;
    }
    void finalize.trigger(request).then((result) => {
      if (result) void designMdState.refresh();
    });
  }, [finalize, config, designMdState]);

  const handleCancelFinalize = useCallback(() => {
    finalize.cancel();
  }, [finalize]);

  const handleContinueInCli = useCallback(async () => {
    const projectDir = projectDetail.resolvedDir;
    if (!projectDir) {
      setProjectActionsToast({
        message: 'Working directory unavailable. Update the daemon to enable Continue in CLI.',
        details: null,
      });
      return;
    }
    const prompt = buildClipboardPrompt({
      project: { id: project.id, name: project.name },
      designMdState: {
        generatedAt: designMdState.generatedAt,
        transcriptMessageCount: designMdState.transcriptMessageCount,
        designSystemId: designMdState.designSystemId,
        currentArtifact: designMdState.currentArtifact,
      },
      projectDir,
    });
    const copied = await copyToClipboard(prompt);
    if (!copied) {
      // Clipboard write failed in both the canonical and execCommand
      // fallback paths (locked clipboard / insecure context). Surface
      // the prompt body in the toast so the user can manually
      // select-and-copy. Do not open the folder — the user has nothing
      // to paste yet.
      setProjectActionsToast({
        message: 'Clipboard unavailable. Copy this prompt manually, then run `claude` at the working directory.',
        details: `Working directory: ${projectDir}`,
        code: prompt,
      });
      return;
    }
    const launched = await terminalLauncher.open(project.id);
    setProjectActionsToast(buildContinueInCliToast(projectDir, launched));
  }, [
    project.id,
    project.name,
    projectDetail.resolvedDir,
    designMdState.generatedAt,
    designMdState.transcriptMessageCount,
    designMdState.designSystemId,
    designMdState.currentArtifact,
    terminalLauncher,
  ]);

  // Defensive: if the conversation already has messages once they
  // hydrate, the pendingPrompt that seeded the composer is stale (the
  // user sent it earlier but onClearPendingPrompt did not get a chance
  // to patch the server before the page reloaded). Drop the seed so the
  // textarea does not echo a prompt the user already submitted.
  useEffect(() => {
    if (initialDraft && messages.length > 0) {
      setInitialDraft(undefined);
    }
  }, [initialDraft, messages.length]);

  // §8.4 — when the project was created with a plugin pinned (the
  // PluginLoopHome → POST /api/projects path), fetch the immutable
  // snapshot once so ChatPane can render the active plugin as a
  // context chip on user messages instead of re-rendering the inline
  // plugin rail. Re-fetches when the pinned id changes; cancelled if
  // the project switches away mid-flight to avoid setState-on-unmount.
  const [activePluginSnapshot, setActivePluginSnapshot] =
    useState<AppliedPluginSnapshot | null>(null);
  const [contextPluginDetails, setContextPluginDetails] =
    useState<InstalledPluginRecord | null>(null);
  const [contextDesignSystemDetails, setContextDesignSystemDetails] =
    useState<DesignSystemSummary | null>(null);
  useEffect(() => {
    const snapshotId = project.appliedPluginSnapshotId;
    if (!snapshotId) {
      setActivePluginSnapshot(null);
      return;
    }
    let cancelled = false;
    void fetchAppliedPluginSnapshot(snapshotId).then((snap) => {
      if (cancelled) return;
      setActivePluginSnapshot(snap);
    });
    return () => {
      cancelled = true;
    };
  }, [project.appliedPluginSnapshotId]);
  const handleOpenContextPluginDetails = useCallback(async (pluginId: string) => {
    const normalizedId = pluginId.trim();
    if (!normalizedId) return;
    const plugins = await listPlugins({ includeHidden: true });
    const record = plugins.find((plugin) => plugin.id === normalizedId);
    if (record) setContextPluginDetails(record);
  }, []);
  const chatDesignSystemSummary = useMemo(() => {
    if (activeDesignSystemSummary) return activeDesignSystemSummary;
    const designSystemName = activePluginSnapshot?.inputs?.designSystem;
    if (typeof designSystemName !== 'string') return null;
    const normalized = designSystemName.trim();
    if (!normalized || normalized === 'the active project design system') return null;
    return designSystems.find((d) => d.title === normalized) ?? null;
  }, [activeDesignSystemSummary, activePluginSnapshot?.inputs, designSystems]);

  // Lift finalize errors into the shared project-actions toast so the
  // user sees both the daemon's category message and any upstream
  // detail (per #450 verification commitment).
  useEffect(() => {
    if (finalize.error) {
      setProjectActionsToast({
        message: finalize.error.message,
        details: finalize.error.details,
      });
    }
  }, [finalize.error]);

  // ⌘+Shift+K (mac) / Ctrl+Shift+K (others) → Continue in CLI. Mirrors
  // the capture-phase, platform-gated pattern from FileWorkspace's
  // Quick Switcher shortcut. ⌘+Shift+K is free (⌘+P is the only
  // existing primary-modifier shortcut on this surface).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (primary && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        if (e.isComposing) return;
        if (!designMdState.exists) return;
        e.preventDefault();
        void handleContinueInCli();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [designMdState.exists, handleContinueInCli]);

  // PluginLoopHome auto-send: when the user submits on Home, app.tsx
  // sets `sessionStorage['od:auto-send-first:<projectId>']` and routes
  // through createProject. Once the conversation id resolves and the
  // composer is mounted, fire handleSend(pendingPrompt) exactly once so
  // the user lands inside a running pipeline without an extra click.
  // We gate on `messages.length === 0` so a refresh after the run is
  // mid-flight never double-fires; the sessionStorage flag is cleared
  // immediately after the first dispatch.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    if (!activeConversationId) return;
    // Wait for the initial listMessages DB read to land. Without this gate
    // the auto-send fires before the in-flight DB response, which then
    // arrives with `setMessages([])` and wipes the freshly-pushed user +
    // assistant placeholder out of React state — leaving the daemon's run
    // with no in-memory message to attach the runId to.
    if (!messagesInitialized) return;
    if (streaming) return;
    if (messages.length > 0) return;
    let flag: string | null = null;
    try {
      flag = window.sessionStorage.getItem(autoSendFirstMessageKey(project.id));
    } catch {
      flag = null;
    }
    if (!flag) return;
    // Prefer the seed captured at mount (autoSendSeedRef) — it survives
    // even after onClearPendingPrompt wipes project.pendingPrompt on the
    // server. Fall back to the live values for any edge case where the
    // ref was not populated (e.g. sessionStorage error path).
    const seed = (
      autoSendSeedRef.current ||
      (initialDraft?.projectId === project.id ? initialDraft.value : '') ||
      project.pendingPrompt ||
      ''
    ).trim();
    const attachments = autoSendAttachmentsRef.current ?? [];
    if (!seed && attachments.length === 0) {
      autoSentRef.current = true;
      clearAutoSendSession(project.id);
      return;
    }
    autoSentRef.current = true;
    if (isDesignSystemWorkspaceMetadata(project.metadata)) {
      markDesignSystemAuditAutoRepairEligible(project.id);
    }
    clearAutoSendSession(project.id);
    autoSendAttachmentsRef.current = [];
    // Home Canvas/Drive → create pins selectedDeckTemplate* on project
    // metadata, but also pass them on this-turn meta so the first BYOK
    // compose cannot lose the pick if React state is still settling.
    const selected = selectedDeckTemplateMetadata(project.metadata);
    void handleSend(seed, attachments, [], {
      skipDiscoveryBrief:
        project.metadata?.skipDiscoveryBrief === true || Boolean(selected),
      ...(selected
        ? {
            selectedDeckTemplateId: selected.id,
            selectedDeckTemplateTitle: selected.title,
            skillIds: [selected.id],
            context: {
              pluginIds: [CANVAS_CREATE_SLIDES_PLUGIN_ID],
              skillIds: [selected.id],
            },
          }
        : {}),
    });
  }, [
    activeConversationId,
    messagesInitialized,
    streaming,
    messages.length,
    project.id,
    project.metadata,
    initialDraft,
    project.pendingPrompt,
    handleSend,
  ]);

  // Wire the Critique Theater drop-in mount into the project workspace.
  // The hook reads the M1 Settings toggle out of the existing
  // `open-design:config` localStorage blob and stays in sync with the
  // platform `storage` event (cross-tab) plus the same-tab
  // `open-design:critique-theater-toggle` CustomEvent. The mount itself
  // returns `null` until the daemon emits a `critique.run_started` for
  // the active project, so the visual surface is unchanged for users
  // who have not opted in. The daemon-side gate
  // (`isCritiqueEnabled(...)` in `apps/daemon/src/server.ts`) is the
  // authority for whether a run is actually wired through the critique
  // pipeline; this hook only governs whether the web layer renders the
  // resulting SSE stream.
  const critiqueTheaterEnabled = useCritiqueTheaterEnabled();

  // CLI / agent selector lives below the chat conversation (composer footer),
  // not in the top-right header.
  const executionControls = (
    <AvatarMenu
      config={config}
      agents={agents}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onOpen={() => {
        trackComposerBarClick(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_selector_open',
          ...(project?.id ? { project_id: project.id } : {}),
        });
      }}
      onAgentChange={(id) => {
        trackComposerBarClick(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_select',
          agent_id: id,
          ...(project?.id ? { project_id: project.id } : {}),
        });
        onAgentChange(id);
      }}
      onAgentModelChange={(agentId, choice) => {
        trackComposerBarClick(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_model_select',
          agent_id: agentId,
          ...(choice?.model ? { model_id: choice.model } : {}),
          ...(project?.id ? { project_id: project.id } : {}),
        });
        onAgentModelChange(agentId, choice);
      }}
      onApiModelChange={(model) => {
        trackComposerBarClick(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_model_select',
          model_id: model,
          ...(project?.id ? { project_id: project.id } : {}),
        });
        onApiModelChange?.(model);
      }}
      onOpenSettings={onOpenSettings}
      onRefreshAgents={onRefreshAgents}
      placement="up"
    />
  );

  return (
    <div className="app">
      <CritiqueTheaterMount
        projectId={project.id}
        enabled={critiqueTheaterEnabled}
      />
      {/* ProjectActionsToolbar removed per 00efdcba — hide finalize-design
          toolbar from project header. Restore from cf1cd9bb if product
          wants the Finalize + Continue-in-CLI buttons back in the chrome. */}
      <div
        ref={splitRef}
        className={[
          projectSplitClassName(workspaceFocused),
          leftInspectorActive && !workspaceFocused ? 'split-manual-edit' : '',
          resizingChatPanel && !workspaceFocused ? 'is-resizing-chat' : '',
        ].filter(Boolean).join(' ')}
        style={projectSplitStyle(workspaceFocused, splitLeftPanelWidth, workspacePanelTrack)}
      >
        <div className="split-chat-slot" hidden={workspaceFocused}>
          {commentInspectorActive ? (
            <div
              id={commentInspectorPortalId}
              className="comment-left-host"
              aria-label={t('chat.tabComments')}
            />
          ) : activeConversationId || conversationLoadError ? (
              <ChatPane
              // The conversation id is part of the key so switching conversations
              // resets internal scroll/draft state inside ChatPane and ChatComposer.
              key={`${project.id}:${activeConversationId ?? 'conversation-unavailable'}:${chatSeed?.id ?? 'ready'}`}
              messages={messages}
              streaming={currentConversationStreaming}
              liveToolInput={liveToolInput}
              loading={currentConversationLoading}
              sendDisabled={currentConversationSendDisabled}
              queuedItems={currentConversationQueuedItems}
              error={conversationLoadError ?? error ?? audioVoiceOptionsError}
              projectId={project.id}
              sessionMode={activeSessionMode}
              onSessionModeChange={handleActiveConversationSessionModeChange}
              projectKindForTracking={projectKindToTracking(project.metadata?.kind, project.metadata?.videoModel)}
              projectFiles={projectFiles}
              activeProjectFileName={activeProjectFileName}
              hasActiveDesignSystem={!!project.designSystemId}
              activeDesignSystem={chatDesignSystemSummary}
              projectFileNames={projectFileNames}
              skills={chatComposerSkills}
              onEnsureProject={handleEnsureProject}
              onProjectFilesMaybeChanged={() => {
                void refreshWorkspaceItems().catch(() => undefined);
              }}
              previewComments={previewComments}
              attachedComments={attachedComments}
              onAttachComment={attachPreviewComment}
              onDetachComment={detachPreviewComment}
              onDeleteComment={(commentId) => void removePreviewComment(commentId)}
              onSend={handleSend}
              onRetry={handleRetry}
              onResumeRun={handleResumeRun}
              autoContinuePending={autoContinuePending}
              onStop={handleStop}
              onRemoveQueuedSend={removeQueuedChatSend}
              onUpdateQueuedSend={updateQueuedChatSend}
              onReorderQueuedSends={reorderCurrentConversationQueuedChatSends}
              onSendQueuedNow={sendQueuedChatSendNow}
              onRequestOpenFile={requestOpenFile}
              onRequestPluginDetails={handleOpenContextPluginDetails}
              onRequestDesignSystemDetails={setContextDesignSystemDetails}
              onRequestPluginFolderAgentAction={handlePluginFolderAgentAction}
              activePluginActionPaths={activePluginActionPaths}
              hiddenPluginActionPaths={hiddenAssistantPluginActionPaths}
              onShareToOpenDesign={hideExternalShareSurfaces ? undefined : handleShareToOpenDesign}
              shareToOpenDesignBusyMessageId={hideExternalShareSurfaces ? null : shareToOpenDesignBusyMessageId}
              forceStreamingMessageIds={forceStreamingPluginMessageIds}
              initialDraft={chatInitialDraft}
              onOpenQuestions={openQuestionsTab}
              onContinueRemainingTasks={handleContinueRemainingTasks}
              onAssistantFeedback={handleAssistantFeedback}
              onArtifactShare={handleArtifactShare}
              onArtifactDownload={handleArtifactDownload}
              onForkFromMessage={handleForkFromMessage}
              forkingMessageId={forkingMessageId}
              onNewConversation={handleNewConversation}
              newConversationDisabled={newConversationDisabled}
              conversations={conversations}
              activeConversationId={activeConversationId}
              messagesConversationId={messagesConversationId}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              config={config}
              onOpenSettings={onOpenSettings}
              showByokRecoveryAction={
                !hideStudioExecutionControls &&
                config.mode === 'api' &&
                daemonLive &&
                (
                  (!config.apiKey.trim() && !config.apiKeyConfigured) ||
                  !config.baseUrl.trim() ||
                  !config.model.trim()
                )
              }
              onSwitchToLocalCli={
                hideStudioExecutionControls
                  ? undefined
                  : () => {
                      setError(null);
                      onModeChange('daemon');
                    }
              }
              onOpenAmrSettings={onOpenAmrSettings}
              onSwitchToAmrAndRetry={handleSwitchToAmrAndRetry}
              onLaunchAntigravityOauth={handleLaunchAntigravityOauth}
              onOpenMcpSettings={onOpenMcpSettings}
              onBrowsePlugins={onBrowsePlugins}
              onOpenConnectors={onOpenConnectors}
              connectRepoNeeded={connectRepoNeeded}
              githubConnected={githubConnected}
              onConnectRepo={handleConnectRepo}
              composerDraftSignal={composerDraftSignal}
              petConfig={config.pet}
              onAdoptPet={onAdoptPetInline}
              onTogglePet={onTogglePet}
              onOpenPetSettings={onOpenPetSettings}
              researchAvailable={config.mode === 'daemon'}
              byokApiProtocol={config.apiProtocol}
              byokImageModel={byokImageModelOverride}
              onChangeByokImageModel={setByokImageModelOverride}
              byokVideoModel={byokVideoModelOverride}
              onChangeByokVideoModel={setByokVideoModelOverride}
              byokSpeechModel={byokSpeechModelOverride}
              onChangeByokSpeechModel={setByokSpeechModelOverride}
              byokSpeechVoice={byokSpeechVoiceOverride}
              onChangeByokSpeechVoice={setByokSpeechVoiceOverride}
              projectMetadata={project.metadata}
              onProjectMetadataChange={(metadata) => {
                onProjectChange({ ...project, metadata });
              }}
              activeWorkspaceContext={activeWorkspaceContext}
              workspaceContexts={workspaceContexts}
              currentSkillId={project.skillId}
              onProjectSkillChange={(skillId) => {
                onProjectChange({ ...project, skillId });
              }}
              activePluginSnapshot={activePluginSnapshot}
              currentDesignSystemId={project.designSystemId}
              onActiveDesignSystemChange={(updatedProject) => {
                onProjectChange(updatedProject);
              }}
              onShowToast={(message) => {
                setProjectActionsToast({ message, details: null });
              }}
              embedSlideDesignSystemFallbackId={embedSlideDesignSystemFallbackId}
              chatInsetBanner={
                isTeamverEmbedMode()
                && shouldShowRunRecoveryBannerInChat({
                  banner: runRecoveryBanner,
                  activeConversationId,
                  conversationStreaming: currentConversationStreaming,
                }) ? (
                  <TeamverRunRecoveryBanner
                    phase={runRecoveryBanner!.phase}
                    savedChars={runRecoveryBanner!.savedChars}
                    runStatus={runRecoveryBanner!.runStatus}
                  />
                ) : null
              }
              onBack={isTeamverEmbedMode() ? undefined : onBack}
              backLabel={isTeamverEmbedMode() ? undefined : t('project.backToProjects')}
              composerFooterAccessory={
                hideStudioExecutionControls ? undefined : executionControls
              }
              projectHeader={(
                <span className="chat-project-title-line chat-project-title-edit">
                  <span
                    ref={projectTitleEditRef}
                    className="title editable"
                    data-testid="project-title"
                    title={project.name}
                    aria-label={t('common.rename')}
                    tabIndex={0}
                    role="textbox"
                    suppressContentEditableWarning
                    contentEditable
                    onBlur={(e) => handleProjectRename(e.currentTarget.textContent ?? '')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).blur();
                      }
                    }}
                  >
                    {project.name}
                  </span>
                  <button
                    type="button"
                    className="chat-project-title-rename"
                    data-testid="project-title-rename"
                    aria-label={t('common.rename')}
                    title={t('common.rename')}
                    onClick={focusProjectTitleForRename}
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                  {projectMeta !== t('project.metaFreeform') ? (
                    <span className="meta" data-testid="project-meta">{projectMeta}</span>
                  ) : null}
                </span>
              )}
              designSystemPicker={(
                <DesignSystemPicker
                  designSystems={designSystems}
                  selectedId={project.designSystemId ?? null}
                  onChange={handleChangeDesignSystemId}
                  onRequestDesignSystems={onDesignSystemsRefresh}
                />
              )}
            />
          ) : (
            <div className="pane" data-testid="chat-pane-loading">
              <CenteredLoader label={t('common.loading')} />
            </div>
          )}
        </div>
        {!workspaceFocused ? (
          leftInspectorActive ? (
            <div className="split-edit-divider" aria-hidden />
          ) : (
            <div
              className="split-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label={chatResizeLabel}
              aria-valuemin={chatPanelAriaMinWidth}
              aria-valuemax={chatPanelMaxWidth}
              aria-valuenow={chatPanelWidth}
              tabIndex={0}
              title={chatResizeLabel}
              onPointerDown={handleChatResizePointerDown}
              onKeyDown={handleChatResizeKeyDown}
              onBlur={handleChatResizeBlur}
            />
          )
        ) : null}
        <FileWorkspace
          projectId={project.id}
          projectKind={projectKindToTracking(project.metadata?.kind, project.metadata?.videoModel) ?? 'prototype'}
          projectDisplayName={project.name}
          rootDirName={designFilesRootLabel}
          reloading={false}
          resolvedDir={hideLocalWorkspaceControls ? null : projectDetail.resolvedDir}
          files={projectFiles}
          liveArtifacts={liveArtifacts}
          filesRefreshKey={filesRefresh}
          onRefreshFiles={refreshWorkspaceItems}
          onFilesDeleted={removeProjectFilesLocally}
          isDeck={isDeck}
          onExportAsPptx={handleExportAsPptx}
          streaming={currentConversationActionDisabled}
          previewStreaming={previewPanelStreaming}
          commentQueueOnSend={commentQueueOnSend}
          commentSendDisabled={currentConversationQueueDisabled}
          openRequest={openRequest}
          shareRequest={shareRequest}
          downloadRequest={downloadRequest}
          slideNavRequest={slideNavRequest}
          liveArtifactEvents={liveArtifactEvents}
          designSystemActivityEvents={designSystemActivityEvents}
          tabsState={openTabsState}
          onTabsStateChange={persistTabsState}
          previewComments={previewComments}
          onSavePreviewComment={savePreviewComment}
          onRemovePreviewComment={removePreviewComment}
          onSendBoardCommentAttachments={handleSendBoardCommentAttachments}
          onRequestBrowserUsePrompt={handleBrowserUsePrompt}
          onPluginFolderAgentAction={handlePluginFolderAgentAction}
          activePluginActionPaths={activePluginActionPaths}
          preferredPreviewFile={project.metadata?.entryFile ?? null}
          autoPreviewDesignArtifacts={project.metadata?.importedFrom === 'folder'}
          focusMode={workspaceFocused}
          onFocusModeChange={setWorkspaceFocused}
          designSystemProject={designSystemProject}
          defaultDesignSystemId={config.designSystemId}
          onSetDefaultDesignSystem={onChangeDefaultDesignSystem}
          onDesignSystemsRefresh={onDesignSystemsRefresh}
          onDesignSystemNeedsWork={sendDesignSystemFeedback}
          designSystemReview={project.metadata?.designSystemReview}
          onDesignSystemReviewDecision={persistDesignSystemReviewDecision}
          onConnectRepo={handleConnectRepo}
          githubConnected={githubConnected}
          commentPortalId={commentInspectorPortalId}
          onCommentModeChange={setCommentInspectorActive}
          chatConfig={config}
          chatAgentsById={agentsById}
          chatLocale={locale}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          onConversationSessionModeChange={handleConversationSessionModeChange}
          onNewConversation={handleNewConversation}
          activeConversationChat={activeConversationChatState}
          onActiveContextChange={handleActiveWorkspaceContextChange}
          onWorkspaceContextsChange={handleWorkspaceContextsChange}
          messages={messages}
          artifactHtml={artifact?.html}
          previewHealAttachmentPaths={previewHealAttachmentPaths}
          pendingArtifactRecovery={pendingRecoveryPreview}
          conversationError={error}
          onRetry={handleRetry}
          onAuthorizeAndRetry={handleSwitchToAmrAndRetry}
          onLaunchTerminalAuth={handleLaunchAntigravityOauth}
          conversationId={activeConversationId}
          headerActions={(
            <>
              {!hideHandoffButton ? (
                <HandoffButton
                  projectId={project.id}
                  projectName={project.name}
                  projectDir={projectDetail.resolvedDir}
                  agents={agents}
                  artifactId={headerArtifact.artifact_id}
                  artifactKind={headerArtifact.artifact_kind}
                />
              ) : null}
              <EntrySettingsMenu
                config={config}
                onThemeChange={handleThemeChange}
                onOpenSettings={onOpenSettings}
                trackingPageName="artifact"
                onTrackTriggerClick={() => {
                  // Spec row 52: the settings gear in the artifact header.
                  // Carry the active artifact so settings slices line up with
                  // the rest of the artifact_header funnel.
                  trackArtifactHeaderClick(analytics.track, {
                    page_name: 'artifact',
                    area: 'artifact_header',
                    element: 'settings',
                    ...headerArtifact,
                  });
                }}
              />
            </>
          )}
          questionForm={displayedQuestionForm}
          questionFormPreview={displayedQuestionFormPreview}
          questionFormKey={displayedQuestionFormKey}
          questionFormInteractive={displayedQuestionFormActive}
          questionFormSubmitDisabled={currentConversationActionDisabled}
          questionFormSubmittedAnswers={displayedQuestionFormSubmittedAnswers}
          questionsGenerating={displayedQuestionsGenerating}
          focusQuestionsRequest={focusQuestionsRequest}
          onSubmitQuestionForm={(text) => {
            if (currentConversationActionDisabled) return;
            void handleSend(text, [], []);
          }}
        />
      </div>
      {contextPluginDetails ? (
        <PluginDetailsModal
          record={contextPluginDetails}
          onClose={() => setContextPluginDetails(null)}
          onUse={() => setContextPluginDetails(null)}
          isApplying={false}
          hideUseAction
        />
      ) : null}
      {contextDesignSystemDetails ? (
        <DesignSystemPreviewModal
          system={contextDesignSystemDetails}
          onClose={() => setContextDesignSystemDetails(null)}
        />
      ) : null}
      <AnimatePresence>
        {projectActionsToast && typeof document !== 'undefined' ? createPortal(
          <Toast
            message={projectActionsToast.message}
            details={projectActionsToast.details}
            code={projectActionsToast.code}
            actionLabel={projectActionsToast.actionLabel}
            onAction={projectActionsToast.onAction}
            tone={projectActionsToast.actionLabel ? 'success' : 'default'}
            layout={projectActionsToast.actionLabel ? 'compact' : 'default'}
            ttlMs={projectActionsToast.actionLabel ? 8000 : undefined}
            onDismiss={() => setProjectActionsToast(null)}
          />,
          document.body,
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function artifactExtensionFor(art: Artifact): '.html' | '.jsx' | '.tsx' {
  const type = (art.artifactType || '').toLowerCase();
  const identifier = (art.identifier || '').toLowerCase();
  if (type.includes('tsx') || identifier.endsWith('.tsx')) return '.tsx';
  if (type.includes('jsx') || type.includes('react') || identifier.endsWith('.jsx')) {
    return '.jsx';
  }
  return '.html';
}

function artifactBaseNameFor(art: Artifact): string {
  return (
    (art.identifier || art.title || 'artifact')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'artifact'
  );
}

export function findExistingArtifactProjectFile(
  art: Artifact,
  projectFiles: ProjectFile[],
  options: { minMtime?: number } = {},
): ProjectFile | null {
  const ext = artifactExtensionFor(art);
  const baseName = artifactBaseNameFor(art);
  const candidateFileName = `${baseName}${ext}`;
  const minMtime = options.minMtime;
  const currentRunFiles = typeof minMtime === 'number' && Number.isFinite(minMtime)
    ? projectFiles.filter((file) => file.mtime >= minMtime)
    : projectFiles;

  if (ext === '.html') {
    const pointerTarget = resolveHtmlPointerArtifactTarget({
      content: art.html,
      candidateFileName,
      projectFiles: currentRunFiles,
    });
    const pointerFile = pointerTarget
      ? currentRunFiles.find((file) => file.name === pointerTarget || file.path === pointerTarget)
      : null;
    if (pointerFile) return pointerFile;
  }

  const identifier = art.identifier || '';
  if (identifier) {
    const manifestMatches = currentRunFiles
      .filter((file) => file.artifactManifest?.metadata?.identifier === identifier)
      .sort((a, b) => b.mtime - a.mtime);
    if (manifestMatches[0]) return manifestMatches[0];
  }

  return currentRunFiles.find((file) => file.name === candidateFileName) ?? null;
}

export function selectPrimaryProjectFile(files: ProjectFile[]): ProjectFile | null {
  const candidates = files
    .filter((file) => !isProcessArtifactFile(file.name))
    .map((file) => ({ file, rank: primaryProjectFileRank(file) }))
    .filter((candidate) => Number.isFinite(candidate.rank));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.rank - b.rank || b.file.mtime - a.file.mtime);
  return candidates[0]?.file ?? null;
}

function isProcessArtifactFile(name: string): boolean {
  const base = name.split('/').pop()?.toLowerCase() ?? name.toLowerCase();
  return (
    base === 'critique.json'
    || base.endsWith('.log')
    || base.endsWith('.meta.json')
    || base.endsWith('.artifact.json')
    || base.endsWith('.map')
  );
}

function primaryProjectFileRank(file: ProjectFile): number {
  if (manifestDeclaresPrimary(file)) return 0;
  if (file.artifactManifest && file.artifactManifest.metadata?.inferred !== true) return 1;
  if (file.kind === 'html') return 2;
  if (file.kind === 'image') return 3;
  if (file.kind === 'video') return 4;
  if (file.kind === 'sketch') return 5;
  if (file.kind === 'pdf') return 6;
  if (file.kind === 'presentation') return 7;
  if (file.kind === 'document') return 8;
  if (file.kind === 'spreadsheet') return 9;
  return Number.POSITIVE_INFINITY;
}

function manifestDeclaresPrimary(file: ProjectFile): boolean {
  const manifest = file.artifactManifest;
  if (!manifest) return false;
  if (primaryValueTargetsFile(manifest.primary, file.name)) return true;
  const metadata = manifest.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  if (primaryValueTargetsFile(metadata.primary, file.name)) return true;
  const outputs = metadata.outputs;
  if (outputs && typeof outputs === 'object' && !Array.isArray(outputs)) {
    return primaryValueTargetsFile(
      (outputs as { primary?: unknown }).primary,
      file.name,
    );
  }
  return false;
}

function primaryValueTargetsFile(value: unknown, fileName: string): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return normalizeProjectFileName(value) === normalizeProjectFileName(fileName);
}

function normalizeProjectFileName(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

function assistantAgentDisplayName(
  agentId: string | null,
  fallbackName?: string,
): string | undefined {
  return agentDisplayName(agentId, fallbackName) ?? undefined;
}

function isTerminalRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

const QUEUED_CHAT_SENDS_STORAGE_VERSION = 1;

function queuedChatSendsStorageKey(projectId: string): string {
  return `od:chat-queued-sends:${projectId}:v${QUEUED_CHAT_SENDS_STORAGE_VERSION}`;
}

function loadQueuedChatSends(projectId: string): QueuedChatSend[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(queuedChatSendsStorageKey(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedChatSend).slice(0, 100);
  } catch {
    return [];
  }
}

function saveQueuedChatSends(projectId: string, items: QueuedChatSend[]): void {
  if (typeof window === 'undefined') return;
  try {
    const key = queuedChatSendsStorageKey(projectId);
    if (items.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(items.slice(0, 100)));
  } catch {
    // Ignore private-mode/quota failures. The in-memory queue still works.
  }
}

function isQueuedChatSend(value: unknown): value is QueuedChatSend {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return false;
  const record = value as Partial<QueuedChatSend>;
  return (
    typeof record.id === 'string' &&
    typeof record.conversationId === 'string' &&
    typeof record.prompt === 'string' &&
    Array.isArray(record.attachments) &&
    Array.isArray(record.commentAttachments) &&
    typeof record.createdAt === 'number'
  );
}

function stripQueueOnlyFromMeta(meta: ChatSendMeta | undefined): ProjectChatSendMeta | undefined {
  if (!meta) return undefined;
  const { queueOnly: _queueOnly, drainQueuedSend: _drainQueuedSend, ...rest } = meta;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

export interface RetryTarget {
  failedAssistant: ChatMessage;
  userMsg: ChatMessage;
  priorMessages: ChatMessage[];
  preservedAttempts: ChatMessage[];
}

export function resolveRetryTarget(
  messages: ChatMessage[],
  failedAssistantId: string,
): RetryTarget | null {
  const failedIndex = messages.findIndex(
    (message) =>
      message.id === failedAssistantId &&
      message.role === 'assistant' &&
      message.runStatus === 'failed',
  );
  if (failedIndex <= 0 || failedIndex !== messages.length - 1) return null;

  let userIndex = failedIndex - 1;
  while (
    userIndex >= 0 &&
    messages[userIndex]?.role === 'assistant' &&
    messages[userIndex]?.runStatus === 'failed'
  ) {
    userIndex -= 1;
  }

  const userMsg = messages[userIndex];
  const failedAssistant = messages[failedIndex];
  if (!userMsg || userMsg.role !== 'user' || !failedAssistant) return null;

  return {
    failedAssistant,
    userMsg,
    priorMessages: messages.slice(0, userIndex),
    preservedAttempts: messages.slice(userIndex + 1, failedIndex + 1),
  };
}

function latestDesignSystemActivityEvents(messages: ChatMessage[]): AgentEvent[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'assistant') continue;
    if ((message.events?.length ?? 0) > 0) return message.events ?? [];
    if (isActiveRunStatus(message.runStatus)) return [];
  }
  return [];
}

function pluginWorkflowTitle(action: PluginFolderAgentAction): string {
  return action === 'publish' ? 'Publish repo' : 'Open Design PR';
}

function pluginWorkflowCliCommand(action: PluginFolderAgentAction, relativePath: string): string {
  return action === 'publish'
    ? `od plugin publish-repo ${relativePath}`
    : `od plugin open-design-pr ${relativePath}`;
}

function pluginWorkflowPlannedSteps(action: PluginFolderAgentAction): string[] {
  if (action === 'publish') {
    return [
      'Resolve GitHub owner and validate plugin metadata',
      'Create or update the GitHub repository',
      'Push plugin files and tags',
      'Return the repository URL',
    ];
  }
  return [
    'Ensure the Open Design fork exists',
    'Clone the fork and prepare a branch',
    'Copy the plugin into plugins/community',
    'Push the branch and open the PR form',
  ];
}

function pluginWorkflowPlannedEvents(action: PluginFolderAgentAction, relativePath: string): AgentEvent[] {
  return [
    { kind: 'text', text: `${pluginWorkflowStartContent(action, relativePath)}\n\n` },
    { kind: 'status', label: 'working', detail: pluginWorkflowTitle(action) },
  ];
}

function pluginWorkflowResultEvents(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  url: string | undefined,
  log: string[] | undefined,
  ok: boolean,
  existingEvents?: AgentEvent[],
): AgentEvent[] {
  const summary = ok
    ? pluginWorkflowSuccessContent(action, relativePath, message, url, log)
    : pluginWorkflowFailureContent(action, relativePath, message, log);
  const baseEvents = (existingEvents ?? []).filter(
    (event) => !(event.kind === 'status' && event.label === 'working'),
  );
  return [
    ...baseEvents,
    { kind: 'text', text: `${summary}\n\n` },
    {
      kind: 'status',
      label: ok ? 'done' : 'failed',
      detail: ok ? 'CLI command finished' : 'CLI command failed',
    },
  ];
}

function pluginWorkflowStartContent(action: PluginFolderAgentAction, relativePath: string): string {
  const title = pluginWorkflowTitle(action);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const steps = pluginWorkflowPlannedSteps(action).map((step) => `- ${step}`).join('\n');
  return `${title} started.\n\n\`\`\`bash\n${command}\n\`\`\`\n\nPlanned steps:\n${steps}`;
}

function pluginWorkflowSuccessContent(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  url?: string,
  log?: string[],
): string {
  const summary = stripTrailingUrl(message, url) || `${pluginWorkflowTitle(action)} completed for \`${relativePath}\`.`;
  const lines = (log ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 5);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const details = lines.length > 0
    ? `\n\nCLI output:\n${lines.map((line) => `- \`${truncatePluginWorkflowLine(line)}\``).join('\n')}`
    : '';
  const link = url ? `\n\nLink: [${url}](${url})` : '';
  return `${summary}\n\n\`\`\`bash\n${command}\n\`\`\`${link}${details}`;
}

function pluginWorkflowFailureContent(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  log?: string[],
): string {
  const lines = (log ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 5);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const details = lines.length > 0
    ? `\n\nCLI output:\n${lines.map((line) => `- \`${truncatePluginWorkflowLine(line)}\``).join('\n')}`
    : '';
  return `${pluginWorkflowTitle(action)} failed.\n\n\`\`\`bash\n${command}\n\`\`\`\n\n${message}${details}`;
}

function truncatePluginWorkflowLine(line: string): string {
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

function stripTrailingUrl(message: string, url?: string): string {
  const text = message.trim();
  const link = url?.trim();
  if (!link) return text;
  return text.replace(new RegExp(`\\s*${escapeRegExp(link)}\\s*$`), '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A daemon assistant message that is "queued/running" but has no runId yet
// is in-flight on the client: POST /api/runs has not returned. Persisting it
// in this state creates a phantom DB row that the reattach loop can never
// recover (the daemon either never saw the request or the response was lost),
// which is what produced the "Working 24m+" stuck UI. Treat the in-flight
// window as ephemeral and only write to DB once a runId pins the row to a
// real daemon run — or once the run reaches a terminal state.
function isPhantomDaemonRunMessage(m: ChatMessage): boolean {
  return (
    m.role === 'assistant' &&
    isActiveRunStatus(m.runStatus) &&
    !m.runId
  );
}

function isStoppableAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (isActiveRunStatus(message.runStatus)) return true;
  return message.runStatus === undefined && message.endedAt === undefined && message.startedAt !== undefined;
}

export {
  isRecoverableDaemonRunMessage,
} from '../teamver/backgroundChatRecovery';

export function resolveSucceededRunStatus(status: ChatMessage['runStatus']): ChatMessage['runStatus'] {
  return status === 'failed' || status === 'canceled' ? status : 'succeeded';
}

/** Slide generation/edit turns must not be finalized as "succeeded" without a previewable HTML deck. */
export function shouldFailSlideRunWithoutHtmlDeliverable(
  finalText: string,
  options: { slideOnlyMvp: boolean },
): boolean {
  // Plan-only / "바로 제작하겠습니다" / "완성했습니다" turns with no HTML
  // on disk used to flash "완료됨" while the preview stayed empty
  // (demo-breaking). Cap auto-continue handles recovery; marking these as
  // failed is correct.
  if (!options.slideOnlyMvp) return false;
  const text = finalText.trim();
  if (!text) return false;

  const promiseOnly = looksLikeDeckDeliverablePromiseProse(text);

  const deckIntent =
    looksLikeDeckIntentProse(text);
  if (!deckIntent && !promiseOnly) return false;

  if (looksLikeSlideOutline(text)) return true;

  const looksLikeOutline =
    /슬라이드\s*구성\s*:/.test(text)
    || /목차\s*:/.test(text)
    || /(?:^|\n)\s*구성\s*:/m.test(text)
    || /(?:^|\n)\s*(?:\d{1,2}|0\d)[\.\)\-]\s+\S+/m.test(text);

  return (
    looksLikeOutline
    || promiseOnly
  );
}

/** Terminal slide-only run with no previewable HTML on disk must fail (last-wins auto-open). */
export function shouldFailSlideRunForMissingHtmlDeliverable(options: {
  slideOnlyMvp: boolean;
  producedHtmlToOpen: string | null;
  parsedArtifact: { html?: string } | null;
  liveHtml: string;
  finalText: string;
  terminalArtifactPersistFailed: boolean;
}): boolean {
  // When persist already failed (skipped-incomplete / rejected / save-failed),
  // the caller has already set terminalArtifactPersistFailed — don't double
  // count. Otherwise a slide-only turn with no previewable HTML on disk must
  // fail so we never paint "완료됨" over an empty preview panel.
  if (options.terminalArtifactPersistFailed) return false;
  if (!options.slideOnlyMvp || options.producedHtmlToOpen) return false;

  const artifactHtml = options.parsedArtifact?.html ?? options.liveHtml;
  if (artifactHtml) {
    if (isIncompleteHtmlDocumentShell(artifactHtml)) return true;
    const validation = validateHtmlArtifact(artifactHtml);
    if (!validation.ok) return true;
    // Valid artifact streamed but nothing previewable on disk — fail so we
    // never paint "완료됨" over an empty preview. Prose heuristics must not
    // scan deck HTML for completion-claim words like "완료".
    return true;
  }

  return shouldFailSlideRunWithoutHtmlDeliverable(options.finalText, {
    slideOnlyMvp: true,
  });
}

const DOCTYPE_HTML_TAIL_RE = /<!doctype\s+html[\s\S]*/i;

function artifactFromSalvagedHtml(html: string, base: Artifact): Artifact | null {
  const salvaged = salvageTruncatedHtmlDocument(html);
  // Soft truncation salvage already quality-gated. Do not re-reject with the
  // stricter incomplete-shell ratio (empty placeholders + 1–2 filled slides).
  if (salvaged && validateHtmlArtifact(salvaged).ok) {
    return { ...base, html: salvaged };
  }
  return null;
}

/** True when HTML is strictly complete, or is a soft-salvaged truncated deck. */
function isUsableDeckHtmlArtifact(html: string | null | undefined): boolean {
  const trimmed = String(html ?? '').trim();
  if (!trimmed || !validateHtmlArtifact(trimmed).ok) return false;
  if (!isIncompleteHtmlDocumentShell(trimmed)) return true;
  // Already-closed soft salvage returns null from salvageTruncated — still usable.
  if (isClosedSoftSalvageDeckHtml(trimmed)) return true;
  return Boolean(salvageTruncatedHtmlDocument(trimmed));
}

/** Pick the best HTML artifact candidate for terminal persist / auto-open. */
export function resolveTerminalArtifactToPersist(
  parsedArtifact: Artifact | null,
  finalText: string,
  fromStandalone: (sourceText: string) => Artifact | null,
): Artifact | null {
  const standalone = fromStandalone(finalText);
  const parsed = parsedArtifact?.html ? parsedArtifact : null;
  const doctypeTail = finalText.match(DOCTYPE_HTML_TAIL_RE)?.[0] ?? null;

  if (parsed?.html && isIncompleteHtmlDocumentShell(parsed.html)) {
    const salvagedParsed = artifactFromSalvagedHtml(parsed.html, parsed);
    if (salvagedParsed) return salvagedParsed;
    if (
      standalone?.html
      && !isIncompleteHtmlDocumentShell(standalone.html)
      && validateHtmlArtifact(standalone.html).ok
    ) {
      return standalone;
    }
    // Unclosed artifact body often lands in assistant text after parser.flush();
    // salvage the doctype tail when the live parsed shell is empty/truncated.
    if (doctypeTail) {
      const salvagedText = artifactFromSalvagedHtml(doctypeTail, parsed);
      if (salvagedText) return salvagedText;
    }
    return parsed;
  }
  if (parsed?.html) return parsed;
  if (
    standalone?.html
    && !isIncompleteHtmlDocumentShell(standalone.html)
    && validateHtmlArtifact(standalone.html).ok
  ) {
    return standalone;
  }
  if (doctypeTail) {
    const base: Artifact = {
      identifier: 'response',
      artifactType: 'deck',
      title: 'Response',
      html: doctypeTail,
    };
    const salvagedText = artifactFromSalvagedHtml(doctypeTail, base);
    if (salvagedText) return salvagedText;
  }
  return standalone;
}

export { computeProducedFiles } from '../produced-files';
export {
  resolveSlideProducedHtmlToOpen,
  verifySlideProducedHtmlDeliverable,
} from '../runtime/slide-deliverable-recovery';

// Reattach with a recovered (on-disk) artifact must still include any
// other files the turn produced before the artifact write — replacing
// the diff with a single file was the regression noted on PR #2383.
export function mergeRecoveredArtifact(
  diff: readonly ProjectFile[],
  recovered: ProjectFile | null,
): ProjectFile[] {
  if (!recovered) return [...diff];
  if (diff.some((f) => f.name === recovered.name)) return [...diff];
  return [...diff, recovered];
}

export function projectFileFromPersistedHtmlFallback(
  fileName: string | null,
  persistResult: ArtifactPersistResult | null | undefined,
  mtime = Date.now(),
): ProjectFile | null {
  if (!fileName || !fileName.toLowerCase().endsWith('.html')) return null;
  if (!isEmergencyArtifactPersistSuccess(persistResult)) return null;
  if (persistResult?.fileName !== fileName) return null;
  return {
    name: fileName,
    size: 0,
    mtime,
    kind: 'html',
    mime: 'text/html',
  };
}

export async function findSameTurnHtmlWriteForRecoveredArtifact({
  artifactHtml,
  producedFiles,
  readProjectHtml,
}: {
  artifactHtml: string;
  producedFiles: readonly ProjectFile[];
  readProjectHtml: (name: string) => Promise<string | null>;
  /** Deprecated compatibility: never blind-bind mismatched HTML writes. */
  allowAnyHtmlWrite?: boolean;
}): Promise<ProjectFile | null> {
  const recovered = normalizeHtmlForRecoveredArtifactComparison(artifactHtml);
  if (!recovered) return null;
  const candidates = producedFiles.filter(isHtmlProjectFile);
  for (const file of candidates) {
    const text = await readProjectHtml(file.name);
    if (normalizeHtmlForRecoveredArtifactComparison(text) === recovered) {
      return file;
    }
  }
  return null;
}

function isHtmlProjectFile(file: ProjectFile): boolean {
  const name = (file.path || file.name).toLowerCase();
  return file.kind === 'html' || /\.(?:html?|xhtml)$/u.test(name);
}

function selectTouchedHtmlOutputFromEvents(
  events: readonly AgentEvent[] | undefined,
  filesSnapshot: readonly ProjectFile[],
  options: Parameters<typeof decideAutoOpenAfterWrite>[2] = {},
): string | null {
  if (!events?.length || filesSnapshot.length === 0) return null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event || event.kind !== 'tool_use') continue;
    const toolName = String(event.name || '').toLowerCase();
    if (toolName !== 'write' && toolName !== 'edit') continue;
    const input = event.input as { file_path?: unknown; filePath?: unknown } | null;
    const filePath = input?.file_path ?? input?.filePath;
    if (typeof filePath !== 'string' || filePath.length === 0) continue;
    const decision = decideAutoOpenAfterWrite(filePath, filesSnapshot, options);
    if (!decision.shouldOpen || !decision.fileName) continue;
    const file = filesSnapshot.find((item) => item.name === decision.fileName);
    if (file && isHtmlProjectFile(file)) return decision.fileName;
  }
  return null;
}

function normalizeHtmlForRecoveredArtifactComparison(value: string | null | undefined): string {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export function clearStreamingConversationMarker(
  currentConversationId: string | null,
  completedConversationId?: string | null,
): string | null {
  if (
    completedConversationId !== undefined
    && completedConversationId !== null
    && currentConversationId !== completedConversationId
  ) {
    return currentConversationId;
  }
  return null;
}

export function shouldClearActiveRunRefs(
  currentConversationId: string | null,
  completedConversationId: string,
): boolean {
  return currentConversationId === completedConversationId;
}

export function finalizeActiveAssistantMessagesOnStop(
  messages: ChatMessage[],
  stoppedAt: number,
  sanitizeOptions: SanitizeChatMessageOptions = {},
): { messages: ChatMessage[]; finalized: ChatMessage[] } {
  const finalized: ChatMessage[] = [];
  const next = messages.map((message) => {
    if (!isStoppableAssistantMessage(message)) {
      return message;
    }
    const updated = sanitizeChatMessageLeakedPseudoTool(
      appendErrorStatusEvent(
        {
          ...message,
          runStatus: 'canceled',
          endedAt: message.endedAt ?? stoppedAt,
        },
        'Stopped by user',
        'CANCELED_BY_USER',
      ),
      sanitizeOptions,
    );
    finalized.push(updated);
    return updated;
  });
  return { messages: next, finalized };
}

type BufferedTextUpdates = ReturnType<typeof createBufferedTextUpdates>;

export function createBufferedTextUpdates({
  updateMessage,
  persistSoon,
  flushAndPersistNow,
  onContentDelta,
  onContentRewrite,
  stripCodeFences = false,
}: {
  updateMessage: (updater: (prev: ChatMessage) => ChatMessage) => void;
  persistSoon: () => void;
  // Synchronous flush + persist with a transport that survives page
  // unload (PUT with keepalive). Invoked by the pagehide handler so the
  // last buffered chunk isn't lost when the user reloads mid-stream.
  flushAndPersistNow?: () => void;
  onContentDelta?: (delta: string) => void;
  /**
   * Called when sanitize shrinks/rewrites previously emitted content
   * (non-monotonic). Live artifact parsers must reset and replay the full
   * sanitized snapshot — append-only `onContentDelta` cannot retract bytes.
   */
  onContentRewrite?: (fullContent: string) => void;
  /** Teamver embed: also strip ```html/js fences from the live text channel. */
  stripCodeFences?: boolean;
}) {
  let pendingContentDelta = '';
  let pendingTextEventDelta = '';
  let rawContentForSanitize: string | null = null;
  let rawTextEventForSanitize = '';
  let sanitizedTextEventSent = '';
  let flushFrame: number | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let flushing = false;
  let needsFlush = false;
  const hasDocument = typeof document !== 'undefined';
  const hasWindow = typeof window !== 'undefined';
  const sanitizeStreaming = (text: string) =>
    stripLeakedPseudoToolXml(text, { stripCodeFences });

  const cancelScheduledFlush = () => {
    if (flushFrame !== null) {
      cancelAnimationFrame(flushFrame);
      flushFrame = null;
    }
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const replaceTrailingTextEvents = (
    events: ChatMessage['events'],
    nextText: string,
  ): NonNullable<ChatMessage['events']> => {
    const list = [...(events ?? [])];
    while (list.length > 0 && list[list.length - 1]?.kind === 'text') {
      list.pop();
    }
    if (nextText) {
      list.push({ kind: 'text', text: nextText });
    }
    return list;
  };

  const flush = () => {
    if (disposed) return;
    if (flushing) {
      needsFlush = true;
      return;
    }
    cancelScheduledFlush();
    if (!pendingContentDelta && !pendingTextEventDelta && !needsFlush) return;
    flushing = true;
    needsFlush = false;
    const contentDelta = pendingContentDelta;
    const textEventDelta = pendingTextEventDelta;
    pendingContentDelta = '';
    pendingTextEventDelta = '';
    try {
      let sanitizedContentDelta = '';
      let rewrittenFullContent: string | null = null;
      // Strict Mode / double updater invocation must not append deltas twice.
      let contentAppendedThisFlush = false;
      let textAppendedThisFlush = false;
      updateMessage((prev) => {
        const prevContent = prev.content ?? '';
        if (contentDelta && !contentAppendedThisFlush) {
          if (rawContentForSanitize === null) {
            rawContentForSanitize = prevContent;
          }
          rawContentForSanitize = `${rawContentForSanitize ?? prevContent}${contentDelta}`;
          contentAppendedThisFlush = true;
        }
        const nextContent = contentDelta
          ? sanitizeStreaming(rawContentForSanitize ?? prevContent)
          : prevContent;
        if (contentDelta) {
          if (nextContent.startsWith(prevContent)) {
            sanitizedContentDelta = nextContent.slice(prevContent.length);
          } else {
            // Non-monotonic scrub (closed-tag / CDN debris removed mid-stream).
            // Growth is empty for the append-only channel; rewrite notifies
            // live HTML parsers to reset + replay the full sanitized snapshot.
            sanitizedContentDelta = '';
            if (nextContent !== prevContent) {
              rewrittenFullContent = nextContent;
            }
          }
        }
        let nextEvents = prev.events;
        if (textEventDelta) {
          if (!textAppendedThisFlush) {
            rawTextEventForSanitize += textEventDelta;
            textAppendedThisFlush = true;
          }
          const nextTextEvent = sanitizeStreaming(rawTextEventForSanitize);
          if (nextTextEvent.startsWith(sanitizedTextEventSent)) {
            const delta = nextTextEvent.slice(sanitizedTextEventSent.length);
            sanitizedTextEventSent = nextTextEvent;
            if (delta) {
              nextEvents = [...(prev.events ?? []), { kind: 'text', text: delta }];
            }
          } else {
            // Sanitize shrank or rewrote the run — replace trailing text events
            // so stale fragments like `Hello <think` cannot remain visible.
            sanitizedTextEventSent = nextTextEvent;
            nextEvents = replaceTrailingTextEvents(prev.events, nextTextEvent);
          }
        }
        return {
          ...prev,
          content: nextContent,
          events: nextEvents,
        };
      });
      persistSoon();
      if (rewrittenFullContent !== null) {
        onContentRewrite?.(rewrittenFullContent);
      } else if (sanitizedContentDelta) {
        onContentDelta?.(sanitizedContentDelta);
      }
    } finally {
      flushing = false;
    }
    if (pendingContentDelta || pendingTextEventDelta || needsFlush) {
      needsFlush = false;
      scheduleFlush();
    }
  };

  const scheduleFlush = () => {
    if (disposed || flushFrame !== null || flushTimer !== null) return;
    flushFrame = requestAnimationFrame(() => {
      flushFrame = null;
      flush();
    });
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 250);
  };

  const appendContent = (delta: string) => {
    if (disposed) return;
    pendingContentDelta += delta;
    needsFlush = true;
    scheduleFlush();
  };

  const appendTextEvent = (delta: string) => {
    if (disposed) return;
    pendingTextEventDelta += delta;
    needsFlush = true;
    scheduleFlush();
  };

  const appendEvent = (ev: AgentEvent) => {
    if (disposed) return;
    if (ev.kind === 'text') {
      appendTextEvent(ev.text);
      return;
    }
    flush();
    // Start a fresh text-run sanitize buffer after non-text events so a later
    // rewrite cannot paste earlier runs into the trailing text slot.
    rawTextEventForSanitize = '';
    sanitizedTextEventSent = '';
    updateMessage((prev) => ({ ...prev, events: [...(prev.events ?? []), ev] }));
    persistSoon();
  };

  const cancel = () => {
    disposed = true;
    cancelScheduledFlush();
    pendingContentDelta = '';
    pendingTextEventDelta = '';
    needsFlush = false;
    if (hasDocument) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    if (hasWindow) {
      window.removeEventListener('pagehide', onPageHide);
    }
  };

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  }

  function onPageHide() {
    flush();
    // persistSoon's throttle never fires once the document tears
    // down, so synchronously PUT with keepalive instead.
    flushAndPersistNow?.();
  }

  if (hasDocument) {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (hasWindow) {
    window.addEventListener('pagehide', onPageHide);
  }

  // True when text has been appended but not yet flushed into a `text` event.
  // Callers that need the soon-to-be-committed event count (e.g. pinning a live
  // tool's stream position) add 1 for this still-buffered preamble.
  const hasPendingText = () => pendingTextEventDelta.length > 0;

  const finalizeForHistoryDisplay = () => {
    if (disposed) return;
    updateMessage((prev) => sanitizeChatMessageLeakedPseudoTool(prev, { stripCodeFences }));
    persistSoon();
    rawContentForSanitize = null;
    rawTextEventForSanitize = '';
    sanitizedTextEventSent = '';
  };

  return {
    appendContent,
    appendTextEvent,
    appendEvent,
    flush,
    cancel,
    hasPendingText,
    finalizeForHistoryDisplay,
  };
}

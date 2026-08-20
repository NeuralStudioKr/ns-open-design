import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { devLog } from '../lib/devLog';
import { createPortal, flushSync } from 'react-dom';
import { Button, Input, Select } from '@open-design/components';
import { APP_CHROME_FILE_ACTIONS_ID, APP_CHROME_FILE_ACTIONS_SELECTOR } from './AppChromeHeader';
import {
  buildSocialSharePayload,
  OPEN_DESIGN_GITHUB_REPO_URL,
  isArtifactHtmlStableForPreview,
  type SocialShareRequest,
  type SocialShareResponse,
} from '@open-design/contracts';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  type TrackingProjectKind,
  type TrackingRevisionArea,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import { trackIframeLoad } from '../observability/iframe-error';
import {
  trackArtifactExportResult,
  trackArtifactHeaderClick,
  trackArtifactToolbarClick,
  trackCommentPopoverClick,
  trackDrawToolbarClick,
  trackPageView,
  trackPresentPopoverClick,
  trackShareOptionPopoverClick,
} from '../analytics/events';
import { hasSalvageableDeckSlideContent } from '../artifacts/deck-html-content';
import { MarkdownRenderer, artifactRendererRegistry } from '../artifacts/renderer-registry';
import { renderMarkdownToSafeHtml } from '../artifacts/markdown';
import { useI18n } from '../i18n';
import { useTeamverT } from '../teamver/branding/useTeamverT';
import { TeamverExportMenu, type ShareExportFormat } from '../teamver/components/TeamverExportMenu';
import { TeamverPublishDriveModal } from '../teamver/components/TeamverPublishDriveModal';
import { useTeamverBranding } from '../teamver/branding/TeamverBrandingProvider';
import {
  isTeamverEmbedMode,
  resolveTeamverDriveAssetUrl,
  resolveTeamverMainOrigin,
  shouldUseTeamverAuthenticatedProjectRawFetch,
} from '../teamver/designApiBase';
import { isTeamverPptxExportEnabled } from '../teamver/pptxExportEnable';
import { beginTeamverEmbedActiveWork, endTeamverEmbedActiveWork } from '../teamver/teamverEmbedActiveWork';
import { fetchTeamverDaemon } from '../teamver/teamverDaemonHeaders';
import { TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT } from '../teamver/teamverEmbedPassiveAuth';
import { subscribeTeamverEmbedSessionChanged } from '../teamver/teamverEmbedSession';
import {
  invalidateTeamverProjectPreviewPrefix,
  peekTeamverProjectPreviewPrefix,
  projectScopedPreviewUrl,
  resolveTeamverProjectPreviewPrefix,
} from '../teamver/teamverProjectPreviewScope';
import { TEAMVER_DRIVE_ASSET_LINK_LABEL } from '../teamver/teamverDriveDeepLink';
import { embedUiLabel } from '../teamver/embedUiLabels';
import { formatTeamverDesignErrorMessage } from '../teamver/publishToDrive';
import {
  formatTeamverEmbedOperationFailureMessage,
  notifyTeamverEmbedAuthFailureIfNeeded,
} from '../teamver/teamverBffAuthError';
import { formatProjectArtifactSaveFailedError } from '../teamver/projectErrorMessages';
import {
  formatProjectDeployErrorForUser,
  formatProjectImageExportErrorForUser,
  formatProjectUploadFailureDetail,
} from '../teamver/projectUploadErrors';
import { TeamverDaemonUnauthorizedError } from '../teamver/teamverDaemonHeaders';
import { buildDrivePublishToastContent } from '../teamver/drivePublishSuccess';
import { canOfferAlternateDrivePublishFormat } from '../teamver/drivePublishFormatHealth';
import type { DrivePublishFormat } from '../teamver/drivePublishMessaging';
import type { Dict, Locale } from '../i18n/types';
import {
  fetchLiveArtifact,
  fetchLiveArtifactCode,
  fetchLiveArtifactRefreshes,
  checkDeploymentLink,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  createSocialSharePayload,
  DEFAULT_DEPLOY_PROVIDER_ID,
  deployProjectFile,
  fetchCloudflarePagesZones,
  fetchDeployConfig,
  fetchProjectDeployments,
  fetchProjectFilePreview,
  fetchProjectFiles,
  fetchProjectFileRevisionContent,
  fetchProjectFileText,
  listProjectFileRevisions,
  pushProjectFileRevision,
  restoreProjectFileRevision,
  uploadProjectFiles,
  liveArtifactPreviewUrl,
  projectFileUrl,
  projectRawUrl,
  LiveArtifactRefreshError,
  refreshLiveArtifact,
  updateDeployConfig,
  type WebDeployConfigResponse,
  type WebCloudflarePagesDeploySelection,
  type WebDeploymentInfo,
  type WebDeployProjectFileResponse,
  type WebDeployProviderId,
  type WebUpdateDeployConfigRequest,
} from '../providers/registry';
import type { ProjectFilePreview } from '../providers/registry';
import {
  downloadImageDataUrl,
  exportAsJsx,
  exportAsMd,
  exportAsPdf,
  exportProjectImageBlob,
  resolveExportDownloadTitle,
  exportProjectAsHtml,
  exportProjectAsPdf,
  exportProjectAsPptx,
  exportProjectAsZip,
  formatExportFailureMessageForUser,
  // TEMP: used by commented-out screenshot toolbar handler
  // copyImageDataUrlToClipboard,
  exportReactComponentAsHtml,
  exportReactComponentAsZip,
  captureHostIframeSnapshot,
  imageDataUrlToBlob,
  openSandboxedPreviewInNewTab,
  prepareImageExportTarget,
  requestPreviewSnapshot,
  type ImageExportFormat,
} from '../runtime/exports';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { isMacPlatform } from '../utils/platform';
import {
  isEphemeralDrawingScreenshotPath,
  isRenderableImagePath,
  projectFileResolvedPath,
} from '../utils/projectFilePaths';
import { rewriteAttachmentImageSrcs } from '../utils/rewriteAttachmentImageSrcs';
import { buildReactComponentSrcdoc } from '../runtime/react-component';
import { shouldConsumeSlideNav } from '../runtime/slide-nav';
import { findHtmlEntriesReferencing } from '../runtime/jsx-module-refs';
import {
  buildLazySrcdocTransport,
  buildRedirectLoopBlockedDoc,
  buildSrcdoc,
  canActivateSrcDocTransport,
  PREVIEW_REDIRECT_LOOP_MESSAGE,
} from '../runtime/srcdoc';
import { repairArtifactDocumentHeadIfNeeded } from '../runtime/artifact-document-head';
import {
  clearActiveRevisionSequence,
  getActiveRevisionSequence,
  setActiveRevisionSequence,
} from '../runtime/revision-active-sequence';
import {
  emitRevisionPush,
  emitRevisionRedo,
  emitRevisionRestore,
  emitRevisionUndo,
} from '../runtime/revision-analytics';
import {
  canRedoRevisionStack,
  canUndoRevisionStack,
  createRevisionStackSnapshot,
  resolveRevisionCursorId,
  revisionAfterCursor,
  revisionBeforeCursor,
  stackWithCursor,
  stackWithPushedRevision,
  truncateAfterSequenceForStack,
  type RevisionStackSnapshot,
} from '../runtime/revision-stack';
import {
  cursorRevisionFromStack,
  findRevisionMatchingDiskContent,
  revisionCursorMatchesDisk,
} from '../runtime/revision-conflict';
import { revisionSnapshotContentMatches } from '../runtime/revision-content-match';
import {
  classifyRevisionDiskReconcile,
  shouldApplyHeadRevisionSnapshotAuthority,
} from '../runtime/revision-reconcile';
import {
  clearRevisionContentCacheEntry,
  clearRevisionContentCacheForFile,
  getRevisionContentCache,
  prefetchRevisionContents,
  setRevisionContentCache,
  shouldCacheRevisionContent,
} from '../runtime/revision-content-cache';
import { canResizeTarget } from '../edit-mode/resize-eligibility';
import { cacheParentRevisionOnPush, canApplyRevisionFromClientCache } from '../runtime/revision-restore';
import { syncRevisionWithRetry } from '../runtime/revision-disk-sync';
import {
  nudgeDeckPreviewFit,
  postDeckHostViewportToIframe,
  postDeckPreviewPanBy,
  resetDeckPreviewPan,
  resolveDeckPreviewIframeFromSource,
  scheduleDeckPreviewFitNudges,
  schedulePostDeckHostViewportUntilSized,
  type DeckPreviewFitOptions,
} from '../runtime/deckPreviewFit';
import { withResolvedDeckSlideIndex } from '../runtime/deck-slide-index';
import { looksLikeCompactApiStackedDeckForPreview } from '../runtime/compact-api-stacked-deck';
import {
  hasTweaksTemplate,
  hasUrlModeBridge,
  htmlNeedsFocusGuard,
  htmlNeedsRedirectGuard,
  htmlNeedsSandboxShim,
  parseForceInline,
  isEmbedPreviewAwaitingScopedPrefix,
  resolveHtmlPreviewAssetUrl,
  resolveHtmlPreviewSrcDocBaseHref,
  resolveSrcDocPreviewMountKey,
  shouldUrlLoadHtmlPreview,
} from './file-viewer-render-mode';
import { saveTemplate } from '../state/projects';
import type {
  LiveArtifactEventItem,
  LiveArtifact,
  LiveArtifactRefreshLogEntry,
  LiveArtifactViewerTab,
  LiveArtifactWorkspaceEntry,
  ProjectFile,
} from '../types';
import { AuthenticatedProjectFileImage } from './AuthenticatedProjectFileImage';
import { loadAuthenticatedProjectFileBlob } from '../hooks/useAuthenticatedProjectFileObjectUrl';
import { useProjectFileSignedUrl } from '../hooks/useProjectFileSignedUrl';
import { Icon } from './Icon';
import { RemixIcon } from './RemixIcon';
import { SocialShareGrid } from './SocialShareGrid';
import { Toast } from './Toast';
import {
  ANNOTATION_LAZY_SHELL_WAIT_MS,
  ANNOTATION_SNAPSHOT_BRIDGE_RETRY_MS,
  DRAW_CAPTURE_READY_DEADLINE_MS,
} from '../utils/annotationCaptureBudget';
import { PreviewDrawOverlay, type DrawToolbarElement } from './PreviewDrawOverlay';
import {
  buildBoardCommentAttachments,
  commentSnapshotEqual,
  commentTargetDisplayName,
  commentVisibleOnDeckSlide,
  commentsToAttachments,
  isValidCommentOverlayPosition,
  liveCommentTargetMapsEqual,
  liveSnapshotForComment,
  overlayBoundsFromSnapshot,
  selectionKindLabel,
  targetFromSnapshot,
  type PreviewCommentSnapshot,
} from '../comments';
import { isUnsafeCommentElementTargetId } from '../edit-mode/scoped-deck-patch';
import { applyPodMemberRemoval } from '../lib/pod-members';
import { AnnotationHoverPopover, BoardComposerPopover } from './BoardComposerPopover';
import {
  OD_PREVIEW_KEEP_ALIVE,
  PooledIframe,
  previewIframeKeepAliveKey,
} from './IframeKeepAlivePool';
import type {
  ChatCommentAttachment,
  PreviewComment,
  PreviewCommentAttachment,
  PreviewCommentMember,
  PreviewCommentTarget,
} from '../types';
import { ManualEditPanel, emptyManualEditDraft, type ManualEditDraft } from './ManualEditPanel';
import { ManualEditLayersPanel } from './ManualEditLayersPanel';
import { ManualEditMultiSelectOverlay } from './ManualEditMultiSelectOverlay';
import { ManualEditResizeOverlay } from './ManualEditResizeOverlay';
import { FileViewerUndoRedoToolbar } from './FileViewerUndoRedoToolbar';
import { FileRevisionHistoryPanel } from './FileRevisionHistoryPanel';
import {
  applyManualEditPatch,
  isManualEditFullHtmlDocument,
  normalizeCssForSafetyScan,
  parseManualEditSource,
  readManualEditStyles,
  readManualEditTargetSnapshot,
} from '../edit-mode/source-patches';
import {
  contentRectToHostRect,
  measureIframeHostScale,
  measureIframeOffsetInHost,
} from '../edit-mode/preview-coords';
import {
  clampFloatingPanelPosition,
  MANUAL_EDIT_PANEL_COLLAPSED_HEIGHT_PX,
  placeManualEditFloatingPanel,
  shouldRepositionFloatingPanelForSelection,
  withPinnedFloatingPanelPosition,
} from '../edit-mode/floating-panel-place';
import {
  parseExplicitPx,
  resizeHistoryLabel,
} from '../edit-mode/resize-math';
import {
  createManualEditRemeasureAwaiter,
} from '../edit-mode/remeasure-await';
import {
  moveHistoryLabel,
  PROMOTE_MOVE_STYLE_KEYS,
  hostPaintRectAfterVisualMove,
  hostPaintRectFromVisualContent,
  manualEditGeometryIsWildJump,
  manualEditGeometryRoughlyMatches,
  resolveManualEditChromeHostRect,
  viewportRectAfterMoveCommit,
  visualRectFromMoveViewportDraft,
} from '../edit-mode/move-math';
import {
  createManualEditSourcePin,
  manualEditHistoryConfirmCanSkipDiskFetch,
  manualEditHistoryConfirmTrustsLocal,
  isManualEditSourcePinActive,
  acceptedKeepsEarlyPaintTipOrPin,
  nextTipPreferSuppressState,
  resolveManualEditSavePinTipRevision,
  resolveManualEditSourceAgainstPinAndTip,
  shouldClearTipContentCacheAfterConfirmRefuse,
  shouldEarlyPaintResolvedPinTipSource,
  shouldPreferTipWhenCandidateLags,
  tipContentForManualEditSavePin,
  type ManualEditSourcePin,
} from '../edit-mode/manual-edit-save-pin';
import { manualEditTargetsIdentityFingerprint } from '../edit-mode/manual-edit-targets-identity';
import {
  shouldClearManualEditFrozenSourceOnModeChange,
  shouldClearMixedKeysAfterTipYieldReseedSkip,
  shouldClearTipRemountGeometryGraceOnExpiry,
  shouldClearTipRemountGeometryGraceOnSelectionChange,
  shouldEchoManualEditSelectionAfterFreezeSync,
  shouldRequestTipRemountRemasureAfterSrcDocLoad,
  shouldApplyTipRemountSyncHostMeasureOnSrcDocLoad,
  shouldRetryTipRemountSyncHostMeasureAfterSrcDocLoad,
  shouldCancelTipRemountSyncHostMeasureRetry,
  shouldReleaseTipRemountChromeAfterSyncHostMeasure,
  shouldReleaseTipRemountChromeAfterFitSettleRemasure,
  TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
  TIP_REMOUNT_FIT_SETTLE_LAST_REMEASURE_MS,
  TIP_REMOUNT_FIT_SETTLE_LATCH_MS,
  TIP_REMOUNT_FIT_SETTLE_REMEASURE_DELAYS_MS,
  TIP_POST_STICKY_SOFT_LAND_CATALOGS,
  TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS,
  shouldIgnoreOdEditTargetsMembershipNoiseDuringTipProtect,
  shouldClearManualEditSelectionOnEmptyOdEditTargets,
  shouldClearTipSyncedIdentityStickyRetainOnFullCatalog,
  shouldDeferTipSyncedIdentityStickyClearUntilAfterPreserve,
  shouldArmTipPostStickySoftLand,
  shouldRetainTipSyncedIdentityDuringPostStickySoftLand,
  consumeTipPostStickySoftLandCatalog,
  shouldEarlyExitTipPostStickySoftLand,
  shouldArmTipPostSoftLandExitLatch,
  shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch,
  clearTipPostSoftLandExitLatch,
  shouldLatchSelectedIdentityFingerprintDuringTipSoftLand,
  shouldArmTipPostExitLatchMixedAbsorb,
  shouldArmTipPostExitLatchMixedAbsorbOnSoftLandEarlyExit,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb,
  shouldAbsorbLiveIdentityFingerprintOnPostExitLatch,
  shouldSyncSelectedIdentityFingerprintOnSoftLandEarlyExit,
  shouldKeepMultiInspectorSourceOnlyDuringTipExitLatch,
  shouldSkipOdEditTargetsSingleInspectorReseedDuringPostExitAbsorb,
  shouldTreatPostExitAbsorbAsTipProtect,
  shouldArmTipPostAbsorbInspectorQuiet,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet,
  shouldTreatPostAbsorbQuietAsTipProtect,
  clearTipPostAbsorbInspectorQuiet,
  shouldClearTipPostProtectOnOdEditTargetsSelectionIdsChange,
  shouldClearTipPostProtectOnSelectionChange,
  shouldClearTipRemountOnManualEditModeExit,
  tipRemountPostProtectArmed,
  nextTipRemountDeckNudgeFollowUntilMs,
  shouldRemeasureTipRemountOnDeckHostFitNudge,
  shouldThrottleTipRemountDeckNudgeRemasure,
  TIP_REMOUNT_DECK_NUDGE_REMEASURE_THROTTLE_MS,
  shouldMarkTipRemountChromeReleasePendingAfterResizeSkip,
  shouldReleaseTipRemountChromeAfterResizeGestureEnds,
  shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds,
  shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety,
  shouldFlushDeferredTipRemountChromeReleaseAfterSafety,
  shouldSkipTipRemountFitSettleRemasureDuringResizeGesture,
  shouldArmPostTipFitSettleWildJumpSkip,
  shouldSkipWildJumpOnceAfterTipFitSettle,
  shouldConsumePostTipFitSettleWildJumpSkip,
  shouldArmTipRemountFitSettleForDeckHostFit,
  shouldRemeasureTipRemountAfterDeckHostFitSettle,
  shouldScheduleTipRemountFitSettleRemasureOnLoad,
  shouldDeferTipRemountGraceConsumeForDeckHostFitSettle,
  shouldSkipWildJumpDuringTipRemountFitSettle,
  shouldSkipWildJumpForTipRemountSelectedMember,
  shouldSkipWildJumpDuringTipRemountFitSettleForSelectedMember,
  tipRemountSessionActive,
  tipRemountGeometryGraceExpired,
  tipRemountFitSettleExpired,
  shouldSkipOdEditTargetsIdentityMixedReseedDuringTipRemount,
  shouldAllowOdEditTargetsPendingReseedDuringTipProtect,
  withPreservedTipSyncedStylesOnBridgeTarget,
  resolveTipSyncedStylesForOdEditTargetsPreserve,
  withPreservedTipSyncedIdentityOnBridgeTarget,
  resolveTipSyncedTargetForOdEditTargetsPreserve,
  nextTipRemountIdentityHoldUntilMs,
  shouldArmTipRemountIdentityHoldOnGraceClear,
  shouldPreserveTipSyncedStylesOnOdEditTargets,
  shouldRetainTipSyncedIdentityAfterHold,
  shouldClearTipSyncedIdentityStickyRetainOnGraceClear,
  shouldReadSingleInspectorStylesFromSourceOnlyForOdEditTargets,
  shouldRefreshHostMetricsAfterTipRemountMultiRemasure,
  shouldSkipSrcDocTransportRemountForManualEditFreezeTipSync,
  shouldDisableManualEditChromeUntilTipRemasure,
  shouldAbortManualEditGestureForTipYieldFreezeSync,
  shouldReleaseTipRemountChromeOnFailedRemasure,
  shouldPostHostChromeDuringTipRemountSuppress,
  shouldPatchSelectedGeometryFromTargetsBroadcast,
  shouldReseedManualEditMultiInspectorAfterFreezeSync,
  shouldReseedSingleInspectorAfterTipYieldMixedClear,
  shouldApplyTipYieldSingleInspectorSnapshot,
  shouldRefreshHostPaintAfterTipYieldSingleReseed,
  shouldRefreshHostPaintAfterTipRemountRemasure,
  shouldConsumeTipRemountGeometryGraceOnRemasure,
  shouldSyncSelectedTargetIdentityAfterTipYieldSingleReseed,
  shouldSyncSelectedTargetsIdentityAfterTipYieldMultiReseed,
  shouldSkipWildJumpAfterTipRemountGrace,
  shouldSyncManualEditFrozenSourceToPainted,
  shouldUpdateManualEditFrozenSourceOnPatch,
} from '../edit-mode/manual-edit-freeze';
import { isManualEditKeyboardTextTarget, resolveManualEditDeleteKeyboardAction } from '../edit-mode/manual-edit-keyboard';
import {
  MANUAL_EDIT_STYLE_AUTOSAVE_MS,
  keyedManualEditStyleRollback,
  manualEditGestureRollbackKeys,
  restoreManualEditPendingStyleAfterFailedFlush,
  manualEditPendingAffectedIds,
  manualEditPendingStyleEntries,
  shouldFlushManualEditStylesOnTargetBoundary,
  shouldSkipManualEditStyleFlushWhilePaused,
  waitForManualEditSaveIdle,
} from '../edit-mode/manual-edit-style-persist';
import { manualEditStyleReplayPatches } from '../edit-mode/manual-edit-style-replay';
import {
  manualEditInspectorStyleValue,
  manualEditStyleValuesEqual,
} from '../edit-mode/manual-edit-style-values';
import {
  applyManualEditPreviewStylesToDocument,
  iframeContentDocumentIfAccessible,
  measureManualEditContentPageBounds,
  measureManualEditTargetContentRect,
  measureManualEditTargetHostRect,
  measureManualEditViewportBounds,
} from '../edit-mode/manual-edit-host-preview';
import {
  manualEditTargetIsDescendantOfInDocument,
  resolveManualEditGraphicContainerId,
} from '../edit-mode/manual-edit-target-resolve';
import {
  manualEditPatchBaseSource,
  shouldHoldDiskPreviewDuringManualEdit,
  shouldSkipManualEditHistoryConfirm,
} from '../edit-mode/manual-edit-session';
import { diffManualEditStylePatch } from '../edit-mode/manual-edit-style-batch';
import {
  applyManualEditPatches,
  buildManualEditStylePatchesForTargets,
  mergeInspectorStylesForTargets,
  mixedKeysForPendingStyleDraft,
  concurrentPendingOwnsTipYieldReseedStyles,
  planManualEditMultiInspectorReseed,
  resolveTipYieldIdentityStyles,
  shouldReadMultiInspectorStylesFromSourceOnly,
  manualEditSelectionIdsEqual,
  nextManualEditSelectionIds,
  resolveManualEditTargetsByIds,
  MANUAL_EDIT_MULTI_SELECT_MAX,
  shouldFlushManualEditStylesOnSelectionBoundary,
} from '../edit-mode/manual-edit-multi-select';
import {
  buildGroupMoveMemberStarts,
  buildGroupMoveStylePatches,
  canGroupBoundingMove,
  groupMoveHistoryLabel,
  resolveGroupMoveTargets,
  resolveGroupMovableTargets,
  type GroupMoveMemberStart,
  type GroupMovePreviewUpdate,
} from '../edit-mode/manual-edit-group-move';
import {
  buildGroupResizeMemberStarts,
  buildGroupResizeStylePatches,
  canGroupBoundingResize,
  groupResizeHistoryLabel,
  resolveGroupResizableTargets,
  type GroupResizeMemberStart,
  type GroupResizePreviewUpdate,
} from '../edit-mode/manual-edit-group-resize';
import type { ResizeHandle } from '../edit-mode/resize-math';
import {
  buildGroupGeometryPatches,
  canGroupAlign,
  canGroupDistribute,
  computeGroupAlignPreviewUpdates,
  computeGroupDistributePreviewUpdates,
  groupAlignHistoryLabel,
  type GroupAlignKind,
  type GroupDistributeKind,
} from '../edit-mode/manual-edit-group-align';
import { collectSnapSources } from '../edit-mode/manual-edit-geometry-snap';
import {
  buildLayerReorderZIndexPatches,
  layerReorderGroupFrontFirstIds,
  layerReorderHistoryLabel,
  layerReorderInsertIndex,
  reorderLayerPaintOrder,
  resolveLayerReorderSiblings,
  mergeVisibleLayerReorderIntoStack,
  resolveLayerReorderStackSiblings,
} from '../edit-mode/manual-edit-layer-reorder';
import { filterManualEditLayerTargets, sortManualEditLayerTargetsByPaintOrder } from '../edit-mode/manual-edit-layer-targets';
import { filterRootTargetsForGroupGeometry } from '../edit-mode/manual-edit-selection-ancestry';
import {
  buildZOrderStylePatch,
  canAdjustZOrderTarget,
  computeZOrderPatchForTargetWithFallback,
  mergeZOrderCapabilities,
  readStackZFromZIndexStyle,
  resolveZOrderContextWithFallback,
  resolveZOrderKeyboardAction,
  zOrderHistoryLabel,
  type ZOrderAction,
} from '../edit-mode/manual-edit-z-order';
import { MANUAL_EDIT_STYLE_PROPS, type ManualEditBridgeMessage, type ManualEditHistoryEntry, type ManualEditPatch, type ManualEditRect, type ManualEditStyles, type ManualEditTarget } from '../edit-mode/types';
import { isRenderableSketchJson, SketchPreview } from './SketchPreview';
import {
  FILE_REVISION_RETENTION_LIMIT_DEFAULT,
  type FileRevision,
} from '@open-design/contracts';

/** Poll revision list while deferred retention sweep is still trimming history. */
const FILE_REVISION_RETENTION_POLL_MS = 4_000;

function resolveChromeActionsHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(APP_CHROME_FILE_ACTIONS_SELECTOR)
    ?? document.getElementById(APP_CHROME_FILE_ACTIONS_ID);
}

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;
type SlideState = { active: number; count: number };
type BoardTool = 'inspect' | 'pod';
type StrokePoint = { x: number; y: number };
export type ManualEditPendingStyleSave = {
  id: string;
  /** When set, flush applies the same style diff to every id (multi-select). */
  targetIds?: string[];
  /** Per-target styles for group bounding move (distinct left/top per id). */
  perTargetStyles?: Record<string, Partial<ManualEditStyles>>;
  styles: Partial<ManualEditStyles>;
  label: string;
  version: number;
};
type PreviewViewportId = 'desktop' | 'tablet' | 'mobile';
type PreviewCanvasSize = { width: number; height: number; scrollLeft?: number; scrollTop?: number };
type CommentPreviewCanvasOptions = {
  boardMode: boolean;
  sidePanelCollapsed: boolean;
  viewport?: PreviewViewportId;
};
type PreviewScaleOptions = {
  canvasPadding?: number;
};
type PreviewViewportPreset = {
  id: PreviewViewportId;
  width: number | null;
  height: number | null;
  labelKey: keyof Dict;
  titleKey: keyof Dict;
};
const IMAGE_EXPORT_FORMAT_OPTIONS: Array<{
  value: ImageExportFormat;
  label: string;
  extension: string;
}> = [
  { value: 'png', label: 'PNG', extension: '.png' },
  { value: 'jpeg', label: 'JPEG', extension: '.jpg' },
  { value: 'webp', label: 'WebP', extension: '.webp' },
];
type DeployProviderOption = {
  id: WebDeployProviderId;
  labelKey: 'fileViewer.vercelProvider' | 'fileViewer.cloudflarePagesProvider';
  tokenLink: string;
  tokenLinkKey: 'fileViewer.vercelTokenGetLink' | 'fileViewer.cloudflareApiTokenGetLink';
  tokenPlaceholderKey:
    | 'fileViewer.vercelTokenPlaceholder'
    | 'fileViewer.cloudflareApiTokenPlaceholder';
  tokenReuseHintKey: 'fileViewer.vercelTokenReuseHint' | 'fileViewer.cloudflareApiTokenReuseHint';
  tokenRequiredKey: 'fileViewer.vercelTokenRequired' | 'fileViewer.cloudflareApiTokenRequired';
  tokenLabelKey:
    | 'fileViewer.vercelToken'
    | 'fileViewer.cloudflareApiToken';
  accountIdLabelKey?: 'fileViewer.cloudflareAccountId';
  accountIdHintKey?: 'fileViewer.cloudflareAccountIdHint';
};
type CloudflarePagesZoneOption = {
  id: string;
  name: string;
  status?: string;
  type?: string;
};
type DeployResultCard = {
  id: string;
  label: string;
  url: string;
  status: string;
  message?: string;
};
const MAX_BRIDGE_COORDINATE = 1_000_000;
const PREVIEW_VIEWPORT_PRESETS: PreviewViewportPreset[] = [
  {
    id: 'desktop',
    width: null,
    height: null,
    labelKey: 'fileViewer.viewportDesktop',
    titleKey: 'fileViewer.viewportDesktopTitle',
  },
  {
    id: 'tablet',
    width: 820,
    height: 1180,
    labelKey: 'fileViewer.viewportTablet',
    titleKey: 'fileViewer.viewportTabletTitle',
  },
  {
    id: 'mobile',
    width: 390,
    height: 844,
    labelKey: 'fileViewer.viewportMobile',
    titleKey: 'fileViewer.viewportMobileTitle',
  },
];

function previewViewportIcon(viewport: PreviewViewportId): string {
  if (viewport === 'tablet') return 'tablet-line';
  if (viewport === 'mobile') return 'smartphone-line';
  return 'computer-line';
}

const EXPORT_READY_NUDGE_STORAGE_PREFIX = 'open-design:export-ready-nudge:';
const COMMENT_SIDE_DOCK_WIDTH = 320;
const COMMENT_SIDE_DOCK_RAIL_WIDTH = 42;
const COMMENT_SIDE_DOCK_GAP = 12;
const COMMENT_SIDE_DOCK_PADDING = 8;
const COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING = 24;
const COMMENT_SIDE_DOCK_MIN_CANVAS_WIDTH = 280;
const COMMENT_SIDE_DOCK_STACKED_PANEL_HEIGHT = 220;
const COMMENT_SIDE_DOCK_STACKED_RAIL_HEIGHT = 48;
const COMMENT_SIDE_DOCK_STACKED_HEIGHT_DEDUCTION =
  (COMMENT_SIDE_DOCK_PADDING * 2) + COMMENT_SIDE_DOCK_GAP + COMMENT_SIDE_DOCK_STACKED_PANEL_HEIGHT;
const COMMENT_SIDE_DOCK_STACKED_COLLAPSED_HEIGHT_DEDUCTION =
  (COMMENT_SIDE_DOCK_PADDING * 2) + COMMENT_SIDE_DOCK_GAP + COMMENT_SIDE_DOCK_STACKED_RAIL_HEIGHT;
const FIXED_STAGE_DECK_FIT_OPTIONS: DeckPreviewFitOptions = { useLayoutBox: true };

// The five basic style facets the inspect panel exposes. Kept narrow on
// purpose — open-slide's design tokens panel only edits global tokens, so
// the per-element delta is small + obvious + cheap to read back from
// getComputedStyle on the iframe side.
type InspectStyleSnapshot = {
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  borderRadius?: string;
  textAlign?: string;
  fontFamily?: string;
  lineHeight?: string;
};

type InspectClickedDescendant = {
  label: string;
  text: string;
};

type InspectTarget = {
  elementId: string;
  selector: string;
  label: string;
  text: string;
  style: InspectStyleSnapshot;
  clickedDescendant?: InspectClickedDescendant;
};

const MAX_CACHED_SLIDE_STATES = 64;
const htmlPreviewSlideState = new Map<string, SlideState>();
const MAX_CACHED_PREVIEW_SOURCES = 32;
const htmlPreviewSourceCache = new Map<string, string>();

function previewSourceCacheKey(projectId: string, fileName: string): string {
  return `${projectId}\0${fileName}`;
}

function readCachedPreviewSource(projectId: string, fileName: string): string | null {
  const cached = htmlPreviewSourceCache.get(previewSourceCacheKey(projectId, fileName));
  if (!cached?.trim()) return null;
  const repaired = repairArtifactDocumentHeadIfNeeded(cached);
  return isArtifactHtmlStableForPreview(repaired) ? repaired : null;
}

/** Cache stable preview HTML for remount / pending-tab bootstrap (module-level). */
export function rememberStablePreviewSource(projectId: string, fileName: string, source: string | null | undefined) {
  if (!source?.trim()) return;
  const repaired = repairArtifactDocumentHeadIfNeeded(source);
  if (!isArtifactHtmlStableForPreview(repaired)) return;
  const key = previewSourceCacheKey(projectId, fileName);
  htmlPreviewSourceCache.set(key, repaired);
  if (htmlPreviewSourceCache.size > MAX_CACHED_PREVIEW_SOURCES) {
    const oldest = htmlPreviewSourceCache.keys().next().value;
    if (oldest != null) htmlPreviewSourceCache.delete(oldest);
  }
}

/** Drop module-level preview HTML cached before an agent/manual disk write. */
export function invalidateCachedPreviewSource(projectId: string, fileName: string): void {
  htmlPreviewSourceCache.delete(previewSourceCacheKey(projectId, fileName));
}

type RevisionListSoftCacheEntry = {
  activeSeq: number;
  list: Awaited<ReturnType<typeof listProjectFileRevisions>>;
  at: number;
  /** Stack-warmed lists are shorter-lived than server-fetched lists. */
  optimistic?: boolean;
};
const REVISION_LIST_SOFT_CACHE_TTL_MS = 4_000;
const REVISION_LIST_SOFT_CACHE_OPTIMISTIC_TTL_MS = 1_000;
const revisionListSoftCache = new Map<string, RevisionListSoftCacheEntry>();

function revisionListSoftCacheKey(projectId: string, fileName: string): string {
  return `${projectId}\0${fileName}`;
}

/** Soft-retry disk fetch: reuse list for the same activeSeq within a short TTL. */
async function listProjectFileRevisionsSoftCached(
  projectId: string,
  fileName: string,
  activeSeq: number,
): Promise<Awaited<ReturnType<typeof listProjectFileRevisions>>> {
  const key = revisionListSoftCacheKey(projectId, fileName);
  const cached = revisionListSoftCache.get(key);
  const ttl = cached?.optimistic
    ? REVISION_LIST_SOFT_CACHE_OPTIMISTIC_TTL_MS
    : REVISION_LIST_SOFT_CACHE_TTL_MS;
  if (
    cached
    && cached.activeSeq === activeSeq
    && Date.now() - cached.at < ttl
  ) {
    return cached.list;
  }
  const list = await listProjectFileRevisions(projectId, fileName);
  revisionListSoftCache.set(key, { activeSeq, list, at: Date.now(), optimistic: false });
  if (revisionListSoftCache.size > 64) {
    const oldest = revisionListSoftCache.keys().next().value;
    if (oldest != null) revisionListSoftCache.delete(oldest);
  }
  return list;
}

/** Warm soft-cache from an optimistic local tip push (skips immediate list GET). */
function warmRevisionListSoftCacheFromStack(
  projectId: string,
  fileName: string,
  stack: RevisionStackSnapshot,
  activeSeq: number,
  retentionLimit: number,
): void {
  const list: NonNullable<Awaited<ReturnType<typeof listProjectFileRevisions>>> = {
    revisions: stack.revisions,
    headRevisionId: stack.headRevisionId ?? stack.cursorRevisionId,
    retentionLimit,
  };
  warmRevisionListSoftCacheFromList(projectId, fileName, activeSeq, list, { optimistic: true });
}

/** Re-key soft-cache after adopt/head seq changes using an already-fetched list. */
function warmRevisionListSoftCacheFromList(
  projectId: string,
  fileName: string,
  activeSeq: number,
  list: Awaited<ReturnType<typeof listProjectFileRevisions>>,
  options?: { optimistic?: boolean },
): void {
  if (!list || typeof activeSeq !== 'number') return;
  const key = revisionListSoftCacheKey(projectId, fileName);
  revisionListSoftCache.set(key, {
    activeSeq,
    list,
    at: Date.now(),
    optimistic: options?.optimistic === true,
  });
}

const MAX_CACHED_PREVIEW_VIEWPORTS = 128;
// Grace window before the inspect hover card is torn down. Long enough to absorb
// the async iframe mouseout (od:comment-leave) that fires when the pointer slides
// onto the card or hops back onto the element under it, short enough to read as
// an immediate dismiss when the pointer really leaves.
const HOVER_CARD_DISMISS_DELAY_MS = 80;
const htmlPreviewViewportState = new Map<string, PreviewViewportId>();
const MARKDOWN_CODE_BLOCK_ATTR = 'data-markdown-code-block';
const MARKDOWN_COPY_BLOCK_ATTR = 'data-copy-code-block';
const MARKDOWN_COPY_BUTTON_CLASS = 'markdown-code-copy';
const MARKDOWN_COPY_TOAST_CLASS = 'markdown-code-toast';

const DEPLOY_PROVIDER_OPTIONS: DeployProviderOption[] = [
  {
    id: DEFAULT_DEPLOY_PROVIDER_ID,
    labelKey: 'fileViewer.vercelProvider',
    tokenLink: 'https://vercel.com/account/settings/tokens',
    tokenLinkKey: 'fileViewer.vercelTokenGetLink',
    tokenPlaceholderKey: 'fileViewer.vercelTokenPlaceholder',
    tokenReuseHintKey: 'fileViewer.vercelTokenReuseHint',
    tokenRequiredKey: 'fileViewer.vercelTokenRequired',
    tokenLabelKey: 'fileViewer.vercelToken',
  },
  {
    id: CLOUDFLARE_PAGES_PROVIDER_ID,
    labelKey: 'fileViewer.cloudflarePagesProvider',
    tokenLink: 'https://dash.cloudflare.com/profile/api-tokens',
    tokenLinkKey: 'fileViewer.cloudflareApiTokenGetLink',
    tokenPlaceholderKey: 'fileViewer.cloudflareApiTokenPlaceholder',
    tokenReuseHintKey: 'fileViewer.cloudflareApiTokenReuseHint',
    tokenRequiredKey: 'fileViewer.cloudflareApiTokenRequired',
    tokenLabelKey: 'fileViewer.cloudflareApiToken',
    accountIdLabelKey: 'fileViewer.cloudflareAccountId',
    accountIdHintKey: 'fileViewer.cloudflareAccountIdHint',
  },
];

function mergeManualEditInspectorStyles(
  sourceStyles: ManualEditStyles,
  previewStyles: ManualEditStyles,
): ManualEditStyles {
  return MANUAL_EDIT_STYLE_PROPS.reduce<ManualEditStyles>((acc, key) => {
    const sourceValue = sourceStyles[key]?.trim();
    const previewValue = previewStyles[key]?.trim();
    const value = sourceValue || previewValue || '';
    acc[key] = manualEditInspectorStyleValue(key, value);
    return acc;
  }, {} as ManualEditStyles);
}

function manualEditPersistedValueMatchesSavedSnapshot(
  key: keyof ManualEditStyles,
  persistedValue: string,
  savedValue: string,
): boolean {
  return manualEditStyleValuesEqual(key, persistedValue, savedValue);
}

function getDeployProviderOption(providerId: WebDeployProviderId): DeployProviderOption {
  return DEPLOY_PROVIDER_OPTIONS.find((option) => option.id === providerId) ?? DEPLOY_PROVIDER_OPTIONS[0]!;
}

function normalizeCloudflareDomainPrefixInput(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidCloudflareDomainPrefixInput(raw: string): boolean {
  const prefix = normalizeCloudflareDomainPrefixInput(raw);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix);
}

function deployResultState(status?: string): 'ready' | 'delayed' | 'protected' | 'failed' {
  if (status === 'protected') return 'protected';
  if (status === 'failed' || status === 'conflict') return 'failed';
  if (status === 'link-delayed' || status === 'pending') return 'delayed';
  return 'ready';
}

function publicShareUrlForDeployment(deployment?: WebDeploymentInfo | null): string {
  if (!deployment) return '';
  const cloudflare = deployment.cloudflarePages;
  const customDomainUrl = cloudflare?.customDomain?.status === 'ready'
    ? cloudflare.customDomain.url?.trim()
    : '';
  if (customDomainUrl) return customDomainUrl;
  const pagesDevUrl = cloudflare?.pagesDev?.status === 'ready'
    ? cloudflare.pagesDev.url?.trim()
    : '';
  if (pagesDevUrl) return pagesDevUrl;
  return deployResultState(deployment.status) === 'ready'
    ? deployment.url?.trim() || ''
    : '';
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
      if (priorFocus?.isConnected) {
        try {
          priorFocus.focus({ preventScroll: true });
        } catch {
          priorFocus.focus();
        }
      }
    }
  }
}

function decorateMarkdownCodeBlocks(html: string): string {
  let blockIndex = 0;
  return html.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/g, (_match, attrs: string, content: string) => {
    const blockId = String(blockIndex++);
    return `<div class="markdown-code-block" ${MARKDOWN_CODE_BLOCK_ATTR}="${blockId}"><pre${attrs}>${content}</pre></div>`;
  });
}

function setMarkdownCodeBlockCopiedState(block: HTMLElement, copied: boolean, t: TranslateFn) {
  const button = block.querySelector<HTMLButtonElement>(`.${MARKDOWN_COPY_BUTTON_CLASS}`);
  if (!button) return;
  const label = copied ? t('fileViewer.copied') : t('fileViewer.copy');
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.title = t('fileViewer.copyTitle');

  const existingToast = block.querySelector(`.${MARKDOWN_COPY_TOAST_CLASS}`);
  if (copied) {
    if (existingToast instanceof HTMLElement) {
      existingToast.textContent = t('fileViewer.copied');
      return;
    }
    const toast = document.createElement('span');
    toast.className = MARKDOWN_COPY_TOAST_CLASS;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = t('fileViewer.copied');
    button.insertAdjacentElement('afterend', toast);
    return;
  }

  existingToast?.remove();
}

function PreviewViewportControls({
  viewport,
  onViewport,
  t,
  tabIndex,
}: {
  viewport: PreviewViewportId;
  onViewport: (viewport: PreviewViewportId) => void;
  t: TranslateFn;
  tabIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const activePreset =
    PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === viewport) ?? PREVIEW_VIEWPORT_PRESETS[0]!;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="viewer-viewport-switcher" ref={menuRef}>
      <button
        type="button"
        className={`viewer-action viewer-viewport-trigger${open ? '' : ' od-tooltip'}`}
        aria-label={t('fileViewer.viewportAria')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        title={t(activePreset.titleKey)}
        data-tooltip={open ? undefined : t(activePreset.titleKey)}
        data-tooltip-placement="bottom"
        tabIndex={tabIndex}
        onClick={() => setOpen((value) => !value)}
      >
        <RemixIcon
          name={previewViewportIcon(activePreset.id)}
          size={14}
          className="viewer-viewport-icon"
        />
        <span>{t(activePreset.labelKey)}</span>
        <RemixIcon name="arrow-down-s-line" size={14} />
      </button>
      {open ? (
        <div className="viewer-viewport-menu" id={listboxId} role="listbox" aria-label={t('fileViewer.viewportAria')}>
          {PREVIEW_VIEWPORT_PRESETS.map((preset) => {
            const selected = viewport === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`viewer-viewport-menu-item${selected ? ' active' : ''}`}
                role="option"
                aria-selected={selected}
                title={t(preset.titleKey)}
                onClick={() => {
                  onViewport(preset.id);
                  setOpen(false);
                }}
              >
                <span className="viewer-viewport-menu-label">
                  <RemixIcon name={previewViewportIcon(preset.id)} size={14} />
                  <span>{t(preset.labelKey)}</span>
                </span>
                {selected ? <Icon name="check" size={13} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function previewViewportStyle(
  viewport: PreviewViewportId,
  previewScale = 1,
  canvasSize?: PreviewCanvasSize,
  options?: PreviewScaleOptions,
): CSSProperties & Record<string, string | number> {
  const preset = PREVIEW_VIEWPORT_PRESETS.find((item) => item.id === viewport) ?? PREVIEW_VIEWPORT_PRESETS[0]!;
  if (!preset.width) return {};
  const effectiveScale = effectivePreviewScale(viewport, previewScale, canvasSize, options);
  return {
    '--preview-viewport-width': `${preset.width}px`,
    '--preview-viewport-height': `${preset.height}px`,
    '--preview-scale': effectiveScale,
    '--preview-user-scale': previewScale,
  };
}

export function commentPreviewCanvasSize(
  canvasSize: PreviewCanvasSize | undefined,
  options: CommentPreviewCanvasOptions,
): PreviewCanvasSize | undefined {
  if (!canvasSize || !options.boardMode) return canvasSize;
  const dockPadding = options.viewport && options.viewport !== 'desktop'
    ? COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING
    : COMMENT_SIDE_DOCK_PADDING;
  const sideDockWidth = options.sidePanelCollapsed ? COMMENT_SIDE_DOCK_RAIL_WIDTH : COMMENT_SIDE_DOCK_WIDTH;
  const dockedWidth = canvasSize.width - (dockPadding * 2) - COMMENT_SIDE_DOCK_GAP - sideDockWidth;
  if (usesStackedCommentSideDock(canvasSize, options)) {
    const stackedHeightDeduction = options.sidePanelCollapsed
      ? COMMENT_SIDE_DOCK_STACKED_COLLAPSED_HEIGHT_DEDUCTION
      : COMMENT_SIDE_DOCK_STACKED_HEIGHT_DEDUCTION;
    return {
      width: Math.max(1, canvasSize.width - (COMMENT_SIDE_DOCK_PADDING * 2)),
      height: Math.max(1, canvasSize.height - stackedHeightDeduction),
    };
  }
  return {
    width: Math.max(1, dockedWidth),
    height: Math.max(1, canvasSize.height - (dockPadding * 2)),
  };
}

function usesStackedCommentSideDock(
  canvasSize: PreviewCanvasSize | undefined,
  options: CommentPreviewCanvasOptions,
) {
  if (!canvasSize || !options.boardMode) return false;
  const dockPadding = options.viewport && options.viewport !== 'desktop'
    ? COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING
    : COMMENT_SIDE_DOCK_PADDING;
  const sideDockWidth = options.sidePanelCollapsed ? COMMENT_SIDE_DOCK_RAIL_WIDTH : COMMENT_SIDE_DOCK_WIDTH;
  const dockedWidth = canvasSize.width - (dockPadding * 2) - COMMENT_SIDE_DOCK_GAP - sideDockWidth;
  return dockedWidth < COMMENT_SIDE_DOCK_MIN_CANVAS_WIDTH;
}

export function effectivePreviewScale(
  viewport: PreviewViewportId,
  previewScale: number,
  canvasSize?: PreviewCanvasSize,
  options?: PreviewScaleOptions,
) {
  if (viewport === 'desktop') return previewScale;
  const preset = PREVIEW_VIEWPORT_PRESETS.find((item) => item.id === viewport);
  if (!preset?.width || !preset.height || !canvasSize?.width || !canvasSize.height) return previewScale;
  const canvasPadding = options?.canvasPadding ?? 48;
  const availableWidth = Math.max(1, canvasSize.width - canvasPadding);
  const availableHeight = Math.max(1, canvasSize.height - canvasPadding);
  const fitScale = Math.min(1, availableWidth / preset.width, availableHeight / preset.height);
  return Math.min(previewScale, fitScale);
}

type PreviewOverlayTransform = { scale: number; offsetX: number; offsetY: number };

export function previewOverlayTransform(
  viewport: PreviewViewportId,
  previewScale: number,
  canvasSize?: PreviewCanvasSize,
): PreviewOverlayTransform {
  const scale = effectivePreviewScale(viewport, previewScale, canvasSize);
  if (viewport === 'desktop') return { scale, offsetX: 0, offsetY: 0 };
  const preset = PREVIEW_VIEWPORT_PRESETS.find((item) => item.id === viewport);
  const pad = 24;
  if (!preset?.width || !preset.height) return { scale, offsetX: pad, offsetY: pad };
  const availableWidth = Math.max(1, (canvasSize?.width ?? preset.width * scale + pad * 2) - pad * 2);
  const scaledWidth = preset.width * scale;
  return {
    scale,
    offsetX: pad + Math.max(0, (availableWidth - scaledWidth) / 2),
    offsetY: pad,
  };
}

function previewScaleShellStyle(
  viewport: PreviewViewportId,
  previewScale: number,
): CSSProperties & Record<string, string | number> {
  if (viewport === 'desktop') {
    return {
      width: `${100 / previewScale}%`,
      height: `${100 / previewScale}%`,
      transform: `scale(${previewScale})`,
      transformOrigin: '0 0',
    };
  }
  return {
    width: 'var(--preview-viewport-width)',
    height: 'var(--preview-viewport-height)',
    transform: 'scale(var(--preview-scale, 1))',
    transformOrigin: '0 0',
  };
}

function deckLetterboxPreviewScaleShellStyle(
  previewScale: number,
): CSSProperties & Record<string, string | number> {
  return {
    width: '100%',
    height: '100%',
    transform: `scale(${previewScale})`,
    transformOrigin: 'center center',
  };
}

export function deckPreviewScaleShellStyle(
  viewport: PreviewViewportId,
  previewScale: number,
): CSSProperties & Record<string, string | number> {
  if (viewport === 'desktop') {
    return {
      width: '100%',
      height: '100%',
      transform: `scale(${previewScale})`,
      transformOrigin: 'center center',
    };
  }
  return {
    width: 'var(--preview-viewport-width)',
    height: 'var(--preview-viewport-height)',
    transform: 'scale(var(--preview-scale, 1))',
    transformOrigin: 'center center',
  };
}

function manualEditPreviewShellStyle(
  viewport: PreviewViewportId,
  previewScale: number,
  frozenWidth: number | null,
): CSSProperties & Record<string, string | number> {
  if (viewport === 'desktop' && frozenWidth) {
    return {
      width: `${frozenWidth / previewScale}px`,
      height: `${100 / previewScale}%`,
      transform: `scale(${previewScale})`,
      transformOrigin: '0 0',
    };
  }
  return previewScaleShellStyle(viewport, previewScale);
}

export function previewShellStyleForRenderedHtml(options: {
  manualEditMode: boolean;
  previewViewport: PreviewViewportId;
  previewScale: number;
  manualEditViewportWidth: number | null;
  deckPreviewUsesFixedStage: boolean;
  effectiveDeck: boolean;
}): CSSProperties & Record<string, string | number> {
  if (options.manualEditMode) {
    return manualEditPreviewShellStyle(
      options.previewViewport,
      options.previewScale,
      options.manualEditViewportWidth,
    );
  }
  if (options.deckPreviewUsesFixedStage) {
    return deckLetterboxPreviewScaleShellStyle(options.previewScale);
  }
  if (options.effectiveDeck) {
    return deckPreviewScaleShellStyle(options.previewViewport, options.previewScale);
  }
  return previewScaleShellStyle(options.previewViewport, options.previewScale);
}

function deploymentTimestamp(deployment: WebDeploymentInfo): number {
  const maybeDeployedAt = (deployment as WebDeploymentInfo & { deployedAt?: number | string }).deployedAt;
  const candidates = [maybeDeployedAt, deployment.updatedAt, deployment.createdAt];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function compareDeploymentsByNewest(a: WebDeploymentInfo, b: WebDeploymentInfo): number {
  return deploymentTimestamp(b) - deploymentTimestamp(a);
}

function shareUrlForDeployment(deployment: WebDeploymentInfo): string {
  const customDomain = deployment.providerId === CLOUDFLARE_PAGES_PROVIDER_ID
    ? deployment.cloudflarePages?.customDomain
    : undefined;
  if (customDomain?.status === 'ready' && customDomain.url?.trim()) {
    return customDomain.url.trim();
  }
  return deployment.url?.trim() || '';
}

function resolveShareUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (typeof window === 'undefined') return trimmed;
  return new URL(trimmed, window.location.origin).toString();
}

function pickLatestShareDeployment(
  deploymentsByProvider: Partial<Record<WebDeployProviderId, WebDeploymentInfo>>,
): WebDeploymentInfo | null {
  return Object.values(deploymentsByProvider)
    .filter((deployment): deployment is WebDeploymentInfo =>
      Boolean(deployment && shareUrlForDeployment(deployment) && deployResultState(deployment.status) !== 'failed'))
    .sort(compareDeploymentsByNewest)[0] ?? null;
}

function manualEditPanelHostRect(
  target: ManualEditTarget,
  previewScale: number,
  hostOffset: { x: number; y: number } = { x: 0, y: 0 },
  hostPaintRect: ManualEditRect | null = null,
): { x: number; y: number; width: number; height: number } {
  return resolveManualEditChromeHostRect(
    target.rect,
    previewScale,
    hostOffset,
    hostPaintRect,
  );
}

function manualEditFloatingPanelStyle(
  target: ManualEditTarget,
  previewScale: number,
  canvasSize: PreviewCanvasSize | undefined,
  hostOffset: { x: number; y: number } = { x: 0, y: 0 },
  hostPaintRect: ManualEditRect | null = null,
  pinnedPosition: { left: number; top: number } | null = null,
): CSSProperties {
  const canvasWidth = canvasSize?.width ?? 1200;
  const canvasHeight = canvasSize?.height ?? 800;
  const hostRect = manualEditPanelHostRect(target, previewScale, hostOffset, hostPaintRect);
  // Prefer a non-overlapping side (right → left → below → above → dock).
  // Wide headlines used to clamp over the target when neither flank fit 320px.
  const placed = withPinnedFloatingPanelPosition(
    placeManualEditFloatingPanel({
      target: hostRect,
      canvasWidth,
      canvasHeight,
    }),
    pinnedPosition,
  );
  // Height is left to the content (auto): a short inspector (e.g. typography
  // only) should be a compact card, not a tall half-empty panel. The cap only
  // engages for long inspectors, at which point the scroll body takes over.
  // left/top stay pinned across resize/move and across selection changes unless
  // the panel would cover the newly selected element.
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    maxHeight: placed.maxHeight,
  };
}

// Anchors the hover "edit params" affordance to the top-right corner of the
// hovered element, just inside its bounds so moving the cursor from the
// element onto the icon does not drop the hover. Uses the same iframe→canvas
// coordinate basis as the floating inspector panel.
function manualEditHoverIconStyle(
  target: ManualEditTarget,
  previewScale: number,
  canvasSize: PreviewCanvasSize | undefined,
  hostOffset: { x: number; y: number } = { x: 0, y: 0 },
  hostPaintRect: ManualEditRect | null = null,
): CSSProperties {
  const iconSize = 26;
  const inset = 4;
  const canvasWidth = canvasSize?.width ?? 1200;
  const canvasHeight = canvasSize?.height ?? 800;
  const hostRect = resolveManualEditChromeHostRect(
    target.rect,
    previewScale,
    hostOffset,
    hostPaintRect,
  );
  const targetTop = hostRect.y;
  const targetRight = hostRect.x + hostRect.width;
  const left = Math.max(
    inset,
    Math.min(targetRight - iconSize - inset, canvasWidth - iconSize - inset),
  );
  const top = Math.max(
    inset,
    Math.min(targetTop + inset, canvasHeight - iconSize - inset),
  );
  return { left, top, width: iconSize, height: iconSize };
}

export function cancelManualEditPendingStyleSnapshot(
  pending: ManualEditPendingStyleSave | null,
  id: string,
  keys: Array<keyof ManualEditStyles>,
): ManualEditPendingStyleSave | null {
  if (!pending || keys.length === 0) return pending;
  const pendingIds = pending.targetIds ?? [pending.id];
  if (!pendingIds.includes(id)) return pending;
  const nextStyles = { ...pending.styles };
  for (const key of keys) delete nextStyles[key];
  if (Object.keys(nextStyles).length === 0) return null;
  return { ...pending, styles: nextStyles };
}

function usePreviewCanvasSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<PreviewCanvasSize | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({
        width: rect.width,
        height: rect.height,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      });
    };
    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return [ref, size] as const;
}

function ensureMarkdownCodeBlockControls(root: HTMLElement, t: TranslateFn) {
  for (const block of root.querySelectorAll<HTMLElement>(`[${MARKDOWN_CODE_BLOCK_ATTR}]`)) {
    let button = block.querySelector<HTMLButtonElement>(`.${MARKDOWN_COPY_BUTTON_CLASS}`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = MARKDOWN_COPY_BUTTON_CLASS;
      const blockId = block.getAttribute(MARKDOWN_CODE_BLOCK_ATTR) ?? '';
      button.setAttribute(MARKDOWN_COPY_BLOCK_ATTR, blockId);
      block.prepend(button);
    }
    setMarkdownCodeBlockCopiedState(block, false, t);
  }
}

function setSlideStateCached(key: string, state: SlideState) {
  htmlPreviewSlideState.set(key, state);
  if (htmlPreviewSlideState.size > MAX_CACHED_SLIDE_STATES) {
    const oldest = htmlPreviewSlideState.keys().next().value;
    if (oldest != null) htmlPreviewSlideState.delete(oldest);
  }
}

function waitForIframeLoadOrTimeout(iframe: HTMLIFrameElement, timeout = 750): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      iframe.removeEventListener('load', finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeout);
    iframe.addEventListener('load', finish, { once: true });
  });
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

function temporarilyExposeIframeForSnapshot(iframe: HTMLIFrameElement): () => void {
  if (iframe.getAttribute('data-od-active') !== 'false') {
    return () => {};
  }
  const previousVisibility = iframe.style.visibility;
  const previousOpacity = iframe.style.opacity;
  const previousPointerEvents = iframe.style.pointerEvents;
  iframe.style.visibility = 'visible';
  iframe.style.opacity = '0.001';
  iframe.style.pointerEvents = 'none';
  return () => {
    iframe.style.visibility = previousVisibility;
    iframe.style.opacity = previousOpacity;
    iframe.style.pointerEvents = previousPointerEvents;
  };
}

const EXPORT_SNAPSHOT_RETRY_MS = [1500, 3000, 6000] as const;

async function requestPreviewSnapshotWithRetry(
  iframe: HTMLIFrameElement,
  timeouts: readonly number[] = EXPORT_SNAPSHOT_RETRY_MS,
): Promise<Awaited<ReturnType<typeof requestPreviewSnapshot>>> {
  for (const timeout of timeouts) {
    const snapshot = await requestPreviewSnapshot(iframe, timeout);
    if (snapshot) return snapshot;
    await waitForAnimationFrame();
  }
  return null;
}

function previewViewportStateKey(projectId: string, file: Pick<ProjectFile, 'name' | 'path'>): string {
  return `${projectId}:${file.path || file.name}`;
}

function setPreviewViewportCached(key: string, viewport: PreviewViewportId) {
  htmlPreviewViewportState.set(key, viewport);
  if (htmlPreviewViewportState.size > MAX_CACHED_PREVIEW_VIEWPORTS) {
    const oldest = htmlPreviewViewportState.keys().next().value;
    if (oldest != null) htmlPreviewViewportState.delete(oldest);
  }
}

interface Props {
  projectId: string;
  projectKind: TrackingProjectKind;
  /** User-editable project display name (daemon `project.name`). Export filenames prefer this over artifact slugs. */
  projectDisplayName?: string;
  file: ProjectFile;
  liveHtml?: string;
  filesRefreshKey?: number;
  isDeck?: boolean;
  onExportAsPptx?: ((fileName: string) => void) | undefined;
  streaming?: boolean;
  commentQueueOnSend?: boolean;
  commentSendDisabled?: boolean;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean, images?: File[]) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[], images?: File[]) => Promise<boolean | void> | boolean | void;
  onFileSaved?: () => Promise<void> | void;
  // Open `openName` as a tab (focusing it) and close `closeName` in one
  // atomic tab-state update. The React module pointer uses this to jump to the
  // HTML entry that renders a module and drop the dead-end module tab.
  onOpenFileReplacing?: (openName: string, closeName: string) => void;
  commentPortalId?: string;
  onCommentModeChange?: (active: boolean) => void;
  // Bumped nonce asking this viewer to open its Share/Export menu (chat-side
  // "Share" next-step action). Only HTML artifacts expose a Share menu.
  shareRequest?: { nonce: number } | null;
  // Bumped nonce asking this viewer to open its Download/Export menu (chat-side
  // "Download" next-step action).
  downloadRequest?: { nonce: number } | null;
  // Bumped nonce asking a deck preview to flip to `slideIndex` (a queued chat
  // send for this file just started processing).
  slideNavRequest?: { slideIndex: number; nonce: number } | null;
  /** Project-relative paths for healing wrong local-upload <img src> in preview. */
  projectFilePaths?: readonly string[];
  /** Current-turn attachment paths — preferred when stem collisions occur. */
  preferredAttachmentPaths?: readonly string[];
}

type ExportToastTranslate = (key: keyof Dict, vars?: Record<string, string | number>) => string;

function exportInProgressToastMessage(format: ShareExportFormat, t: ExportToastTranslate): string {
  switch (format) {
    case 'pdf':
      return t('fileViewer.exportPdfInProgress');
    case 'html':
      return t('fileViewer.exportHtmlInProgress');
    case 'zip':
      return t('fileViewer.exportZipInProgress');
    default:
      return t('fileViewer.exportInProgress');
  }
}

function exportSuccessToastMessage(format: ShareExportFormat, t: ExportToastTranslate): string {
  switch (format) {
    case 'pdf':
      return t('fileViewer.exportPdfCompleted');
    case 'html':
      return t('fileViewer.exportHtmlCompleted');
    case 'zip':
      return t('fileViewer.exportZipCompleted');
    case 'markdown':
      return t('fileViewer.exportMarkdownCompleted');
    case 'pptx':
      return t('fileViewer.exportPptxRequested');
    case 'image':
      return t('fileViewer.exportImageSaved');
    default:
      return t('fileViewer.exportCompleted');
  }
}

export function FileViewer({
  projectId,
  projectKind,
  projectDisplayName,
  file,
  liveHtml,
  filesRefreshKey = 0,
  isDeck,
  onExportAsPptx,
  streaming,
  commentQueueOnSend = false,
  commentSendDisabled = false,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendBoardCommentAttachments,
  onFileSaved,
  onOpenFileReplacing,
  commentPortalId,
  onCommentModeChange,
  shareRequest,
  downloadRequest,
  slideNavRequest,
  projectFilePaths,
  preferredAttachmentPaths,
}: Props) {
  const rendererMatch = artifactRendererRegistry.resolve({
    file,
    isDeckHint: Boolean(isDeck),
  });

  // studio_view artifact — fire once per (project, file) pair so the
  // activation funnel can attribute "user opened the produced artifact"
  // even when the sub-viewer below is HtmlViewer / MarkdownViewer / etc.
  // artifact_id is anonymized to satisfy the CSV's no-filename rule.
  const analytics = useAnalytics();
  const studioViewKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${projectId}::${file.name}`;
    if (studioViewKeyRef.current === key) return;
    studioViewKeyRef.current = key;
    trackPageView(analytics.track, {
      page_name: 'artifact',
    });
  }, [projectId, projectKind, file.name, file.kind, rendererMatch?.renderer.id, analytics.track]);

  if (rendererMatch?.renderer.id === 'html' || rendererMatch?.renderer.id === 'deck-html') {
    return (
      <HtmlViewer
        key={`${projectId}\0${file.name}`}
        projectId={projectId}
        projectKind={projectKind}
        projectDisplayName={projectDisplayName}
        file={file}
        liveHtml={liveHtml}
        filesRefreshKey={filesRefreshKey}
        projectFilePaths={projectFilePaths}
        preferredAttachmentPaths={preferredAttachmentPaths}
        isDeck={rendererMatch.renderer.id === 'deck-html'}
        onExportAsPptx={onExportAsPptx}
        streaming={Boolean(streaming)}
        commentQueueOnSend={commentQueueOnSend}
        commentSendDisabled={commentSendDisabled}
        previewComments={previewComments}
        onSavePreviewComment={onSavePreviewComment}
        onRemovePreviewComment={onRemovePreviewComment}
        onSendBoardCommentAttachments={onSendBoardCommentAttachments}
        onFileSaved={onFileSaved}
        commentPortalId={commentPortalId}
        onCommentModeChange={onCommentModeChange}
        shareRequest={shareRequest}
        downloadRequest={downloadRequest}
        slideNavRequest={slideNavRequest}
      />
    );
  }
  if (rendererMatch?.renderer.id === 'react-component') {
    return (
      <ReactComponentViewer
        projectId={projectId}
        file={file}
        onOpenFileReplacing={onOpenFileReplacing}
      />
    );
  }
  if (rendererMatch?.renderer.id === 'markdown') {
    return <MarkdownViewer projectId={projectId} file={file} />;
  }
  if (rendererMatch?.renderer.id === 'svg') {
    return <SvgViewer projectId={projectId} file={file} />;
  }
  const resolvedFilePath = projectFileResolvedPath(file);
  const fileMime = String(file.mime || '').toLowerCase();
  const rasterImageViewer =
    file.kind === 'image'
    || (file.kind === 'sketch' && !isRenderableSketchJson(file))
    || isRenderableImagePath(resolvedFilePath)
    || fileMime.startsWith('image/');
  if (rasterImageViewer) {
    return <ImageViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'video') {
    return <VideoViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'audio') {
    return <AudioViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'sketch' && isRenderableSketchJson(file)) {
    return <SketchViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'text' || file.kind === 'code') {
    return <TextViewer projectId={projectId} file={file} />;
  }
  if (
    file.kind === 'pdf' ||
    file.kind === 'document' ||
    file.kind === 'presentation' ||
    file.kind === 'spreadsheet'
  ) {
    return <DocumentPreviewViewer projectId={projectId} file={file} />;
  }
  return <BinaryViewer projectId={projectId} file={file} />;
}

export function LiveArtifactViewer({
  projectId,
  liveArtifact,
  liveArtifactEvents = [],
  onRefreshArtifacts,
}: {
  projectId: string;
  liveArtifact: LiveArtifactWorkspaceEntry;
  liveArtifactEvents?: LiveArtifactEventItem[];
  onRefreshArtifacts?: () => Promise<void> | void;
}) {
  const t = useTeamverT();
  const tabs = useMemo(() => liveArtifactViewerTabs(t), [t]);
  const [mode, setMode] = useState<LiveArtifactViewerTab>('preview');
  const [detail, setDetail] = useState<LiveArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [zoom, setZoom] = useState(100);
  const liveArtifactViewportKey = `${projectId}:live-artifact:${liveArtifact.artifactId}`;
  const [previewViewport, setPreviewViewportState] = useState<PreviewViewportId>(
    () => htmlPreviewViewportState.get(liveArtifactViewportKey) ?? 'desktop',
  );
  const setPreviewViewport = useCallback((viewport: PreviewViewportId) => {
    setPreviewViewportCached(liveArtifactViewportKey, viewport);
    setPreviewViewportState(viewport);
  }, [liveArtifactViewportKey]);
  const [previewBodyRef, previewBodySize] = usePreviewCanvasSize<HTMLDivElement>();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshSuccess, setRefreshSuccess] = useState<string | null>(null);
  const [refreshEvents, setRefreshEvents] = useState<LiveArtifactRefreshEvent[]>([]);
  const [refreshHistory, setRefreshHistory] = useState<LiveArtifactRefreshLogEntry[]>([]);
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  const [inTabPresent, setInTabPresent] = useState(false);
  const presentWrapRef = useRef<HTMLDivElement | null>(null);
  const [chromeActionsHost, setChromeActionsHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    setChromeActionsHost(resolveChromeActionsHost());
  }, []);
  useEffect(() => {
    if (!presentMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.present-wrap')) return;
      setPresentMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [presentMenuOpen]);

  useEffect(() => {
    setRefreshError(null);
    setRefreshSuccess(null);
    setRefreshEvents([]);
  }, [projectId, liveArtifact.artifactId]);

  useEffect(() => {
    setPreviewViewportState(htmlPreviewViewportState.get(liveArtifactViewportKey) ?? 'desktop');
  }, [liveArtifactViewportKey]);

  useEffect(() => {
    if (!refreshSuccess) return;
    const timeout = window.setTimeout(() => setRefreshSuccess(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [refreshSuccess]);

  const processedLiveArtifactEventIdRef = useRef(0);

  useEffect(() => {
    const pendingEvents = liveArtifactEvents.filter((item) => item.id > processedLiveArtifactEventIdRef.current);
    if (pendingEvents.length === 0) return;
    processedLiveArtifactEventIdRef.current = pendingEvents[pendingEvents.length - 1]?.id ?? processedLiveArtifactEventIdRef.current;

    for (const { event: liveArtifactEvent } of pendingEvents) {
    if (
      (liveArtifactEvent.kind !== 'live_artifact' && liveArtifactEvent.kind !== 'live_artifact_refresh') ||
      liveArtifactEvent.projectId !== projectId ||
      liveArtifactEvent.artifactId !== liveArtifact.artifactId
    ) {
      continue;
    }

    if (liveArtifactEvent.kind === 'live_artifact') {
      setRefreshError(null);
      if (liveArtifactEvent.action === 'deleted') {
        setRefreshSuccess(`Live artifact deleted: ${liveArtifactEvent.title}`);
        continue;
      }
      setRefreshSuccess(
        liveArtifactEvent.action === 'created'
          ? `Live artifact created: ${liveArtifactEvent.title}`
          : `Live artifact updated: ${liveArtifactEvent.title}`,
      );
      void fetchLiveArtifact(projectId, liveArtifact.artifactId).then((next) => {
        if (next) setDetail(next);
      });
      void fetchLiveArtifactRefreshes(projectId, liveArtifact.artifactId).then(setRefreshHistory);
      setReloadKey((n) => n + 1);
      continue;
    }

    if (liveArtifactEvent.phase === 'started') {
      setRefreshing(true);
      setRefreshError(null);
      setRefreshSuccess(null);
      setRefreshEvents((prev) => appendRefreshEvent(prev, { phase: 'started' }));
      continue;
    }

    if (liveArtifactEvent.phase === 'failed') {
      setRefreshing(false);
      setRefreshError(liveArtifactEvent.error ?? t('liveArtifact.refresh.genericFailure'));
      setRefreshEvents((prev) =>
        appendRefreshEvent(prev, {
          phase: 'failed',
          error: liveArtifactEvent.error ?? undefined,
        }),
      );
      void fetchLiveArtifact(projectId, liveArtifact.artifactId).then((next) => {
        if (next) setDetail(next);
      });
      void fetchLiveArtifactRefreshes(projectId, liveArtifact.artifactId).then(setRefreshHistory);
      continue;
    }

    setRefreshing(false);
    setRefreshError(null);
    setRefreshEvents((prev) =>
      appendRefreshEvent(prev, {
        phase: 'succeeded',
        refreshedSourceCount: liveArtifactEvent.refreshedSourceCount ?? 0,
      }),
    );
    if ((liveArtifactEvent.refreshedSourceCount ?? 0) > 0) {
      setRefreshSuccess(t('liveArtifact.refresh.successOne'));
    } else {
      setRefreshError(t('liveArtifact.refresh.noSourceTitle'));
    }
    void fetchLiveArtifact(projectId, liveArtifact.artifactId).then((next) => {
      if (next) setDetail(next);
    });
    void fetchLiveArtifactRefreshes(projectId, liveArtifact.artifactId).then(setRefreshHistory);
    setReloadKey((n) => n + 1);
    }
  }, [liveArtifactEvents, liveArtifact.artifactId, projectId, t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    void fetchLiveArtifact(projectId, liveArtifact.artifactId).then((next) => {
      if (cancelled) return;
      setDetail(next);
      setLoading(false);
    });
    void fetchLiveArtifactRefreshes(projectId, liveArtifact.artifactId).then((next) => {
      if (!cancelled) setRefreshHistory(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, liveArtifact.artifactId, liveArtifact.updatedAt]);

  const previewUrl = useMemo(
    () => `${liveArtifactPreviewUrl(projectId, liveArtifact.artifactId)}&v=${reloadKey}`,
    [projectId, liveArtifact.artifactId, reloadKey],
  );
  const previewScale = zoom / 100;

  // Instrument the live-artifact iframe so failed loads — usually a
  // missing artifact file or a stuck `od://` resolver — surface in
  // PostHog. iframe load errors don't propagate to window.error, so
  // observability/install.ts cannot catch them globally.
  useEffect(() => {
    if (mode !== 'preview') return undefined;
    const node = iframeRef.current;
    if (!node) return undefined;
    return trackIframeLoad({
      iframe: node,
      surface: 'live_artifact_preview',
      artifactId: liveArtifact.artifactId,
      projectId,
    });
  }, [mode, previewUrl, liveArtifact.artifactId, projectId]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    setRefreshSuccess(null);
    setRefreshEvents((prev) => appendRefreshEvent(prev, { phase: 'started' }));
    try {
      const result = await refreshLiveArtifact(projectId, liveArtifact.artifactId);
      setDetail(result.artifact);
      void fetchLiveArtifactRefreshes(projectId, liveArtifact.artifactId).then(setRefreshHistory);
      setReloadKey((n) => n + 1);
      setRefreshEvents((prev) =>
        appendRefreshEvent(prev, {
          phase: 'succeeded',
          refreshedSourceCount: result.refresh.refreshedSourceCount,
        }),
      );
      if (result.refresh.refreshedSourceCount > 0) {
        setRefreshSuccess(t('liveArtifact.refresh.successOne'));
      } else {
        setRefreshError(t('liveArtifact.refresh.noSourceTitle'));
      }
      await onRefreshArtifacts?.();
    } catch (error) {
      const message = refreshErrorMessage(error, t);
      setRefreshError(message);
      setRefreshEvents((prev) => appendRefreshEvent(prev, { phase: 'failed', error: message }));
    } finally {
      setRefreshing(false);
    }
  }

  const dataPayload = detail?.document?.dataJson ?? null;
  const currentRefreshStatus = detail?.refreshStatus ?? liveArtifact.refreshStatus;
  const isRunning = refreshing || currentRefreshStatus === 'running';

  const presentInThisTab = () => {
    setPresentMenuOpen(false);
    setMode('preview');
    setInTabPresent(true);
  };
  const presentFullscreen = () => {
    setPresentMenuOpen(false);
    setMode('preview');
    const target = previewBodyRef.current ?? iframeRef.current;
    if (target?.requestFullscreen) {
      void target.requestFullscreen().catch(() => {});
    }
  };
  const presentNewTab = () => {
    setPresentMenuOpen(false);
    if (typeof window === 'undefined') return;
    window.open(liveArtifactPreviewUrl(projectId, liveArtifact.artifactId), '_blank', 'noopener,noreferrer');
  };
  useEffect(() => {
    if (!inTabPresent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInTabPresent(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inTabPresent]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!zoomMenuRef.current) return;
      if (!zoomMenuRef.current.contains(e.target as Node)) setZoomMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [zoomMenuOpen]);

  return (
    <div className={`viewer html-viewer live-artifact-viewer${inTabPresent ? ' is-tab-present' : ''}`}>
      {((node: ReactNode) => (
        chromeActionsHost ? createPortal(node, chromeActionsHost) : node
      ))(
        <div className="present-wrap chrome-present-wrap" ref={presentWrapRef}>
          <button
            className="chrome-action chrome-action-secondary chrome-action-icon present-trigger od-tooltip"
            aria-haspopup="menu"
            aria-expanded={presentMenuOpen}
            aria-label={t('fileViewer.present')}
            data-tooltip={t('fileViewer.present')}
            data-tooltip-placement="bottom"
            title={t('fileViewer.present')}
            onClick={() => setPresentMenuOpen((v) => !v)}
          >
            <RemixIcon name="slideshow-3-line" size={15} />
          </button>
          {presentMenuOpen ? (
            <div className="present-menu" role="menu">
              <button role="menuitem" onClick={presentInThisTab}>
                <span className="present-icon"><RemixIcon name="eye-line" size={14} /></span>{' '}
                {t('fileViewer.presentInTab')}
              </button>
              <button role="menuitem" onClick={presentFullscreen}>
                <span className="present-icon"><RemixIcon name="play-line" size={14} /></span>{' '}
                {t('fileViewer.presentFullscreen')}
              </button>
              <button role="menuitem" onClick={presentNewTab}>
                <span className="present-icon"><RemixIcon name="share-forward-line" size={14} /></span>{' '}
                {t('fileViewer.presentNewTab')}
              </button>
            </div>
          ) : null}
        </div>
      )}
      {inTabPresent ? (
        <button
          type="button"
          className="present-exit-btn"
          onClick={() => setInTabPresent(false)}
          title={t('common.exitFullscreen')}
          aria-label={t('common.exitFullscreen')}
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
            <button
              type="button"
              className="icon-only od-tooltip"
              onClick={() => setReloadKey((n) => n + 1)}
              title={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
              data-tooltip={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
              data-tooltip-placement="bottom"
              aria-label={`${t('fileViewer.reloadAria')} ${t('fileViewer.preview')}`}
            >
            <Icon name="reload" size={14} />
          </button>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`viewer-tab ${mode === tab.id ? 'active' : ''}`}
                onClick={() => setMode(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            className="viewer-preview-controls"
            data-active={mode === 'preview' ? 'true' : 'false'}
            aria-hidden={mode === 'preview' ? undefined : true}
          >
            <span className="viewer-divider" aria-hidden />
            <PreviewViewportControls
              viewport={previewViewport}
              onViewport={setPreviewViewport}
              t={t}
              tabIndex={mode === 'preview' ? 0 : -1}
            />
            <span className="viewer-divider" aria-hidden />
            <div className="zoom-menu viewer-toolbar-zoom" ref={zoomMenuRef}>
              <button
                type="button"
                className="viewer-action zoom-trigger od-tooltip"
                aria-haspopup="menu"
                aria-expanded={zoomMenuOpen}
                title={t('fileViewer.resetZoom')}
                data-tooltip={t('fileViewer.resetZoom')}
                data-tooltip-placement="bottom"
                tabIndex={mode === 'preview' ? 0 : -1}
                onClick={() => setZoomMenuOpen((v) => !v)}
              >
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{zoom}%</span>
              </button>
              {zoomMenuOpen && mode === 'preview' ? (
                <div className="zoom-menu-popover" role="menu">
                  {[50, 75, 100, 125, 150, 200].map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`zoom-menu-item${zoom === level ? ' active' : ''}`}
                      role="menuitem"
                      onClick={() => {
                        setZoom(level);
                        setZoomMenuOpen(false);
                      }}
                    >
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{level}%</span>
                      {zoom === level ? (
                        <Icon name="check" size={13} />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <span className="viewer-divider" aria-hidden />
            <a
              className="ghost-link"
              href={liveArtifactPreviewUrl(projectId, liveArtifact.artifactId)}
              target="_blank"
              rel="noreferrer noopener"
              tabIndex={mode === 'preview' ? 0 : -1}
            >
              {t('fileViewer.open')}
            </a>
          </div>
          <span className="viewer-divider" aria-hidden />
          <button
            type="button"
            className="viewer-action primary"
            data-running={isRunning ? 'true' : 'false'}
            onClick={() => void handleRefresh()}
            disabled={isRunning}
            aria-busy={isRunning}
            aria-label={isRunning ? t('liveArtifact.refresh.running') : t('liveArtifact.refresh.button')}
            title={
              isRunning
                ? t('liveArtifact.refresh.running')
                : t('liveArtifact.refresh.buttonTitle')
            }
          >
            <Icon name={isRunning ? 'spinner' : 'reload'} size={13} />
            <span>{isRunning ? t('liveArtifact.refresh.running') : t('liveArtifact.refresh.button')}</span>
          </button>
        </div>
      </div>
      <div className="viewer-body" ref={previewBodyRef}>
        {refreshError ? (
          <LiveArtifactRefreshNotice
            tone="error"
            message={refreshError}
            action={t('liveArtifact.refresh.failureAction')}
          />
        ) : refreshSuccess ? (
          <LiveArtifactRefreshNotice
            tone="success"
            message={refreshSuccess}
            action={t('liveArtifact.refresh.successAction')}
            onDismiss={() => setRefreshSuccess(null)}
            dismissLabel={t('common.close')}
          />
        ) : isRunning ? (
          <LiveArtifactRefreshNotice
            tone="running"
            message={t('liveArtifact.refresh.runningMessage')}
            action={t('liveArtifact.refresh.runningAction')}
          />
        ) : currentRefreshStatus === 'failed' ? (
          <LiveArtifactRefreshNotice
            tone="error"
            message={t('liveArtifact.refresh.previousFailure', { message: t('liveArtifact.refresh.genericFailure') })}
            action={t('liveArtifact.refresh.failureAction')}
          />
        ) : null}
        <div
          className={`live-artifact-preview-layer preview-viewport preview-viewport-${previewViewport}`}
          data-active={mode === 'preview' ? 'true' : 'false'}
          aria-hidden={mode === 'preview' ? undefined : true}
          style={previewViewportStyle(previewViewport, previewScale, previewBodySize)}
        >
          <div className="preview-frame-clip">
            <div style={previewScaleShellStyle(previewViewport, previewScale)}>
              <PreviewDrawOverlay>
                <iframe
                  ref={iframeRef}
                  data-testid="live-artifact-preview-frame"
                  title={liveArtifact.title}
                  sandbox="allow-scripts allow-popups allow-downloads"
                  src={previewUrl}
                />
              </PreviewDrawOverlay>
            </div>
          </div>
        </div>
        {mode !== 'preview' && loading ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : mode === 'code' ? (
          <LiveArtifactCodePanel
            projectId={projectId}
            artifactId={liveArtifact.artifactId}
            reloadKey={reloadKey}
          />
        ) : mode === 'data' ? (
          <JsonPanel value={dataPayload} emptyLabel={t('liveArtifact.viewer.dataEmpty')} />
        ) : (
          <LiveArtifactRefreshHistoryPanel
            liveArtifact={detail}
            fallbackRefreshStatus={liveArtifact.refreshStatus}
            fallbackLastRefreshedAt={liveArtifact.lastRefreshedAt}
            isRunning={isRunning}
            sessionEvents={refreshEvents}
            persistedEvents={refreshHistory}
          />
        )}
      </div>
    </div>
  );
}

function LiveArtifactRefreshNotice({
  tone,
  message,
  action,
  onDismiss,
  dismissLabel,
}: {
  tone: 'running' | 'success' | 'error';
  message: string;
  action: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <div
      className={`live-artifact-refresh-notice ${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-label={`${message} ${action}`}
    >
      <span className="live-artifact-refresh-notice-copy">
        <strong>{message}</strong>
        <span>{action}</span>
      </span>
      {onDismiss ? (
        <button type="button" className="icon-only" onClick={onDismiss} aria-label={dismissLabel}>
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </div>
  );
}

function refreshErrorMessage(error: unknown, t: TranslateFn): string {
  if (error instanceof LiveArtifactRefreshError && error.status === 0) {
    return t('liveArtifact.refresh.networkFailure');
  }
  if (error instanceof LiveArtifactRefreshError && error.code === 'LIVE_ARTIFACT_REFRESH_UNAVAILABLE') {
    return t('liveArtifact.refresh.noSourceTitle');
  }
  if (error instanceof Error && error.message.length > 0) return error.message;
  return t('liveArtifact.refresh.genericFailure');
}

function liveArtifactViewerTabs(t: TranslateFn): Array<{ id: LiveArtifactViewerTab; label: string }> {
  return [
    { id: 'preview', label: t('liveArtifact.viewer.tabPreview') },
    { id: 'code', label: t('liveArtifact.viewer.tabCode') },
    { id: 'data', label: t('liveArtifact.viewer.tabData') },
    { id: 'refresh-history', label: t('liveArtifact.viewer.tabRefreshHistory') },
  ];
}

type LiveArtifactCodeVariant = 'template' | 'rendered-source';

function LiveArtifactCodePanel({
  projectId,
  artifactId,
  reloadKey,
}: {
  projectId: string;
  artifactId: string;
  reloadKey: number;
}) {
  const t = useTeamverT();
  const [variant, setVariant] = useState<LiveArtifactCodeVariant>('template');
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setCode(null);
    void fetchLiveArtifactCode(projectId, artifactId, variant).then((next) => {
      if (cancelled) return;
      setCode(next);
      setFailed(next == null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [artifactId, projectId, reloadKey, variant]);

  return (
    <div className="live-artifact-code-panel">
      <div className="live-artifact-code-header">
        <div className="live-artifact-code-copy">
          <strong>
            {variant === 'template'
              ? t('liveArtifact.viewer.code.templateHeading')
              : t('liveArtifact.viewer.code.renderedHeading')}
          </strong>
          <span>
            {variant === 'template'
              ? t('liveArtifact.viewer.code.templateHelp')
              : t('liveArtifact.viewer.code.renderedHelp')}
          </span>
        </div>
        <div
          className="viewer-tabs live-artifact-code-tabs"
          aria-label={t('liveArtifact.viewer.code.variantAria')}
        >
          <button
            type="button"
            className={`viewer-tab ${variant === 'template' ? 'active' : ''}`}
            onClick={() => setVariant('template')}
          >
            {t('liveArtifact.viewer.code.variantTemplate')}
          </button>
          <button
            type="button"
            className={`viewer-tab ${variant === 'rendered-source' ? 'active' : ''}`}
            onClick={() => setVariant('rendered-source')}
          >
            {t('liveArtifact.viewer.code.variantRendered')}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="viewer-empty">{t('liveArtifact.viewer.code.loading')}</div>
      ) : failed ? (
        <div className="viewer-empty">{t('liveArtifact.viewer.code.unavailable')}</div>
      ) : code && code.trim().length > 0 ? (
        <pre className="viewer-source">{code}</pre>
      ) : (
        <div className="viewer-empty">{t('liveArtifact.viewer.code.empty')}</div>
      )}
    </div>
  );
}

function JsonPanel({ value, emptyLabel }: { value: unknown; emptyLabel: string }) {
  if (value == null) return <div className="viewer-empty">{emptyLabel}</div>;
  return <pre className="viewer-source">{JSON.stringify(value, null, 2)}</pre>;
}

function liveArtifactMetadataPayload(liveArtifact: LiveArtifact): unknown {
  return {
    artifact: {
      id: liveArtifact.id,
      title: liveArtifact.title,
      slug: liveArtifact.slug,
      status: liveArtifact.status,
      pinned: liveArtifact.pinned,
      preview: liveArtifact.preview,
      refreshStatus: liveArtifact.refreshStatus,
      createdAt: liveArtifact.createdAt,
      updatedAt: liveArtifact.updatedAt,
      lastRefreshedAt: liveArtifact.lastRefreshedAt,
    },
    document: liveArtifact.document
      ? {
          format: liveArtifact.document.format,
          templatePath: liveArtifact.document.templatePath,
          generatedPreviewPath: liveArtifact.document.generatedPreviewPath,
          dataPath: liveArtifact.document.dataPath,
          dataSchemaJson: liveArtifact.document.dataSchemaJson,
          sourceJson: liveArtifact.document.sourceJson,
        }
      : null,
  };
}

function liveArtifactProvenancePayload(liveArtifact: LiveArtifact): unknown {
  return {
    documentSource: liveArtifact.document?.sourceJson ?? null,
  };
}

function liveArtifactRefreshPayload(liveArtifact: LiveArtifact): unknown {
  return {
    refreshStatus: liveArtifact.refreshStatus,
    lastRefreshedAt: liveArtifact.lastRefreshedAt ?? null,
  };
}

type LiveArtifactRefreshStatus = LiveArtifact['refreshStatus'];

interface LiveArtifactRefreshEvent {
  id: number;
  phase: 'started' | 'succeeded' | 'failed';
  at: number;
  durationMs?: number;
  refreshedSourceCount?: number;
  error?: string;
}

let refreshEventSequence = 0;

function appendRefreshEvent(
  prev: LiveArtifactRefreshEvent[],
  next: Omit<LiveArtifactRefreshEvent, 'id' | 'at' | 'durationMs'>,
): LiveArtifactRefreshEvent[] {
  const at = Date.now();
  refreshEventSequence += 1;
  const event: LiveArtifactRefreshEvent = { ...next, id: refreshEventSequence, at };
  if (next.phase !== 'started') {
    // Pair with the most recent 'started' to compute duration.
    for (let i = prev.length - 1; i >= 0; i -= 1) {
      const candidate = prev[i];
      if (candidate && candidate.phase === 'started') {
        event.durationMs = Math.max(0, at - candidate.at);
        break;
      }
    }
  }
  // Cap at 25 entries to keep the panel lightweight.
  const MAX = 25;
  const combined = [...prev, event];
  return combined.length > MAX ? combined.slice(combined.length - MAX) : combined;
}

function formatAbsoluteDateTime(iso: string | number | undefined): string | null {
  if (iso === undefined || iso === null) return null;
  const date = typeof iso === 'number' ? new Date(iso) : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return date.toISOString();
  }
}

function formatRelativeTime(
  iso: string | number | undefined,
  now = Date.now(),
  locale: Locale = 'en',
  t?: TranslateFn,
): string | null {
  if (iso === undefined || iso === null) return null;
  const ms = typeof iso === 'number' ? iso : new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const deltaSec = Math.round((ms - now) / 1000);
  const abs = Math.abs(deltaSec);
  if (abs < 5) {
    // "just now" lives in the i18n dict because Intl.RelativeTimeFormat's
    // "0 seconds ago" reads awkwardly in narrow style and we want a
    // single canonical translation per locale. Fall back to the English
    // literal only when called without t (background utilities, tests).
    return t ? t('liveArtifact.refresh.justNow') : 'just now';
  }
  // Intl.RelativeTimeFormat handles tense (past / future), pluralisation,
  // and word-order per locale so the panel matches the rest of the
  // localised UI instead of mixing in English units like `5s ago`.
  // `style: 'narrow'` keeps the English output close to the historical
  // `5s ago` shape; `numeric: 'always'` forces numeric output so we
  // don't get "yesterday" / "now" mixed in unexpectedly with the
  // bucketing above.
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'always' });
  } catch {
    rtf = new Intl.RelativeTimeFormat('en', { style: 'narrow', numeric: 'always' });
  }
  const value = deltaSec; // negative = past, positive = future
  if (abs < 60) return rtf.format(value, 'second');
  if (abs < 3600) return rtf.format(Math.round(value / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(value / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(value / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(value / (86400 * 30)), 'month');
  return rtf.format(Math.round(value / (86400 * 365)), 'year');
}

function formatDurationMs(ms: number | undefined): string | null {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return null;
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function exportReadyNudgeKey(projectId: string, fileName: string): string {
  return `${EXPORT_READY_NUDGE_STORAGE_PREFIX}${projectId}:${fileName}`;
}

function hasSeenExportReadyNudge(projectId: string, fileName: string): boolean {
  try {
    return window.sessionStorage.getItem(exportReadyNudgeKey(projectId, fileName)) === '1';
  } catch {
    return false;
  }
}

function markExportReadyNudgeSeen(projectId: string, fileName: string) {
  try {
    window.sessionStorage.setItem(exportReadyNudgeKey(projectId, fileName), '1');
  } catch {
    // Ignore storage-denied contexts; the in-memory state still prevents loops.
  }
}

interface RefreshStatusDescriptor {
  label: string;
  tone: 'neutral' | 'running' | 'success' | 'warning' | 'error';
  description: string;
}

function describeRefreshStatus(
  status: LiveArtifactRefreshStatus,
  t: TranslateFn,
): RefreshStatusDescriptor {
  switch (status) {
    case 'running':
      return {
        label: t('liveArtifact.refresh.statusRunning'),
        tone: 'running',
        description: t('liveArtifact.refresh.statusRunningDescription'),
      };
    case 'succeeded':
      return {
        label: t('liveArtifact.refresh.statusSucceeded'),
        tone: 'success',
        description: t('liveArtifact.refresh.statusSucceededDescription'),
      };
    case 'failed':
      return {
        label: t('liveArtifact.refresh.statusFailed'),
        tone: 'error',
        description: t('liveArtifact.refresh.statusFailedDescription'),
      };
    case 'idle':
      return {
        label: t('liveArtifact.refresh.statusReady'),
        tone: 'neutral',
        description: t('liveArtifact.refresh.statusReadyDescription'),
      };
    case 'never':
    default:
      return {
        label: t('liveArtifact.refresh.statusNever'),
        tone: 'warning',
        description: t('liveArtifact.refresh.statusNeverDescription'),
      };
  }
}

function describeEventPhase(
  event: LiveArtifactRefreshEvent,
  t: TranslateFn,
): { label: string; tone: 'running' | 'success' | 'error' } {
  if (event.phase === 'started')
    return { label: t('liveArtifact.refresh.eventStarted'), tone: 'running' };
  if (event.phase === 'succeeded')
    return { label: t('liveArtifact.refresh.eventSucceeded'), tone: 'success' };
  return { label: t('liveArtifact.refresh.eventFailed'), tone: 'error' };
}

function describePersistedStatus(
  status: LiveArtifactRefreshLogEntry['status'],
  t: TranslateFn,
): string {
  switch (status) {
    case 'succeeded':
      return t('liveArtifact.refresh.persistedStatusSucceeded');
    case 'running':
      return t('liveArtifact.refresh.persistedStatusRunning');
    case 'failed':
      return t('liveArtifact.refresh.persistedStatusFailed');
    case 'cancelled':
      return t('liveArtifact.refresh.persistedStatusCancelled');
    case 'skipped':
      return t('liveArtifact.refresh.persistedStatusSkipped');
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function LiveArtifactRefreshHistoryPanel({
  liveArtifact,
  fallbackRefreshStatus,
  fallbackLastRefreshedAt,
  isRunning,
  sessionEvents,
  persistedEvents = [],
}: {
  liveArtifact: LiveArtifact | null;
  fallbackRefreshStatus: LiveArtifactRefreshStatus;
  fallbackLastRefreshedAt?: string;
  isRunning: boolean;
  sessionEvents: LiveArtifactRefreshEvent[];
  persistedEvents?: LiveArtifactRefreshLogEntry[];
}) {
  const t = useTeamverT();
  const { locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Keep relative timestamps fresh; 30s cadence is enough for "x minutes ago" feel.
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const status: LiveArtifactRefreshStatus = isRunning
    ? 'running'
    : liveArtifact?.refreshStatus ?? fallbackRefreshStatus;
  const descriptor = describeRefreshStatus(status, t);
  const lastRefreshedAt = liveArtifact?.lastRefreshedAt ?? fallbackLastRefreshedAt;
  const createdAt = liveArtifact?.createdAt;
  const updatedAt = liveArtifact?.updatedAt;
  const documentSource = liveArtifact?.document?.sourceJson ?? null;
  const reversedEvents = [...sessionEvents].reverse();
  const reversedPersistedEvents = [...persistedEvents].reverse().slice(0, 25);
  const rawDebugPayload = liveArtifact
    ? {
        refresh: liveArtifactRefreshPayload(liveArtifact),
        metadata: liveArtifactMetadataPayload(liveArtifact),
        provenance: liveArtifactProvenancePayload(liveArtifact),
      }
    : null;

  return (
    <div className="live-artifact-refresh-panel">
      <section className="live-artifact-refresh-hero">
        <div className="live-artifact-refresh-hero-main">
          <span
            className={`live-artifact-badge refresh-status tone-${descriptor.tone}`}
            data-testid="live-artifact-refresh-status-badge"
          >
            {descriptor.label}
          </span>
          <p className="live-artifact-refresh-hero-desc">{descriptor.description}</p>
        </div>
        <div className="live-artifact-refresh-hero-meta">
          <div className="live-artifact-refresh-hero-metric">
            <span className="live-artifact-refresh-label">
              {t('liveArtifact.refresh.heroLastRefreshedLabel')}
            </span>
            {lastRefreshedAt ? (
              <>
                <span className="live-artifact-refresh-value">
                  {formatRelativeTime(lastRefreshedAt, now, locale, t) ?? '—'}
                </span>
                <span
                  className="live-artifact-refresh-sub"
                  title={formatAbsoluteDateTime(lastRefreshedAt) ?? undefined}
                >
                  {formatAbsoluteDateTime(lastRefreshedAt) ?? ''}
                </span>
              </>
            ) : (
              <span className="live-artifact-refresh-value muted">
                {t('liveArtifact.refresh.heroLastRefreshedNever')}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="live-artifact-refresh-facts">
        <LiveArtifactRefreshFact
          label={t('liveArtifact.refresh.factCreated')}
          iso={createdAt}
          emptyLabel={t('liveArtifact.refresh.factUnknown')}
          now={now}
          locale={locale}
          t={t}
        />
        <LiveArtifactRefreshFact
          label={t('liveArtifact.refresh.factLastUpdated')}
          iso={updatedAt}
          emptyLabel={t('liveArtifact.refresh.factUnknown')}
          now={now}
          locale={locale}
          t={t}
        />
      </section>

      <section className="live-artifact-refresh-section">
        <header className="live-artifact-refresh-section-header">
          <h4>{t('liveArtifact.refresh.persistedTitle')}</h4>
          <span className="live-artifact-refresh-hint">
            {t('liveArtifact.refresh.persistedHint')}
          </span>
        </header>
        {reversedPersistedEvents.length === 0 ? (
          <div className="live-artifact-refresh-empty">
            {t('liveArtifact.refresh.persistedEmpty')}
          </div>
        ) : (
          <ol className="live-artifact-refresh-timeline">
            {reversedPersistedEvents.map((event) => {
              const tone = event.status === 'succeeded'
                ? 'success'
                : event.status === 'running'
                  ? 'running'
                  : event.status === 'failed' || event.status === 'cancelled'
                    ? 'error'
                    : 'running';
              const duration = formatDurationMs(event.durationMs);
              return (
                <li key={`${event.refreshId}:${event.sequence}`} className={`live-artifact-refresh-event tone-${tone}`}>
                  <span className="live-artifact-refresh-event-dot" aria-hidden />
                  <div className="live-artifact-refresh-event-body">
                    <div className="live-artifact-refresh-event-row">
                      <span className={`live-artifact-badge refresh-status tone-${tone}`}>
                        {describePersistedStatus(event.status, t)}
                      </span>
                      <strong>{event.step}</strong>
                      <span className="live-artifact-refresh-event-time">
                        {formatRelativeTime(event.startedAt, now, locale, t)
                          ?? t('liveArtifact.refresh.justNow')}
                      </span>
                    </div>
                    <div className="live-artifact-refresh-event-meta">
                      <span>{event.refreshId}</span>
                      {duration ? <span>{duration}</span> : null}
                      {event.error?.message ? <span>{event.error.message}</span> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="live-artifact-refresh-section">
        <header className="live-artifact-refresh-section-header">
          <h4>{t('liveArtifact.refresh.sessionTitle')}</h4>
          <span className="live-artifact-refresh-hint">
            {t('liveArtifact.refresh.sessionHint')}
          </span>
        </header>
        {reversedEvents.length === 0 ? (
          <div className="live-artifact-refresh-empty">
            {t('liveArtifact.refresh.timelineEmpty')}
          </div>
        ) : (
          <ol className="live-artifact-refresh-timeline">
            {reversedEvents.map((event) => {
              const phase = describeEventPhase(event, t);
              const duration = formatDurationMs(event.durationMs);
              const refreshedCount = event.refreshedSourceCount ?? 0;
              return (
                <li key={event.id} className={`live-artifact-refresh-event tone-${phase.tone}`}>
                  <span className="live-artifact-refresh-event-dot" aria-hidden />
                  <div className="live-artifact-refresh-event-body">
                    <div className="live-artifact-refresh-event-row">
                      <span
                        className={`live-artifact-badge refresh-status tone-${phase.tone}`}
                      >
                        {phase.label}
                      </span>
                      <span
                        className="live-artifact-refresh-event-time"
                        title={formatAbsoluteDateTime(event.at) ?? undefined}
                      >
                        {formatRelativeTime(event.at, now, locale, t) ?? ''}
                      </span>
                    </div>
                    <div className="live-artifact-refresh-event-detail">
                      {event.phase === 'succeeded' ? (
                        <span>
                          {t(
                            refreshedCount === 1
                              ? 'liveArtifact.refresh.sourcesUpdatedOne'
                              : 'liveArtifact.refresh.sourcesUpdatedMany',
                            { n: refreshedCount },
                          )}
                          {duration ? ` · ${duration}` : ''}
                        </span>
                      ) : event.phase === 'failed' ? (
                        <span>
                          {event.error ?? t('liveArtifact.refresh.genericFailure')}
                          {duration ? ` · ${duration}` : ''}
                        </span>
                      ) : (
                        <span>{t('liveArtifact.refresh.eventStartedDetail')}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {documentSource ? (
        <section className="live-artifact-refresh-section">
          <header className="live-artifact-refresh-section-header">
            <h4>{t('liveArtifact.refresh.docSourceTitle')}</h4>
            <span className="live-artifact-refresh-hint">
              {t('liveArtifact.refresh.docSourceHint')}
            </span>
          </header>
          <dl className="live-artifact-refresh-kv">
            <div>
              <dt>{t('liveArtifact.refresh.docSourceType')}</dt>
              <dd>{documentSource.type}</dd>
            </div>
            {documentSource.toolName ? (
              <div>
                <dt>{t('liveArtifact.refresh.docSourceTool')}</dt>
                <dd>
                  <code>{documentSource.toolName}</code>
                </dd>
              </div>
            ) : null}
            {documentSource.connector ? (
              <div>
                <dt>{t('liveArtifact.refresh.docSourceConnector')}</dt>
                <dd>
                  {documentSource.connector.accountLabel ??
                    documentSource.connector.connectorId}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {rawDebugPayload != null ? (
        <details className="live-artifact-refresh-raw">
          <summary>{t('liveArtifact.refresh.debugSummary')}</summary>
          <p className="live-artifact-refresh-raw-note">
            {t('liveArtifact.refresh.debugNote')}
          </p>
          <pre className="viewer-source">{JSON.stringify(rawDebugPayload, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function LiveArtifactRefreshFact({
  label,
  iso,
  value,
  helper,
  emptyLabel,
  now,
  locale,
  t,
}: {
  label: string;
  iso?: string;
  value?: string;
  helper?: string;
  emptyLabel?: string;
  now?: number;
  locale?: Locale;
  t?: TranslateFn;
}) {
  const relative = iso !== undefined ? formatRelativeTime(iso, now, locale, t) : null;
  const absolute = iso !== undefined ? formatAbsoluteDateTime(iso) : null;
  const resolved = value ?? relative ?? emptyLabel ?? '—';
  const sub = helper ?? (iso !== undefined ? absolute ?? '' : '');
  return (
    <div className="live-artifact-refresh-fact">
      <span className="live-artifact-refresh-label">{label}</span>
      <span className="live-artifact-refresh-value" title={absolute ?? undefined}>
        {resolved}
      </span>
      {sub ? <span className="live-artifact-refresh-sub">{sub}</span> : null}
    </div>
  );
}

function FileActions({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useTeamverT();
  return (
    <div className="viewer-toolbar-actions">
      <a
        className="ghost-link"
        href={projectFileUrl(projectId, file.name)}
        download={file.name}
      >
        {t('fileViewer.download')}
      </a>
      <a
        className="ghost-link"
        href={projectFileUrl(projectId, file.name)}
        target="_blank"
        rel="noreferrer noopener"
      >
        {t('fileViewer.open')}
      </a>
    </div>
  );
}

function formatCommentTime(ts: number, t: TranslateFn): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return t('common.justNow');
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return t('common.minutesAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('common.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('common.daysAgo', { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t('common.weeksAgo', { n: weeks });
  return new Date(ts).toLocaleDateString();
}

function commentActivityAt(comment: PreviewComment): number {
  return Math.max(
    Number.isFinite(comment.updatedAt) ? comment.updatedAt : 0,
    Number.isFinite(comment.createdAt) ? comment.createdAt : 0,
  );
}

function commentCreatedAt(comment: PreviewComment): number {
  return Number.isFinite(comment.createdAt) ? comment.createdAt : commentActivityAt(comment);
}

function commentTargetIntersectsPreview(
  target: PreviewCommentSnapshot | null,
  scale: number,
  offset: { x: number; y: number },
  bounds?: PreviewCanvasSize,
): boolean {
  if (!target || !bounds?.width || !bounds.height) return true;
  const rect = overlayBoundsFromSnapshot(target, scale, offset);
  const margin = 8;
  return (
    rect.left + rect.width > margin &&
    rect.top + rect.height > margin &&
    rect.left < bounds.width - margin &&
    rect.top < bounds.height - margin
  );
}

function commentDisplayLabel(comment: PreviewComment, t: TranslateFn): string {
  if (comment.elementId.startsWith('pin-')) return t('chat.comments.pin');
  const label = String(comment.label || '').trim().toLowerCase();
  const htmlHint = String(comment.htmlHint || '').trim().toLowerCase();
  const elementId = String(comment.elementId || '').trim().toLowerCase();
  const source = `${label} ${htmlHint} ${elementId}`;
  if (/\b(?:img|picture|video|canvas|svg)\b/.test(source)) return t('chat.comments.targetImage');
  if (/\b(?:button|input|textarea|select|label)\b/.test(source)) return t('chat.comments.targetControl');
  if (/^<a\b/.test(htmlHint)) return t('chat.comments.targetLink');
  if (/\b(?:h1|h2|h3|h4|h5|h6|p|span|strong|em|small|li|dt|dd)\b/.test(source)) return t('chat.comments.targetText');
  if (/\b(?:section|main|header|footer|nav|article|aside)\b/.test(source)) return t('chat.comments.targetSection');
  if (label.endsWith('.html') || elementId.startsWith('file-comment-')) return t('chat.comments.targetPage');
  if (comment.text.trim()) return t('chat.comments.targetText');
  return t('chat.comments.targetArea');
}

export function CommentSidePanel({
  comments,
  projectId,
  selectedIds,
  activeCommentId,
  collapsed,
  onCollapsedChange,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onReorder,
  onReply,
  onSendSelected,
  onCreateComment,
  sending,
  queueOnSend = false,
  sendDisabled = false,
  renderCreateForm = true,
  t,
  composer,
}: {
  comments: PreviewComment[];
  projectId?: string;
  selectedIds: Set<string>;
  activeCommentId: string | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onToggleSelect: (commentId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onReorder?: (orderedIds: string[]) => void;
  onReply: (comment: PreviewComment) => void;
  onSendSelected: () => void | Promise<void>;
  onCreateComment?: (note: string) => boolean | Promise<boolean>;
  sending: boolean;
  queueOnSend?: boolean;
  sendDisabled?: boolean;
  renderCreateForm?: boolean;
  t: TranslateFn;
  composer?: ReactNode;
}) {
  const [newCommentDraft, setNewCommentDraft] = useState('');
  const [dragState, setDragState] = useState<CommentSideDragState | null>(null);
  const sorted = comments;
  const visibleSelectedIds = new Set(comments.filter((comment) => selectedIds.has(comment.id)).map((comment) => comment.id));
  const selectedCount = visibleSelectedIds.size;
  const allSelected = comments.length > 0 && selectedCount === comments.length;
  const commentsLabel = t('chat.tabComments');
  const canCreateComment = Boolean(onCreateComment) && newCommentDraft.trim().length > 0 && !sending && !sendDisabled;
  const canReorder = Boolean(onReorder && sorted.length > 1);
  const collapsedRailRef = useRef<HTMLButtonElement | null>(null);
  const expandedToggleRef = useRef<HTMLButtonElement | null>(null);
  const pendingToggleFocusRef = useRef<'collapsed' | 'expanded' | null>(null);
  const panelId = useId();
  const handleDragStart = (event: ReactDragEvent<HTMLButtonElement>, comment: PreviewComment) => {
    if (!canReorder) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(COMMENT_SIDE_DRAG_MIME, comment.id);
    event.dataTransfer.setData('text/plain', comment.id);
    setDragState({ draggingId: comment.id, overId: comment.id, edge: null });
  };
  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>, targetId: string) => {
    if (!canReorder) return;
    const draggingId = dragState?.draggingId || event.dataTransfer.getData(COMMENT_SIDE_DRAG_MIME);
    if (!draggingId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (draggingId === targetId) {
      if (dragState?.overId !== targetId || dragState.edge !== null) {
        setDragState({ draggingId, overId: targetId, edge: null });
      }
      return;
    }
    const edge = commentSideDropEdgeForEvent(event);
    if (
      dragState?.draggingId !== draggingId ||
      dragState.overId !== targetId ||
      dragState.edge !== edge
    ) {
      setDragState({ draggingId, overId: targetId, edge });
    }
  };
  const handleDrop = (event: ReactDragEvent<HTMLDivElement>, targetId: string) => {
    if (!canReorder) return;
    event.preventDefault();
    const draggingId =
      dragState?.draggingId ||
      event.dataTransfer.getData(COMMENT_SIDE_DRAG_MIME) ||
      event.dataTransfer.getData('text/plain');
    if (!draggingId || draggingId === targetId) {
      setDragState(null);
      return;
    }
    const edge = dragState?.overId === targetId && dragState.edge
      ? dragState.edge
      : commentSideDropEdgeForEvent(event);
    const nextIds = reorderPreviewCommentIds(sorted, draggingId, targetId, edge);
    if (nextIds.join('\0') !== sorted.map((comment) => comment.id).join('\0')) {
      onReorder?.(nextIds);
    }
    setDragState(null);
  };
  const submitNewComment = async () => {
    if (!onCreateComment || !newCommentDraft.trim()) return;
    const saved = await onCreateComment(newCommentDraft.trim());
    if (saved) setNewCommentDraft('');
  };

  useEffect(() => {
    const target =
      pendingToggleFocusRef.current === 'collapsed'
        ? collapsedRailRef.current
        : pendingToggleFocusRef.current === 'expanded'
          ? expandedToggleRef.current
          : null;
    if (!target) return;
    pendingToggleFocusRef.current = null;
    target.focus();
  }, [collapsed]);

  const handleCollapsedChange = (
    nextCollapsed: boolean,
    nextFocusTarget: 'collapsed' | 'expanded',
  ) => {
    pendingToggleFocusRef.current = nextFocusTarget;
    onCollapsedChange(nextCollapsed);
  };

  if (collapsed) {
    return (
      <button
        ref={collapsedRailRef}
        type="button"
        className="comment-side-rail"
        data-testid="comment-side-collapsed-rail"
        aria-label={t('preview.showSidebar', { label: commentsLabel })}
        aria-expanded={false}
        title={t('preview.showSidebar', { label: commentsLabel })}
        onClick={() => handleCollapsedChange(false, 'expanded')}
      >
        <RemixIcon name="message-3-line" size={15} />
        <span>{commentsLabel}</span>
        {comments.length > 0 ? <strong>{comments.length}</strong> : null}
      </button>
    );
  }

  return (
    <aside id={panelId} className="comment-side-panel" data-testid="comment-side-panel" aria-label={commentsLabel}>
      <div className="comment-side-header">
        <div className="comment-side-title">
          <RemixIcon name="message-3-line" size={15} />
          <span>{commentsLabel}</span>
        </div>
        <div className="comment-side-header-actions">
          {comments.length > 0 ? (
            <button
              type="button"
              className="comment-side-select-all"
              disabled={allSelected}
              onClick={onSelectAll}
            >
              {t('chat.comments.selectAll')}
            </button>
          ) : null}
          <button
            ref={expandedToggleRef}
            type="button"
            className="comment-side-collapse"
            aria-label={t('preview.hideSidebar', { label: commentsLabel })}
            aria-controls={panelId}
            aria-expanded={true}
            title={t('preview.hideSidebar', { label: commentsLabel })}
            onClick={() => handleCollapsedChange(true, 'collapsed')}
          >
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      </div>
      <div
        className="comment-side-list"
        onDragLeave={(event) => {
          const related = event.relatedTarget;
          if (related instanceof Node && event.currentTarget.contains(related)) return;
          setDragState(null);
        }}
      >
        {sorted.length === 0 ? (
          <div className="comment-side-empty">
            {t('chat.comments.emptySaved')}
          </div>
        ) : sorted.map((comment, index) => {
          const selected = visibleSelectedIds.has(comment.id);
          const active = comment.id === activeCommentId;
          const isDragging = dragState?.draggingId === comment.id;
          const dropClass = dragState?.overId === comment.id &&
            dragState.draggingId !== comment.id &&
            dragState.edge
            ? ` comment-side-item-drop-${dragState.edge}`
            : '';
          return (
            <div
              key={comment.id}
              className={`comment-side-item${selected ? ' selected' : ''}${active ? ' active' : ''}${isDragging ? ' dragging' : ''}${dropClass}`}
              data-testid="comment-side-item"
              data-comment-id={comment.id}
              aria-current={active ? 'true' : undefined}
              role="button"
              tabIndex={0}
              onDragOver={(event) => handleDragOver(event, comment.id)}
              onDrop={(event) => handleDrop(event, comment.id)}
              onClick={() => onReply(comment)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onReply(comment);
              }}
            >
              <div className="comment-side-item-head">
                <button
                  type="button"
                  className="comment-side-drag-handle"
                  title={t('chat.queuedReorder')}
                  aria-label={t('chat.queuedReorder')}
                  draggable={canReorder}
                  disabled={!canReorder}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => handleDragStart(event, comment)}
                  onDragEnd={() => setDragState(null)}
                >
                  <Icon name="grip-vertical" size={13} />
                </button>
                <span className="comment-side-author">
                  <strong>{`${index + 1}. ${commentDisplayLabel(comment, t)}`}</strong>
                </span>
                <span className="comment-side-time">{formatCommentTime(commentActivityAt(comment), t)}</span>
                <button
                  type="button"
                  className={`comment-side-check${selected ? ' checked' : ''}`}
                  aria-label={selected ? t('chat.comments.deselect') : t('chat.comments.select')}
                  aria-pressed={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSelect(comment.id);
                  }}
                >
                  {selected ? <Icon name="check" size={11} /> : null}
                </button>
              </div>
              <div className="comment-side-body">{comment.note}</div>
              {projectId && comment.attachments && comment.attachments.length > 0 ? (
                <div className="comment-side-attachments">
                  {comment.attachments.map((attachment) => {
                    return (
                      <a
                        key={attachment.path}
                        className="comment-side-attachment"
                        data-testid="comment-side-attachment"
                        href={projectRawUrl(projectId, attachment.path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={attachment.name}
                        title={attachment.name}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <AuthenticatedProjectFileImage
                          projectId={projectId}
                          path={attachment.path}
                          alt={attachment.name}
                          // Durable memo/board uploads: trustExists + retry for
                          // S3 lag. Ephemeral drawings stay missing-cache-only
                          // so deleted screenshots do not remount-/raw/.
                          trustExists={!isEphemeralDrawingScreenshotPath(attachment.path)}
                          allowBackgroundRetry={!isEphemeralDrawingScreenshotPath(attachment.path)}
                        />
                      </a>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {selectedCount > 0 ? (
        <div className="comment-side-selectbar" data-testid="comment-side-selectbar">
          <span className="comment-side-selectcount">{t('chat.comments.nSelected', { n: selectedCount })}</span>
          <Button variant="ghost" onClick={onClearSelection}>
            {t('chat.comments.clear')}
          </Button>
          <Button
            variant="primary"
            data-testid="comment-side-send-claude"
            disabled={sending || sendDisabled}
            onClick={() => void onSendSelected()}
          >
            {sending
              ? t('chat.comments.sending')
              : queueOnSend
                ? t('chat.annotationQueue')
                : t('chat.comments.sendToChat')}
          </Button>
        </div>
      ) : null}
      {composer ? <div className="comment-side-composer">{composer}</div> : null}
      {renderCreateForm && onCreateComment ? (
        <form
          className="comment-side-new-comment composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submitNewComment();
          }}
        >
          <div className="composer-shell comment-side-new-comment-shell">
            <div className="composer-input-wrap">
              <div className="composer-textarea-layer">
                <textarea
                  value={newCommentDraft}
                  placeholder={t('chat.comments.placeholder')}
                  aria-label={t('chat.comments.placeholder')}
                  onChange={(event) => setNewCommentDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault();
                      void submitNewComment();
                    }
                  }}
                />
              </div>
            </div>
            <div className="composer-row comment-side-new-comment-actions">
              <button
                type="button"
                className="icon-btn"
                title={t('chat.cliSettingsTitle')}
                aria-label={t('chat.cliSettingsAria')}
                disabled
              >
                <span className="composer-tools-at" aria-hidden>
                  @
                </span>
              </button>
              <button
                type="button"
                className="icon-btn"
                title={t('chat.attachTitle')}
                aria-label={t('chat.attachAria')}
                disabled
              >
                <Icon name="attach" size={15} />
              </button>
              <span className="composer-spacer" />
              <button
                type="submit"
                className={`composer-send${sending ? ' is-sending' : ''}`}
                disabled={!canCreateComment}
              >
                <Icon name="send" size={13} />
                <span>{sending ? t('chat.comments.sending') : t('chat.send')}</span>
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </aside>
  );
}

const COMMENT_SIDE_DRAG_MIME = 'application/x-open-design-preview-comment';

type CommentSideDropEdge = 'before' | 'after';

interface CommentSideDragState {
  draggingId: string;
  overId: string | null;
  edge: CommentSideDropEdge | null;
}

function commentSideDropEdgeForEvent(event: ReactDragEvent<HTMLElement>): CommentSideDropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function reorderPreviewCommentIds(
  comments: PreviewComment[],
  draggingId: string,
  targetId: string,
  edge: CommentSideDropEdge,
): string[] {
  const ids = comments.map((comment) => comment.id);
  const from = ids.indexOf(draggingId);
  if (from < 0) return ids;
  const [draggedId] = ids.splice(from, 1);
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex < 0 || !draggedId) return comments.map((comment) => comment.id);
  ids.splice(edge === 'after' ? targetIndex + 1 : targetIndex, 0, draggedId);
  return ids;
}

export function appendSavedPreviewCommentOrder(
  currentOrderIds: string[],
  visibleComments: Array<Pick<PreviewComment, 'id'>>,
  savedId: string,
): string[] {
  if (!savedId) return currentOrderIds;
  const visibleIds = visibleComments.map((comment) => comment.id);
  if (currentOrderIds.includes(savedId) || visibleIds.includes(savedId)) {
    return currentOrderIds;
  }
  const visibleIdSet = new Set(visibleIds);
  const kept = currentOrderIds.filter((id) => visibleIdSet.has(id));
  const missingVisibleIds = visibleIds.filter((id) => !kept.includes(id));
  const base = currentOrderIds.length > 0 ? [...kept, ...missingVisibleIds] : visibleIds;
  const next = [...base, savedId];
  return next.join('\0') === currentOrderIds.join('\0') ? currentOrderIds : next;
}

function CommentSideDock({
  comments,
  projectId,
  selectedIds,
  activeCommentId,
  collapsed,
  onCollapsedChange,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onReorder,
  onReply,
  onSendSelected,
  onCreateComment,
  sending,
  queueOnSend = false,
  sendDisabled = false,
  renderCreateForm = true,
  t,
  composer,
}: {
  comments: PreviewComment[];
  projectId?: string;
  selectedIds: Set<string>;
  activeCommentId: string | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onToggleSelect: (commentId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onReorder?: (orderedIds: string[]) => void;
  onReply: (comment: PreviewComment) => void;
  onSendSelected: () => void | Promise<void>;
  onCreateComment?: (note: string) => boolean | Promise<boolean>;
  sending: boolean;
  queueOnSend?: boolean;
  sendDisabled?: boolean;
  renderCreateForm?: boolean;
  t: TranslateFn;
  composer?: ReactNode;
}) {
  return (
    <div
      className={`comment-side-dock${collapsed ? ' collapsed' : ''}`}
      data-testid="comment-side-dock"
    >
      <CommentSidePanel
        comments={comments}
        projectId={projectId}
        selectedIds={selectedIds}
        activeCommentId={activeCommentId}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        onToggleSelect={onToggleSelect}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        onReorder={onReorder}
        onReply={onReply}
        onSendSelected={onSendSelected}
        onCreateComment={onCreateComment}
        sending={sending}
        queueOnSend={queueOnSend}
        sendDisabled={sendDisabled}
        renderCreateForm={renderCreateForm}
        t={t}
        composer={composer}
      />
    </div>
  );
}

// Maps a CSS computed value (e.g. "rgb(40, 50, 60)" or "16px") to a form
// input value. Browsers return colors as rgb()/rgba(); HTML <input type=color>
// only accepts "#rrggbb". Lengths come back as "12px" or "0px"; we strip
// units for slider binding and re-append on emit.
//
// Note: <input type=color> has no alpha channel, so an rgba() with alpha < 1
// is collapsed to its opaque RGB equivalent here. Most agent-generated HTML
// uses opaque colors, so this is a known cosmetic limitation — a
// semi-transparent source value will display in the panel as fully opaque.
function rgbToHex(value: string | undefined): string {
  if (!value) return '#000000';
  const v = value.trim();
  if (v.startsWith('#') && (v.length === 7 || v.length === 4)) {
    if (v.length === 4) {
      return '#' + [1, 2, 3].map((i) => {
        const c = v.charAt(i);
        return c + c;
      }).join('');
    }
    return v;
  }
  const m = v.match(/rgba?\(\s*([0-9.]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)/i);
  if (!m) return '#000000';
  const toHex = (n: string) => {
    const x = Math.max(0, Math.min(255, Math.round(Number(n))));
    return x.toString(16).padStart(2, '0');
  };
  return '#' + toHex(m[1] ?? '0') + toHex(m[2] ?? '0') + toHex(m[3] ?? '0');
}

// Parse a CSS length to a number. Inspect's current sliders all clamp to a
// non-negative range (padding, font-size, border-radius), so we reject
// negatives at parse time too — otherwise a `-12px` source value would be
// silently floored to 0 by the slider clamp without the regex agreeing.
// If a future control needs negative values (e.g. margin), thread an
// explicit `allowNegative` flag rather than reintroducing `-?` here.
function pxToNumber(value: string | undefined): number {
  if (!value) return 0;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function InspectPanel({
  target,
  onApply,
  onResetElement,
  onSaveToSource,
  onClose,
  saving,
  savedAt,
  error,
}: {
  target: InspectTarget;
  onApply: (prop: string, value: string) => void;
  onResetElement: (elementId: string) => void;
  onSaveToSource: () => void;
  onClose: () => void;
  saving: boolean;
  savedAt: number | null;
  error: string | null;
}) {
  // Local "draft" mirror of the most recent value the user picked, so
  // sliders/colors keep responding even before the iframe echoes back the
  // computed result. Reset whenever the selected element changes.
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft({});
  }, [target.elementId]);

  const value = (prop: string, fallback: string): string =>
    draft[prop] ?? fallback;

  function setVal(prop: string, raw: string) {
    setDraft((d) => ({ ...d, [prop]: raw }));
    onApply(prop, raw);
  }

  // Padding is exposed as a single shared slider that emits the `padding`
  // shorthand; the browser fans the value out to all four sides internally.
  // When per-side control becomes useful, switch to emitting explicit
  // padding-top / padding-right / padding-bottom / padding-left props
  // (the bridge already allow-lists those long-hand names).
  const initialPadding = pxToNumber(target.style.paddingTop);
  const initialFontSize = pxToNumber(target.style.fontSize);
  const initialRadius = pxToNumber(target.style.borderRadius);

  // Color / length controls all read through `draft` first so the input
  // tracks the most recent user pick even before getComputedStyle catches
  // up. Without this the picker would snap back to the initial computed
  // snapshot on every change and feel non-editable.
  const colorHex = value('color', rgbToHex(target.style.color));
  const bgHex = value('background-color', rgbToHex(target.style.backgroundColor));
  const padding = value('padding', String(initialPadding));
  const fontSize = value('font-size', String(initialFontSize));
  const radius = value('border-radius', String(initialRadius));
  const textAlign = value('text-align', target.style.textAlign || 'left');
  const fontWeight = value('font-weight', target.style.fontWeight || '400');
  // Parse once: `pxToNumber(...) || initial...` would treat a legitimate
  // `0px` draft as missing and snap the slider back to the original
  // computed value, making it impossible to remove padding/radius from an
  // element whose initial value is nonzero. `pxToNumber` already returns
  // 0 for unparseable input, so its result is safe to consume directly
  // and zero is preserved.
  const paddingNum = pxToNumber(padding);
  const fontSizeNum = pxToNumber(fontSize);
  const radiusNum = pxToNumber(radius);

  const justSaved = savedAt && Date.now() - savedAt < 4000;
  const embed = isTeamverEmbedMode();

  return (
    <aside className="inspect-panel" data-testid="inspect-panel">
      <header className="inspect-panel-head">
        <div className="inspect-panel-title">
          <strong title={target.label || target.elementId}>{target.label || target.elementId}</strong>
          <code title={target.selector}>{target.elementId}</code>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label={embedUiLabel('Close inspect', '검사 패널 닫기')}>
          <Icon name="close" size={14} />
        </Button>
      </header>

      {target.clickedDescendant ? (
        <div className="inspect-ancestor-notice" data-testid="inspect-ancestor-notice">
          <div className="inspect-ancestor-notice-icon" aria-hidden>
            i
          </div>
          <div className="inspect-ancestor-notice-text">
            {embed ? (
              <>
                <strong>{target.clickedDescendant.label}</strong>
                {target.clickedDescendant.text
                  ? ` ("${target.clickedDescendant.text.slice(0, 40)}${target.clickedDescendant.text.length > 40 ? '...' : ''}")`
                  : ''}
                은(는) 주석이 없어 편집할 수 없습니다. 가장 가까운 주석 요소{' '}
                <strong>{target.label || target.elementId}</strong>을(를) 대신 편집합니다.
              </>
            ) : (
              <>
                You clicked <strong>{target.clickedDescendant.label}</strong>
                {target.clickedDescendant.text
                  ? ` ("${target.clickedDescendant.text.slice(0, 40)}${target.clickedDescendant.text.length > 40 ? '...' : ''}")`
                  : ''}
                , but it has no <code>data-od-id</code> annotation. Editing{' '}
                <strong>{target.label || target.elementId}</strong> instead, the nearest annotated ancestor.
              </>
            )}
          </div>
        </div>
      ) : null}

      <section className="inspect-section">
        <div className="inspect-section-label">{embedUiLabel('Colors', '색상')}</div>
        <div className="inspect-row">
          <label htmlFor="ip-color">{embedUiLabel('Text', '텍스트')}</label>
          <Input
            id="ip-color"
            data-testid="inspect-color"
            type="color"
            value={colorHex}
            onChange={(e) => setVal('color', e.target.value)}
          />
          <Input
            type="text"
            value={colorHex}
            onChange={(e) => setVal('color', e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="inspect-row">
          <label htmlFor="ip-bg">{embedUiLabel('Background', '배경')}</label>
          <Input
            id="ip-bg"
            data-testid="inspect-bg"
            type="color"
            value={bgHex}
            onChange={(e) => setVal('background-color', e.target.value)}
          />
          <Input
            type="text"
            value={bgHex}
            onChange={(e) => setVal('background-color', e.target.value)}
            spellCheck={false}
          />
        </div>
      </section>

      <section className="inspect-section">
        <div className="inspect-section-label">{embedUiLabel('Typography', '타이포그래피')}</div>
        <div className="inspect-row">
          <label htmlFor="ip-fs">{embedUiLabel('Size', '크기')}</label>
          <input
            id="ip-fs"
            data-testid="inspect-font-size"
            type="range"
            min={8}
            max={160}
            step={1}
            value={clamp(fontSizeNum, 8, 160)}
            onChange={(e) => setVal('font-size', `${e.target.value}px`)}
          />
          <span className="inspect-row-value">{Math.round(fontSizeNum)}px</span>
        </div>
        <div className="inspect-row">
          <label htmlFor="ip-fw">{embedUiLabel('Weight', '굵기')}</label>
          <Select
            id="ip-fw"
            value={fontWeight}
            onChange={(e) => setVal('font-weight', e.target.value)}
          >
            {['100', '300', '400', '500', '600', '700', '800', '900'].map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </Select>
        </div>
        <div className="inspect-row">
          <label htmlFor="ip-ta">{embedUiLabel('Align', '정렬')}</label>
          <Select
            id="ip-ta"
            value={textAlign}
            onChange={(e) => setVal('text-align', e.target.value)}
          >
            {['left', 'center', 'right', 'justify'].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>
      </section>

      <section className="inspect-section">
        <div className="inspect-section-label">{embedUiLabel('Spacing & Shape', '간격·모양')}</div>
        <div className="inspect-row">
          <label htmlFor="ip-pad">{embedUiLabel('Padding', '패딩')}</label>
          <input
            id="ip-pad"
            data-testid="inspect-padding"
            type="range"
            min={0}
            max={120}
            step={1}
            value={clamp(paddingNum, 0, 120)}
            onChange={(e) => setVal('padding', `${e.target.value}px`)}
          />
          <span className="inspect-row-value">{Math.round(paddingNum)}px</span>
        </div>
        <div className="inspect-row">
          <label htmlFor="ip-rad">{embedUiLabel('Radius', '모서리')}</label>
          <input
            id="ip-rad"
            data-testid="inspect-radius"
            type="range"
            min={0}
            max={120}
            step={1}
            value={clamp(radiusNum, 0, 120)}
            onChange={(e) => setVal('border-radius', `${e.target.value}px`)}
          />
          <span className="inspect-row-value">{Math.round(radiusNum)}px</span>
        </div>
      </section>

      <footer className="inspect-panel-footer">
        <Button
          variant="ghost"
          onClick={() => {
            setDraft({});
            onResetElement(target.elementId);
          }}
        >
          {embedUiLabel('Reset element', '요소 초기화')}
        </Button>
        <Button
          variant="primary"
          data-testid="inspect-save"
          disabled={saving}
          onClick={onSaveToSource}
        >
          {saving
            ? embedUiLabel('Saving…', '저장 중…')
            : justSaved
              ? embedUiLabel('Saved ✓', '저장됨 ✓')
              : embedUiLabel('Save to source', '소스에 저장')}
        </Button>
      </footer>
      {error ? <div className="inspect-panel-error">{error}</div> : null}
    </aside>
  );
}

// Inspect-mode override entry as held in the host's authoritative map and as
// it travels in od:inspect-overrides messages. The host's persisted map is
// owned and mutated only by host-driven onApply / reset actions plus the
// initial parse of the source's <style data-od-inspect-overrides> block;
// inbound iframe messages are treated as preview acknowledgements, never as
// save input. Artifact code rendered with scripts enabled can call
// window.parent.postMessage with a forged payload — ev.source still points
// at iframe.contentWindow — so any field arriving from the iframe is
// untrusted. Even the structured `overrides` field could be tampered with
// to flip allow-listed properties on elements the user never edited, which
// is why we no longer ingest it on save.
type InspectOverridePayload = {
  selector?: unknown;
  props?: unknown;
};

// Authoritative host-side override map: elementId → { selector, props }.
// Mirrors the in-iframe shape so serializeInspectOverrides can consume it.
export type InspectOverrideEntry = {
  selector: string;
  props: Record<string, string>;
};
export type InspectOverrideMap = Record<string, InspectOverrideEntry>;

// Allow-list of CSS properties the host will persist on Save. Mirrors the
// in-iframe ALLOWED_PROPS list so the host doesn't accept properties that
// the bridge itself would reject.
const HOST_ALLOWED_INSPECT_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'text-align',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-radius',
]);

// Reject values that could break out of `prop: value` and into the
// surrounding <style> block — semicolons, braces, angle brackets, and
// newlines — plus CSS url()/expression()/javascript: (XSS via inspect CSS).
// Mirrors the bridge's UNSAFE_VALUE regex.
const HOST_UNSAFE_INSPECT_VALUE = /[;{}<>\n\r]|url\s*\(|expression\s*\(|image-set\s*\(|element\s*\(|-moz-binding|javascript\s*:|vbscript\s*:|data\s*:/i;

/** Normalize then deny — blocks comment/escape smuggling of unsafe CSS. */
function inspectOverrideValueIsUnsafe(value: string): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  return HOST_UNSAFE_INSPECT_VALUE.test(normalizeCssForSafetyScan(trimmed));
}

// Reject elementIds whose characters could break out of `[attr="..."]`
// inside a <style> block. Forbidden:
//   - `"` and `\` would close the attribute string or smuggle CSS
//     escapes the host didn't pre-process;
//   - `<` and `>` would close the surrounding <style> tag;
//   - C0/C1 controls (newline, etc.) end the CSS rule under string
//     tokenization — kept in as defense-in-depth against parser quirks.
// Everything else — including ASCII whitespace and leading digits — is
// allowed, so deck labels like `01 Cover` survive instead of being
// dropped on the way to the persisted overrides block.
const HOST_UNSAFE_INSPECT_ID = /["\\<>\u0000-\u001f\u007f]/;

// Build the inspect overrides CSS body the host will persist, from the
// structured `overrides` field of an od:inspect-overrides message. The host
// MUST NOT trust the sibling `css` string — it is attacker-controlled when
// artifact JS forges the message. The selector is re-derived from each
// elementId; only allow-listed properties with safe values survive.
//
// Exported so unit tests can exercise the validator with hostile payloads.
export function serializeInspectOverrides(overrides: unknown): string {
  if (!overrides || typeof overrides !== 'object') return '';
  const map = overrides as Record<string, unknown>;
  const lines: string[] = [];
  for (const elementId of Object.keys(map)) {
    if (!elementId || HOST_UNSAFE_INSPECT_ID.test(elementId)) continue;
    const entry = map[elementId] as InspectOverridePayload | null | undefined;
    if (!entry || typeof entry !== 'object') continue;
    const props = entry.props;
    if (!props || typeof props !== 'object') continue;
    // Trust only the *kind* of selector the bridge built, not the value
    // it carried. The bridge runs CSS.escape over the elementId, so a raw
    // equality check against `[data-screen-label="${elementId}"]` would
    // miss legitimate deck labels like `01 Cover` (whitespace, leading
    // digit) and silently downgrade them to `[data-od-id="..."]`. The
    // elementId itself was sanitized above, so embedding it verbatim into
    // the re-derived selector is safe inside an attribute value string.
    const inboundSelector = typeof entry.selector === 'string' ? entry.selector : '';
    const attr = inboundSelector.startsWith('[data-screen-label="')
      ? 'data-screen-label'
      : 'data-od-id';
    const safeSelector = `[${attr}="${elementId}"]`;
    const decls: string[] = [];
    for (const [rawName, rawValue] of Object.entries(props as Record<string, unknown>)) {
      if (typeof rawName !== 'string' || typeof rawValue !== 'string') continue;
      const name = rawName.toLowerCase();
      if (!HOST_ALLOWED_INSPECT_PROPS.has(name)) continue;
      const value = rawValue.trim();
      if (!value || inspectOverrideValueIsUnsafe(value)) continue;
      decls.push(`${name}: ${value} !important`);
    }
    if (!decls.length) continue;
    lines.push(`${safeSelector} { ${decls.join('; ')} }`);
  }
  return lines.join('\n');
}

// Apply a single host-driven prop change to the authoritative override map.
// Returns a new map (or the same reference if no-op so React skips renders).
// Empty value clears the prop; clearing the last prop drops the elementId.
// Mirrors the iframe bridge's applyOverride sanitization so the host map and
// the live preview stay in lock-step under the same rules.
export function updateInspectOverride(
  map: InspectOverrideMap,
  elementId: string,
  selector: string,
  prop: string,
  value: string,
): InspectOverrideMap {
  if (!elementId || HOST_UNSAFE_INSPECT_ID.test(elementId)) return map;
  const propName = String(prop || '').toLowerCase();
  if (!HOST_ALLOWED_INSPECT_PROPS.has(propName)) return map;
  const trimmed = String(value ?? '').trim();
  if (trimmed && inspectOverrideValueIsUnsafe(trimmed)) return map;
  const existing = map[elementId];
  const nextProps: Record<string, string> = { ...(existing?.props ?? {}) };
  if (!trimmed) {
    if (!(propName in nextProps)) return map;
    delete nextProps[propName];
  } else if (nextProps[propName] === trimmed && existing?.selector === selector) {
    return map;
  } else {
    nextProps[propName] = trimmed;
  }
  const nextMap: InspectOverrideMap = { ...map };
  if (Object.keys(nextProps).length === 0) {
    delete nextMap[elementId];
  } else {
    nextMap[elementId] = { selector: selector || existing?.selector || '', props: nextProps };
  }
  return nextMap;
}

// Parse any persisted <style data-od-inspect-overrides> blocks in the
// artifact source into the host's authoritative override map. The host owns
// this map and only mutates it from onApply / reset actions plus this
// initial hydration step — inbound iframe od:inspect-overrides messages are
// not ingested. Without this step, opening a file that already carries an
// override block would leave the host map empty, so a Save-to-source after
// any subsequent edit could splice a CSS body that drops every previously
// saved rule for elements the user did not touch in this session.
//
// Mirrors the iframe bridge's hydrateOverridesFromDom: same allow-list,
// same value sanitizer, same selector kinds, so what the iframe applies and
// what the host persists stay in lock-step. Pure string transform; no DOM.
//
// HTML-aware: enumerates `<style data-od-inspect-overrides>` elements via
// the same walker used by the splicer, so a `<style data-od-inspect-overrides>`
// literal living inside a `<script>`, `<style>` (e.g. CSS comment), `<textarea>`,
// `<title>`, or HTML comment is not mistaken for a real override block. Without
// that exclusion, useEffect would seed the host map from forged/quoted text and
// a later Save-to-source would persist phantom CSS the user never created.
export function parseInspectOverridesFromSource(source: string): InspectOverrideMap {
  const map: InspectOverrideMap = {};
  if (!source) return map;
  // Cheap preflight — most decks never host inspect overrides; skip the walker.
  if (!/\bdata-od-inspect-overrides\b/i.test(source)) return map;
  for (const body of stripInspectOverridesAndIndex(source).bodies) {
    const ruleRe = /(\[data-(?:od-id|screen-label)="([^"]*)"\])\s*\{\s*([^}]*)\}/g;
    let ruleMatch: RegExpExecArray | null;
    while ((ruleMatch = ruleRe.exec(body)) !== null) {
      const selector = ruleMatch[1] ?? '';
      const elementId = ruleMatch[2] ?? '';
      const declBody = ruleMatch[3] ?? '';
      if (!selector || !elementId || HOST_UNSAFE_INSPECT_ID.test(elementId)) continue;
      const props: Record<string, string> = {};
      for (const raw of declBody.split(';')) {
        if (!raw) continue;
        const colon = raw.indexOf(':');
        if (colon <= 0) continue;
        const name = raw.slice(0, colon).trim().toLowerCase();
        if (!HOST_ALLOWED_INSPECT_PROPS.has(name)) continue;
        const value = raw.slice(colon + 1).replace(/!important/gi, '').trim();
        if (!value || inspectOverrideValueIsUnsafe(value)) continue;
        props[name] = value;
      }
      if (Object.keys(props).length) {
        map[elementId] = { selector, props };
      }
    }
  }
  return map;
}

// HTML5 raw-text and escapable-raw-text elements: the parser does not
// interpret markup inside their contents, so a literal `</head>` or
// `<style data-od-inspect-overrides>` written as text inside one of them
// must NOT be treated as a real tag. Without this exclusion, a regex-only
// splicer can match `</head>` inside an inline <script> string literal or
// a CSS comment and inject the override block into the middle of
// JavaScript/CSS instead of the actual document head, corrupting the
// artifact on Save to source.
const RAW_TEXT_INSPECT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

// Decide whether a `<style ...>` opening tag actually carries a real
// `data-od-inspect-overrides` attribute, as opposed to merely mentioning
// the marker text inside another attribute name or value. The naive
// `\bdata-od-inspect-overrides\b` test against the whole tag text is
// over-broad in two cases:
//
//   1. A longer attribute name that has the marker as a prefix, e.g.
//      `<style data-od-inspect-overrides-note="docs">`. The `-` after
//      `overrides` is a non-word character, so `\b` matches and the tag
//      gets mis-stripped on save / mis-parsed on hydration.
//   2. The marker spelled inside an attribute value, e.g.
//      `<style title="data-od-inspect-overrides">`. The whole tag text
//      contains the literal, so the regex matches even though the actual
//      attribute names are `title` only.
//
// Both shapes occur in real artifacts (notes, documentation, fixtures)
// and would either silently drop the user's CSS on save or seed phantom
// overrides into the host map even though the artifact has no real
// override block. So we walk attributes proper, lower-casing each name
// and skipping any quoted value, and report a hit only when one of those
// names is exactly `data-od-inspect-overrides` (boolean attribute or
// assigned value, both legal HTML for our marker).
function styleTagIsInspectOverrideBlock(tagText: string): boolean {
  const start = /^<style/i.exec(tagText);
  if (!start) return false;
  let i = start[0].length;
  const end = tagText.length;
  while (i < end) {
    const ch = tagText.charAt(i);
    if (ch === '>') return false;
    if (ch === '/' || /\s/.test(ch)) {
      i++;
      continue;
    }
    const nameStart = i;
    while (i < end) {
      const c = tagText.charAt(i);
      if (c === '=' || c === '/' || c === '>' || /\s/.test(c)) break;
      i++;
    }
    const name = tagText.slice(nameStart, i).toLowerCase();
    while (i < end && /\s/.test(tagText.charAt(i))) i++;
    if (i < end && tagText.charAt(i) === '=') {
      i++;
      while (i < end && /\s/.test(tagText.charAt(i))) i++;
      const quote = tagText.charAt(i);
      if (quote === '"' || quote === "'") {
        i++;
        const close = tagText.indexOf(quote, i);
        i = close < 0 ? end : close + 1;
      } else {
        while (i < end) {
          const c = tagText.charAt(i);
          if (c === '>' || /\s/.test(c)) break;
          i++;
        }
      }
    }
    if (name === 'data-od-inspect-overrides') return true;
  }
  return false;
}

// Find the start (`<` position) of the matching close tag for a raw-text
// element, scanning case-insensitively. The close tag must be followed by
// a tag-name boundary (whitespace, `/`, or `>`) so a longer name like
// `</scripted>` doesn't accidentally close a `<script>`.
function findInspectRawTextEnd(source: string, start: number, name: string): number {
  const lower = source.toLowerCase();
  const needle = '</' + name.toLowerCase();
  let p = start;
  while (p < source.length) {
    const idx = lower.indexOf(needle, p);
    if (idx < 0) return -1;
    const after = source.charAt(idx + needle.length);
    if (after === '' || after === '>' || after === '/' || /\s/.test(after)) return idx;
    p = idx + needle.length;
  }
  return -1;
}

type InspectSpliceScan = {
  out: string;
  // Position in `out` immediately after the first top-level `<head ...>`
  // open tag, or -1 if no head was found outside raw-text content.
  headOpenEnd: number;
  // Position in `out` at the first top-level `</head>` close tag, or -1.
  headCloseStart: number;
  // Raw inner-text of every real `<style data-od-inspect-overrides>` element
  // discovered during the walk, in source order. Excludes occurrences inside
  // raw-text element contents and HTML comments. Hydration parses these
  // bodies for the host map; the splicer ignores them.
  bodies: string[];
};

// Walk `source` and produce a copy with every existing
// `<style data-od-inspect-overrides>...</style>` block removed, while
// remembering where the real (non-raw-text) `<head>` boundaries land in
// the output. The walker honours HTML comment, doctype/processing
// instruction, and raw-text element boundaries so the splicer can ignore
// tag-shaped literals inside scripts/styles/textareas/titles. Pure string
// transform — no DOM dependency, safe to run during SSR/tests.
function stripInspectOverridesAndIndex(source: string): InspectSpliceScan {
  const parts: string[] = [];
  const bodies: string[] = [];
  let outLen = 0;
  let headOpenEnd = -1;
  let headCloseStart = -1;
  let i = 0;
  function emit(text: string): void {
    if (!text) return;
    parts.push(text);
    outLen += text.length;
  }
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) {
      emit(source.slice(i));
      break;
    }
    if (lt > i) emit(source.slice(i, lt));
    i = lt;
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      const stop = end < 0 ? source.length : end + 3;
      emit(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (source.startsWith('<!', i) || source.startsWith('<?', i)) {
      const end = source.indexOf('>', i + 2);
      const stop = end < 0 ? source.length : end + 1;
      emit(source.slice(i, stop));
      i = stop;
      continue;
    }
    const tagEnd = source.indexOf('>', i + 1);
    if (tagEnd < 0) {
      emit(source.slice(i));
      break;
    }
    const tagText = source.slice(i, tagEnd + 1);
    const closeMatch = /^<\/([a-zA-Z][a-zA-Z0-9-]*)/.exec(tagText);
    if (closeMatch) {
      const name = closeMatch[1]!.toLowerCase();
      if (name === 'head' && headCloseStart < 0) headCloseStart = outLen;
      emit(tagText);
      i = tagEnd + 1;
      continue;
    }
    const openMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(tagText);
    if (!openMatch) {
      emit(tagText);
      i = tagEnd + 1;
      continue;
    }
    const name = openMatch[1]!.toLowerCase();
    const isSelfClose = /\/\s*>$/.test(tagText);
    if (name === 'head' && headOpenEnd < 0) headOpenEnd = outLen + tagText.length;
    if (name === 'style' && styleTagIsInspectOverrideBlock(tagText)) {
      // Strip the entire override block. A self-closing <style /> is a
      // degenerate authoring case; treat it as nothing to skip past.
      if (isSelfClose) {
        i = tagEnd + 1;
        continue;
      }
      const closeStart = findInspectRawTextEnd(source, tagEnd + 1, 'style');
      if (closeStart < 0) {
        // Unterminated override block — drop the rest of the document
        // rather than silently reflowing later content into a dangling
        // <style>. Matches the "stop" behaviour of the previous regex.
        i = source.length;
        continue;
      }
      bodies.push(source.slice(tagEnd + 1, closeStart));
      const closeEnd = source.indexOf('>', closeStart);
      let stop = closeEnd < 0 ? source.length : closeEnd + 1;
      while (stop < source.length && /\s/.test(source.charAt(stop))) stop++;
      i = stop;
      continue;
    }
    if (!isSelfClose && RAW_TEXT_INSPECT_ELEMENTS.has(name)) {
      const closeStart = findInspectRawTextEnd(source, tagEnd + 1, name);
      if (closeStart < 0) {
        emit(source.slice(i));
        i = source.length;
        continue;
      }
      const closeEnd = source.indexOf('>', closeStart);
      const stop = closeEnd < 0 ? source.length : closeEnd + 1;
      // Copy the entire raw-text element (open tag, body, close tag) to
      // the output verbatim so its contents pass through unmodified.
      emit(source.slice(i, stop));
      i = stop;
      continue;
    }
    emit(tagText);
    i = tagEnd + 1;
  }
  return { out: parts.join(''), headOpenEnd, headCloseStart, bodies };
}

// Splice (or remove) the inspect overrides <style> block in an HTML
// document. Idempotent: calling with the same css produces the same
// document. Empty css strips the block entirely.
//
// HTML-aware: the underlying scan ignores comments and raw-text element
// contents (script / style / textarea / title), so a literal `</head>` or
// `<style data-od-inspect-overrides>` written inside an inline script or
// style block does not trick the splicer into stripping user code or
// inserting the override block in the middle of JavaScript/CSS.
//
// Exported (via the module) so a unit test can drive it without a live
// browser. Pure string transform — no DOM, no parser dependency.
export function applyInspectOverridesToSource(source: string, css: string): string {
  const trimmed = css.trim();
  const { out, headOpenEnd, headCloseStart } = stripInspectOverridesAndIndex(source);
  if (!trimmed) return out;
  const block = `<style data-od-inspect-overrides>\n${trimmed}\n</style>\n`;
  if (headCloseStart >= 0) {
    return out.slice(0, headCloseStart) + block + out.slice(headCloseStart);
  }
  if (headOpenEnd >= 0) {
    return out.slice(0, headOpenEnd) + block + out.slice(headOpenEnd);
  }
  return block + out;
}

function CommentPreviewOverlays({
  comments,
  liveTargets,
  hoveredTarget,
  hoveredPodMemberId,
  activeTarget,
  activeExistingCommentId = null,
  boardTool,
  showActivePin = false,
  scale,
  offsetX,
  offsetY,
  strokePoints,
  activeSlideIndex = null,
  onOpenComment,
}: {
  comments: PreviewComment[];
  liveTargets: Map<string, PreviewCommentSnapshot>;
  hoveredTarget: PreviewCommentSnapshot | null;
  hoveredPodMemberId: string | null;
  activeTarget: PreviewCommentSnapshot | null;
  activeExistingCommentId?: string | null;
  boardTool: BoardTool;
  showActivePin?: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  strokePoints: StrokePoint[];
  activeSlideIndex?: number | null;
  onOpenComment: (comment: PreviewComment, snapshot: PreviewCommentSnapshot) => void;
}) {
  const overlayOffset = useMemo(() => ({ x: offsetX, y: offsetY }), [offsetX, offsetY]);
  const visibleComments = useMemo(
    () =>
      comments
        .map((comment, globalIndex) => ({
          comment,
          markerNumber: globalIndex + 1,
          snapshot: liveSnapshotForComment(comment, liveTargets),
        }))
        .filter((item): item is { comment: PreviewComment; markerNumber: number; snapshot: PreviewCommentSnapshot } =>
          Boolean(item.snapshot),
        )
        .filter(({ comment }) => commentVisibleOnDeckSlide(comment, activeSlideIndex)),
    [comments, liveTargets, activeSlideIndex],
  );
  // `onOpenComment` is an inline arrow from the parent (new identity every
  // render), so read it through a ref to keep the saved-marker memo below from
  // busting. The closure only calls stable state setters, so a current ref read
  // is always correct.
  const onOpenCommentRef = useRef(onOpenComment);
  onOpenCommentRef.current = onOpenComment;
  // Memoize the saved-marker subtree. While the user draws a pod lasso,
  // `strokePoints` updates on every pointermove and re-renders this overlay;
  // without this, every saved marker (bounds + JSX) was rebuilt each frame.
  // Keyed only on the marker inputs (NOT strokePoints), so a steady set of
  // comments reuses the whole subtree and React skips reconciling it.
  const savedMarkers = useMemo(
    () =>
      visibleComments.map(({ comment, markerNumber, snapshot }) => {
        const bounds = overlayBoundsFromSnapshot(snapshot, scale, overlayOffset);
        const label = commentTargetDisplayName(comment);
        return (
          <div
            key={comment.id}
            className="comment-saved-marker"
            style={{
              left: bounds.left,
              top: bounds.top,
              width: bounds.width,
              height: bounds.height,
            }}
            data-testid={`comment-saved-marker-${comment.elementId}`}
            onClick={() => onOpenCommentRef.current(comment, snapshot)}
          >
            <div className="comment-saved-outline" />
            <button
              type="button"
              className="comment-saved-pin"
              onClick={(event) => {
                event.stopPropagation();
                onOpenCommentRef.current(comment, snapshot);
              }}
              title={`${markerNumber}. ${label}: ${comment.note}`}
              aria-label={embedUiLabel(`Open comment for ${label}`, `${label} 주석 열기`)}
            >
              {markerNumber}
            </button>
          </div>
        );
      }),
    [visibleComments, scale, overlayOffset],
  );
  const activeSavedIndex = activeExistingCommentId
    ? comments.findIndex((comment) => comment.id === activeExistingCommentId)
    : -1;
  const activePinNumber = activeSavedIndex >= 0
    ? activeSavedIndex + 1
    : comments.length + 1;
  const targetOverlay = activeTarget ?? hoveredTarget;
  return (
    <div className="comment-overlay-layer" aria-hidden={false}>
      {savedMarkers}
      {targetOverlay ? (
        <CommentTargetOverlay
          snapshot={targetOverlay}
          scale={scale}
          offset={overlayOffset}
          selected={Boolean(activeTarget)}
          hoveredMemberId={hoveredPodMemberId}
        />
      ) : null}
      {showActivePin && activeTarget ? (
        <div
          className="comment-active-pin"
          style={activeCommentPinStyle(activeTarget, scale, overlayOffset)}
          data-testid="comment-active-pin"
          aria-hidden="true"
        >
          {activePinNumber}
        </div>
      ) : null}
      {boardTool === 'pod' && strokePoints.length > 1 ? (
        <svg className="board-pod-stroke">
          <polyline
            points={strokePoints.map((point) => `${offsetX + point.x * scale},${offsetY + point.y * scale}`).join(' ')}
          />
        </svg>
      ) : null}
    </div>
  );
}

function activeCommentPinStyle(
  target: PreviewCommentSnapshot,
  scale: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): CSSProperties {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const anchor = target.hoverPoint ?? {
    x: target.position.x,
    y: target.position.y,
  };
  return {
    left: Math.round(offset.x + anchor.x * safeScale),
    top: Math.round(offset.y + anchor.y * safeScale),
  };
}

export function CommentTargetOverlay({
  snapshot,
  scale,
  offset,
  selected,
  hoveredMemberId,
}: {
  snapshot: PreviewCommentSnapshot;
  scale: number;
  offset?: { x: number; y: number };
  selected: boolean;
  hoveredMemberId?: string | null;
}) {
  const overlayOffset = offset ?? { x: 0, y: 0 };
  const displayMembers = podDisplayMembers(snapshot);
  if (displayMembers.length > 0) {
    const overlayWeights = podOverlayWeights(displayMembers);
    return (
      <>
        {displayMembers.map((member, index) => {
          const bounds = overlayBoundsFromSnapshot(member, scale, overlayOffset);
          const width = Math.round(member.position.width);
          const height = Math.round(member.position.height);
          const overlayWeight = overlayWeights[index] ?? {
            backgroundOpacity: 0.24,
            outlineOpacity: 0.72,
            ringOpacity: 0.18,
          };
          const overlayStyle: CSSProperties & Record<string, string | number> = {
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
            '--comment-overlay-bg': `rgba(22, 119, 255, ${overlayWeight.backgroundOpacity})`,
            '--comment-overlay-ring': `rgba(22, 119, 255, ${overlayWeight.ringOpacity})`,
            '--comment-overlay-border': `rgba(22, 119, 255, ${overlayWeight.outlineOpacity})`,
          };
          const isHoverFocused = hoveredMemberId === member.elementId;
          return (
            <div
              key={`${member.elementId}-${index}`}
              className={`comment-target-overlay comment-target-overlay--member${selected ? ' selected' : ''}${isHoverFocused ? ' is-hover-focused' : ''}`}
              style={overlayStyle}
              data-testid="comment-target-overlay"
            >
              <span className="comment-target-overlay-label">{snapshot.elementId}</span>
            </div>
          );
        })}
      </>
    );
  }
  // Non-member fallback: single-element snapshots have no per-member chips,
  // so the hover-focus channel never reaches this branch — no is-hover-focused
  // class needed here.
  const bounds = overlayBoundsFromSnapshot(snapshot, scale, overlayOffset);
  return (
    <div
      className={`comment-target-overlay${selected ? ' selected' : ''}`}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
      data-testid="comment-target-overlay"
    >
      <span className="comment-target-overlay-label">{snapshot.elementId}</span>
    </div>
  );
}

function podDisplayMembers(snapshot: PreviewCommentSnapshot): PreviewCommentSnapshot[] {
  if (snapshot.selectionKind !== 'pod' || !Array.isArray(snapshot.podMembers)) return [];
  const memberSnapshots = snapshot.podMembers.map((member) => ({
    filePath: snapshot.filePath,
    elementId: member.elementId,
    selector: member.selector,
    label: member.label,
    text: member.text,
    position: member.position,
    htmlHint: member.htmlHint,
    selectionKind: 'element' as const,
  }));
  const refined = pruneContainerSelections(memberSnapshots);
  return refined.length > 0 ? refined : memberSnapshots;
}

function podOverlayWeights(
  members: PreviewCommentSnapshot[],
): Array<{ backgroundOpacity: number; outlineOpacity: number; ringOpacity: number }> {
  const areas = members.map((member) =>
    Math.max(1, member.position.width * member.position.height),
  );
  const maxArea = Math.max(...areas);
  const minArea = Math.min(...areas);
  return areas.map((area) => {
    const normalized =
      maxArea === minArea ? 1 : 1 - (area - minArea) / (maxArea - minArea);
    const emphasis = Math.pow(normalized, 0.9);
    return {
      backgroundOpacity: roundOverlayOpacity(0.1 + emphasis * 0.6),
      outlineOpacity: roundOverlayOpacity(0.34 + emphasis * 0.36),
      ringOpacity: roundOverlayOpacity(0.08 + emphasis * 0.18),
    };
  });
}

function roundOverlayOpacity(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildPodSnapshot(input: {
  filePath: string;
  strokePoints: StrokePoint[];
  liveTargets: Map<string, PreviewCommentSnapshot>;
}): PreviewCommentSnapshot | null {
  if (input.strokePoints.length < 2) return null;
  const closedLoop = isClosedLoop(input.strokePoints);
  const intersected = Array.from(input.liveTargets.values()).filter((snapshot) =>
    selectionHitsSnapshot({
      points: input.strokePoints,
      snapshot,
      closedLoop,
    }),
  );
  const refined = pruneContainerSelections(intersected);
  const selected = refined.length > 0 ? refined : intersected;
  if (selected.length === 0) return null;
  const bounds = selected.reduce(
    (acc, snapshot) => {
      const rect = snapshot.position;
      return {
        left: Math.min(acc.left, rect.x),
        top: Math.min(acc.top, rect.y),
        right: Math.max(acc.right, rect.x + rect.width),
        bottom: Math.max(acc.bottom, rect.y + rect.height),
      };
    },
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
  const podMembers: PreviewCommentMember[] = selected.map((snapshot) => ({
    elementId: snapshot.elementId,
    selector: snapshot.selector,
    label: snapshot.label,
    text: snapshot.text,
    position: snapshot.position,
    htmlHint: snapshot.htmlHint,
    style: snapshot.style,
  }));
  const summary = selected
    .slice(0, 3)
    .map((snapshot) => summarizeSnapshot(snapshot))
    .join(' · ');
  const htmlHint = selected
    .slice(0, 4)
    .map((snapshot) => snapshot.htmlHint)
    .filter(Boolean)
    .join(' ');
  const combinedSelector = selected
    .slice(0, 8)
    .map((snapshot) => snapshot.selector)
    .filter(Boolean)
    .join(', ');
  return {
    filePath: input.filePath,
    elementId: `pod-${Date.now()}`,
    selector: combinedSelector || 'body *',
    label: summary || `Pod of ${intersected.length} items`,
    text: intersected
      .slice(0, 4)
      .map((snapshot) => snapshot.text)
      .filter(Boolean)
      .join(' · '),
    position: {
      x: Math.round(bounds.left),
      y: Math.round(bounds.top),
      width: Math.max(1, Math.round(bounds.right - bounds.left)),
      height: Math.max(1, Math.round(bounds.bottom - bounds.top)),
    },
    htmlHint: htmlHint.slice(0, 180),
    selectionKind: 'pod',
    memberCount: selected.length,
    podMembers,
  };
}

function pruneContainerSelections(
  snapshots: PreviewCommentSnapshot[],
): PreviewCommentSnapshot[] {
  if (snapshots.length < 2) return snapshots;
  return snapshots.filter((candidate) => {
    const candidateArea = Math.max(1, candidate.position.width * candidate.position.height);
    const contained = snapshots.filter(
      (other) =>
        other.elementId !== candidate.elementId &&
        rectContains(candidate.position, other.position),
    );
    if (contained.length === 0) return true;
    const union = contained.reduce(
      (acc, other) => ({
        left: Math.min(acc.left, other.position.x),
        top: Math.min(acc.top, other.position.y),
        right: Math.max(acc.right, other.position.x + other.position.width),
        bottom: Math.max(acc.bottom, other.position.y + other.position.height),
      }),
      {
        left: Number.POSITIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY,
        bottom: Number.NEGATIVE_INFINITY,
      },
    );
    const unionArea = Math.max(1, (union.right - union.left) * (union.bottom - union.top));
    return !(contained.length >= 2 && candidateArea > unionArea * 2.4);
  });
}

function summarizeSnapshot(snapshot: PreviewCommentSnapshot): string {
  const text = snapshot.text.trim();
  if (text) {
    const trimmed = text.length > 28 ? `${text.slice(0, 25)}...` : text;
    return `${snapshot.label || snapshot.elementId} · ${trimmed}`;
  }
  return snapshot.label || snapshot.elementId;
}

function selectionHitsSnapshot(input: {
  points: StrokePoint[];
  snapshot: PreviewCommentSnapshot;
  closedLoop: boolean;
}): boolean {
  const bounds = {
    left: input.snapshot.position.x,
    top: input.snapshot.position.y,
    width: input.snapshot.position.width,
    height: input.snapshot.position.height,
  };
  if (pathIntersectsRect(input.points, bounds)) return true;
  if (!input.closedLoop) return false;
  const center = {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
  if (pointInPolygon(center, input.points)) return true;
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top + bounds.height },
    { x: bounds.left, y: bounds.top + bounds.height },
  ];
  return corners.some((corner) => pointInPolygon(corner, input.points));
}

function isClosedLoop(points: StrokePoint[]): boolean {
  if (points.length < 4) return false;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return Math.hypot(first.x - last.x, first.y - last.y) <= 28;
}

function rectContains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

function pathIntersectsRect(
  points: StrokePoint[],
  rect: { left: number; top: number; width: number; height: number },
): boolean {
  if (points.length === 0) return false;
  const x1 = rect.left;
  const y1 = rect.top;
  const x2 = rect.left + rect.width;
  const y2 = rect.top + rect.height;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) {
      return true;
    }
    const next = points[index + 1];
    if (!next) continue;
    if (
      lineIntersectsLine(point, next, { x: x1, y: y1 }, { x: x2, y: y1 }) ||
      lineIntersectsLine(point, next, { x: x2, y: y1 }, { x: x2, y: y2 }) ||
      lineIntersectsLine(point, next, { x: x2, y: y2 }, { x: x1, y: y2 }) ||
      lineIntersectsLine(point, next, { x: x1, y: y2 }, { x: x1, y: y1 })
    ) {
      return true;
    }
  }
  return false;
}

function pointInPolygon(point: StrokePoint, polygon: StrokePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) / ((pj.y - pi.y) || Number.EPSILON) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function lineIntersectsLine(a1: StrokePoint, a2: StrokePoint, b1: StrokePoint, b2: StrokePoint): boolean {
  const denominator =
    (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (denominator === 0) return false;
  const ua =
    ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) / denominator;
  const ub =
    ((a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x)) / denominator;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

function finiteBridgeInteger(value: unknown): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return clampBridgeCoordinate(value);
}

function normalizeAnnotationStyle(input: unknown): PreviewCommentSnapshot['style'] {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Record<string, unknown>;
  const style: NonNullable<PreviewCommentSnapshot['style']> = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

const ANNOTATION_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'fontFamily',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
] as const;

function clampBridgeCoordinate(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-MAX_BRIDGE_COORDINATE, Math.min(MAX_BRIDGE_COORDINATE, Math.round(numeric)));
}

// Shown instead of the React runtime when a .jsx/.tsx is a module loaded by a
// sibling HTML entry (issue #2744): such a file has no standalone component to
// render, so point the user at the page(s) that do. Clicking an entry opens
// (or focuses) that page and closes the now-useless module tab.
function ReactModulePointer({
  entries,
  onOpenEntry,
}: {
  entries: string[];
  onOpenEntry?: (name: string) => void;
}) {
  const t = useTeamverT();
  return (
    <div className="viewer-module-pointer" role="note">
      <Icon name="info" size={20} />
      <h2 className="viewer-module-pointer__title">{t('fileViewer.jsxModuleTitle')}</h2>
      <p className="viewer-module-pointer__body">{t('fileViewer.jsxModuleBody')}</p>
      <p className="viewer-module-pointer__cta">{t('fileViewer.jsxModuleCta')}</p>
      <ul className="viewer-module-pointer__entries">
        {entries.map((name) => (
          <li key={name}>
            <button
              type="button"
              className="viewer-module-pointer__link"
              onClick={() => onOpenEntry?.(name)}
              disabled={!onOpenEntry}
            >
              <Icon name="external-link" size={14} />
              <span>{name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Disk preview debounce must stay ≤ ProjectView file-changed coalesce
 * `maxWait` (250ms). A longer debounce lets write storms cancel every
 * scheduled fetch before it runs → sticky "loading…".
 */
const HTML_PREVIEW_DISK_FETCH_DEBOUNCE_MS = 200;
/** Wall-clock deadline so hung GETs cannot leave "loading…" forever. */
const HTML_PREVIEW_SOURCE_WALL_MS = 30_000;
const HTML_PREVIEW_SOURCE_FIRST_RETRY_MS = 400;
/** Soft-retry backoff ceiling (exponential from FIRST, ×2 each attempt). */
const HTML_PREVIEW_SOURCE_RETRY_MAX_MS = 5_000;
/** Cap soft retries even when the wall has not elapsed (~0.4+0.8+1.6+3.2+5+5s). */
const HTML_PREVIEW_SOURCE_MAX_SOFT_RETRIES = 6;

const DECK_SLIDE_MARKUP_RE =
  /<(?:section|div)\b[^>]*\b(?:class\s*=\s*["'][^"']*\bslide\b|data-slide)/i;

function acceptPreviewHtmlCandidate(
  candidate: string | null,
  lastStableRef: { current: string | null },
): string | null {
  if (candidate == null) return null;
  const repaired = repairArtifactDocumentHeadIfNeeded(candidate);
  if (isArtifactHtmlStableForPreview(repaired)) {
    // Repair can theoretically close/strip into a slide-less shell that still
    // tag-balances. Never pin that as last-stable when the candidate itself
    // still carried deck slides — keep the previous good frame instead.
    if (DECK_SLIDE_MARKUP_RE.test(candidate) && !hasSalvageableDeckSlideContent(repaired)) {
      return lastStableRef.current;
    }
    lastStableRef.current = repaired;
    return repaired;
  }
  // Prefer the last stable frame over painting leak debris / unbalanced tags.
  return lastStableRef.current;
}

function ReactComponentViewer({
  projectId,
  file,
  onOpenFileReplacing,
}: {
  projectId: string;
  file: ProjectFile;
  onOpenFileReplacing?: (openName: string, closeName: string) => void;
}) {
  const t = useTeamverT();
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [source, setSource] = useState<string | null>(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);
  // HTML entries that load this file as a Babel module. `null` = still
  // checking; `[]` = standalone artifact; non-empty = a module of a
  // multi-file React prototype, which has no standalone preview. Issue #2744.
  const [moduleEntries, setModuleEntries] = useState<string[] | null>(null);
  const isModule = (moduleEntries?.length ?? 0) > 0;

  useEffect(() => {
    setSource(null);
    let cancelled = false;
    const wallTimer = window.setTimeout(() => {
      if (!cancelled) setSource('');
    }, HTML_PREVIEW_SOURCE_WALL_MS);
    void fetchProjectFileText(projectId, file.name).then((text) => {
      if (cancelled) return;
      window.clearTimeout(wallTimer);
      setSource(text ?? '');
    });
    return () => {
      cancelled = true;
      window.clearTimeout(wallTimer);
    };
  }, [projectId, file.name, file.mtime, reloadKey]);

  // Detect whether this .jsx/.tsx is a module loaded by a sibling HTML entry.
  // Runs before any srcdoc is built so a module never flashes the raw
  // "No React component export found" error from the React runtime.
  useEffect(() => {
    setModuleEntries(null);
    let cancelled = false;
    void (async () => {
      try {
        const files = await fetchProjectFiles(projectId);
        const htmlNames = files
          .filter((entry) => /\.html?$/i.test(entry.name))
          .map((entry) => entry.name);
        const htmlSources = new Map<string, string>();
        await Promise.all(
          htmlNames.map(async (name) => {
            const text = await fetchProjectFileText(projectId, name).catch(() => null);
            if (text != null) htmlSources.set(name, text);
          }),
        );
        if (cancelled) return;
        setModuleEntries(findHtmlEntriesReferencing(file.name, htmlSources));
      } catch {
        if (!cancelled) setModuleEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, reloadKey]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!shareRef.current) return;
      if (!shareRef.current.contains(e.target as Node)) setShareMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareMenuOpen]);

  const exportTitle = file.name.replace(/\.(jsx|tsx)$/i, '') || file.name;
  const sourceExtension = file.name.toLowerCase().endsWith('.tsx') ? '.tsx' : '.jsx';

  useEffect(() => {
    if (source === null || moduleEntries === null || isModule) {
      // No source yet, still checking module status, or this file is a module
      // with no standalone preview — never build the React runtime srcdoc.
      setSrcDoc('');
      return;
    }

    let cancelled = false;
    const buildSrcDoc = () => {
      const nextSrcDoc = buildReactComponentSrcdoc(source, { title: exportTitle });
      if (!cancelled) setSrcDoc(nextSrcDoc);
    };

    if (source.length > 100_000) {
      setSrcDoc('');
      const timeout = window.setTimeout(buildSrcDoc, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }

    buildSrcDoc();
    return () => {
      cancelled = true;
    };
  }, [source, exportTitle, moduleEntries, isModule]);

  return (
    <div className="viewer react-component-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <button
            type="button"
            className="icon-only od-tooltip"
            onClick={() => setReloadKey((n) => n + 1)}
            title={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
            data-tooltip={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
            data-tooltip-placement="bottom"
            aria-label={`${t('fileViewer.reloadAria')} ${t('fileViewer.preview')}`}
          >
            <Icon name="reload" size={14} />
          </button>
          <span className="viewer-meta">
            {t('fileViewer.reactMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            <button
              type="button"
              className={`viewer-tab ${mode === 'preview' ? 'active' : ''}`}
              onClick={() => setMode('preview')}
            >
              {t('fileViewer.preview')}
            </button>
            <button
              type="button"
              className={`viewer-tab ${mode === 'source' ? 'active' : ''}`}
              onClick={() => setMode('source')}
            >
              {t('fileViewer.source')}
            </button>
          </div>
          {source !== null ? (
            <>
              <span className="viewer-divider" aria-hidden />
              <div className="share-menu" ref={shareRef}>
                <button
                  type="button"
                  className="viewer-action primary viewer-action-export od-tooltip"
                  aria-haspopup="menu"
                  aria-expanded={shareMenuOpen}
                  title={t('fileViewer.shareLabel')}
                  data-tooltip={t('fileViewer.shareLabel')}
                  data-tooltip-placement="bottom"
                  onClick={() => setShareMenuOpen((v) => !v)}
                >
                  <span className="export-action-spacer" aria-hidden />
                  <span>{t('fileViewer.shareLabel')}</span>
                  <RemixIcon name="arrow-down-s-line" size={14} />
                </button>
                {shareMenuOpen ? (
                  <div className="share-menu-popover" role="menu">
                    <div className="share-menu-section-label" role="presentation">
                      {t('common.share')}
                    </div>
                    <button
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setShareMenuOpen(false);
                        exportAsJsx(source, exportTitle, sourceExtension);
                      }}
                    >
                      <span className="share-menu-icon"><RemixIcon name="file-code-line" size={15} /></span>
                      <span>{t('fileViewer.exportJsx')}</span>
                    </button>
                    <button
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setShareMenuOpen(false);
                        exportReactComponentAsHtml(source, exportTitle);
                      }}
                    >
                      <span className="share-menu-icon"><RemixIcon name="file-line" size={15} /></span>
                      <span>{t('fileViewer.exportReactHtml')}</span>
                    </button>
                    <div className="share-menu-divider" />
                    <button
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setShareMenuOpen(false);
                        exportReactComponentAsZip(source, exportTitle, sourceExtension);
                      }}
                    >
                      <span className="share-menu-icon"><RemixIcon name="file-zip-line" size={15} /></span>
                      <span>{t('fileViewer.exportZip')}</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="viewer-body">
        {isModule && mode === 'preview' ? (
          // Module of a multi-file prototype: no standalone preview, so the
          // Preview tab shows a pointer to the HTML entry. The Source tab still
          // renders the raw code below. Issue #2744.
          <ReactModulePointer
            entries={moduleEntries ?? []}
            onOpenEntry={(htmlName) => onOpenFileReplacing?.(htmlName, file.name)}
          />
        ) : source === null || (mode === 'preview' && !srcDoc) ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : mode === 'preview' ? (
          <PreviewDrawOverlay>
            <iframe
              data-testid="react-component-preview-frame"
              title={file.name}
              sandbox="allow-scripts allow-downloads"
              srcDoc={srcDoc}
              style={{ width: '100%', height: '100%', border: 0 }}
            />
          </PreviewDrawOverlay>
        ) : (
          <CodeWithLines text={source} />
        )}
      </div>
    </div>
  );
}

function BinaryViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useTeamverT();
  return (
    <div className="viewer binary-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.binaryMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body">
        <div className="viewer-empty">
          {t('fileViewer.binaryNote', { size: file.size })}
        </div>
      </div>
    </div>
  );
}

function DocumentPreviewViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useTeamverT();
  const [preview, setPreview] = useState<ProjectFilePreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    const wallTimer = window.setTimeout(() => {
      if (cancelled) return;
      setPreview(null);
      setLoading(false);
    }, HTML_PREVIEW_SOURCE_WALL_MS);
    void fetchProjectFilePreview(projectId, file.name).then((next) => {
      if (cancelled) return;
      window.clearTimeout(wallTimer);
      setPreview(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(wallTimer);
    };
  }, [projectId, file.name, file.mtime]);

  return (
    <div className="viewer document-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {documentMetaLabel(file, t)} · {humanSize(file.size)}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body">
        {loading ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : preview ? (
          <div className="document-preview">
            <h2>{preview.title}</h2>
            {preview.sections.map((section, idx) => (
              <section key={`${section.title}-${idx}`}>
                <h3>{section.title}</h3>
                {section.lines.map((line, lineIdx) => (
                  <p key={`${lineIdx}-${line}`}>{line}</p>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <div className="viewer-empty">{t('fileViewer.previewUnavailable')}</div>
        )}
      </div>
    </div>
  );
}

function HtmlViewer({
  projectId,
  projectKind,
  projectDisplayName,
  file,
  liveHtml,
  filesRefreshKey = 0,
  projectFilePaths,
  preferredAttachmentPaths,
  isDeck,
  onExportAsPptx,
  streaming,
  commentQueueOnSend = false,
  commentSendDisabled = false,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendBoardCommentAttachments,
  onFileSaved,
  commentPortalId,
  onCommentModeChange,
  shareRequest,
  downloadRequest,
  slideNavRequest,
}: {
  projectId: string;
  projectKind: TrackingProjectKind;
  projectDisplayName?: string;
  file: ProjectFile;
  liveHtml?: string;
  filesRefreshKey?: number;
  projectFilePaths?: readonly string[];
  preferredAttachmentPaths?: readonly string[];
  isDeck: boolean;
  onExportAsPptx?: ((fileName: string) => void) | undefined;
  streaming: boolean;
  commentQueueOnSend?: boolean;
  commentSendDisabled?: boolean;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean, images?: File[]) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[], images?: File[]) => Promise<boolean | void> | boolean | void;
  onFileSaved?: () => Promise<void> | void;
  commentPortalId?: string;
  onCommentModeChange?: (active: boolean) => void;
  shareRequest?: { nonce: number } | null;
  downloadRequest?: { nonce: number } | null;
  slideNavRequest?: { slideIndex: number; nonce: number } | null;
}) {
  const { locale } = useI18n();
  const t = useTeamverT();
  const analytics = useAnalytics();
  // loop 171 — Embed (Teamver) hides every external share/publish surface
  // (Vercel/Cloudflare deploy, share-link copy/open, Project social share).
  // Local exports (PDF / PPTX / Image / HTML / ZIP / Markdown / Save as
  // template) and the Teamver Drive Publish menu item stay visible because
  // they either land on the user's machine or stay inside the Teamver
  // workspace tenant.
  const { hideExternalShareSurfaces, hideUsefulTips, slideOnlyMvp, hideDrawAnnotation, hideManualEditBoxDrag, hideFileRevisionChrome } = useTeamverBranding();
  // Kept in sync with live `source` / last-stable preview so fireShareExport
  // (declared above those hooks) can gate Teamver rendered downloads without
  // reading later const bindings.
  const exportHtmlSnapshotGateRef = useRef<string | null>(null);
  // Shared helper for the share menu: emit studio_click share_option on
  // entry and artifact_export_result on resolution. Sync exports report
  // success immediately after the call returns; async exports get .then
  // / .catch. The same request_id threads both events so PostHog can
  // stitch click → result via $insert_id correlation.
  const fireShareExport = (
    format: ShareExportFormat,
    fn: () => Promise<unknown> | unknown,
  ) => {
    const requestId = analytics.newRequestId();
    const artifactId = anonymizeArtifactId({ projectId, fileName: file.name });
    const artifactKind = artifactKindToTracking({ fileKind: file.kind ?? null });
    const trackingFormat = format as Exclude<typeof format, 'image'>;
    trackShareOptionPopoverClick(
      analytics.track,
      {
        page_name: 'artifact',
        area: 'share_option_popover',
        artifact_id: artifactId,
        artifact_kind: artifactKind,
        element: trackingFormat,
        project_id: projectId,
        project_kind: projectKind,
      },
      { requestId },
    );
    const started = performance.now();
    const finish = (result: 'success' | 'failed' | 'cancelled', errorCode?: string) => {
      trackArtifactExportResult(
        analytics.track,
        {
          page_name: 'artifact',
          area: 'share_option_popover',
          artifact_id: artifactId,
          artifact_kind: artifactKind,
          project_id: projectId,
          project_kind: projectKind,
          export_format: trackingFormat,
          result,
          ...(errorCode ? { error_code: errorCode } : {}),
          export_duration_ms: Math.round(performance.now() - started),
        },
        { requestId },
      );
    };
    const toastFormats = new Set(['pdf', 'pptx', 'zip', 'html', 'image', 'markdown']);
    const exportInProgressMessage = exportInProgressToastMessage(format, t);
    const showExportFailureToast = (err: unknown) => {
      if (!toastFormats.has(format)) return;
      notifyTeamverEmbedAuthFailureIfNeeded(err, 'daemon');
      const message = formatExportFailureMessageForUser(
        err,
        '다운로드를 만들지 못했습니다. 잠시 후 다시 시도하세요.',
        {
          logoutMessage: '로그인 세션이 만료되어 내보내기에 실패했습니다. 다시 로그인한 뒤 시도하세요.',
          transientMessage: '내보내기 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.',
        },
      );
      setExportToast({ message, tone: 'error' });
    };
    // Teamver rendered exports need a stable HTML snapshot (or the daemon
    // falls back to scratch/S3 and often races). If the preview has not
    // painted yet, fail fast with a clear nudge — before the loading toast.
    const renderedFormats = new Set(['pdf', 'pptx', 'zip', 'html', 'image']);
    if (
      isTeamverEmbedMode()
      && renderedFormats.has(format)
      && !(exportHtmlSnapshotGateRef.current ?? '').trim()
    ) {
      finish('failed', 'preview_not_ready');
      setDownloadMenuOpen(false);
      setExportToast({
        message: '미리보기가 아직 준비되지 않았습니다. 슬라이드가 보인 뒤 다시 다운로드해 주세요.',
        tone: 'error',
        ttlMs: 6000,
      });
      return;
    }
    if (toastFormats.has(format)) {
      flushSync(() => {
        setDownloadMenuOpen(false);
        setExportToast({ message: exportInProgressMessage, tone: 'loading' });
      });
    }
    const runExport = () => {
      try {
        const showResultToast = (result: unknown) => {
          if (!toastFormats.has(format)) return;
          // PDF's `'fallback'` result means the daemon export failed and
          // the browser print dialog was opened instead. Users won't
          // receive an automatic file download in that case, so the
          // success-y "PDF 다운로드 완료" copy is misleading — surface a
          // dedicated notice that tells them to pick "Save as PDF" in
          // their browser's print dialog.
          if (format === 'pdf' && result === 'fallback') {
            setExportToast({
              message: t('fileViewer.exportPdfBrowserPrintFallback'),
              tone: 'default',
              // Extended lifetime: the copy asks users to interact with
              // the browser print dialog, so the toast must outlive the
              // ~2.2s success flash and remain visible until they read it.
              ttlMs: 9000,
            });
            return;
          }
          setExportToast({ message: exportSuccessToastMessage(format, t), tone: 'default' });
        };
        const out = fn();
        if (out && typeof (out as Promise<unknown>).then === 'function') {
          beginTeamverEmbedActiveWork();
          (out as Promise<unknown>)
            .finally(() => {
              endTeamverEmbedActiveWork();
            })
            .then(
              (result) => {
                if (result === 'cancelled') {
                  finish('cancelled');
                  if (toastFormats.has(format)) setExportToast(null);
                  return;
                }
                finish('success');
                showResultToast(result);
              },
              (err) => {
                finish('failed', err instanceof Error ? err.name : 'UNKNOWN');
                showExportFailureToast(err);
              },
            );
        } else {
          if (out === 'cancelled') {
            finish('cancelled');
            if (toastFormats.has(format)) setExportToast(null);
            return;
          }
          finish('success');
          showResultToast(out);
        }
      } catch (err) {
        finish('failed', err instanceof Error ? err.name : 'UNKNOWN');
        showExportFailureToast(err);
      }
    };
    // Let React paint the closed menu + loading toast before expensive
    // export preparation starts. Otherwise the click can feel ignored while
    // headless export ticket creation or HTML snapshot work begins.
    if (!toastFormats.has(format)) {
      runExport();
    } else if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(runExport);
      });
    } else {
      window.setTimeout(runExport, 0);
    }
  };
  // P0 helpers — keep the artifact_id + artifact_kind derivation in one place
  // so each per-button onClick stays a one-liner. We compute lazily inside the
  // closure because `file.kind` / `file.name` can change as the user navigates
  // tabs without remounting HtmlViewer.
  const fireArtifactToolbarClick = (
    element:
      | 'reload'
      | 'preview'
      | 'source'
      | 'tweaks'
      | 'draw'
      | 'comment'
      | 'pods'
      | 'inspect'
      | 'edit'
      | 'zoom_out'
      | 'zoom_level_dropdown'
      | 'zoom_in'
      | 'revision_history',
  ) => {
    trackArtifactToolbarClick(analytics.track, {
      page_name: 'artifact',
      area: 'artifact_toolbar',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    });
  };
  const fireDrawToolbarClick = (
    element: DrawToolbarElement,
    submitAction?: 'draft' | 'queue' | 'send',
  ) => {
    trackDrawToolbarClick(analytics.track, {
      page_name: 'artifact',
      area: 'draw_toolbar',
      element,
      ...(submitAction ? { submit_action: submitAction } : {}),
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    });
  };
  const fireArtifactHeaderClick = (
    element:
      | 'back'
      | 'edit'
      | 'present_dropdown'
      | 'download_dropdown'
      | 'share_dropdown'
      | 'settings',
  ) => {
    trackArtifactHeaderClick(analytics.track, {
      page_name: 'artifact',
      area: 'artifact_header',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    });
  };
  const firePresentPopoverClick = (
    element: 'in_this_tab' | 'fullscreen' | 'new_tab',
  ) => {
    trackPresentPopoverClick(analytics.track, {
      page_name: 'artifact',
      area: 'present_popover',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    });
  };
  const fireCommentPopoverClick = (
    element: 'save_comment' | 'send_to_chat' | 'add_note',
  ) => {
    trackCommentPopoverClick(analytics.track, {
      page_name: 'artifact',
      area: 'comment_popover',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    });
  };
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  // One intact-gated repair for liveHtml init (was 3× ungated repair on mount).
  const initialLiveHtmlRepaired = liveHtml == null
    ? null
    : (() => {
      const repaired = repairArtifactDocumentHeadIfNeeded(liveHtml);
      return isArtifactHtmlStableForPreview(repaired) ? repaired : null;
    })();
  const [source, setSource] = useState<string | null>(() => initialLiveHtmlRepaired);
  const [sourceLoadFailed, setSourceLoadFailed] = useState(false);
  const lastStablePreviewSourceRef = useRef<string | null>(initialLiveHtmlRepaired);
  // After POST /files succeeds, pin the saved HTML so onFileSaved → disk
  // refetch cannot briefly restore the pre-edit snapshot (S3/lazy race).
  const manualEditPinnedSourceRef = useRef<ManualEditSourcePin | null>(null);
  const pinManualEditSavedSource = (savedSource: string) => {
    manualEditPinnedSourceRef.current = createManualEditSourcePin(savedSource);
    lastStablePreviewSourceRef.current = savedSource;
    exportHtmlSnapshotGateRef.current = savedSource;
    rememberStablePreviewSource(projectId, file.name, savedSource);
  };
  const lastStablePreviewIdentityRef = useRef<string | null>(null);
  // When liveHtml is present and paints (stable or last-stable fallback),
  // skip disk fetch. Token churn must NOT cancel an in-flight disk debounce.
  const [liveHtmlPaintsPreview, setLiveHtmlPaintsPreview] = useState(
    () => initialLiveHtmlRepaired != null,
  );
  const hasLiveHtml = liveHtml !== undefined;
  // Disk-fetch callbacks read streaming via ref so soft-retry / wall decisions
  // stay correct without re-subscribing on every liveHtml token.
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;
  // Stream-end deck fit nudge: track prior `streaming` without putting it in the
  // main fit-nudge effect deps (avoids canceling in-flight nudges on re-entry).
  const wasStreamingForDeckFitRef = useRef(streaming);
  const liveHtmlPaintsPreviewRef = useRef(liveHtmlPaintsPreview);
  liveHtmlPaintsPreviewRef.current = liveHtmlPaintsPreview;
  const [inlinedSource, setInlinedSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const fileViewportKey = previewViewportStateKey(projectId, file);
  const [previewViewport, setPreviewViewportState] = useState<PreviewViewportId>(
    () => htmlPreviewViewportState.get(fileViewportKey) ?? 'desktop',
  );
  const setPreviewViewport = useCallback((viewport: PreviewViewportId) => {
    setPreviewViewportCached(fileViewportKey, viewport);
    setPreviewViewportState(viewport);
  }, [fileViewportKey]);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  const [deployMenuOpen, setDeployMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [exportReadyNudge, setExportReadyNudge] = useState(false);
  const exportReadyNudgeSeenRef = useRef<Set<string>>(new Set());
  // Template save UX. We surface a transient "Saved" pill in the share
  // menu so the user gets feedback without a noisy toast layer.
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    setPreviewViewportState(htmlPreviewViewportState.get(fileViewportKey) ?? 'desktop');
  }, [fileViewportKey]);
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateSaveError, setTemplateSaveError] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<WebDeploymentInfo | null>(null);
  const [deploymentsByProvider, setDeploymentsByProvider] = useState<Partial<Record<WebDeployProviderId, WebDeploymentInfo>>>({});
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const closeDeployModal = useCallback(() => {
    setDeployModalOpen(false);
  }, []);
  const [deployConfig, setDeployConfig] = useState<WebDeployConfigResponse | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployPhase, setDeployPhase] = useState<'idle' | 'deploying' | 'preparing-link'>('idle');
  const [savingDeployConfig, setSavingDeployConfig] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<WebDeployProjectFileResponse | null>(null);
  const [copiedDeployLink, setCopiedDeployLink] = useState<string | null>(null);
  const [deployProviderId, setDeployProviderId] = useState<WebDeployProviderId>(DEFAULT_DEPLOY_PROVIDER_ID);
  const [projectSocialShare, setProjectSocialShare] = useState<SocialShareResponse | null>(null);
  const [deployToken, setDeployToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [cloudflareAccountId, setCloudflareAccountId] = useState('');
  const [cloudflareZones, setCloudflareZones] = useState<CloudflarePagesZoneOption[]>([]);
  const [cloudflareZonesLoading, setCloudflareZonesLoading] = useState(false);
  const [cloudflareZonesError, setCloudflareZonesError] = useState<string | null>(null);
  const [cloudflareZoneId, setCloudflareZoneId] = useState('');
  const [cloudflareDomainPrefix, setCloudflareDomainPrefix] = useState('');
  const deployProviderLoadSeqRef = useRef(0);
  const deployTokenInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!deployModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeDeployModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDeployModal, deployModalOpen]);
  const [inTabPresent, setInTabPresent] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [embedAuthRecoveryNonce, setEmbedAuthRecoveryNonce] = useState(0);
  const [boardMode, setBoardMode] = useState(false);
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  const [commentCreateMode, setCommentCreateMode] = useState(false);
  const [boardTool, setBoardTool] = useState<BoardTool>('inspect');
  const [inspectMode, setInspectMode] = useState(false);
  const [agentToolsOpen, setAgentToolsOpen] = useState(false);
  const [drawOverlayOpen, setDrawOverlayOpen] = useState(false);
  useEffect(() => {
    if (hideDrawAnnotation) setDrawOverlayOpen(false);
  }, [hideDrawAnnotation]);
  // for hint managing hint box state
  const [openHintBox, setOpenHintBox] = useState(true);
  const [manualEditMode, setManualEditModeRaw] = useState(false);
  const [manualEditSrcDocActive, setManualEditSrcDocActive] = useState(false);
  const [manualEditFrozenSource, setManualEditFrozenSource] = useState<string | null>(null);
  const [manualEditInlineTextEditing, setManualEditInlineTextEditing] = useState(false);
  const manualEditInlineTextEditingRef = useRef(false);
  manualEditInlineTextEditingRef.current = manualEditInlineTextEditing;
  const [manualEditResizeDraftSize, setManualEditResizeDraftSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [manualEditMoveDraftPos, setManualEditMoveDraftPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [manualEditGroupDraftRects, setManualEditGroupDraftRects] = useState<
    Record<string, ManualEditRect> | null
  >(null);
  /** Iframe offset inside `.manual-edit-workspace` — canvas may be centered. */
  const [manualEditHostOffset, setManualEditHostOffset] = useState({ x: 0, y: 0 });
  /** Measured CSS scale of the preview iframe (toolbar zoom can diverge). */
  const [manualEditHostScale, setManualEditHostScale] = useState(1);
  /** Iframe content-space page bounds for canvas snap guides. */
  const [manualEditContentPageBounds, setManualEditContentPageBounds] = useState<ManualEditRect | null>(null);
  const [manualEditViewportBounds, setManualEditViewportBounds] = useState<ManualEditRect | null>(null);
  const [manualEditLayersPanelOpen, setManualEditLayersPanelOpen] = useState(false);
  /**
   * Live host-space paint box for the selected element. Overlay prefers this
   * over composing target.rect × scale + offset (which goes stale when the
   * iframe is not ready yet or zoom shell remounts).
   */
  const [manualEditHostPaintRect, setManualEditHostPaintRect] = useState<ManualEditRect | null>(null);
  const manualEditHostPaintRectRef = useRef<ManualEditRect | null>(null);
  /** Bumped when the active preview iframe loads so geometry sync retries. */
  const [manualEditGeomEpoch, setManualEditGeomEpoch] = useState(0);
  const manualEditWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const manualEditResizeSessionActiveRef = useRef(false);
  const manualEditGeometryHandoffIdRef = useRef<string | null>(null);
  /** Tip-yield freeze remount — skip idle wild-jump deny until first remasure. */
  const manualEditTipRemountGeometryGraceIdRef = useRef<string | null>(null);
  const manualEditTipRemountGeometryGraceUntilRef = useRef(0);
  /** Deck host-fit settle — remasure after scale nudges (460). */
  const manualEditTipRemountFitSettleUntilRef = useRef(0);
  /** Post-settle identity protect after grace clear (468). */
  const manualEditTipRemountIdentityHoldUntilRef = useRef(0);
  /**
   * Sticky tip identity retain after hold — bridge blank outerHtml must not
   * one-shot Mixed when the timed hold ends (472). Cleared on selection leave.
   */
  const manualEditTipSyncedIdentityRetainRef = useRef(false);
  /**
   * Post-sticky soft-land catalogs — tip identity / membership hold after
   * sticky clear so Mixed does not one-shot on the first live broadcast (480/483).
   */
  const manualEditTipPostStickySoftLandRef = useRef(0);
  /** One more preserve catalog after soft-land ends (486). */
  const manualEditTipPostSoftLandExitLatchRef = useRef(false);
  /** Post-exit Mixed absorb — live FP without preserve (491/493). */
  const manualEditTipPostExitMixedAbsorbRef = useRef(false);
  /** One quiet catalog after absorb so first live Mixed does not flicker (509). */
  const manualEditTipPostAbsorbInspectorQuietRef = useRef(false);
  /** Follow late deck fit nudges without extending wild-jump latch (487). */
  const manualEditTipDeckNudgeFollowUntilRef = useRef(0);
  /** Last follow-only remasure time for throttle (492). */
  const manualEditTipDeckNudgeRemasureAtRef = useRef(0);
  /** Safety: release chrome when deck-nudge follow ends (494). */
  const manualEditTipDeckNudgeFollowChromeTimeoutRef = useRef<number | null>(null);
  /** Follow-end chrome release deferred while remount safety timeout pending (510). */
  const manualEditTipFollowChromeReleaseDeferredRef = useRef(false);
  /** rAF coalesce for follow-only deck-nudge remasures (497). */
  const manualEditTipDeckNudgeRemasureRafRef = useRef<number | null>(null);
  /** Chrome release deferred because fit remasure hit an active resize (489). */
  const manualEditTipChromeReleaseAfterResizeRef = useRef(false);
  /** One-shot wild-jump skip after tip fit-settle remasure (485). */
  const manualEditTipPostFitSettleWildJumpSkipRef = useRef(false);
  const manualEditTipRemountFitSettleCancelRef = useRef<(() => void) | null>(null);
  /** Stable tip remasure hook for deck fit onAfterNudge (487). */
  const tipRemasureOnDeckNudgeRef = useRef<() => void>(() => {});
  /** Pending onLoad sync measure rAF retry — cancel on grace clear (463). */
  const manualEditTipRemountSyncRetryRafRef = useRef<number | null>(null);
  /** Inert resize/multi chrome until tip remasure applies tip geometry (455/458). */
  const [manualEditTipRemountChromeSuppressed, setManualEditTipRemountChromeSuppressed] = useState(false);
  const manualEditTipRemountChromeSuppressedRef = useRef(false);
  /** Deferred Mixed/single reseed after freeze — cancelled when a newer tip-yield schedules. */
  const manualEditFreezeEchoTimeoutRef = useRef<number | null>(null);
  /** Safety clear for tip chrome suppress if remasure never arrives (457). */
  const manualEditTipRemountChromeSafetyTimeoutRef = useRef<number | null>(null);
  /** Confirm refuse → suppress disk tip prefer until refresh commits. */
  const manualEditSuppressTipPreferUntilRefreshRef = useRef(false);
  const manualEditRemeasureAwaiterRef = useRef(createManualEditRemeasureAwaiter());
  const manualEditModeRef = useRef(false);
  const manualEditResizePausedRef = useRef(false);
  const manualEditFrozenSourceRef = useRef<string | null>(null);
  const [manualEditViewportWidth, setManualEditViewportWidth] = useState<number | null>(null);
  const [commentPortalHost, setCommentPortalHost] = useState<HTMLElement | null>(null);
  const [previewBodyRef, previewBodySize] = usePreviewCanvasSize<HTMLDivElement>();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const deckPanDragRef = useRef<{
    active: boolean;
    pointerId: number | null;
    lastX: number;
    lastY: number;
  }>({ active: false, pointerId: null, lastX: 0, lastY: 0 });
  const [deckPanning, setDeckPanning] = useState(false);
  const urlPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const srcDocPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);
  /** Draw mode remounts srcDoc; block capture until the active frame has loaded. */
  const drawCaptureReadyRef = useRef(true);
  const activatedSrcDocTransportHtmlRef = useRef<string | null>(null);
  const prevFilesRefreshKeyRef = useRef(filesRefreshKey);
  // Agent / manual writes bump `filesRefreshKey` before project mtimes settle.
  // Invalidate the disk cache and refetch — but do NOT clear last-stable or
  // remount the iframe here. Clearing last-stable blanked the hold path on
  // null/incomplete GETs, and an immediate remount interrupted compact-deck
  // host-viewport fit (preview goes black with 1/N still working until refresh).
  useEffect(() => {
    if (filesRefreshKey <= 0 || filesRefreshKey === prevFilesRefreshKeyRef.current) return;
    prevFilesRefreshKeyRef.current = filesRefreshKey;
    invalidateCachedPreviewSource(projectId, file.name);
    // Keep an active save-pin through chokidar refresh storms so disk lag
    // cannot restore the pre-edit frame; re-seed the module cache from pin.
    // When tip content cache already differs from the pin (agent tip landed),
    // clear the pin and fall through so the newer tip can remount.
    if (isManualEditSourcePinActive(manualEditPinnedSourceRef.current)) {
      const pinned = manualEditPinnedSourceRef.current;
      if (pinned?.source) {
        const stack = revisionStackRef.current;
        const activeSeq = getActiveRevisionSequence(projectId, file.name);
        // activeSeq miss → null (no HEAD fallback) so cold tip remount can adopt.
        const tipCached = tipContentForManualEditSavePin(
          stack,
          activeSeq,
          (revisionId) => getRevisionContentCache(projectId, file.name, revisionId),
        );
        const activeSeqMissingFromStack = activeSeq != null
          && !stack.revisions.some((revision) => revision.sequence === activeSeq);
        if (tipCached != null && tipCached !== pinned.source) {
          // Warm tip cache already diverges — drop pin and remount.
          manualEditPinnedSourceRef.current = null;
        } else if (activeSeqMissingFromStack) {
          // Tip seq advanced but stack/cache still cold — remount so refresh
          // can adopt; pin stays so resolveManualEditSourceAgainstPinAndTip guards stale GET.
        } else {
          rememberStablePreviewSource(projectId, file.name, pinned.source);
          // Active pin owns the painted frame — adopt pin if paint drifted;
          // never tear srcdoc / bust reloadKey while the pin is live.
          if (sourceRef.current !== pinned.source) {
            setSource(pinned.source);
            sourceRef.current = pinned.source;
            lastStablePreviewSourceRef.current = pinned.source;
            exportHtmlSnapshotGateRef.current = pinned.source;
          }
          return;
        }
      }
    } else {
      manualEditPinnedSourceRef.current = null;
    }
    activatedSrcDocTransportHtmlRef.current = null;
    setLiveHtmlPaintsPreview(false);
    setReloadKey((key) => key + 1);
  }, [filesRefreshKey, projectId, file.name]);
  // Tracks the iframe DOM node whose dedupe ref was last reset by the
  // srcDoc onLoad handler. We reset the dedupe exactly once per freshly
  // mounted iframe (the first load is the shell HTML), and skip every
  // subsequent load on the same node (those are our own
  // document.open/write/close inside the shell). See onLoad below for
  // the infinite-loop story (issue #2361).
  const srcDocFrameDedupeResetForRef = useRef<HTMLIFrameElement | null>(null);
  const presentIframeRef = useRef<HTMLIFrameElement | null>(null);
  const isActivePreviewIframeSource = useCallback((source: MessageEventSource | null) => {
    if (!source) return false;
    // In-tab presentation mounts a second iframe over the host; accept its
    // slide-state / bridge messages so keyboard nav in the overlay stays in sync.
    if (source === presentIframeRef.current?.contentWindow) return true;
    return source === iframeRef.current?.contentWindow;
  }, []);
  const isOurPreviewIframeSource = useCallback((source: MessageEventSource | null) => {
    if (!source) return false;
    return (
      source === iframeRef.current?.contentWindow ||
      source === presentIframeRef.current?.contentWindow ||
      source === urlPreviewIframeRef.current?.contentWindow ||
      source === srcDocPreviewIframeRef.current?.contentWindow
    );
  }, []);
  const previewScrollRestoreRef = useRef<{
    hostLeft: number;
    hostTop: number;
    frameLeft: number;
    frameTop: number;
    canvasLeft: number;
    canvasTop: number;
    expiresAt: number;
  } | null>(null);
  const compactApiStackedDeckRef = useRef(false);
  const previewScrollPositionRef = useRef({
    frameLeft: 0,
    frameTop: 0,
    canvasLeft: 0,
    canvasTop: 0,
  });
  const previewScrollRequestAtRef = useRef(0);
  const dcViewportRef = useRef({
    x: 0,
    y: 0,
    scale: 1,
  });
  const dcViewportRestoreAtRef = useRef(0);
  useEffect(() => {
    manualEditModeRef.current = manualEditMode;
  }, [manualEditMode]);
  useEffect(() => {
    manualEditFrozenSourceRef.current = manualEditFrozenSource;
  }, [manualEditFrozenSource]);

  const setManualEditMode = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setManualEditModeRaw((prev) => {
      const value = typeof next === 'function' ? (next as (p: boolean) => boolean)(prev) : next;
      if (shouldClearManualEditFrozenSourceOnModeChange(prev, value)) {
        // Style edits update `source` but leave the entry freeze intact while
        // editing (postMessage live preview). Clear on exit/re-enter so the
        // next freeze snapshots the latest saved HTML — otherwise re-entering
        // edit mode paints the pre-edit freeze and looks "reverted".
        setManualEditFrozenSource(null);
        setManualEditInlineTextEditing(false);
      }
      if (value !== prev && !value) {
        setManualEditViewportWidth(null);
        setManualEditInlineTextEditing(false);
      }
      return value;
    });
  }, []);
  useEffect(() => {
    setManualEditSrcDocActive(false);
    setManualEditFrozenSource(null);
  }, [projectId, file.name]);
  useEffect(() => {
    onCommentModeChange?.(commentPanelOpen);
  }, [commentPanelOpen, onCommentModeChange]);
  useEffect(() => () => {
    onCommentModeChange?.(false);
  }, [onCommentModeChange]);
  useEffect(() => {
    if (!commentPanelOpen || !commentPortalId) {
      setCommentPortalHost(null);
      return;
    }
    let cancelled = false;
    let raf = 0;
    const findHost = () => {
      if (cancelled) return;
      const host = document.getElementById(commentPortalId);
      setCommentPortalHost(host);
      if (!host) raf = window.requestAnimationFrame(findHost);
    };
    findHost();
    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      setCommentPortalHost(null);
    };
  }, [commentPanelOpen, commentPortalId]);
  const capturePreviewScrollPosition = useCallback(() => {
    const host = previewBodyRef.current;
    let frameLeft = 0;
    let frameTop = 0;
    let canvasLeft = 0;
    let canvasTop = 0;
    try {
      const frameDocument = iframeRef.current?.contentWindow?.document;
      const frameScroll = frameDocument?.scrollingElement;
      const canvasScroll = frameDocument?.querySelector<HTMLElement>('.design-canvas');
      frameLeft = frameScroll?.scrollLeft ?? 0;
      frameTop = frameScroll?.scrollTop ?? 0;
      canvasLeft = canvasScroll?.scrollLeft ?? 0;
      canvasTop = canvasScroll?.scrollTop ?? 0;
    } catch {
      frameLeft = 0;
      frameTop = 0;
      canvasLeft = 0;
      canvasTop = 0;
    }
    previewScrollRestoreRef.current = {
      hostLeft: host?.scrollLeft ?? 0,
      hostTop: host?.scrollTop ?? 0,
      frameLeft: frameLeft || previewScrollPositionRef.current.frameLeft,
      frameTop: frameTop || previewScrollPositionRef.current.frameTop,
      canvasLeft: canvasLeft || previewScrollPositionRef.current.canvasLeft,
      canvasTop: canvasTop || previewScrollPositionRef.current.canvasTop,
      expiresAt: Date.now() + 5000,
    };
  }, []);
  const restorePreviewScrollPosition = useCallback(() => {
    if (compactApiStackedDeckRef.current) return;
    const snapshot = previewScrollRestoreRef.current;
    if (!snapshot) return;
    if (Date.now() > snapshot.expiresAt) {
      previewScrollRestoreRef.current = null;
      return;
    }
    const apply = () => {
      const previewBody = previewBodyRef.current;
      if (typeof previewBody?.scrollTo === 'function') {
        previewBody.scrollTo(snapshot.hostLeft, snapshot.hostTop);
      }
      try {
        const frameDocument = iframeRef.current?.contentWindow?.document;
        frameDocument?.scrollingElement?.scrollTo(snapshot.frameLeft, snapshot.frameTop);
        frameDocument?.querySelector<HTMLElement>('.design-canvas')?.scrollTo(snapshot.canvasLeft, snapshot.canvasTop);
        iframeRef.current?.contentWindow?.postMessage({
          type: 'od:preview-scroll-restore',
          frameLeft: snapshot.frameLeft,
          frameTop: snapshot.frameTop,
          canvasLeft: snapshot.canvasLeft,
          canvasTop: snapshot.canvasTop,
        }, '*');
      } catch {}
    };
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        apply();
        window.setTimeout(apply, 80);
        window.setTimeout(() => {
          if (previewScrollRestoreRef.current === snapshot) {
            apply();
          }
        }, 260);
      });
    });
  }, []);
  const [manualEditTargets, setManualEditTargets] = useState<ManualEditTarget[]>([]);
  // Bridge message handlers omit manualEditTargets from effect deps — keep a
  // live catalog for tip-remount style preserve (467).
  const manualEditTargetsRef = useRef(manualEditTargets);
  manualEditTargetsRef.current = manualEditTargets;
  const [selectedManualEditTarget, setSelectedManualEditTarget] = useState<ManualEditTarget | null>(null);
  const [selectedManualEditTargetIds, setSelectedManualEditTargetIds] = useState<string[]>([]);
  const [manualEditMixedStyleKeys, setManualEditMixedStyleKeys] = useState<Set<keyof ManualEditStyles>>(
    () => new Set(),
  );
  const [manualEditHoverTarget, setManualEditHoverTarget] = useState<ManualEditTarget | null>(null);
  const [manualEditPageStylesOpen, setManualEditPageStylesOpen] = useState(false);
  const manualEditPageStylesOpenRef = useRef(false);
  manualEditPageStylesOpenRef.current = manualEditPageStylesOpen;
  const [manualEditPanelPosition, setManualEditPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const [manualEditPanelCollapsed, setManualEditPanelCollapsed] = useState(false);
  const manualEditPanelPositionRef = useRef<{ left: number; top: number } | null>(null);
  const manualEditPanelCollapsedRef = useRef(false);
  manualEditPanelPositionRef.current = manualEditPanelPosition;
  manualEditPanelCollapsedRef.current = manualEditPanelCollapsed;
  /** Auto pin may upgrade once when first paint rect arrives; user drag freezes forever. */
  const manualEditPanelUserPinnedRef = useRef(false);
  const manualEditPanelPaintPinnedIdRef = useRef<string | null>(null);
  const selectedManualEditTargetIdRef = useRef<string | null>(null);
  const selectedManualEditTargetRef = useRef<ManualEditTarget | null>(null);
  const selectedManualEditTargetIdsRef = useRef<string[]>([]);
  const manualEditTargetsIdentityFingerprintRef = useRef<string>('');
  /** Selected-set identity only — multi inspector reseed must not follow unselected churn. */
  const manualEditSelectedIdentityFingerprintRef = useRef<string>('');
  const manualEditHoverTargetIdRef = useRef<string | null>(null);
  const [manualEditDraft, setManualEditDraft] = useState<ManualEditDraft>(() => emptyManualEditDraft());
  const [revisionStack, setRevisionStack] = useState<RevisionStackSnapshot>(() => (
    createRevisionStackSnapshot([], null)
  ));
  const revisionStackRef = useRef(revisionStack);
  revisionStackRef.current = revisionStack;
  const revisionReconcileGenerationRef = useRef(0);
  function commitRevisionStack(next: RevisionStackSnapshot) {
    revisionStackRef.current = next;
    revisionReconcileGenerationRef.current += 1;
    setRevisionStack(next);
  }
  function isStaleRevisionReconcile(reconcileGeneration: number): boolean {
    return reconcileGeneration !== revisionReconcileGenerationRef.current;
  }
  const revisionSyncSuppressRef = useRef(false);
  const revisionSkipReconcileOnceRef = useRef(false);
  const revisionRefreshGenerationRef = useRef(0);
  const deferredRevisionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRefreshActiveRetryRef = useRef(0);
  const revisionRefreshListRetryRef = useRef(0);
  const revisionConflictSuppressedRef = useRef(false);
  // First reconcile after mount / file-switch. Suppress the scary "file was
  // changed unexpectedly" toast on this pass because:
  //   * The user just arrived at this file — they cannot have observed any
  //     mid-session mutation, so a toast on entry always reads as spurious.
  //   * Common causes of disk↔snapshot drift on entry are structural
  //     (folder-import wrote without pushing a revision, an old file predates
  //     the revision system, restoreRevision path applied a daemon-side
  //     content transform, etc.), not something the user did.
  // We still perform the state updates that mark the stack as invalidated so
  // undo/redo stays honestly disabled — only the toast is quiet.
  const revisionInitialReconcileRef = useRef(true);
  const revisionConflictMessageRef = useRef(t('fileRevision.conflict.message'));
  revisionConflictMessageRef.current = t('fileRevision.conflict.message');
  const revisionDiskSyncMessageRef = useRef(t('fileRevision.diskSync.failedMessage'));
  revisionDiskSyncMessageRef.current = t('fileRevision.diskSync.failedMessage');
  const revisionDiskSyncRetryLabelRef = useRef(t('fileRevision.diskSync.retryAction'));
  revisionDiskSyncRetryLabelRef.current = t('fileRevision.diskSync.retryAction');
  const revisionDiskSyncFailedTargetRef = useRef<FileRevision | null>(null);
  const revisionDiskSyncPromiseRef = useRef<Promise<boolean> | null>(null);
  const [manualEditError, setManualEditError] = useState<string | null>(null);
  const [manualEditSaving, setManualEditSaving] = useState(false);
  const manualEditSavingRef = useRef(false);
  const manualEditZOrderHandlerRef = useRef<((action: ZOrderAction) => void) | null>(null);
  const manualEditDeleteHandlerRef = useRef<(() => void) | null>(null);
  const manualEditPendingStyleRef = useRef<ManualEditPendingStyleSave | null>(null);
  const manualEditStyleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualEditPreviewVersionRef = useRef(0);
  useEffect(() => {
    // Drop in-flight style drafts on artifact switch — autosave must not
    // POST the previous file's pending tweak into the next file's path.
    manualEditPendingStyleRef.current = null;
    if (manualEditStyleTimerRef.current) {
      clearTimeout(manualEditStyleTimerRef.current);
      manualEditStyleTimerRef.current = null;
    }
  }, [projectId, file.name]);
  const sourceRef = useRef<string | null>(source);
  const sourceFileKeyRef = useRef<string | null>(null);
  const previewSourceFetchGenerationRef = useRef(0);
  /** Wall deadline is per artifact identity — must not reset on filesRefresh churn. */
  const previewSourceWallIdentityRef = useRef<string | null>(null);
  const previewSourceWallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Soft-retry wall is per artifact identity — must not reset on filesRefresh churn. */
  const previewSourceRetryUntilRef = useRef<{ identity: string; until: number } | null>(null);
  const templateNameId = useId();
  const templateDescriptionId = useId();
  const imageExportTitleId = useId();
  // Opt back into the legacy inline-asset srcDoc path via `?forceInline=1`
  // on the host page. Lets users escape-hatch around the URL-load default
  // for non-deck HTML that depends on the in-iframe localStorage shim.
  const forceInline = useMemo(
    () => (typeof window === 'undefined' ? false : parseForceInline(window.location.search)),
    [],
  );
  const [activeCommentTarget, setActiveCommentTarget] = useState<PreviewCommentSnapshot | null>(null);
  const [hoveredCommentTarget, setHoveredCommentTarget] = useState<PreviewCommentSnapshot | null>(null);
  // True while the pointer is physically over the floating hover card. The card
  // sits on top of the preview iframe, so reaching it makes the iframe fire a
  // mouseout -> od:comment-leave. We ignore that leave while pinned so the card
  // (and its selectable values) stays put instead of unmounting and flickering.
  // The pointer cannot be over the iframe and the host card at once, so a fresh
  // od:comment-hover never races this; only the card's own leave clears it.
  const hoverCardPinnedRef = useRef(false);
  // Tearing the card down is always deferred by a beat rather than done
  // synchronously. The iframe's mouseout (od:comment-leave) arrives async via
  // postMessage; the card's own mouseenter and the next od:comment-hover are the
  // signals that the pointer actually landed on the card or back on the element
  // it overlaps. Deferring lets those cancel the dismiss before it lands.
  // Synchronous teardown raced ahead of them: the card flickered on the way in
  // and vanished the moment you moved off it back onto the element it described.
  const hoverCardDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverCardDismiss = useCallback(() => {
    if (hoverCardDismissTimerRef.current !== null) {
      clearTimeout(hoverCardDismissTimerRef.current);
      hoverCardDismissTimerRef.current = null;
    }
  }, []);
  const scheduleHoverCardDismiss = useCallback(() => {
    if (hoverCardDismissTimerRef.current !== null) clearTimeout(hoverCardDismissTimerRef.current);
    hoverCardDismissTimerRef.current = setTimeout(() => {
      hoverCardDismissTimerRef.current = null;
      // hoverCardPinnedRef tracks "pointer is physically over the card". If it
      // got (re-)pinned while we waited, this now-stale dismiss must not fire.
      if (!hoverCardPinnedRef.current) setHoveredCommentTarget(null);
    }, HOVER_CARD_DISMISS_DELAY_MS);
  }, []);
  const [hoveredPodMemberId, setHoveredPodMemberId] = useState<string | null>(null);
  // If the card unmounts for any other reason while the pointer is still over
  // it (its onMouseLeave never fires), drop the pin so later leaves dismiss
  // normally instead of being swallowed forever.
  useEffect(() => {
    if (!hoveredCommentTarget) hoverCardPinnedRef.current = false;
  }, [hoveredCommentTarget]);
  // Don't let a pending dismiss outlive the component.
  useEffect(() => cancelHoverCardDismiss, [cancelHoverCardDismiss]);
  const [activePreviewCommentId, setActivePreviewCommentId] = useState<string | null>(null);
  const [liveCommentTargets, setLiveCommentTargets] = useState<Map<string, PreviewCommentSnapshot>>(() => new Map());
  const liveCommentTargetsRef = useRef(liveCommentTargets);
  const [commentOrderIds, setCommentOrderIds] = useState<string[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  // Inspect mode shares the iframe selection bridge with comment mode but
  // routes the picked element to a side panel that mutates per-element CSS
  // overrides via postMessage. The host owns the authoritative override map:
  // it is hydrated from the artifact's persisted <style> block on load and
  // mutated only by host-driven onApply / reset actions. Save-to-source
  // serializes that host map directly — iframe od:inspect-overrides messages
  // are preview acknowledgements and never feed save input, so artifact JS
  // forging a postMessage cannot tamper with what gets persisted.
  const [activeInspectTarget, setActiveInspectTarget] = useState<InspectTarget | null>(null);
  const [inspectOverrides, setInspectOverrides] = useState<InspectOverrideMap>(() =>
    typeof source === 'string' ? parseInspectOverridesFromSource(source) : {},
  );
  // Track which `source` value the host map was last hydrated from so the
  // setState-during-render hydration below only fires when the artifact
  // text actually changes (file switch, save round-trip, live edits). The
  // ref is initialised to `source` so the matching useState initialiser
  // above counts as the first hydration.
  const inspectHydratedSourceRef = useRef<string | null | undefined>(source);
  const [savingInspect, setSavingInspect] = useState(false);
  const [inspectSavedAt, setInspectSavedAt] = useState<number | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [queuedBoardNotes, setQueuedBoardNotes] = useState<string[]>([]);
  // Images attached to an element comment ("评论此元素"). Kept as raw Files
  // (uploaded on send) with object-URL thumbnails for preview/remove, mirroring
  // the markup overlay's image tray.
  const [boardImages, setBoardImages] = useState<File[]>([]);
  const [activeCommentExistingAttachments, setActiveCommentExistingAttachments] =
    useState<PreviewCommentAttachment[]>([]);
  const [boardImagePreviews, setBoardImagePreviews] = useState<{ file: File; url: string }[]>([]);
  const [boardPreviewIndex, setBoardPreviewIndex] = useState<number | null>(null);
  const [sendingBoardBatch, setSendingBoardBatch] = useState(false);
  useEffect(() => {
    const next = boardImages.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setBoardImagePreviews(next);
    return () => {
      next.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [boardImages]);
  const [commentSavedToast, setCommentSavedToast] = useState<string | null>(null);
  const [commentErrorToast, setCommentErrorToast] = useState<string | null>(null);
  const [templateSavedToast, setTemplateSavedToast] = useState<string | null>(null);
  const [deploySavedToast, setDeploySavedToast] = useState<{
    message: string;
    details?: string;
    detailsHref?: string | null;
    detailLinks?: Array<{ label: string; href: string }>;
    actionLabel?: string;
  } | null>(null);
  const drivePublishFollowUpRef = useRef<(() => void) | null>(null);
  const [deployActionToast, setDeployActionToast] = useState<string | null>(null);
  const [imageExportModalOpen, setImageExportModalOpen] = useState(false);
  const [imageExportFormat, setImageExportFormat] = useState<ImageExportFormat>('png');
  const [imageExportBusy, setImageExportBusy] = useState(false);
  const [imageExportPreparing, setImageExportPreparing] = useState(false);
  const [imageExportError, setImageExportError] = useState<string | null>(null);
  const [imageExportSavedToast, setImageExportSavedToast] = useState<{ message: string; details: string } | null>(null);
  const [imageExportPreparedBlob, setImageExportPreparedBlob] = useState<{ format: ImageExportFormat; blob: Blob } | null>(null);
  const imageExportSnapshotDataUrlRef = useRef<string | null>(null);
  const imageExportSlideRef = useRef<number | null>(null);
  const imageExportPrepareIdRef = useRef(0);
  // TEMP: used by commented-out screenshot toolbar handler
  // const screenshotInFlightRef = useRef(false);
  // Optional `ttlMs` lets specific toasts override the default 2.2s
  // flash — used by the browser-print PDF fallback where the copy asks
  // the user to interact with the print dialog before it vanishes.
  // Comparing on message text was fragile across locale changes so the
  // duration is now attached to the state itself (SSOT: single source
  // of truth for how long the toast lives).
  const [exportToast, setExportToast] = useState<
    {
      message: string;
      tone: 'default' | 'success' | 'error' | 'loading';
      ttlMs?: number;
    } | null
  >(null);
  const [shareLinkFeedback, setShareLinkFeedback] = useState<'copied' | 'failed' | null>(null);
  const [shareGuideToast, setShareGuideToast] = useState<string | null>(null);
  const [selectedSideCommentIds, setSelectedSideCommentIds] = useState<Set<string>>(() => new Set());
  const [commentSidePanelCollapsed, setCommentSidePanelCollapsed] = useState(false);
  const [revisionHistoryOpen, setRevisionHistoryOpen] = useState(false);
  useEffect(() => {
    if (hideFileRevisionChrome) setRevisionHistoryOpen(false);
  }, [hideFileRevisionChrome]);
  const [revisionConflictToast, setRevisionConflictToast] = useState<string | null>(null);
  const [revisionDiskSyncToast, setRevisionDiskSyncToast] = useState<string | null>(null);
  const dismissRevisionConflictToast = useCallback(() => {
    revisionConflictSuppressedRef.current = true;
    setRevisionConflictToast(null);
  }, []);
  const dismissRevisionDiskSyncToast = useCallback(() => {
    setRevisionDiskSyncToast(null);
  }, []);
  const [revisionStackInvalidated, setRevisionStackInvalidated] = useState(false);
  const [revisionRetentionLimit, setRevisionRetentionLimit] = useState(FILE_REVISION_RETENTION_LIMIT_DEFAULT);
  const [revisionRetentionPending, setRevisionRetentionPending] = useState(false);
  const revisionStackInvalidatedRef = useRef(revisionStackInvalidated);
  revisionStackInvalidatedRef.current = revisionStackInvalidated;
  const [strokePoints, setStrokePoints] = useState<StrokePoint[]>([]);
  const previewStateKey = `${projectId}:${file.name}`;
  const previewScale = zoom / 100;
  const localCommentSideDockActive = commentPanelOpen && !commentPortalHost;
  const boardPreviewCanvasSize = commentPreviewCanvasSize(previewBodySize, {
    boardMode: localCommentSideDockActive,
    sidePanelCollapsed: commentSidePanelCollapsed,
    viewport: previewViewport,
  });
  const boardSideDockStacked = usesStackedCommentSideDock(previewBodySize, {
    boardMode: localCommentSideDockActive,
    sidePanelCollapsed: commentSidePanelCollapsed,
    viewport: previewViewport,
  });

  function deploymentMapForCurrentFile(items: WebDeploymentInfo[]) {
    const next: Partial<Record<WebDeployProviderId, WebDeploymentInfo>> = {};
    for (const option of DEPLOY_PROVIDER_OPTIONS) {
      const deploymentForProvider = items
        .filter((item) => item.fileName === file.name && item.providerId === option.id && item.url?.trim())
        .sort(compareDeploymentsByNewest)[0];
      if (deploymentForProvider) next[option.id] = deploymentForProvider;
    }
    return next;
  }

  function syncDeployFormFromConfig(
    providerId: WebDeployProviderId,
    config: WebDeployConfigResponse | null,
  ) {
    const matchingConfig = config?.providerId === providerId ? config : null;
    setDeployProviderId(providerId);
    setDeployConfig(matchingConfig);
    setDeployToken(matchingConfig?.tokenMask || '');
    setTeamId(matchingConfig?.teamId || '');
    setTeamSlug(matchingConfig?.teamSlug || '');
    setCloudflareAccountId(matchingConfig?.accountId || '');
    setCloudflareZoneId(matchingConfig?.cloudflarePages?.lastZoneId || '');
    setCloudflareDomainPrefix(matchingConfig?.cloudflarePages?.lastDomainPrefix || '');
  }

  function cloudflareConfigHintsFromForm() {
    const zone = cloudflareZones.find((item) => item.id === cloudflareZoneId);
    const hints = {
      ...(cloudflareZoneId.trim() ? { lastZoneId: cloudflareZoneId.trim() } : {}),
      ...((zone?.name || deployConfig?.cloudflarePages?.lastZoneName)
        ? { lastZoneName: zone?.name || deployConfig?.cloudflarePages?.lastZoneName }
        : {}),
      ...(cloudflareDomainPrefix.trim()
        ? { lastDomainPrefix: normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix) }
        : {}),
    };
    return Object.keys(hints).length > 0 ? hints : undefined;
  }

  function buildDeployConfigRequest(providerId: WebDeployProviderId): WebUpdateDeployConfigRequest {
    const token = deployToken.trim();
    if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) {
      return {
        providerId,
        token,
        accountId: cloudflareAccountId.trim(),
        cloudflarePages: cloudflareConfigHintsFromForm(),
      };
    }
    return {
      providerId,
      token,
      teamId: teamId.trim(),
      teamSlug: teamSlug.trim(),
    };
  }

  async function loadDeployProvider(
    providerId: WebDeployProviderId,
    options?: { fallbackToExisting?: boolean },
  ) {
    const requestSeq = ++deployProviderLoadSeqRef.current;
    setDeployProviderId(providerId);
    const deployments = await fetchProjectDeployments(projectId);
    const nextDeploymentsByProvider = deploymentMapForCurrentFile(deployments);
    const exactDeployment = nextDeploymentsByProvider[providerId] ?? null;
    const fallbackDeployment = options?.fallbackToExisting
      ? Object.values(nextDeploymentsByProvider)[0] ?? null
      : null;
    const currentDeployment = exactDeployment ?? fallbackDeployment;
    // Use the explicit providerId for config/form so a fallback deployment from
    // another provider only fills the existing-URL display, never the form/credentials.
    const config = await fetchDeployConfig(providerId);
    if (requestSeq !== deployProviderLoadSeqRef.current) {
      return { config: null, currentDeployment: null };
    }
    syncDeployFormFromConfig(providerId, config);
    setDeploymentsByProvider(nextDeploymentsByProvider);
    setDeployment(currentDeployment ?? null);
    setDeployResult(currentDeployment ?? null);
    if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID && config?.configured) {
      void loadCloudflareZones(config, { requestSeq });
    }
    return { config, currentDeployment };
  }

  async function loadCloudflareZones(
    config: WebDeployConfigResponse | null = deployConfig,
    options?: { requestSeq?: number },
  ) {
    if (!config?.configured || config.providerId !== CLOUDFLARE_PAGES_PROVIDER_ID) return;
    const requestSeq = options?.requestSeq ?? deployProviderLoadSeqRef.current;
    setCloudflareZonesLoading(true);
    setCloudflareZonesError(null);
    try {
      const response = await fetchCloudflarePagesZones();
      if (requestSeq !== deployProviderLoadSeqRef.current) return;
      const zones = response?.zones ?? [];
      setCloudflareZones(zones);
      const hintedZoneId = response?.cloudflarePages?.lastZoneId || config.cloudflarePages?.lastZoneId || '';
      const nextZoneId = hintedZoneId && zones.some((zone) => zone.id === hintedZoneId)
        ? hintedZoneId
        : zones[0]?.id || '';
      setCloudflareZoneId(nextZoneId);
      const hintedPrefix = response?.cloudflarePages?.lastDomainPrefix || config.cloudflarePages?.lastDomainPrefix || '';
      if (hintedPrefix) setCloudflareDomainPrefix(hintedPrefix);
    } catch (err) {
      if (requestSeq !== deployProviderLoadSeqRef.current) return;
      setCloudflareZones([]);
      setCloudflareZonesError(err instanceof Error ? err.message : t('fileViewer.cloudflareZonesLoadFailed'));
    } finally {
      if (requestSeq === deployProviderLoadSeqRef.current) setCloudflareZonesLoading(false);
    }
  }

  // Slide deck nav state: the iframe posts the active index + total count
  // back to the host every time a slide settles. Host renders prev/next
  // controls in the toolbar and reflects the count beside them.
  const [slideState, setSlideState] = useState<SlideState | null>(
    () => htmlPreviewSlideState.get(previewStateKey) ?? null,
  );
  const boardPreviewScaleOptions = localCommentSideDockActive ? { canvasPadding: 0 } : undefined;
  const overlayPreviewScale = effectivePreviewScale(
    previewViewport,
    previewScale,
    boardPreviewCanvasSize,
    boardPreviewScaleOptions,
  );
  const overlayPreviewTransform: PreviewOverlayTransform = {
    scale: overlayPreviewScale,
    offsetX: 0,
    offsetY: 0,
  };
  const shareRef = useRef<HTMLDivElement | null>(null);
  const [chromeActionsHost, setChromeActionsHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    setChromeActionsHost(resolveChromeActionsHost());
  }, []);

  useEffect(() => {
    liveCommentTargetsRef.current = liveCommentTargets;
  }, [liveCommentTargets]);

  // Live stream apply — must NOT share deps with disk fetch. Every liveHtml
  // token used to cancel the 280ms disk debounce, so fallthrough never ran.
  useEffect(() => {
    const artifactIdentity = `${projectId}\0${file.name}`;
    if (lastStablePreviewIdentityRef.current !== artifactIdentity) {
      lastStablePreviewIdentityRef.current = artifactIdentity;
      const cachedPreview = readCachedPreviewSource(projectId, file.name);
      lastStablePreviewSourceRef.current = cachedPreview;
      manualEditPinnedSourceRef.current = null;
      if (cachedPreview) {
        setSource(cachedPreview);
        sourceRef.current = cachedPreview;
        exportHtmlSnapshotGateRef.current = cachedPreview;
      } else {
        sourceRef.current = null;
        exportHtmlSnapshotGateRef.current = null;
        setSource(null);
      }
      setLiveHtmlPaintsPreview(false);
      setSourceLoadFailed(false);
      if (previewSourceWallTimerRef.current != null) {
        clearTimeout(previewSourceWallTimerRef.current);
        previewSourceWallTimerRef.current = null;
      }
      previewSourceWallIdentityRef.current = null;
      previewSourceRetryUntilRef.current = null;
    }

    if (liveHtml === undefined) {
      setLiveHtmlPaintsPreview(false);
      return;
    }

    const sourceFileKey = `${artifactIdentity}\0live`;
    sourceFileKeyRef.current = sourceFileKey;
    const accepted = acceptPreviewHtmlCandidate(liveHtml, lastStablePreviewSourceRef);
    if (accepted != null) {
      // A lagging parent liveHtml token must not clobber a just-saved pin
      // (S3/lazy race + ProjectView still holding the pre-edit buffer).
      const tipContent = tipContentForManualEditSavePin(
        revisionStackRef.current,
        getActiveRevisionSequence(projectId, file.name),
        (revisionId) => getRevisionContentCache(projectId, file.name, revisionId),
      );
      // Tip≠pin paints tip even when liveHtml is still the pre-tip buffer.
      const resolvedLive = resolveManualEditSourceAgainstPinAndTip({
        pinned: manualEditPinnedSourceRef.current,
        candidate: accepted,
        tipContent,
        // Do not prefer tip over streaming live when pin is inactive.
        preferTipWhenCandidateLags: false,
      });
      if (resolvedLive.clearPin) {
        manualEditPinnedSourceRef.current = null;
      }
      const nextSource = resolvedLive.source ?? accepted;
      // Keep the pin after a matching fetch — a later stale GET in the same
      // session must still lose to history-confirm / prefer-pin.
      const contentUnchanged = sourceRef.current === nextSource;
      if (!contentUnchanged) {
        setSource(nextSource);
        sourceRef.current = nextSource;
        lastStablePreviewSourceRef.current = nextSource;
        exportHtmlSnapshotGateRef.current = nextSource;
        rememberStablePreviewSource(projectId, file.name, nextSource);
      } else {
        if (lastStablePreviewSourceRef.current !== nextSource) {
          lastStablePreviewSourceRef.current = nextSource;
        }
        if (exportHtmlSnapshotGateRef.current !== nextSource) {
          exportHtmlSnapshotGateRef.current = nextSource;
        }
      }
      // Tip yield only — do NOT remount freeze on ordinary liveHtml tokens
      // (that would defeat entry freeze + od-edit-preview-style).
      if (
        resolvedLive.clearPin
        && shouldSyncManualEditFrozenSourceToPainted(
          manualEditModeRef.current,
          manualEditFrozenSourceRef.current,
          nextSource,
        )
      ) {
        setManualEditFrozenSource(nextSource);
        scheduleManualEditSelectionEchoAfterFreezeSync();
      }
      setSourceLoadFailed(false);
      setLiveHtmlPaintsPreview(true);
      if (previewSourceWallTimerRef.current != null) {
        clearTimeout(previewSourceWallTimerRef.current);
        previewSourceWallTimerRef.current = null;
      }
      return;
    }
    // Unstable live stream with no prior stable frame: fall through to disk
    // fetch so re-entry / auth-slow tabs are not stuck on "loading…".
    setLiveHtmlPaintsPreview(false);
  }, [liveHtml, projectId, file.name]);

  // Streaming owns the empty-state veil — never leave a sticky "unavailable"
  // from a mid-stream incomplete disk read.
  useEffect(() => {
    if (streaming) setSourceLoadFailed(false);
  }, [streaming]);

  // Disk / raw fetch — independent of liveHtml token identity.
  // While streaming, a stable live paint can skip disk. After stream ends,
  // always allow disk so turn-end scrubbed HTML can replace a stale live frame.
  //
  // Do NOT depend on `liveHtmlPaintsPreview`: incomplete→stable token flicker
  // during a stream would abort+restart `/raw/?cacheBust=…` in a tight loop.
  // Read the ref at schedule time; `streaming` / `hasLiveHtml` still re-enter
  // when the stream starts or ends.
  useEffect(() => {
    if (streaming && hasLiveHtml && liveHtmlPaintsPreviewRef.current) return;

    const artifactIdentity = `${projectId}\0${file.name}`;
    if (lastStablePreviewIdentityRef.current !== artifactIdentity) {
      lastStablePreviewIdentityRef.current = artifactIdentity;
      const cachedPreview = readCachedPreviewSource(projectId, file.name);
      lastStablePreviewSourceRef.current = cachedPreview;
      manualEditPinnedSourceRef.current = null;
      if (cachedPreview) {
        setSource(cachedPreview);
        sourceRef.current = cachedPreview;
        exportHtmlSnapshotGateRef.current = cachedPreview;
      } else {
        sourceRef.current = null;
        exportHtmlSnapshotGateRef.current = null;
        setSource(null);
      }
      setLiveHtmlPaintsPreview(false);
      setSourceLoadFailed(false);
      if (previewSourceWallTimerRef.current != null) {
        clearTimeout(previewSourceWallTimerRef.current);
        previewSourceWallTimerRef.current = null;
      }
      previewSourceWallIdentityRef.current = null;
      previewSourceRetryUntilRef.current = null;
    }
    const sourceFileKey = `${artifactIdentity}\0raw`;
    const fileChanged = sourceFileKeyRef.current !== sourceFileKey;
    sourceFileKeyRef.current = sourceFileKey;
    if (fileChanged) {
      setSourceLoadFailed(false);
      const stable = lastStablePreviewSourceRef.current;
      if (stable) {
        // live→raw hold: skip setSource when already painting stable.
        if (sourceRef.current !== stable) {
          setSource(stable);
          sourceRef.current = stable;
        }
        exportHtmlSnapshotGateRef.current = stable;
      } else {
        setSource(null);
        sourceRef.current = null;
        exportHtmlSnapshotGateRef.current = null;
      }
    }

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let softRetryTimer: ReturnType<typeof setTimeout> | null = null;
    const requestGeneration = ++previewSourceFetchGenerationRef.current;
    const abort = new AbortController();
    if (previewSourceRetryUntilRef.current?.identity !== artifactIdentity) {
      previewSourceRetryUntilRef.current = {
        identity: artifactIdentity,
        until: Date.now() + HTML_PREVIEW_SOURCE_WALL_MS,
      };
    }
    const retryUntil = previewSourceRetryUntilRef.current.until;
    let nextSoftRetryDelay = HTML_PREVIEW_SOURCE_FIRST_RETRY_MS;
    let softRetryCount = 0;

    const clearPreviewSourceWall = () => {
      if (previewSourceWallTimerRef.current != null) {
        clearTimeout(previewSourceWallTimerRef.current);
        previewSourceWallTimerRef.current = null;
      }
    };

    const armPreviewSourceWall = () => {
      if (previewSourceWallIdentityRef.current !== artifactIdentity) {
        clearPreviewSourceWall();
        previewSourceWallIdentityRef.current = artifactIdentity;
      }
      // Re-arm after soft-retry / late incomplete responses so wall→clear→loading
      // cannot stick forever. Do not skip arming purely because `streaming` is
      // true — re-entry often sets streaming while disk/auth is still catching up.
      if (sourceRef.current != null || previewSourceWallTimerRef.current != null) {
        return;
      }
      previewSourceWallTimerRef.current = setTimeout(() => {
        previewSourceWallTimerRef.current = null;
        if (sourceRef.current != null) return;
        // Live stream owns the empty-state veil only while stable live HTML paints.
        if (streamingRef.current && liveHtmlPaintsPreviewRef.current) return;
        setSourceLoadFailed(true);
      }, HTML_PREVIEW_SOURCE_WALL_MS);
    };

    armPreviewSourceWall();

    const runFetch = () => {
      // Cache-bust the fetch on every mtime / reload / files-refresh bump.
      // Without this, an agent edit during Comment mode (srcDoc path) gets
      // stale HTML from the browser HTTP cache — the source state ends up
      // identical to the previous value, srcDoc is byte-equal to the last
      // activated HTML, canActivateSrcDocTransport bails on the dedupe
      // check, and the preview only refreshes when Comment closes and the
      // url-load iframe takes over with its own ?v=mtime cache-bust.
      // Clear sticky unavailable for this attempt so refresh shows loading.
      if (sourceRef.current != null || Date.now() < retryUntil) {
        setSourceLoadFailed(false);
      }
      const scheduleSoftRetry = () => {
        if (Date.now() >= retryUntil) {
          armPreviewSourceWall();
          return false;
        }
        if (softRetryCount >= HTML_PREVIEW_SOURCE_MAX_SOFT_RETRIES) {
          armPreviewSourceWall();
          return false;
        }
        if (streamingRef.current && liveHtmlPaintsPreviewRef.current) {
          return false;
        }
        setSourceLoadFailed(false);
        armPreviewSourceWall();
        softRetryCount += 1;
        const delay = nextSoftRetryDelay;
        nextSoftRetryDelay = Math.min(
          nextSoftRetryDelay * 2,
          HTML_PREVIEW_SOURCE_RETRY_MAX_MS,
        );
        softRetryTimer = setTimeout(runFetch, delay);
        return true;
      };
      void fetchProjectFileText(projectId, file.name, {
        cacheBustKey: `${file.mtime}-${reloadKey}-${filesRefreshKey}-${embedAuthRecoveryNonce}`,
        signal: abort.signal,
      }).then(async (rawText) => {
        if (cancelled || abort.signal.aborted) return;
        if (requestGeneration !== previewSourceFetchGenerationRef.current) return;
        let text = rawText;
        // Authoritative tip HTML resolved for the active cursor (cold-cache path).
        let activeTipResolvedHtml: string | null = null;
        // Prefer the revision snapshot for the active cursor when raw GET lags
        // scratch/S3 — including remount after undo/restore while filesRefreshKey
        // is unchanged. If the in-memory stack has not refreshed yet, list once.
        if (text != null) {
          const activeSeq = getActiveRevisionSequence(projectId, file.name);
          if (activeSeq != null) {
            let revisionForActive = revisionStackRef.current.revisions.find(
              (revision) => revision.sequence === activeSeq,
            );
            if (!revisionForActive) {
              // Soft-retry storms share one list for (file, activeSeq).
              const list = await listProjectFileRevisionsSoftCached(
                projectId,
                file.name,
                activeSeq,
              );
              revisionForActive = list?.revisions?.find(
                (revision) => revision.sequence === activeSeq,
              );
            }
            if (revisionForActive) {
              const authoritative =
                getRevisionContentCache(projectId, file.name, revisionForActive.id)
                ?? await resolveRevisionSnapshotContent(revisionForActive.id);
              if (authoritative != null) {
                if (authoritative !== text) text = authoritative;
                // Cold tip cache: snapshot/cache resolve IS tip content for pin yield.
                activeTipResolvedHtml = authoritative;
              }
            }
          }
        }
        // Manual-edit POST succeeded but GET may still return null/stale S3
        // for a few seconds — keep the pinned saved buffer instead of
        // painting the pre-edit lastStable frame (looks like "edit didn't save").
        // When tip cache already equals fetch and differs from pin, release pin
        // so agent tips paint (preferManualEditPinnedSource tipContent yield).
        // Cold tip cache: snapshot/cache resolve IS tip content for pin yield.
        const tipContent = tipContentForManualEditSavePin(
          revisionStackRef.current,
          getActiveRevisionSequence(projectId, file.name),
          (revisionId) => getRevisionContentCache(projectId, file.name, revisionId),
          activeTipResolvedHtml,
        );
        const resolvedDisk = resolveManualEditSourceAgainstPinAndTip({
          pinned: manualEditPinnedSourceRef.current,
          candidate: text,
          tipContent,
          // Disk: active tip cache wins over lagging GET / missing stack tip.
          // Confirm-refuse suppress: do not re-paint stale warm tip over adopted disk.
          preferTipWhenCandidateLags: shouldPreferTipWhenCandidateLags({
            diskPath: true,
            suppressUntilRefresh: manualEditSuppressTipPreferUntilRefreshRef.current,
          }),
        });
        if (resolvedDisk.clearPin) {
          manualEditPinnedSourceRef.current = null;
        }
        // Tip yield / pin prefer — paint before edit-mode disk hold.
        // Unstable tip must not early-paint over a retryable incomplete GET.
        if (resolvedDisk.source != null) {
          const repairedTipOrPin = repairArtifactDocumentHeadIfNeeded(resolvedDisk.source);
          const tipOrPinStable = isArtifactHtmlStableForPreview(repairedTipOrPin)
            && !(
              DECK_SLIDE_MARKUP_RE.test(resolvedDisk.source)
              && !hasSalvageableDeckSlideContent(repairedTipOrPin)
            );
          if (shouldEarlyPaintResolvedPinTipSource({
            resolved: resolvedDisk,
            candidate: text,
            tipOrPinStable,
          })) {
            // Route tip/pin through accept so lastStable stays consistent even
            // when sourceRef already equals paint (stale lastStable / race).
            const acceptedPaint = acceptPreviewHtmlCandidate(
              repairedTipOrPin,
              lastStablePreviewSourceRef,
            );
            if (acceptedKeepsEarlyPaintTipOrPin(repairedTipOrPin, acceptedPaint)) {
              const paintSource = acceptedPaint;
              if (sourceRef.current !== paintSource) {
                setSource(paintSource);
                sourceRef.current = paintSource;
                exportHtmlSnapshotGateRef.current = paintSource;
                rememberStablePreviewSource(projectId, file.name, paintSource);
              } else if (exportHtmlSnapshotGateRef.current !== paintSource) {
                exportHtmlSnapshotGateRef.current = paintSource;
              }
              // Tip yield while editing must remount freeze — preview paints freeze.
              if (shouldSyncManualEditFrozenSourceToPainted(
                manualEditModeRef.current,
                manualEditFrozenSourceRef.current,
                paintSource,
              )) {
                setManualEditFrozenSource(paintSource);
                scheduleManualEditSelectionEchoAfterFreezeSync();
              }
              clearPreviewSourceWall();
              setSourceLoadFailed(false);
              return;
            }
            // Accept fell back — soft-retry before edit-mode hold so incomplete
            // tip/GET can recover (hold would otherwise skip scheduleSoftRetry).
            if (scheduleSoftRetry()) return;
          }
        }
        if (shouldHoldDiskPreviewDuringManualEdit(
          manualEditModeRef.current,
          manualEditFrozenSourceRef.current,
        )) {
          clearPreviewSourceWall();
          setSourceLoadFailed(false);
          return;
        }
        // Chokidar emits agent rewrites as unlink+add+change bursts; a
        // transient null mid-burst would blank source → srcDoc empty →
        // shell stays on prior frame. Keep the last good text instead.
        if (text == null) {
          if (lastStablePreviewSourceRef.current) {
            const stable = lastStablePreviewSourceRef.current;
            if (sourceRef.current !== stable) {
              setSource(stable);
              sourceRef.current = stable;
            }
            clearPreviewSourceWall();
            setSourceLoadFailed(false);
            return;
          }
          // Auth blip / S3-read lag / unlink+add race: keep retrying for a
          // bounded window. Canvas→Slide often opens the persisted file before
          // registry/S3 read-after-write has settled; a single 400ms retry
          // was too brittle and surfaced "preview unavailable" even though the
          // deck arrived seconds later.
          if (scheduleSoftRetry()) return;
          armPreviewSourceWall();
          return;
        }
        const accepted = acceptPreviewHtmlCandidate(text, lastStablePreviewSourceRef);
        if (accepted == null) {
          // Incomplete/leaky disk with no stable frame. Retry briefly after
          // stream (turn-end scrub / S3 sync race), then wall escalates.
          // Do NOT flip unavailable here.
          if (scheduleSoftRetry()) return;
          armPreviewSourceWall();
          return;
        }
        if (sourceRef.current !== accepted) {
          setSource(accepted);
          sourceRef.current = accepted;
          lastStablePreviewSourceRef.current = accepted;
          exportHtmlSnapshotGateRef.current = accepted;
          rememberStablePreviewSource(projectId, file.name, accepted);
        }
        setSourceLoadFailed(false);
        clearPreviewSourceWall();
      });
    };

    // Debounce refresh-key churn so soft-sticky auth recovery can finish a
    // raw GET before the next files poll aborts it (sticky loading). Keep
    // ≤ ProjectView coalesce maxWait (250) so write storms cannot starve.
    debounceTimer = setTimeout(runFetch, HTML_PREVIEW_DISK_FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      abort.abort();
      if (debounceTimer != null) clearTimeout(debounceTimer);
      if (softRetryTimer != null) clearTimeout(softRetryTimer);
      // Intentionally leave previewSourceWallTimerRef armed across refresh churn.
    };
  }, [
    hasLiveHtml,
    streaming,
    projectId,
    file.name,
    file.mtime,
    reloadKey,
    filesRefreshKey,
    embedAuthRecoveryNonce,
  ]);

  useEffect(() => () => {
    if (previewSourceWallTimerRef.current != null) {
      clearTimeout(previewSourceWallTimerRef.current);
      previewSourceWallTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDeployResult(null);
    setDeployError(null);
    setCopiedDeployLink(null);
    setDeployPhase('idle');
    void fetchProjectDeployments(projectId).then((items) => {
      if (cancelled) return;
      const nextDeploymentsByProvider = deploymentMapForCurrentFile(items);
      const current = nextDeploymentsByProvider[deployProviderId] ?? null;
      setDeploymentsByProvider(nextDeploymentsByProvider);
      setDeployment(current ?? null);
      setDeployResult(current ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, deployProviderId]);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    // Passive recovery may dispatch session(forceEvent) + recovered together;
    // explicit 「다시 시도」 (useTeamverEmbed) often fires only forceEvent while
    // the memory flag stayed true — still must remint preview scopes.
    let coalesceScheduled = false;
    const bump = () => {
      if (coalesceScheduled) return;
      coalesceScheduled = true;
      queueMicrotask(() => {
        coalesceScheduled = false;
        setEmbedAuthRecoveryNonce((value) => value + 1);
      });
    };
    window.addEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, bump);
    const unsubscribe = subscribeTeamverEmbedSessionChanged(({ authenticated }) => {
      // Includes forceEvent reaffirm while already authenticated.
      if (authenticated) bump();
    });
    return () => {
      window.removeEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, bump);
      unsubscribe();
    };
  }, []);

  // Detect deck-shaped HTML even when the project's skill didn't declare
  // `mode: deck`. Freeform projects often produce a deck because the user
  // asked for one in plain prose; without this, prev/next and Present
  // never surface and the deck becomes a static, unnavigable preview.
  const looksLikeDeck = useMemo(() => {
    if (!source) return false;
    return (
      /\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(source)
      || /<section[^>]*\bclass\s*=\s*['"]slide['"]/i.test(source)
    );
  }, [source]);
  const effectiveDeck = isDeck || looksLikeDeck;
  const rawLivePreviewSource = inlinedSource ?? source;
  const livePreviewSource = useMemo(() => {
    if (!rawLivePreviewSource) return rawLivePreviewSource;
    const healPaths = Array.from(
      new Set([
        ...(projectFilePaths ?? []).map((path) => String(path || '').trim()).filter(Boolean),
        ...(preferredAttachmentPaths ?? [])
          .map((path) => String(path || '').trim())
          .filter(Boolean),
      ]),
    );
    if (healPaths.length === 0) return rawLivePreviewSource;
    return rewriteAttachmentImageSrcs(rawLivePreviewSource, healPaths, {
      preferredPaths: preferredAttachmentPaths,
    });
  }, [preferredAttachmentPaths, projectFilePaths, rawLivePreviewSource]);
  const attachmentImageSrcRewritten = Boolean(
    rawLivePreviewSource
    && livePreviewSource
    && rawLivePreviewSource !== livePreviewSource,
  );
  // Freeze the iframe input on the snapshot taken at Edit-mode entry. Any
  // source rewrite during edit (1.5s debounced set-style patches) stays
  // invisible to the iframe — live updates flow through od-edit-preview-style
  // postMessage instead, so the canvas never has to reload.
  useEffect(() => {
    if (manualEditMode && manualEditFrozenSource === null) {
      // Prefer sourceRef (includes a just-pinned save) over a lagging
      // livePreviewSource token so re-enter freezes the edited HTML.
      const snap = sourceRef.current ?? livePreviewSource;
      if (snap != null) setManualEditFrozenSource(snap);
    }
  }, [manualEditMode, manualEditFrozenSource, livePreviewSource]);
  const previewSource = (manualEditMode && manualEditFrozenSource !== null)
    ? manualEditFrozenSource
    : livePreviewSource;
  const compactApiStackedDeck = useMemo(
    () => (previewSource != null && looksLikeCompactApiStackedDeckForPreview(previewSource)),
    [previewSource],
  );
  compactApiStackedDeckRef.current = compactApiStackedDeck;
  const frameworkDeckPreview = useMemo(
    () => (previewSource != null && /\bid\s*=\s*["']deck-stage["']/i.test(previewSource)),
    [previewSource],
  );
  const needsDeckHostViewportFit = compactApiStackedDeck || frameworkDeckPreview;
  // Once this artifact has been classified as a fixed-stage deck, keep the
  // host-viewport listener armed even if `previewSource` briefly goes null
  // during refresh/auth races — otherwise chaseFirstLayout requests are dropped
  // and the preview freezes on a black letterbox until toolbar refresh.
  const deckHostViewportFitIdentityRef = useRef(`${projectId}\0${file.name}`);
  const needsDeckHostViewportFitStickyRef = useRef(false);
  {
    const fitIdentity = `${projectId}\0${file.name}`;
    if (deckHostViewportFitIdentityRef.current !== fitIdentity) {
      deckHostViewportFitIdentityRef.current = fitIdentity;
      needsDeckHostViewportFitStickyRef.current = false;
    }
    if (needsDeckHostViewportFit) needsDeckHostViewportFitStickyRef.current = true;
  }
  const deckHostViewportFitActive =
    needsDeckHostViewportFit || needsDeckHostViewportFitStickyRef.current;
  const deckPreviewUsesFixedStage = compactApiStackedDeck;
  // Host toolbar zoom is CSS transform-only. Posting overlayPreviewScale into the
  // deck bridge refits slide layout (vw/vh, letterbox math) and makes elements
  // appear to resize with zoom — apply to compact + framework decks alike.
  // Use sticky-active so a brief null `previewSource` does not flip options to
  // non-layoutBox and strand an already-mounted compact deck.
  const deckPreviewFitScale = deckHostViewportFitActive ? 1 : overlayPreviewScale;
  const deckPreviewPanActive = deckPreviewUsesFixedStage
    && mode === 'preview'
    && !drawOverlayOpen
    && !boardMode
    && !manualEditMode
    && !inspectMode
    && !slideOnlyMvp;
  const deckPreviewFitOptions = useMemo(
    () => (deckHostViewportFitActive
      ? {
        ...FIXED_STAGE_DECK_FIT_OPTIONS,
        onAfterNudge: () => {
          tipRemasureOnDeckNudgeRef.current();
        },
      }
      : undefined),
    [deckHostViewportFitActive],
  );
  const onDeckPreviewWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!deckPreviewPanActive) return;
    const frame = iframeRef.current;
    if (!frame) return;
    postDeckPreviewPanBy(frame, e.deltaX, e.deltaY);
    e.preventDefault();
  }, [deckPreviewPanActive]);
  const onDeckPreviewPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!deckPreviewPanActive) return;
    const wantsPan = e.button === 1 || (e.button === 0 && (previewScale !== 1 || e.shiftKey));
    if (!wantsPan) return;
    deckPanDragRef.current = {
      active: true,
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    setDeckPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [deckPreviewPanActive, previewScale]);
  const onDeckPreviewPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = deckPanDragRef.current;
    if (!deckPreviewPanActive || !drag.active || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    if (!dx && !dy) return;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    const frame = iframeRef.current;
    if (frame) postDeckPreviewPanBy(frame, dx, dy);
    e.preventDefault();
  }, [deckPreviewPanActive]);
  const onDeckPreviewPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = deckPanDragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    drag.active = false;
    drag.pointerId = null;
    setDeckPanning(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer may already be released.
    }
  }, []);
  const [redirectLoopBlocked, setRedirectLoopBlocked] = useState(false);
  useEffect(() => {
    setRedirectLoopBlocked(false);
  }, [file.name, previewSource, reloadKey]);
  const manualEditPageStylesEnabled = typeof source === 'string' && isManualEditFullHtmlDocument(source);
  const urlModeBridge = hasUrlModeBridge(source);
  const manualEditRequiresSrcDoc = manualEditSrcDocActive && !urlModeBridge;
  // When we URL-load the iframe directly, skip every in-host inlining /
  // srcDoc-rebuilding step. The browser does the asset resolution itself,
  // which is the whole point of the URL-load path.
  // Auto-fall back to the srcDoc path when the artifact will crash under
  // the URL-load iframe's bare `sandbox="allow-scripts"` — Babel-standalone
  // React prototypes and any HTML that reads Web Storage at mount throw
  // SecurityError without `allow-same-origin`. The srcDoc path runs
  // `injectSandboxShim` before any user script, so those artifacts render.
  // Memoized on `source` so HtmlViewer's frequent re-renders (board/inspect/
  // edit mode toggles, slide nav) don't re-scan the HTML each time.
  const needsSandboxShim = useMemo(
    () => source != null && htmlNeedsSandboxShim(source),
    [source],
  );
  const needsFocusGuard = useMemo(
    () => source != null && htmlNeedsFocusGuard(source),
    [source],
  );
  const needsRedirectGuard = useMemo(
    () => source != null && htmlNeedsRedirectGuard(source),
    [source],
  );
  const [urlSelectionBridgeReady, setUrlSelectionBridgeReady] = useState(false);
  const [embedPreviewPrefix, setEmbedPreviewPrefix] = useState<string | null>(() =>
    peekTeamverProjectPreviewPrefix(projectId),
  );
  // Hold srcDoc until the scoped prefix settle finishes. Painting without a
  // base then updating srcDoc in place on the same iframe node interrupts the
  // compact deck host-viewport handshake — black letterbox with a working 1/N
  // counter until toolbar refresh. Seed settled=true when a cached prefix already exists
  // so remounting the deck tab after an image/other file does not flash empty.
  // Never "fail-open" settled=true with a null prefix: srcDoc still requires a
  // real base, and that dead state left a permanent blank canvas until manual remount.
  const [embedPreviewPrefixSettled, setEmbedPreviewPrefixSettled] = useState(
    () => !isTeamverEmbedMode() || peekTeamverProjectPreviewPrefix(projectId) != null,
  );
  const teamverEmbedPreviewMode = isTeamverEmbedMode();
  const embedPreviewIdentityRef = useRef<string | null>(null);
  // Edge-trigger remint: sticky `nonce > 0` used to invalidate+hold on every
  // file switch after the first recovery, killing cached peek paint.
  const lastProcessedAuthRecoveryNonceRef = useRef(0);
  useEffect(() => {
    if (!teamverEmbedPreviewMode) {
      setEmbedPreviewPrefix(null);
      setEmbedPreviewPrefixSettled(true);
      embedPreviewIdentityRef.current = null;
      return;
    }
    let cancelled = false;
    let backgroundRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let fastRetryDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let settleFastRetryDelay: (() => void) | null = null;
    const identity = `${projectId}\0${file.name}`;
    const identityChanged = embedPreviewIdentityRef.current !== identity;
    embedPreviewIdentityRef.current = identity;
    const authRemintRequested =
      embedAuthRecoveryNonce > lastProcessedAuthRecoveryNonceRef.current;
    if (authRemintRequested) {
      lastProcessedAuthRecoveryNonceRef.current = embedAuthRecoveryNonce;
    }
    // First paint / file switch: hold empty srcDoc only when no cached prefix.
    // Cached peek lets image→deck tab switches paint immediately.
    // Auth recovery (nonce edge) must remint scopes so relative assets do not
    // resolve against a stale/unauthorized prefix.
    if (authRemintRequested) {
      invalidateTeamverProjectPreviewPrefix(projectId);
      // Auth recovery must hold empty srcDoc (no relative-asset paint against a
      // stale/unauthorized prefix) until a fresh mint settles.
      setEmbedPreviewPrefix(null);
      setEmbedPreviewPrefixSettled(false);
    } else {
      // Valid cache: paint immediately and skip the retry/mint loop entirely.
      const peeked = peekTeamverProjectPreviewPrefix(projectId);
      if (peeked) {
        setEmbedPreviewPrefix(peeked);
        setEmbedPreviewPrefixSettled(true);
        return;
      }
    }
    if (identityChanged || authRemintRequested) {
      setEmbedPreviewPrefix(null);
      setEmbedPreviewPrefixSettled(false);
    }
    const retryDelaysMs = [0, 400, 1_200] as const;
    // Do NOT fail-open after attempt 0 — painting relative refs/drive|assets|
    // uploads imgs without <base href> leaves broken-image + alt text until
    // remount (or forever if mint never recovers). Hold empty srcDoc until a
    // real prefix arrives; keep soft background remint after the fast window.
    const adoptPrefix = (resolved: string) => {
      if (cancelled) return;
      setEmbedPreviewPrefix(resolved);
      setEmbedPreviewPrefixSettled(true);
    };
    const mintOnce = async (): Promise<string | null> => {
      const peeked = peekTeamverProjectPreviewPrefix(projectId);
      if (peeked) return peeked;
      const abort = new AbortController();
      const mintAbortTimer = window.setTimeout(() => abort.abort(), 8_000);
      try {
        return await resolveTeamverProjectPreviewPrefix(projectId, file.name, {
          signal: abort.signal,
        });
      } finally {
        window.clearTimeout(mintAbortTimer);
      }
    };
    const scheduleBackgroundRemint = (delayMs: number) => {
      backgroundRetryTimer = setTimeout(() => {
        backgroundRetryTimer = null;
        if (cancelled) return;
        void (async () => {
          const resolved = await mintOnce();
          if (cancelled) return;
          if (resolved) {
            adoptPrefix(resolved);
            return;
          }
          scheduleBackgroundRemint(Math.min(Math.round(delayMs * 1.5), 15_000));
        })();
      }, delayMs);
    };
    void (async () => {
      for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
        if (cancelled) return;
        const delay = retryDelaysMs[attempt] ?? 0;
        if (delay > 0) {
          await new Promise<void>((settle) => {
            settleFastRetryDelay = settle;
            fastRetryDelayTimer = setTimeout(() => {
              fastRetryDelayTimer = null;
              settleFastRetryDelay = null;
              settle();
            }, delay);
          });
          settleFastRetryDelay = null;
          if (cancelled) return;
          // Do not invalidate between attempts — that forced up to 3 preview-url
          // mints. resolveTeamverProjectPreviewPrefix already reuses cache/inflight.
        }
        const resolved = await mintOnce();
        if (cancelled) return;
        if (resolved) {
          adoptPrefix(resolved);
          return;
        }
      }
      if (cancelled) return;
      // Stay unsettled — never paint without a scoped base. Soft remint picks
      // up late auth recovery / warm batch seeds without toolbar refresh.
      setEmbedPreviewPrefix(null);
      setEmbedPreviewPrefixSettled(false);
      scheduleBackgroundRemint(2_500);
    })();
    return () => {
      cancelled = true;
      if (backgroundRetryTimer != null) clearTimeout(backgroundRetryTimer);
      if (fastRetryDelayTimer != null) {
        clearTimeout(fastRetryDelayTimer);
        fastRetryDelayTimer = null;
      }
      settleFastRetryDelay?.();
    };
  }, [embedAuthRecoveryNonce, file.name, projectId, teamverEmbedPreviewMode]);
  const embedPreviewAwaitingPrefix = isEmbedPreviewAwaitingScopedPrefix({
    teamverEmbedMode: teamverEmbedPreviewMode,
    hasSource: source != null,
    embedPreviewPrefix,
    embedPreviewPrefixSettled,
  });
  const useUrlLoadPreview = shouldUrlLoadHtmlPreview({
    mode,
    isDeck: effectiveDeck,
    commentMode: boardMode,
    urlCommentBridge: urlSelectionBridgeReady,
    editMode: manualEditMode,
    urlModeBridge,
    inspectMode,
    drawMode: drawOverlayOpen,
    forceInline: forceInline || needsSandboxShim,
    needsFocusGuard,
    needsRedirectGuard,
    // Tweaks template needs the srcDoc bridge so the toolbar toggle can arm.
    tweaksBridge: hasTweaksTemplate(source),
  }) && !manualEditRequiresSrcDoc
    && (!teamverEmbedPreviewMode || embedPreviewPrefix != null)
    // Wrong local-upload src only heals in the srcDoc path; URL-load serves
    // disk HTML verbatim and would keep showing alt-only broken images.
    && !attachmentImageSrcRewritten;
  const projectPreviewAssetUrl = useCallback(
    (filePath: string) => resolveHtmlPreviewAssetUrl({
      teamverEmbedMode: teamverEmbedPreviewMode,
      embedPreviewPrefix,
      rawUrl: projectRawUrl(projectId, filePath),
      scopedUrl: embedPreviewPrefix
        ? projectScopedPreviewUrl(embedPreviewPrefix, filePath)
        : null,
    }),
    [embedPreviewPrefix, projectId, teamverEmbedPreviewMode],
  );
  // srcDoc `<base href>` — never inject about:blank while the Teamver
  // preview prefix is still resolving (first paint would strand relative
  // assets until the user hits toolbar refresh / remount).
  const srcDocBaseHref = useMemo(
    () => resolveHtmlPreviewSrcDocBaseHref({
      teamverEmbedMode: teamverEmbedPreviewMode,
      embedPreviewPrefix,
      rawUrl: projectRawUrl(projectId, baseDirFor(file.name)),
      scopedUrl: embedPreviewPrefix
        ? projectScopedPreviewUrl(embedPreviewPrefix, baseDirFor(file.name))
        : null,
    }),
    [embedPreviewPrefix, file.name, projectId, teamverEmbedPreviewMode],
  );
  const basePreviewSrcUrl = useMemo(
    () => `${projectPreviewAssetUrl(file.name)}?v=${Math.round(file.mtime)}&r=${reloadKey}&odPreviewBridge=scroll&odPreviewBridge=selection&odPreviewBridge=snapshot`,
    [projectPreviewAssetUrl, file.name, file.mtime, reloadKey],
  );
  const [previewSrcUrl, setPreviewSrcUrl] = useState(basePreviewSrcUrl);
  const activePreviewSrcUrl = (
    previewSrcUrl === basePreviewSrcUrl ||
    previewSrcUrl.startsWith(`${basePreviewSrcUrl}&`)
  )
    ? previewSrcUrl
    : basePreviewSrcUrl;
  useEffect(() => {
    setPreviewSrcUrl(basePreviewSrcUrl);
    setUrlSelectionBridgeReady(false);
  }, [basePreviewSrcUrl]);
  useEffect(() => {
    iframeRef.current = useUrlLoadPreview ? urlPreviewIframeRef.current : srcDocPreviewIframeRef.current;
  }, [useUrlLoadPreview]);

  useEffect(() => {
    if (filesRefreshKey === 0) return;
    const nextSrc = `${basePreviewSrcUrl}&fr=${filesRefreshKey}`;
    const timeout = window.setTimeout(() => {
      if (useUrlLoadPreview && urlPreviewIframeRef.current?.contentWindow) {
        urlPreviewIframeRef.current.contentWindow.location.replace(nextSrc);
      } else {
        setPreviewSrcUrl(nextSrc);
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [basePreviewSrcUrl, filesRefreshKey, useUrlLoadPreview]);

  useEffect(() => {
    setInlinedSource(null);
    if (useUrlLoadPreview) return;
    if (!source) return;
    if (effectiveDeck) {
      // Decks: fetch the daemon-side inlined form so `<img>` subresource GETs
      // inside the srcdoc iframe never race Hangul NFC/NFD filename mismatches,
      // transient /preview 404s, or missing preview-scope auth headers. The
      // primary `source` state stays raw (used by manual edit, model context
      // retry payloads, element-patch diff, and export snapshots — all of
      // which must see the on-disk bytes, not multi-MB data URIs).
      //
      // Gate on the presence of an inline-able <img>. Skip when nothing to
      // inline so the primary /raw fetch already covered the paint.
      if (!hasRelativeImageRefs(source)) return;
      let cancelled = false;
      // Content-derived fingerprint: file.mtime lags behind Manual Edit
      // set-image saves (source updates locally before the /files list
      // refresh bumps mtime), and reloadKey does not tick on manual patches.
      // Without something that varies with source bytes the browser serves
      // the previous /raw?inlineAssets=1 response — the srcdoc iframe then
      // paints an old inlined deck whose data-URI images do not match the
      // just-updated `<img src>` refs in `source` (image "flies away" and
      // only alt is visible). Length + first / last 64 chars is cheap and
      // deterministic; combined with mtime + reloadKey it covers all three
      // invalidation triggers (external write, reload, in-session patch).
      const inlineContentKey = manualEditPreviewInlineContentKey(source);
      void fetchProjectFileText(projectId, file.name, {
        cacheBustKey: `${file.mtime}-${reloadKey}-${inlineContentKey}-preview-inline`,
        inlineAssetsForPreview: true,
      }).then((next) => {
        if (cancelled || next == null) return;
        setInlinedSource(next);
      }).catch(() => {
        // Silently fall back to the raw source — the iframe will still attempt
        // live subresource GETs and my daemon /preview NFC/NFD fallback path.
      });
      return () => {
        cancelled = true;
      };
    }
    if (!hasRelativeAssetRefs(source)) return;
    let cancelled = false;
    void inlineRelativeAssets(source, projectId, file.name).then((next) => {
      if (!cancelled) setInlinedSource(next);
    });
    return () => {
      cancelled = true;
    };
  }, [source, effectiveDeck, projectId, file.name, reloadKey, useUrlLoadPreview]);

  const srcDoc = useMemo(
    () => {
      // Teamver embed: do not paint deck HTML until preview-url prefix settle
      // completes with a real scoped base. Avoids no-base first paint → remount
      // → lost fit. Hold empty srcDoc (never settle without a prefix).
      // Never paint Teamver decks without a scoped base — relative composer/
      // Drive images resolve against about:srcdoc and show as alt-only.
      if (teamverEmbedPreviewMode && (!embedPreviewPrefixSettled || !embedPreviewPrefix)) {
        return '';
      }
      return redirectLoopBlocked
        ? buildRedirectLoopBlockedDoc()
        : previewSource
          ? buildSrcdoc(previewSource, {
            deck: effectiveDeck,
            baseHref: srcDocBaseHref,
            initialSlideIndex: htmlPreviewSlideState.get(previewStateKey)?.active ?? 0,
            selectionBridge: true,
            editBridge: manualEditRequiresSrcDoc,
            paletteBridge: false,
            previewFocusGuard: true,
          })
          : '';
    },
    [
      redirectLoopBlocked,
      previewSource,
      effectiveDeck,
      srcDocBaseHref,
      previewStateKey,
      manualEditRequiresSrcDoc,
      teamverEmbedPreviewMode,
      embedPreviewPrefix,
      embedPreviewPrefixSettled,
    ],
  );
  const lazySrcDocTransport = useMemo(() => buildLazySrcdocTransport(), []);
  const [srcDocTransportResetKey, setSrcDocTransportResetKey] = useState(0);
  // Include settled prefix in the mount key so hold→paint is a fresh iframe
  // mount (never an in-place ''→HTML srcDoc attribute update that strands
  // deck fit until toolbar refresh).
  const srcDocPreviewMountKey = resolveSrcDocPreviewMountKey({
    transportResetKey: srcDocTransportResetKey,
    teamverEmbedMode: teamverEmbedPreviewMode,
    embedPreviewPrefix,
    embedPreviewPrefixSettled,
  });
  const [srcDocShellReady, setSrcDocShellReady] = useState(false);
  const wasUrlLoadPreviewRef = useRef(useUrlLoadPreview);
  const urlPreviewKeepAliveKey = previewIframeKeepAliveKey(projectId, file.name);
  // undefined = never painted under current identity; null/string = last painted base.
  const prevEmbedPreviewPrefixRef = useRef<string | null | undefined>(undefined);
  // When the scoped prefix rotates after a settled paint (auth recovery remint),
  // clear activation dedupe. Hold→first-paint remount is owned by
  // `srcDocPreviewMountKey` (prefix in the React key) so we do NOT skip or
  // specially handle `prev === undefined` here — that skip used to leave the
  // empty-hold iframe in place and strand compact decks blank.
  useEffect(() => {
    if (!teamverEmbedPreviewMode) {
      prevEmbedPreviewPrefixRef.current = embedPreviewPrefix;
      return;
    }
    if (!embedPreviewPrefixSettled || !embedPreviewPrefix) {
      prevEmbedPreviewPrefixRef.current = undefined;
      return;
    }
    const prev = prevEmbedPreviewPrefixRef.current;
    prevEmbedPreviewPrefixRef.current = embedPreviewPrefix;
    if (prev === undefined) return;
    if (embedPreviewPrefix === prev) return;
    activatedSrcDocTransportHtmlRef.current = null;
    setSrcDocTransportResetKey((key) => key + 1);
  }, [embedPreviewPrefix, embedPreviewPrefixSettled, teamverEmbedPreviewMode]);
  // Agent / disk HTML replacement often updates the srcDoc attribute in place.
  // Some browsers reuse the iframe document without a clean bridge boot, which
  // leaves compact decks on a black letterbox until toolbar refresh. Remount
  // once per non-streaming content change on the srcDoc transport — and once
  // when leaving a stream (content may be identical bytes but the live→disk
  // handoff still needs a clean bridge boot).
  const lastDeckPreviewSourceRef = useRef<string | null>(null);
  const wasStreamingDeckPreviewRef = useRef(false);
  useEffect(() => {
    const identity = `${projectId}\0${file.name}`;
    if (deckHostViewportFitIdentityRef.current !== identity) {
      lastDeckPreviewSourceRef.current = null;
      wasStreamingDeckPreviewRef.current = false;
    }
    if (!deckHostViewportFitActive || mode !== 'preview' || useUrlLoadPreview) return;
    if (!previewSource) return;
    if (streaming) {
      lastDeckPreviewSourceRef.current = previewSource;
      wasStreamingDeckPreviewRef.current = true;
      return;
    }
    const prev = lastDeckPreviewSourceRef.current;
    const leftStreaming = wasStreamingDeckPreviewRef.current;
    wasStreamingDeckPreviewRef.current = false;
    lastDeckPreviewSourceRef.current = previewSource;
    if (leftStreaming || (prev != null && prev !== previewSource)) {
      // Tip-yield freeze already reloads via srcDoc — skip a second shell remount (453).
      if (shouldSkipSrcDocTransportRemountForManualEditFreezeTipSync(
        leftStreaming,
        manualEditMode,
        manualEditFrozenSource != null,
      )) {
        return;
      }
      activatedSrcDocTransportHtmlRef.current = null;
      setSrcDocTransportResetKey((key) => key + 1);
    }
  }, [
    previewSource,
    streaming,
    deckHostViewportFitActive,
    mode,
    useUrlLoadPreview,
    projectId,
    file.name,
    manualEditMode,
    manualEditFrozenSource,
  ]);
  // Reset the shell-ready latch whenever the srcDoc iframe re-mounts. The
  // next shell will post `od:srcdoc-transport-ready` (or fire onLoad) and
  // flip this back to true. See #2253. Use mount key (includes prefix settle)
  // so hold→paint remounts reset the latch too.
  useEffect(() => {
    setSrcDocShellReady(false);
  }, [srcDocPreviewMountKey]);
  // Listen for the shell's ready handshake. Gating activation on this is
  // what fixes the #2253 race: opening Tweaks right after a key-driven
  // re-mount used to post `activate` before the shell's listener was
  // installed, dropping the message and stranding the iframe on the empty
  // 536-byte body.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== srcDocPreviewIframeRef.current?.contentWindow) return;
      const data = ev.data as { type?: string } | null;
      if (data?.type !== 'od:srcdoc-transport-ready') return;
      setSrcDocShellReady(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== srcDocPreviewIframeRef.current?.contentWindow) return;
      const data = ev.data as { type?: string } | null;
      if (data?.type !== PREVIEW_REDIRECT_LOOP_MESSAGE) return;
      setRedirectLoopBlocked(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const frame = urlPreviewIframeRef.current;
      if (ev.source !== frame?.contentWindow) return;
      if (frame.getAttribute('src') === 'about:blank') return;
      const data = ev.data as { type?: string } | null;
      if (data?.type !== 'od:url-selection-bridge-ready') return;
      setUrlSelectionBridgeReady(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  // Lazy transport preloads an empty shell only while URL-load is the active
  // transport. Once srcdoc becomes active (sandbox shim, Draw, Screenshot,
  // Tweaks, etc.), mount the real artifact HTML directly so we do not depend on
  // a postMessage activation that can race (#2253) and strand the iframe blank
  // (#2361, #2791).
  const captureModeActive = drawOverlayOpen;
  const useLazySrcDocTransport = !manualEditRequiresSrcDoc && !captureModeActive && useUrlLoadPreview;
  const srcDocTransportContent = useLazySrcDocTransport ? lazySrcDocTransport : srcDoc;
  const urlTransportSrc = useUrlLoadPreview ? activePreviewSrcUrl : 'about:blank';
  const activateSrcDocTransport = useCallback((target: HTMLIFrameElement | null = srcDocPreviewIframeRef.current) => {
    if (!canActivateSrcDocTransport({
      srcDoc,
      useUrlLoadPreview,
      useLazySrcDocTransport,
      shellReady: srcDocShellReady,
      activatedHtml: activatedSrcDocTransportHtmlRef.current,
    })) return false;
    // A SECOND activation while Comment mode is on would document.open +
    // write over the iframe's existing document. The window-level message
    // listener survives, but iframe.onLoad does NOT refire for
    // document.write, so host-side re-init (slide nav sync, scroll
    // restore, bridge replay) is silently skipped — the visible page can
    // drift out of sync with the host's tracked state (e.g. the page
    // indicator shows 3 while the iframe rendered page 4 of the freshly
    // edited deck). Force a fresh shell mount under Comment so onLoad
    // fires and the full re-init pipeline runs against the new HTML.
    //
    // Skip the remount path in Manual Edit, where the postMessage
    // activate carries the patched HTML and host-side scroll/slide
    // state intentionally stays put across the patch.
    if (boardMode && activatedSrcDocTransportHtmlRef.current !== null) {
      activatedSrcDocTransportHtmlRef.current = null;
      setSrcDocTransportResetKey((key) => key + 1);
      return true;
    }
    const win = target?.contentWindow;
    if (!win) return false;
    win.postMessage({ type: 'od:srcdoc-transport-activate', html: srcDoc }, '*');
    activatedSrcDocTransportHtmlRef.current = srcDoc;
    return true;
  }, [srcDoc, useLazySrcDocTransport, useUrlLoadPreview, srcDocShellReady, boardMode]);
  const activateLoadedSrcDocTransport = useCallback((target: HTMLIFrameElement | null = srcDocPreviewIframeRef.current) => {
    if (!canActivateSrcDocTransport({
      srcDoc,
      useUrlLoadPreview,
      useLazySrcDocTransport,
      shellReady: true,
      activatedHtml: activatedSrcDocTransportHtmlRef.current,
    })) return false;
    const win = target?.contentWindow;
    if (!win) return false;
    win.postMessage({ type: 'od:srcdoc-transport-activate', html: srcDoc }, '*');
    activatedSrcDocTransportHtmlRef.current = srcDoc;
    return true;
  }, [srcDoc, useLazySrcDocTransport, useUrlLoadPreview]);
  const activateSrcDocSnapshotTransport = useCallback((target: HTMLIFrameElement | null = srcDocPreviewIframeRef.current) => {
    if (!srcDoc) return false;
    const win = target?.contentWindow;
    if (!win) return false;
    win.postMessage({ type: 'od:srcdoc-transport-activate', html: srcDoc }, '*');
    return true;
  }, [srcDoc]);
  useEffect(() => {
    if (useUrlLoadPreview) {
      activatedSrcDocTransportHtmlRef.current = null;
      if (!wasUrlLoadPreviewRef.current) {
        setSrcDocTransportResetKey((key) => key + 1);
      }
      wasUrlLoadPreviewRef.current = true;
      return;
    }
    if (wasUrlLoadPreviewRef.current) {
      setSrcDocTransportResetKey((key) => key + 1);
      activatedSrcDocTransportHtmlRef.current = null;
    }
    wasUrlLoadPreviewRef.current = false;
    activateSrcDocTransport();
  }, [activateSrcDocTransport, useUrlLoadPreview]);
  
  useEffect(() => {
    restorePreviewScrollPosition();
  }, [boardMode, drawOverlayOpen, manualEditMode, srcDoc, restorePreviewScrollPosition]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      if (!isActivePreviewIframeSource(ev.source)) return;
      const data = ev.data as {
        type?: string;
        frameLeft?: number;
        frameTop?: number;
        canvasLeft?: number;
        canvasTop?: number;
      } | null;
      if (!data || data.type !== 'od:preview-scroll') return;
      if (previewScrollRestoreRef.current && Number(data.canvasLeft || 0) === 0 && Number(data.canvasTop || 0) === 0) return;
      if (
        previewScrollPositionRef.current.canvasLeft !== 0 ||
        previewScrollPositionRef.current.canvasTop !== 0
      ) {
        const isInitialZeroReport = Number(data.canvasLeft || 0) === 0 && Number(data.canvasTop || 0) === 0;
        if (isInitialZeroReport && Date.now() - previewScrollRequestAtRef.current < 1200) return;
      }
      previewScrollPositionRef.current = {
        frameLeft: Number(data.frameLeft || 0),
        frameTop: Number(data.frameTop || 0),
        canvasLeft: Number(data.canvasLeft || 0),
        canvasTop: Number(data.canvasTop || 0),
      };
    }
    function onRestoreRequest(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      if (!isActivePreviewIframeSource(ev.source)) return;
      const data = ev.data as { type?: string } | null;
      if (!data || data.type !== 'od:preview-scroll-request') return;
      previewScrollRequestAtRef.current = Date.now();
      const snapshot = previewScrollRestoreRef.current;
      const scroll = snapshot ?? {
        frameLeft: previewScrollPositionRef.current.frameLeft,
        frameTop: previewScrollPositionRef.current.frameTop,
        canvasLeft: previewScrollPositionRef.current.canvasLeft,
        canvasTop: previewScrollPositionRef.current.canvasTop,
      };
      iframeRef.current?.contentWindow?.postMessage({
        type: 'od:preview-scroll-restore',
        frameLeft: scroll.frameLeft,
        frameTop: scroll.frameTop,
        canvasLeft: scroll.canvasLeft,
        canvasTop: scroll.canvasTop,
      }, '*');
    }
    function onDcViewportMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      if (!isActivePreviewIframeSource(ev.source)) return;
      const data = ev.data as {
        type?: string;
        x?: number;
        y?: number;
        scale?: number;
      } | null;
      if (!data || !data.type) return;
      if (data.type === '__dc_viewport') {
        const x = Number(data.x || 0);
        const y = Number(data.y || 0);
        const scale = Number(data.scale || 1);
        const hasExistingPosition = dcViewportRef.current.x !== 0 || dcViewportRef.current.y !== 0;
        const isInitialZeroReport = x === 0 && y === 0 && scale === 1;
        if (hasExistingPosition && isInitialZeroReport && Date.now() - dcViewportRestoreAtRef.current < 1500) return;
        dcViewportRef.current = {
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
          scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        };
        return;
      }
      if (data.type === '__dc_viewport_request') {
        dcViewportRestoreAtRef.current = Date.now();
        iframeRef.current?.contentWindow?.postMessage({
          type: '__dc_set_viewport',
          ...dcViewportRef.current,
        }, '*');
      }
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('message', onRestoreRequest);
    window.addEventListener('message', onDcViewportMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('message', onRestoreRequest);
      window.removeEventListener('message', onDcViewportMessage);
    };
  }, [isActivePreviewIframeSource, isOurPreviewIframeSource]);

  useEffect(() => {
    if (!effectiveDeck) {
      setSlideState(null);
      return;
    }
    setSlideState(htmlPreviewSlideState.get(previewStateKey) ?? null);
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      if (!isActivePreviewIframeSource(ev.source)) return;
      const data = ev?.data as
        | { type?: string; active?: number; count?: number }
        | null;
      if (!data || data.type !== 'od:slide-state') return;
      if (typeof data.active !== 'number' || typeof data.count !== 'number') return;
      const next = { active: data.active, count: data.count };
      setSlideStateCached(previewStateKey, next);
      setSlideState(next);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [effectiveDeck, isActivePreviewIframeSource, isOurPreviewIframeSource, previewStateKey]);

  useEffect(() => {
    if (!deckHostViewportFitActive || mode !== 'preview') return;
    let cancelZeroSizeRetry: (() => void) | null = null;
    function onDeckViewportRequest(ev: MessageEvent) {
      // Accept any of our preview iframes — during liveHtml→disk srcDoc churn
      // iframeRef can lag the requesting contentWindow by a tick, and the
      // strict active-ref check used to drop the request (black letterbox until
      // refresh). Still post to the requesting frame; only sync iframeRef when
      // that frame is the active transport (never Present / stale dual-mount).
      if (!isOurPreviewIframeSource(ev.source)) return;
      const data = ev.data as { type?: string } | null;
      if (!data || data.type !== 'od:deck-host-viewport-request') return;
      const requestSource = ev.source;
      const target =
        resolveDeckPreviewIframeFromSource(requestSource, [
          srcDocPreviewIframeRef.current,
          urlPreviewIframeRef.current,
          presentIframeRef.current,
          iframeRef.current,
        ])
        ?? iframeRef.current;
      const activeTransport = useUrlLoadPreview
        ? urlPreviewIframeRef.current
        : srcDocPreviewIframeRef.current;
      if (target && target === activeTransport) {
        iframeRef.current = target;
      }
      // Immediate post may no-op at 0×0. Always arm a short follow-up window —
      // a successful post to a frame that remounts on the next tick otherwise
      // leaves the replacement iframe without a host viewport.
      postDeckHostViewportToIframe(target, deckPreviewFitScale, deckPreviewFitOptions);
      cancelZeroSizeRetry?.();
      cancelZeroSizeRetry = schedulePostDeckHostViewportUntilSized(
        () =>
          resolveDeckPreviewIframeFromSource(requestSource, [
            srcDocPreviewIframeRef.current,
            urlPreviewIframeRef.current,
            presentIframeRef.current,
            iframeRef.current,
          ])
          ?? (useUrlLoadPreview
            ? urlPreviewIframeRef.current
            : srcDocPreviewIframeRef.current)
          ?? iframeRef.current,
        deckPreviewFitScale,
        [0, 32, 80, 160, 320, 640, 1_200, 2_400],
        deckPreviewFitOptions,
      );
    }
    window.addEventListener('message', onDeckViewportRequest);
    return () => {
      window.removeEventListener('message', onDeckViewportRequest);
      cancelZeroSizeRetry?.();
    };
  }, [
    deckHostViewportFitActive,
    mode,
    isOurPreviewIframeSource,
    deckPreviewFitScale,
    deckPreviewFitOptions,
    useUrlLoadPreview,
  ]);

  const resolveActiveDeckPreviewIframe = useCallback((): HTMLIFrameElement | null => {
    if (useUrlLoadPreview) {
      return urlPreviewIframeRef.current ?? iframeRef.current;
    }
    return srcDocPreviewIframeRef.current ?? iframeRef.current;
  }, [useUrlLoadPreview]);

  const resetDrawPreviewPan = useCallback(() => {
    if (!effectiveDeck) return;
    resetDeckPreviewPan(resolveActiveDeckPreviewIframe());
  }, [effectiveDeck, resolveActiveDeckPreviewIframe]);

  useEffect(() => {
    if (!effectiveDeck) return;
    if (!drawOverlayOpen) return;
    resetDrawPreviewPan();
  }, [drawOverlayOpen, effectiveDeck, resetDrawPreviewPan]);

  useEffect(() => {
    if (!drawOverlayOpen) {
      drawCaptureReadyRef.current = true;
      return;
    }
    drawCaptureReadyRef.current = false;
    let cancelled = false;
    void (async () => {
      // Draw mode forces srcDoc; the srcDoc iframe may not be mounted on the
      // very first frame after the toggle. Poll briefly before falling back
      // to "ready" so capture cannot race an unmounted iframe.
      const start = Date.now();
      let iframe = srcDocPreviewIframeRef.current;
      while (!iframe && !cancelled && Date.now() - start < 1_500) {
        await waitForAnimationFrame();
        iframe = srcDocPreviewIframeRef.current;
      }
      if (cancelled) return;
      if (!iframe) {
        drawCaptureReadyRef.current = true;
        return;
      }
      await waitForIframeLoadOrTimeout(iframe, 5_000);
      await waitForAnimationFrame();
      await waitForAnimationFrame();
      if (!useUrlLoadPreview) {
        await waitForIframeLoadOrTimeout(iframe, 2_000);
        await waitForAnimationFrame();
      }
      if (!cancelled) drawCaptureReadyRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [drawOverlayOpen, srcDocPreviewMountKey, srcDoc, useUrlLoadPreview]);

  const resolveAnnotationCaptureFrameRect = useCallback(() => {
    const iframe = resolveActiveDeckPreviewIframe();
    if (!iframe) return null;
    const rect = iframe.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return rect;
  }, [resolveActiveDeckPreviewIframe]);

  useEffect(() => {
    if (!deckHostViewportFitActive || mode !== 'preview') return;
    // Resolve the iframe at fire time — stream-end / liveHtml clear remounts
    // often leave a null capture from effect start (black letterbox until refresh).
    return scheduleDeckPreviewFitNudges(
      resolveActiveDeckPreviewIframe,
      deckPreviewFitScale,
      deckPreviewFitOptions,
    );
  }, [
    deckHostViewportFitActive,
    mode,
    zoom,
    deckPreviewFitScale,
    deckPreviewFitOptions,
    previewBodySize?.width,
    previewBodySize?.height,
    srcDoc,
    previewStateKey,
    useUrlLoadPreview,
    srcDocPreviewMountKey,
    resolveActiveDeckPreviewIframe,
    // Terminal: liveHtml clear / streaming off rebuilds srcDoc — re-nudge fit.
    streaming,
    hasLiveHtml,
    source,
  ]);

  // Persistent host→iframe fit recovery: panel resize, sidebar drag, and
  // mid-session remounts can strand compact decks on a black letterbox even
  // after the initial nudge window. Re-post whenever the active frame's box
  // changes, and keep a slow recovery loop until the bridge reports ready.
  useEffect(() => {
    if (!deckHostViewportFitActive || mode !== 'preview') return;
    let cancelled = false;
    let stackedReady = !compactApiStackedDeck;
    const onReady = (ev: MessageEvent) => {
      if (!isOurPreviewIframeSource(ev.source)) return;
      const data = ev.data as { type?: string } | null;
      if (data?.type !== 'od:stacked-deck-ready') return;
      stackedReady = true;
    };
    window.addEventListener('message', onReady);

    const nudge = () => {
      if (cancelled) return;
      nudgeDeckPreviewFit(
        resolveActiveDeckPreviewIframe,
        deckPreviewFitScale,
        deckPreviewFitOptions,
      );
    };

    let observer: ResizeObserver | null = null;
    let observedFrame: HTMLIFrameElement | null = null;
    const observeTarget = () => {
      const frame = resolveActiveDeckPreviewIframe();
      if (!frame || typeof ResizeObserver === 'undefined') return;
      if (observer && observedFrame === frame) return;
      observer?.disconnect();
      observedFrame = frame;
      observer = new ResizeObserver(() => {
        nudge();
      });
      observer.observe(frame);
      if (previewBodyRef.current) observer.observe(previewBodyRef.current);
    };
    observeTarget();

    const cancelUntilSized = schedulePostDeckHostViewportUntilSized(
      resolveActiveDeckPreviewIframe,
      deckPreviewFitScale,
      deckPreviewFitOptions,
    );

    // Slow recovery: remount/srcDoc churn can land after the fast nudge window.
    // Do not tear down ResizeObserver every tick — only rebind when the frame node changes.
    let slowAttempts = 0;
    const slowTimer = window.setInterval(() => {
      if (cancelled || stackedReady) return;
      slowAttempts += 1;
      observeTarget();
      nudge();
      if (slowAttempts >= 40) stackedReady = true; // ~20s — stop polling
    }, 500);

    return () => {
      cancelled = true;
      window.removeEventListener('message', onReady);
      observer?.disconnect();
      cancelUntilSized();
      window.clearInterval(slowTimer);
    };
    // Intentionally omit `srcDoc`: token-level HTML churn would reset the recovery
    // loop every stream tick. Remount key + transport switch are enough.
  }, [
    deckHostViewportFitActive,
    mode,
    compactApiStackedDeck,
    srcDocPreviewMountKey,
    useUrlLoadPreview,
    deckPreviewFitScale,
    deckPreviewFitOptions,
    resolveActiveDeckPreviewIframe,
    isOurPreviewIframeSource,
    embedPreviewPrefixSettled,
  ]);

  // Tab blur/background can leave compact decks unfitted after the iframe
  // throttles timers; re-nudge when the page becomes visible again.
  useEffect(() => {
    if (!deckHostViewportFitActive || mode !== 'preview') return;
    let cancelUntilSized: (() => void) | null = null;
    const recover = () => {
      if (document.visibilityState === 'hidden') return;
      cancelUntilSized?.();
      nudgeDeckPreviewFit(
        resolveActiveDeckPreviewIframe,
        deckPreviewFitScale,
        deckPreviewFitOptions,
      );
      cancelUntilSized = schedulePostDeckHostViewportUntilSized(
        resolveActiveDeckPreviewIframe,
        deckPreviewFitScale,
        [0, 50, 150, 400, 900],
        deckPreviewFitOptions,
      );
    };
    document.addEventListener('visibilitychange', recover);
    window.addEventListener('pageshow', recover);
    return () => {
      cancelUntilSized?.();
      document.removeEventListener('visibilitychange', recover);
      window.removeEventListener('pageshow', recover);
    };
  }, [
    deckHostViewportFitActive,
    mode,
    deckPreviewFitScale,
    deckPreviewFitOptions,
    resolveActiveDeckPreviewIframe,
  ]);

  // Stream end often rebuilds srcDoc / clears liveHtml — re-nudge fit once.
  useEffect(() => {
    const wasStreaming = wasStreamingForDeckFitRef.current;
    wasStreamingForDeckFitRef.current = streaming;
    if (!deckHostViewportFitActive || mode !== 'preview') return;
    if (!(wasStreaming && !streaming)) return;
    return scheduleDeckPreviewFitNudges(
      resolveActiveDeckPreviewIframe,
      deckPreviewFitScale,
      deckPreviewFitOptions,
    );
  }, [
    streaming,
    deckHostViewportFitActive,
    mode,
    deckPreviewFitScale,
    deckPreviewFitOptions,
    resolveActiveDeckPreviewIframe,
  ]);

  // liveHtml → disk: after stream paint clears, disk srcDoc may remount after
  // the stream-end nudge window — schedule another fit pass.
  const hadLiveHtmlForDeckFitRef = useRef(hasLiveHtml);
  useEffect(() => {
    const hadLive = hadLiveHtmlForDeckFitRef.current;
    hadLiveHtmlForDeckFitRef.current = hasLiveHtml;
    if (!deckHostViewportFitActive || mode !== 'preview') return;
    if (!(hadLive && !hasLiveHtml)) return;
    return scheduleDeckPreviewFitNudges(
      resolveActiveDeckPreviewIframe,
      deckPreviewFitScale,
      deckPreviewFitOptions,
    );
  }, [
    hasLiveHtml,
    deckHostViewportFitActive,
    mode,
    deckPreviewFitScale,
    deckPreviewFitOptions,
    resolveActiveDeckPreviewIframe,
  ]);

  useEffect(() => {
    if (!compactApiStackedDeck || previewScale !== 1) return;
    resetDeckPreviewPan(iframeRef.current);
  }, [compactApiStackedDeck, previewScale, previewStateKey, srcDocPreviewMountKey]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({
      type: 'od:comment-mode',
      enabled: boardMode,
      mode: boardTool,
    }, '*');
  }, [boardMode, boardTool, srcDoc, useUrlLoadPreview]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od-edit-mode', enabled: manualEditMode }, '*');
    postSelectedManualEditTargetsToIframe(
      manualEditMode ? selectedManualEditTargetIds : [],
      manualEditMode ? selectedManualEditTarget?.id ?? null : null,
    );
    // hostChrome tracks overlay mount: also re-post when draw / inline-text hide it.
    // Tip-yield freeze remount: do NOT depend on manualEditFrozenSource — posting
    // selection onto a dying frame causes outline clear→paint→clear; onLoad owns
    // restore via syncBridgeModes (452). Re-post when tip chrome suppress toggles
    // so hostChrome/pointer-events stay aligned (457).
  }, [
    manualEditMode,
    selectedManualEditTarget?.id,
    selectedManualEditTargetIds,
    srcDoc,
    useUrlLoadPreview,
    manualEditInlineTextEditing,
    drawOverlayOpen,
    manualEditTipRemountChromeSuppressed,
  ]);

  const previewStyleToIframe = useCallback((id: string, styles: Partial<ManualEditStyles>, version: number) => {
    const frame = iframeRef.current;
    const win = frame?.contentWindow;
    if (!win) return false;
    win.postMessage({ type: 'od-edit-preview-style', id, styles, version }, '*');
    // Bridge postMessage is the canonical path, but on some artifact HTMLs
    // the bridge is missing / disabled / delayed. srcDoc previews are
    // same-origin, so the host can also apply the style directly with
    // !important — that way slider tweaks show up even when postMessage
    // does not (older exports, non-bridge fixtures).
    applyManualEditPreviewStylesToDocument(
      iframeContentDocumentIfAccessible(frame),
      id,
      styles,
    );
    return true;
  }, []);

  function postSelectedManualEditTargetsToIframe(
    ids: string[],
    primaryId: string | null,
    target: HTMLIFrameElement | null = iframeRef.current,
  ) {
    const win = target?.contentWindow;
    if (!win) return;
    const primary = (
      primaryId
      && selectedManualEditTarget
      && selectedManualEditTarget.id === primaryId
    )
      ? selectedManualEditTarget
      : (primaryId && selectedManualEditTargetRef.current?.id === primaryId
        ? selectedManualEditTargetRef.current
        : null);
    const hostChrome = shouldPostHostChromeDuringTipRemountSuppress(
      Boolean(
        ids.length === 1
        && primary
        && !drawOverlayOpen
        && !hideManualEditBoxDrag
        && canResizeTarget(primary, { inlineTextEditing: manualEditInlineTextEditing }),
      ),
      manualEditTipRemountChromeSuppressedRef.current,
    );
    win.postMessage({
      type: 'od-edit-selected-target',
      id: primaryId,
      ids,
      primaryId,
      hostChrome,
    }, '*');
  }

  /** @deprecated use postSelectedManualEditTargetsToIframe */
  function postSelectedManualEditTargetToIframe(id: string | null, target?: HTMLIFrameElement | null) {
    postSelectedManualEditTargetsToIframe(
      id ? [id] : [],
      id,
      target,
    );
  }

  function requestManualEditTargetsRefresh(target: HTMLIFrameElement | null = iframeRef.current) {
    const win = target?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od-edit-refresh-targets' }, '*');
  }

  function requestManualEditTargetRemeasure(id: string, target: HTMLIFrameElement | null = iframeRef.current) {
    const win = target?.contentWindow;
    if (!win || !id) return;
    win.postMessage({ type: 'od-edit-remeasure', id }, '*');
  }

  /** After tip-yield srcDoc onLoad — remasure selected ids while grace is armed (450/452). */
  function requestTipRemountRemasureAfterSrcDocLoad(
    target: HTMLIFrameElement | null = iframeRef.current,
  ) {
    const ids = selectedManualEditTargetIdsRef.current;
    if (!shouldRequestTipRemountRemasureAfterSrcDocLoad(
      manualEditModeRef.current,
      ids,
      manualEditTipRemountGeometryGraceIdRef.current,
    )) {
      return;
    }
    const primaryId = selectedManualEditTargetIdRef.current;
    const ordered = primaryId && ids.includes(primaryId)
      ? [primaryId, ...ids.filter((id) => id !== primaryId)]
      : ids;
    for (const id of ordered) {
      requestManualEditTargetRemeasure(id, target);
    }
  }

  /**
   * Tip srcDoc onLoad — sync content/host measure so inert chrome tracks tip
   * rect immediately; async od-edit-remeasure still confirms + consumes grace (459).
   */
  function applyTipRemountSyncHostMeasureAfterSrcDocLoad(
    target: HTMLIFrameElement | null = iframeRef.current,
  ): boolean {
    const ids = selectedManualEditTargetIdsRef.current;
    if (!shouldApplyTipRemountSyncHostMeasureOnSrcDocLoad(
      manualEditModeRef.current,
      ids,
      manualEditTipRemountGeometryGraceIdRef.current,
    )) {
      return false;
    }
    const frame = target ?? iframeRef.current;
    const workspace = manualEditWorkspaceRef.current;
    if (!frame || !workspace) return false;
    const primaryId = selectedManualEditTargetIdRef.current;
    const ordered = primaryId && ids.includes(primaryId)
      ? [primaryId, ...ids.filter((id) => id !== primaryId)]
      : ids;
    let primaryMeasured = false;
    let appliedAny = false;
    for (const id of ordered) {
      const content = measureManualEditTargetContentRect(frame, id);
      if (!content) continue;
      const base = selectedManualEditTargetRef.current?.id === id
        ? selectedManualEditTargetRef.current
        : null;
      if (base) {
        applyManualEditMeasuredGeometry({
          ...base,
          rect: content.rect,
          layoutWidth: content.layoutWidth,
          layoutHeight: content.layoutHeight,
        });
      } else {
        // Multi siblings: geometry-only — apply helper merges onto list membership.
        applyManualEditMeasuredGeometry({
          id,
          rect: content.rect,
          layoutWidth: content.layoutWidth,
          layoutHeight: content.layoutHeight,
        } as ManualEditTarget);
      }
      appliedAny = true;
      if (id === primaryId) primaryMeasured = true;
    }
    if (!shouldReleaseTipRemountChromeAfterSyncHostMeasure(
      primaryMeasured,
      manualEditTipRemountFitSettleUntilRef.current,
      Date.now(),
    )) {
      return false;
    }
    // Tip rect is live — drop inert; keep grace for wild-jump until async remasure.
    manualEditTipRemountChromeSuppressedRef.current = false;
    setManualEditTipRemountChromeSuppressed(false);
    if (shouldRefreshHostPaintAfterTipRemountRemasure(true) && primaryId) {
      refreshManualEditHostPaintRect(primaryId, { force: true });
    }
    // Multi: force host metrics so union chrome does not keep pre-tip compose (461).
    refreshManualEditHostMetricsAfterTipRemountMulti(frame, appliedAny);
    return true;
  }

  /**
   * Tip srcDoc onLoad — sync measure, then one rAF retry if layout was not ready (462).
   */
  function applyTipRemountSyncHostMeasureAfterSrcDocLoadWithRetry(
    target: HTMLIFrameElement | null = iframeRef.current,
  ) {
    const applied = applyTipRemountSyncHostMeasureAfterSrcDocLoad(target);
    if (!shouldRetryTipRemountSyncHostMeasureAfterSrcDocLoad(
      applied,
      manualEditModeRef.current,
      selectedManualEditTargetIdsRef.current,
      manualEditTipRemountGeometryGraceIdRef.current,
    )) {
      return applied;
    }
    // Cancel any prior retry before arming a new one (463).
    if (shouldCancelTipRemountSyncHostMeasureRetry(
      manualEditTipRemountSyncRetryRafRef.current != null,
    )) {
      window.cancelAnimationFrame(manualEditTipRemountSyncRetryRafRef.current!);
      manualEditTipRemountSyncRetryRafRef.current = null;
    }
    // First load tick often measures before fonts/deck-fit layout — retry once.
    manualEditTipRemountSyncRetryRafRef.current = requestAnimationFrame(() => {
      manualEditTipRemountSyncRetryRafRef.current = null;
      if (!shouldApplyTipRemountSyncHostMeasureOnSrcDocLoad(
        manualEditModeRef.current,
        selectedManualEditTargetIdsRef.current,
        manualEditTipRemountGeometryGraceIdRef.current,
      )) {
        return;
      }
      applyTipRemountSyncHostMeasureAfterSrcDocLoad(
        target ?? iframeRef.current,
      );
    });
    return false;
  }

  /**
   * Multi tip-remount: refresh host scale/offset + geom epoch so union chrome
   * and live measureHostRect do not keep pre-tip/pre-fit compose (461).
   */
  function refreshManualEditHostMetricsAfterTipRemountMulti(
    frame: HTMLIFrameElement | null,
    appliedAny: boolean,
  ) {
    if (!shouldRefreshHostMetricsAfterTipRemountMultiRemasure(
      selectedManualEditTargetIdsRef.current.length,
      appliedAny,
    )) {
      return;
    }
    const workspace = manualEditWorkspaceRef.current;
    if (!frame || !workspace) return;
    setManualEditHostScale(measureIframeHostScale(frame));
    setManualEditHostOffset(measureIframeOffsetInHost(frame, workspace));
    setManualEditGeomEpoch((n) => n + 1);
  }

  /**
   * Deck host-fit nudges change stage scale after onLoad sync measure — remasure
   * while fit-settle latch is live so chrome tracks post-fit tip geometry (460).
   */
  function remeasureTipRemountAfterDeckHostFitSettle(
    target: HTMLIFrameElement | null = iframeRef.current,
    remasureDelayMs = TIP_REMOUNT_FIT_SETTLE_LAST_REMEASURE_MS,
  ): boolean {
    const ids = selectedManualEditTargetIdsRef.current;
    const nowMs = Date.now();
    const inFitSettleLatch = shouldRemeasureTipRemountAfterDeckHostFitSettle(
      manualEditModeRef.current,
      ids,
      manualEditTipRemountFitSettleUntilRef.current,
      nowMs,
    );
    const inDeckNudgeFollow = shouldRemeasureTipRemountOnDeckHostFitNudge(
      manualEditModeRef.current,
      ids,
      manualEditTipDeckNudgeFollowUntilRef.current,
      nowMs,
    );
    if (!inFitSettleLatch && !inDeckNudgeFollow) {
      return false;
    }
    // Mid-gesture remasure fights resize/move draft — skip apply (482).
    if (shouldSkipTipRemountFitSettleRemasureDuringResizeGesture(
      manualEditResizeSessionActiveRef.current,
    )) {
      // Remember chrome release was due so gesture-end can drop inert (489).
      if (shouldMarkTipRemountChromeReleasePendingAfterResizeSkip(
        manualEditResizeSessionActiveRef.current,
        manualEditTipRemountChromeSuppressedRef.current,
        remasureDelayMs,
        TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
      )) {
        manualEditTipChromeReleaseAfterResizeRef.current = true;
      }
      return false;
    }
    const frame = target ?? iframeRef.current;
    const workspace = manualEditWorkspaceRef.current;
    if (!frame || !workspace) return false;
    const primaryId = selectedManualEditTargetIdRef.current;
    const ordered = primaryId && ids.includes(primaryId)
      ? [primaryId, ...ids.filter((id) => id !== primaryId)]
      : ids;
    let primaryMeasured = false;
    let appliedAny = false;
    for (const id of ordered) {
      const content = measureManualEditTargetContentRect(frame, id);
      if (!content) continue;
      const base = selectedManualEditTargetRef.current?.id === id
        ? selectedManualEditTargetRef.current
        : null;
      if (base) {
        applyManualEditMeasuredGeometry({
          ...base,
          rect: content.rect,
          layoutWidth: content.layoutWidth,
          layoutHeight: content.layoutHeight,
        });
      } else {
        applyManualEditMeasuredGeometry({
          id,
          rect: content.rect,
          layoutWidth: content.layoutWidth,
          layoutHeight: content.layoutHeight,
        } as ManualEditTarget);
      }
      appliedAny = true;
      if (id === primaryId) primaryMeasured = true;
    }
    if (primaryMeasured && primaryId && shouldRefreshHostPaintAfterTipRemountRemasure(true)) {
      refreshManualEditHostPaintRect(primaryId, { force: true });
    }
    // Multi: refresh scale/offset after fit nudges so union tracks post-fit tip (461).
    refreshManualEditHostMetricsAfterTipRemountMulti(frame, appliedAny);
    // Arm one-shot wild-jump skip for late post-latch deck nudges (485).
    if (shouldArmPostTipFitSettleWildJumpSkip(appliedAny, ids.length)) {
      manualEditTipPostFitSettleWildJumpSkipRef.current = true;
    }
    // Last chrome-release fit nudge remasure — release inert; later 900/1600ms
    // remasure only updates geometry (476/478/481). Latch stays for wild-jump.
    if (shouldReleaseTipRemountChromeAfterFitSettleRemasure(
      manualEditTipRemountChromeSuppressedRef.current,
      appliedAny,
      remasureDelayMs,
      TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
    )) {
      manualEditTipRemountChromeSuppressedRef.current = false;
      setManualEditTipRemountChromeSuppressed(false);
      manualEditTipChromeReleaseAfterResizeRef.current = false;
    }
    for (const id of ordered) {
      requestManualEditTargetRemeasure(id, frame);
    }
    return appliedAny;
  }

  // Keep ref current for deck fit onAfterNudge without thrashing fit options (487).
  // rAF coalesce storms; stamp throttle only after a remasure that applied (492/497).
  tipRemasureOnDeckNudgeRef.current = () => {
    if (manualEditTipDeckNudgeRemasureRafRef.current != null) return;
    manualEditTipDeckNudgeRemasureRafRef.current = requestAnimationFrame(() => {
      manualEditTipDeckNudgeRemasureRafRef.current = null;
      const nowMs = Date.now();
      const followUntil = manualEditTipDeckNudgeFollowUntilRef.current;
      const inFollow = shouldRemeasureTipRemountOnDeckHostFitNudge(
        manualEditModeRef.current,
        selectedManualEditTargetIdsRef.current,
        followUntil,
        nowMs,
      );
      // Follow-only path: throttle after coalesce (492).
      if (
        inFollow
        && tipRemountFitSettleExpired(nowMs, manualEditTipRemountFitSettleUntilRef.current)
        && shouldThrottleTipRemountDeckNudgeRemasure(
          manualEditTipDeckNudgeRemasureAtRef.current,
          nowMs,
          TIP_REMOUNT_DECK_NUDGE_REMEASURE_THROTTLE_MS,
        )
      ) {
        return;
      }
      const applied = remeasureTipRemountAfterDeckHostFitSettle(
        iframeRef.current,
        TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
      );
      if (inFollow && applied) {
        manualEditTipDeckNudgeRemasureAtRef.current = nowMs;
      }
    });
  };

  /** Schedule fit-settle remasures aligned with early deck fit nudge delays (460/478/481). */
  function scheduleTipRemountRemasureAfterDeckHostFitSettle(
    getFrame: () => HTMLIFrameElement | null,
  ) {
    manualEditTipRemountFitSettleCancelRef.current?.();
    manualEditTipRemountFitSettleCancelRef.current = null;
    if (!shouldScheduleTipRemountFitSettleRemasureOnLoad(
      manualEditTipRemountFitSettleUntilRef.current,
      Date.now(),
    )) {
      return;
    }
    if (!shouldRemeasureTipRemountAfterDeckHostFitSettle(
      manualEditModeRef.current,
      selectedManualEditTargetIdsRef.current,
      manualEditTipRemountFitSettleUntilRef.current,
      Date.now(),
    )) {
      return;
    }
    // Early DEFAULT_FIT_NUDGE_DELAYS_MS inside tip latch — include 900/1600ms so
    // chrome released at 400ms does not jump on later fit nudges (478/481).
    const delaysMs = [...TIP_REMOUNT_FIT_SETTLE_REMEASURE_DELAYS_MS];
    const timers = delaysMs.map((delay) => window.setTimeout(() => {
      remeasureTipRemountAfterDeckHostFitSettle(getFrame(), delay);
    }, delay));
    manualEditTipRemountFitSettleCancelRef.current = () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }

  function waitForManualEditTargetRemeasure(id: string, timeoutMs = 500) {
    return manualEditRemeasureAwaiterRef.current.waitFor(id, timeoutMs);
  }

  function applyManualEditMeasuredTarget(measured: ManualEditTarget) {
    // Full-merge was unused and would clobber styles/text without fingerprint
    // latch updates. Keep the name for call-site clarity but geometry-only —
    // identity refreshes flow through od-edit-targets (446).
    applyManualEditMeasuredGeometry(measured);
  }

  /** Handoff settle — geometry only; never clobber flushed styles from bridge scan. */
  function applyManualEditMeasuredGeometry(measured: ManualEditTarget) {
    setSelectedManualEditTarget((current) => {
      if (current?.id !== measured.id) return current;
      const nextOffsetLeft = measured.offsetLeft ?? current.offsetLeft;
      const nextOffsetTop = measured.offsetTop ?? current.offsetTop;
      const nextCssPosition = measured.cssPosition ?? current.cssPosition;
      const nextSticky = measured.stickyScrollportId ?? current.stickyScrollportId;
      // Equal geometry — keep prior reference (no selection/overlay churn).
      if (
        manualEditGeometryRoughlyMatches(current, measured)
        && current.offsetLeft === nextOffsetLeft
        && current.offsetTop === nextOffsetTop
        && current.cssPosition === nextCssPosition
        && current.stickyScrollportId === nextSticky
      ) {
        return current;
      }
      const next: ManualEditTarget = {
        ...current,
        rect: measured.rect,
        layoutWidth: measured.layoutWidth,
        layoutHeight: measured.layoutHeight,
        offsetLeft: nextOffsetLeft,
        offsetTop: nextOffsetTop,
        cssPosition: nextCssPosition,
        stickyScrollportId: nextSticky,
      };
      selectedManualEditTargetRef.current = next;
      return next;
    });
    setManualEditTargets((current) =>
      current.map((item) => {
        if (item.id !== measured.id) return item;
        const nextOffsetLeft = measured.offsetLeft ?? item.offsetLeft;
        const nextOffsetTop = measured.offsetTop ?? item.offsetTop;
        const nextCssPosition = measured.cssPosition ?? item.cssPosition;
        const nextSticky = measured.stickyScrollportId ?? item.stickyScrollportId;
        if (
          manualEditGeometryRoughlyMatches(item, measured)
          && item.offsetLeft === nextOffsetLeft
          && item.offsetTop === nextOffsetTop
          && item.cssPosition === nextCssPosition
          && item.stickyScrollportId === nextSticky
        ) {
          return item;
        }
        return {
          ...item,
          rect: measured.rect,
          layoutWidth: measured.layoutWidth,
          layoutHeight: measured.layoutHeight,
          offsetLeft: nextOffsetLeft,
          offsetTop: nextOffsetTop,
          cssPosition: nextCssPosition,
          stickyScrollportId: nextSticky,
        };
      }),
    );
  }

  type ManualEditGestureGeometrySnapshot = {
    rect: ManualEditRect;
    layoutWidth?: number;
    layoutHeight?: number;
    hostPaintRect: ManualEditRect | null;
  };

  function captureManualEditGestureGeometrySnapshot(
    target: ManualEditTarget,
  ): ManualEditGestureGeometrySnapshot {
    const paint = manualEditHostPaintRectRef.current;
    return {
      rect: { ...target.rect },
      layoutWidth: target.layoutWidth,
      layoutHeight: target.layoutHeight,
      hostPaintRect: paint && paint.width >= 1 && paint.height >= 1
        ? { ...paint }
        : null,
    };
  }

  function restoreManualEditGestureGeometry(snapshot: ManualEditGestureGeometrySnapshot) {
    const target = selectedManualEditTargetRef.current;
    if (!target) return;
    setSelectedManualEditTarget((current) => {
      if (!current || current.id !== target.id) return current;
      const next: ManualEditTarget = {
        ...current,
        rect: { ...snapshot.rect },
        layoutWidth: snapshot.layoutWidth ?? current.layoutWidth,
        layoutHeight: snapshot.layoutHeight ?? current.layoutHeight,
      };
      selectedManualEditTargetRef.current = next;
      return next;
    });
    if (snapshot.hostPaintRect) {
      manualEditHostPaintRectRef.current = { ...snapshot.hostPaintRect };
      setManualEditHostPaintRect({ ...snapshot.hostPaintRect });
    } else {
      refreshManualEditHostPaintRect(target.id, { force: true });
    }
  }

  function syncBridgeModes(target: HTMLIFrameElement | null = iframeRef.current) {
    const win = target?.contentWindow;
    if (!win) return;
    win.postMessage({
      type: 'od:comment-mode',
      enabled: boardMode,
      mode: boardTool,
    }, '*');
    win.postMessage({ type: 'od-edit-mode', enabled: manualEditMode }, '*');
    postSelectedManualEditTargetsToIframe(
      manualEditMode ? selectedManualEditTargetIdsRef.current : [],
      manualEditMode ? selectedManualEditTargetIdRef.current : null,
      target,
    );
    win.postMessage({ type: 'od:inspect-mode', enabled: inspectMode }, '*');
    if (effectiveDeck && boardMode) requestSlideStateFromIframe(target);
  }

  /** Clear tip-remount grace latch (id + until) — expiry, consume, or leave. */
  function clearManualEditTipRemountGeometryGrace(
    reason: 'consume' | 'expiry' | 'safety' | 'selection' | 'mode-exit' = 'consume',
  ) {
    // Remasure consume / expiry / safety: keep tip identity protect briefly so
    // the first post-grace od-edit-targets cannot flip Mixed/inspector (468).
    // Selection leave / mode-exit: drop hold so a new target is not painted
    // with the previous tip's styles (469).
    const hadArmedGrace = Boolean(manualEditTipRemountGeometryGraceIdRef.current);
    if (shouldArmTipRemountIdentityHoldOnGraceClear(reason)) {
      if (hadArmedGrace) {
        manualEditTipRemountIdentityHoldUntilRef.current = nextTipRemountIdentityHoldUntilMs(
          Date.now(),
          true,
        );
      }
    } else {
      manualEditTipRemountIdentityHoldUntilRef.current = 0;
    }
    if (shouldClearTipSyncedIdentityStickyRetainOnGraceClear(reason)) {
      manualEditTipSyncedIdentityRetainRef.current = false;
      manualEditTipPostStickySoftLandRef.current = 0;
      manualEditTipPostSoftLandExitLatchRef.current = false;
      manualEditTipPostExitMixedAbsorbRef.current = false;
      manualEditTipPostAbsorbInspectorQuietRef.current = false;
      manualEditTipDeckNudgeFollowUntilRef.current = 0;
      manualEditTipDeckNudgeRemasureAtRef.current = 0;
      manualEditTipChromeReleaseAfterResizeRef.current = false;
      manualEditTipPostFitSettleWildJumpSkipRef.current = false;
      manualEditTipFollowChromeReleaseDeferredRef.current = false;
      if (manualEditTipDeckNudgeFollowChromeTimeoutRef.current != null) {
        window.clearTimeout(manualEditTipDeckNudgeFollowChromeTimeoutRef.current);
        manualEditTipDeckNudgeFollowChromeTimeoutRef.current = null;
      }
      if (manualEditTipDeckNudgeRemasureRafRef.current != null) {
        window.cancelAnimationFrame(manualEditTipDeckNudgeRemasureRafRef.current);
        manualEditTipDeckNudgeRemasureRafRef.current = null;
      }
    }
    manualEditTipRemountGeometryGraceIdRef.current = null;
    manualEditTipRemountGeometryGraceUntilRef.current = 0;
    manualEditTipRemountFitSettleUntilRef.current = 0;
    manualEditTipRemountFitSettleCancelRef.current?.();
    manualEditTipRemountFitSettleCancelRef.current = null;
    if (shouldCancelTipRemountSyncHostMeasureRetry(
      manualEditTipRemountSyncRetryRafRef.current != null,
    )) {
      window.cancelAnimationFrame(manualEditTipRemountSyncRetryRafRef.current!);
      manualEditTipRemountSyncRetryRafRef.current = null;
    }
    manualEditTipRemountChromeSuppressedRef.current = false;
    setManualEditTipRemountChromeSuppressed(false);
    if (manualEditTipRemountChromeSafetyTimeoutRef.current != null) {
      window.clearTimeout(manualEditTipRemountChromeSafetyTimeoutRef.current);
      manualEditTipRemountChromeSafetyTimeoutRef.current = null;
    }
  }

  /** Tip remount unmounts overlays — abort in-flight gesture + live preview (457). */
  function abortManualEditGestureForTipYieldFreezeSync() {
    if (!shouldAbortManualEditGestureForTipYieldFreezeSync(
      manualEditResizeSessionActiveRef.current,
    )) {
      return;
    }
    cancelManualEditStyleDraft();
    manualEditResizeSessionActiveRef.current = false;
    manualEditResizePausedRef.current = false;
    setManualEditResizeDraftSize(null);
    setManualEditMoveDraftPos(null);
    setManualEditGroupDraftRects(null);
  }

  /** Selection left tip-remount grace primary — clear so overlay remasures cleanly. */
  function clearManualEditTipRemountGeometryGraceIfNeeded(
    nextSelectedId: string | null,
  ) {
    if (shouldClearTipRemountGeometryGraceOnSelectionChange(
      manualEditTipRemountGeometryGraceIdRef.current,
      nextSelectedId,
    )) {
      clearManualEditTipRemountGeometryGrace('selection');
      return;
    }
    // Grace already gone — still drop sticky/soft-land/absorb/follow on leave (499).
    if (shouldClearTipPostProtectOnSelectionChange(
      selectedManualEditTargetIdRef.current,
      nextSelectedId,
    )) {
      clearManualEditTipRemountGeometryGrace('selection');
    }
  }

  /** Tip-yield freeze remount — deferred Mixed/single reseed (59). Selection
   *  restore + remasure run from srcDoc onLoad so we do not paint a dying frame (452). */
  function scheduleManualEditSelectionEchoAfterFreezeSync() {
    const selectedIds = selectedManualEditTargetIdsRef.current;
    const echo = shouldEchoManualEditSelectionAfterFreezeSync(
      manualEditModeRef.current,
      selectedIds,
    );
    const reseedMulti = shouldReseedManualEditMultiInspectorAfterFreezeSync(
      manualEditModeRef.current,
      selectedIds,
    );
    if (!echo && !reseedMulti) return;
    // Tip remount would drop host overlays mid-drag — revert live preview first (457).
    abortManualEditGestureForTipYieldFreezeSync();
    // Idle remasure after tip remount may jump layout — skip wild-jump once.
    const graceId = selectedManualEditTargetIdRef.current;
    if (graceId) {
      const nowMs = Date.now();
      const graceUntil = nowMs + 800;
      // Drop stale onLoad sync retry from a prior tip-yield (463).
      if (shouldCancelTipRemountSyncHostMeasureRetry(
        manualEditTipRemountSyncRetryRafRef.current != null,
      )) {
        window.cancelAnimationFrame(manualEditTipRemountSyncRetryRafRef.current!);
        manualEditTipRemountSyncRetryRafRef.current = null;
      }
      manualEditTipRemountGeometryGraceIdRef.current = graceId;
      manualEditTipRemountGeometryGraceUntilRef.current = graceUntil;
      // New tip-remount session owns identity protect (replace stale post-settle hold).
      manualEditTipRemountIdentityHoldUntilRef.current = 0;
      // Sticky retain past timed hold until selection leave (472).
      manualEditTipSyncedIdentityRetainRef.current = true;
      // New tip session replaces any post-sticky soft-land / wild-jump one-shot.
      manualEditTipPostStickySoftLandRef.current = 0;
      manualEditTipPostSoftLandExitLatchRef.current = false;
      manualEditTipPostExitMixedAbsorbRef.current = false;
      manualEditTipPostAbsorbInspectorQuietRef.current = false;
      manualEditTipChromeReleaseAfterResizeRef.current = false;
      manualEditTipPostFitSettleWildJumpSkipRef.current = false;
      manualEditTipDeckNudgeRemasureAtRef.current = 0;
      manualEditTipFollowChromeReleaseDeferredRef.current = false;
      // Follow late deck nudges (2500+) without extending wild-jump latch (487).
      manualEditTipDeckNudgeFollowUntilRef.current = nextTipRemountDeckNudgeFollowUntilMs(
        nowMs,
        true,
        TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS,
      );
      // Safety: release chrome when follow ends if still inert (494/510).
      if (manualEditTipDeckNudgeFollowChromeTimeoutRef.current != null) {
        window.clearTimeout(manualEditTipDeckNudgeFollowChromeTimeoutRef.current);
      }
      manualEditTipDeckNudgeFollowChromeTimeoutRef.current = window.setTimeout(() => {
        manualEditTipDeckNudgeFollowChromeTimeoutRef.current = null;
        const followUntil = manualEditTipDeckNudgeFollowUntilRef.current;
        const ended = followUntil > 0 && Date.now() >= followUntil;
        if (ended) {
          manualEditTipDeckNudgeFollowUntilRef.current = 0;
        }
        const safetyPending = manualEditTipRemountChromeSafetyTimeoutRef.current != null;
        if (shouldReleaseTipRemountChromeWhenDeckNudgeFollowEnds(
          manualEditTipRemountChromeSuppressedRef.current,
          ended,
          // Do not race tip remount safety clear still in flight (499/510).
          safetyPending,
        )) {
          manualEditTipRemountChromeSuppressedRef.current = false;
          setManualEditTipRemountChromeSuppressed(false);
          manualEditTipChromeReleaseAfterResizeRef.current = false;
          manualEditTipFollowChromeReleaseDeferredRef.current = false;
        } else if (shouldDeferTipRemountChromeReleaseAfterFollowEndBlockedBySafety(
          manualEditTipRemountChromeSuppressedRef.current,
          ended,
          safetyPending,
        )) {
          manualEditTipFollowChromeReleaseDeferredRef.current = true;
        }
      }, TIP_REMOUNT_DECK_NUDGE_FOLLOW_MS + 20);
      // Deck host-fit may rescale after onLoad — keep settle latch past grace (460/481).
      const fitSettleUntil = shouldArmTipRemountFitSettleForDeckHostFit(
        deckHostViewportFitActive,
      )
        ? nowMs + TIP_REMOUNT_FIT_SETTLE_LATCH_MS
        : 0;
      manualEditTipRemountFitSettleUntilRef.current = fitSettleUntil;
      // Inert chrome until remasure — keep last rect visible, block gestures (458).
      manualEditTipRemountChromeSuppressedRef.current = true;
      setManualEditTipRemountChromeSuppressed(true);
      if (manualEditTipRemountChromeSafetyTimeoutRef.current != null) {
        window.clearTimeout(manualEditTipRemountChromeSafetyTimeoutRef.current);
      }
      // Escape hatch: remasure never arrives — do not leave chrome stuck (457/460).
      const safetyClearAt = Math.max(graceUntil, fitSettleUntil || graceUntil) + 20;
      manualEditTipRemountChromeSafetyTimeoutRef.current = window.setTimeout(() => {
        manualEditTipRemountChromeSafetyTimeoutRef.current = null;
        if (manualEditTipRemountGeometryGraceUntilRef.current === graceUntil) {
          clearManualEditTipRemountGeometryGrace('safety');
        } else if (shouldFlushDeferredTipRemountChromeReleaseAfterSafety(
          manualEditTipFollowChromeReleaseDeferredRef.current,
          manualEditTipRemountChromeSuppressedRef.current,
          false,
        )) {
          // Follow-end was blocked by this safety timeout — flush chrome (510).
          manualEditTipRemountChromeSuppressedRef.current = false;
          setManualEditTipRemountChromeSuppressed(false);
          manualEditTipChromeReleaseAfterResizeRef.current = false;
          manualEditTipFollowChromeReleaseDeferredRef.current = false;
        }
      }, Math.max(0, safetyClearAt - Date.now()));
    }
    if (manualEditFreezeEchoTimeoutRef.current != null) {
      window.clearTimeout(manualEditFreezeEchoTimeoutRef.current);
      manualEditFreezeEchoTimeoutRef.current = null;
    }
    manualEditFreezeEchoTimeoutRef.current = window.setTimeout(() => {
      manualEditFreezeEchoTimeoutRef.current = null;
      const ids = selectedManualEditTargetIdsRef.current;
      // Selection echo / remasure: srcDoc onLoad → syncBridgeModes + remasure (452).
      if (!shouldReseedManualEditMultiInspectorAfterFreezeSync(
        manualEditModeRef.current,
        ids,
      )) {
        // 2→1 / clear during deferred tip-yield — drop stale Mixed (기획 59).
        if (shouldClearMixedKeysAfterTipYieldReseedSkip(ids)) {
          setManualEditMixedStyleKeys(new Set());
          const pending = manualEditPendingStyleRef.current;
          const pendingOwns = concurrentPendingOwnsTipYieldReseedStyles(
            pending
              ? { styles: pending.styles, perTargetStyles: pending.perTargetStyles }
              : null,
          );
          // Mixed→single: reseed inspector from painted source (not empty shell).
          if (shouldReseedSingleInspectorAfterTipYieldMixedClear(ids, pendingOwns)) {
            const base = sourceRef.current ?? '';
            const parsedDoc = parseManualEditSource(base);
            const seedId = ids[0]!;
            const snapshot = readManualEditTargetSnapshot(base, seedId, {}, parsedDoc);
            // Tip source may have dropped the node — do not wipe styles/fields
            // with an empty snapshot shell (416 side effect).
            if (!shouldApplyTipYieldSingleInspectorSnapshot(snapshot.outerHtml)) {
              setManualEditDraft((current) => (
                current.fullSource === base ? current : { ...current, fullSource: base }
              ));
            } else {
              const primary = selectedManualEditTargetRef.current;
              setManualEditDraft((current) => ({
                ...current,
                text: snapshot.fields.text
                  ?? (primary?.id === seedId ? primary.fields.text ?? primary.text : undefined)
                  ?? current.text,
                href: snapshot.fields.href
                  ?? (primary?.id === seedId ? primary.fields.href : undefined)
                  ?? current.href,
                src: snapshot.fields.src
                  ?? (primary?.id === seedId ? primary.fields.src : undefined)
                  ?? current.src,
                alt: snapshot.fields.alt
                  ?? (primary?.id === seedId ? primary.fields.alt : undefined)
                  ?? current.alt,
                styles: snapshot.styles,
                attributesText: JSON.stringify(snapshot.attributes, null, 2),
                outerHtml: snapshot.outerHtml,
                fullSource: base,
              }));
              // Keep selected target identity aligned with painted tip (426).
              // Also refresh manualEditTargets membership for the same seed (435).
              if (shouldSyncSelectedTargetIdentityAfterTipYieldSingleReseed(
                primary?.id,
                seedId,
              )) {
                setSelectedManualEditTarget((current) => {
                  if (!current || current.id !== seedId) return current;
                  const next = {
                    ...current,
                    text: snapshot.fields.text ?? current.text,
                    fields: { ...current.fields, ...snapshot.fields },
                    attributes: snapshot.attributes,
                    styles: resolveTipYieldIdentityStyles(
                      snapshot.styles,
                      current.styles,
                      true,
                    ),
                    outerHtml: snapshot.outerHtml || current.outerHtml,
                  };
                  selectedManualEditTargetRef.current = next;
                  // Avoid redundant identity reseed on the next bridge broadcast (440).
                  manualEditSelectedIdentityFingerprintRef.current =
                    manualEditTargetsIdentityFingerprint([next]);
                  return next;
                });
                setManualEditTargets((current) => {
                  const nextList = current.map((item) => {
                    if (item.id !== seedId) return item;
                    return {
                      ...item,
                      text: snapshot.fields.text ?? item.text,
                      fields: { ...item.fields, ...snapshot.fields },
                      attributes: snapshot.attributes,
                      styles: resolveTipYieldIdentityStyles(
                        snapshot.styles,
                        item.styles,
                        true,
                      ),
                      outerHtml: snapshot.outerHtml || item.outerHtml,
                    };
                  });
                  manualEditTargetsIdentityFingerprintRef.current =
                    manualEditTargetsIdentityFingerprint(nextList);
                  return nextList;
                });
              }
            }
          }
          // 2→1 tip-yield: host paint may still track the prior multi primary.
          // Skip while tip-remount grace is active — force measure can stamp a
          // pre-layout wild rect; od-edit-rect owns geometry during grace (430).
          {
            const paintId = selectedManualEditTargetIdRef.current ?? ids[0]!;
            if (shouldRefreshHostPaintAfterTipYieldSingleReseed(ids, {
              graceId: manualEditTipRemountGeometryGraceIdRef.current,
              paintId,
              nowMs: Date.now(),
              graceUntilMs: manualEditTipRemountGeometryGraceUntilRef.current,
            })) {
              refreshManualEditHostPaintRect(paintId, { force: true });
            }
          }
        }
        return;
      }
      // Source-only reseed (same plan helper as batch flush / cancel) — 기획 59.
      // Pending with draft keys owns styles (null); empty shell allows source merge.
      // Tip Mixed must not merge preview target.styles (451/465).
      const base = sourceRef.current ?? '';
      const parsedDoc = parseManualEditSource(base);
      const pending = manualEditPendingStyleRef.current;
      const concurrentPending = pending
        ? { styles: pending.styles, perTargetStyles: pending.perTargetStyles }
        : null;
      const tipYieldSourceOnly = shouldReadMultiInspectorStylesFromSourceOnly('tip-yield');
      // Tip-yield Mixed is always source-only — never merge preview styles (465).
      if (!tipYieldSourceOnly) {
        // Unreachable: tip-yield reason always returns true.
      }
      const reseed = planManualEditMultiInspectorReseed({
        selectedIds: ids,
        readStyles: (id) => readManualEditStyles(base, id, {}, parsedDoc),
        concurrentPending,
      });
      setManualEditMixedStyleKeys(reseed.mixedKeys);
      const pendingOwns = concurrentPendingOwnsTipYieldReseedStyles(concurrentPending);
      const primaryId = selectedManualEditTargetIdRef.current ?? ids[ids.length - 1]!;
      const primarySnapshot = readManualEditTargetSnapshot(base, primaryId, {}, parsedDoc);
      // Multi tip-yield: sync identity for every selected id from painted tip (449).
      if (shouldSyncSelectedTargetsIdentityAfterTipYieldMultiReseed(ids)) {
        const snapshotsById = new Map(
          ids.map((id) => [id, readManualEditTargetSnapshot(base, id, {}, parsedDoc)] as const),
        );
        setManualEditTargets((current) => {
          const nextList = current.map((item) => {
            const snapshot = snapshotsById.get(item.id);
            if (!snapshot || !shouldApplyTipYieldSingleInspectorSnapshot(snapshot.outerHtml)) {
              return item;
            }
            return {
              ...item,
              text: snapshot.fields.text ?? item.text,
              fields: { ...item.fields, ...snapshot.fields },
              attributes: snapshot.attributes,
              // Tip source wins — do not merge pre-tip preview styles (465).
              styles: resolveTipYieldIdentityStyles(
                snapshot.styles,
                item.styles,
                true,
              ),
              outerHtml: snapshot.outerHtml || item.outerHtml,
            };
          });
          manualEditTargetsIdentityFingerprintRef.current =
            manualEditTargetsIdentityFingerprint(nextList);
          const selectedForFp = resolveManualEditTargetsByIds(ids, nextList);
          manualEditSelectedIdentityFingerprintRef.current =
            manualEditTargetsIdentityFingerprint(selectedForFp);
          return nextList;
        });
        setSelectedManualEditTarget((current) => {
          if (!current) return current;
          const snapshot = snapshotsById.get(current.id);
          if (!snapshot || !shouldApplyTipYieldSingleInspectorSnapshot(snapshot.outerHtml)) {
            return current;
          }
          const next = {
            ...current,
            text: snapshot.fields.text ?? current.text,
            fields: { ...current.fields, ...snapshot.fields },
            attributes: snapshot.attributes,
            styles: resolveTipYieldIdentityStyles(
              snapshot.styles,
              current.styles,
              true,
            ),
            outerHtml: snapshot.outerHtml || current.outerHtml,
          };
          selectedManualEditTargetRef.current = next;
          return next;
        });
      }
      // Never clobber in-flight draft styles while pending owns the panel.
      // Always refresh primary fields from tip when snapshot is usable (449).
      const primaryFieldsUsable = shouldApplyTipYieldSingleInspectorSnapshot(
        primarySnapshot.outerHtml,
      );
      if (reseed.styles != null && !pendingOwns) {
        setManualEditDraft((current) => ({
          ...current,
          text: primaryFieldsUsable
            ? (primarySnapshot.fields.text ?? current.text)
            : current.text,
          href: primaryFieldsUsable
            ? (primarySnapshot.fields.href ?? current.href)
            : current.href,
          src: primaryFieldsUsable
            ? (primarySnapshot.fields.src ?? current.src)
            : current.src,
          alt: primaryFieldsUsable
            ? (primarySnapshot.fields.alt ?? current.alt)
            : current.alt,
          styles: reseed.styles!,
          fullSource: base,
        }));
      } else if (reseed.styles == null) {
        setManualEditDraft((current) => {
          const next = current.fullSource === base ? current : { ...current, fullSource: base };
          if (!primaryFieldsUsable) return next;
          return {
            ...next,
            text: primarySnapshot.fields.text ?? next.text,
            href: primarySnapshot.fields.href ?? next.href,
            src: primarySnapshot.fields.src ?? next.src,
            alt: primarySnapshot.fields.alt ?? next.alt,
          };
        });
      } else if (primaryFieldsUsable) {
        // Pending owns styles — still align primary text fields with tip.
        setManualEditDraft((current) => ({
          ...current,
          text: primarySnapshot.fields.text ?? current.text,
          href: primarySnapshot.fields.href ?? current.href,
          src: primarySnapshot.fields.src ?? current.src,
          alt: primarySnapshot.fields.alt ?? current.alt,
          fullSource: base,
        }));
      }
    }, 0);
  }

  // Style saves leave the edit-mode freeze alone (postMessage live preview).
  // When srcDoc remounts mid-edit, re-apply saved-vs-freeze diffs plus any
  // still-pending draft so the canvas does not look reverted.
  function replayManualEditStylesToIframe(target: HTMLIFrameElement | null = iframeRef.current) {
    if (!manualEditMode) return;
    // Temporarily point the shared preview helper at the remounting frame so
    // host fallback (`applyManualEditPreviewStylesToDocument`) runs too —
    // postMessage-only misses bridge-less / late-bridge / path-* targets.
    const previous = iframeRef.current;
    if (target && target !== previous) iframeRef.current = target;
    try {
      const patches = manualEditStyleReplayPatches(
        manualEditFrozenSource,
        sourceRef.current,
      );
      for (const patch of patches) {
        previewStyleToIframe(patch.id, patch.styles, nextManualEditPreviewVersion());
      }
      const pending = manualEditPendingStyleRef.current;
      if (!pending) return;
      if (pending.perTargetStyles) {
        for (const [id, styles] of Object.entries(pending.perTargetStyles)) {
          previewStyleToIframe(id, styles, pending.version);
        }
        return;
      }
      const pendingIds = pending.targetIds ?? [pending.id];
      for (const id of pendingIds) {
        previewStyleToIframe(id, pending.styles, pending.version);
      }
    } finally {
      if (target && target !== previous) iframeRef.current = previous;
    }
  }

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:inspect-mode', enabled: inspectMode }, '*');
  }, [inspectMode, srcDoc, useUrlLoadPreview]);

  // Mirror the bridge's `od:comment-targets` broadcast into
  // `liveCommentTargets` whenever EITHER Inspect or Comments mode is
  // active. The boardMode-only useEffect below still handles its
  // own comment-specific events (hover / click target / pod), but
  // the targets list itself is mode-agnostic — it's just "which
  // elements on the page carry data-od-id / data-screen-label".
  // Without this listener Inspect mode never learns the artifact's
  // annotation count, and the empty-state hint added for #890 would
  // misfire (always firing in Inspect mode, even on annotated
  // artifacts) because the comment-mode listener short-circuits on
  // `!boardMode`. Issue #890.
  useEffect(() => {
    if (!effectiveDeck || !boardMode) return;
    requestSlideStateFromIframe();
  }, [effectiveDeck, boardMode, previewStateKey, srcDoc, useUrlLoadPreview]);

  useEffect(() => {
    if (!inspectMode && !boardMode) {
      setLiveCommentTargets((current) => (current.size > 0 ? new Map() : current));
      return;
    }
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      const data = ev.data as
        | {
            type?: string;
            targets?: Array<Partial<PreviewCommentSnapshot>>;
          }
        | null;
      if (data?.type !== 'od:comment-targets' || !Array.isArray(data.targets)) return;
      const next = new Map<string, PreviewCommentSnapshot>();
      data.targets.forEach((item) => {
        const elementId = String(item?.elementId || '');
        if (!elementId) return;
        const position = {
          x: clampBridgeCoordinate(item?.position?.x),
          y: clampBridgeCoordinate(item?.position?.y),
          width: clampBridgeCoordinate(item?.position?.width),
          height: clampBridgeCoordinate(item?.position?.height),
        };
        if (!isValidCommentOverlayPosition(position)) return;
        next.set(elementId, {
          filePath: file.name,
          elementId,
          selector: String(item?.selector || ''),
          label: String(item?.label || ''),
          text: String(item?.text || ''),
          position,
          htmlHint: String(item?.htmlHint || ''),
          style: normalizeAnnotationStyle(item?.style),
          selectionKind: 'element',
          memberCount: undefined,
          ...(typeof item?.slideIndex === 'number' ? { slideIndex: item.slideIndex } : {}),
        });
      });
      setLiveCommentTargets((current) => (
        liveCommentTargetMapsEqual(current, next) ? current : next
      ));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [inspectMode, boardMode, file.name, isOurPreviewIframeSource]);

  useEffect(() => {
    setActiveCommentTarget(null);
    setHoveredCommentTarget(null);
    setLiveCommentTargets(new Map());
    setCommentDraft('');
    setActiveCommentExistingAttachments([]);
    setActiveInspectTarget(null);
    setInspectOverrides({});
    setInspectSavedAt(null);
    setInspectError(null);
    setQueuedBoardNotes([]);
    setStrokePoints([]);
    setManualEditFrozenSource(null);
    setManualEditViewportWidth(null);
    setManualEditTargets([]);
    manualEditTargetsIdentityFingerprintRef.current = '';
    manualEditSelectedIdentityFingerprintRef.current = '';
    setSelectedManualEditTarget(null);
    setSelectedManualEditTargetIds([]);
    setManualEditMixedStyleKeys(new Set());
    setManualEditPanelPosition(null);
    setManualEditPanelCollapsed(false);
    manualEditPanelUserPinnedRef.current = false;
    manualEditPanelPaintPinnedIdRef.current = null;
    selectedManualEditTargetIdRef.current = null;
    selectedManualEditTargetRef.current = null;
    selectedManualEditTargetIdsRef.current = [];
    setManualEditDraft(emptyManualEditDraft());
    commitRevisionStack(createRevisionStackSnapshot([], null));
    clearRevisionContentCacheForFile(projectId, file.name);
    setManualEditError(null);
    setRevisionHistoryOpen(false);
    setRevisionStackInvalidated(false);
    setRevisionConflictToast(null);
    setRevisionDiskSyncToast(null);
    revisionDiskSyncFailedTargetRef.current = null;
    revisionConflictSuppressedRef.current = false;
    revisionInitialReconcileRef.current = true;
    setRevisionRetentionLimit(FILE_REVISION_RETENTION_LIMIT_DEFAULT);
    setRevisionRetentionPending(false);
    manualEditPendingStyleRef.current = null;
    clearManualEditStyleTimer();
    manualEditResizePausedRef.current = false;
    setManualEditResizeDraftSize(null);
    setManualEditMoveDraftPos(null);
    setManualEditGroupDraftRects(null);
    // Artifact switch: cancel confirm-refuse tip-prefer suppress + tip remount grace
    // (generation bump below would otherwise leave suppress stuck with no commit).
    manualEditSuppressTipPreferUntilRefreshRef.current = nextTipPreferSuppressState(
      'artifact-switch',
    );
    clearManualEditTipRemountGeometryGrace('mode-exit');
    return () => {
      // Drop in-flight reconcile/refresh work so unmount cannot overwrite
      // persisted revision cursor state in sessionStorage after a tab switch.
      revisionReconcileGenerationRef.current += 1;
      revisionRefreshGenerationRef.current += 1;
      revisionRefreshActiveRetryRef.current = 0;
      revisionRefreshListRetryRef.current = 0;
      // Generation bump cancels refresh before commit/give-up — clear suppress here.
      manualEditSuppressTipPreferUntilRefreshRef.current = nextTipPreferSuppressState(
        'artifact-switch',
      );
      clearManualEditTipRemountGeometryGrace('mode-exit');
    };
  }, [file.name]);

  const resolveRevisionSnapshotContent = useCallback(async (revisionId: string): Promise<string | null> => {
    const cached = getRevisionContentCache(projectId, file.name, revisionId);
    if (cached != null) return cached;
    const response = await fetchProjectFileRevisionContent(projectId, file.name, revisionId);
    if (response?.content == null) return null;
    if (shouldCacheRevisionContent(response.content)) {
      setRevisionContentCache(projectId, file.name, revisionId, response.content);
    }
    return response.content;
  }, [projectId, file.name]);

  const reconcileRevisionWithDisk = useCallback(async (
    preloadedList?: Awaited<ReturnType<typeof listProjectFileRevisions>>,
  ) => {
    if (revisionSyncSuppressRef.current || manualEditSavingRef.current) return;
    const reconcileGeneration = revisionReconcileGenerationRef.current;
    const stack = revisionStackRef.current;
    const cursor = cursorRevisionFromStack(stack);
    if (!cursor) return;
    const cursorRevisionId = cursor.id;
    // Consume the "first reconcile after mount" flag once — the ref flips
    // regardless of which reconcile branch we take, so a benign initial
    // reconcile (cursor already matches disk) still hands the toast privilege
    // over to whatever the NEXT reconcile decides.
    const isInitialReconcile = revisionInitialReconcileRef.current;
    revisionInitialReconcileRef.current = false;

    const [disk, snapshotContent, list] = await Promise.all([
      fetchProjectFileText(projectId, file.name, {
        cache: 'no-store',
        cacheBustKey: Date.now(),
      }),
      resolveRevisionSnapshotContent(cursorRevisionId),
      preloadedList ?? listProjectFileRevisions(projectId, file.name),
    ]);
    if (
      revisionSyncSuppressRef.current
      || manualEditSavingRef.current
      || isStaleRevisionReconcile(reconcileGeneration)
      || revisionStackRef.current.cursorRevisionId !== cursorRevisionId
    ) {
      return;
    }
    if (disk == null || snapshotContent == null) return;
    if (revisionDiskSyncFailedTargetRef.current?.id === cursorRevisionId) {
      setRevisionStackInvalidated(false);
      return;
    }
    if (revisionCursorMatchesDisk(revisionStackRef.current, disk, snapshotContent)) {
      setRevisionStackInvalidated(false);
      return;
    }

    const previewMatchesSnapshot = (candidate: string | null) => (
      revisionSnapshotContentMatches(candidate, snapshotContent)
    );
    const previewAlignedWithCursor =
      previewMatchesSnapshot(sourceRef.current)
      || (
        previewMatchesSnapshot(lastStablePreviewSourceRef.current)
        && sourceRef.current === disk
        && disk !== snapshotContent
      );
    const previewSourceForReconcile = previewAlignedWithCursor
      ? snapshotContent
      : sourceRef.current;

    if (!list) {
      if (previewAlignedWithCursor) {
        setRevisionStackInvalidated(false);
        setRevisionConflictToast(null);
        return;
      }
      if (revisionRefreshListRetryRef.current < 8) {
        revisionRefreshListRetryRef.current += 1;
        window.setTimeout(() => {
          if (!isStaleRevisionReconcile(reconcileGeneration)) {
            void reconcileRevisionWithDisk();
          }
        }, 250);
      }
      return;
    }
    revisionRefreshListRetryRef.current = 0;
    if (typeof list.retentionLimit === 'number') {
      setRevisionRetentionLimit(list.retentionLimit);
    }
    setRevisionRetentionPending(list.retentionPending === true);
    const headRevision = list.revisions.find((revision) => revision.id === list.headRevisionId);
    const activeSequence = getActiveRevisionSequence(projectId, file.name);
    const userAtHeadRevision = activeSequence == null
      || (headRevision != null && activeSequence === headRevision.sequence);

    const matchingRevision = await findRevisionMatchingDiskContent(
      list.revisions,
      disk,
      resolveRevisionSnapshotContent,
      new Set([cursorRevisionId]),
    );
    const anyKnownDiskRevision = await findRevisionMatchingDiskContent(
      list.revisions,
      disk,
      resolveRevisionSnapshotContent,
    );
    if (
      revisionSyncSuppressRef.current
      || manualEditSavingRef.current
      || isStaleRevisionReconcile(reconcileGeneration)
    ) {
      return;
    }

    if (!anyKnownDiskRevision && disk !== snapshotContent) {
      if (previewAlignedWithCursor) {
        setRevisionStackInvalidated(false);
        setRevisionConflictToast(null);
        return;
      }
      if (isStaleRevisionReconcile(reconcileGeneration)) {
        return;
      }
      if (sourceRef.current !== disk) {
        setSource(disk);
        sourceRef.current = disk;
        setInlinedSource(null);
        setManualEditFrozenSource(disk);
        setManualEditDraft((current) => ({ ...current, fullSource: disk }));
        if (useUrlLoadPreview) setReloadKey((k) => k + 1);
        manualEditPendingStyleRef.current = null;
      }
      setRevisionStackInvalidated(true);
      // Silent on the first reconcile after mount — see
      // revisionInitialReconcileRef declaration for rationale. Undo/redo still
      // gets disabled (setRevisionStackInvalidated above) so the user cannot
      // accidentally overwrite disk with a stale snapshot.
      if (!revisionConflictSuppressedRef.current && !isInitialReconcile) {
        setRevisionConflictToast(revisionConflictMessageRef.current);
      }
      const head = list.revisions.find((revision) => revision.id === list.headRevisionId);
      if (head) {
        setActiveRevisionSequence(projectId, file.name, head.sequence);
        warmRevisionListSoftCacheFromList(projectId, file.name, head.sequence, list);
      } else {
        clearActiveRevisionSequence(projectId, file.name);
      }
      commitRevisionStack(createRevisionStackSnapshot(
        list.revisions,
        list.headRevisionId,
        list.headRevisionId,
      ));
      return;
    }

    // Revision head snapshot is authoritative when scratch / S3 lag behind postgres.
    if (
      list.headRevisionId
      && shouldApplyHeadRevisionSnapshotAuthority(
        cursor,
        headRevision,
        userAtHeadRevision,
        disk,
        snapshotContent,
        matchingRevision,
      )
    ) {
      setRevisionStackInvalidated(false);
      revisionConflictSuppressedRef.current = false;
      setRevisionConflictToast(null);
      if (sourceRef.current !== snapshotContent) {
        setSource(snapshotContent);
        sourceRef.current = snapshotContent;
        lastStablePreviewSourceRef.current = snapshotContent;
        rememberStablePreviewSource(projectId, file.name, snapshotContent);
        setInlinedSource(null);
        setManualEditFrozenSource(snapshotContent);
        setManualEditDraft((current) => ({ ...current, fullSource: snapshotContent }));
        if (useUrlLoadPreview) setReloadKey((k) => k + 1);
        manualEditPinnedSourceRef.current = null;
        manualEditPendingStyleRef.current = null;
      }
      return;
    }

    if (matchingRevision) {
      const reconcileOutcome = classifyRevisionDiskReconcile({
        cursor,
        headRevision,
        activeSequence,
        diskContent: disk,
        cursorSnapshotContent: snapshotContent,
        previewSource: previewSourceForReconcile,
        matchingRevision,
      });

      if (
        reconcileOutcome === 'sync_lag_head_disk'
        || reconcileOutcome === 'preserve_history_cursor'
      ) {
        setRevisionStackInvalidated(false);
        setRevisionConflictToast(null);
        return;
      }

      if (reconcileOutcome === 'adopt_matching_disk') {
        commitRevisionStack(createRevisionStackSnapshot(
          list.revisions,
          list.headRevisionId,
          matchingRevision.id,
        ));
        if (isStaleRevisionReconcile(reconcileGeneration)) {
          return;
        }
        setActiveRevisionSequence(projectId, file.name, matchingRevision.sequence);
        warmRevisionListSoftCacheFromList(
          projectId,
          file.name,
          matchingRevision.sequence,
          list,
        );
        setRevisionStackInvalidated(false);
        revisionConflictSuppressedRef.current = false;
        setRevisionConflictToast(null);

        if (sourceRef.current !== disk) {
          setSource(disk);
          sourceRef.current = disk;
          setInlinedSource(null);
          setManualEditFrozenSource(disk);
          setManualEditDraft((current) => ({ ...current, fullSource: disk }));
          if (useUrlLoadPreview) setReloadKey((k) => k + 1);
          manualEditPendingStyleRef.current = null;
        }
        return;
      }
    }

    const reconcileOutcomeWithoutMatch = classifyRevisionDiskReconcile({
      cursor,
      headRevision,
      activeSequence,
      diskContent: disk,
      cursorSnapshotContent: snapshotContent,
      previewSource: previewSourceForReconcile,
      matchingRevision: null,
    });

    if (reconcileOutcomeWithoutMatch === 'preserve_history_cursor') {
      setRevisionStackInvalidated(false);
      setRevisionConflictToast(null);
      return;
    }

    if (reconcileOutcomeWithoutMatch !== 'external_conflict') {
      return;
    }

    if (isStaleRevisionReconcile(reconcileGeneration)) {
      return;
    }

    if (sourceRef.current !== disk) {
      setSource(disk);
      sourceRef.current = disk;
      setInlinedSource(null);
      setManualEditFrozenSource(disk);
      setManualEditDraft((current) => ({ ...current, fullSource: disk }));
      if (useUrlLoadPreview) setReloadKey((k) => k + 1);
      manualEditPendingStyleRef.current = null;
    }

    setRevisionStackInvalidated(true);
    // Silent on the first reconcile after mount — see the sibling
    // `!anyKnownDiskRevision` branch above for the same rationale. Undo/redo
    // still gets disabled so the user cannot overwrite disk with a stale
    // snapshot; only the toast is suppressed on entry.
    if (!revisionConflictSuppressedRef.current && !isInitialReconcile) {
      setRevisionConflictToast(revisionConflictMessageRef.current);
    }
    const head = list.revisions.find((revision) => revision.id === list.headRevisionId);
    if (head) {
      setActiveRevisionSequence(projectId, file.name, head.sequence);
      warmRevisionListSoftCacheFromList(projectId, file.name, head.sequence, list);
    } else {
      clearActiveRevisionSequence(projectId, file.name);
    }
    commitRevisionStack(createRevisionStackSnapshot(
      list.revisions,
      list.headRevisionId,
      list.headRevisionId,
    ));
  }, [projectId, file.name, resolveRevisionSnapshotContent, useUrlLoadPreview]);

  const refreshRevisionStack = useCallback(async () => {
    const refreshGeneration = ++revisionRefreshGenerationRef.current;
    const list = await listProjectFileRevisions(projectId, file.name);
    // Generation mismatch: keep tip-prefer suppress latch (newer refresh / artifact-switch owns release).
    if (refreshGeneration !== revisionRefreshGenerationRef.current) return;
    if (!list || !Array.isArray(list.revisions)) {
      if (revisionRefreshListRetryRef.current < 8) {
        revisionRefreshListRetryRef.current += 1;
        window.setTimeout(() => {
          if (refreshGeneration === revisionRefreshGenerationRef.current) {
            void refreshRevisionStack();
          }
        }, 250);
      } else {
        // Give up — stop confirm-refuse tip-prefer suppress so disk can recover.
        manualEditSuppressTipPreferUntilRefreshRef.current = nextTipPreferSuppressState(
          'refresh-gave-up',
        );
      }
      return;
    }
    revisionRefreshListRetryRef.current = 0;
    // Warm soft-cache so tip-lag disk soft-retries reuse this list.
    // Prefer active → head → tip (revisions ascend; [0] is oldest).
    {
      const softSeq = getActiveRevisionSequence(projectId, file.name)
        ?? list.revisions.find((revision) => revision.id === list.headRevisionId)?.sequence
        ?? list.revisions.at(-1)?.sequence;
      if (typeof softSeq === 'number') {
        warmRevisionListSoftCacheFromList(projectId, file.name, softSeq, list);
      }
    }
    if (typeof list.retentionLimit === 'number') {
      setRevisionRetentionLimit(list.retentionLimit);
    }
    setRevisionRetentionPending(list.retentionPending === true);
    const previousCursorId = revisionStackRef.current.cursorRevisionId;
    const previousCursor = previousCursorId
      ? revisionStackRef.current.revisions.find((revision) => revision.id === previousCursorId) ?? null
      : null;
    const activeSeq = getActiveRevisionSequence(projectId, file.name);
    const activeMissingFromList = activeSeq != null
      && !list.revisions.some((revision) => revision.sequence === activeSeq);
    // Tip list lag: keep SSOT and retry shortly — do not fall back to an older
    // cursor and rewrite activeSequence downward.
    if (activeMissingFromList) {
      if (revisionRefreshActiveRetryRef.current < 8) {
        revisionRefreshActiveRetryRef.current += 1;
        window.setTimeout(() => {
          if (refreshGeneration === revisionRefreshGenerationRef.current) {
            void refreshRevisionStack();
          }
        }, 250);
      } else {
        // Give up — stop confirm-refuse tip-prefer suppress so disk can recover.
        manualEditSuppressTipPreferUntilRefreshRef.current = nextTipPreferSuppressState(
          'refresh-gave-up',
        );
      }
      return;
    }
    revisionRefreshActiveRetryRef.current = 0;
    const nextCursorId = resolveRevisionCursorId(list.revisions, list.headRevisionId, {
      currentCursorRevisionId: previousCursorId,
      activeSequence: activeSeq,
    });
    const nextCursor = nextCursorId
      ? list.revisions.find((revision) => revision.id === nextCursorId) ?? null
      : null;
    // activeSequence SSOT moved the cursor (agent tip advance OR toast Undo
    // demote). Drop restore/save pin, paint the target revision HTML (cache
    // then snapshot fetch), and sync Manual Edit freeze so preview cannot
    // stay on the previous commit.
    const cursorMovedByActiveSequence =
      previousCursor != null
      && nextCursor != null
      && previousCursor.id !== nextCursor.id;
    if (cursorMovedByActiveSequence && nextCursorId) {
      manualEditPinnedSourceRef.current = null;
      let targetHtml = getRevisionContentCache(projectId, file.name, nextCursorId);
      if (targetHtml == null) {
        targetHtml = await resolveRevisionSnapshotContent(nextCursorId);
      }
      if (refreshGeneration !== revisionRefreshGenerationRef.current) return;
      if (targetHtml != null) {
        // Same HTML already painted — sync refs/stack only (skip freeze remount
        // + style-replay tax when tip advance lands on unchanged content).
        const contentUnchanged = targetHtml === sourceRef.current;
        revisionSkipReconcileOnceRef.current = true;
        if (!contentUnchanged) {
          // Changed tip content — paint + repair/cache + draft + freeze remount.
          setSource(targetHtml);
          sourceRef.current = targetHtml;
          lastStablePreviewSourceRef.current = targetHtml;
          exportHtmlSnapshotGateRef.current = targetHtml;
          rememberStablePreviewSource(projectId, file.name, targetHtml);
          setManualEditDraft((current) => (
            current.fullSource === targetHtml ? current : { ...current, fullSource: targetHtml! }
          ));
          setManualEditFrozenSource(targetHtml);
          // srcdoc updates via setSource; URL-load still needs reloadKey bust.
          if (useUrlLoadPreview) setReloadKey((key) => key + 1);
        } else {
          // Identical HTML already painted — skip setSource/reloadKey;
          // sync drifted freeze/gate/stable/draft without remount tax.
          // Use frozen ref (callback may close over a stale freeze state).
          if (manualEditFrozenSourceRef.current !== targetHtml) {
            setManualEditFrozenSource(targetHtml);
          }
          if (lastStablePreviewSourceRef.current !== targetHtml) {
            lastStablePreviewSourceRef.current = targetHtml;
          }
          if (exportHtmlSnapshotGateRef.current !== targetHtml) {
            exportHtmlSnapshotGateRef.current = targetHtml;
          }
          setManualEditDraft((current) =>
            current.fullSource === targetHtml
              ? current
              : { ...current, fullSource: targetHtml! },
          );
        }
      }
    }
    if (refreshGeneration !== revisionRefreshGenerationRef.current) return;
    const nextStack = createRevisionStackSnapshot(
      list.revisions,
      list.headRevisionId,
      nextCursorId,
    );
    commitRevisionStack(nextStack);
    // Confirm-refuse suppress ends once warm stack is replaced with list tip.
    manualEditSuppressTipPreferUntilRefreshRef.current = nextTipPreferSuppressState(
      'refresh-committed',
    );
    const cursorRevision = nextStack.revisions.find((revision) => revision.id === nextStack.cursorRevisionId);
    if (cursorRevision) {
      setActiveRevisionSequence(projectId, file.name, cursorRevision.sequence);
      // Re-key soft-cache to the cursor/tip seq (not the oldest fallback).
      warmRevisionListSoftCacheFromList(
        projectId,
        file.name,
        cursorRevision.sequence,
        list,
      );
    } else {
      clearActiveRevisionSequence(projectId, file.name);
    }
    // Do not skip reconcile solely because we hydrated an older undo cursor —
    // classifyRevisionDiskReconcile already preserves history browse vs lag.
    // Only honor an explicit one-shot skip (restore paint / tip advance).
    const skipReconcile = revisionSkipReconcileOnceRef.current;
    revisionSkipReconcileOnceRef.current = false;
    if (!skipReconcile) {
      await reconcileRevisionWithDisk(list);
    }
    if (refreshGeneration !== revisionRefreshGenerationRef.current) return;
    const before = revisionBeforeCursor(revisionStackRef.current);
    const after = revisionAfterCursor(revisionStackRef.current);
    prefetchRevisionContents(
      projectId,
      file.name,
      [before, after]
        .filter((revision): revision is FileRevision => Boolean(revision))
        .map((revision) => ({ revisionId: revision.id, byteSize: revision.byteSize })),
      (revisionId) => resolveRevisionSnapshotContent(revisionId),
    );
  }, [projectId, file.name, reconcileRevisionWithDisk, resolveRevisionSnapshotContent, useUrlLoadPreview]);

  /** Coalesce tip-push deferred list GET; clear on artifact switch / unmount. */
  const scheduleDeferredRevisionStackRefresh = useCallback(() => {
    if (deferredRevisionRefreshTimerRef.current) {
      clearTimeout(deferredRevisionRefreshTimerRef.current);
    }
    deferredRevisionRefreshTimerRef.current = setTimeout(() => {
      deferredRevisionRefreshTimerRef.current = null;
      void refreshRevisionStack();
    }, 250);
  }, [refreshRevisionStack]);

  useEffect(() => () => {
    if (deferredRevisionRefreshTimerRef.current) {
      clearTimeout(deferredRevisionRefreshTimerRef.current);
      deferredRevisionRefreshTimerRef.current = null;
    }
  }, [projectId, file.name]);

  // Refresh when the file hydrates or external writes bump filesRefreshKey.
  // Do not depend on `source` string identity — reconcile can call setSource /
  // setReloadKey and would otherwise re-enter this effect in a tight loop.
  const sourceReadyForRevisionRefresh = source !== null;
  useEffect(() => {
    if (!sourceReadyForRevisionRefresh) return;
    void refreshRevisionStack();
  }, [projectId, file.name, filesRefreshKey, refreshRevisionStack, sourceReadyForRevisionRefresh]);

  useEffect(() => {
    if (!revisionHistoryOpen || !revisionRetentionPending || !sourceReadyForRevisionRefresh) return;
    const id = window.setInterval(() => {
      void refreshRevisionStack();
    }, FILE_REVISION_RETENTION_POLL_MS);
    return () => window.clearInterval(id);
  }, [
    revisionHistoryOpen,
    revisionRetentionPending,
    sourceReadyForRevisionRefresh,
    refreshRevisionStack,
  ]);

  // Selecting a new file or turning inspect/comment-inspect off resets the panel target.
  useEffect(() => {
    if (!inspectMode && !(boardMode && boardTool === 'inspect')) {
      setActiveInspectTarget(null);
      setInspectError(null);
    }
  }, [inspectMode, boardMode, boardTool]);

  // Hydrate the host-authoritative override map from the artifact source
  // synchronously, *before* React commits a render that carries a new
  // `srcDoc` to the iframe. A `useEffect([source])` would commit the new
  // source first and only re-render with the parsed map afterwards — if
  // the iframe finishes loading the new srcDoc in that window, its
  // `onLoad` handler captures the previous file's empty/stale map in its
  // closure and posts that map back over the bridge's freshly DOM-hydrated
  // overrides, leaving the preview without saved inspect styles until the
  // next reload or mode toggle. Setting state during render is React's
  // documented escape hatch for "store a value derived from props"
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // the in-flight render is discarded and React re-renders with the
  // updated state before commit, so the new `srcDoc` and the new
  // `inspectOverrides` always commit together. After hydration the map
  // only mutates from host-driven onApply / reset callbacks below, so
  // artifact JS forging an od:inspect-overrides message cannot tamper
  // with what saveInspectToSource will persist.
  if (inspectHydratedSourceRef.current !== source) {
    inspectHydratedSourceRef.current = source;
    setInspectOverrides(typeof source === 'string' ? parseInspectOverridesFromSource(source) : {});
  }

  useEffect(() => {
    sourceRef.current = source;
    exportHtmlSnapshotGateRef.current = source ?? lastStablePreviewSourceRef.current;
    if (source == null) return;
    setManualEditDraft((current) => (
      current.fullSource === source ? current : { ...current, fullSource: source }
    ));
  }, [source]);

  useEffect(() => {
    manualEditHostPaintRectRef.current = manualEditHostPaintRect;
  }, [manualEditHostPaintRect]);

  useEffect(() => {
    selectedManualEditTargetIdRef.current = selectedManualEditTarget?.id ?? null;
    selectedManualEditTargetRef.current = selectedManualEditTarget;
  }, [selectedManualEditTarget?.id, selectedManualEditTarget]);

  // Keep overlay geometry locked to the painted iframe element. Prefer a live
  // host-space paint rect (DOM projection) over composing React scale/offset
  // state — that composition stays wrong when the iframe is not ready yet
  // (effect early-returns, scale stuck at 1) or after zoom-shell remounts.
  useLayoutEffect(() => {
    if (!manualEditMode) {
      setManualEditHostOffset({ x: 0, y: 0 });
      setManualEditHostScale(1);
      setManualEditHostPaintRect(null);
      setManualEditContentPageBounds(null);
      setManualEditViewportBounds(null);
      setManualEditLayersPanelOpen(false);
      return;
    }
    let raf = 0;
    let alive = true;
    const sync = () => {
      const frame = iframeRef.current;
      const workspace = manualEditWorkspaceRef.current;
      if (!frame || !workspace) return false;
      // Freeze host scale/offset/paint for the whole geometry gesture.
      // Preview styles reflow the iframe; remasuring fit-scale mid-drag morphs
      // overlay size (draftPx × liveScale) even when content drafts are stable.
      if (manualEditResizeSessionActiveRef.current) return true;
      const nextScale = measureIframeHostScale(frame);
      const nextOffset = measureIframeOffsetInHost(frame, workspace);
      setManualEditHostScale((prev) => (Math.abs(prev - nextScale) < 0.0005 ? prev : nextScale));
      setManualEditHostOffset((prev) => (
        Math.abs(prev.x - nextOffset.x) < 0.5 && Math.abs(prev.y - nextOffset.y) < 0.5
          ? prev
          : nextOffset
      ));
      const pageBounds = measureManualEditContentPageBounds(frame);
      if (pageBounds) {
        setManualEditContentPageBounds((prev) => (
          prev
          && Math.abs(prev.x - pageBounds.x) < 0.5
          && Math.abs(prev.y - pageBounds.y) < 0.5
          && Math.abs(prev.width - pageBounds.width) < 0.5
          && Math.abs(prev.height - pageBounds.height) < 0.5
            ? prev
            : pageBounds
        ));
      }
      const viewportBounds = measureManualEditViewportBounds(frame);
      if (viewportBounds) {
        setManualEditViewportBounds((prev) => (
          prev
          && Math.abs(prev.width - viewportBounds.width) < 0.5
          && Math.abs(prev.height - viewportBounds.height) < 0.5
            ? prev
            : viewportBounds
        ));
      }
      const selectedId = selectedManualEditTargetIdRef.current;
      if (!selectedId) {
        setManualEditHostPaintRect(null);
        return true;
      }
      const paint = measureManualEditTargetHostRect(frame, workspace, selectedId);
      if (paint && paint.width >= 1 && paint.height >= 1) {
        setManualEditHostPaintRect((prev) => (
          prev
          && Math.abs(prev.x - paint.x) < 0.5
          && Math.abs(prev.y - paint.y) < 0.5
          && Math.abs(prev.width - paint.width) < 0.5
          && Math.abs(prev.height - paint.height) < 0.5
            ? prev
            : paint
        ));
      } else {
        // Failed measure is often a transient iframe remount after move flush.
        // Nulling here forces hybrid/visual compose and flashes the box; keep
        // the last good paint until a successful measure or selection clear.
        // Selection switches clear paint via the `!selectedId` branch / select path.
      }
      const measured = measureManualEditTargetContentRect(frame, selectedId);
      if (!measured || measured.rect.width < 1 || measured.rect.height < 1) return true;
      setSelectedManualEditTarget((current) => {
        if (!current || current.id !== selectedId) return current;
        if (manualEditGeometryRoughlyMatches(current, measured)) return current;
        const next = {
          ...current,
          rect: measured.rect,
          layoutWidth: measured.layoutWidth,
          layoutHeight: measured.layoutHeight,
        };
        selectedManualEditTargetRef.current = next;
        return next;
      });
      return true;
    };
    const tick = () => {
      if (!alive) return;
      const ok = sync();
      // Keep sampling while a target is selected (CSS transform / scroll can
      // move the painted box without ResizeObserver). Also retry while the
      // iframe/workspace are not ready — first selection often races srcDoc
      // remount and used to leave scale stuck at 1.
      if (!ok || selectedManualEditTargetIdRef.current) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    const frame = iframeRef.current;
    const workspace = manualEditWorkspaceRef.current;
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { sync(); })
      : null;
    if (frame) ro?.observe(frame);
    if (workspace) ro?.observe(workspace);
    // Mobile/tablet workspace scrolls; host paint rect is scroll-dependent.
    workspace?.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      workspace?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [
    manualEditMode,
    selectedManualEditTarget?.id,
    previewScale,
    previewViewport,
    manualEditViewportWidth,
    manualEditGeomEpoch,
    srcDoc,
    useUrlLoadPreview,
    previewBodySize?.width,
    previewBodySize?.height,
  ]);

  // Freeze inspector left/top per selection. Auto-placement used to follow live
  // target/paint rects and walk the toolbar during resize/move. Upgrade the
  // auto pin once when the first paint rect lands; user drags stay frozen.
  useLayoutEffect(() => {
    if (!manualEditMode || !selectedManualEditTarget) {
      manualEditPanelUserPinnedRef.current = false;
      manualEditPanelPaintPinnedIdRef.current = null;
      return;
    }
    const canvasWidth = previewBodySize?.width ?? 1200;
    const canvasHeight = previewBodySize?.height ?? 800;
    const hasPaint = Boolean(
      manualEditHostPaintRect
      && manualEditHostPaintRect.width >= 1
      && manualEditHostPaintRect.height >= 1,
    );
    const paintPinned = manualEditPanelPaintPinnedIdRef.current === selectedManualEditTarget.id;

    if (manualEditPanelUserPinnedRef.current && manualEditPanelPosition) {
      const clamped = clampFloatingPanelPosition(manualEditPanelPosition, {
        canvasWidth,
        canvasHeight,
      });
      if (
        clamped.left !== manualEditPanelPosition.left
        || clamped.top !== manualEditPanelPosition.top
      ) {
        setManualEditPanelPosition(clamped);
      }
      return;
    }

    if (manualEditPanelPosition != null && paintPinned) {
      const clamped = clampFloatingPanelPosition(manualEditPanelPosition, {
        canvasWidth,
        canvasHeight,
      });
      if (
        clamped.left !== manualEditPanelPosition.left
        || clamped.top !== manualEditPanelPosition.top
      ) {
        setManualEditPanelPosition(clamped);
      }
      return;
    }

    // Keep a composed pin until paint arrives, then place once more from paint.
    if (manualEditPanelPosition != null && !hasPaint) return;

    const style = manualEditFloatingPanelStyle(
      selectedManualEditTarget,
      manualEditHostScale,
      previewBodySize,
      manualEditHostOffset,
      manualEditHostPaintRect,
    );
    const left = typeof style.left === 'number' ? style.left : null;
    const top = typeof style.top === 'number' ? style.top : null;
    if (left == null || top == null) return;
    const next = clampFloatingPanelPosition({ left, top }, { canvasWidth, canvasHeight });
    setManualEditPanelPosition(next);
    if (hasPaint) {
      manualEditPanelPaintPinnedIdRef.current = selectedManualEditTarget.id;
    }
  }, [
    manualEditMode,
    selectedManualEditTarget,
    manualEditPanelPosition,
    manualEditHostScale,
    previewBodySize,
    manualEditHostOffset,
    manualEditHostPaintRect,
  ]);

  useEffect(() => {
    if (!boardMode) {
      setCommentCreateMode(false);
      setActiveCommentTarget((current) => (current ? null : current));
      setHoveredCommentTarget((current) => (current ? null : current));
      setActivePreviewCommentId((current) => (current ? null : current));
      setLiveCommentTargets((current) => (current.size > 0 ? new Map() : current));
      setQueuedBoardNotes((current) => (current.length > 0 ? [] : current));
      setStrokePoints((current) => (current.length > 0 ? [] : current));
      return;
    }
    const snapshotFromData = (data: Partial<PreviewCommentSnapshot>): PreviewCommentSnapshot => {
      const snapshot: PreviewCommentSnapshot = {
        filePath: file.name,
        elementId: String(data.elementId || ''),
        selector: String(data.selector || ''),
        label: String(data.label || ''),
        text: String(data.text || ''),
        position: {
          x: clampBridgeCoordinate(data.position?.x),
          y: clampBridgeCoordinate(data.position?.y),
          width: clampBridgeCoordinate(data.position?.width),
          height: clampBridgeCoordinate(data.position?.height),
        },
        hoverPoint: data.hoverPoint
          ? {
              x: clampBridgeCoordinate(data.hoverPoint.x),
              y: clampBridgeCoordinate(data.hoverPoint.y),
            }
          : undefined,
        htmlHint: String(data.htmlHint || ''),
        style: normalizeAnnotationStyle(data.style),
        selectionKind: data.selectionKind === 'pod' ? 'pod' : 'element',
        memberCount: finiteBridgeInteger(data.memberCount),
        podMembers: Array.isArray(data.podMembers) ? data.podMembers : undefined,
        ...(typeof data.slideIndex === 'number' ? { slideIndex: data.slideIndex } : {}),
      };
      return enrichSnapshotWithDeckSlideIndex(snapshot);
    };
    const usableSnapshotFromData = (data: Partial<PreviewCommentSnapshot>): PreviewCommentSnapshot | null => {
      const snapshot = snapshotFromData(data);
      if (!snapshot.elementId || isUnsafeCommentElementTargetId(snapshot.elementId)) return null;
      if (snapshot.selector && isUnsafeCommentElementTargetId(`dom:${snapshot.selector}`)) return null;
      return snapshot;
    };
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      const data = ev.data as (Partial<PreviewCommentSnapshot> & {
        type?: string;
        targets?: Array<Partial<PreviewCommentSnapshot>>;
        points?: StrokePoint[];
      }) | null;
      if (!data?.type) return;
      if (data.type === 'od:comment-targets' && Array.isArray(data.targets)) {
        const next = new Map<string, PreviewCommentSnapshot>();
        data.targets.forEach((item) => {
          const snapshot = usableSnapshotFromData(item);
          if (!snapshot || !isValidCommentOverlayPosition(snapshot.position)) return;
          next.set(snapshot.elementId, snapshot);
        });
        setLiveCommentTargets((current) => (
          liveCommentTargetMapsEqual(current, next) ? current : next
        ));
        setActiveCommentTarget((current) => {
          if (!current) return null;
          if (current.selectionKind === 'pod') return current;
          const updated = next.get(current.elementId);
          if (!updated || !isValidCommentOverlayPosition(updated.position)) return null;
          return commentSnapshotEqual(current, updated) ? current : updated;
        });
        setHoveredCommentTarget((current) => {
          if (!current) return null;
          if (current.selectionKind === 'pod') return current;
          const updated = next.get(current.elementId);
          if (!updated || !isValidCommentOverlayPosition(updated.position)) return null;
          return commentSnapshotEqual(current, updated) ? current : updated;
        });
        return;
      }
      if (data.type === 'od:comment-active-target-update') {
        const snapshot = usableSnapshotFromData(data);
        if (!snapshot || !isValidCommentOverlayPosition(snapshot.position)) return;
        // Fires on every pointermove while a target is active — skip the Map
        // clone and the active/hovered state writes when nothing changed, so a
        // steady hover doesn't re-render the whole overlay each frame.
        setLiveCommentTargets((current) => {
          const existing = current.get(snapshot.elementId);
          if (existing && commentSnapshotEqual(existing, snapshot)) return current;
          return new Map(current).set(snapshot.elementId, snapshot);
        });
        setActiveCommentTarget((current) =>
          current && current.elementId === snapshot.elementId && !commentSnapshotEqual(current, snapshot)
            ? snapshot
            : current,
        );
        setHoveredCommentTarget((current) =>
          current && current.elementId === snapshot.elementId && !commentSnapshotEqual(current, snapshot)
            ? snapshot
            : current,
        );
        return;
      }
      if (data.type === 'od:comment-leave') {
        // Already firmly on the card — nothing to dismiss.
        if (hoverCardPinnedRef.current) return;
        // The pointer left the element. It may be sliding onto the floating card
        // (which overlaps the iframe) or hopping toward an adjacent element —
        // both should keep the card up. Defer the dismiss so the card's
        // mouseenter or the next comment-hover can cancel it; only a leave with
        // nothing following actually tears the card down.
        scheduleHoverCardDismiss();
        return;
      }
      if (data.type === 'od:comment-hover') {
        const snapshot = usableSnapshotFromData(data);
        if (!snapshot || !isValidCommentOverlayPosition(snapshot.position)) return;
        // Pointer landed on an element — cancel any deferred dismiss so moving
        // from the card back onto the element it describes keeps the card.
        cancelHoverCardDismiss();
        // Hover repeats the same snapshot per pointermove frame — keep the
        // existing state object (and skip the Map clone) when it is unchanged.
        setHoveredCommentTarget((current) =>
          current && current.elementId === snapshot.elementId && commentSnapshotEqual(current, snapshot)
            ? current
            : snapshot,
        );
        setLiveCommentTargets((current) => {
          const existing = current.get(snapshot.elementId);
          if (existing && commentSnapshotEqual(existing, snapshot)) return current;
          return new Map(current).set(snapshot.elementId, snapshot);
        });
        return;
      }
      if (data.type === 'od:comment-target') {
        const snapshot = usableSnapshotFromData(data);
        if (!snapshot || !isValidCommentOverlayPosition(snapshot.position)) return;
        if (effectiveDeck && typeof snapshot.slideIndex !== 'number') {
          requestSlideStateFromIframe();
        }
        const shouldOpenComposer = boardMode || commentCreateMode;
        cancelHoverCardDismiss();
        setActiveCommentTarget((current) => (shouldOpenComposer ? snapshot : current));
        setHoveredCommentTarget(snapshot);
        setLiveCommentTargets((current) => {
          const existing = current.get(snapshot.elementId);
          if (existing && commentSnapshotEqual(existing, snapshot)) return current;
          return new Map(current).set(snapshot.elementId, snapshot);
        });
        if (shouldOpenComposer) {
          setActivePreviewCommentId(null);
          setCommentDraft('');
          setQueuedBoardNotes([]);
          setActiveCommentExistingAttachments([]);
        }
        return;
      }
      if (data.type === 'od:pod-clear') {
        setStrokePoints([]);
        return;
      }
      if (data.type === 'od:pod-stroke' && Array.isArray(data.points)) {
        setStrokePoints(
          data.points.map((point) => ({
            x: clampBridgeCoordinate(point.x),
            y: clampBridgeCoordinate(point.y),
          })),
        );
        return;
      }
      if (data.type === 'od:pod-select' && Array.isArray(data.points)) {
        const points = data.points.map((point) => ({
          x: clampBridgeCoordinate(point.x),
          y: clampBridgeCoordinate(point.y),
        }));
        setStrokePoints(points);
        const nextTarget = buildPodSnapshot({
          filePath: file.name,
          strokePoints: points,
          liveTargets: liveCommentTargetsRef.current,
        });
        if (!nextTarget) {
          setStrokePoints([]);
          return;
        }
        setActiveCommentTarget(nextTarget);
        setHoveredCommentTarget(nextTarget);
        setActivePreviewCommentId(null);
        setQueuedBoardNotes([]);
        setCommentDraft('');
        setActiveCommentExistingAttachments([]);
        setStrokePoints([]);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [activeCommentTarget, boardMode, boardTool, cancelHoverCardDismiss, commentPortalHost, effectiveDeck, file.name, isOurPreviewIframeSource, previewComments, previewStateKey, scheduleHoverCardDismiss, slideState?.active]);

  useEffect(() => {
    if (!boardMode || !activeCommentTarget || activeCommentTarget.selectionKind === 'pod') return;
    iframeRef.current?.contentWindow?.postMessage({
      type: 'od:comment-active-target',
      elementId: activeCommentTarget.elementId,
      selector: activeCommentTarget.selector,
    }, '*');
  }, [activeCommentTarget?.elementId, activeCommentTarget?.selector, activeCommentTarget?.selectionKind, boardMode]);

  useEffect(() => {
    if (!manualEditMode) {
      // Drop tip remount soft-land/absorb/follow timers on mode-exit (499/503).
      // Skip idle initial mount when nothing tip-related is armed.
      if (shouldClearTipRemountOnManualEditModeExit(
        false,
        tipRemountPostProtectArmed({
          graceId: manualEditTipRemountGeometryGraceIdRef.current,
          stickyRetain: manualEditTipSyncedIdentityRetainRef.current,
          softLandRemaining: manualEditTipPostStickySoftLandRef.current,
          exitLatch: manualEditTipPostSoftLandExitLatchRef.current,
          absorb: manualEditTipPostExitMixedAbsorbRef.current,
          postAbsorbQuiet: manualEditTipPostAbsorbInspectorQuietRef.current,
          followUntilMs: manualEditTipDeckNudgeFollowUntilRef.current,
          chromeSuppressed: manualEditTipRemountChromeSuppressedRef.current,
          followChromeTimeoutPending:
            manualEditTipDeckNudgeFollowChromeTimeoutRef.current != null,
          remountSafetyTimeoutPending:
            manualEditTipRemountChromeSafetyTimeoutRef.current != null,
        }),
      )) {
        clearManualEditTipRemountGeometryGrace('mode-exit');
      }
      setManualEditTargets([]);
      manualEditTargetsIdentityFingerprintRef.current = '';
      manualEditSelectedIdentityFingerprintRef.current = '';
      setSelectedManualEditTarget(null);
      setSelectedManualEditTargetIds([]);
      setManualEditMixedStyleKeys(new Set());
      manualEditHoverTargetIdRef.current = null;
      setManualEditHoverTarget(null);
      setManualEditPageStylesOpen(false);
      setManualEditPanelPosition(null);
      setManualEditPanelCollapsed(false);
      manualEditPanelUserPinnedRef.current = false;
      manualEditPanelPaintPinnedIdRef.current = null;
      selectedManualEditTargetIdRef.current = null;
      selectedManualEditTargetRef.current = null;
      selectedManualEditTargetIdsRef.current = [];
      setManualEditError(null);
      manualEditPendingStyleRef.current = null;
      manualEditRemeasureAwaiterRef.current.cancelAll();
      manualEditGeometryHandoffIdRef.current = null;
      manualEditResizeSessionActiveRef.current = false;
      manualEditResizePausedRef.current = false;
      setManualEditResizeDraftSize(null);
      setManualEditMoveDraftPos(null);
    setManualEditGroupDraftRects(null);
      if (manualEditStyleTimerRef.current) {
        clearTimeout(manualEditStyleTimerRef.current);
        manualEditStyleTimerRef.current = null;
      }
      return;
    }
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      const data = ev.data as ManualEditBridgeMessage | null;
      if (!data?.type) return;
      if (data.type === 'od-edit-targets' && Array.isArray(data.targets)) {
        // Tip-remount session (grace or deck fit-settle) — hoist before catalog
        // replace so bridge styles do not wipe tip-synced selected styles (466/467).
        const tipRemountSession = tipRemountSessionActive(
          manualEditTipRemountGeometryGraceIdRef.current,
          Date.now(),
          manualEditTipRemountGeometryGraceUntilRef.current,
          manualEditTipRemountFitSettleUntilRef.current,
          manualEditTipRemountIdentityHoldUntilRef.current,
        );
        // Membership change during hold must not paint the new set with the
        // previous tip's styles — drop hold + skip preserve (469).
        // Empty/partial catalogs during tip protect are settle noise — ignore (473).
        // Post-sticky soft-land also ignores membership noise (483).
        const selectedIdsForPreserve = selectedManualEditTargetIdsRef.current;
        const softLandAtEntry = manualEditTipPostStickySoftLandRef.current;
        const exitLatchAtEntry = manualEditTipPostSoftLandExitLatchRef.current;
        const postExitAbsorbAtEntry = manualEditTipPostExitMixedAbsorbRef.current;
        const postAbsorbQuietAtEntry = manualEditTipPostAbsorbInspectorQuietRef.current;
        const tipProtectSource = tipRemountSession
          || manualEditTipSyncedIdentityRetainRef.current
          || softLandAtEntry > 0
          || exitLatchAtEntry
          // Absorb is tip-protect for membership noise / empty catalog (498).
          || shouldTreatPostExitAbsorbAsTipProtect(postExitAbsorbAtEntry)
          // Post-absorb quiet also tip-protects one settle catalog (509).
          || shouldTreatPostAbsorbQuietAsTipProtect(postAbsorbQuietAtEntry);
        const refreshedProbe = selectedIdsForPreserve.length > 0
          ? resolveManualEditTargetsByIds(selectedIdsForPreserve, data.targets)
          : [];
        const selectionIdsChangedEarlyRaw = selectedIdsForPreserve.length > 0
          && !manualEditSelectionIdsEqual(
            selectedIdsForPreserve,
            refreshedProbe.map((item) => item.id),
          );
        const ignoreMembershipNoise = shouldIgnoreOdEditTargetsMembershipNoiseDuringTipProtect(
          tipProtectSource,
          selectedIdsForPreserve.length,
          refreshedProbe.length,
          data.targets.length,
        );
        const selectionIdsChangedEarly = selectionIdsChangedEarlyRaw && !ignoreMembershipNoise;
        // Drop sticky for *later* catalogs after session ends — this tick still
        // tip-preserves so Mixed does not one-shot on the transition (479).
        const clearStickyAfterPreserve = shouldClearTipSyncedIdentityStickyRetainOnFullCatalog(
          manualEditTipSyncedIdentityRetainRef.current,
          tipRemountSession,
          selectedIdsForPreserve.length,
          refreshedProbe.length,
          data.targets.length,
        );
        if (shouldClearTipPostProtectOnOdEditTargetsSelectionIdsChange(
          selectionIdsChangedEarly,
        )) {
          manualEditTipRemountIdentityHoldUntilRef.current = 0;
          manualEditTipSyncedIdentityRetainRef.current = false;
          manualEditTipPostStickySoftLandRef.current = 0;
          manualEditTipPostSoftLandExitLatchRef.current = false;
          manualEditTipPostExitMixedAbsorbRef.current = false;
          manualEditTipPostAbsorbInspectorQuietRef.current = false;
          manualEditTipPostFitSettleWildJumpSkipRef.current = false;
          // Membership change must also drop deck-nudge follow (508).
          manualEditTipDeckNudgeFollowUntilRef.current = 0;
          manualEditTipDeckNudgeRemasureAtRef.current = 0;
          manualEditTipFollowChromeReleaseDeferredRef.current = false;
          if (manualEditTipDeckNudgeFollowChromeTimeoutRef.current != null) {
            window.clearTimeout(manualEditTipDeckNudgeFollowChromeTimeoutRef.current);
            manualEditTipDeckNudgeFollowChromeTimeoutRef.current = null;
          }
          if (manualEditTipDeckNudgeRemasureRafRef.current != null) {
            window.cancelAnimationFrame(manualEditTipDeckNudgeRemasureRafRef.current);
            manualEditTipDeckNudgeRemasureRafRef.current = null;
          }
        }
        const softLandActive = shouldRetainTipSyncedIdentityDuringPostStickySoftLand(
          softLandAtEntry,
          selectionIdsChangedEarly,
        );
        const exitLatchActive = shouldRetainTipSyncedIdentityDuringPostSoftLandExitLatch(
          exitLatchAtEntry,
          selectionIdsChangedEarly,
        );
        const tipRemountActive = shouldRetainTipSyncedIdentityAfterHold(
          tipRemountSession,
          manualEditTipSyncedIdentityRetainRef.current,
          selectionIdsChangedEarly,
        ) || softLandActive || exitLatchActive;
        // Absorb tick is not tip-preserve, but still tip-protect for wipe/noise (498).
        // Post-absorb quiet likewise tip-protects without preserve (509).
        const tipProtectActive = tipRemountActive
          || shouldTreatPostExitAbsorbAsTipProtect(postExitAbsorbAtEntry)
          || shouldTreatPostAbsorbQuietAsTipProtect(postAbsorbQuietAtEntry);
        if (
          !selectionIdsChangedEarly
          && shouldDeferTipSyncedIdentityStickyClearUntilAfterPreserve(clearStickyAfterPreserve)
        ) {
          manualEditTipSyncedIdentityRetainRef.current = false;
          // Arm soft-land for subsequent catalogs (do not consume this tick) (480/483).
          if (shouldArmTipPostStickySoftLand(clearStickyAfterPreserve)) {
            manualEditTipPostStickySoftLandRef.current = TIP_POST_STICKY_SOFT_LAND_CATALOGS;
          }
        } else if (softLandAtEntry > 0 && !selectionIdsChangedEarly) {
          // Early exit when live bridge identity already matches preserved tip (488).
          const liveProbeFp = manualEditTargetsIdentityFingerprint(refreshedProbe);
          const preservedProbeFp = manualEditTargetsIdentityFingerprint(
            refreshedProbe.map((item) => withPreservedTipSyncedIdentityOnBridgeTarget(
              item,
              resolveTipSyncedTargetForOdEditTargetsPreserve(
                item.id,
                selectedManualEditTargetRef.current,
                manualEditTargetsRef.current,
              ),
            )),
          );
          const earlyExit = shouldEarlyExitTipPostStickySoftLand(
            softLandAtEntry,
            selectionIdsChangedEarly,
            preservedProbeFp,
            liveProbeFp,
          );
          if (earlyExit) {
            manualEditTipPostStickySoftLandRef.current = 0;
            // Sync selected FP to live + arm absorb for next catalog (493/491).
            if (shouldSyncSelectedIdentityFingerprintOnSoftLandEarlyExit(
              earlyExit,
              selectionIdsChangedEarly,
            )) {
              manualEditSelectedIdentityFingerprintRef.current = liveProbeFp;
            }
            if (shouldArmTipPostExitLatchMixedAbsorbOnSoftLandEarlyExit(
              earlyExit,
              selectionIdsChangedEarly,
            )) {
              manualEditTipPostExitMixedAbsorbRef.current = true;
            }
          } else {
            const remaining = consumeTipPostStickySoftLandCatalog(
              softLandAtEntry,
              selectionIdsChangedEarly,
            );
            manualEditTipPostStickySoftLandRef.current = remaining;
            // Soft-land last catalog → one exit latch preserve for first live (486).
            if (shouldArmTipPostSoftLandExitLatch(
              softLandAtEntry,
              remaining,
              selectionIdsChangedEarly,
              false,
            )) {
              manualEditTipPostSoftLandExitLatchRef.current = true;
            }
          }
        }
        // Exit-latch tick spends the latch after this preserve (486/502).
        if (exitLatchAtEntry) {
          manualEditTipPostSoftLandExitLatchRef.current = clearTipPostSoftLandExitLatch();
          // Next catalog absorbs live FP without Mixed reseed (491).
          if (shouldArmTipPostExitLatchMixedAbsorb(
            exitLatchAtEntry,
            selectionIdsChangedEarly,
          )) {
            manualEditTipPostExitMixedAbsorbRef.current = true;
          }
        }
        // Tip-remount: fingerprint the catalog we will store (preserved tip
        // identity), not raw bridge — latch must match React state (468/470).
        const priorCatalogForPreserve = manualEditTargetsRef.current;
        const nextCatalogTargets = tipRemountActive
          ? data.targets.map((target) => {
            if (!selectedIdsForPreserve.includes(target.id)) return target;
            return withPreservedTipSyncedIdentityOnBridgeTarget(
              target,
              resolveTipSyncedTargetForOdEditTargetsPreserve(
                target.id,
                selectedManualEditTargetRef.current,
                priorCatalogForPreserve,
              ),
            );
          })
          : data.targets;
        // Skip React state when identity is unchanged (geometry-only rebroadcasts).
        const targetsFingerprint = manualEditTargetsIdentityFingerprint(nextCatalogTargets);
        const targetsIdentityChanged =
          targetsFingerprint !== manualEditTargetsIdentityFingerprintRef.current;
        if (targetsIdentityChanged) {
          manualEditTargetsIdentityFingerprintRef.current = targetsFingerprint;
          setManualEditTargets(nextCatalogTargets);
        } else if (shouldPatchSelectedGeometryFromTargetsBroadcast(
          targetsIdentityChanged,
          selectedManualEditTargetIdsRef.current,
        )) {
          // Identity unchanged — still patch selected rects so multi overlay
          // does not stay on pre-tip geometry (450).
          const selectedIds = selectedManualEditTargetIdsRef.current;
          const byId = new Map(
            data.targets
              .filter((target) => selectedIds.includes(target.id))
              .map((target) => [target.id, target] as const),
          );
          if (byId.size > 0) {
            setManualEditTargets((current) => current.map((item) => {
              const next = byId.get(item.id);
              if (!next) return item;
              if (
                manualEditGeometryRoughlyMatches(item, next)
                && item.layoutWidth === next.layoutWidth
                && item.layoutHeight === next.layoutHeight
                && item.offsetLeft === next.offsetLeft
                && item.offsetTop === next.offsetTop
              ) {
                return item;
              }
              return {
                ...item,
                rect: next.rect,
                layoutWidth: next.layoutWidth,
                layoutHeight: next.layoutHeight,
                offsetLeft: next.offsetLeft ?? item.offsetLeft,
                offsetTop: next.offsetTop ?? item.offsetTop,
                cssPosition: next.cssPosition ?? item.cssPosition,
                stickyScrollportId: next.stickyScrollportId ?? item.stickyScrollportId,
              };
            }));
          }
        }
        // Geometry gestures own selection rect/paint — a mid-drag or post-commit
        // targets scan must not clobber optimistic viewport (box flash).
        if (manualEditResizeSessionActiveRef.current) return;
        // Target broadcasts can be briefly empty while the iframe/save path is
        // settling; keep the user's inspector selection unless a fresh copy is
        // available to update its metadata.
        const selectedIdBefore = selectedManualEditTargetIdRef.current;
        const selectedNextRaw = selectedIdBefore
          ? data.targets.find((target) => target.id === selectedIdBefore) ?? null
          : null;
        // Tip-remount: keep tip-synced identity on the selected target — bridge
        // live styles / empty outerHtml would flip fingerprint / Mixed (466/470).
        const selectedNext = selectedNextRaw && tipRemountActive
          && selectedManualEditTargetRef.current?.id === selectedNextRaw.id
          ? withPreservedTipSyncedIdentityOnBridgeTarget(
            selectedNextRaw,
            selectedManualEditTargetRef.current,
          )
          : selectedNextRaw;
        if (selectedNext) {
          const prevSelected = selectedManualEditTargetRef.current;
          const selectedIdentityChanged = manualEditTargetsIdentityFingerprint([selectedNext])
            !== manualEditTargetsIdentityFingerprint(
              prevSelected ? [prevSelected] : [],
            );
          selectedManualEditTargetRef.current = selectedNext;
          selectedManualEditTargetIdRef.current = selectedNext.id;
          // Geometry-only: update React state when rect moved so single chrome
          // tracks tip (multi catalog patch above; 450).
          if (selectedIdentityChanged || targetsIdentityChanged) {
            setSelectedManualEditTarget(selectedNext);
          } else if (
            prevSelected
            && (
              !manualEditGeometryRoughlyMatches(prevSelected, selectedNext)
              || prevSelected.layoutWidth !== selectedNext.layoutWidth
              || prevSelected.layoutHeight !== selectedNext.layoutHeight
              || prevSelected.offsetLeft !== selectedNext.offsetLeft
              || prevSelected.offsetTop !== selectedNext.offsetTop
            )
          ) {
            setSelectedManualEditTarget(selectedNext);
          }
        }
        const currentIds = selectedManualEditTargetIdsRef.current;
        if (currentIds.length > 0) {
          const refreshedRaw = resolveManualEditTargetsByIds(currentIds, data.targets);
          // Tip-remount: preserve tip-synced identity on the selected set (467/470).
          const refreshed = tipRemountActive
            ? refreshedRaw.map((item) => withPreservedTipSyncedIdentityOnBridgeTarget(
              item,
              resolveTipSyncedTargetForOdEditTargetsPreserve(
                item.id,
                selectedManualEditTargetRef.current,
                manualEditTargetsRef.current,
              ),
            ))
            : refreshedRaw;
          const nextIds = refreshed.map((item) => item.id);
          if (nextIds.length === 0) {
            // Tip protect (incl. absorb): empty catalog is settle noise — keep selection (473/498).
            if (!shouldClearManualEditSelectionOnEmptyOdEditTargets(tipProtectActive)) {
              return;
            }
            void clearManualEditTargetSelection();
            return;
          }
          const selectionIdsChanged = !manualEditSelectionIdsEqual(currentIds, nextIds);
          if (selectionIdsChanged) {
            selectedManualEditTargetIdsRef.current = nextIds;
            setSelectedManualEditTargetIds(nextIds);
          }
          // Pending style draft owns the inspector — do not clobber with source
          // merge while a flush/timer is in flight (기획 59).
          const styleDraftPending = Boolean(
            manualEditPendingStyleRef.current || manualEditStyleTimerRef.current,
          );
          // Multi-select reseed follows selected-set identity only (not unselected churn).
          const selectedIdentityFingerprint = manualEditTargetsIdentityFingerprint(refreshed);
          const selectedTargetsIdentityChanged =
            selectedIdentityFingerprint !== manualEditSelectedIdentityFingerprintRef.current;
          if (selectionIdsChanged || selectedTargetsIdentityChanged) {
            manualEditSelectedIdentityFingerprintRef.current = selectedIdentityFingerprint;
          }
          // Soft-land / exit latch: pin selected FP to preserved so exit absorb
          // does not look like identity churn (490).
          if (shouldLatchSelectedIdentityFingerprintDuringTipSoftLand(
            softLandActive || exitLatchActive,
            selectionIdsChanged,
          )) {
            manualEditSelectedIdentityFingerprintRef.current = selectedIdentityFingerprint;
          }
          // Post-exit absorb: accept live FP into refs without Mixed reseed (491).
          if (shouldAbsorbLiveIdentityFingerprintOnPostExitLatch(
            postExitAbsorbAtEntry,
            selectionIdsChanged,
          )) {
            manualEditTargetsIdentityFingerprintRef.current = targetsFingerprint;
            manualEditSelectedIdentityFingerprintRef.current = selectedIdentityFingerprint;
            manualEditTipPostExitMixedAbsorbRef.current = false;
            // First post-absorb live catalog stays Mixed-quiet (509).
            if (shouldArmTipPostAbsorbInspectorQuiet(true, selectionIdsChanged)) {
              manualEditTipPostAbsorbInspectorQuietRef.current = true;
            }
          }
          // Quiet tick spends after Mixed skip uses entry latch (509).
          if (postAbsorbQuietAtEntry) {
            manualEditTipPostAbsorbInspectorQuietRef.current = clearTipPostAbsorbInspectorQuiet();
          }
          // Tip-remount: bridge target.styles can flip identity fingerprint and
          // re-fire Mixed/draft reseed — skip identity-only churn (466).
          // Pending drafts stay reachable during tip protect (471).
          // Multi exit-latch: keep source-only Mixed (495).
          const exitLatchMultiSourceOnly = shouldKeepMultiInspectorSourceOnlyDuringTipExitLatch(
            exitLatchActive,
            nextIds.length,
          );
          const skipIdentityMixedReseed = shouldSkipOdEditTargetsIdentityMixedReseedDuringTipRemount(
            selectionIdsChanged,
            tipRemountActive || exitLatchMultiSourceOnly,
            styleDraftPending,
          ) || shouldSkipOdEditTargetsIdentityMixedReseedDuringPostExitAbsorb(
            selectionIdsChanged,
            postExitAbsorbAtEntry,
            styleDraftPending,
          ) || shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet(
            selectionIdsChanged,
            postAbsorbQuietAtEntry,
            styleDraftPending,
          );
          // Single absorb skip shares the Mixed absorb latch (496); quiet too (509).
          const skipIdentitySingleReseed = shouldSkipOdEditTargetsSingleInspectorReseedDuringPostExitAbsorb(
            selectionIdsChanged,
            postExitAbsorbAtEntry,
            styleDraftPending,
          ) || shouldSkipOdEditTargetsIdentityMixedReseedDuringPostAbsorbQuiet(
            selectionIdsChanged,
            postAbsorbQuietAtEntry,
            styleDraftPending,
          );
          const skipIdentityInspectorReseed = skipIdentityMixedReseed || skipIdentitySingleReseed;
          const allowPendingReseed = shouldAllowOdEditTargetsPendingReseedDuringTipProtect(
            styleDraftPending,
            selectionIdsChanged,
            selectedTargetsIdentityChanged,
            tipProtectActive,
          );
          // Multi-select inspector: reparse on id-set OR selected identity change
          // (59 mixed styles). Geometry-only broadcasts keep fingerprint equal.
          if (
            nextIds.length > 1
            && !skipIdentityInspectorReseed
            && (selectionIdsChanged || (selectedTargetsIdentityChanged && !styleDraftPending))
          ) {
            const base = sourceRef.current ?? '';
            const parsedDoc = parseManualEditSource(base);
            // Source-only Mixed — same plan helper as tip-yield / remove (451/465).
            // inspectorManualEditStyles can keep pre-tip preview pollution.
            const odEditTargetsSourceOnly = shouldReadMultiInspectorStylesFromSourceOnly(
              'od-edit-targets',
            );
            if (!odEditTargetsSourceOnly) {
              // Unreachable: od-edit-targets reason always returns true.
            }
            const reseed = planManualEditMultiInspectorReseed({
              selectedIds: nextIds,
              readStyles: (id) => readManualEditStyles(base, id, {}, parsedDoc),
              concurrentPending: manualEditPendingStyleRef.current
                ? {
                  styles: manualEditPendingStyleRef.current.styles,
                  perTargetStyles: manualEditPendingStyleRef.current.perTargetStyles,
                }
                : null,
            });
            setManualEditMixedStyleKeys(reseed.mixedKeys);
            if (reseed.styles != null) {
              setManualEditDraft((current) => ({ ...current, styles: reseed.styles! }));
            }
          } else if (
            nextIds.length > 1
            && !skipIdentityInspectorReseed
            && allowPendingReseed
            && selectedNext
          ) {
            // Multi + pending: keep draft styles; refresh fields + mixedKeys only.
            // Tip protect may freeze identity fingerprint — still refresh (471).
            const base = sourceRef.current ?? '';
            const parsedDoc = parseManualEditSource(base);
            const snapshot = readManualEditTargetSnapshot(
              base,
              selectedNext.id,
              {},
              parsedDoc,
            );
            setManualEditMixedStyleKeys(mixedKeysForPendingStyleDraft(
              refreshed,
              (id) => readManualEditStyles(base, id, {}, parsedDoc),
              // Suppress Mixed on keys the user is actively drafting (59).
              manualEditPendingStyleRef.current?.styles,
              { perTargetStyles: manualEditPendingStyleRef.current?.perTargetStyles },
            ));
            setManualEditDraft((current) => ({
              ...current,
              text: snapshot.fields.text ?? selectedNext.fields.text ?? selectedNext.text,
              href: snapshot.fields.href ?? selectedNext.fields.href ?? '',
              src: snapshot.fields.src ?? selectedNext.fields.src ?? '',
              alt: snapshot.fields.alt ?? selectedNext.fields.alt ?? '',
            }));
          } else if (
            nextIds.length === 1
            && !skipIdentityInspectorReseed
            && !selectionIdsChanged
            && selectedTargetsIdentityChanged
            && !styleDraftPending
            && selectedNext
          ) {
            // Single-select: identity field change (text/href/…) reseeds draft.
            const base = sourceRef.current ?? '';
            const parsedDoc = parseManualEditSource(base);
            const snapshot = readManualEditTargetSnapshot(
              base,
              selectedNext.id,
              {},
              parsedDoc,
            );
            setManualEditDraft((current) => ({
              ...current,
              text: snapshot.fields.text ?? selectedNext.fields.text ?? selectedNext.text,
              href: snapshot.fields.href ?? selectedNext.fields.href ?? '',
              src: snapshot.fields.src ?? selectedNext.fields.src ?? '',
              alt: snapshot.fields.alt ?? selectedNext.fields.alt ?? '',
              // Source-only — bridge preview merge flickers tip settle-exit (468).
              styles: shouldReadSingleInspectorStylesFromSourceOnlyForOdEditTargets()
                ? snapshot.styles
                : mergeManualEditInspectorStyles(snapshot.styles, selectedNext.styles),
              attributesText: JSON.stringify(snapshot.attributes, null, 2),
              outerHtml: snapshot.outerHtml || selectedNext.outerHtml,
            }));
          } else if (
            nextIds.length === 1
            && !skipIdentityInspectorReseed
            && allowPendingReseed
            && selectedNext
          ) {
            // Pending styles own the panel — refresh field identity only (기획 59/471).
            const base = sourceRef.current ?? '';
            const parsedDoc = parseManualEditSource(base);
            const snapshot = readManualEditTargetSnapshot(
              base,
              selectedNext.id,
              {},
              parsedDoc,
            );
            setManualEditDraft((current) => ({
              ...current,
              text: snapshot.fields.text ?? selectedNext.fields.text ?? selectedNext.text,
              href: snapshot.fields.href ?? selectedNext.fields.href ?? '',
              src: snapshot.fields.src ?? selectedNext.fields.src ?? '',
              alt: snapshot.fields.alt ?? selectedNext.fields.alt ?? '',
            }));
          }
          // Echo selected-target only when membership changes — geometry storms
          // must not ping-pong postSelected back into the iframe.
          if (selectionIdsChanged) {
            const primaryId = selectedManualEditTargetIdRef.current ?? nextIds[nextIds.length - 1]!;
            setTimeout(() => postSelectedManualEditTargetsToIframe(nextIds, primaryId), 0);
          }
          return;
        }
        return;
      }
      if (data.type === 'od-edit-select') {
        manualEditHoverTargetIdRef.current = null;
        setManualEditHoverTarget(null);
        void selectManualEditTarget(data.target, { additive: data.additive === true });
        return;
      }
      if (data.type === 'od-edit-hover') {
        // Hover only surfaces a lightweight "edit params" affordance; it must
        // NOT switch the pinned inspector. The panel changes only when the
        // user clicks that affordance (or a container/image body), so moving
        // the cursor across the canvas never yanks the panel away mid-edit.
        const nextHover = selectedManualEditTargetIdsRef.current.includes(data.target.id)
          ? null
          : data.target;
        const nextHoverId = nextHover?.id ?? null;
        // Geometry-only rebroadcasts for the same id skip React churn.
        if (nextHoverId === manualEditHoverTargetIdRef.current) return;
        manualEditHoverTargetIdRef.current = nextHoverId;
        setManualEditHoverTarget(nextHover);
        return;
      }
      if (data.type === 'od-edit-background') {
        // Clicking empty canvas deselects and opens the compact page-styles
        // card — only meaningful for full HTML documents. Flush pending
        // styles first so a background click does not discard unsaved tweaks.
        manualEditHoverTargetIdRef.current = null;
        setManualEditHoverTarget(null);
        // Already on empty page-styles — skip clear/draft wipe churn.
        if (
          !selectedManualEditTargetIdRef.current
          && manualEditPageStylesOpenRef.current
        ) {
          return;
        }
        if (typeof source === 'string' && isManualEditFullHtmlDocument(source)) {
          void clearManualEditTargetSelection().then((ok) => {
            if (ok) setManualEditPageStylesOpen(true);
          });
        }
        return;
      }
      if (data.type === 'od-edit-text-commit') {
        // Text commits remount the freeze from saved source; flush style
        // drafts first or postMessage-only previews are lost on reload.
        void (async () => {
          if (!(await flushManualEditStyleSave({ force: true }))) {
            setManualEditError(t('manualEdit.styleFlushBeforeTextFailed'));
            return;
          }
          const targetId = String(data.id);
          const target = selectedManualEditTargetRef.current?.id === targetId
            ? selectedManualEditTargetRef.current
            : manualEditTargets.find((item) => item.id === targetId) ?? null;
          const slideIndex = effectiveDeck
            ? htmlPreviewSlideState.get(previewStateKey)?.active
            : undefined;
          await applyManualEdit(
            {
              id: targetId,
              kind: 'set-text',
              value: String(data.value),
              flattenNestedMarkup: data.flattenNestedMarkup === true,
            },
            embedUiLabel('Edit text', '텍스트 편집'),
            typeof slideIndex === 'number' ? { slideIndex } : undefined,
            target
              ? {
                  id: target.id,
                  currentText: target.fields.text ?? target.text,
                  htmlHint: target.outerHtml,
                }
              : undefined,
          );
        })();
        return;
      }
      if (data.type === 'od-edit-text-active') {
        const nextActive = Boolean(data.active);
        if (nextActive === manualEditInlineTextEditingRef.current) return;
        manualEditInlineTextEditingRef.current = nextActive;
        setManualEditInlineTextEditing(nextActive);
        return;
      }
      if (data.type === 'od-edit-rect') {
        const rectId = String(data.id ?? '');
        const handoffId = manualEditGeometryHandoffIdRef.current;
        const isHandoffRect = Boolean(handoffId && rectId === handoffId);
        const measured = data.ok && data.target ? data.target : null;
        // Always complete awaiters (gesture waiters); paint path is gated below.
        if (rectId) {
          manualEditRemeasureAwaiterRef.current.complete(rectId, measured);
        }
        // Gesture session: awaiter done; never idle remasure / wild-jump (51–53).
        // Still expire tip grace so chrome suppress cannot stick behind a drag (457).
        if (manualEditResizeSessionActiveRef.current && !isHandoffRect) {
          const nowMs = Date.now();
          if (shouldClearTipRemountGeometryGraceOnExpiry(
            manualEditTipRemountGeometryGraceIdRef.current,
            nowMs,
            manualEditTipRemountGeometryGraceUntilRef.current,
            manualEditTipRemountFitSettleUntilRef.current,
          )) {
            clearManualEditTipRemountGeometryGrace('expiry');
          }
          return;
        }
        if (!measured || isHandoffRect) {
          // Failed tip remasure — release suppress so handles are not stuck (457).
          if (
            !isHandoffRect
            && shouldReleaseTipRemountChromeOnFailedRemasure(
              manualEditTipRemountChromeSuppressedRef.current,
              Boolean(measured),
            )
          ) {
            clearManualEditTipRemountGeometryGrace('safety');
          }
          return;
        }

        // Idle remasure only: reject wild jumps; equal geometry skips inside apply.
        // Gesture/handoff never reach this guard — resize session / isHandoffRect
        // returned above; settleManualEditGeometryHandoff applies on its own path.
        // Tip-yield freeze remount: first remasure may jump layout — skip deny.
        // Expired grace: clear latch (id + until) so wild-jump deny is restored.
        const nowMs = Date.now();
        if (shouldClearTipRemountGeometryGraceOnExpiry(
          manualEditTipRemountGeometryGraceIdRef.current,
          nowMs,
          manualEditTipRemountGeometryGraceUntilRef.current,
          manualEditTipRemountFitSettleUntilRef.current,
        )) {
          clearManualEditTipRemountGeometryGrace('expiry');
        }
        const current = selectedManualEditTargetRef.current;
        const selectedIds = selectedManualEditTargetIdsRef.current;
        const postFitSettleWildJumpSkip = shouldSkipWildJumpOnceAfterTipFitSettle(
          manualEditTipPostFitSettleWildJumpSkipRef.current,
          measured.id,
          selectedIds,
        );
        const tipRemountGrace = shouldSkipWildJumpAfterTipRemountGrace(
          manualEditTipRemountGeometryGraceIdRef.current,
          measured.id,
          selectedManualEditTargetIdRef.current,
          nowMs,
          manualEditTipRemountGeometryGraceUntilRef.current,
        ) || shouldSkipWildJumpDuringTipRemountFitSettle(
          manualEditTipRemountGeometryGraceIdRef.current,
          measured.id,
          selectedManualEditTargetIdRef.current,
          nowMs,
          manualEditTipRemountFitSettleUntilRef.current,
        ) || postFitSettleWildJumpSkip;
        // Multi tip-yield: sibling members share the tip-remount session (461).
        const tipRemountSelectedMember = shouldSkipWildJumpForTipRemountSelectedMember(
          manualEditTipRemountGeometryGraceIdRef.current,
          measured.id,
          selectedIds,
          nowMs,
          manualEditTipRemountGeometryGraceUntilRef.current,
        ) || shouldSkipWildJumpDuringTipRemountFitSettleForSelectedMember(
          manualEditTipRemountGeometryGraceIdRef.current,
          measured.id,
          selectedIds,
          nowMs,
          manualEditTipRemountFitSettleUntilRef.current,
        ) || postFitSettleWildJumpSkip;
        // Consume one-shot only post-latch — do not burn it while grace/fit cover (485).
        if (shouldConsumePostTipFitSettleWildJumpSkip(
          manualEditTipPostFitSettleWildJumpSkipRef.current,
          postFitSettleWildJumpSkip
            && tipRemountGeometryGraceExpired(
              nowMs,
              manualEditTipRemountGeometryGraceUntilRef.current,
            )
            && tipRemountFitSettleExpired(
              nowMs,
              manualEditTipRemountFitSettleUntilRef.current,
            ),
        )) {
          manualEditTipPostFitSettleWildJumpSkipRef.current = false;
        }
        if (
          current?.id === measured.id
          && !tipRemountGrace
          && manualEditGeometryIsWildJump(current, measured)
        ) {
          return;
        }
        // Sibling remasure must not consume primary grace (same id gate) (436).
        // Deck host-fit settle: defer consume so post-fit remasure can still skip wild-jump (460).
        const consumeGrace = shouldConsumeTipRemountGeometryGraceOnRemasure(
          manualEditTipRemountGeometryGraceIdRef.current,
          measured.id,
          selectedManualEditTargetIdRef.current,
          nowMs,
          manualEditTipRemountGeometryGraceUntilRef.current,
        ) && !shouldDeferTipRemountGraceConsumeForDeckHostFitSettle(
          manualEditTipRemountFitSettleUntilRef.current,
          nowMs,
        );
        if (consumeGrace) {
          // Apply tip geometry before releasing chrome suppress (same tick batch) (455).
          applyManualEditMeasuredGeometry(measured);
          clearManualEditTipRemountGeometryGrace('consume');
          // Multi tip-yield reseed and Mixed→single both arm tip-remount grace;
          // refresh host paint once remasure consumes it (431/430).
          if (shouldRefreshHostPaintAfterTipRemountRemasure(true)) {
            refreshManualEditHostPaintRect(measured.id, { force: true });
          }
          refreshManualEditHostMetricsAfterTipRemountMulti(
            iframeRef.current,
            true,
          );
          return;
        }
        applyManualEditMeasuredGeometry(measured);
        // Fit-settle / multi tip-remount: refresh host paint + multi metrics (460/461).
        if (tipRemountGrace || tipRemountSelectedMember) {
          if (shouldRefreshHostPaintAfterTipRemountRemasure(true)) {
            refreshManualEditHostPaintRect(measured.id, { force: true });
          }
          refreshManualEditHostMetricsAfterTipRemountMulti(
            iframeRef.current,
            true,
          );
        }
        return;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isOurPreviewIframeSource, manualEditMode, source]);

  function nextManualEditPreviewVersion(): number {
    manualEditPreviewVersionRef.current += 1;
    return manualEditPreviewVersionRef.current;
  }

  function inspectorManualEditStyles(
    target: ManualEditTarget,
    baseSource: string,
    parsedDoc?: Document | null,
  ): ManualEditStyles {
    const snapshot = readManualEditTargetSnapshot(baseSource, target.id, {}, parsedDoc);
    return mergeManualEditInspectorStyles(snapshot.styles, target.styles);
  }

  function reconcileManualEditStyleSave(
    id: string,
    savedStyles: Partial<ManualEditStyles>,
    savedSource: string,
    /** When apply already captured styles/outerHtml, skip a third full-deck parse. */
    capturedSnapshot?: ReturnType<typeof readManualEditTargetSnapshot>,
  ) {
    const snapshot = capturedSnapshot ?? readManualEditTargetSnapshot(savedSource, id);
    if (id !== '__body__' && !snapshot.outerHtml) {
      setManualEditError(
        embedUiLabel(
          'The selected target no longer exists in the saved source. Refreshing the preview.',
          '저장된 소스에서 선택한 요소를 찾을 수 없어 미리보기를 새로고침합니다.',
        ),
      );
      setSelectedManualEditTarget(null);
      setManualEditFrozenSource(null);
      // Manual-edit is srcdoc — URL-load only needs reloadKey bust.
      if (useUrlLoadPreview) setReloadKey((key) => key + 1);
      return;
    }
    const sourceStyles = snapshot.styles;
    const supersededStyles = manualEditPendingStyleRef.current?.id === id
      ? manualEditPendingStyleRef.current.styles
      : {};
    const repairStyles: Partial<ManualEditStyles> = {};
    for (const key of Object.keys(savedStyles) as Array<keyof ManualEditStyles>) {
      if (Object.prototype.hasOwnProperty.call(supersededStyles, key)) continue;
      const sourceValue = manualEditInspectorStyleValue(key, sourceStyles[key] ?? '');
      const savedValue = savedStyles[key] ?? '';
      if (manualEditPersistedValueMatchesSavedSnapshot(key, sourceValue, savedValue)) continue;
      repairStyles[key] = sourceValue;
    }
    if (Object.keys(repairStyles).length === 0) return;
    previewStyleToIframe(id, repairStyles, nextManualEditPreviewVersion());
    setManualEditDraft((current) => ({
      ...current,
      styles: { ...current.styles, ...repairStyles },
    }));
    setManualEditError(
      embedUiLabel(
        'Saved styles differed from the active preview. Reconciled the selected target from source.',
        '저장된 스타일이 미리보기와 달라 소스 기준으로 맞췄습니다.',
      ),
    );
  }

  function clearManualEditStyleTimer() {
    if (!manualEditStyleTimerRef.current) return;
    clearTimeout(manualEditStyleTimerRef.current);
    manualEditStyleTimerRef.current = null;
  }

  function cancelManualEditPendingStyles(id: string, keys: Array<keyof ManualEditStyles>) {
    const nextPending = cancelManualEditPendingStyleSnapshot(manualEditPendingStyleRef.current, id, keys);
    if (!nextPending) {
      manualEditPendingStyleRef.current = null;
      clearManualEditStyleTimer();
      return;
    }
    manualEditPendingStyleRef.current = nextPending;
  }

  async function handleManualEditStyleChange(
    ids: string[],
    styles: Partial<ManualEditStyles>,
    label: string,
  ) {
    const version = nextManualEditPreviewVersion();
    const primaryId = ids[ids.length - 1] ?? ids[0];
    if (!primaryId) return;
    const resolveTarget = (id: string) => (
      manualEditTargets.find((item) => item.id === id)
      ?? (selectedManualEditTargetRef.current?.id === id ? selectedManualEditTargetRef.current : null)
    );

    if (styles.zIndex !== undefined) {
      const patches = ids.map((id) => ({
        id,
        styles: promoteZIndexStylesForTarget(resolveTarget(id), styles),
      }));
      for (const patch of patches) {
        previewStyleToIframe(patch.id, patch.styles, version);
      }
      applyManualEditZOrderOptimistic(patches);
      const currentPending = manualEditPendingStyleRef.current;
      const sameBatch = currentPending
        && (currentPending.targetIds ?? [currentPending.id]).every((id, index) => ids[index] === id)
        && ids.length === (currentPending.targetIds ?? [currentPending.id]).length;
      if (ids.length > 1) {
        const perTargetStyles = Object.fromEntries(
          patches.map((patch) => [patch.id, patch.styles]),
        );
        manualEditPendingStyleRef.current = {
          id: primaryId,
          perTargetStyles,
          styles: {},
          label,
          version,
        };
      } else {
        const promoted = patches[0]!.styles;
        manualEditPendingStyleRef.current = {
          id: primaryId,
          styles: sameBatch && currentPending
            ? { ...currentPending.styles, ...promoted }
            : promoted,
          label,
          version,
        };
      }
      setManualEditError(null);
      clearManualEditStyleTimer();
      for (const id of ids) {
        requestManualEditTargetRemeasure(id);
      }
      requestManualEditTargetsRefresh();
      if (manualEditResizeSessionActiveRef.current) return;
      manualEditStyleTimerRef.current = setTimeout(() => {
        manualEditStyleTimerRef.current = null;
        if (manualEditResizePausedRef.current) return;
        void flushManualEditStyleSave();
      }, MANUAL_EDIT_STYLE_AUTOSAVE_MS);
      return;
    }

    const currentPending = manualEditPendingStyleRef.current;
    const sameBatch = currentPending
      && (currentPending.targetIds ?? [currentPending.id]).every((id, index) => ids[index] === id)
      && ids.length === (currentPending.targetIds ?? [currentPending.id]).length;
    const pendingStyles = sameBatch && currentPending
      ? { ...currentPending.styles, ...styles }
      : styles;
    const pending: ManualEditPendingStyleSave = {
      id: primaryId,
      targetIds: ids.length > 1 ? ids : undefined,
      styles: pendingStyles,
      label,
      version,
    };
    manualEditPendingStyleRef.current = pending;
    setManualEditError(null);
    for (const id of ids) {
      previewStyleToIframe(id, styles, version);
    }
    // Autosave shortly after the user stops tweaking — select/background/
    // exit also flush, but a remount or crash before those gestures must not
    // be the only persistence path. Resize drag sessions pause this timer.
    clearManualEditStyleTimer();
    if (manualEditResizeSessionActiveRef.current) return;
    manualEditStyleTimerRef.current = setTimeout(() => {
      manualEditStyleTimerRef.current = null;
      if (manualEditResizePausedRef.current) return;
      void flushManualEditStyleSave();
    }, MANUAL_EDIT_STYLE_AUTOSAVE_MS);
  }

  function handleManualEditResizeSessionChange(active: boolean) {
    const wasActive = manualEditResizeSessionActiveRef.current;
    manualEditResizeSessionActiveRef.current = active;
    manualEditResizePausedRef.current = active;
    if (active) {
      clearManualEditStyleTimer();
    }
    // Gesture ended after a skipped chrome-release remasure — drop inert + catch up (489).
    if (
      wasActive
      && !active
      && shouldReleaseTipRemountChromeAfterResizeGestureEnds(
        manualEditTipRemountChromeSuppressedRef.current,
        manualEditTipChromeReleaseAfterResizeRef.current,
        false,
      )
    ) {
      manualEditTipChromeReleaseAfterResizeRef.current = false;
      remeasureTipRemountAfterDeckHostFitSettle(
        iframeRef.current,
        TIP_REMOUNT_FIT_SETTLE_CHROME_RELEASE_MS,
      );
      if (manualEditTipRemountChromeSuppressedRef.current) {
        manualEditTipRemountChromeSuppressedRef.current = false;
        setManualEditTipRemountChromeSuppressed(false);
      }
    }
    // Do not clear resize/move drafts here. endDrag clears liveViewport before
    // the async flush finishes; wiping drafts in the same turn snaps the host
    // overlay back to a stale target.rect until optimistic commit/remeasure.
  }

  function applyManualEditGestureOptimisticTarget(
    target: ManualEditTarget,
    styles: Partial<ManualEditStyles>,
    viewport?: { x: number; y: number },
    options?: { promotedPosition?: string },
  ): ManualEditRect | null {
    // Style width/height are layout px. Keep layout* in sync; scale visual rect
    // by the pre-gesture visual/layout ratio so deck fit-scale stays coherent
    // until remasure lands.
    const layoutWidth = parseExplicitPx(styles.width)
      ?? target.layoutWidth
      ?? target.rect.width;
    const layoutHeight = parseExplicitPx(styles.height)
      ?? target.layoutHeight
      ?? target.rect.height;
    const prevLayoutW = target.layoutWidth && target.layoutWidth >= 1
      ? target.layoutWidth
      : target.rect.width;
    const prevLayoutH = target.layoutHeight && target.layoutHeight >= 1
      ? target.layoutHeight
      : target.rect.height;
    const visualWidth = prevLayoutW > 0
      ? Math.round(layoutWidth * (target.rect.width / prevLayoutW))
      : layoutWidth;
    const visualHeight = prevLayoutH > 0
      ? Math.round(layoutHeight * (target.rect.height / prevLayoutH))
      : layoutHeight;
    const leftPx = parseExplicitPx(styles.left);
    const topPx = parseExplicitPx(styles.top);
    // Gesture viewport mixes visualStart + layout Δ. Convert to visual content
    // coords before idle compose (iframe previewScale ≈ 1 under deck fit-scale).
    const nextRect = viewport
      ? visualRectFromMoveViewportDraft(
          target.rect,
          viewport,
          prevLayoutW,
          prevLayoutH,
          visualWidth,
          visualHeight,
        )
      : viewportRectAfterMoveCommit(target.rect, visualWidth, visualHeight);
    setSelectedManualEditTarget((current) => {
      if (!current || current.id !== target.id) return current;
      const next: ManualEditTarget = {
        ...current,
        rect: nextRect,
        layoutWidth,
        layoutHeight,
        styles: { ...current.styles, ...styles },
        offsetLeft: leftPx ?? current.offsetLeft,
        offsetTop: topPx ?? current.offsetTop,
        cssPosition: options?.promotedPosition ?? current.cssPosition,
        stickyScrollportId: options?.promotedPosition === 'absolute'
          ? undefined
          : current.stickyScrollportId,
      };
      selectedManualEditTargetRef.current = next;
      return next;
    });
    return nextRect;
  }

  /**
   * Seed idle paint from the optimistic visual rect so pointerup never flashes
   * null / hybrid×previewScale. Prefer translating the frozen start paint by the
   * visual delta — letterboxed iframe offsets stay correct under deck fit-scale.
   */
  function seedManualEditHostPaintFromVisual(
    visualRect: ManualEditRect | null,
    previousVisual: ManualEditRect,
  ) {
    if (!visualRect || visualRect.width < 1 || visualRect.height < 1) return;
    const frame = iframeRef.current;
    const workspace = manualEditWorkspaceRef.current;
    const selectedId = selectedManualEditTargetIdRef.current;
    const livePaint = frame && workspace && selectedId
      ? measureManualEditTargetHostRect(frame, workspace, selectedId)
      : null;
    setManualEditHostPaintRect((prev) => {
      const translated = prev
        ? hostPaintRectAfterVisualMove(prev, previousVisual, visualRect)
        : null;
      return translated ?? livePaint ?? hostPaintRectFromVisualContent(
        visualRect,
        manualEditHostScale,
        manualEditHostOffset,
      );
    });
  }

  function refreshManualEditHostPaintRect(
    id: string | null = selectedManualEditTargetIdRef.current,
    options?: { force?: boolean },
  ) {
    if (!id) {
      setManualEditHostPaintRect(null);
      return;
    }
    // Gesture display is owned by overlay draft/liveViewport composition.
    if (manualEditResizeSessionActiveRef.current && !options?.force) return;
    const frame = iframeRef.current;
    const workspace = manualEditWorkspaceRef.current;
    if (!frame || !workspace) return;
    const paint = measureManualEditTargetHostRect(frame, workspace, id);
    if (paint && paint.width >= 1 && paint.height >= 1) {
      setManualEditHostPaintRect(paint);
    } else {
      // Keep optimistic seed on failed measure — nulling flashes hybrid compose.
      if (!options?.force) setManualEditHostPaintRect(null);
    }
    setManualEditHostScale(measureIframeHostScale(frame));
    setManualEditHostOffset(measureIframeOffsetInHost(frame, workspace));
  }

  /** Wait for bridge remeasure + host paint sync before geometry session unlock. */
  async function settleManualEditGeometryHandoff(id: string): Promise<void> {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
    manualEditGeometryHandoffIdRef.current = id;
    try {
      const optimistic = selectedManualEditTargetRef.current;
      const frame = iframeRef.current;
      const workspace = manualEditWorkspaceRef.current;
      let measured: ManualEditTarget | null = null;

      if (frame && workspace && optimistic?.id === id) {
        const content = measureManualEditTargetContentRect(frame, id);
        if (content) {
          measured = {
            ...optimistic,
            rect: content.rect,
            layoutWidth: content.layoutWidth,
            layoutHeight: content.layoutHeight,
          };
        }
      }

      if (
        !measured
        || (optimistic && !manualEditGeometryRoughlyMatches(measured, optimistic))
      ) {
        requestManualEditTargetRemeasure(id);
        const bridgeMeasured = await waitForManualEditTargetRemeasure(id);
        if (
          bridgeMeasured
          && (!optimistic || manualEditGeometryRoughlyMatches(bridgeMeasured, optimistic))
        ) {
          measured = bridgeMeasured;
        }
      }

      if (
        measured
        && optimistic
        && manualEditGeometryRoughlyMatches(measured, optimistic)
      ) {
        applyManualEditMeasuredGeometry(measured);
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      refreshManualEditHostPaintRect(id, { force: true });
    } finally {
      manualEditGeometryHandoffIdRef.current = null;
    }
  }

  function handleManualEditResizePreview(styles: Partial<ManualEditStyles>) {
    const target = selectedManualEditTargetRef.current;
    if (!target) return;
    const version = nextManualEditPreviewVersion();
    const currentPending = manualEditPendingStyleRef.current;
    const pendingStyles = currentPending?.id === target.id
      ? { ...currentPending.styles, ...styles }
      : styles;
    clearManualEditStyleTimer();
    manualEditPendingStyleRef.current = {
      id: target.id,
      styles: pendingStyles,
      label: resizeHistoryLabel(target.label),
      version,
    };
    setManualEditError(null);
    previewStyleToIframe(target.id, styles, version);
    setManualEditDraft((current) => ({
      ...current,
      styles: { ...current.styles, ...styles },
    }));
    setManualEditResizeDraftSize((prev) => {
      // Drafts are layout px (CSS write space) — never fall back to visual rect.
      const layoutFallbackW = target.layoutWidth && target.layoutWidth >= 1
        ? target.layoutWidth
        : target.rect.width;
      const layoutFallbackH = target.layoutHeight && target.layoutHeight >= 1
        ? target.layoutHeight
        : target.rect.height;
      const width = parseExplicitPx(styles.width) ?? prev?.width ?? layoutFallbackW;
      const height = parseExplicitPx(styles.height) ?? prev?.height ?? layoutFallbackH;
      return { width, height };
    });
  }

  function handleManualEditMovePreview(
    styles: Partial<ManualEditStyles>,
    viewport?: { x: number; y: number },
  ) {
    const target = selectedManualEditTargetRef.current;
    if (!target) return;
    const version = nextManualEditPreviewVersion();
    const currentPending = manualEditPendingStyleRef.current;
    const pendingStyles = currentPending?.id === target.id
      ? { ...currentPending.styles, ...styles }
      : styles;
    clearManualEditStyleTimer();
    manualEditPendingStyleRef.current = {
      id: target.id,
      styles: pendingStyles,
      label: moveHistoryLabel(target.label),
      version,
    };
    setManualEditError(null);
    previewStyleToIframe(target.id, styles, version);
    setManualEditDraft((current) => ({
      ...current,
      styles: { ...current.styles, ...styles },
    }));
    if (viewport) {
      setManualEditMoveDraftPos({
        x: Math.round(viewport.x),
        y: Math.round(viewport.y),
      });
    }
  }


  /**
   * Keyed iframe/draft + pending rollback for a geometry gesture. Used by Esc /
   * pointercancel and by flush-fail after commit — pending restore alone would
   * leave the live preview on post-gesture styles while disk stayed old.
   */
  function rollbackManualEditGestureStyles(
    stylesBefore: Partial<ManualEditStyles>,
    geometryBefore?: ManualEditGestureGeometrySnapshot,
  ) {
    const target = selectedManualEditTargetRef.current;
    clearManualEditStyleTimer();
    manualEditResizeSessionActiveRef.current = false;
    manualEditResizePausedRef.current = false;
    setManualEditMoveDraftPos(null);
    setManualEditGroupDraftRects(null);
    setManualEditResizeDraftSize(null);
    if (!target) return;
    const cancelKeys = manualEditGestureRollbackKeys(stylesBefore, PROMOTE_MOVE_STYLE_KEYS);
    cancelManualEditPendingStyles(target.id, cancelKeys);
    const pending = manualEditPendingStyleRef.current;
    if (
      pending?.id === target.id
      && (
        pending.label === moveHistoryLabel(target.label)
        || pending.label === resizeHistoryLabel(target.label)
      )
    ) {
      manualEditPendingStyleRef.current = {
        ...pending,
        label: `Edit: ${target.label}`,
      };
    }
    const reset = keyedManualEditStyleRollback(stylesBefore, cancelKeys);
    previewStyleToIframe(target.id, reset, nextManualEditPreviewVersion());
    setManualEditDraft((current) => ({
      ...current,
      styles: { ...current.styles, ...reset },
    }));
    if (geometryBefore) {
      restoreManualEditGestureGeometry(geometryBefore);
    }
    // Resume autosave for any non-geometry draft that survived the rollback.
    if (manualEditPendingStyleRef.current && !manualEditResizeSessionActiveRef.current) {
      clearManualEditStyleTimer();
      manualEditStyleTimerRef.current = setTimeout(() => {
        manualEditStyleTimerRef.current = null;
        void flushManualEditStyleSave();
      }, MANUAL_EDIT_STYLE_AUTOSAVE_MS);
    }
  }

  async function handleManualEditResizeCommit(
    styles: Partial<ManualEditStyles>,
    stylesBefore: Partial<ManualEditStyles>,
    viewport?: { x: number; y: number },
  ) {
    const target = selectedManualEditTargetRef.current;
    if (!target) return;
    handleManualEditResizePreview(styles);
    const geometryBefore = captureManualEditGestureGeometrySnapshot(target);
    // Optimistic geometry must land before any await; otherwise clearing
    // liveViewport/drafts snaps the overlay to the pre-gesture rect.
    const previousVisual = { ...target.rect };
    const resizeViewport = viewport
      && (
        parseExplicitPx(styles.left) !== parseExplicitPx(stylesBefore.left)
        || parseExplicitPx(styles.top) !== parseExplicitPx(stylesBefore.top)
      )
      ? viewport
      : undefined;
    const visualRect = applyManualEditGestureOptimisticTarget(target, styles, resizeViewport);
    setManualEditResizeDraftSize(null);
    setManualEditMoveDraftPos(null);
    setManualEditGroupDraftRects(null);
    seedManualEditHostPaintFromVisual(visualRect, previousVisual);
    // Keep geometry session locked through persist + paint settle so RAF sync /
    // od-edit-targets / od-edit-rect cannot clobber the handoff frame.
    // Session unlock is owned by overlay finish() → onResizeSessionChange(false).
    manualEditResizeSessionActiveRef.current = true;
    manualEditResizePausedRef.current = true;
    const ok = await flushManualEditStyleSave({ force: true });
    if (!ok) {
      rollbackManualEditGestureStyles(stylesBefore, geometryBefore);
      return;
    }
    await settleManualEditGeometryHandoff(target.id);
  }

  async function handleManualEditMoveCommit(
    styles: Partial<ManualEditStyles>,
    stylesBefore: Partial<ManualEditStyles>,
    viewport?: { x: number; y: number },
  ) {
    const target = selectedManualEditTargetRef.current;
    if (!target) return;
    handleManualEditMovePreview(styles, viewport);
    const promotedPosition = String(styles.position || '').toLowerCase();
    const stickyScrollportId = promotedPosition === 'absolute'
      ? target.stickyScrollportId
      : undefined;
    const geometryBefore = captureManualEditGestureGeometrySnapshot(target);
    const previousVisual = { ...target.rect };
    // Keep geometry session locked through sticky pin / persist / paint settle.
    // Session unlock is owned by overlay finish() → onResizeSessionChange(false).
    manualEditResizeSessionActiveRef.current = true;
    manualEditResizePausedRef.current = true;
    try {
      if (stickyScrollportId) {
        const scrollportOk = await applyManualEdit(
          { id: stickyScrollportId, kind: 'set-style', styles: { position: 'relative' } },
          embedUiLabel('Pin scroll container', '스크롤 컨테이너 고정'),
        );
        if (!scrollportOk) {
          rollbackManualEditGestureStyles(stylesBefore, geometryBefore);
          return;
        }
      }
      const visualRect = applyManualEditGestureOptimisticTarget(
        target,
        styles,
        viewport,
        promotedPosition ? { promotedPosition } : undefined,
      );
      setManualEditMoveDraftPos(null);
    setManualEditGroupDraftRects(null);
      setManualEditResizeDraftSize(null);
      seedManualEditHostPaintFromVisual(visualRect, previousVisual);
      const ok = await flushManualEditStyleSave({ force: true });
      if (!ok) {
        rollbackManualEditGestureStyles(stylesBefore, geometryBefore);
        return;
      }
      await settleManualEditGeometryHandoff(target.id);
    } catch {
      rollbackManualEditGestureStyles(stylesBefore, geometryBefore);
    }
  }

  function handleManualEditResizeCancel(stylesBefore: Partial<ManualEditStyles>) {
    rollbackManualEditGestureStyles(stylesBefore);
  }

  function handleManualEditMoveCancel(stylesBefore: Partial<ManualEditStyles>) {
    rollbackManualEditGestureStyles(stylesBefore);
  }

  function applyManualEditGroupOptimisticRects(
    updates: Array<{ id: string; styles: Partial<ManualEditStyles>; rect: ManualEditRect }>,
  ) {
    const updateMap = new Map(updates.map((update) => [update.id, update]));
    setManualEditTargets((current) =>
      current.map((item) => {
        const update = updateMap.get(item.id);
        if (!update) return item;
        const leftPx = parseExplicitPx(update.styles.left);
        const topPx = parseExplicitPx(update.styles.top);
        const widthPx = parseExplicitPx(update.styles.width);
        const heightPx = parseExplicitPx(update.styles.height);
        return {
          ...item,
          rect: { ...update.rect },
          layoutWidth: widthPx ?? item.layoutWidth,
          layoutHeight: heightPx ?? item.layoutHeight,
          offsetLeft: leftPx ?? item.offsetLeft,
          offsetTop: topPx ?? item.offsetTop,
          styles: { ...item.styles, ...update.styles },
        };
      }),
    );
    const primaryId = selectedManualEditTargetIdRef.current;
    const primaryUpdate = primaryId ? updateMap.get(primaryId) : null;
    if (!primaryUpdate || !selectedManualEditTargetRef.current) return;
    setSelectedManualEditTarget((current) => {
      if (!current || current.id !== primaryId) return current;
      const leftPx = parseExplicitPx(primaryUpdate.styles.left);
      const topPx = parseExplicitPx(primaryUpdate.styles.top);
      const widthPx = parseExplicitPx(primaryUpdate.styles.width);
      const heightPx = parseExplicitPx(primaryUpdate.styles.height);
      const next: ManualEditTarget = {
        ...current,
        rect: { ...primaryUpdate.rect },
        layoutWidth: widthPx ?? current.layoutWidth,
        layoutHeight: heightPx ?? current.layoutHeight,
        offsetLeft: leftPx ?? current.offsetLeft,
        offsetTop: topPx ?? current.offsetTop,
        styles: { ...current.styles, ...primaryUpdate.styles },
      };
      selectedManualEditTargetRef.current = next;
      return next;
    });
  }

  function handleManualEditGroupGeometryPreview(
    updates: Array<{ id: string; styles: Partial<ManualEditStyles>; rect: ManualEditRect }>,
    label: string,
  ) {
    if (updates.length === 0) return;
    const version = nextManualEditPreviewVersion();
    const ids = updates.map((update) => update.id);
    const perTargetStyles: Record<string, Partial<ManualEditStyles>> = {};
    for (const update of updates) {
      perTargetStyles[update.id] = update.styles;
      previewStyleToIframe(update.id, update.styles, version);
    }
    clearManualEditStyleTimer();
    manualEditPendingStyleRef.current = {
      id: ids[ids.length - 1]!,
      targetIds: ids,
      perTargetStyles,
      styles: {},
      label,
      version,
    };
    setManualEditError(null);
    setManualEditGroupDraftRects(
      Object.fromEntries(updates.map((update) => [update.id, update.rect])),
    );
    applyManualEditGroupOptimisticRects(updates);
  }

  function handleManualEditGroupMovePreview(updates: GroupMovePreviewUpdate[]) {
    handleManualEditGroupGeometryPreview(updates, groupMoveHistoryLabel(updates.length));
  }

  function rollbackManualEditGroupGestureStyles(
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
    memberStarts: GroupMoveMemberStart[],
  ) {
    clearManualEditStyleTimer();
    manualEditResizeSessionActiveRef.current = false;
    manualEditResizePausedRef.current = false;
    setManualEditGroupDraftRects(null);
    const version = nextManualEditPreviewVersion();
    for (const member of memberStarts) {
      const before = stylesBefore[member.id] ?? {};
      const cancelKeys = manualEditGestureRollbackKeys(before, PROMOTE_MOVE_STYLE_KEYS);
      cancelManualEditPendingStyles(member.id, cancelKeys);
      const reset = keyedManualEditStyleRollback(before, cancelKeys);
      previewStyleToIframe(member.id, reset, version);
    }
    setManualEditTargets((current) =>
      current.map((item) => {
        const member = memberStarts.find((start) => start.id === item.id);
        if (!member) return item;
        return { ...item, rect: { ...member.startRect } };
      }),
    );
    const primaryId = selectedManualEditTargetIdRef.current;
    const primaryStart = memberStarts.find((start) => start.id === primaryId);
    if (primaryStart && selectedManualEditTargetRef.current) {
      setSelectedManualEditTarget((current) => {
        if (!current || current.id !== primaryId) return current;
        const before = stylesBefore[primaryStart.id] ?? {};
        const next: ManualEditTarget = {
          ...current,
          rect: { ...primaryStart.startRect },
          styles: { ...current.styles, ...before },
        };
        selectedManualEditTargetRef.current = next;
        return next;
      });
    }
    if (manualEditPendingStyleRef.current?.perTargetStyles) {
      manualEditPendingStyleRef.current = null;
    }
    if (manualEditPendingStyleRef.current && !manualEditResizeSessionActiveRef.current) {
      clearManualEditStyleTimer();
      manualEditStyleTimerRef.current = setTimeout(() => {
        manualEditStyleTimerRef.current = null;
        void flushManualEditStyleSave();
      }, MANUAL_EDIT_STYLE_AUTOSAVE_MS);
    }
  }

  async function handleManualEditGroupMoveCommit(
    updates: GroupMovePreviewUpdate[],
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
  ) {
    const targets = resolveSelectedManualEditMoveTargets();
    if (targets.length < 2 || updates.length === 0) return;
    handleManualEditGroupMovePreview(updates);
    const memberStarts = buildGroupMoveMemberStarts(targets);
    const anchor = memberStarts.find((member) => member.id === updates[0]!.id) ?? memberStarts[0]!;
    const anchorUpdate = updates.find((update) => update.id === anchor.id) ?? updates[0]!;
    const dx = (parseExplicitPx(anchorUpdate.styles.left) ?? anchor.startLeftPx) - anchor.startLeftPx;
    const dy = (parseExplicitPx(anchorUpdate.styles.top) ?? anchor.startTopPx) - anchor.startTopPx;
    manualEditResizeSessionActiveRef.current = true;
    manualEditResizePausedRef.current = true;
    setManualEditGroupDraftRects(null);
    applyManualEditGroupOptimisticRects(updates);
    const baseSource = manualEditPatchBaseSource({
      manualEditMode,
      frozenSource: manualEditFrozenSource,
      liveSource: sourceRef.current,
    });
    if (baseSource == null) {
      rollbackManualEditGroupGestureStyles(stylesBefore, memberStarts);
      return;
    }
    const targetsById = new Map(targets.map((target) => [target.id, target]));
    const { patches, parsedDoc } = buildGroupMoveStylePatches(
      baseSource,
      memberStarts,
      targetsById,
      dx,
      dy,
    );
    try {
      const ok = await applyManualEditBatch(
        patches,
        groupMoveHistoryLabel(targets.length),
        parsedDoc,
      );
      if (!ok) {
        rollbackManualEditGroupGestureStyles(stylesBefore, memberStarts);
        return;
      }
      manualEditPendingStyleRef.current = null;
      clearManualEditStyleTimer();
      for (const target of targets) {
        requestManualEditTargetRemeasure(target.id);
      }
      const primaryId = selectedManualEditTargetIdRef.current;
      if (primaryId) {
        await settleManualEditGeometryHandoff(primaryId);
      }
    } catch {
      rollbackManualEditGroupGestureStyles(stylesBefore, memberStarts);
    }
  }

  function handleManualEditGroupMoveCancel(
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
    memberStarts: GroupMoveMemberStart[],
  ) {
    rollbackManualEditGroupGestureStyles(stylesBefore, memberStarts);
  }

  function handleManualEditGroupResizePreview(updates: GroupResizePreviewUpdate[]) {
    handleManualEditGroupGeometryPreview(updates, groupResizeHistoryLabel(updates.length));
  }

  async function handleManualEditGroupResizeCommit(
    updates: GroupResizePreviewUpdate[],
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
    handle: ResizeHandle,
    dx: number,
    dy: number,
    shiftKey: boolean,
  ) {
    const targets = resolveSelectedManualEditResizeTargets();
    if (targets.length < 2 || updates.length === 0) return;
    handleManualEditGroupResizePreview(updates);
    const memberStarts = buildGroupResizeMemberStarts(targets);
    manualEditResizeSessionActiveRef.current = true;
    manualEditResizePausedRef.current = true;
    setManualEditGroupDraftRects(null);
    applyManualEditGroupOptimisticRects(updates);
    const baseSource = manualEditPatchBaseSource({
      manualEditMode,
      frozenSource: manualEditFrozenSource,
      liveSource: sourceRef.current,
    });
    if (baseSource == null) {
      rollbackManualEditGroupGestureStyles(stylesBefore, memberStarts);
      return;
    }
    const { patches, parsedDoc } = buildGroupResizeStylePatches(
      baseSource,
      memberStarts,
      handle,
      dx,
      dy,
      shiftKey,
    );
    try {
      const ok = await applyManualEditBatch(
        patches,
        groupResizeHistoryLabel(targets.length),
        parsedDoc,
      );
      if (!ok) {
        rollbackManualEditGroupGestureStyles(stylesBefore, memberStarts);
        return;
      }
      manualEditPendingStyleRef.current = null;
      clearManualEditStyleTimer();
      for (const target of targets) {
        requestManualEditTargetRemeasure(target.id);
      }
      const primaryId = selectedManualEditTargetIdRef.current;
      if (primaryId) {
        await settleManualEditGeometryHandoff(primaryId);
      }
    } catch {
      rollbackManualEditGroupGestureStyles(stylesBefore, memberStarts);
    }
  }

  function handleManualEditGroupResizeCancel(
    stylesBefore: Record<string, Partial<ManualEditStyles>>,
    memberStarts: GroupResizeMemberStart[],
  ) {
    rollbackManualEditGroupGestureStyles(stylesBefore, memberStarts);
  }

  async function applyManualEditGroupGeometryAction(
    updates: GroupMovePreviewUpdate[],
    label: string,
  ): Promise<boolean> {
    const targets = resolveSelectedManualEditMoveTargets();
    if (targets.length < 2 || updates.length === 0) return false;
    handleManualEditGroupGeometryPreview(updates, label);
    const baseSource = manualEditPatchBaseSource({
      manualEditMode,
      frozenSource: manualEditFrozenSource,
      liveSource: sourceRef.current,
    });
    if (baseSource == null) return false;
    const { patches, parsedDoc } = buildGroupGeometryPatches(baseSource, updates);
    if (patches.length === 0) return true;
    const ok = await applyManualEditBatch(patches, label, parsedDoc);
    if (!ok) return false;
    manualEditPendingStyleRef.current = null;
    clearManualEditStyleTimer();
    setManualEditGroupDraftRects(null);
    for (const target of targets) {
      requestManualEditTargetRemeasure(target.id);
    }
    const primaryId = selectedManualEditTargetIdRef.current;
    if (primaryId) {
      await settleManualEditGeometryHandoff(primaryId);
    }
    return true;
  }

  async function handleManualEditGroupAlign(kind: GroupAlignKind) {
    const targets = resolveSelectedManualEditAnchoredMoveTargets();
    if (!canGroupAlign(targets, selectedManualEditGeometryOptions(), manualEditTargetIsDescendantOf)) return;
    const updates = computeGroupAlignPreviewUpdates(targets, kind);
    await applyManualEditGroupGeometryAction(
      updates,
      groupAlignHistoryLabel(targets.length, kind),
    );
  }

  async function handleManualEditGroupDistribute(kind: GroupDistributeKind) {
    const targets = resolveSelectedManualEditAnchoredMoveTargets();
    if (!canGroupDistribute(targets, selectedManualEditGeometryOptions(), manualEditTargetIsDescendantOf)) return;
    const updates = computeGroupDistributePreviewUpdates(targets, kind);
    await applyManualEditGroupGeometryAction(
      updates,
      groupAlignHistoryLabel(targets.length, kind),
    );
  }

  function revertManualEditPendingStylePreview(
    pending: ManualEditPendingStyleSave,
    parsedDoc: Document,
    base: string,
  ) {
    for (const { id, styles } of manualEditPendingStyleEntries(pending)) {
      const keys = Object.keys(styles) as Array<keyof ManualEditStyles>;
      if (keys.length === 0) continue;
      const target = id === '__body__'
        ? null
        : manualEditTargets.find((item) => item.id === id)
          ?? (selectedManualEditTargetRef.current?.id === id ? selectedManualEditTargetRef.current : null);
      const sourceStyles = target
        ? inspectorManualEditStyles(target, base, parsedDoc)
        : readManualEditStyles(base, id, {}, parsedDoc);
      const resetStyles = keys.reduce<Partial<ManualEditStyles>>((acc, key) => {
        acc[key] = sourceStyles[key] ?? '';
        return acc;
      }, {});
      previewStyleToIframe(id, resetStyles, nextManualEditPreviewVersion());
    }
    const affectedIds = manualEditPendingAffectedIds(pending).filter((id) => id !== '__body__');
    const touchesZOrder = manualEditPendingStyleEntries(pending).some(
      ({ styles }) => styles.zIndex !== undefined || styles.position !== undefined,
    );
    if (touchesZOrder && affectedIds.length > 0) {
      setManualEditTargets((current) => current.map((item) => {
        if (!affectedIds.includes(item.id)) return item;
        const target = item;
        const sourceStyles = inspectorManualEditStyles(target, base, parsedDoc);
        return {
          ...item,
          styles: {
            ...item.styles,
            zIndex: sourceStyles.zIndex ?? '',
            position: sourceStyles.position ?? item.styles.position,
          },
          stackZ: readStackZFromZIndexStyle(sourceStyles.zIndex),
          cssPosition: sourceStyles.position || item.cssPosition,
        };
      }));
      for (const id of affectedIds) {
        requestManualEditTargetRemeasure(id);
      }
      requestManualEditTargetsRefresh();
    }
    setManualEditResizeDraftSize(null);
    setManualEditMoveDraftPos(null);
    setManualEditGroupDraftRects(null);
  }

  function reconcileManualEditDraftAfterNoOpFlush(
    pending: ManualEditPendingStyleSave,
    sharedParsedDoc?: Document | null,
  ) {
    const base = sourceRef.current ?? '';
    if (!base) return;
    const entries = manualEditPendingStyleEntries(pending);
    if (entries.length === 0) return;

    const parsedDoc = sharedParsedDoc ?? parseManualEditSource(base);
    revertManualEditPendingStylePreview(pending, parsedDoc, base);

    const keys = Array.from(new Set(
      entries.flatMap(({ styles }) => Object.keys(styles) as Array<keyof ManualEditStyles>),
    ));
    if (keys.length === 0) return;

    const selectedIds = selectedManualEditTargetIdsRef.current;
    if (selectedIds.length > 1) {
      const refreshed = resolveManualEditTargetsByIds(selectedIds, manualEditTargets);
      const noopFlushSourceOnly = shouldReadMultiInspectorStylesFromSourceOnly('noop-flush');
      const { styles, mixedKeys } = mergeInspectorStylesForTargets(
        refreshed,
        (id) => {
          if (noopFlushSourceOnly) {
            return readManualEditStyles(base, id, {}, parsedDoc);
          }
          const target = refreshed.find((item) => item.id === id) ?? null;
          return target
            ? inspectorManualEditStyles(target, base, parsedDoc)
            : readManualEditStyles(base, id, {}, parsedDoc);
        },
      );
      setManualEditMixedStyleKeys(mixedKeys);
      setManualEditDraft((current) => ({ ...current, styles }));
      return;
    }
    if (selectedManualEditTargetRef.current) {
      const sourceStyles = inspectorManualEditStyles(
        selectedManualEditTargetRef.current,
        base,
        parsedDoc,
      );
      const resetStyles = keys.reduce<Partial<ManualEditStyles>>((acc, key) => {
        acc[key] = sourceStyles[key] ?? '';
        return acc;
      }, {});
      setManualEditDraft((current) => ({
        ...current,
        styles: { ...current.styles, ...resetStyles },
      }));
    }
  }

  async function flushManualEditStyleSave(options?: { force?: boolean }): Promise<boolean> {
    // Boundary exits must pass `{ force: true }` — see shouldSkip…WhilePaused.
    if (shouldSkipManualEditStyleFlushWhilePaused(manualEditResizePausedRef.current, options)) {
      return true;
    }
    // Boundary flushes (exit / select / text commit) must not lose a race with
    // autosave: wait for the lock, then persist whatever draft remains.
    if (manualEditSavingRef.current) {
      if (!(await waitForManualEditSaveIdle(() => manualEditSavingRef.current))) {
        return false;
      }
    }
    const pending = manualEditPendingStyleRef.current;
    if (!pending) return true;
    if (manualEditSavingRef.current) return false;
    clearManualEditStyleTimer();
    const zIndexTargetIds = collectZIndexTargetsFromPending(pending);
    manualEditPendingStyleRef.current = null;
    const baseSource = manualEditPatchBaseSource({
      manualEditMode,
      frozenSource: manualEditFrozenSource,
      liveSource: sourceRef.current,
    });
    if (baseSource == null) {
      manualEditPendingStyleRef.current = pending;
      return false;
    }
    if (pending.perTargetStyles) {
      const parsedDoc = parseManualEditSource(baseSource);
      const patches = Object.entries(pending.perTargetStyles)
        .map(([id, styles]) => {
          const sourceStyles = readManualEditStyles(baseSource, id, {}, parsedDoc);
          const effectiveStyles = diffManualEditStylePatch(baseSource, id, styles, {
            sourceStyles,
          });
          if (Object.keys(effectiveStyles).length === 0) return null;
          return { id, kind: 'set-style' as const, styles: effectiveStyles };
        })
        .filter((patch): patch is Extract<ManualEditPatch, { kind: 'set-style' }> => patch !== null);
      if (patches.length === 0) {
        reconcileManualEditDraftAfterNoOpFlush(pending, parsedDoc);
        afterManualEditZIndexPersist(zIndexTargetIds);
        return true;
      }
      const ok = await applyManualEditBatch(patches, pending.label, parsedDoc);
      if (!ok) {
        manualEditPendingStyleRef.current = restoreManualEditPendingStyleAfterFailedFlush(
          manualEditPendingStyleRef.current,
          pending,
        );
        return false;
      }
      afterManualEditZIndexPersist(zIndexTargetIds);
      return true;
    }
    const targetIds = pending.targetIds ?? [pending.id];
    if (targetIds.length > 1) {
      // One Document for multi-target diff + no-op reconcile / apply.
      const parsedDoc = parseManualEditSource(baseSource);
      const patches = buildManualEditStylePatchesForTargets(
        baseSource,
        targetIds,
        pending.styles,
        parsedDoc,
      );
      if (patches.length === 0) {
        reconcileManualEditDraftAfterNoOpFlush(pending, parsedDoc);
        afterManualEditZIndexPersist(zIndexTargetIds);
        return true;
      }
      const ok = await applyManualEditBatch(patches, pending.label, parsedDoc);
      if (!ok) {
        manualEditPendingStyleRef.current = restoreManualEditPendingStyleAfterFailedFlush(
          manualEditPendingStyleRef.current,
          pending,
        );
        return false;
      }
      afterManualEditZIndexPersist(zIndexTargetIds);
      return true;
    }
    // One Document for style read + no-op reconcile + apply (was parse ×2/×3).
    const parsedDoc = parseManualEditSource(baseSource);
    const sourceStyles = readManualEditStyles(baseSource, pending.id, {}, parsedDoc);
    const effectiveStyles = diffManualEditStylePatch(baseSource, pending.id, pending.styles, {
      sourceStyles,
    });
    if (Object.keys(effectiveStyles).length === 0) {
      reconcileManualEditDraftAfterNoOpFlush(pending, parsedDoc);
      afterManualEditZIndexPersist(zIndexTargetIds);
      return true;
    }
    const ok = await applyManualEdit(
      { id: pending.id, kind: 'set-style', styles: effectiveStyles },
      pending.label,
      undefined,
      undefined,
      parsedDoc,
    );
    if (!ok) {
      manualEditPendingStyleRef.current = restoreManualEditPendingStyleAfterFailedFlush(
        manualEditPendingStyleRef.current,
        pending,
      );
      return false;
    }
    afterManualEditZIndexPersist(zIndexTargetIds);
    return true;
  }

  async function settleManualEditStyleBoundary(): Promise<boolean> {
    // History / text / patch boundaries must not soft-skip while a gesture
    // paused autosave — that looked like a successful flush with no write.
    return flushManualEditStyleSave({ force: true });
  }


  function cancelManualEditStyleDraft() {
    const pending = manualEditPendingStyleRef.current;
    if (!pending) return;
    clearManualEditStyleTimer();
    manualEditPendingStyleRef.current = null;
    const base = sourceRef.current ?? '';
    const parsedDoc = parseManualEditSource(base);
    revertManualEditPendingStylePreview(pending, parsedDoc, base);
    const selectedIds = selectedManualEditTargetIdsRef.current;
    if (selectedIds.length > 1) {
      const cancelSourceOnly = shouldReadMultiInspectorStylesFromSourceOnly('cancel');
      const reseed = planManualEditMultiInspectorReseed({
        selectedIds,
        readStyles: (id) => {
          if (cancelSourceOnly) {
            return readManualEditStyles(base, id, {}, parsedDoc);
          }
          const target = resolveManualEditTargetsByIds([id], manualEditTargets)[0] ?? null;
          return target
            ? inspectorManualEditStyles(target, base, parsedDoc)
            : readManualEditStyles(base, id, {}, parsedDoc);
        },
      });
      setManualEditMixedStyleKeys(reseed.mixedKeys);
      setManualEditDraft((current) => ({
        ...current,
        styles: reseed.styles ?? current.styles,
        fullSource: base,
      }));
    } else if (selectedManualEditTargetRef.current) {
      const sourceStyles = inspectorManualEditStyles(
        selectedManualEditTargetRef.current,
        base,
        parsedDoc,
      );
      setManualEditDraft((current) => ({ ...current, styles: sourceStyles, fullSource: base }));
      setManualEditMixedStyleKeys(new Set());
    }
    setManualEditError(null);
  }

  async function exitManualEditModeAfterFlush(): Promise<boolean> {
    // Force: geometry gestures pause autosave; a soft flush would no-op and the
    // mode-off effect would then drop the pending draft.
    const ok = await flushManualEditStyleSave({ force: true });
    if (!ok) return false;
    manualEditResizeSessionActiveRef.current = false;
    manualEditResizePausedRef.current = false;
    setManualEditPanelPosition(null);
    setManualEditPanelCollapsed(false);
    setManualEditLayersPanelOpen(false);
    setManualEditMode(false);
    return true;
  }

  // Clears the hover affordance and re-arms the iframe's per-element hover
  // dedupe so re-entering the same element re-announces it. Called from the
  // workspace's own mouseleave (host-side), NOT the iframe's mouseleave — the
  // affordance overlays the iframe, so reacting to the iframe leaving would
  // yank it out from under the cursor and strobe on/off.
  function clearManualEditHover() {
    setManualEditHoverTarget(null);
    const win = iframeRef.current?.contentWindow;
    if (win) win.postMessage({ type: 'od-edit-hover-reset' }, '*');
  }

  function manualEditTargetIsDescendantOf(childId: string, ancestorId: string): boolean {
    return manualEditTargetIsDescendantOfInDocument(
      iframeContentDocumentIfAccessible(iframeRef.current),
      childId,
      ancestorId,
    );
  }

  function selectedManualEditGeometryOptions() {
    return {
      editMode: manualEditMode,
      inlineTextEditing: manualEditInlineTextEditing,
    };
  }

  function resolveSelectedManualEditAnchoredMoveTargets(
    targets: readonly ManualEditTarget[] = resolveManualEditTargetsByIds(
      selectedManualEditTargetIdsRef.current,
      manualEditTargets,
    ),
  ) {
    return resolveGroupMovableTargets(
      targets,
      selectedManualEditGeometryOptions(),
      manualEditTargetIsDescendantOf,
    );
  }

  function resolveSelectedManualEditMoveTargets(
    targets: readonly ManualEditTarget[] = resolveManualEditTargetsByIds(
      selectedManualEditTargetIdsRef.current,
      manualEditTargets,
    ),
  ) {
    return resolveGroupMoveTargets(
      targets,
      selectedManualEditGeometryOptions(),
      manualEditTargetIsDescendantOf,
    );
  }

  function resolveSelectedManualEditResizeTargets(
    targets: readonly ManualEditTarget[] = resolveManualEditTargetsByIds(
      selectedManualEditTargetIdsRef.current,
      manualEditTargets,
    ),
  ) {
    return resolveGroupResizableTargets(
      targets,
      selectedManualEditGeometryOptions(),
      manualEditTargetIsDescendantOf,
    );
  }

  async function selectManualEditTarget(
    target: ManualEditTarget,
    options?: { additive?: boolean },
  ) {
    if (manualEditResizeSessionActiveRef.current || manualEditInlineTextEditing) return;

    const doc = iframeContentDocumentIfAccessible(iframeRef.current);
    const resolvedId = resolveManualEditGraphicContainerId(doc, target.id);
    const catalog = manualEditTargets.length > 0 ? manualEditTargets : [target];
    const resolvedTarget = resolvedId !== target.id
      ? (catalog.find((item) => item.id === resolvedId) ?? { ...target, id: resolvedId })
      : target;

    const currentIds = selectedManualEditTargetIdsRef.current;
    const nextIds = nextManualEditSelectionIds(
      currentIds,
      resolvedTarget.id,
      options?.additive ?? false,
      MANUAL_EDIT_MULTI_SELECT_MAX,
      manualEditTargetIsDescendantOf,
    );
    if (nextIds.length === 0) {
      await clearManualEditTargetSelection();
      return;
    }

    const pending = manualEditPendingStyleRef.current;
    const pendingIds = pending?.targetIds ?? (pending?.id ? [pending.id] : null);
    if (shouldFlushManualEditStylesOnSelectionBoundary(pendingIds, nextIds)) {
      if (!(await flushManualEditStyleSave({ force: true }))) return;
    }

    const catalogForResolve = manualEditTargets.length > 0
      ? manualEditTargets
      : [resolvedTarget];
    const nextTargets = resolveManualEditTargetsByIds(nextIds, catalogForResolve);
    if (nextTargets.length === 0) return;
    const primary = nextTargets[nextTargets.length - 1]!;

    setManualEditPageStylesOpen(false);
    if (selectedManualEditTargetIdRef.current !== primary.id) {
      const canvasWidth = previewBodySize?.width ?? 1200;
      const canvasHeight = previewBodySize?.height ?? 800;
      const hostRect = manualEditPanelHostRect(
        primary,
        manualEditHostScale,
        manualEditHostOffset,
        null,
      );
      const pinned = manualEditPanelPositionRef.current;
      const panelHeight = manualEditPanelCollapsedRef.current
        ? MANUAL_EDIT_PANEL_COLLAPSED_HEIGHT_PX
        : Math.min(380, Math.max(260, canvasHeight - 24));
      if (shouldRepositionFloatingPanelForSelection({
        pinned,
        target: hostRect,
        canvasWidth,
        canvasHeight,
        panelHeight,
      })) {
        setManualEditPanelPosition(null);
        manualEditPanelUserPinnedRef.current = false;
        manualEditPanelPaintPinnedIdRef.current = null;
      } else if (pinned) {
        manualEditPanelPaintPinnedIdRef.current = primary.id;
      }
    }
    setManualEditResizeDraftSize(null);
    setManualEditMoveDraftPos(null);
    setManualEditGroupDraftRects(null);
    manualEditResizeSessionActiveRef.current = false;
    manualEditResizePausedRef.current = false;

    const base = sourceRef.current ?? '';
    // One Document for snapshot + multi-select inspector merge.
    const parsedDoc = parseManualEditSource(base);
    clearManualEditTipRemountGeometryGraceIfNeeded(primary.id);
    selectedManualEditTargetIdRef.current = primary.id;
    selectedManualEditTargetRef.current = primary;
    selectedManualEditTargetIdsRef.current = nextIds;
    // Selection commit owns selected-set identity — avoid redundant reseed on
    // the next od-edit-targets broadcast (442 / same latch as tip-yield 440).
    manualEditSelectedIdentityFingerprintRef.current =
      manualEditTargetsIdentityFingerprint(nextTargets);
    setSelectedManualEditTargetIds(nextIds);
    setSelectedManualEditTarget(primary);
    setManualEditHostPaintRect(null);
    if (nextTargets.length === 1) {
      refreshManualEditHostPaintRect(primary.id);
      const snapshot = readManualEditTargetSnapshot(base, primary.id, {}, parsedDoc);
      setManualEditMixedStyleKeys(new Set());
      setManualEditDraft({
        text: snapshot.fields.text ?? primary.fields.text ?? primary.text,
        href: snapshot.fields.href ?? primary.fields.href ?? '',
        src: snapshot.fields.src ?? primary.fields.src ?? '',
        alt: snapshot.fields.alt ?? primary.fields.alt ?? '',
        styles: mergeManualEditInspectorStyles(snapshot.styles, primary.styles),
        attributesText: JSON.stringify(snapshot.attributes, null, 2),
        outerHtml: snapshot.outerHtml || primary.outerHtml,
        fullSource: base,
      });
    } else {
      const { styles: mergedStyles, mixedKeys } = mergeInspectorStylesForTargets(
        nextTargets,
        (id) => inspectorManualEditStyles(
          nextTargets.find((item) => item.id === id) ?? primary,
          base,
          parsedDoc,
        ),
      );
      setManualEditMixedStyleKeys(mixedKeys);
      const snapshot = readManualEditTargetSnapshot(base, primary.id, {}, parsedDoc);
      setManualEditDraft({
        text: snapshot.fields.text ?? primary.fields.text ?? primary.text,
        href: snapshot.fields.href ?? primary.fields.href ?? '',
        src: snapshot.fields.src ?? primary.fields.src ?? '',
        alt: snapshot.fields.alt ?? primary.fields.alt ?? '',
        styles: mergedStyles,
        attributesText: '{}',
        outerHtml: '',
        fullSource: base,
      });
    }
    setManualEditError(null);
    postSelectedManualEditTargetsToIframe(nextIds, primary.id);
  }

  async function clearManualEditTargetSelection(
    options?: { discardPendingStyles?: boolean },
  ): Promise<boolean> {
    if (options?.discardPendingStyles) {
      cancelManualEditStyleDraft();
    } else if (shouldFlushManualEditStylesOnSelectionBoundary(
      manualEditPendingStyleRef.current?.targetIds
        ?? (manualEditPendingStyleRef.current?.id
          ? [manualEditPendingStyleRef.current.id]
          : null),
      [],
    )) {
      if (!(await flushManualEditStyleSave({ force: true }))) return false;
    }
    // Clear tip-remount grace with selection clear (overlay residual).
    clearManualEditTipRemountGeometryGraceIfNeeded(null);
    selectedManualEditTargetIdRef.current = null;
    selectedManualEditTargetRef.current = null;
    selectedManualEditTargetIdsRef.current = [];
    manualEditSelectedIdentityFingerprintRef.current = '';
    setSelectedManualEditTargetIds([]);
    setSelectedManualEditTarget(null);
    setManualEditMixedStyleKeys(new Set());
    setManualEditPanelPosition(null);
    manualEditPanelUserPinnedRef.current = false;
    manualEditPanelPaintPinnedIdRef.current = null;
    setManualEditResizeDraftSize(null);
    setManualEditMoveDraftPos(null);
    setManualEditGroupDraftRects(null);
    setManualEditHostPaintRect(null);
    manualEditResizeSessionActiveRef.current = false;
    manualEditResizePausedRef.current = false;
    setManualEditDraft(emptyManualEditDraft(sourceRef.current ?? ''));
    setManualEditError(null);
    postSelectedManualEditTargetsToIframe([], null);
    return true;
  }

  // The inspector is scoped to one element (or the page). Closing it should
  // only collapse the panel and keep the user in edit mode — exiting edit is
  // the toolbar toggle's job. Dismiss flushes any in-flight tweak first so
  // nothing is lost; cancel reverts the in-flight unsaved tweak instead.
  async function dismissManualEditPanel() {
    const ok = await flushManualEditStyleSave({ force: true });
    if (!ok) return;
    if (selectedManualEditTarget) void clearManualEditTargetSelection();
    else setManualEditPageStylesOpen(false);
  }

  function cancelManualEditPanel() {
    if (selectedManualEditTarget) {
      void clearManualEditTargetSelection({ discardPendingStyles: true });
    } else {
      cancelManualEditStyleDraft();
      setManualEditPageStylesOpen(false);
    }
  }

  function activateManualEditPreviewHtml(html: string) {
    if (useUrlLoadPreview) return;
    const activated = buildSrcdoc(html, {
      deck: effectiveDeck,
      baseHref: srcDocBaseHref,
      initialSlideIndex: htmlPreviewSlideState.get(previewStateKey)?.active ?? 0,
      selectionBridge: true,
      editBridge: manualEditRequiresSrcDoc,
      paletteBridge: false,
      previewFocusGuard: true,
    });
    for (const win of slideMessageTargets()) {
      win.postMessage({ type: 'od:srcdoc-transport-activate', html: activated }, '*');
    }
    activatedSrcDocTransportHtmlRef.current = activated;
  }

  async function applyManualEdit(
    patch: ManualEditPatch,
    label: string,
    scope?: { slideIndex?: number },
    hint?: { id?: string; currentText?: string; htmlHint?: string; selector?: string },
    sharedParsedDoc?: Document | null,
  ): Promise<boolean> {
    if (manualEditSavingRef.current) return false;
    const baseSource = manualEditPatchBaseSource({
      manualEditMode,
      frozenSource: manualEditFrozenSource,
      liveSource: sourceRef.current,
    });
    if (baseSource == null) return false;
    if (revisionDiskSyncPromiseRef.current) {
      await revisionDiskSyncPromiseRef.current;
    }
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    setManualEditError(null);
    try {
      // Sanitize on the live Document before serialize — avoids a second
      // full-document DOMParser pass via sanitizeManualEditFullSource.
      // Capture target snapshot for set-style reconcile (skip a third parse).
      // Prefer flush-shared Document when style-diff already parsed the deck.
      const result = applyManualEditPatch(
        baseSource,
        patch,
        { ...scope, targetHint: hint },
        hint,
        {
          sanitize: isManualEditFullHtmlDocument(baseSource),
          captureTargetSnapshot: patch.kind === 'set-style',
          parsedDoc: sharedParsedDoc,
        },
      );
      if (!result.ok) {
        setManualEditError(
          result.error ?? embedUiLabel('Could not apply edit.', '편집을 적용하지 못했습니다.'),
        );
        return false;
      }
      // Do not pin `baseSource` before history confirm — that made
      // `manualEditHistoryConfirmTrustsLocal` always trust local and skip real
      // external-change detection. Pin only after a successful revision save.
      // Tip≠expected forces confirm even in edit mode (기획 50 tip advance).
      {
        const tipForConfirm = tipContentForManualEditSavePin(
          revisionStackRef.current,
          getActiveRevisionSequence(projectId, file.name),
          (revisionId) => getRevisionContentCache(projectId, file.name, revisionId),
        );
        const authoredForConfirm = manualEditPinnedSourceRef.current?.source
          ?? lastStablePreviewSourceRef.current
          ?? sourceRef.current;
        if (
          !shouldSkipManualEditHistoryConfirm(manualEditMode, {
            expectedSource: baseSource,
            tipContent: tipForConfirm,
            authoredSource: authoredForConfirm,
          })
          && !(await confirmManualEditHistorySource(
            baseSource,
            embedUiLabel(
              'The file changed outside manual edit mode. Refreshing before applying manual edits.',
              '수동 편집 모드 밖에서 파일이 변경되었습니다. 편집 적용 전에 새로고침합니다.',
            ),
          ))
        ) return false;
      }
      revisionSyncSuppressRef.current = true;
      // Do not echo `file.artifactManifest` on manual-edit pushes. Style/text
      // saves never update the sidecar, and a stale client manifest (empty
      // title, stripped exports) used to 400 the whole revision POST.
      const truncateAfter = truncateAfterSequenceForStack(revisionStackRef.current);
      const contentToSave = result.source;
      const saved = await pushProjectFileRevision(projectId, file.name, {
        content: contentToSave,
        source: 'manual_edit',
        label,
        truncateAfterSequence: truncateAfter,
      });
      if (!saved.ok) {
        const status = 'status' in saved ? saved.status : undefined;
        const code = 'code' in saved ? saved.code : undefined;
        const message = 'message' in saved ? saved.message : 'Unknown save error';
        if (status === 401) {
          notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
        }
        setManualEditError(
          isTeamverEmbedMode()
            ? formatProjectArtifactSaveFailedError(file.name, { status, code, message })
            : embedUiLabel(
                `Could not save the edited file${status ? ` (${status}${code ? ` ${code}` : ''})` : ''}: ${message}`,
                '편집한 파일을 저장하지 못했습니다.',
              ),
        );
        return false;
      }
      setSource(contentToSave);
      sourceRef.current = contentToSave;
      pinManualEditSavedSource(contentToSave);
      setInlinedSource(null);
      // Style-only saves update source/pin but leave the entry freeze alone so
      // postMessage live preview keeps working without a srcDoc remount.
      // Structural / text patches remount freeze + push updated srcDoc.
      capturePreviewScrollPosition();
      if (shouldUpdateManualEditFrozenSourceOnPatch(patch.kind)) {
        setManualEditFrozenSource(contentToSave);
        queueMicrotask(() => activateManualEditPreviewHtml(contentToSave));
      }
      commitRevisionStack(stackWithPushedRevision(
        revisionStackRef.current,
        saved.revision,
        truncateAfter,
      ));
      setRevisionContentCache(projectId, file.name, saved.revision.id, contentToSave);
      cacheParentRevisionOnPush(projectId, file.name, saved.revision.parentRevisionId, baseSource);
      revisionSkipReconcileOnceRef.current = true;
      setActiveRevisionSequence(projectId, file.name, saved.revision.sequence);
      emitRevisionPush(analytics.track, projectId, projectKind, file.name, saved.revision, 'manual_edit');
      setRevisionStackInvalidated(false);
      // Optimistic tip already matches the push — skip immediate list GET.
      // Deferred refresh catches retention/conflict shortly after (not only filesRefresh).
      warmRevisionListSoftCacheFromStack(
        projectId,
        file.name,
        revisionStackRef.current,
        saved.revision.sequence,
        revisionRetentionLimit,
      );
      scheduleDeferredRevisionStackRefresh();
      setManualEditDraft((current) => (
        current.fullSource === contentToSave ? current : { ...current, fullSource: contentToSave }
      ));
      if (patch.kind === 'set-text') {
        setSelectedManualEditTarget((current) => {
          if (current?.id !== patch.id) return current;
          const next = {
            ...current,
            text: patch.value,
            fields: { ...current.fields, text: patch.value },
          };
          selectedManualEditTargetRef.current = next;
          return next;
        });
        setManualEditTargets((current) => {
          const nextList = current.map((item) => (
            item.id === patch.id
              ? { ...item, text: patch.value, fields: { ...item.fields, text: patch.value } }
              : item
          ));
          manualEditTargetsIdentityFingerprintRef.current =
            manualEditTargetsIdentityFingerprint(nextList);
          const selectedIds = selectedManualEditTargetIdsRef.current;
          const selectedForFp = selectedIds.length > 0
            ? resolveManualEditTargetsByIds(selectedIds, nextList)
            : (selectedManualEditTargetRef.current ? [selectedManualEditTargetRef.current] : []);
          manualEditSelectedIdentityFingerprintRef.current =
            manualEditTargetsIdentityFingerprint(selectedForFp);
          return nextList;
        });
      } else if (patch.kind === 'remove-element') {
        const pendingIds = manualEditPendingStyleRef.current?.targetIds
          ?? (manualEditPendingStyleRef.current?.id
            ? [manualEditPendingStyleRef.current.id]
            : []);
        if (pendingIds.includes(patch.id)) {
          manualEditPendingStyleRef.current = null;
          clearManualEditStyleTimer();
        }
        const remainingIds = selectedManualEditTargetIdsRef.current.filter((id) => id !== patch.id);
        setManualEditTargets((current) => {
          const nextList = current.filter((target) => target.id !== patch.id);
          manualEditTargetsIdentityFingerprintRef.current =
            manualEditTargetsIdentityFingerprint(nextList);
          return nextList;
        });
        if (remainingIds.length === 0) {
          clearManualEditTipRemountGeometryGraceIfNeeded(null);
          selectedManualEditTargetIdRef.current = null;
          selectedManualEditTargetRef.current = null;
          selectedManualEditTargetIdsRef.current = [];
          manualEditSelectedIdentityFingerprintRef.current = '';
          setSelectedManualEditTargetIds([]);
          setSelectedManualEditTarget(null);
          setManualEditMixedStyleKeys(new Set());
          setManualEditDraft(emptyManualEditDraft(contentToSave));
          postSelectedManualEditTargetsToIframe([], null);
        } else {
          const refreshed = resolveManualEditTargetsByIds(
            remainingIds,
            manualEditTargets.filter((target) => target.id !== patch.id),
          );
          const nextIds = refreshed.map((item) => item.id);
          const primary = refreshed[refreshed.length - 1]!;
          clearManualEditTipRemountGeometryGraceIfNeeded(primary.id);
          selectedManualEditTargetIdRef.current = primary.id;
          selectedManualEditTargetRef.current = primary;
          selectedManualEditTargetIdsRef.current = nextIds;
          // Keep selected-set fingerprint aligned after membership shrink (442).
          manualEditSelectedIdentityFingerprintRef.current =
            manualEditTargetsIdentityFingerprint(refreshed);
          setSelectedManualEditTargetIds(nextIds);
          setSelectedManualEditTarget(primary);
          if (nextIds.length > 1) {
            // One Document for remaining multi-select inspector after remove.
            // Source-only reseed (same plan helper as batch flush / cancel).
            const remainingDoc = parseManualEditSource(contentToSave);
            const reseed = planManualEditMultiInspectorReseed({
              selectedIds: nextIds,
              readStyles: (id) => readManualEditStyles(contentToSave, id, {}, remainingDoc),
              concurrentPending: manualEditPendingStyleRef.current,
            });
            setManualEditMixedStyleKeys(reseed.mixedKeys);
            setManualEditDraft((current) => (
              reseed.styles
                ? { ...current, styles: reseed.styles, fullSource: contentToSave }
                : { ...current, fullSource: contentToSave }
            ));
          } else {
            // 2→1: seed inspector from the remaining target snapshot (not empty).
            const remainingDoc = parseManualEditSource(contentToSave);
            const snapshot = readManualEditTargetSnapshot(
              contentToSave,
              primary.id,
              {},
              remainingDoc,
            );
            setManualEditMixedStyleKeys(new Set());
            setManualEditDraft({
              text: snapshot.fields.text ?? primary.fields.text ?? primary.text,
              href: snapshot.fields.href ?? primary.fields.href ?? '',
              src: snapshot.fields.src ?? primary.fields.src ?? '',
              alt: snapshot.fields.alt ?? primary.fields.alt ?? '',
              styles: mergeManualEditInspectorStyles(snapshot.styles, primary.styles),
              attributesText: JSON.stringify(snapshot.attributes, null, 2),
              outerHtml: snapshot.outerHtml || primary.outerHtml,
              fullSource: contentToSave,
            });
          }
          postSelectedManualEditTargetsToIframe(nextIds, primary.id);
        }
      } else {
        setManualEditDraft((current) => ({ ...current, fullSource: contentToSave }));
      }
      if (patch.kind === 'set-style') {
        reconcileManualEditStyleSave(
          patch.id,
          patch.styles,
          contentToSave,
          result.targetSnapshot,
        );
      }
      setManualEditError(null);
      await onFileSaved?.();
      return true;
    } finally {
      revisionSyncSuppressRef.current = false;
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
    }
  }

  async function applyManualEditBatch(
    patches: ManualEditPatch[],
    label: string,
    sharedParsedDoc?: Document | null,
  ): Promise<boolean> {
    if (patches.length === 0) return true;
    if (patches.length === 1) {
      return applyManualEdit(patches[0]!, label, undefined, undefined, sharedParsedDoc);
    }
    if (manualEditSavingRef.current) return false;
    const baseSource = manualEditPatchBaseSource({
      manualEditMode,
      frozenSource: manualEditFrozenSource,
      liveSource: sourceRef.current,
    });
    if (baseSource == null) return false;
    if (revisionDiskSyncPromiseRef.current) {
      await revisionDiskSyncPromiseRef.current;
    }
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    setManualEditError(null);
    try {
      // One Document for all batch ops + per-id snapshots for reconcile
      // (was N× parse/serialize via sequential applyManualEditPatch).
      // Prefer flush-shared Document when style-diff already parsed the deck.
      const result = applyManualEditPatches(baseSource, patches, {
        sanitize: isManualEditFullHtmlDocument(baseSource),
        captureTargetSnapshots: true,
        parsedDoc: sharedParsedDoc,
      });
      if (!result.ok) {
        setManualEditError(
          result.error ?? embedUiLabel('Could not apply edit.', '편집을 적용하지 못했습니다.'),
        );
        return false;
      }
      // Tip≠expected forces confirm even in edit mode (기획 50 tip advance).
      {
        const tipForConfirm = tipContentForManualEditSavePin(
          revisionStackRef.current,
          getActiveRevisionSequence(projectId, file.name),
          (revisionId) => getRevisionContentCache(projectId, file.name, revisionId),
        );
        const authoredForConfirm = manualEditPinnedSourceRef.current?.source
          ?? lastStablePreviewSourceRef.current
          ?? sourceRef.current;
        if (
          !shouldSkipManualEditHistoryConfirm(manualEditMode, {
            expectedSource: baseSource,
            tipContent: tipForConfirm,
            authoredSource: authoredForConfirm,
          })
          && !(await confirmManualEditHistorySource(
            baseSource,
            embedUiLabel(
              'The file changed outside manual edit mode. Refreshing before applying manual edits.',
              '수동 편집 모드 밖에서 파일이 변경되었습니다. 편집 적용 전에 새로고침합니다.',
            ),
          ))
        ) return false;
      }
      revisionSyncSuppressRef.current = true;
      const truncateAfter = truncateAfterSequenceForStack(revisionStackRef.current);
      const saved = await pushProjectFileRevision(projectId, file.name, {
        content: result.source,
        source: 'manual_edit',
        label,
        truncateAfterSequence: truncateAfter,
      });
      if (!saved.ok) {
        const status = 'status' in saved ? saved.status : undefined;
        const code = 'code' in saved ? saved.code : undefined;
        const message = 'message' in saved ? saved.message : 'Unknown save error';
        if (status === 401) {
          notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
        }
        setManualEditError(
          isTeamverEmbedMode()
            ? formatProjectArtifactSaveFailedError(file.name, { status, code, message })
            : embedUiLabel(
                `Could not save the edited file${status ? ` (${status}${code ? ` ${code}` : ''})` : ''}: ${message}`,
                '편집한 파일을 저장하지 못했습니다.',
              ),
        );
        return false;
      }
      setSource(result.source);
      sourceRef.current = result.source;
      pinManualEditSavedSource(result.source);
      setInlinedSource(null);
      capturePreviewScrollPosition();
      commitRevisionStack(stackWithPushedRevision(
        revisionStackRef.current,
        saved.revision,
        truncateAfter,
      ));
      setRevisionContentCache(projectId, file.name, saved.revision.id, result.source);
      cacheParentRevisionOnPush(projectId, file.name, saved.revision.parentRevisionId, baseSource);
      revisionSkipReconcileOnceRef.current = true;
      setActiveRevisionSequence(projectId, file.name, saved.revision.sequence);
      emitRevisionPush(analytics.track, projectId, projectKind, file.name, saved.revision, 'manual_edit');
      setRevisionStackInvalidated(false);
      // Optimistic tip already matches the push — skip immediate list GET.
      // Deferred refresh catches retention/conflict shortly after (not only filesRefresh).
      warmRevisionListSoftCacheFromStack(
        projectId,
        file.name,
        revisionStackRef.current,
        saved.revision.sequence,
        revisionRetentionLimit,
      );
      scheduleDeferredRevisionStackRefresh();
      // Flush clears pending before await — a non-null pending here is newer
      // concurrent draft work and must not be wiped by this batch success.
      const concurrentPending = manualEditPendingStyleRef.current;
      for (const patch of patches) {
        if (patch.kind === 'set-style') {
          reconcileManualEditStyleSave(
            patch.id,
            patch.styles,
            result.source,
            result.targetSnapshots?.[patch.id],
          );
        }
      }
      // Multi-select: recompute mixedKeys from saved source (do not wipe all Mixed).
      // Source-only styles — stale target.styles must not resurrect cleared values.
      const selectedIdsAfterBatch = selectedManualEditTargetIdsRef.current;
      if (selectedIdsAfterBatch.length > 1) {
        const batchDoc = parseManualEditSource(result.source);
        const reseed = planManualEditMultiInspectorReseed({
          selectedIds: selectedIdsAfterBatch,
          readStyles: (id) => readManualEditStyles(result.source, id, {}, batchDoc),
          concurrentPending,
        });
        setManualEditMixedStyleKeys(reseed.mixedKeys);
        setManualEditDraft((current) => (
          reseed.styles
            ? { ...current, styles: reseed.styles, fullSource: result.source }
            : (current.fullSource === result.source
              ? current
              : { ...current, fullSource: result.source })
        ));
      } else if (!concurrentPending) {
        setManualEditMixedStyleKeys(new Set());
        setManualEditDraft((current) => (
          current.fullSource === result.source ? current : { ...current, fullSource: result.source }
        ));
      } else {
        setManualEditDraft((current) => (
          current.fullSource === result.source ? current : { ...current, fullSource: result.source }
        ));
      }
      setManualEditError(null);
      await onFileSaved?.();
      return true;
    } finally {
      revisionSyncSuppressRef.current = false;
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
    }
  }

  async function confirmManualEditHistorySource(expectedSource: string, message: string): Promise<boolean> {
    const authored = manualEditPinnedSourceRef.current?.source
      ?? lastStablePreviewSourceRef.current
      ?? sourceRef.current;
    const now = Date.now();
    // Tip + pin/authored gates share one tipContent (no false "external change"
    // after tip yield when expected already matches tip — 기획 50).
    const tipContent = tipContentForManualEditSavePin(
      revisionStackRef.current,
      getActiveRevisionSequence(projectId, file.name),
      (revisionId) => getRevisionContentCache(projectId, file.name, revisionId),
    );
    // Skip disk GET when pin/authored already match the save payload.
    // Tip≠expected forces GET (parity with trustsLocal tip yield gate).
    if (manualEditHistoryConfirmCanSkipDiskFetch(
      expectedSource,
      manualEditPinnedSourceRef.current,
      now,
      authored,
      tipContent,
    )) {
      return true;
    }
    const persisted = await fetchProjectFileText(projectId, file.name, {
      cache: 'no-store',
      cacheBustKey: Date.now(),
    });
    if (manualEditHistoryConfirmTrustsLocal(
      expectedSource,
      persisted,
      manualEditPinnedSourceRef.current,
      now,
      authored,
      tipContent,
    )) {
      return true;
    }
    // Tip/external refresh — adopt disk into source + freeze together so edit
    // mode does not keep painting a stale freeze after confirm refuses.
    const refreshed = persisted!;
    setSource(refreshed);
    sourceRef.current = refreshed;
    lastStablePreviewSourceRef.current = refreshed;
    exportHtmlSnapshotGateRef.current = refreshed;
    rememberStablePreviewSource(projectId, file.name, refreshed);
    // Drop stale warm tip cache A so authoritative tip resolve cannot overwrite
    // adopted disk B (cache A would win getRevisionContentCache before snapshot).
    {
      const tipRevision = resolveManualEditSavePinTipRevision(
        revisionStackRef.current,
        getActiveRevisionSequence(projectId, file.name),
      );
      if (tipRevision) {
        const cachedTip = getRevisionContentCache(projectId, file.name, tipRevision.id);
        if (shouldClearTipContentCacheAfterConfirmRefuse(cachedTip, refreshed)) {
          clearRevisionContentCacheEntry(projectId, file.name, tipRevision.id);
        }
      }
    }
    // Suppress disk tip prefer until refresh commits (warm stack tip≠ race).
    manualEditSuppressTipPreferUntilRefreshRef.current = nextTipPreferSuppressState(
      'confirm-refuse',
    );
    if (shouldSyncManualEditFrozenSourceToPainted(
      manualEditMode,
      manualEditFrozenSourceRef.current,
      refreshed,
    )) {
      setManualEditFrozenSource(refreshed);
      scheduleManualEditSelectionEchoAfterFreezeSync();
    }
    if (
      manualEditPinnedSourceRef.current
      && manualEditPinnedSourceRef.current.source !== refreshed
    ) {
      manualEditPinnedSourceRef.current = null;
    }
    setInlinedSource(null);
    // Keep warm stack until refreshRevisionStack lands — empty wipe + warm
    // activeSeq makes tipContentForManualEditSavePin miss (activeSeq→null,
    // no HEAD fallback) so concurrent live/disk tip resolve races mid-flight.
    manualEditPendingStyleRef.current = null;
    setManualEditDraft((current) => ({ ...current, fullSource: refreshed }));
    setManualEditError(message);
    void refreshRevisionStack();
    return false;
  }

  async function awaitRevisionDiskSync(): Promise<void> {
    if (revisionDiskSyncPromiseRef.current) {
      await revisionDiskSyncPromiseRef.current;
    }
  }

  function applyRestoredSourceToViewer(sourceToApply: string, target: FileRevision): void {
    revisionSkipReconcileOnceRef.current = true;
    const contentUnchanged = sourceRef.current === sourceToApply;
    if (!contentUnchanged) {
      setSource(sourceToApply);
      sourceRef.current = sourceToApply;
    }
    pinManualEditSavedSource(sourceToApply);
    setInlinedSource(null);
    if (!contentUnchanged || manualEditFrozenSourceRef.current !== sourceToApply) {
      setManualEditFrozenSource(sourceToApply);
    }
    // SSOT before stack commit so a concurrent refresh cannot fall back to tip.
    setActiveRevisionSequence(projectId, file.name, target.sequence);
    commitRevisionStack(stackWithCursor(revisionStackRef.current, target.id));
    // Undo demotes activeSeq — warm soft-cache for the restored tip.
    warmRevisionListSoftCacheFromStack(
      projectId,
      file.name,
      revisionStackRef.current,
      target.sequence,
      revisionRetentionLimit,
    );
    setManualEditDraft((current) => (
      current.fullSource === sourceToApply ? current : { ...current, fullSource: sourceToApply }
    ));
    if (!contentUnchanged) {
      if (!useUrlLoadPreview) {
        // srcdoc (edit or preview) updates via setSource / freeze activate.
        if (manualEditMode) {
          capturePreviewScrollPosition();
          queueMicrotask(() => activateManualEditPreviewHtml(sourceToApply));
        }
      } else {
        setReloadKey((k) => k + 1);
      }
    }
    setRevisionStackInvalidated(false);
    const before = revisionBeforeCursor(revisionStackRef.current);
    const after = revisionAfterCursor(revisionStackRef.current);
    prefetchRevisionContents(
      projectId,
      file.name,
      [before, after]
        .filter((revision): revision is FileRevision => Boolean(revision))
        .map((revision) => ({ revisionId: revision.id, byteSize: revision.byteSize })),
      (revisionId) => resolveRevisionSnapshotContent(revisionId),
    );
  }

  async function syncRevisionToDisk(
    target: FileRevision,
    options?: { quiet?: boolean },
  ): Promise<boolean> {
    const restored = await restoreProjectFileRevision(projectId, file.name, target.id);
    if (!restored.ok) {
      if (restored.status === 401) {
        notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
      }
      if (!options?.quiet) {
        setManualEditError(
          isTeamverEmbedMode()
            ? formatProjectArtifactSaveFailedError(file.name, {
                status: restored.status,
                code: restored.code,
                message: restored.message,
              })
            : embedUiLabel('Could not restore this revision.', '이 버전으로 복원하지 못했습니다.'),
        );
      }
      return false;
    }
    return true;
  }

  async function retryPendingRevisionDiskSync(): Promise<void> {
    const target = revisionDiskSyncFailedTargetRef.current;
    if (!target) return;
    setRevisionDiskSyncToast(null);
    const ok = await syncRevisionWithRetry(() => syncRevisionToDisk(target, { quiet: true }));
    if (ok) {
      revisionDiskSyncFailedTargetRef.current = null;
      await onFileSaved?.();
      await refreshRevisionStack();
      return;
    }
    setRevisionDiskSyncToast(revisionDiskSyncMessageRef.current);
  }

  async function scheduleBackgroundRevisionDiskSync(target: FileRevision): Promise<void> {
    revisionDiskSyncFailedTargetRef.current = null;
    setRevisionDiskSyncToast(null);
    const syncPromise = (async () => {
      const ok = await syncRevisionWithRetry(() => syncRevisionToDisk(target, { quiet: true }));
      if (ok) {
        revisionDiskSyncFailedTargetRef.current = null;
        setRevisionDiskSyncToast(null);
        await onFileSaved?.();
      } else {
        revisionDiskSyncFailedTargetRef.current = target;
        setRevisionDiskSyncToast(revisionDiskSyncMessageRef.current);
      }
      return ok;
    })();
    revisionDiskSyncPromiseRef.current = syncPromise;
    void syncPromise.finally(() => {
      if (revisionDiskSyncPromiseRef.current === syncPromise) {
        revisionDiskSyncPromiseRef.current = null;
      }
    });
  }

  async function applyRestoredRevision(target: FileRevision): Promise<boolean> {
    revisionSyncSuppressRef.current = true;
    try {
      await awaitRevisionDiskSync();

      let sourceToApply = getRevisionContentCache(projectId, file.name, target.id);
      if (!canApplyRevisionFromClientCache(sourceToApply)) {
        const fetched = await resolveRevisionSnapshotContent(target.id);
        if (fetched != null) {
          setRevisionContentCache(projectId, file.name, target.id, fetched);
          sourceToApply = fetched;
        }
      }

      if (canApplyRevisionFromClientCache(sourceToApply)) {
        applyRestoredSourceToViewer(sourceToApply, target);
        void scheduleBackgroundRevisionDiskSync(target);
        return true;
      }

      const restored = await restoreProjectFileRevision(projectId, file.name, target.id);
      if (!restored.ok) {
        if (restored.status === 401) {
          notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
        }
        setManualEditError(
          isTeamverEmbedMode()
            ? formatProjectArtifactSaveFailedError(file.name, {
                status: restored.status,
                code: restored.code,
                message: restored.message,
              })
            : embedUiLabel('Could not restore this revision.', '이 버전으로 복원하지 못했습니다.'),
        );
        return false;
      }
      const diskSource = await fetchProjectFileText(projectId, file.name, {
        cache: 'no-store',
        cacheBustKey: Date.now(),
      });
      if (diskSource == null) {
        setManualEditError(embedUiLabel('Could not load the restored file.', '복원한 파일을 불러오지 못했습니다.'));
        return false;
      }
      setRevisionContentCache(projectId, file.name, target.id, diskSource);
      applyRestoredSourceToViewer(diskSource, target);
      await onFileSaved?.();
      return true;
    } finally {
      revisionSyncSuppressRef.current = false;
    }
  }

  async function undoManualEdit(area: TrackingRevisionArea = 'revision_toolbar') {
    if (revisionStackInvalidatedRef.current) return;
    if (!(await settleManualEditStyleBoundary())) return;
    if (manualEditSavingRef.current) return;
    const target = revisionBeforeCursor(revisionStackRef.current);
    if (!target) return;
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    try {
      const ok = await applyRestoredRevision(target);
      if (ok) {
        emitRevisionUndo(analytics.track, projectId, projectKind, file.name, target, area);
      }
    } finally {
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
    }
  }

  async function redoManualEdit(area: TrackingRevisionArea = 'revision_toolbar') {
    if (revisionStackInvalidatedRef.current) return;
    if (!(await settleManualEditStyleBoundary())) return;
    if (manualEditSavingRef.current) return;
    const target = revisionAfterCursor(revisionStackRef.current);
    if (!target) return;
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    try {
      const ok = await applyRestoredRevision(target);
      if (ok) {
        emitRevisionRedo(analytics.track, projectId, projectKind, file.name, target, area);
      }
    } finally {
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
    }
  }

  async function restoreRevisionFromHistory(target: FileRevision) {
    if (manualEditSavingRef.current) return;
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    try {
      const ok = await applyRestoredRevision(target);
      if (ok) {
        emitRevisionRestore(analytics.track, projectId, projectKind, file.name, target);
      }
    } finally {
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
    }
  }

  // Inspect-mode picker: same `od:comment-target` payload, different sink.
  // The bridge tags the message with a computed-style snapshot so the panel
  // can show real starting values for color / typography / spacing / radius.
  useEffect(() => {
    if (!inspectMode) return;
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      const data = ev.data as
        | {
            type?: string;
            elementId?: string;
            selector?: string;
            label?: string;
            text?: string;
            style?: InspectStyleSnapshot;
            clickedDescendant?: Partial<InspectClickedDescendant>;
          }
        | null;
      if (!data || data.type !== 'od:comment-target') return;
      if (!data.elementId || !data.selector) return;
      const clickedDescendant =
        data.clickedDescendant && typeof data.clickedDescendant === 'object'
          ? {
              label: String(data.clickedDescendant.label || ''),
              text: String(data.clickedDescendant.text || ''),
            }
          : null;
      setActiveInspectTarget({
        elementId: String(data.elementId),
        selector: String(data.selector),
        label: String(data.label || ''),
        text: String(data.text || ''),
        style: data.style && typeof data.style === 'object' ? data.style : {},
        ...(clickedDescendant ? { clickedDescendant } : {}),
      });
      setInspectError(null);
      setInspectSavedAt(null);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [inspectMode, isOurPreviewIframeSource]);

  function slideMessageTargets(): Window[] {
    const targets: Window[] = [];
    const add = (win: Window | null | undefined) => {
      if (!win || targets.includes(win)) return;
      targets.push(win);
    };
    add(iframeRef.current?.contentWindow);
    add(srcDocPreviewIframeRef.current?.contentWindow);
    add(urlPreviewIframeRef.current?.contentWindow);
    // Present-in-tab opens a separate fullscreen overlay iframe. Host ←/→ must
    // advance that visible frame, not only the hidden preview behind it —
    // otherwise keys look broken until the user exits presentation.
    add(presentIframeRef.current?.contentWindow);
    return targets;
  }

  function postSlide(action: 'next' | 'prev' | 'first' | 'last') {
    for (const win of slideMessageTargets()) {
      win.postMessage({ type: 'od:slide', action }, '*');
    }
  }

  function syncCachedSlideStateToIframe(target: HTMLIFrameElement | null = iframeRef.current) {
    const active = htmlPreviewSlideState.get(previewStateKey)?.active;
    const win = target?.contentWindow;
    if (!win || typeof active !== 'number') return;
    win.postMessage({ type: 'od:slide', action: 'go', index: active }, '*');
  }

  function requestSlideStateFromIframe(target: HTMLIFrameElement | null = iframeRef.current) {
    const win = target?.contentWindow;
    if (!win || !effectiveDeck) return;
    win.postMessage({ type: 'od:slide-state-request' }, '*');
  }

  function deckSlideIndexSource() {
    return {
      slideStateActive: slideState?.active,
      cachedSlideActive: htmlPreviewSlideState.get(previewStateKey)?.active,
    };
  }

  function enrichSnapshotWithDeckSlideIndex(snapshot: PreviewCommentSnapshot): PreviewCommentSnapshot {
    if (!effectiveDeck) return snapshot;
    return withResolvedDeckSlideIndex(snapshot, deckSlideIndexSource());
  }

  function postInspectSet(elementId: string, selector: string, prop: string, value: string) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: 'od:inspect-set', elementId, selector, prop, value },
      '*',
    );
  }

  function postInspectReset(elementId?: string) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:inspect-reset', elementId }, '*');
  }

  // Replay the host's authoritative override map into the freshly loaded
  // iframe. The bridge inside the iframe only sees rules persisted in the
  // artifact source via its own hydrateOverridesFromDom() — any unsaved
  // edit lives on the host side until Save-to-source. Without this replay,
  // toggling Inspect off/on, switching to Comment mode, or any other
  // srcdoc rebuild reloads the iframe from previewSource without the
  // unsaved style block, so the preview drops the live edits while
  // saveInspectToSource() can still persist them later from the stale
  // host map. The bridge re-validates each entry under its own allow-list,
  // so a parent that posted a hostile replay can only land overrides the
  // bridge would also have accepted via od:inspect-set.
  //
  // The render-time hydration above keeps `inspectOverrides` aligned with
  // the current `source` whenever React commits, but the iframe `onLoad`
  // callback fires from a separate event-loop turn after the new srcDoc
  // is parsed; if it ever races a stale closure (e.g. an interleaved
  // remount), reading React state would post the previous file's map over
  // the bridge's DOM-hydrated one and silently strip the persisted styles
  // from preview. Re-derive synchronously from `source` whenever the
  // hydration ref disagrees so onLoad never sends a stale snapshot.
  function replayInspectOverridesToIframe(target: HTMLIFrameElement | null = iframeRef.current) {
    const win = target?.contentWindow;
    if (!win) return;
    const overrides = inspectHydratedSourceRef.current === source
      ? inspectOverrides
      : (typeof source === 'string' ? parseInspectOverridesFromSource(source) : {});
    win.postMessage({ type: 'od:inspect-replay', overrides }, '*');
  }

  // Persist accumulated inspect overrides into the artifact source: replace
  // (or insert) a single <style data-od-inspect-overrides> block in <head>.
  // The CSS body is serialized from the host's own override map, hydrated
  // from source on load and updated only by host-driven onApply / reset
  // callbacks. We deliberately do NOT round-trip through the iframe at save
  // time: artifact JS rendered inside the preview shares the same
  // contentWindow as the bridge and could forge an od:inspect-overrides
  // reply that flips allow-listed properties on elements the user never
  // touched. POSTing to /api/projects/:id/files upserts the file via
  // writeProjectFile (multipart-or-JSON; we use JSON).
  async function saveInspectToSource() {
    if (!source) return;
    setSavingInspect(true);
    setInspectError(null);
    revisionSyncSuppressRef.current = true;
    try {
      const css = serializeInspectOverrides(inspectOverrides).trim();
      const next = applyInspectOverridesToSource(source, css);
      // No-op save — skip push / paint / reloadKey churn.
      if (next === source || next === sourceRef.current) {
        setInspectSavedAt(Date.now());
        return;
      }
      const truncateAfter = truncateAfterSequenceForStack(revisionStackRef.current);
      const saved = await pushProjectFileRevision(projectId, file.name, {
        content: next,
        source: 'inspect',
        label: embedUiLabel('Style adjustments', '스타일 조정'),
        // Inspect tweaks are content-only — avoid stale-manifest 400s.
        truncateAfterSequence: truncateAfter,
      });
      if (!saved.ok) {
        const status = 'status' in saved ? saved.status : undefined;
        const code = 'code' in saved ? saved.code : undefined;
        const message = 'message' in saved ? saved.message : 'Unknown save error';
        if (status === 401) {
          notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
        }
        throw new Error(
          isTeamverEmbedMode()
            ? formatProjectArtifactSaveFailedError(file.name, { status, code, message })
            : (message || `Save failed${status ? ` (${status})` : ''}`),
        );
      }
      setSource(next);
      sourceRef.current = next;
      pinManualEditSavedSource(next);
      commitRevisionStack(stackWithPushedRevision(
        revisionStackRef.current,
        saved.revision,
        truncateAfter,
      ));
      setRevisionContentCache(projectId, file.name, saved.revision.id, next);
      cacheParentRevisionOnPush(projectId, file.name, saved.revision.parentRevisionId, source);
      revisionSkipReconcileOnceRef.current = true;
      setActiveRevisionSequence(projectId, file.name, saved.revision.sequence);
      emitRevisionPush(analytics.track, projectId, projectKind, file.name, saved.revision, 'inspect_save');
      setRevisionStackInvalidated(false);
      // Optimistic tip already matches the push — skip immediate list GET.
      // Deferred refresh catches retention/conflict shortly after (not only filesRefresh).
      warmRevisionListSoftCacheFromStack(
        projectId,
        file.name,
        revisionStackRef.current,
        saved.revision.sequence,
        revisionRetentionLimit,
      );
      scheduleDeferredRevisionStackRefresh();
      setInspectSavedAt(Date.now());
      // srcdoc path updates via setSource; URL-load still needs reloadKey bust.
      if (useUrlLoadPreview) {
        setReloadKey((k) => k + 1);
      }
    } catch (err) {
      const msg = isTeamverEmbedMode()
        ? '소스에 저장하지 못했습니다.'
        : (err instanceof Error ? err.message : 'Save failed');
      setInspectError(msg);
      console.error('[inspect] saveToSource failed:', err);
    } finally {
      revisionSyncSuppressRef.current = false;
      setSavingInspect(false);
    }
  }

  // Keyboard nav on the host, so the user can press ←/→ even when focus
  // is on the chat composer or any other host control. Skip while manual
  // edit owns the canvas — iframe text editing must keep arrow keys for
  // the caret (and host-side slide posts would steal them if focus leaks).
  useEffect(() => {
    if (!effectiveDeck || mode !== 'preview' || manualEditMode) return;
    function onKey(e: KeyboardEvent) {
      if (isManualEditKeyboardTextTarget(e.target)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        postSlide('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        postSlide('prev');
      } else if (e.key === 'Home') {
        e.preventDefault();
        postSlide('first');
      } else if (e.key === 'End') {
        e.preventDefault();
        postSlide('last');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [effectiveDeck, manualEditMode, mode]);

  // Revision undo/redo shortcuts (design §8.2): ⌘Z / Ctrl+Z, redo via Shift+Z or Ctrl+Y.
  useEffect(() => {
    if (mode !== 'preview' || source === null) return;
    if (hideFileRevisionChrome) return;
    function onKey(e: KeyboardEvent) {
      if (drawOverlayOpen) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (manualEditSavingRef.current) return;
      if (revisionStackInvalidatedRef.current) return;

      const primary = isMacPlatform()
        ? e.metaKey && !e.ctrlKey
        : e.ctrlKey && !e.metaKey;
      if (!primary) return;

      const key = e.key.toLowerCase();
      if (key === 'z') {
        if (e.shiftKey) {
          if (!canRedoRevisionStack(revisionStackRef.current)) return;
          e.preventDefault();
          void redoManualEdit('keyboard');
        } else {
          if (!canUndoRevisionStack(revisionStackRef.current)) return;
          e.preventDefault();
          void undoManualEdit('keyboard');
        }
        return;
      }
      if (!isMacPlatform() && key === 'y') {
        if (!canRedoRevisionStack(revisionStackRef.current)) return;
        e.preventDefault();
        void redoManualEdit('keyboard');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, source, drawOverlayOpen, hideFileRevisionChrome]);

  // Layer z-order: `]` / `[` step, ⌘/Ctrl+`]` / `[` front/back (single anchored target).
  useEffect(() => {
    if (!manualEditMode || drawOverlayOpen) return;
    function onKey(e: KeyboardEvent) {
      const action = resolveZOrderKeyboardAction(e);
      if (!action) return;
      if (manualEditSavingRef.current) return;
      const targets = resolveManualEditZOrderTargets();
      if (targets.length === 0) return;
      const doc = iframeContentDocumentIfAccessible(iframeRef.current);
      const reorderOptions = {
        deck: effectiveDeck,
        activeSlideIndex: slideState?.active ?? null,
      };
      const capabilities = mergeZOrderCapabilities(
        targets
          .map((target) => resolveZOrderContextWithFallback(
            doc,
            manualEditTargets,
            target.id,
            reorderOptions,
          )?.capabilities)
          .filter((cap): cap is NonNullable<typeof cap> => Boolean(cap)),
      );
      if (!capabilities?.[action]) return;
      e.preventDefault();
      manualEditZOrderHandlerRef.current?.(action);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manualEditMode, drawOverlayOpen]);

  // Delete / Backspace removes the selected manual-edit target.
  useEffect(() => {
    if (!manualEditMode || drawOverlayOpen) return;
    function onKey(e: KeyboardEvent) {
      if (!resolveManualEditDeleteKeyboardAction(e)) return;
      if (manualEditSavingRef.current) return;
      if (manualEditInlineTextEditing) return;
      if (manualEditResizeSessionActiveRef.current) return;
      if (selectedManualEditTargetIdsRef.current.length !== 1) return;
      e.preventDefault();
      manualEditDeleteHandlerRef.current?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manualEditMode, drawOverlayOpen, manualEditInlineTextEditing]);

  useEffect(() => {
    if (!presentMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.present-wrap')) return;
      setPresentMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [presentMenuOpen]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!zoomMenuRef.current) return;
      if (!zoomMenuRef.current.contains(e.target as Node)) setZoomMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [zoomMenuOpen]);

  useEffect(() => {
    if (!agentToolsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.artifact-tool-menu-anchor')) return;
      closeArtifactToolMenus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeArtifactToolMenus();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [agentToolsOpen]);

  useEffect(() => {
    if (!deployMenuOpen && !downloadMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!shareRef.current) return;
      if (shareRef.current.contains(e.target as Node)) return;
      setDeployMenuOpen(false);
      setDownloadMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDeployMenuOpen(false);
      setDownloadMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [deployMenuOpen, downloadMenuOpen]);

  useEffect(() => {
    if (!inTabPresent) return;
    const bodyStyle = document.body.style;
    const previousChromeHeight = bodyStyle.getPropertyValue('--workspace-tabs-chrome-height');
    const updateChromeHeight = () => {
      const chrome = document.querySelector<HTMLElement>('.workspace-tabs-chrome.app-chrome-header');
      const height = chrome?.getBoundingClientRect().height ?? 0;
      if (height > 0) {
        bodyStyle.setProperty('--workspace-tabs-chrome-height', `${Math.round(height)}px`);
      } else {
        bodyStyle.removeProperty('--workspace-tabs-chrome-height');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInTabPresent(false);
    };
    updateChromeHeight();
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', updateChromeHeight);
    const chrome = document.querySelector<HTMLElement>('.workspace-tabs-chrome.app-chrome-header');
    const observer = chrome && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateChromeHeight) : null;
    if (observer && chrome) observer.observe(chrome);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updateChromeHeight);
      observer?.disconnect();
      if (previousChromeHeight) {
        bodyStyle.setProperty('--workspace-tabs-chrome-height', previousChromeHeight);
      } else {
        bodyStyle.removeProperty('--workspace-tabs-chrome-height');
      }
    };
  }, [inTabPresent]);

  function openInNewTab() {
    if (!source) return;
    openSandboxedPreviewInNewTab(source, exportTitle, {
      deck: effectiveDeck,
      baseHref: srcDocBaseHref,
      initialSlideIndex: htmlPreviewSlideState.get(previewStateKey)?.active ?? 0,
    });
  }

  // Snapshot this project as a reusable template. The daemon snapshots
  // EVERY html/text/code file in the project (not just the file open in
  // the viewer), so the template captures the whole design, not a single
  // page. Surfaced here in the Download menu because templates are saved
  // from the same artifact output surface as files.
  function openSaveAsTemplateModal() {
    setDownloadMenuOpen(false);
    const defaultName =
      file.name.replace(/\.html?$/i, '') || t('fileViewer.templateNameDefault');
    setTemplateName(defaultName);
    setTemplateDescription('');
    setTemplateSaveError(null);
    setTemplateModalOpen(true);
  }

  async function handleSaveAsTemplate() {
    const name = templateName.trim();
    if (!name) return;
    setSavingTemplate(true);
    setTemplateNote(null);
    setTemplateSaveError(null);
    let savedName: string | null = null;
    try {
      const tpl = await saveTemplate({
        name,
        description: templateDescription.trim() || undefined,
        sourceProjectId: projectId,
      });
      if (!tpl) {
        setTemplateSaveError(t('fileViewer.savedTemplateFail'));
        return;
      }
      savedName = tpl.name;
      setTemplateModalOpen(false);
      setTemplateName('');
      setTemplateDescription('');
      setTemplateNote(t('fileViewer.savedTemplate', { name: tpl.name }));
      // Show success toast
      setTemplateSavedToast(t('fileViewer.savedTemplate', { name: tpl.name }));
    } finally {
      setSavingTemplate(false);
      if (savedName) {
        // Auto-clear the note so the menu doesn't keep stale state next open.
        setTimeout(() => setTemplateNote(null), 4000);
      }
    }
  }

  async function openDeployModal(nextProviderId: WebDeployProviderId = deployProviderId) {
    setDeployMenuOpen(false);
    setDeployModalOpen(true);
    setDeployError(null);
    setDeployActionToast(null);
    setCopiedDeployLink(null);
    setDeployPhase('idle');
    await loadDeployProvider(nextProviderId, { fallbackToExisting: true });
  }

  async function openSocialShareFlow() {
    const providerWithDeployment = DEPLOY_PROVIDER_OPTIONS.find(
      (option) => deploymentsByProvider[option.id]?.url?.trim(),
    )?.id;
    await openDeployModal(providerWithDeployment ?? deployProviderId);
  }

  async function changeDeployProvider(nextProviderId: WebDeployProviderId) {
    if (nextProviderId === deployProviderId) return;
    setDeployError(null);
    setDeployPhase('idle');
    await loadDeployProvider(nextProviderId);
  }

  async function saveDeployConfig() {
    setSavingDeployConfig(true);
    setDeployError(null);
    setDeployActionToast(null);
    try {
      if (deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID) {
        if (!deployToken.trim()) {
          setDeployActionToast(t('fileViewer.cloudflareApiTokenRequired'));
          deployTokenInputRef.current?.focus();
          return null;
        }
        if (!cloudflareAccountId.trim()) {
          throw new Error(t('fileViewer.cloudflareAccountIdRequired'));
        }
      }
      const config = await updateDeployConfig(buildDeployConfigRequest(deployProviderId));
      if (!config || config.providerId !== deployProviderId) {
        throw new Error(t('fileViewer.deployProviderConfigSaveFailed', { provider: deployProviderLabel }));
      }
      syncDeployFormFromConfig(deployProviderId, config);
      if (deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID) {
        await loadCloudflareZones(config);
      }
      return config;
    } catch (err) {
      setDeployError(formatProjectDeployErrorForUser(
        err,
        t('fileViewer.deployProviderConfigSaveFailed', { provider: deployProviderLabel }),
      ));
      return null;
    } finally {
      setSavingDeployConfig(false);
    }
  }

  function buildCloudflarePagesDeploySelection(): WebCloudflarePagesDeploySelection | undefined {
    if (deployProviderId !== CLOUDFLARE_PAGES_PROVIDER_ID) return undefined;
    const prefix = normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix);
    if (!prefix) return undefined;
    if (!isValidCloudflareDomainPrefixInput(prefix)) {
      throw new Error(t('fileViewer.cloudflareDomainPrefixInvalid'));
    }
    const zone = cloudflareZones.find((item) => item.id === cloudflareZoneId);
    if (!zone) {
      throw new Error(t('fileViewer.cloudflareZoneRequired'));
    }
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      domainPrefix: prefix,
    };
  }

  async function deployToSelectedProvider() {
    setDeploying(true);
    setDeployPhase('deploying');
    setDeployError(null);
    setDeployActionToast(null);
    setCopiedDeployLink(null);
    try {
      const cloudflarePagesSelection = buildCloudflarePagesDeploySelection();
      const typedToken = deployToken.trim();
      const hasNewToken = typedToken && typedToken !== deployConfig?.tokenMask;
      const cloudflareHints = cloudflareConfigHintsFromForm();
      const cloudflareHintsChanged = deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID && Boolean(
        cloudflareHints?.lastZoneId !== deployConfig?.cloudflarePages?.lastZoneId ||
        cloudflareHints?.lastZoneName !== deployConfig?.cloudflarePages?.lastZoneName ||
        cloudflareHints?.lastDomainPrefix !== deployConfig?.cloudflarePages?.lastDomainPrefix,
      );
      const needsConfigSave =
        hasNewToken ||
        teamId.trim() !== (deployConfig?.teamId || '') ||
        teamSlug.trim() !== (deployConfig?.teamSlug || '') ||
        cloudflareAccountId.trim() !== (deployConfig?.accountId || '') ||
        cloudflareHintsChanged ||
        !deployConfig?.configured;
      if (needsConfigSave) {
        const nextConfig = await saveDeployConfig();
        if (!nextConfig) return;
        if (!nextConfig?.configured) {
          const option = getDeployProviderOption(deployProviderId);
          throw new Error(t(option.tokenRequiredKey, { provider: t(option.labelKey) }));
        }
      }
      setDeployPhase('preparing-link');
      const next = await deployProjectFile(projectId, file.name, deployProviderId, cloudflarePagesSelection);
      setDeploymentsByProvider((current) => ({
        ...current,
        [next.providerId]: next,
      }));
      setDeployment(next);
      setDeployResult(next);
      if (deployResultState(next.status) !== 'failed') {
        setDeploySavedToast({
          message: t('fileViewer.deploySuccessToast'),
          details: t('fileViewer.deploySuccessToastDetails', {
            provider: deployProviderLabel,
            url: next.url,
          }),
        });
      }
    } catch (err) {
      const option = getDeployProviderOption(deployProviderId);
      const fallback = err instanceof Error
        ? err.message
        : t('fileViewer.deployProviderFailed', { provider: t(option.labelKey) });
      const message = formatProjectDeployErrorForUser(err, fallback);
      if (message === t(option.tokenRequiredKey, { provider: t(option.labelKey) })) {
        setDeployActionToast(message);
        deployTokenInputRef.current?.focus();
      } else {
        setDeployError(message);
      }
    } finally {
      setDeploying(false);
      setDeployPhase('idle');
    }
  }

  async function retryDeploymentLink() {
    const current = deployResult || deployment;
    if (!current?.id) return;
    setDeployError(null);
    setDeployPhase('preparing-link');
    try {
      const next = await checkDeploymentLink(projectId, current.id);
      setDeploymentsByProvider((items) => ({
        ...items,
        [next.providerId]: next,
      }));
      setDeployment(next);
      setDeployResult(next);
    } catch (err) {
      setDeployError(formatProjectDeployErrorForUser(err, t('fileViewer.deployFailed')));
    } finally {
      setDeployPhase('idle');
    }
  }

  async function copyDeployLink(url: string) {
    const safeUrl = url.trim();
    if (!safeUrl) return;
    try {
      await navigator.clipboard.writeText(safeUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = safeUrl;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedDeployLink(safeUrl);
    window.setTimeout(() => {
      setCopiedDeployLink((current) => (current === safeUrl ? null : current));
    }, 1800);
  }

  async function copyShareLink(url: string) {
    const safeUrl = url.trim();
    if (!safeUrl) {
      setShareLinkFeedback('failed');
      setExportToast({ message: t('useEverywhere.copyFailed'), tone: 'error' });
      return false;
    }
    const ok = await copyToClipboard(safeUrl);
    const feedback = ok ? 'copied' : 'failed';
    setShareLinkFeedback(feedback);
    if (!ok) setExportToast({ message: t('useEverywhere.copyFailed'), tone: 'error' });
    window.setTimeout(() => {
      setShareLinkFeedback((current) => (current === feedback ? null : current));
    }, 1800);
    return ok;
  }

  function presentInThisTab() {
    setPresentMenuOpen(false);
    setMode('preview');
    setInTabPresent(true);
  }

  function presentFullscreen() {
    setPresentMenuOpen(false);
    const el = previewBodyRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => setInTabPresent(true));
    } else {
      setInTabPresent(true);
    }
  }

  function presentNewTab() {
    setPresentMenuOpen(false);
    openInNewTab();
  }

  function reloadHtmlPreview() {
    fireArtifactToolbarClick('reload');
    capturePreviewScrollPosition();
    imageExportSnapshotDataUrlRef.current = null;
    setInlinedSource(null);
    // Explicit refresh must remint Teamver preview scope — a dead/null prefix
    // leaves srcDoc held empty forever, and reloadKey alone cannot recover.
    if (isTeamverEmbedMode()) {
      invalidateTeamverProjectPreviewPrefix(projectId);
      setEmbedAuthRecoveryNonce((value) => value + 1);
    }
    setReloadKey((key) => key + 1);
    if (!useUrlLoadPreview) {
      activatedSrcDocTransportHtmlRef.current = null;
      setSrcDocShellReady(false);
      setSrcDocTransportResetKey((key) => key + 1);
    }
  }

  function selectMode(nextMode: 'preview' | 'source') {
    if (nextMode === 'source') setDrawOverlayOpen(false);
    setMode(nextMode);
  }

  function activateBoard(nextTool?: BoardTool) {
    setMode('preview');
    setBoardMode(true);
    if (nextTool) setBoardTool(nextTool);
  }

  function activateBoardPicker(nextTool: BoardTool) {
    clearBoardComposer();
    fireArtifactToolbarClick(nextTool === 'pod' ? 'pods' : 'comment');
    setCommentPanelOpen(false);
    setCommentCreateMode(false);
    activateBoard(nextTool);
    setAgentToolsOpen(false);
  }

  function clearBoardComposer() {
    setActiveCommentTarget(null);
    setHoveredCommentTarget(null);
    setHoveredPodMemberId(null);
    setActivePreviewCommentId(null);
    setCommentDraft('');
    setQueuedBoardNotes([]);
    setBoardImages([]);
    setActiveCommentExistingAttachments([]);
    setBoardPreviewIndex(null);
    setStrokePoints([]);
  }

  function addBoardImages(files: File[]) {
    const imgs = files.filter((file) => file.type.startsWith('image/'));
    if (imgs.length > 0) setBoardImages((current) => [...current, ...imgs]);
  }

  function removeBoardImage(index: number) {
    setBoardImages((current) => current.filter((_, i) => i !== index));
    setBoardPreviewIndex(null);
  }

  function closeArtifactToolMenus() {
    setAgentToolsOpen(false);
  }

  function activateDrawTool() {
    fireArtifactToolbarClick('draw');
    const next = !drawOverlayOpen;
    if (!next) {
      setDrawOverlayOpen(false);
      setAgentToolsOpen(false);
      return;
    }
    capturePreviewScrollPosition();
    const activateDraw = () => {
      setCommentPanelOpen(false);
      setCommentCreateMode(false);
      setBoardMode(false);
      clearBoardComposer();
      setInspectMode(false);
      setMode('preview');
      setDrawOverlayOpen(true);
      closeArtifactToolMenus();
    };
    if (manualEditMode) {
      void exitManualEditModeAfterFlush().then((ok) => {
        if (ok) activateDraw();
      });
      return;
    }
    activateDraw();
  }

  function activateCommentTool() {
    fireArtifactToolbarClick('comment');
    capturePreviewScrollPosition();
    if (boardMode && !commentCreateMode && boardTool === 'inspect') {
      setBoardMode(false);
      setCommentCreateMode(false);
      clearBoardComposer();
      setAgentToolsOpen(false);
      return;
    }
    const activateComment = () => {
      setCommentPanelOpen(false);
      setCommentCreateMode(false);
      clearBoardComposer();
      setInspectMode(false);
      setDrawOverlayOpen(false);
      setMode('preview');
      activateBoard('inspect');
      closeArtifactToolMenus();
    };
    if (manualEditMode) {
      void exitManualEditModeAfterFlush().then((ok) => {
        if (ok) activateComment();
      });
      return;
    }
    activateComment();
  }

  function activateCommentCreateTool() {
    fireArtifactToolbarClick('comment');
    capturePreviewScrollPosition();
    if (boardMode && commentCreateMode) {
      setBoardMode(false);
      setCommentCreateMode(false);
      setCommentPanelOpen(false);
      clearBoardComposer();
      closeArtifactToolMenus();
      return;
    }
    const activateCommentCreate = () => {
      setCommentPanelOpen(true);
      setCommentSidePanelCollapsed(false);
      setCommentCreateMode(true);
      if (!activeCommentTarget) clearBoardComposer();
      setInspectMode(false);
      setDrawOverlayOpen(false);
      setMode('preview');
      activateBoard('inspect');
      closeArtifactToolMenus();
    };
    if (manualEditMode) {
      void exitManualEditModeAfterFlush().then((ok) => {
        if (ok) activateCommentCreate();
      });
      return;
    }
    activateCommentCreate();
  }

  function activateManualEditTool() {
    fireArtifactToolbarClick('edit');
    capturePreviewScrollPosition();
    if (!manualEditMode) {
      setCommentPanelOpen(false);
      setCommentCreateMode(false);
      setBoardMode(false);
      clearBoardComposer();
      setInspectMode(false);
      setDrawOverlayOpen(false);
      setMode('preview');
      setManualEditViewportWidth(previewBodyRef.current?.clientWidth ?? null);
      setManualEditSrcDocActive(true);
      setManualEditMode(true);
      closeArtifactToolMenus();
      return;
    }
    closeArtifactToolMenus();
    void exitManualEditModeAfterFlush();
  }

  function queueCurrentDraft() {
    const note = commentDraft.trim();
    if (!note) return;
    setQueuedBoardNotes((current) => [...current, note]);
    setCommentDraft('');
  }

  function currentActiveComposerComment(): PreviewComment | null {
    if (!activePreviewCommentId) return null;
    return previewComments.find((comment) => (
      comment.id === activePreviewCommentId &&
      comment.filePath === file.name &&
      comment.status === 'open'
    )) ?? null;
  }

  function currentActiveComposerAttachments(): PreviewCommentAttachment[] {
    return currentActiveComposerComment()?.attachments ?? activeCommentExistingAttachments;
  }

  function withDeckSlideIndex(target: PreviewCommentTarget): PreviewCommentTarget {
    if (!effectiveDeck) return target;
    return withResolvedDeckSlideIndex(target, deckSlideIndexSource());
  }

  function withCurrentDeckSlideIndexAttachment(attachment: ChatCommentAttachment): ChatCommentAttachment {
    if (!effectiveDeck) return attachment;
    return withResolvedDeckSlideIndex(attachment, deckSlideIndexSource());
  }

  function withCurrentDeckSlideIndexAttachments(
    attachments: ChatCommentAttachment[],
  ): ChatCommentAttachment[] {
    if (!effectiveDeck) return attachments;
    return attachments.map(withCurrentDeckSlideIndexAttachment);
  }

  async function applyManualEditCommentFastPathAttachments(
    attachments: ChatCommentAttachment[],
  ): Promise<{ appliedIds: Set<string>; remaining: ChatCommentAttachment[] }> {
    // Comment edits are handled by the model via element-patch / deck-patch.
    // Client-side regex fast paths were removed — they could not cover arbitrary
    // natural-language requests and duplicated the model contract poorly.
    return { appliedIds: new Set(), remaining: attachments };
  }

  async function sendBoardBatch() {
    if (!activeCommentTarget || !onSendBoardCommentAttachments) return;
    const nextNotes = [...queuedBoardNotes];
    if (commentDraft.trim()) nextNotes.push(commentDraft.trim());
    if (nextNotes.length === 0 && boardImages.length === 0) {
      const existingComment = currentActiveComposerComment();
      if (existingComment) {
        setSendingBoardBatch(true);
        try {
          const attachments = withCurrentDeckSlideIndexAttachments(commentsToAttachments([existingComment]));
          const fastPath = await applyManualEditCommentFastPathAttachments(attachments);
          if (fastPath.remaining.length > 0) {
            await onSendBoardCommentAttachments(fastPath.remaining);
          }
          clearBoardComposer();
        } catch (err) {
          setCommentErrorToast(err instanceof Error ? err.message : t('chat.annotationUploadFailed'));
        } finally {
          setSendingBoardBatch(false);
        }
      }
      return;
    }
    setSendingBoardBatch(true);
    try {
      const existingAttachments = currentActiveComposerAttachments();
      const attachments = withCurrentDeckSlideIndexAttachments(buildBoardCommentAttachments({
        target: withDeckSlideIndex(targetFromSnapshot(activeCommentTarget)),
        notes: nextNotes,
        includeImageOnly: boardImages.length > 0,
        imageAttachmentCount: boardImages.length,
      }).map((attachment) => (
        existingAttachments.length > 0
          ? { ...attachment, imageAttachments: existingAttachments }
          : attachment
      )));
      let attachmentsToSend = attachments;
      let fastPathApplied = false;
      if (boardImages.length === 0) {
        const fastPath = await applyManualEditCommentFastPathAttachments(attachments);
        attachmentsToSend = fastPath.remaining;
        fastPathApplied = fastPath.appliedIds.size > 0;
      }
      const accepted = attachmentsToSend.length > 0 || boardImages.length > 0
        ? await onSendBoardCommentAttachments(attachmentsToSend, boardImages)
        : fastPathApplied;
      if (accepted === false) return;
      clearBoardComposer();
    } catch (err) {
      setCommentErrorToast(err instanceof Error ? err.message : t('chat.annotationUploadFailed'));
    } finally {
      setSendingBoardBatch(false);
    }
  }

  async function savePersistentComment() {
    if (!activeCommentTarget || !onSavePreviewComment) return;
    // Allow saving when there is text OR an attached image (image-only notes).
    if (!commentDraft.trim() && boardImages.length === 0 && currentActiveComposerAttachments().length === 0) return;
    const isFreePin = activeCommentTarget.elementId.startsWith('pin-');
    setSendingBoardBatch(true);
    try {
      const target = withDeckSlideIndex(targetFromSnapshot(activeCommentTarget));
      const saved = await onSavePreviewComment(
        target,
        commentDraft.trim(),
        false,
        boardImages,
      );
      if (saved) {
        rememberSavedPreviewCommentOrder(saved.id);
        clearBoardComposer();
        setActiveCommentExistingAttachments(saved.attachments ?? []);
        setBoardMode(true);
        setCommentCreateMode(true);
        setCommentPanelOpen(true);
        setCommentSidePanelCollapsed(false);
        setActivePreviewCommentId(saved.id);
        setCommentSavedToast(isFreePin ? t('chat.comments.pinSavedToast') : t('chat.comments.savedToast'));
      }
    } catch (err) {
      setCommentErrorToast(err instanceof Error ? err.message : t('chat.annotationUploadFailed'));
    } finally {
      setSendingBoardBatch(false);
    }
  }

  async function savePanelComment(note: string) {
    if (!onSavePreviewComment) return false;
    const cleanNote = note.trim();
    if (!cleanNote) return false;
    const idSeed = Date.now().toString(36);
    const target: PreviewCommentTarget = activeCommentTarget
      ? withDeckSlideIndex(targetFromSnapshot(activeCommentTarget))
      : {
          filePath: file.name,
          elementId: `file-comment-${idSeed}-${Math.floor(Math.random() * 1e6).toString(36)}`,
          selector: 'html',
          label: file.name,
          text: '',
          position: { x: 0, y: 0, width: 0, height: 0 },
          htmlHint: '',
          selectionKind: 'element',
        };
    setSendingBoardBatch(true);
    try {
      const saved = await onSavePreviewComment(target, cleanNote, false);
      if (saved) {
        rememberSavedPreviewCommentOrder(saved.id);
        setCommentSavedToast(t('chat.comments.savedToast'));
        if (activeCommentTarget) clearBoardComposer();
      }
      return Boolean(saved);
    } catch (err) {
      setCommentErrorToast(err instanceof Error ? err.message : t('chat.annotationUploadFailed'));
      return false;
    } finally {
      setSendingBoardBatch(false);
    }
  }

  const showPresent = source !== null;
  const exportTitle = resolveExportDownloadTitle(projectDisplayName, file.name);
  const artifactKind = file.artifactManifest?.kind ?? file.artifactKind ?? null;
  const rendererId = file.artifactManifest?.renderer ?? null;
  const isDeckArtifact = isDeck || artifactKind === 'deck' || rendererId === 'deck-html' || file.kind === 'presentation';
  const isMarkdownArtifact =
    artifactKind === 'markdown-document' ||
    rendererId === 'markdown' ||
    file.kind === 'text' && /\.mdx?$/i.test(file.name);
  const isShareableArtifact =
    file.kind === 'html' ||
    isDeckArtifact ||
    artifactKind === 'html' ||
    rendererId === 'html';
  const canShare = source !== null && isShareableArtifact;
  const canDownload = source !== null && (isShareableArtifact || isMarkdownArtifact);
  const canPptx = canShare && effectiveDeck && !streaming;
  const showPptxExport =
    canShare &&
    effectiveDeck &&
    isTeamverPptxExportEnabled({ embed: isTeamverEmbedMode() });
  const showMarkdownExport = source !== null && isMarkdownArtifact;
  const showImageExport = canShare && !isTeamverEmbedMode();
  const showExternalShareMenu = canShare && !hideExternalShareSurfaces;

  useEffect(() => {
    const nudgeKey = `${projectId}\n${file.name}`;
    if (!canShare || exportReadyNudgeSeenRef.current.has(nudgeKey)) return;
    exportReadyNudgeSeenRef.current.add(nudgeKey);
    if (hasSeenExportReadyNudge(projectId, file.name)) return;
    markExportReadyNudgeSeen(projectId, file.name);
    setExportReadyNudge(true);
    const timeout = window.setTimeout(() => setExportReadyNudge(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [canShare, file.name, projectId]);

  // Chat-side "Share" next-step action: in Teamver embed, Drive publish lives
  // in the Download / Export popover, so post-run share requests open that
  // surface and focus the destination picker instead of auto-publishing.
  // The artifact source may still be loading when the request lands (the file
  // was just auto-opened), so we defer until `canShare` flips true and only
  // consume each nonce once.
  const consumedShareNonceRef = useRef<number | null>(null);
  const [drivePublishFocusNonce, setDrivePublishFocusNonce] = useState<number | null>(null);
  const [drivePublishModalOpen, setDrivePublishModalOpen] = useState(false);
  const [drivePublishInitialFormat, setDrivePublishInitialFormat] = useState<DrivePublishFormat | null>(null);
  const openDrivePublishModal = useCallback((format?: DrivePublishFormat) => {
    setDrivePublishInitialFormat(format ?? null);
    setDrivePublishModalOpen(true);
  }, []);
  useEffect(() => {
    const nonce = shareRequest?.nonce;
    if (nonce == null) return;
    if (consumedShareNonceRef.current === nonce) return;
    if (!canShare) return;
    consumedShareNonceRef.current = nonce;
    setExportReadyNudge(false);
    markExportReadyNudgeSeen(projectId, file.name);
    setDeployMenuOpen(false);
    setDownloadMenuOpen(false);
    setDrivePublishInitialFormat(null);
    setDrivePublishModalOpen(true);
    setDrivePublishFocusNonce(nonce);
  }, [shareRequest?.nonce, canShare, projectId, file.name]);

  // Parallel to shareRequest, but opens the Download / Export menu instead — the
  // assistant "next step" card's Download row routes here so it surfaces the same
  // PDF / image / zip / standalone-HTML / template options the toolbar exposes.
  const consumedDownloadNonceRef = useRef<number | null>(null);
  useEffect(() => {
    const nonce = downloadRequest?.nonce;
    if (nonce == null) return;
    if (consumedDownloadNonceRef.current === nonce) return;
    if (!canShare) return;
    consumedDownloadNonceRef.current = nonce;
    setExportReadyNudge(false);
    markExportReadyNudgeSeen(projectId, file.name);
    setDeployMenuOpen(false);
    setDownloadMenuOpen(true);
  }, [downloadRequest?.nonce, canShare, projectId, file.name]);

  // A queued chat send for this deck just started: flip the preview to the
  // slide its marked element lives on. We write the cached slide state first so
  // a freshly-mounted iframe (the tab may have just been activated) restores to
  // the target on load via syncCachedSlideStateToIframe(), then post directly
  // to cover the already-loaded iframe. The consume-once guard lives in
  // `shouldConsumeSlideNav` (keyed by file outside this component) so it holds
  // across remounts — switching away from and back to the deck must not replay
  // the stale request and yank the preview off wherever the user navigated.
  useEffect(() => {
    const nonce = slideNavRequest?.nonce;
    if (nonce == null) return;
    if (!effectiveDeck) return;
    const requested = slideNavRequest?.slideIndex;
    if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 0) return;
    if (!shouldConsumeSlideNav(previewStateKey, nonce)) return;
    const target = Math.floor(requested);
    const cachedCount = htmlPreviewSlideState.get(previewStateKey)?.count;
    const count = slideState?.count ?? cachedCount ?? target + 1;
    setSlideStateCached(previewStateKey, { active: target, count });
    setSlideState({ active: target, count });
    syncCachedSlideStateToIframe();
  }, [slideNavRequest?.nonce, slideNavRequest?.slideIndex, effectiveDeck, previewStateKey, slideState?.count]);

  const openDownloadMenu = () => {
    fireArtifactHeaderClick('download_dropdown');
    setExportReadyNudge(false);
    markExportReadyNudgeSeen(projectId, file.name);
    setDeployMenuOpen(false);
    setDownloadMenuOpen((v) => !v);
  };
  const openDeployMenu = () => {
    fireArtifactHeaderClick('share_dropdown');
    setExportReadyNudge(false);
    markExportReadyNudgeSeen(projectId, file.name);
    setDownloadMenuOpen(false);
    setDeployMenuOpen((v) => !v);
  };
  const ensureDeckSlideSyncedForSnapshot = useCallback(async (iframe: HTMLIFrameElement | null) => {
    if (!effectiveDeck || !iframe) return;
    syncCachedSlideStateToIframe(iframe);
    await waitForAnimationFrame();
    await waitForAnimationFrame();
  }, [effectiveDeck, previewStateKey]);

  const captureExportImageSnapshot = useCallback(async () => {
    // The host compositor grabs on-screen pixels, so any transient hover chrome
    // over the preview leaks into the capture. The screenshot control's own
    // tooltip is already dismissed by TooltipLayer's pointerdown/click listener,
    // but that setState(null) has not repainted yet when capture starts. Wait
    // two frames so the dismissal commits first — mirrors the double-rAF guard
    // in the browser screenshot flow (DesignBrowserPanel).
    await waitForAnimationFrame();
    await waitForAnimationFrame();
    try {
    const srcDocIframe = srcDocPreviewIframeRef.current;
    const urlIframe = iframeRef.current ?? urlPreviewIframeRef.current;
    const visibleIframe = iframeRef.current ?? srcDocIframe;
    await ensureDeckSlideSyncedForSnapshot(visibleIframe);
    // Host compositor capture uses on-screen iframe pixels and does not need
    // the hidden srcDoc snapshot bridge. Attempt it before waiting on
    // drawCaptureReady so PreviewDrawOverlay's marks-only fast fallback does
    // not burn its budget on bridge readiness alone.
    // Worst-case timing is mirrored in `annotationCaptureBudget.ts`
    // (ANNOTATION_SLIDE_CONTEXT_CAPTURE_BUDGET_MS).
    const hostSnapshot = await captureHostIframeSnapshot(visibleIframe);
    if (hostSnapshot) return hostSnapshot;

    if (drawOverlayOpen && !drawCaptureReadyRef.current) {
      const deadline = Date.now() + DRAW_CAPTURE_READY_DEADLINE_MS;
      while (!drawCaptureReadyRef.current && Date.now() < deadline) {
        await waitForAnimationFrame();
      }
    }

    // Prefer the srcDoc transport iframe: it always carries the snapshot bridge
    // and (when draw mode is active) the full artifact HTML. URL-load frames
    // often lack the bridge and fail capture on web embeds.
    if (srcDocIframe?.contentWindow) {
      if (useLazySrcDocTransport && !srcDocShellReady) {
        await waitForIframeLoadOrTimeout(srcDocIframe, ANNOTATION_LAZY_SHELL_WAIT_MS);
      }
      if (useLazySrcDocTransport && activateSrcDocSnapshotTransport(srcDocIframe)) {
        await waitForIframeLoadOrTimeout(srcDocIframe);
        await waitForAnimationFrame();
        await waitForAnimationFrame();
      }
      const restoreVisibility = temporarilyExposeIframeForSnapshot(srcDocIframe);
      try {
        await ensureDeckSlideSyncedForSnapshot(srcDocIframe);
        await waitForAnimationFrame();
        const srcDocSnapshot = await requestPreviewSnapshotWithRetry(
          srcDocIframe,
          ANNOTATION_SNAPSHOT_BRIDGE_RETRY_MS,
        );
        if (srcDocSnapshot) return srcDocSnapshot;
      } finally {
        restoreVisibility();
      }
    }

    if (!useUrlLoadPreview) {
      const activeIframe = srcDocIframe ?? iframeRef.current;
      if (!activeIframe) return null;
      await ensureDeckSlideSyncedForSnapshot(activeIframe);
      await waitForIframeLoadOrTimeout(activeIframe, 250);
      await waitForAnimationFrame();
      return requestPreviewSnapshotWithRetry(activeIframe);
    }

    if (urlIframe) {
      await ensureDeckSlideSyncedForSnapshot(urlIframe);
      await waitForIframeLoadOrTimeout(urlIframe, 250);
      await waitForAnimationFrame();
      const urlSnapshot = await requestPreviewSnapshotWithRetry(urlIframe);
      if (urlSnapshot) return urlSnapshot;
    }

    if (!srcDocIframe) {
      const activeIframe = iframeRef.current;
      if (!activeIframe) return null;
      await ensureDeckSlideSyncedForSnapshot(activeIframe);
      return requestPreviewSnapshotWithRetry(activeIframe);
    }

    if (useUrlLoadPreview && activateSrcDocSnapshotTransport(srcDocIframe)) {
      await waitForIframeLoadOrTimeout(srcDocIframe, 500);
      await waitForAnimationFrame();
      await waitForAnimationFrame();
      return requestPreviewSnapshotWithRetry(srcDocIframe);
    }
    return null;
    } finally {
      if (effectiveDeck) resetDeckPreviewPan(resolveActiveDeckPreviewIframe());
    }
  }, [
    activateSrcDocSnapshotTransport,
    drawOverlayOpen,
    effectiveDeck,
    ensureDeckSlideSyncedForSnapshot,
    resolveActiveDeckPreviewIframe,
    srcDocShellReady,
    useLazySrcDocTransport,
    useUrlLoadPreview,
  ]);

  // TEMP: toolbar screenshot UI is commented out — keep handler for re-enable.
  // const handleCopyScreenshot = useCallback(async () => {
  //   if (screenshotInFlightRef.current) return;
  //   screenshotInFlightRef.current = true;
  //   setExportToast({ message: t('fileViewer.screenshotCopying'), tone: 'loading' });
  //   try {
  //     const snap = await captureExportImageSnapshot();
  //     if (!snap) {
  //       setExportToast({ message: t('fileViewer.screenshotPreviewLoading'), tone: 'error' });
  //       return;
  //     }
  //     const result = await copyImageDataUrlToClipboard(snap.dataUrl);
  //     setExportToast(
  //       result === 'copied'
  //         ? { message: t('fileViewer.screenshotCopied'), tone: 'success' }
  //         : {
  //             message: t(
  //               result === 'denied'
  //                 ? 'fileViewer.screenshotClipboardDenied'
  //                 : 'fileViewer.screenshotCaptureFailed',
  //             ),
  //             tone: 'error',
  //           },
  //     );
  //   } catch (err) {
  //     console.warn('[handleCopyScreenshot] failed:', err);
  //     setExportToast({ message: t('fileViewer.screenshotCaptureFailed'), tone: 'error' });
  //   } finally {
  //     screenshotInFlightRef.current = false;
  //   }
  // }, [captureExportImageSnapshot, t]);

  const prepareImageExportBlob = useCallback(async (format: ImageExportFormat) => {
    const prepareId = imageExportPrepareIdRef.current + 1;
    imageExportPrepareIdRef.current = prepareId;
    setImageExportPreparing(true);
    setImageExportError(null);
    setImageExportPreparedBlob(null);
    const slideIndex = effectiveDeck ? slideState?.active : undefined;
    if (effectiveDeck && imageExportSlideRef.current !== (slideIndex ?? null)) {
      imageExportSnapshotDataUrlRef.current = null;
      imageExportSlideRef.current = slideIndex ?? null;
    }
    // Captured when the daemon-side export fails so we can append it to the
    // user-facing error. Teamver embed requires daemon-rendered image exports;
    // standalone OD can still fall back to the in-iframe snapshot bridge.
    let serverFailureReason: string | null = null;
    try {
      const exportViewport = !effectiveDeck && previewViewport !== 'desktop'
        ? PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === previewViewport)
        : null;
      const serverImage = await exportProjectImageBlob({
        deck: effectiveDeck,
        filePath: file.name,
        format,
        // Prefer live source; if a post-write refresh briefly cleared it,
        // fall back to the last accepted preview HTML so export/download
        // does not fail until the user hard-refreshes.
        htmlSnapshot: livePreviewSource ?? source ?? lastStablePreviewSourceRef.current ?? null,
        projectId,
        slideIndex: effectiveDeck ? slideState?.active : undefined,
        title: exportTitle,
        ...(exportViewport?.width != null ? { width: exportViewport.width } : {}),
        ...(exportViewport?.height != null ? { height: exportViewport.height } : {}),
      });
      if (serverImage.ok && serverImage.blob.size > 0) {
        imageExportSnapshotDataUrlRef.current = null;
        if (imageExportPrepareIdRef.current === prepareId) {
          setImageExportPreparedBlob({ format, blob: serverImage.blob });
        }
        return;
      }
      if (!serverImage.ok) {
        serverFailureReason = serverImage.reason;
        if (isTeamverEmbedMode()) {
          throw new Error(serverFailureReason);
        }
      }
      let dataUrl = imageExportSnapshotDataUrlRef.current;
      if (!dataUrl) {
        const snap = await captureExportImageSnapshot();
        if (!snap) throw new Error('Snapshot capture returned null');
        dataUrl = snap.dataUrl;
        imageExportSnapshotDataUrlRef.current = dataUrl;
      }
      const blob = await imageDataUrlToBlob(dataUrl, format);
      if (blob.size <= 0) throw new Error('Snapshot capture produced an empty image');
      if (imageExportPrepareIdRef.current === prepareId) {
        setImageExportPreparedBlob({ format, blob });
      }
    } catch (err) {
      devLog.warn('[exportAsImage] failed to prepare snapshot:', err);
      if (imageExportPrepareIdRef.current === prepareId) {
        const baseMessage = t('fileViewer.exportImageFailed');
        const detail = serverFailureReason || (err instanceof Error ? err.message : null);
        setImageExportError(formatProjectImageExportErrorForUser(detail, baseMessage));
      }
    } finally {
      if (imageExportPrepareIdRef.current === prepareId) {
        setImageExportPreparing(false);
      }
    }
  }, [captureExportImageSnapshot, effectiveDeck, exportTitle, file.name, livePreviewSource, previewViewport, projectId, slideState?.active, source, t]);

  const openImageExportModal = async () => {
    flushSync(() => {
      setDownloadMenuOpen(false);
    });
    setImageExportError(null);
    setImageExportPreparedBlob(null);
    imageExportSnapshotDataUrlRef.current = null;
    imageExportSlideRef.current = effectiveDeck ? slideState?.active ?? null : null;
    await waitForAnimationFrame();
    await waitForAnimationFrame();
    setImageExportModalOpen(true);
    void prepareImageExportBlob(imageExportFormat);
  };

  const changeImageExportFormat = (format: ImageExportFormat) => {
    setImageExportFormat(format);
    void prepareImageExportBlob(format);
  };

  // Re-capture when the user flips slides while the export modal stays open.
  useEffect(() => {
    if (!imageExportModalOpen || !effectiveDeck) return;
    const slideIndex = slideState?.active ?? null;
    if (imageExportSlideRef.current === slideIndex) return;
    imageExportSlideRef.current = slideIndex;
    imageExportSnapshotDataUrlRef.current = null;
    void prepareImageExportBlob(imageExportFormat);
  }, [
    effectiveDeck,
    imageExportFormat,
    imageExportModalOpen,
    prepareImageExportBlob,
    slideState?.active,
  ]);

  async function handleImageExportSave() {
    const prepared = imageExportPreparedBlob;
    if (!prepared || prepared.format !== imageExportFormat) {
      setImageExportError(t('fileViewer.exportImageFailed'));
      return;
    }
    setImageExportBusy(true);
    setImageExportError(null);
    try {
      const target = await prepareImageExportTarget(exportTitle, imageExportFormat, { useNativePicker: false });
      if (!target) return;
      const preparedDataUrl = imageExportSnapshotDataUrlRef.current;
      if (target.method === 'download' && imageExportFormat === 'png' && preparedDataUrl) {
        downloadImageDataUrl(preparedDataUrl, target.filename);
      } else {
        await target.save(prepared.blob);
      }
      imageExportPrepareIdRef.current += 1;
      setImageExportModalOpen(false);
      setImageExportSavedToast({
        message: target.method === 'picker'
          ? t('fileViewer.exportImageSaved')
          : t('fileViewer.exportImageDownloadStarted'),
        details: target.method === 'picker'
          ? target.filename
          : t('fileViewer.exportImageDownloadDetails', { filename: target.filename }),
      });
    } catch (err) {
      devLog.warn('[exportAsImage] failed to save snapshot:', err);
      setImageExportError(t('fileViewer.exportImageFailed'));
    } finally {
      setImageExportBusy(false);
    }
  }
  const creationSortedSideComments = useMemo(
    () => previewComments
      .filter((comment) => comment.filePath === file.name && comment.status === 'open')
      .sort((a, b) => commentCreatedAt(a) - commentCreatedAt(b)),
    [file.name, previewComments],
  );
  useEffect(() => {
    const creationIds = creationSortedSideComments.map((comment) => comment.id);
    setCommentOrderIds((current) => {
      const visible = new Set(creationIds);
      const kept = current.filter((id) => visible.has(id));
      const added = creationIds.filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      return next.join('\0') === current.join('\0') ? current : next;
    });
  }, [creationSortedSideComments]);
  const visibleSideComments = useMemo(() => {
    if (commentOrderIds.length === 0) return creationSortedSideComments;
    const byId = new Map(creationSortedSideComments.map((comment) => [comment.id, comment]));
    const ordered = commentOrderIds
      .map((id) => byId.get(id))
      .filter((comment): comment is PreviewComment => Boolean(comment));
    const orderedIds = new Set(ordered.map((comment) => comment.id));
    const missing = creationSortedSideComments.filter((comment) => !orderedIds.has(comment.id));
    return [...ordered, ...missing];
  }, [creationSortedSideComments, commentOrderIds]);
  function rememberSavedPreviewCommentOrder(savedId: string) {
    setCommentOrderIds((current) =>
      appendSavedPreviewCommentOrder(current, visibleSideComments, savedId),
    );
  }
  const activeSideCommentId = activePreviewCommentId;
  const activeCommentTargetVisible = commentTargetIntersectsPreview(
    activeCommentTarget,
    overlayPreviewScale,
    { x: overlayPreviewTransform.offsetX, y: overlayPreviewTransform.offsetY },
    previewBodySize,
  );
  useEffect(() => {
    if (!boardMode || !activePreviewCommentId) return;
    const stillOpen = visibleSideComments.some((comment) => comment.id === activePreviewCommentId);
    if (!stillOpen) clearBoardComposer();
  }, [activePreviewCommentId, boardMode, visibleSideComments]);
  useEffect(() => {
    if (!effectiveDeck || slideState == null || !boardMode) return;
    if (!activePreviewCommentId) return;
    const activeComment = visibleSideComments.find((comment) => comment.id === activePreviewCommentId);
    if (activeComment && !commentVisibleOnDeckSlide(activeComment, slideState.active)) {
      clearBoardComposer();
    }
  }, [activePreviewCommentId, boardMode, effectiveDeck, slideState?.active, visibleSideComments]);
  const activeDeployment = deployResult || deployment;
  const activeDeployedUrl = activeDeployment?.url?.trim() || '';
  const activeDeploymentDelayed = activeDeployment?.status === 'link-delayed';
  const activeDeploymentProtected = activeDeployment?.status === 'protected';
  const activeCloudflarePages = activeDeployment?.providerId === CLOUDFLARE_PAGES_PROVIDER_ID
    ? activeDeployment.cloudflarePages
    : undefined;
  const activeCloudflareCustomDomain = activeCloudflarePages?.customDomain;
  const deployProvider = getDeployProviderOption(deployProviderId);
  const deployProviderLabel = t(deployProvider.labelKey);
  const selectedCloudflareZone = cloudflareZones.find((zone) => zone.id === cloudflareZoneId) ?? null;
  const normalizedCloudflarePrefix = normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix);
  const cloudflareHostnamePreview =
    selectedCloudflareZone && normalizedCloudflarePrefix
      ? `${normalizedCloudflarePrefix}.${selectedCloudflareZone.name}`
      : '';
  const deployResultCards: DeployResultCard[] = activeCloudflarePages
    ? (() => {
        const cards: DeployResultCard[] = [];
        const pagesDevUrl = activeCloudflarePages.pagesDev?.url || activeDeployedUrl;
        if (pagesDevUrl) {
          cards.push({
            id: 'pages-dev',
            label: t('fileViewer.cloudflarePagesDevLinkLabel'),
            url: pagesDevUrl,
            status: activeCloudflarePages.pagesDev?.status || activeDeployment?.status || 'link-delayed',
            message: activeCloudflarePages.pagesDev?.statusMessage,
          });
        }
        if (activeCloudflareCustomDomain?.url) {
          cards.push({
            id: 'custom-domain',
            label: t('fileViewer.cloudflareCustomDomainLinkLabel'),
            url: activeCloudflareCustomDomain.url,
            status: activeCloudflareCustomDomain.status,
            message:
              activeCloudflareCustomDomain.errorMessage ||
              activeCloudflareCustomDomain.statusMessage,
          });
        }
        return cards;
      })()
    : activeDeployedUrl
      ? [{
          id: 'default',
          label: activeDeploymentProtected
            ? t('fileViewer.deployLinkProtectedLabel')
            : activeDeploymentDelayed
              ? t('fileViewer.deployLinkPreparingLabel')
              : t('fileViewer.deployResultLabel'),
          url: activeDeployedUrl,
          status: activeDeployment?.status || 'ready',
          message: activeDeploymentProtected
            ? t('fileViewer.deployLinkProtected')
            : activeDeploymentDelayed
              ? t('fileViewer.deployLinkDelayed')
              : activeDeployment?.statusMessage,
        }]
      : [];
  const deployActionLabelFor = (providerId: WebDeployProviderId) => {
    const option = getDeployProviderOption(providerId);
    const label = t(option.labelKey);
    const hasActiveDeploymentForProvider = Boolean(deploymentsByProvider[providerId]?.url?.trim());
    return hasActiveDeploymentForProvider
      ? t('fileViewer.redeployToProvider', { provider: label })
      : t('fileViewer.deployToProvider', { provider: label });
  };
  const deployedEntries = DEPLOY_PROVIDER_OPTIONS
    .map((option) => deploymentsByProvider[option.id])
    .filter((item): item is WebDeploymentInfo => Boolean(item?.url?.trim()));
  const shareableDeploymentUrl =
    DEPLOY_PROVIDER_OPTIONS.map((option) => deploymentsByProvider[option.id])
      .map((item) => publicShareUrlForDeployment(item))
      .find(Boolean) ?? '';
  const socialShareBlockedDeployment =
    shareableDeploymentUrl
      ? null
      : deployedEntries.find((item) => deployResultState(item.status) === 'protected' && !publicShareUrlForDeployment(item)) ??
        deployedEntries.find((item) => !publicShareUrlForDeployment(item)) ??
        null;
  const socialShareBlockedState = socialShareBlockedDeployment
    ? deployResultState(socialShareBlockedDeployment.status)
    : null;
  const socialShareDisplayUrl =
    shareableDeploymentUrl || socialShareBlockedDeployment?.url?.trim() || activeDeployedUrl;
  const socialShareUnavailableMessage =
    socialShareBlockedState === 'protected'
      ? t('fileViewer.deployLinkProtected')
      : socialShareBlockedState === 'delayed'
        ? t('fileViewer.deployLinkDelayed')
        : t('socialShare.deployFirst');
  const projectSocialShareRequest = useMemo<SocialShareRequest | null>(() => {
    if (hideExternalShareSurfaces || !socialShareDisplayUrl) return null;
    const title = t('socialShare.projectTitle', { title: exportTitle });
    const text = t('socialShare.projectText', {
      title: exportTitle,
      repo: OPEN_DESIGN_GITHUB_REPO_URL,
    });
    return {
      kind: 'project-html',
      locale,
      url: socialShareDisplayUrl,
      title,
      text,
      copyText: t('socialShare.projectCopyText', {
        title: exportTitle,
        url: socialShareDisplayUrl,
        repo: OPEN_DESIGN_GITHUB_REPO_URL,
      }),
    };
  }, [exportTitle, hideExternalShareSurfaces, locale, socialShareDisplayUrl, t]);
  const projectSocialShareFallback = useMemo(
    () => (projectSocialShareRequest ? buildSocialSharePayload(projectSocialShareRequest) : null),
    [projectSocialShareRequest],
  );
  // Gate the async payload load on a stable *content* key, not the memo's
  // object identity. The request object can take a fresh identity on renders
  // where its inputs are value-equal (e.g. while deployment polling re-sets
  // state with a new map reference), and keying the effect on that identity
  // made `setProjectSocialShare` re-fire every render — an infinite render
  // loop once a deployment URL is available (#regression: ready-deploy share).
  const projectSocialShareKey = projectSocialShareRequest
    ? JSON.stringify(projectSocialShareRequest)
    : '';
  useEffect(() => {
    setProjectSocialShare(null);
    if (!projectSocialShareRequest) return;
    let cancelled = false;
    void createSocialSharePayload(projectSocialShareRequest)
      .then((payload) => {
        if (!cancelled) setProjectSocialShare(payload);
      })
      .catch(() => {
        if (!cancelled) setProjectSocialShare(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSocialShareKey]);
  const activeProjectSocialShare = projectSocialShare ?? projectSocialShareFallback;
  const socialShareMenuLabel =
    activeProjectSocialShare
      ? t('socialShare.projectSection')
      : socialShareBlockedState === 'protected'
        ? t('fileViewer.deployLinkProtectedLabel')
        : socialShareBlockedState === 'delayed'
        ? t('fileViewer.deployLinkPreparingLabel')
          : t('socialShare.deployFirst');
  const deployActionIconFor = (providerId: WebDeployProviderId) => {
    if (providerId === 'cloudflare-pages') return 'pages-line';
    return 'upload-cloud-line';
  };
  const latestShareDeployment = useMemo(
    () => pickLatestShareDeployment(deploymentsByProvider),
    [deploymentsByProvider],
  );
  const latestDeployedShareUrl = latestShareDeployment
    ? shareUrlForDeployment(latestShareDeployment)
    : '';
  const latestShareState = latestShareDeployment
    ? deployResultState(latestShareDeployment.status)
    : null;
  const sharePageUrl = useMemo(
    () => resolveShareUrl(latestDeployedShareUrl),
    [latestDeployedShareUrl],
  );
  const canCopyShareLink = !streaming && Boolean(sharePageUrl);
  const canOpenSharePage = !streaming && Boolean(sharePageUrl) && latestShareState !== 'delayed';
  const shareLinkStatusHint =
    streaming
      ? t('fileViewer.shareAfterGenerationComplete')
      : latestShareState === 'delayed'
      ? t('fileViewer.deployLinkDelayed')
      : latestShareState === 'protected'
        ? t('fileViewer.deployLinkProtected')
        : '';
  const shareUnavailableHint = streaming
    ? t('fileViewer.shareAfterGenerationComplete')
    : t('fileViewer.shareLinkRequiresDeploy');
  const copyShareLinkLabel =
    shareLinkFeedback === 'copied'
      ? t('fileViewer.copied')
      : shareLinkFeedback === 'failed'
        ? t('useEverywhere.copyFailed')
        : t('fileViewer.copyShareLink');
  const shareMenuLabel = t('fileViewer.shareLabel');
  const deployMenuLabel = t('fileViewer.deployModalTitle') || 'Deploy';
  const deployButtonLabel =
    deployPhase === 'deploying'
      ? t('fileViewer.deployingToProvider', { provider: deployProviderLabel })
      : deployPhase === 'preparing-link'
        ? t('fileViewer.preparingPublicLink')
        : deployMenuLabel;
  const copyDeployLabel = (url: string) =>
    copiedDeployLink === url.trim()
      ? t('fileViewer.copied')
      : t('fileViewer.copyDeployLink');
  const statusLabelFor = (state: ReturnType<typeof deployResultState>) => {
    if (state === 'ready') return t('fileViewer.deployLinkReady');
    if (state === 'protected') return t('fileViewer.deployLinkProtectedLabel');
    if (state === 'failed') return t('fileViewer.deployLinkFailed');
    return t('fileViewer.deployLinkPreparingLabel');
  };
  const boardAvailable = mode === 'preview' && source !== null;
  const showPreviewToolbarControls = mode === 'preview';
  const showPreviewViewportControls = showPreviewToolbarControls && !effectiveDeck;
  const liveHtmlUnstableForPreview = Boolean(
    streaming
    && liveHtml?.trim()
    && !isArtifactHtmlStableForPreview(repairArtifactDocumentHeadIfNeeded(liveHtml)),
  );
  const showStreamingAwaitingLiveHtml = Boolean(streaming && !liveHtml?.trim());
  // Empty branch used to never render the veil (it lived under source !== null).
  // Do not gate on !sourceLoadFailed — mid-stream incomplete disk used to flip
  // failed and replace the veil with "previewUnavailable".
  const showStreamingEmptyVeil =
    (liveHtmlUnstableForPreview || showStreamingAwaitingLiveHtml) && source == null;
  const showStreamingPreviewVeil =
    (liveHtmlUnstableForPreview || showStreamingAwaitingLiveHtml) && source != null;
  const commentPreviewLayoutClass = [
    'comment-preview-layer',
    localCommentSideDockActive ? 'comment-preview-layer-with-side-dock' : '',
    localCommentSideDockActive && commentSidePanelCollapsed ? 'comment-preview-layer-dock-collapsed' : '',
    boardSideDockStacked ? 'comment-preview-layer-side-dock-stacked' : '',
  ].filter(Boolean).join(' ');
  // Edit mode opens clean: the inspector only appears once the user pins an
  // element (click its hover affordance / a container) or opens page styles by
  // clicking the empty canvas. No more full-height panel popping on toggle.
  const manualEditPageCardActive =
    manualEditMode && !selectedManualEditTarget && manualEditPageStylesOpen;
  const manualEditPanelActive =
    manualEditMode && (!!selectedManualEditTarget || manualEditPageCardActive);
  const selectedManualEditTargetsForPanel = resolveManualEditTargetsByIds(
    selectedManualEditTargetIds,
    manualEditTargets,
  );
  const manualEditMultiSelectActive = selectedManualEditTargetsForPanel.length > 1;
  const manualEditGeometryOptions = selectedManualEditGeometryOptions();
  const selectedManualEditAnchoredMoveTargets = resolveGroupMovableTargets(
    selectedManualEditTargetsForPanel,
    manualEditGeometryOptions,
    manualEditTargetIsDescendantOf,
  );
  const selectedManualEditGroupMoveTargets = resolveGroupMoveTargets(
    selectedManualEditTargetsForPanel,
    manualEditGeometryOptions,
    manualEditTargetIsDescendantOf,
  );
  const selectedManualEditResizeGeometryTargets = resolveGroupResizableTargets(
    selectedManualEditTargetsForPanel,
    manualEditGeometryOptions,
    manualEditTargetIsDescendantOf,
  );
  const manualEditGroupMoveEnabled = selectedManualEditGroupMoveTargets.length >= 2;
  const manualEditGroupResizeEnabled = selectedManualEditResizeGeometryTargets.length >= 2;
  const manualEditMultiSelectOverlayTargets = manualEditGroupResizeEnabled
    ? selectedManualEditResizeGeometryTargets
    : manualEditGroupMoveEnabled
      ? selectedManualEditGroupMoveTargets
      : selectedManualEditTargetsForPanel;
  const manualEditGroupAlignEnabled = canGroupAlign(
    selectedManualEditAnchoredMoveTargets,
    manualEditGeometryOptions,
    manualEditTargetIsDescendantOf,
  );
  const manualEditGroupDistributeEnabled = canGroupDistribute(
    selectedManualEditAnchoredMoveTargets,
    manualEditGeometryOptions,
    manualEditTargetIsDescendantOf,
  );
  const manualEditSnapPageBounds = manualEditContentPageBounds;
  const manualEditSnapExcludeIds = useMemo(
    () => new Set(selectedManualEditTargetIds),
    [selectedManualEditTargetIds],
  );
  const manualEditSnapSources = useMemo(
    () => collectSnapSources(
      manualEditTargets,
      manualEditSnapExcludeIds,
      manualEditSnapPageBounds,
      manualEditTargetIsDescendantOf,
    ),
    [
      manualEditTargets,
      manualEditSnapExcludeIds,
      manualEditSnapPageBounds,
      manualEditTargetIsDescendantOf,
    ],
  );
  const manualEditLayerPanelTargets = useMemo(
    () => sortManualEditLayerTargetsByPaintOrder(
      filterManualEditLayerTargets(manualEditTargets, {
        deck: effectiveDeck,
        activeSlideIndex: slideState?.active ?? null,
        viewportBounds: manualEditViewportBounds,
      }),
    ),
    [manualEditTargets, effectiveDeck, slideState?.active, manualEditViewportBounds],
  );
  const manualEditZOrderCapabilities = useMemo(() => {
    const doc = iframeContentDocumentIfAccessible(iframeRef.current);
    const reorderOptions = {
      deck: effectiveDeck,
      activeSlideIndex: slideState?.active ?? null,
    };
    const targets = resolveManualEditTargetsByIds(
      selectedManualEditTargetIds,
      manualEditTargets,
    ).filter((target) => canAdjustZOrderTarget(target.cssPosition));
    const roots = targets.length > 1
      ? filterRootTargetsForGroupGeometry(targets, manualEditTargetIsDescendantOf)
      : targets;
    if (roots.length === 0) return null;
    const capabilities = roots
      .map((target) => resolveZOrderContextWithFallback(
        doc,
        manualEditTargets,
        target.id,
        reorderOptions,
      )?.capabilities)
      .filter((cap): cap is NonNullable<typeof cap> => Boolean(cap));
    return mergeZOrderCapabilities(capabilities);
  }, [
    selectedManualEditTargetIds,
    selectedManualEditTarget?.id,
    selectedManualEditTarget?.cssPosition,
    manualEditDraft.styles.zIndex,
    manualEditTargets,
    manualEditTargetIsDescendantOf,
    srcDoc,
    effectiveDeck,
    slideState?.active,
  ]);

  function collectZIndexTargetsFromPending(pending: ManualEditPendingStyleSave): string[] {
    return manualEditPendingStyleEntries(pending)
      .filter(({ styles }) => styles.zIndex !== undefined)
      .map(({ id }) => id);
  }

  function afterManualEditZIndexPersist(targetIds: readonly string[]) {
    if (targetIds.length === 0) return;
    for (const id of targetIds) {
      requestManualEditTargetRemeasure(id);
    }
    requestManualEditTargetsRefresh();
  }

  function promoteZIndexStylesForTarget(
    target: ManualEditTarget | null | undefined,
    styles: Partial<ManualEditStyles>,
  ): Partial<ManualEditStyles> {
    if (styles.zIndex === undefined) return styles;
    return {
      ...styles,
      ...buildZOrderStylePatch(target?.cssPosition, styles.zIndex),
    };
  }

  function applyManualEditZOrderOptimistic(
    patches: Array<{ id: string; styles: Partial<ManualEditStyles> }>,
  ) {
    const patchMap = new Map(patches.map((patch) => [patch.id, patch.styles]));
    setManualEditTargets((current) => current.map((item) => {
      const styles = patchMap.get(item.id);
      if (!styles) return item;
      const stackZ = styles.zIndex !== undefined
        ? readStackZFromZIndexStyle(styles.zIndex)
        : item.stackZ;
      return {
        ...item,
        styles: { ...item.styles, ...styles },
        stackZ,
        cssPosition: styles.position ?? item.cssPosition,
      };
    }));
    const primaryId = selectedManualEditTargetIdRef.current;
    const primaryStyles = primaryId ? patchMap.get(primaryId) : null;
    if (!primaryId || !primaryStyles) return;
    setSelectedManualEditTarget((current) => {
      if (!current || current.id !== primaryId) return current;
      const next: ManualEditTarget = {
        ...current,
        styles: { ...current.styles, ...primaryStyles },
        stackZ: primaryStyles.zIndex !== undefined
          ? readStackZFromZIndexStyle(primaryStyles.zIndex)
          : current.stackZ,
        cssPosition: primaryStyles.position ?? current.cssPosition,
      };
      selectedManualEditTargetRef.current = next;
      return next;
    });
    setManualEditDraft((current) => ({
      ...current,
      styles: { ...current.styles, ...primaryStyles },
    }));
  }

  function resolveManualEditZOrderTargets(): ManualEditTarget[] {
    const ids = selectedManualEditTargetIdsRef.current;
    const catalog = manualEditTargets;
    const resolved = ids.length > 0
      ? resolveManualEditTargetsByIds(ids, catalog)
      : (selectedManualEditTargetRef.current ? [selectedManualEditTargetRef.current] : []);
    const eligible = resolved.filter((target) => canAdjustZOrderTarget(target.cssPosition));
    if (eligible.length <= 1) return eligible;
    return filterRootTargetsForGroupGeometry(eligible, manualEditTargetIsDescendantOf);
  }

  function queueManualEditZOrderPatches(
    patches: Array<{ id: string; styles: Partial<ManualEditStyles> }>,
    label: string,
  ) {
    if (patches.length === 0) return;
    const version = nextManualEditPreviewVersion();
    const perTargetStyles: Record<string, Partial<ManualEditStyles>> = {};
    for (const patch of patches) {
      perTargetStyles[patch.id] = patch.styles;
      previewStyleToIframe(patch.id, patch.styles, version);
    }
    clearManualEditStyleTimer();
    manualEditPendingStyleRef.current = {
      id: patches[patches.length - 1]!.id,
      perTargetStyles,
      styles: {},
      label,
      version,
    };
    setManualEditError(null);
    applyManualEditZOrderOptimistic(patches);
    for (const patch of patches) {
      requestManualEditTargetRemeasure(patch.id);
    }
    requestManualEditTargetsRefresh();
    if (manualEditResizeSessionActiveRef.current) return;
    manualEditStyleTimerRef.current = setTimeout(() => {
      manualEditStyleTimerRef.current = null;
      if (manualEditResizePausedRef.current) return;
      void flushManualEditStyleSave();
    }, MANUAL_EDIT_STYLE_AUTOSAVE_MS);
  }

  async function handleManualEditDeleteSelected() {
    if (manualEditInlineTextEditing) return;
    if (manualEditResizeSessionActiveRef.current) return;
    if (manualEditSavingRef.current) return;
    const ids = selectedManualEditTargetIdsRef.current;
    if (ids.length !== 1) return;
    const id = ids[0]!;
    if (!(await settleManualEditStyleBoundary())) return;
    await applyManualEdit({ id, kind: 'remove-element' }, t('manualEdit.deleteElement'));
  }

  function handleManualEditZOrder(action: ZOrderAction) {
    const doc = iframeContentDocumentIfAccessible(iframeRef.current);
    const reorderOptions = {
      deck: effectiveDeck,
      activeSlideIndex: slideState?.active ?? null,
    };
    const targets = resolveManualEditZOrderTargets();
    if (targets.length === 0) return;
    const patches: Array<{ id: string; styles: Partial<ManualEditStyles> }> = [];
    for (const target of targets) {
      const patch = computeZOrderPatchForTargetWithFallback(
        doc,
        manualEditTargets,
        target.id,
        action,
        reorderOptions,
      );
      if (!patch || Object.keys(patch).length === 0) continue;
      patches.push({ id: target.id, styles: patch });
    }
    if (patches.length === 0) return;
    const label = patches.length > 1
      ? `Z-order: ${patches.length} elements`
      : zOrderHistoryLabel(action);
    queueManualEditZOrderPatches(patches, label);
  }

  function handleManualEditLayerReorder(draggedId: string, insertBeforeId: string | null) {
    const reorderOptions = {
      deck: effectiveDeck,
      activeSlideIndex: slideState?.active ?? null,
    };
    const visibleSiblings = resolveLayerReorderSiblings(manualEditTargets, draggedId, reorderOptions);
    if (visibleSiblings.length < 2) return;
    const stackSiblings = resolveLayerReorderStackSiblings(manualEditTargets, draggedId, reorderOptions);
    const visibleFrontFirst = layerReorderGroupFrontFirstIds(visibleSiblings);
    const insertIndex = layerReorderInsertIndex(visibleFrontFirst, draggedId, insertBeforeId);
    if (insertIndex === null) return;
    const visibleNextOrder = reorderLayerPaintOrder(visibleFrontFirst, draggedId, insertIndex);
    const nextOrder = mergeVisibleLayerReorderIntoStack(
      stackSiblings,
      visibleFrontFirst,
      visibleNextOrder,
    );
    const patches = buildLayerReorderZIndexPatches(stackSiblings, nextOrder);
    if (patches.length === 0) return;
    queueManualEditZOrderPatches(patches, layerReorderHistoryLabel(patches.length));
  }
  manualEditZOrderHandlerRef.current = handleManualEditZOrder;
  manualEditDeleteHandlerRef.current = () => {
    void handleManualEditDeleteSelected();
  };
  const revisionCanUndo = canUndoRevisionStack(revisionStack) && !revisionStackInvalidated;
  const revisionCanRedo = canRedoRevisionStack(revisionStack) && !revisionStackInvalidated;
  const revisionUndoUnavailableTooltip = revisionStackInvalidated
    ? t('fileRevision.undo.unavailableTooltip')
    : undefined;
  const manualEditPanel = manualEditPanelActive ? (
    <ManualEditPanel
      targets={manualEditTargets}
      selectedTarget={selectedManualEditTarget}
      selectedTargets={selectedManualEditTargetsForPanel}
      mixedStyleKeys={manualEditMixedStyleKeys}
      draft={manualEditDraft}
      history={[]}
      error={manualEditError}
      canUndo={revisionCanUndo}
      canRedo={revisionCanRedo}
      busy={manualEditSaving}
      pageStylesEnabled={manualEditPageStylesEnabled}
      onSelectTarget={(target, options) => {
        void selectManualEditTarget(target, options);
      }}
      onDraftChange={setManualEditDraft}
      onStyleChange={(ids, styles, label) => {
        void handleManualEditStyleChange(ids, styles, label);
      }}
      groupAlignEnabled={manualEditGroupAlignEnabled}
      groupDistributeEnabled={manualEditGroupDistributeEnabled}
      onGroupAlign={(kind) => {
        void handleManualEditGroupAlign(kind);
      }}
      onGroupDistribute={(kind) => {
        void handleManualEditGroupDistribute(kind);
      }}
      zOrderCapabilities={manualEditZOrderCapabilities}
      onZOrder={handleManualEditZOrder}
      zOrderBusy={manualEditSaving}
      onInvalidStyle={cancelManualEditPendingStyles}
      onApplyPatch={(patch, label) => {
        void (async () => {
          if (patch.kind !== 'set-style' && !(await settleManualEditStyleBoundary())) return;
          await applyManualEdit(patch, label);
        })();
      }}
      onError={setManualEditError}
      onClearSelection={() => {
        void clearManualEditTargetSelection();
      }}
      onExit={() => {
        void dismissManualEditPanel();
      }}
      onCancelDraft={() => {
        cancelManualEditPanel();
      }}
      onSaveDraft={() => {
        void dismissManualEditPanel();
      }}
      onUndo={() => {
        void undoManualEdit();
      }}
      onRedo={() => {
        void redoManualEdit();
      }}
      floatingClassName={manualEditPageCardActive ? 'manual-edit-page-card' : undefined}
      collapsed={manualEditPanelCollapsed}
      onCollapsedChange={setManualEditPanelCollapsed}
      floatingStyle={selectedManualEditTarget
        ? manualEditFloatingPanelStyle(
            selectedManualEditTarget,
            manualEditHostScale,
            previewBodySize,
            manualEditHostOffset,
            manualEditHostPaintRect,
            manualEditPanelPosition,
          )
        : { top: 12, right: 12, width: 320 }}
      onFloatingPositionChange={selectedManualEditTarget
        ? (position) => {
            manualEditPanelUserPinnedRef.current = true;
            setManualEditPanelPosition(position);
          }
        : undefined}
      onPickImage={async (pickedFile) => {
        const result = await uploadProjectFiles(projectId, [pickedFile]);
        const uploaded = result.uploaded[0];
        if (!uploaded?.path) {
          setManualEditError(
            formatProjectUploadFailureDetail(result.error)
            ?? t('manualEdit.uploadImageFailed'),
          );
          return null;
        }
        setManualEditError(null);
        return toOwnerRelativePath(file.name, uploaded.path);
      }}
    />
  ) : null;
  const manualEditHoverAffordance =
    manualEditMode &&
    manualEditHoverTarget &&
    manualEditHoverTarget &&
    !selectedManualEditTargetIds.includes(manualEditHoverTarget.id) ? (
      <button
        type="button"
        className="manual-edit-hover-action"
        data-testid="manual-edit-hover-open"
        aria-label={t('manualEdit.editParams')}
        title={t('manualEdit.editParams')}
        style={manualEditHoverIconStyle(
          manualEditHoverTarget,
          manualEditHostScale,
          previewBodySize,
          manualEditHostOffset,
          (() => {
            const frame = iframeRef.current;
            const workspace = manualEditWorkspaceRef.current;
            if (!frame || !workspace) return null;
            return measureManualEditTargetHostRect(frame, workspace, manualEditHoverTarget.id);
          })(),
        )}
        onClick={() => {
          const target = manualEditHoverTarget;
          setManualEditHoverTarget(null);
          void selectManualEditTarget(target);
        }}
      >
        <Icon name="sliders" size={15} />
      </button>
    ) : null;
  const manualEditTipRemountChromeInert = shouldDisableManualEditChromeUntilTipRemasure(
    manualEditTipRemountChromeSuppressed,
  );
  const manualEditResizeOverlay =
    manualEditMode
    && !hideManualEditBoxDrag
    && !drawOverlayOpen
    && !manualEditMultiSelectActive
    && selectedManualEditTarget
    && canResizeTarget(selectedManualEditTarget, {
      inlineTextEditing: manualEditInlineTextEditing,
    }) ? (
      <ManualEditResizeOverlay
        target={selectedManualEditTarget}
        previewScale={manualEditHostScale}
        hostOffset={manualEditHostOffset}
        hostPaintRect={manualEditHostPaintRect}
        draftWidthPx={manualEditResizeDraftSize?.width ?? null}
        draftHeightPx={manualEditResizeDraftSize?.height ?? null}
        draftLeftPx={manualEditMoveDraftPos?.x ?? null}
        draftTopPx={manualEditMoveDraftPos?.y ?? null}
        // Do not disable handles while saving — HTML disabled buttons drop
        // pointer events through to the movable body, so resize becomes move.
        // Tip-remount: keep chrome mounted inert at last rect (458).
        disabled={manualEditInlineTextEditing || manualEditTipRemountChromeInert}
        onResizeSessionChange={handleManualEditResizeSessionChange}
        onResolveResizeStart={() => {
          const id = selectedManualEditTargetIdRef.current;
          const frame = iframeRef.current;
          const workspace = manualEditWorkspaceRef.current;
          if (!id || !frame) return null;
          const content = measureManualEditTargetContentRect(frame, id);
          if (!content) return null;
          const paint = workspace
            ? measureManualEditTargetHostRect(frame, workspace, id)
            : null;
          // Keep React target in sync so drafts/inspector match the gesture seed.
          setSelectedManualEditTarget((current) => {
            if (!current || current.id !== id) return current;
            const next = {
              ...current,
              rect: content.rect,
              layoutWidth: content.layoutWidth,
              layoutHeight: content.layoutHeight,
            };
            selectedManualEditTargetRef.current = next;
            return next;
          });
          return {
            layoutWidth: content.layoutWidth,
            layoutHeight: content.layoutHeight,
            rect: content.rect,
            paint: paint && paint.width >= 1 && paint.height >= 1 ? paint : null,
          };
        }}
        onResizePreview={handleManualEditResizePreview}
        onResizeCommit={(styles, stylesBefore, viewport) => {
          void handleManualEditResizeCommit(styles, stylesBefore, viewport);
        }}
        onResizeCancel={handleManualEditResizeCancel}
        onMovePreview={handleManualEditMovePreview}
        onMoveCommit={(styles, stylesBefore, viewport) => {
          void handleManualEditMoveCommit(styles, stylesBefore, viewport);
        }}
        onMoveCancel={handleManualEditMoveCancel}
        onStartTextEdit={(targetId) => {
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'od-edit-start-text-edit', id: targetId },
            '*',
          );
        }}
        snapSources={manualEditSnapSources}
      />
    ) : null;
  const manualEditMultiSelectOverlay =
    manualEditMode
    && !drawOverlayOpen
    && manualEditMultiSelectActive ? (
      <ManualEditMultiSelectOverlay
        targets={manualEditMultiSelectOverlayTargets}
        previewScale={manualEditHostScale}
        hostOffset={manualEditHostOffset}
        measureHostRect={(id) => {
          const frame = iframeRef.current;
          const workspace = manualEditWorkspaceRef.current;
          if (!frame || !workspace) return null;
          return measureManualEditTargetHostRect(frame, workspace, id);
        }}
        movable={manualEditGroupMoveEnabled}
        resizable={manualEditGroupResizeEnabled}
        // Tip-remount: keep multi chrome mounted inert at last union rect (458).
        disabled={manualEditInlineTextEditing || manualEditTipRemountChromeInert}
        draftMemberRects={manualEditGroupDraftRects}
        onGroupMovePreview={handleManualEditGroupMovePreview}
        onGroupMoveCommit={(updates, stylesBefore) => {
          void handleManualEditGroupMoveCommit(updates, stylesBefore);
        }}
        onGroupMoveCancel={handleManualEditGroupMoveCancel}
        onGroupResizePreview={handleManualEditGroupResizePreview}
        onGroupResizeCommit={(updates, stylesBefore, handle, dx, dy, shiftKey) => {
          void handleManualEditGroupResizeCommit(
            updates,
            stylesBefore,
            handle,
            dx,
            dy,
            shiftKey,
          );
        }}
        onGroupResizeCancel={handleManualEditGroupResizeCancel}
        onGestureSessionChange={handleManualEditResizeSessionChange}
        snapSources={manualEditSnapSources}
      />
    ) : null;
  const activeComposerComment = activePreviewCommentId
    ? visibleSideComments.find((comment) => comment.id === activePreviewCommentId) ?? null
    : null;
  const activeComposerAttachments =
    activeComposerComment?.attachments ?? activeCommentExistingAttachments;
  const commentComposer = boardMode && activeCommentTarget && activeCommentTargetVisible ? (
    <BoardComposerPopover
      target={activeCommentTarget}
      existing={activeComposerComment}
      draft={commentDraft}
      notes={queuedBoardNotes}
      onDraft={setCommentDraft}
      onAddDraft={queueCurrentDraft}
      onRemoveQueuedNote={(index) =>
        setQueuedBoardNotes((current) => current.filter((_, currentIndex) => currentIndex !== index))
      }
      onClose={clearBoardComposer}
      onSaveComment={() => { fireCommentPopoverClick('save_comment'); return savePersistentComment(); }}
      onSendBatch={() => { fireCommentPopoverClick('send_to_chat'); return sendBoardBatch(); }}
      images={boardImagePreviews}
      existingImages={
        activeComposerAttachments.map((attachment) => ({
          path: attachment.path,
          name: attachment.name,
        }))
      }
      projectId={projectId}
      onAttachImages={addBoardImages}
      onRemoveImage={removeBoardImage}
      onPreviewImage={setBoardPreviewIndex}
      onRemoveMember={(elementId) => {
        setActiveCommentTarget((current) => {
          const { next, shouldClose } = applyPodMemberRemoval(current, elementId);
          if (shouldClose) clearBoardComposer();
          return next;
        });
        setHoveredPodMemberId((current) => (current === elementId ? null : current));
      }}
      onHoverMember={setHoveredPodMemberId}
      onDeleteComment={onRemovePreviewComment ? async (commentId) => {
        await onRemovePreviewComment(commentId);
        clearBoardComposer();
        setSelectedSideCommentIds((current) => {
          if (!current.has(commentId)) return current;
          const next = new Set(current);
          next.delete(commentId);
          return next;
        });
        setActivePreviewCommentId((current) => (current === commentId ? null : current));
      } : undefined}
      sending={sendingBoardBatch}
      queueOnSend={commentQueueOnSend}
      sendDisabled={commentSendDisabled}
      t={t}
      scale={overlayPreviewScale}
      offset={{ x: overlayPreviewTransform.offsetX, y: overlayPreviewTransform.offsetY }}
      bounds={previewBodySize}
      docked={false}
      commenting
    />
  ) : null;
  const boardPreviewImage =
    boardPreviewIndex !== null ? boardImagePreviews[boardPreviewIndex] ?? null : null;
  const boardImagePreviewModal = boardPreviewImage
    ? createPortal(
        <div
          className="staged-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={boardPreviewImage.file.name}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setBoardPreviewIndex(null);
          }}
        >
          <div className="staged-preview-card">
            <div className="staged-preview-head">
              <span title={boardPreviewImage.file.name}>{boardPreviewImage.file.name}</span>
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => setBoardPreviewIndex(null)}
                aria-label={t('common.close')}
                title={t('common.close')}
                data-tooltip={t('common.close')}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <img src={boardPreviewImage.url} alt={boardPreviewImage.file.name} />
          </div>
        </div>,
        document.body,
      )
    : null;
  const commentSidePanel = commentPanelOpen ? (
    <CommentSideDock
      comments={visibleSideComments}
      projectId={projectId}
      selectedIds={selectedSideCommentIds}
      activeCommentId={activeSideCommentId}
      collapsed={commentPortalHost ? false : commentSidePanelCollapsed}
      onCollapsedChange={setCommentSidePanelCollapsed}
      onToggleSelect={(commentId) => {
        setSelectedSideCommentIds((current) => {
          const next = new Set(current);
          if (next.has(commentId)) next.delete(commentId);
          else next.add(commentId);
          return next;
        });
      }}
      onSelectAll={() => setSelectedSideCommentIds(new Set(visibleSideComments.map((comment) => comment.id)))}
      onClearSelection={() => setSelectedSideCommentIds(new Set())}
      onReorder={(orderedIds) => setCommentOrderIds(orderedIds)}
      onReply={(comment) => {
        // Reply == edit on a flat-thread model: prefill the
        // popover with the existing note so the user sees and
        // mutates the current text. Save runs through the
        // same upsert path; matching project/conv/file/element
        // updates note in place rather than creating a new row.
        const snapshot = liveSnapshotForComment(comment, liveCommentTargets) ?? {
          filePath: comment.filePath,
          elementId: comment.elementId,
          selector: comment.selector,
          label: comment.label,
          text: comment.text,
          position: comment.position,
          htmlHint: comment.htmlHint,
          style: comment.style,
          selectionKind: comment.selectionKind ?? 'element',
          memberCount: comment.memberCount,
          podMembers: comment.podMembers,
          ...(typeof comment.slideIndex === 'number' ? { slideIndex: comment.slideIndex } : {}),
        };
        setActiveCommentTarget(snapshot);
        setHoveredCommentTarget(snapshot);
        setActivePreviewCommentId(comment.id);
        setCommentDraft(comment.note);
        setQueuedBoardNotes([]);
        setActiveCommentExistingAttachments(comment.attachments ?? []);
        setBoardMode(true);
        setCommentCreateMode(true);
        setCommentPanelOpen(true);
        setCommentSidePanelCollapsed(false);
      }}
      onSendSelected={async () => {
        if (!onSendBoardCommentAttachments) return;
        const selected = visibleSideComments.filter(
          (comment) => selectedSideCommentIds.has(comment.id),
        );
        if (selected.length === 0) return;
        fireCommentPopoverClick('send_to_chat');
        const sentIds = new Set(selected.map((comment) => comment.id));
        setSendingBoardBatch(true);
        try {
          const fastPath = await applyManualEditCommentFastPathAttachments(commentsToAttachments(selected));
          const sentOrAppliedIds = new Set([
            ...Array.from(sentIds).filter((id) => fastPath.appliedIds.has(id)),
          ]);
          const accepted = fastPath.remaining.length > 0
            ? await onSendBoardCommentAttachments(fastPath.remaining)
            : fastPath.appliedIds.size > 0;
          if (accepted !== false) {
            for (const attachment of fastPath.remaining) sentOrAppliedIds.add(attachment.id);
            setSelectedSideCommentIds(new Set());
            setCommentOrderIds((current) => current.filter((id) => !sentOrAppliedIds.has(id)));
            setActivePreviewCommentId((current) => current && sentOrAppliedIds.has(current) ? null : current);
          }
        } finally {
          setSendingBoardBatch(false);
        }
      }}
      onCreateComment={savePanelComment}
      sending={sendingBoardBatch}
      queueOnSend={commentQueueOnSend}
      sendDisabled={commentSendDisabled}
      renderCreateForm={!commentPortalHost}
      t={t}
      composer={null}
    />
  ) : null;

  return (
    <div className={`viewer html-viewer${inTabPresent ? ' is-tab-present' : ''}`}>
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <button
            type="button"
            className="icon-only od-tooltip"
            onClick={reloadHtmlPreview}
            title={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
            data-tooltip={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
            data-tooltip-placement="bottom"
            aria-label={`${t('fileViewer.reloadAria')} ${t('fileViewer.preview')}`}
          >
            <Icon name="reload" size={14} />
          </button>
          <div className="viewer-tabs" role="tablist" aria-label={embedUiLabel('View mode', '보기 모드')}>
            {([
              ['preview', t('fileViewer.preview')],
              ['source', t('fileViewer.source')],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`viewer-tab ${mode === id ? 'active' : ''}`}
                aria-selected={mode === id}
                onClick={() => {
                  fireArtifactToolbarClick(id);
                  selectMode(id);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {showPreviewViewportControls ? (
            <>
              <span className="viewer-divider" aria-hidden />
              <PreviewViewportControls
                viewport={previewViewport}
                onViewport={setPreviewViewport}
                t={t}
              />
            </>
          ) : null}
          {showPreviewToolbarControls && effectiveDeck ? (
            <span
              className="deck-nav"
              role="group"
              aria-label={t('fileViewer.slideNavAria')}
            >
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => postSlide('prev')}
                title={t('fileViewer.previousSlide')}
                data-tooltip={t('fileViewer.previousSlide')}
                data-tooltip-placement="bottom"
                aria-label={t('fileViewer.previousSlide')}
                disabled={slideState !== null && slideState.active <= 0}
              >
                <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <span className="deck-nav-counter">
                {slideState
                  ? `${slideState.active + 1} / ${slideState.count}`
                  : '— / —'}
              </span>
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => postSlide('next')}
                title={t('fileViewer.nextSlide')}
                data-tooltip={t('fileViewer.nextSlide')}
                data-tooltip-placement="bottom"
                aria-label={t('fileViewer.nextSlide')}
                disabled={
                  slideState !== null &&
                  slideState.active >= slideState.count - 1
                }
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </span>
          ) : null}
        </div>
        <div className="viewer-toolbar-actions">
          {showPreviewToolbarControls ? (
            <>
              {/* TEMP: screenshot toolbar control disabled — capture/clipboard path is unreliable.
              {mode === 'preview' ? (
                <button
                  type="button"
                  className="viewer-action viewer-action-icon od-tooltip"
                  data-testid="screenshot-copy-button"
                  data-tooltip={t('fileViewer.screenshot')}
                  data-tooltip-placement="bottom"
                  title={t('fileViewer.screenshot')}
                  aria-label={t('fileViewer.screenshot')}
                  onClick={handleCopyScreenshot}
                >
                  <RemixIcon name="screenshot-2-line" size={15} />
                </button>
              ) : null}
              */}
              <div className="artifact-tool-menu-anchor">
                <button
                  type="button"
                  className={`viewer-action viewer-action-icon viewer-comment-toggle od-tooltip${boardMode && !commentCreateMode && boardTool === 'inspect' ? ' active' : ''}`}
                  data-testid="board-mode-toggle"
                  data-tooltip={t('fileViewer.comment')}
                  data-tooltip-placement="bottom"
                  title={t('fileViewer.comment')}
                  aria-label={t('fileViewer.comment')}
                  aria-pressed={boardMode && !commentCreateMode && boardTool === 'inspect'}
                  onClick={activateCommentTool}
                >
                  <RemixIcon name="chat-new-line" size={15} />
                </button>
              </div>
              {!hideDrawAnnotation ? (
                <button
                  className={`viewer-action viewer-action-icon od-tooltip${drawOverlayOpen ? ' active' : ''}`}
                  type="button"
                  data-testid="draw-overlay-toggle"
                  data-tooltip={t('fileViewer.markTooltip')}
                  data-tooltip-placement="bottom"
                  title={t('fileViewer.markTooltip')}
                  aria-label={t('fileViewer.mark')}
                  aria-pressed={drawOverlayOpen}
                  onClick={activateDrawTool}
                >
                  <RemixIcon name="mark-pen-line" size={15} />
                </button>
              ) : null}
              <span className="viewer-toolbar-tool-divider" aria-hidden />
              {!hideFileRevisionChrome && source !== null ? (
                <FileViewerUndoRedoToolbar
                  canUndo={revisionCanUndo}
                  canRedo={revisionCanRedo}
                  busy={manualEditSaving}
                  undoTooltip={revisionUndoUnavailableTooltip}
                  redoTooltip={revisionUndoUnavailableTooltip}
                  onUndo={() => {
                    void undoManualEdit();
                  }}
                  onRedo={() => {
                    void redoManualEdit();
                  }}
                  t={t}
                />
              ) : null}
              {!hideFileRevisionChrome ? (
                <button
                  type="button"
                  className={`viewer-action viewer-action-icon od-tooltip${revisionHistoryOpen ? ' active' : ''}`}
                  data-testid="file-revision-history-toggle"
                  data-tooltip={t('fileRevision.history.toggle')}
                  data-tooltip-placement="bottom"
                  title={t('fileRevision.history.toggle')}
                  aria-label={t('fileRevision.history.toggle')}
                  aria-pressed={revisionHistoryOpen}
                  onClick={() => {
                    fireArtifactToolbarClick('revision_history');
                    setRevisionHistoryOpen((open) => !open);
                  }}
                >
                  <RemixIcon name="history-line" size={15} />
                </button>
              ) : null}
              <button
                className={`viewer-action viewer-action-icon od-tooltip${manualEditMode ? ' active' : ''}`}
                type="button"
                data-testid="manual-edit-mode-toggle"
                data-tooltip={t('fileViewer.edit')}
                data-tooltip-placement="bottom"
                title={t('fileViewer.edit')}
                aria-label={t('fileViewer.edit')}
                aria-pressed={manualEditMode}
                onClick={activateManualEditTool}
              >
                <RemixIcon name="edit-line" size={15} />
              </button>
              {manualEditMode ? (
                <button
                  type="button"
                  className={`viewer-action viewer-action-icon od-tooltip${manualEditLayersPanelOpen ? ' active' : ''}`}
                  data-testid="manual-edit-layers-toggle"
                  data-tooltip={t('manualEdit.toggleLayers')}
                  data-tooltip-placement="bottom"
                  title={t('manualEdit.toggleLayers')}
                  aria-label={t('manualEdit.toggleLayers')}
                  aria-pressed={manualEditLayersPanelOpen}
                  onClick={() => {
                    setManualEditLayersPanelOpen((open) => !open);
                  }}
                >
                  <RemixIcon name="stack-line" size={15} />
                </button>
              ) : null}
              <span className="viewer-toolbar-tool-divider" aria-hidden />
              <button
                type="button"
                className={`viewer-action viewer-comment-count-trigger viewer-comment-toggle od-tooltip${boardMode && commentCreateMode ? ' active' : ''}`}
                data-testid="comment-panel-toggle"
                data-tooltip={t('chat.tabComments')}
                data-tooltip-placement="bottom"
                title={t('chat.tabComments')}
                aria-label={`${t('chat.tabComments')} (${visibleSideComments.length})`}
                aria-pressed={boardMode && commentCreateMode}
                onClick={activateCommentCreateTool}
              >
                <RemixIcon name="message-3-line" size={15} />
                <span className="viewer-comment-count" aria-hidden>{visibleSideComments.length}</span>
              </button>
              {source !== null && mode === 'preview' ? (
                <div className="zoom-menu viewer-toolbar-zoom" ref={zoomMenuRef}>
                  <button
                    type="button"
                    className="viewer-action zoom-trigger od-tooltip"
                    aria-haspopup="menu"
                    aria-expanded={zoomMenuOpen}
                    title={t('fileViewer.resetZoom')}
                    data-tooltip={t('fileViewer.resetZoom')}
                    data-tooltip-placement="bottom"
                    onClick={() => {
                      fireArtifactToolbarClick('zoom_level_dropdown');
                      setZoomMenuOpen((v) => !v);
                    }}
                  >
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{zoom}%</span>
                  </button>
                  {zoomMenuOpen ? (
                    <div className="zoom-menu-popover" role="menu">
                      {[50, 75, 100, 125, 150, 200].map((level) => (
                        <button
                          key={level}
                          type="button"
                          className={`zoom-menu-item${zoom === level ? ' active' : ''}`}
                          role="menuitem"
                          onClick={() => {
                            setZoom(level);
                            setZoomMenuOpen(false);
                          }}
                        >
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{level}%</span>
                          {zoom === level ? (
                            <Icon name="check" size={13} />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      {((filePrimaryActions: ReactNode) => (
        chromeActionsHost ? createPortal(filePrimaryActions, chromeActionsHost) : filePrimaryActions
      ))(<>
          {showPresent ? (
            <div className="present-wrap chrome-present-wrap">
              <button
                className="chrome-action chrome-action-secondary chrome-action-icon present-trigger od-tooltip"
                aria-haspopup="menu"
                aria-expanded={presentMenuOpen}
                aria-label={t('fileViewer.present')}
                data-tooltip={t('fileViewer.present')}
                data-tooltip-placement="bottom"
                title={t('fileViewer.present')}
                onClick={() => {
                  fireArtifactHeaderClick('present_dropdown');
                  setPresentMenuOpen((v) => !v);
                }}
              >
                <RemixIcon name="slideshow-3-line" size={15} />
              </button>
              {presentMenuOpen ? (
                <div className="present-menu" role="menu">
                  <button role="menuitem" onClick={() => { firePresentPopoverClick('in_this_tab'); presentInThisTab(); }}>
                    <span className="present-icon"><RemixIcon name="eye-line" size={14} /></span>{' '}
                    {t('fileViewer.presentInTab')}
                  </button>
                  <button role="menuitem" onClick={() => { firePresentPopoverClick('fullscreen'); presentFullscreen(); }}>
                    <span className="present-icon"><RemixIcon name="play-line" size={14} /></span>{' '}
                    {t('fileViewer.presentFullscreen')}
                  </button>
                  <button role="menuitem" onClick={() => { firePresentPopoverClick('new_tab'); presentNewTab(); }}>
                    <span className="present-icon"><RemixIcon name="share-forward-line" size={14} /></span>{' '}
                    {t('fileViewer.presentNewTab')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {showExternalShareMenu || canDownload ? (
            <div className="chrome-file-action-menus" ref={shareRef}>
              {showExternalShareMenu ? (
                <div className="share-menu chrome-share-menu">
                  <button
                    type="button"
                    className="chrome-action chrome-action-secondary chrome-action-with-label chrome-action-text-only"
                    aria-haspopup="menu"
                    aria-expanded={deployMenuOpen}
                    aria-label={shareMenuLabel}
                    onClick={openDeployMenu}
                  >
                    <span>{shareMenuLabel}</span>
                  </button>
                  {deployMenuOpen ? (
                    <div className="share-menu-popover" role="menu">
                      <div className="share-menu-section-label" role="presentation">
                        {t('fileViewer.shareMenuShareLink')}
                      </div>
                      {sharePageUrl ? (
                        <>
                          <button
                            type="button"
                            className="share-menu-item"
                            role="menuitem"
                            disabled={!canCopyShareLink}
                            title={!canCopyShareLink ? shareUnavailableHint : shareLinkStatusHint || undefined}
                            onClick={() => {
                              if (!canCopyShareLink || !sharePageUrl) return;
                              fireShareExport('share_link', async () => {
                                const ok = await copyShareLink(sharePageUrl);
                                if (!ok) throw new Error('copy_share_link_failed');
                              });
                            }}
                          >
                            <span className="share-menu-icon"><RemixIcon name="file-copy-line" size={15} /></span>
                            <span className="share-menu-text">
                              <span>{copyShareLinkLabel}</span>
                              {shareLinkStatusHint ? (
                                <small>{shareLinkStatusHint}</small>
                              ) : null}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="share-menu-item"
                            role="menuitem"
                            disabled={!canOpenSharePage}
                            title={!canOpenSharePage ? shareLinkStatusHint || shareUnavailableHint : shareLinkStatusHint || undefined}
                            onClick={() => {
                              if (!canOpenSharePage || !sharePageUrl) return;
                              setDeployMenuOpen(false);
                              fireShareExport('share_page', () => {
                                window.open(sharePageUrl, '_blank', 'noopener');
                              });
                            }}
                          >
                            <span className="share-menu-icon"><RemixIcon name="external-link-line" size={15} /></span>
                            <span className="share-menu-text">
                              <span>{t('fileViewer.openSharePage')}</span>
                              {shareLinkStatusHint ? (
                                <small>{shareLinkStatusHint}</small>
                              ) : null}
                            </span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="share-menu-item share-menu-guide"
                          role="menuitem"
                          title={shareUnavailableHint}
                          onClick={() => {
                            setShareGuideToast(shareUnavailableHint);
                          }}
                        >
                          <span className="share-menu-icon"><RemixIcon name="link" size={15} /></span>
                          <span className="share-menu-text">
                            <span>
                              {streaming
                                ? t('fileViewer.shareAfterGenerationComplete')
                                : t('fileViewer.shareLinkPublishGuide')}
                            </span>
                          </span>
                        </button>
                      )}
                      <div className="share-menu-divider" />
                      <div className="share-menu-section-label" role="presentation">
                        {t('fileViewer.shareMenuPublishOnline')}
                      </div>
                      {DEPLOY_PROVIDER_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className="share-menu-item"
                          role="menuitem"
                          onClick={() => {
                            const format =
                              option.id === 'cloudflare-pages'
                                ? 'cloudflare_pages'
                                : option.id === 'vercel-self'
                                  ? 'vercel'
                                  : 'vercel';
                            fireShareExport(format, () => openDeployModal(option.id));
                          }}
                        >
                          <span className="share-menu-icon">
                            <RemixIcon name={deployActionIconFor(option.id)} size={15} />
                          </span>
                          <span>{deployActionLabelFor(option.id)}</span>
                        </button>
                      ))}
                      <div className="share-menu-divider" />
                      <div className="share-menu-section-label" role="presentation">
                        {t('socialShare.projectSection')}
                      </div>
                      <button
                        type="button"
                        className="share-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setDeployMenuOpen(false);
                          fireShareExport('vercel', () => openSocialShareFlow());
                        }}
                      >
                        <span className="share-menu-icon">
                          <RemixIcon
                            name={activeProjectSocialShare ? 'share-forward-line' : 'upload-cloud-line'}
                            size={15}
                          />
                        </span>
                        <span>{socialShareMenuLabel}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {canDownload ? (
                <div className="share-menu chrome-share-menu">
                  <button
                    type="button"
                    className={
                      'chrome-action chrome-action-primary chrome-action-export' +
                      (exportReadyNudge ? ' export-ready-nudge' : '')
                    }
                    aria-haspopup="menu"
                    aria-expanded={downloadMenuOpen}
                    aria-label={isTeamverEmbedMode() ? embedUiLabel('Export', '보내기') : t('fileViewer.download')}
                    onClick={openDownloadMenu}
                  >
                    <span>{isTeamverEmbedMode() ? embedUiLabel('Export', '보내기') : t('fileViewer.download')}</span>
                  </button>
                  {downloadMenuOpen ? (
                    <div
                      className="share-menu-popover"
                      role="menu"
                      aria-label={isTeamverEmbedMode() ? embedUiLabel('Export options', '보내기 옵션') : embedUiLabel('Download and export options', '다운로드 및보내기')}
                    >
                  <TeamverExportMenu
                    t={t}
                    fileName={file.name}
                    showPptxExport={showPptxExport}
                    canPptx={canPptx}
                    onExportAsPptx={onExportAsPptx}
                    streaming={streaming}
                    showImageExport={showImageExport}
                    showMarkdownExport={showMarkdownExport}
                    savingTemplate={savingTemplate}
                    templateNote={templateNote}
                    onCloseMenu={() => setDownloadMenuOpen(false)}
                    onOpenDrivePublish={openDrivePublishModal}
                    onOpenImageExport={openImageExportModal}
                    onOpenSaveAsTemplate={openSaveAsTemplateModal}
                    fireShareExport={fireShareExport}
	                    exportPdf={(options) => exportProjectAsPdf({
	                      deck: effectiveDeck,
	                      fallbackPdf: () => exportAsPdf(
                        livePreviewSource ?? source ?? lastStablePreviewSourceRef.current ?? '',
                        exportTitle,
                        { deck: effectiveDeck },
                      ),
	                      filePath: file.name,
	                      fresh: options?.fresh,
	                      htmlSnapshot: livePreviewSource ?? source ?? lastStablePreviewSourceRef.current ?? null,
	                      projectId,
	                      requireRenderedExport: isTeamverEmbedMode(),
	                      title: exportTitle,
	                    })}
                    exportPptx={() => exportProjectAsPptx({
                      deck: effectiveDeck,
                      projectId,
                      filePath: file.name,
                      title: exportTitle,
                      htmlSnapshot: livePreviewSource ?? source ?? lastStablePreviewSourceRef.current ?? null,
                      requireRenderedExport: isTeamverEmbedMode(),
                    })}
	                    exportHtml={() => exportProjectAsHtml({
	                      deck: effectiveDeck,
	                      projectId,
	                      filePath: file.name,
	                      fallbackHtml: livePreviewSource ?? source ?? lastStablePreviewSourceRef.current ?? '',
	                      fallbackTitle: exportTitle,
	                      htmlSnapshot: livePreviewSource ?? source ?? lastStablePreviewSourceRef.current ?? null,
	                      requireRenderedExport: isTeamverEmbedMode(),
	                    })}
	                    exportZip={() => exportProjectAsZip({
	                      deck: effectiveDeck,
	                      projectId,
	                      filePath: file.name,
	                      fallbackHtml: livePreviewSource ?? source ?? lastStablePreviewSourceRef.current ?? '',
	                      fallbackTitle: exportTitle,
	                      htmlSnapshot: livePreviewSource ?? source ?? lastStablePreviewSourceRef.current ?? null,
	                      requireRenderedExport: isTeamverEmbedMode(),
	                    })}
                    exportMarkdown={() => exportAsMd(
                      livePreviewSource ?? source ?? lastStablePreviewSourceRef.current ?? '',
                      exportTitle,
                    )}
                  />
                </div>
                ) : null}
              </div>
              ) : null}
            </div>
          ) : null}
        </>)}
      <div className="viewer-body" ref={previewBodyRef}>
        {source === null ? (
          showStreamingEmptyVeil ? (
            <div
              className="viewer-empty artifact-preview-streaming-veil-host"
              role="status"
              aria-live="polite"
              data-testid="artifact-preview-streaming-veil"
            >
              <div className="artifact-preview-streaming-veil">
                <div className="artifact-preview-streaming-veil__backdrop" aria-hidden />
                <div className="artifact-preview-streaming-veil__card">
                  <Icon
                    name="spinner"
                    size={18}
                    className="artifact-preview-streaming-veil__icon"
                  />
                  <span className="artifact-preview-streaming-veil__label">
                    {t('fileViewer.updatingPreview')}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="viewer-empty">
              {sourceLoadFailed
                ? t('fileViewer.previewUnavailable')
                : t('fileViewer.loading')}
            </div>
          )
        ) : mode === 'preview' ? (
          <div
            ref={manualEditMode ? manualEditWorkspaceRef : undefined}
            className={`${manualEditMode ? 'manual-edit-workspace' : commentPreviewLayoutClass} preview-viewport preview-viewport-${previewViewport}${drawOverlayOpen ? ' preview-draw-active' : ''}`}
            data-testid={manualEditMode ? undefined : 'comment-preview-layout'}
            style={previewViewportStyle(previewViewport, previewScale, boardPreviewCanvasSize, boardPreviewScaleOptions)}
            onMouseLeave={manualEditMode ? clearManualEditHover : undefined}
          >
            {manualEditMode && manualEditLayersPanelOpen ? (
              <ManualEditLayersPanel
                targets={manualEditLayerPanelTargets}
                allTargets={manualEditTargets}
                deck={effectiveDeck}
                activeSlideIndex={slideState?.active ?? null}
                selectedIds={selectedManualEditTargetIds}
                onSelectTarget={(target, options) => {
                  void selectManualEditTarget(target, options);
                }}
                onClose={() => {
                  setManualEditLayersPanelOpen(false);
                }}
                zOrderCapabilities={manualEditZOrderCapabilities}
                onZOrder={handleManualEditZOrder}
                onLayerReorder={handleManualEditLayerReorder}
                zOrderBusy={manualEditSaving}
              />
            ) : null}
            {manualEditPanel}
            {manualEditHoverAffordance}
            {manualEditResizeOverlay}
            {manualEditMultiSelectOverlay}
            <div
              className={[
                manualEditMode ? 'manual-edit-canvas' : 'comment-preview-canvas',
                deckPreviewPanActive ? 'deck-preview-pannable' : '',
                deckPreviewPanActive && previewScale !== 1 ? 'deck-preview-pannable--zoomed' : '',
                deckPanning ? 'deck-preview-pannable--panning' : '',
              ].filter(Boolean).join(' ')}
              data-testid={manualEditMode ? undefined : 'comment-preview-canvas'}
              onWheel={deckPreviewPanActive ? onDeckPreviewWheel : undefined}
              onPointerDown={deckPreviewPanActive ? onDeckPreviewPointerDown : undefined}
              onPointerMove={deckPreviewPanActive ? onDeckPreviewPointerMove : undefined}
              onPointerUp={deckPreviewPanActive ? onDeckPreviewPointerUp : undefined}
              onPointerCancel={deckPreviewPanActive ? onDeckPreviewPointerUp : undefined}
            >
              <div className={manualEditMode ? undefined : 'comment-frame-clip'} style={manualEditMode ? { height: '100%' } : undefined}>
                <div
                  style={previewShellStyleForRenderedHtml({
                    manualEditMode,
                    previewViewport,
                    previewScale,
                    manualEditViewportWidth,
                    deckPreviewUsesFixedStage,
                    effectiveDeck,
                  })}
                >
                  <PreviewDrawOverlay
                    active={!hideDrawAnnotation && drawOverlayOpen}
                    onActiveChange={setDrawOverlayOpen}
                    captureViewport
                    captureSnapshot={captureExportImageSnapshot}
                    captureFrameRect={resolveAnnotationCaptureFrameRect}
                    captureTarget={null}
                    filePath={file.name}
                    slideIndex={effectiveDeck ? slideState?.active ?? null : null}
                    resetPreviewPan={resetDrawPreviewPan}
                    sendDisabled={streaming}
                    sendDisabledReason={t('chat.annotationSendDisabledReason')}
                    onToolbarClick={fireDrawToolbarClick}
                  >
                    <div
                      className={[
                        'artifact-preview-transport-stack',
                        showStreamingPreviewVeil || embedPreviewAwaitingPrefix ? 'is-streaming-unstable' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {showStreamingPreviewVeil ? (
                        <div
                          className="artifact-preview-streaming-veil"
                          role="status"
                          aria-live="polite"
                          data-testid="artifact-preview-streaming-veil"
                        >
                          <div className="artifact-preview-streaming-veil__backdrop" aria-hidden />
                          <div className="artifact-preview-streaming-veil__card">
                            <Icon
                              name="spinner"
                              size={18}
                              className="artifact-preview-streaming-veil__icon"
                            />
                            <span className="artifact-preview-streaming-veil__label">
                              {t('fileViewer.updatingPreview')}
                            </span>
                          </div>
                        </div>
                      ) : embedPreviewAwaitingPrefix ? (
                        <div
                          className="artifact-preview-streaming-veil"
                          role="status"
                          aria-live="polite"
                          data-testid="artifact-preview-prefix-settle-veil"
                        >
                          <div className="artifact-preview-streaming-veil__backdrop" aria-hidden />
                          <div className="artifact-preview-streaming-veil__card">
                            <Icon
                              name="spinner"
                              size={18}
                              className="artifact-preview-streaming-veil__icon"
                            />
                            <span className="artifact-preview-streaming-veil__label">
                              {t('fileViewer.loading')}
                            </span>
                          </div>
                        </div>
                      ) : null}
                      {OD_PREVIEW_KEEP_ALIVE ? (
                        <PooledIframe
                          ref={urlPreviewIframeRef}
                          cacheKey={urlPreviewKeepAliveKey}
                          data-testid={useUrlLoadPreview ? 'artifact-preview-frame' : 'artifact-preview-frame-url-load'}
                          data-od-render-mode="url-load"
                          data-od-active={useUrlLoadPreview ? 'true' : 'false'}
                          aria-hidden={useUrlLoadPreview ? undefined : true}
                          tabIndex={useUrlLoadPreview ? 0 : -1}
                          title={file.name}
                          sandbox="allow-scripts allow-downloads"
                          src={urlTransportSrc}
                          onLoad={() => {
                            const frame = urlPreviewIframeRef.current;
                            if (useUrlLoadPreview) iframeRef.current = frame;
                            setManualEditGeomEpoch((n) => n + 1);
                            setUrlSelectionBridgeReady(false);
                            dcViewportRestoreAtRef.current = Date.now();
                            frame?.contentWindow?.postMessage({
                              type: '__dc_set_viewport',
                              ...dcViewportRef.current,
                            }, '*');
                            frame?.contentWindow?.postMessage({ type: 'od:url-selection-bridge-probe' }, '*');
                            syncBridgeModes(frame);
                            // Tip-yield: sync tip rect before async remasure (459).
                            applyTipRemountSyncHostMeasureAfterSrcDocLoadWithRetry(frame);
                            requestTipRemountRemasureAfterSrcDocLoad(frame);
                            // Sticky deck fit may arm settle while needsFit is false (464).
                            scheduleTipRemountRemasureAfterDeckHostFitSettle(
                              () => frame ?? urlPreviewIframeRef.current,
                            );
                            replayManualEditStylesToIframe(frame);
                            if (useUrlLoadPreview) restorePreviewScrollPosition();
                            if (needsDeckHostViewportFit) {
                              schedulePostDeckHostViewportUntilSized(
                                () => frame ?? urlPreviewIframeRef.current,
                                deckPreviewFitScale,
                                deckPreviewFitOptions,
                              );
                              scheduleDeckPreviewFitNudges(
                                () => frame ?? urlPreviewIframeRef.current,
                                deckPreviewFitScale,
                                deckPreviewFitOptions,
                              );
                            }
                          }}
                        />
                      ) : (
                        <iframe
                          ref={urlPreviewIframeRef}
                          data-testid={useUrlLoadPreview ? 'artifact-preview-frame' : 'artifact-preview-frame-url-load'}
                          data-od-render-mode="url-load"
                          data-od-active={useUrlLoadPreview ? 'true' : 'false'}
                          aria-hidden={useUrlLoadPreview ? undefined : true}
                          tabIndex={useUrlLoadPreview ? 0 : -1}
                          title={file.name}
                          sandbox="allow-scripts allow-downloads"
                          src={urlTransportSrc}
                          onLoad={() => {
                            const frame = urlPreviewIframeRef.current;
                            if (useUrlLoadPreview) iframeRef.current = frame;
                            setManualEditGeomEpoch((n) => n + 1);
                            setUrlSelectionBridgeReady(false);
                            dcViewportRestoreAtRef.current = Date.now();
                            frame?.contentWindow?.postMessage({
                              type: '__dc_set_viewport',
                              ...dcViewportRef.current,
                            }, '*');
                            frame?.contentWindow?.postMessage({ type: 'od:url-selection-bridge-probe' }, '*');
                            syncBridgeModes(frame);
                            // Tip-yield: sync tip rect before async remasure (459).
                            applyTipRemountSyncHostMeasureAfterSrcDocLoadWithRetry(frame);
                            requestTipRemountRemasureAfterSrcDocLoad(frame);
                            // Sticky deck fit may arm settle while needsFit is false (464).
                            scheduleTipRemountRemasureAfterDeckHostFitSettle(
                              () => frame ?? urlPreviewIframeRef.current,
                            );
                            replayManualEditStylesToIframe(frame);
                            if (useUrlLoadPreview) restorePreviewScrollPosition();
                            if (needsDeckHostViewportFit) {
                              schedulePostDeckHostViewportUntilSized(
                                () => frame ?? urlPreviewIframeRef.current,
                                deckPreviewFitScale,
                                deckPreviewFitOptions,
                              );
                              scheduleDeckPreviewFitNudges(
                                () => frame ?? urlPreviewIframeRef.current,
                                deckPreviewFitScale,
                                deckPreviewFitOptions,
                              );
                            }
                          }}
                        />
                      )}
                      <iframe
                        key={srcDocPreviewMountKey}
                        ref={srcDocPreviewIframeRef}
                        data-testid={useUrlLoadPreview ? 'artifact-preview-frame-srcdoc' : 'artifact-preview-frame'}
                        data-od-render-mode="srcdoc"
                        data-od-active={useUrlLoadPreview ? 'false' : 'true'}
                        aria-hidden={useUrlLoadPreview ? true : undefined}
                        tabIndex={useUrlLoadPreview ? -1 : 0}
                        title={file.name}
                        sandbox="allow-scripts allow-downloads"
                        srcDoc={srcDocTransportContent}
                        onLoad={() => {
                          const frame = srcDocPreviewIframeRef.current;
                          if (!useUrlLoadPreview) iframeRef.current = frame;
                          setManualEditGeomEpoch((n) => n + 1);
                          // Reset the activation dedupe exactly ONCE per
                          // freshly mounted iframe DOM node, never on the
                          // subsequent load events that the same node
                          // emits during normal srcDoc rendering.
                          //
                          // The iframe's load event fires twice for one
                          // successful activation: once when the lazy
                          // transport shell HTML loads, and again when
                          // our own document.open/write/close inside the
                          // shell finishes. PR #2699 reset the dedupe on
                          // every load so that switching
                          // preview -> source -> preview (which remounts
                          // this iframe as a fresh DOM node) would
                          // re-activate the new shell. But resetting on
                          // every load also re-activated on the SECOND
                          // load of a non-remounted frame, which
                          // re-triggered document.open/write/close, which
                          // re-fired the load event, ad infinitum. The
                          // dedupe ref oscillated between null and the
                          // current srcDoc thousands of times per render
                          // and each iteration restarted every CSS
                          // animation from its `from` keyframe. Designs
                          // using `animation-fill-mode: both` with
                          // `from { opacity: 0 }` stayed at opacity 0
                          // forever and the preview read as blank.
                          // That is issue #2361.
                          //
                          // Tracking the last frame we reset for lets us
                          // keep PR #2699's "remount after Source toggle"
                          // fix while breaking the loop on plain renders.
                          if (frame && srcDocFrameDedupeResetForRef.current !== frame) {
                            srcDocFrameDedupeResetForRef.current = frame;
                            activatedSrcDocTransportHtmlRef.current = null;
                          }
                          if (useLazySrcDocTransport) setSrcDocShellReady(true);
                          activateLoadedSrcDocTransport(frame);
                          dcViewportRestoreAtRef.current = Date.now();
                          frame?.contentWindow?.postMessage({
                            type: '__dc_set_viewport',
                            ...dcViewportRef.current,
                          }, '*');
                          replayInspectOverridesToIframe(frame);
                          syncBridgeModes(frame);
                          // Tip-yield: sync tip rect, then async remasure on the live tip document (452/459).
                          applyTipRemountSyncHostMeasureAfterSrcDocLoadWithRetry(frame);
                          requestTipRemountRemasureAfterSrcDocLoad(frame);
                          // Sticky deck fit may arm settle while needsFit is false (464).
                          scheduleTipRemountRemasureAfterDeckHostFitSettle(
                            () => frame ?? srcDocPreviewIframeRef.current,
                          );
                          replayManualEditStylesToIframe(frame);
                          syncCachedSlideStateToIframe(frame);
                          if (effectiveDeck) {
                            if (needsDeckHostViewportFit) {
                              schedulePostDeckHostViewportUntilSized(
                                () => frame ?? srcDocPreviewIframeRef.current,
                                deckPreviewFitScale,
                                deckPreviewFitOptions,
                              );
                            }
                            scheduleDeckPreviewFitNudges(
                              () => frame ?? srcDocPreviewIframeRef.current,
                              deckPreviewFitScale,
                              deckPreviewFitOptions,
                            );
                          }
                          if (!useUrlLoadPreview) restorePreviewScrollPosition();
                        }}
                      />
                    </div>
                  </PreviewDrawOverlay>
                </div>
              </div>
              {boardMode ? (
                <CommentPreviewOverlays
                  comments={commentCreateMode ? visibleSideComments : []}
                  liveTargets={liveCommentTargets}
                  hoveredTarget={hoveredCommentTarget}
                  hoveredPodMemberId={hoveredPodMemberId}
                  activeTarget={activeCommentTarget}
                  activeExistingCommentId={activeComposerComment?.id ?? null}
                  boardTool={boardTool}
                  showActivePin={commentCreateMode}
                  scale={overlayPreviewScale}
                  offsetX={overlayPreviewTransform.offsetX}
                  offsetY={overlayPreviewTransform.offsetY}
                  strokePoints={strokePoints}
                  activeSlideIndex={effectiveDeck ? slideState?.active ?? null : null}
                  onOpenComment={(comment, snapshot) => {
                    setCommentPanelOpen(true);
                    setCommentSidePanelCollapsed(false);
                    setCommentCreateMode(true);
                    setBoardMode(true);
                    setActiveCommentTarget(snapshot);
                    setHoveredCommentTarget(snapshot);
                    setActivePreviewCommentId(comment.id);
                    setCommentDraft(comment.note);
                    setQueuedBoardNotes([]);
                    setActiveCommentExistingAttachments(comment.attachments ?? []);
                  }}
                />
              ) : null}
              {/* Portaled to <body> so the screenshot/export toast escapes the
                  preview pane's transform + overflow:hidden. */}
              {exportToast
                ? createPortal(
                    <Toast
                      message={exportToast.message}
                      tone={exportToast.tone}
                      role={exportToast.tone === 'error' ? 'alert' : 'status'}
                      // `loading` shows for the whole export (up to 8s);
                      // the browser-print fallback needs longer than the
                      // regular 2.2s success flash because the copy asks
                      // users to interact with the print dialog.
                      ttlMs={
                        exportToast.ttlMs
                          ?? (exportToast.tone === 'loading' ? 8000 : 2200)
                      }
                      placement="top"
                      onDismiss={() => setExportToast(null)}
                    />,
                    document.body,
                  )
                : null}
              {commentSavedToast ? (
                <div className="comment-toast-anchor">
                  <Toast
                    message={commentSavedToast}
                    ttlMs={2200}
                    onDismiss={() => setCommentSavedToast(null)}
                  />
                </div>
              ) : null}
              {commentErrorToast ? (
                <div className="comment-toast-anchor">
                  <Toast
                    message={commentErrorToast}
                    tone="error"
                    role="alert"
                    ttlMs={5000}
                    onDismiss={() => setCommentErrorToast(null)}
                  />
                </div>
              ) : null}
              {templateSavedToast ? (
                <div className="comment-toast-anchor">
                  <Toast
                    message={templateSavedToast}
                    ttlMs={2200}
                    onDismiss={() => setTemplateSavedToast(null)}
                  />
                </div>
              ) : null}
              {commentComposer}
              {boardMode && !commentCreateMode && hoveredCommentTarget && (!activeCommentTarget || commentPortalHost) ? (
                <AnnotationHoverPopover
                  target={hoveredCommentTarget}
                  scale={overlayPreviewScale}
                  onMouseEnter={() => {
                    hoverCardPinnedRef.current = true;
                    cancelHoverCardDismiss();
                  }}
                  onMouseLeave={() => {
                    hoverCardPinnedRef.current = false;
                    scheduleHoverCardDismiss();
                  }}
                />
              ) : null}
              {/*
                Hint banner for Inspect / Picker modes. The bridge in
                `apps/web/src/runtime/srcdoc.ts` posts `od:comment-targets`
                with every element annotated with `data-od-id` /
                `data-screen-label`, so `liveCommentTargets.size` is the
                authoritative annotation count for the current artifact.

                Two states:
                - "has targets": the existing copy ("Click any element with
                  `data-od-id` to tune its style.") for users who just don't
                  see the crosshair cursor.
                - "no targets" (issue #890): a freeform-generated artifact
                  (e.g. PRD → HTML through a Claude-Code-compatible CLI
                  without a skill) ships zero `data-od-id` annotations. The
                  bridge's click handler walks up to <html>, finds nothing,
                  and bails — clicks no-op silently. The static copy made
                  this look broken; the empty-state copy explains what's
                  missing and how to fix it. Mirrored across Inspect and
                  element-pick annotation mode because the failure surface is identical.
              */}
              {inspectMode
                && openHintBox
                && !activeInspectTarget
                && !activeCommentTarget
                && !hideUsefulTips ? (
                <div
                  className="inspect-empty-hint-container"
                  data-testid="inspect-empty-hint-container"
                >
                  {liveCommentTargets.size === 0 ? (
                    <div
                      className="inspect-empty-hint"
                      data-testid="inspect-empty-hint-no-targets"
                    >
                      {inspectMode
                        ? t('chat.inspect.noEditableTargets')
                        : t('chat.inspect.noCommentTargets')}
                    </div>
                  ) : (
                    <div
                      className="inspect-empty-hint"
                      data-testid="inspect-empty-hint"
                    >
                      {inspectMode ? t('chat.inspect.editHint') : t('chat.inspect.commentHint')}
                    </div>
                  )}
                  <button
                    type="button"
                    title={embedUiLabel('Close Inspect Hint', '검사 안내 닫기')}
                    aria-label={embedUiLabel('Close Inspect Hint', '검사 안내 닫기')}
                    onClick={() => setOpenHintBox(false)}
                    className="orbit-artifact-ghost"
                  >
                    <Icon className="" name="close" size={12} />
                  </button>
                </div>
              ) : null}
            </div>
            {boardImagePreviewModal}
            {commentPortalHost && commentSidePanel
              ? createPortal(commentSidePanel, commentPortalHost)
              : commentPortalId
                ? null
                : commentSidePanel}
            {inspectMode && activeInspectTarget ? (
              <InspectPanel
                target={activeInspectTarget}
                onApply={(prop, value) => {
                  const target = activeInspectTarget;
                  setInspectOverrides((current) =>
                    updateInspectOverride(current, target.elementId, target.selector, prop, value),
                  );
                  postInspectSet(target.elementId, target.selector, prop, value);
                }}
                onResetElement={(elementId) => {
                  setInspectOverrides((current) => {
                    if (!(elementId in current)) return current;
                    const next = { ...current };
                    delete next[elementId];
                    return next;
                  });
                  postInspectReset(elementId);
                  setActiveInspectTarget((current) => current && current.elementId === elementId
                    ? current
                    : current);
                }}
                onSaveToSource={() => {
                  void saveInspectToSource();
                }}
                onClose={() => {
                  setActiveInspectTarget(null);
                  if (boardMode && boardTool === 'inspect') {
                    setActiveCommentTarget(null);
                    setHoveredCommentTarget(null);
                  }
                }}
                saving={savingInspect}
                savedAt={inspectSavedAt}
                error={inspectError}
              />
            ) : null}
            {!hideFileRevisionChrome && revisionHistoryOpen && source !== null ? (
              <FileRevisionHistoryPanel
                revisions={revisionStack.revisions}
                cursorRevisionId={revisionStack.cursorRevisionId}
                retentionLimit={revisionRetentionLimit}
                retentionPending={revisionRetentionPending}
                busy={manualEditSaving}
                onRestore={(revision) => {
                  void restoreRevisionFromHistory(revision);
                }}
                onClose={() => setRevisionHistoryOpen(false)}
              />
            ) : null}
          </div>
        ) : (
          <pre className="viewer-source">{source}</pre>
        )}
      </div>
      {inTabPresent && source && typeof document !== 'undefined' ? createPortal(
        <div
          className="present-overlay"
          role="dialog"
          aria-label={t('fileViewer.exitPresentation')}
        >
          <button
            className="present-exit"
            onClick={() => setInTabPresent(false)}
            aria-label={t('fileViewer.exitPresentation')}
          >
            <Icon name="close" size={13} /> {t('fileViewer.exitPresentation')}
          </button>
          {useUrlLoadPreview ? (
            <iframe
              ref={presentIframeRef}
              title="present"
              sandbox="allow-scripts allow-downloads"
              data-od-render-mode="url-load"
              src={activePreviewSrcUrl}
              onLoad={(event) => {
                syncCachedSlideStateToIframe(event.currentTarget);
              }}
            />
          ) : (
            <iframe
              key={`present:${srcDocPreviewMountKey}`}
              ref={presentIframeRef}
              title="present"
              sandbox="allow-scripts allow-downloads"
              data-od-render-mode="srcdoc"
              srcDoc={srcDoc}
              onLoad={(event) => {
                syncCachedSlideStateToIframe(event.currentTarget);
              }}
            />
          )}
        </div>,
        document.body,
      ) : null}
      {imageExportModalOpen && typeof document !== 'undefined' ? createPortal(
        <div className="modal-backdrop viewer-modal-backdrop image-export-backdrop" role="presentation">
          <div
            className="modal deploy-modal image-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={imageExportTitleId}
          >
            <div className="modal-head">
              <div className="kicker">IMAGE</div>
              <h2 id={imageExportTitleId}>{t('fileViewer.exportImage')}</h2>
              <p className="subtitle">
                {t('fileViewer.exportImageModalSubtitle')}
                {effectiveDeck ? (
                  <>
                    {' '}
                    {embedUiLabel(
                      'Slide decks save only the slide you are viewing.',
                      '슬라이드 덱은 보고 있는 슬라이드 한 장만 저장됩니다.',
                    )}
                  </>
                ) : null}
              </p>
            </div>
            <div className="deploy-form image-export-form">
              <fieldset className="image-export-format-field" disabled={imageExportBusy}>
                <legend>{t('fileViewer.exportImageFormatLabel')}</legend>
                <div className="image-export-format-options">
                  {IMAGE_EXPORT_FORMAT_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`image-export-format-option${imageExportFormat === option.value ? ' active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="image-export-format"
                        value={option.value}
                        aria-label={option.label}
                        checked={imageExportFormat === option.value}
                        onChange={() => changeImageExportFormat(option.value)}
                      />
                      <span className="image-export-format-text">
                        <strong>{option.label}</strong>
                        <span aria-hidden="true">{option.extension}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {imageExportError ? (
                <p className="deploy-error" role="alert" style={{ whiteSpace: 'pre-line' }}>{imageExportError}</p>
              ) : null}
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                disabled={imageExportBusy}
                onClick={() => {
                  imageExportPrepareIdRef.current += 1;
                  setImageExportPreparing(false);
                  setImageExportModalOpen(false);
                  setImageExportError(null);
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={
                  imageExportBusy
                  || imageExportPreparing
                  || !imageExportPreparedBlob
                  || imageExportPreparedBlob.format !== imageExportFormat
                }
                onClick={() => {
                  void handleImageExportSave();
                }}
              >
                {imageExportBusy ? t('fileViewer.exportImageSaving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      <TeamverPublishDriveModal
        open={drivePublishModalOpen && isTeamverEmbedMode()}
        projectId={projectId}
        artifactFile={file.name}
        exportTitle={exportTitle}
        deck={effectiveDeck}
        allowPptx={
          effectiveDeck && isTeamverPptxExportEnabled({ embed: isTeamverEmbedMode() })
        }
        initialFormat={drivePublishInitialFormat}
        focusTargetSelectNonce={drivePublishFocusNonce}
        onClose={() => {
          setDrivePublishModalOpen(false);
          setDrivePublishInitialFormat(null);
          setDrivePublishFocusNonce(null);
        }}
        onSuccess={(meta) => {
          const toast = buildDrivePublishToastContent(
            meta.outputs,
            meta.partial,
            meta.selectedFormat,
          );
          const alternateLabel =
            toast.alternateFormat === 'pdf'
              ? 'PDF'
              : toast.alternateFormat === 'html'
                ? 'HTML'
                : 'PPTX';
          const offerAlternate =
            canOfferAlternateDrivePublishFormat(toast.alternateFormat, projectId)
            && !(toast.alternateFormat === 'pptx' && !effectiveDeck);
          drivePublishFollowUpRef.current = offerAlternate
            ? () => openDrivePublishModal(toast.alternateFormat)
            : null;
          setDeploySavedToast({
            message: toast.message,
            detailLinks: toast.detailLinks.length > 0 ? toast.detailLinks : undefined,
            actionLabel: offerAlternate ? `${alternateLabel}로도 올리기` : undefined,
          });
        }}
        onError={(err) => setDeploySavedToast({
          message: 'Teamver 드라이브에 올리지 못했습니다',
          details: formatTeamverDesignErrorMessage(err),
        })}
      />
      {templateModalOpen && typeof document !== 'undefined' ? createPortal(
        <div className="modal-backdrop viewer-modal-backdrop" role="presentation">
          <div className="modal deploy-modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="kicker">TEMPLATE</div>
              <h2>{t('fileViewer.saveAsTemplate')}</h2>
              <p className="subtitle">{t('fileViewer.templateDescPrompt')}</p>
            </div>
            <div className="deploy-form">
              <label className="field" htmlFor={templateNameId}>
                <span className="field-label">{t('fileViewer.templateNamePrompt')}</span>
                <input
                  id={templateNameId}
                  type="text"
                  value={templateName}
                  placeholder={t('fileViewer.templateNameDefault')}
                  autoFocus
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </label>
              <label className="field" htmlFor={templateDescriptionId}>
                <span className="field-label">{t('fileViewer.templateDescPrompt')}</span>
                <textarea
                  id={templateDescriptionId}
                  rows={3}
                  value={templateDescription}
                  placeholder={t('fileViewer.optional')}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                />
              </label>
              {templateSaveError ? <p className="deploy-error">{templateSaveError}</p> : null}
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                disabled={savingTemplate}
                onClick={() => {
                  setTemplateModalOpen(false);
                  setTemplateSaveError(null);
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={savingTemplate || !templateName.trim()}
                onClick={() => {
                  void handleSaveAsTemplate();
                }}
              >
                {savingTemplate ? t('fileViewer.savingTemplate') : t('common.save')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {deployModalOpen && typeof document !== 'undefined' ? createPortal(
        <div
          className="modal-backdrop viewer-modal-backdrop deploy-flow-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDeployModal();
          }}
        >
          <div className="modal deploy-modal deploy-flow-modal" role="dialog" aria-modal="true">
            <div className="deploy-flow-modal__scroll">
              <div className="modal-head">
                <div className="kicker">{deployProviderLabel}</div>
                <h2>{t('fileViewer.deployToProvider', { provider: deployProviderLabel })}</h2>
                <p className="subtitle">{t('fileViewer.deployModalSubtitle')}</p>
              </div>
              <div className="deploy-form">
                <div className={`deploy-social-share${activeProjectSocialShare ? '' : ' is-locked'}${socialShareBlockedState ? ` is-${socialShareBlockedState}` : ''}`}>
                  <div className="deploy-social-share__head">
                    <div className="deploy-social-share__label">
                      {t('socialShare.projectSection')}
                    </div>
                    {socialShareDisplayUrl ? (
                      <a
                        className="deploy-social-share__url"
                        href={socialShareDisplayUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {socialShareDisplayUrl}
                      </a>
                    ) : null}
                  </div>
                  {!activeProjectSocialShare || socialShareBlockedState ? (
                    <p className="hint">{socialShareUnavailableMessage}</p>
                  ) : null}
                  {activeProjectSocialShare ? (
                    <SocialShareGrid
                      share={activeProjectSocialShare}
                      onAfterShare={closeDeployModal}
                    />
                  ) : null}
                  {socialShareBlockedDeployment?.url ? (
                    <div className="deploy-social-share__actions">
                      <button
                        type="button"
                        className="viewer-action"
                        onClick={() => {
                          void copyDeployLink(socialShareBlockedDeployment.url);
                        }}
                      >
                        <Icon name="copy" size={14} />
                        <span>{copyDeployLabel(socialShareBlockedDeployment.url)}</span>
                      </button>
                      {activeDeployment?.id === socialShareBlockedDeployment.id ? (
                        <button
                          type="button"
                          className="viewer-action"
                          disabled={deployPhase === 'preparing-link'}
                          onClick={() => {
                            void retryDeploymentLink();
                          }}
                        >
                          {deployPhase === 'preparing-link'
                            ? t('fileViewer.preparingPublicLink')
                            : t('fileViewer.retryLink')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              <label className="deploy-provider-field">
                <span className="deploy-field-title">{t('fileViewer.deployProviderLabel')}</span>
                <select
                  value={deployProviderId}
                  onChange={(e) => {
                    void changeDeployProvider(e.target.value as WebDeployProviderId);
                  }}
                >
                  {DEPLOY_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-label-row deploy-token-label-row">
                <label htmlFor="deploy-token" className="deploy-field-title required">{t(deployProvider.tokenLabelKey)}</label>
                <a
                  href={deployProvider.tokenLink}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t(deployProvider.tokenLinkKey)}
                </a>
              </div>
              <div className="deploy-token-input-row">
                <input
                  ref={deployTokenInputRef}
                  id="deploy-token"
                  type="password"
                  value={deployToken}
                  placeholder={t(deployProvider.tokenPlaceholderKey, { provider: deployProviderLabel })}
                  onChange={(e) => setDeployToken(e.target.value)}
                />
                <button
                  type="button"
                  className="ghost-link button-like"
                  disabled={savingDeployConfig}
                  onClick={() => {
                    void saveDeployConfig();
                  }}
                >
                  {savingDeployConfig ? t('fileViewer.savingConfig') : t('fileViewer.save')}
                </button>
              </div>
              {deployConfig?.configured || deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
                <div className="deploy-token-hints">
                  {deployConfig?.configured ? (
                    <p className="hint">{t(deployProvider.tokenReuseHintKey, { provider: deployProviderLabel })}</p>
                  ) : null}
                  {deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
                    <p className="hint">{t('fileViewer.cloudflareApiTokenScopeHint')}</p>
                  ) : null}
                </div>
              ) : null}
              {deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
                <>
                  <div className="deploy-field-grid single-field">
                    <label>
                      <span className="deploy-field-title required">{t('fileViewer.cloudflareAccountId')}</span>
                      <input
                        value={cloudflareAccountId}
                        onChange={(e) => setCloudflareAccountId(e.target.value)}
                      />
                      <span className="field-hint">{t('fileViewer.cloudflareAccountIdHint')}</span>
                    </label>
                  </div>
                  <div className="deploy-field-grid cloudflare-domain-grid">
                    <label>
                      <span className="deploy-field-title">{t('fileViewer.cloudflareDomainPrefixLabel')}</span>
                      <input
                        value={cloudflareDomainPrefix}
                        placeholder={t('fileViewer.cloudflareDomainPrefixPlaceholder')}
                        onChange={(e) => setCloudflareDomainPrefix(e.target.value)}
                      />
                    </label>
                    <div className="deploy-field-control">
                      <span className="deploy-field-title-row">
                        <label className="deploy-field-title" htmlFor="cloudflare-zone-select">
                          {t('fileViewer.cloudflareZoneLabel')}
                        </label>
                        <button
                          type="button"
                          className="ghost-link deploy-field-inline-action"
                          disabled={cloudflareZonesLoading || !deployConfig?.configured}
                          onClick={() => {
                            void loadCloudflareZones();
                          }}
                        >
                          <RemixIcon name="refresh-line" size={13} />
                          {cloudflareZonesLoading ? t('fileViewer.cloudflareZonesLoading') : t('fileViewer.cloudflareZonesRefresh')}
                        </button>
                      </span>
                      <select
                        id="cloudflare-zone-select"
                        value={cloudflareZoneId}
                        disabled={cloudflareZonesLoading || (!deployConfig?.configured && !cloudflareZones.length)}
                        onChange={(e) => setCloudflareZoneId(e.target.value)}
                      >
                        {cloudflareZones.length === 0 ? (
                          <option value="">{t('fileViewer.cloudflareZonePlaceholder')}</option>
                        ) : null}
                        {cloudflareZones.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {cloudflareZonesError ? (
                    <p className="deploy-error">{cloudflareZonesError}</p>
                  ) : cloudflareZonesLoading ? (
                    <p className="hint">{t('fileViewer.cloudflareZonesLoading')}</p>
                  ) : deployConfig?.configured && cloudflareZones.length === 0 ? (
                    <p className="hint">{t('fileViewer.cloudflareZonesEmpty')}</p>
                  ) : null}
                  {cloudflareDomainPrefix.trim() && !isValidCloudflareDomainPrefixInput(cloudflareDomainPrefix) ? (
                    <p className="deploy-error">{t('fileViewer.cloudflareDomainPrefixInvalid')}</p>
                  ) : cloudflareHostnamePreview ? (
                    <p className="hint">
                      {t('fileViewer.cloudflareHostnamePreview', { hostname: cloudflareHostnamePreview })}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="deploy-field-grid">
                  <label>
                    <span className="deploy-field-title">{t('fileViewer.vercelTeamId')}</span>
                    <input
                      value={teamId}
                      placeholder={t('fileViewer.optional')}
                      onChange={(e) => setTeamId(e.target.value)}
                    />
                  </label>
                  <label>
                    <span className="deploy-field-title">{t('fileViewer.vercelTeamSlug')}</span>
                    <input
                      value={teamSlug}
                      placeholder={t('fileViewer.optional')}
                      onChange={(e) => setTeamSlug(e.target.value)}
                    />
                  </label>
                </div>
              )}
              {deployError ? <p className="deploy-error">{deployError}</p> : null}
              {!deployError
                && deployPhase === 'idle'
                && deployResultCards.length > 0
                && deployResultState(activeDeployment?.status) === 'ready' ? (
                <p className="hint" role="status">
                  {t('fileViewer.deployLinkReady')} · {t('fileViewer.deployResultLabel')}
                </p>
              ) : null}
              {deployResultCards.length > 0 ? (
                <div className={`deploy-result-block ${deployResultState(activeDeployment?.status)}`}>
                  <div className="deploy-result-summary">
                    <div className="deploy-result-summary-head">
                      <div className="deploy-result-label">{t('fileViewer.deployResultLabel')}</div>
                      <div className={`deploy-result-badge ${deployResultState(activeDeployment?.status)}`}>
                        {statusLabelFor(deployResultState(activeDeployment?.status))}
                      </div>
                    </div>
                    {activeDeployment?.statusMessage ? (
                      <p className="deploy-result-message">{activeDeployment.statusMessage}</p>
                    ) : null}
                    <div className="deploy-result-links">
                      {deployResultCards.map((card) => {
                        const state = deployResultState(card.status);
                        const canRetry = state === 'delayed' || state === 'protected';
                        const isDisabled = state === 'protected' || state === 'failed';
                        return (
                          <div key={card.id} className={`deploy-result-link ${state}`}>
                            <div className="deploy-result-link-main">
                              <div className="deploy-result-link-head">
                                <span className="deploy-result-link-label">{card.label}</span>
                                <span className={`deploy-result-link-state ${state}`}>{statusLabelFor(state)}</span>
                              </div>
                              {card.message ? (
                                <p className="deploy-result-link-message">{card.message}</p>
                              ) : null}
                              <a
                                className="deploy-result-url"
                                href={card.url}
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {card.url}
                              </a>
                            </div>
                            <div className="deploy-result-actions">
                              {canRetry ? (
                                <button
                                  type="button"
                                  className="viewer-action"
                                  disabled={deployPhase === 'preparing-link'}
                                  onClick={() => {
                                    void retryDeploymentLink();
                                  }}
                                >
                                  {deployPhase === 'preparing-link'
                                    ? t('fileViewer.preparingPublicLink')
                                    : t('fileViewer.retryLink')}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="viewer-action"
                                onClick={() => {
                                  void copyDeployLink(card.url);
                                }}
                              >
                                <Icon name="copy" size={14} />
                                <span>{copyDeployLabel(card.url)}</span>
                              </button>
                              <a
                                className={`ghost-link ${isDisabled ? 'disabled' : ''}`}
                                href={isDisabled ? undefined : card.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                aria-disabled={isDisabled}
                              >
                                <Icon name="upload" size={14} />
                                {t('fileViewer.open')}
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                onClick={closeDeployModal}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={deploying || savingDeployConfig || deployPhase !== 'idle'}
                onClick={() => {
                  void deployToSelectedProvider();
                }}
              >
                {deployButtonLabel}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {deploySavedToast ? (
        <Toast
          message={deploySavedToast.message}
          details={deploySavedToast.details}
          detailsHref={deploySavedToast.detailsHref}
          detailLinks={deploySavedToast.detailLinks}
          tone="success"
          placement="top"
          ttlMs={3600}
          actionLabel={deploySavedToast.actionLabel}
          onAction={() => {
            drivePublishFollowUpRef.current?.();
          }}
          onDismiss={() => {
            drivePublishFollowUpRef.current = null;
            setDeploySavedToast(null);
          }}
        />
      ) : null}
      {deployActionToast && typeof document !== 'undefined' ? createPortal(
        <Toast
          message={deployActionToast}
          placement="top"
          ttlMs={2400}
          role="alert"
          onDismiss={() => setDeployActionToast(null)}
        />,
        document.body,
      ) : null}
      {revisionDiskSyncToast && typeof document !== 'undefined' ? createPortal(
        <Toast
          message={revisionDiskSyncToast}
          placement="top"
          ttlMs={0}
          role="alert"
          tone="error"
          actionLabel={revisionDiskSyncRetryLabelRef.current}
          onAction={() => {
            void retryPendingRevisionDiskSync();
          }}
          onDismiss={dismissRevisionDiskSyncToast}
        />,
        document.body,
      ) : null}
      {revisionConflictToast && typeof document !== 'undefined' ? createPortal(
        <Toast
          message={revisionConflictToast}
          placement="top"
          ttlMs={5000}
          role="alert"
          tone="error"
          onDismiss={dismissRevisionConflictToast}
        />,
        document.body,
      ) : null}
      {imageExportSavedToast ? (
        <Toast
          message={imageExportSavedToast.message}
          details={imageExportSavedToast.details}
          tone="success"
          placement="top"
          ttlMs={3600}
          onDismiss={() => setImageExportSavedToast(null)}
        />
      ) : null}
      {shareGuideToast && typeof document !== 'undefined' ? createPortal(
        <Toast
          message={shareGuideToast}
          placement="top"
          ttlMs={2200}
          onDismiss={() => setShareGuideToast(null)}
        />,
        document.body,
      ) : null}
    </div>
  );
}

function baseDirFor(fileName: string): string {
  const idx = fileName.lastIndexOf('/');
  return idx >= 0 ? fileName.slice(0, idx + 1) : '';
}

function toOwnerRelativePath(ownerFileName: string, targetPath: string): string {
  const nfcSegment = (value: string) => {
    try {
      return value.normalize('NFC');
    } catch {
      return value;
    }
  };
  const normalize = (value: string) => decodeURIComponent(value).replace(/^\/+/, '');
  const squash = (parts: string[]) => {
    const out: string[] = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (out.length > 0) out.pop();
        continue;
      }
      out.push(part);
    }
    return out;
  };
  const ownerDirPath = normalize(baseDirFor(ownerFileName));
  const targetFilePath = normalize(targetPath);
  const ownerParts = squash(ownerDirPath.split('/'));
  const targetParts = squash(targetFilePath.split('/'));

  let common = 0;
  while (
    common < ownerParts.length &&
    common < targetParts.length &&
    // NFC-tolerant segment compare: owner file may be NFD on disk while the
    // target upload came in as NFC — byte-exact `===` split the common
    // prefix at the wrong depth and produced a wrong-directory `../` walk.
    nfcSegment(ownerParts[common]!) === nfcSegment(targetParts[common]!)
  ) {
    common += 1;
  }

  const up = new Array(ownerParts.length - common).fill('..');
  const down = targetParts.slice(common);
  const rel = [...up, ...down].join('/');
  return rel || '.';
}

function isBlockedPreviewAssetScheme(assetRef: string): boolean {
  const clean = assetRef.replace(/[\s\u0000-\u001F\u007F-\u009F]/g, '');
  return /^(?:javascript|data):/i.test(clean);
}

function hasRelativeAssetRefs(html: string): boolean {
  const attr = /\s(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = attr.exec(html)) !== null) {
    const value = match[1]?.trim();
    if (!value) continue;
    if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(value)) continue;
    return true;
  }
  return false;
}

/**
 * Cheap content fingerprint (length + first / last 64 chars) used as the
 * cache-bust suffix for the deck-preview inline-assets fetch. Manual Edit
 * set-image / element-patch saves update `source` locally before the
 * /files list refresh bumps `file.mtime`, so a mtime-only key hits the
 * browser cache and paints a stale inlined deck.
 */
function manualEditPreviewInlineContentKey(source: string): string {
  const value = String(source ?? '');
  const head = value.length > 64 ? value.slice(0, 64) : value;
  const tail = value.length > 64 ? value.slice(-64) : '';
  // Percent-encode any non-ASCII so the value is safe to stuff into a query
  // string (matches how the rest of `cacheBust` values are serialized).
  return `${value.length}-${encodeURIComponent(head + tail).slice(0, 96)}`;
}

/**
 * True when the HTML has at least one `<img src="…">` (or CSS `url(…)`) that
 * is a relative path — the kind that the daemon-side inline pass can turn
 * into a `data:` URI. Used to decide whether it's worth doing the extra
 * `?inlineAssets=1` round trip for deck previews.
 */
function hasRelativeImageRefs(html: string): boolean {
  const imgRe = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  const cssUrlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  const isRelative = (value: string | undefined): boolean => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return false;
    if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/\/)/i.test(trimmed)) return false;
    if (trimmed.startsWith('/api/')) return false;
    return true;
  };
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(html)) !== null) {
    if (isRelative(match[1])) return true;
  }
  while ((match = cssUrlRe.exec(html)) !== null) {
    if (isRelative(match[1])) return true;
  }
  return false;
}

async function inlineRelativeAssets(
  html: string,
  projectId: string,
  fileName: string,
): Promise<string> {
  const replacements: Array<Promise<{ from: string; to: string } | null>> = [];
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = readHtmlAttr(tag, 'rel');
    const href = readHtmlAttr(tag, 'href');
    if (!rel || !/\bstylesheet\b/i.test(rel) || !href) continue;
    replacements.push(
      fetchProjectRelativeText(projectId, fileName, href).then((css) =>
        css == null
          ? null
          : {
              from: tag,
              to:
                `<style data-od-inline-asset="${escapeHtmlAttr(href)}">\n` +
                `${css.replace(/<\/style/gi, '<\\/style')}\n</style>`,
            },
      ),
    );
  }

  const scripts = html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi) ?? [];
  for (const tag of scripts) {
    const src = readHtmlAttr(tag, 'src');
    if (!src) continue;
    replacements.push(
      fetchProjectRelativeText(projectId, fileName, src).then((js) => {
        if (js == null) return null;
        const open = tag.match(/^<script\b[^>]*>/i)?.[0] ?? '<script>';
        const attrs = open
          .replace(/^<script/i, '')
          .replace(/>$/i, '')
          .replace(/\ssrc\s*=\s*(['"])[\s\S]*?\1/i, '');
        return {
          from: tag,
          to: `<script${attrs}>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`,
        };
      }),
    );
  }

  const resolved = (await Promise.all(replacements)).filter(
    (item): item is { from: string; to: string } => item !== null,
  );
  return resolved.reduce((next, { from, to }) => next.replace(from, () => to), html);
}

async function fetchProjectRelativeText(
  projectId: string,
  ownerFileName: string,
  assetRef: string,
): Promise<string | null> {
  const filePath = resolveProjectRelativePath(ownerFileName, assetRef);
  if (!filePath) return null;
  // Probe NFC and NFD forms so macOS-uploaded relative asset paths (NFD) still
  // resolve when the deck / owner HTML references NFC (typical model output).
  const candidates: string[] = [filePath];
  try {
    const nfc = filePath.normalize('NFC');
    if (nfc !== filePath) candidates.push(nfc);
  } catch { /* ignore */ }
  try {
    const nfd = filePath.normalize('NFD');
    if (nfd !== filePath && !candidates.includes(nfd)) candidates.push(nfd);
  } catch { /* ignore */ }
  for (const candidate of candidates) {
    try {
      // Teamver embed needs daemon auth / workspace / S3-prefix headers and
      // 401 recovery — plain fetch() silently fails after auth races.
      const resp = await fetchTeamverDaemon(projectRawUrl(projectId, candidate), {
        cache: 'no-store',
        teamverProjectId: projectId,
      });
      if (resp.ok) return await resp.text();
    } catch {
      // Continue to the next candidate.
    }
  }
  return null;
}

function resolveProjectRelativePath(ownerFileName: string, assetRef: string): string | null {
  if (isBlockedPreviewAssetScheme(assetRef)) return null;
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(assetRef)) return null;
  try {
    const url = new URL(assetRef, `https://od.local/${baseDirFor(ownerFileName)}`);
    if (url.origin !== 'https://od.local') return null;
    const decodedPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const parts = decodedPath.split(/[/\\]/);
    if (parts.some((part) => part === '..' || part.trim() === '..')) return null;
    return decodedPath;
  } catch {
    return null;
  }
}

function readHtmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function openImageViewerUrl(url: string): void {
  // Popup-blocker friendly path: synthesize an anchor with target=_blank and
  // click it inside the same user gesture. Falls back to `window.open` when
  // the anchor click is silently swallowed (e.g. some embed sandboxes).
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  try {
    link.click();
  } catch {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) {
      try {
        win.opener = null;
      } catch {
        /* some browsers throw on cross-origin opener reset */
      }
    }
  } finally {
    link.remove();
  }
}

function triggerBlobDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** @internal exported for ImageViewer open/download wiring tests */
export function imageViewerCanOpen(input: {
  useAuthenticatedFetch: boolean;
  signedLoading: boolean;
  signedSrc: string | null;
  busy: boolean;
}): boolean {
  if (input.busy) return false;
  if (!input.useAuthenticatedFetch) return true;
  if (input.signedSrc) return true;
  // Presign finished (ready/disabled/failed) — Open can fall back to a
  // one-shot authenticated blob fetch on click.
  return !input.signedLoading;
}

function ImageViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useTeamverT();
  const filePath = projectFileResolvedPath(file);
  const useAuthFetch = shouldUseTeamverAuthenticatedProjectRawFetch();
  // Session-gated S3 GET for Open — do not eagerly daemon-proxy bytes just
  // because the image viewer mounted. Download fetches a blob on click so the
  // browser can honor the `download` filename attribute.
  const signed = useProjectFileSignedUrl(
    useAuthFetch ? projectId : null,
    useAuthFetch ? filePath : null,
    Math.round(file.mtime),
    { trustExists: true },
  );
  const [busyOpen, setBusyOpen] = useState(false);
  const [busyDownload, setBusyDownload] = useState(false);
  const directRawUrl = `${projectFileUrl(projectId, filePath)}?v=${Math.round(file.mtime)}`;
  const canOpen = imageViewerCanOpen({
    useAuthenticatedFetch: useAuthFetch,
    signedLoading: signed.loading,
    signedSrc: signed.src,
    busy: busyOpen,
  });
  const canDownload = !busyDownload;

  const openInNewTab = async () => {
    if (!canOpen) return;
    if (!useAuthFetch) {
      openImageViewerUrl(directRawUrl);
      return;
    }
    if (signed.src) {
      openImageViewerUrl(signed.src);
      return;
    }
    setBusyOpen(true);
    try {
      const blob = await loadAuthenticatedProjectFileBlob(projectId, filePath, {
        trustExists: true,
        allowBackgroundRetry: true,
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      openImageViewerUrl(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusyOpen(false);
    }
  };

  const downloadBlob = async () => {
    if (!canDownload) return;
    setBusyDownload(true);
    try {
      if (!useAuthFetch) {
        triggerBlobDownload(directRawUrl, file.name);
        return;
      }
      const blob = await loadAuthenticatedProjectFileBlob(projectId, filePath, {
        trustExists: true,
        allowBackgroundRetry: true,
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      try {
        triggerBlobDownload(url, file.name);
      } finally {
        URL.revokeObjectURL(url);
      }
    } finally {
      setBusyDownload(false);
    }
  };

  return (
    <div className="viewer image-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {file.kind === 'sketch'
              ? t('fileViewer.sketchMeta', { size: humanSize(file.size) })
              : t('fileViewer.imageMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <div className="viewer-toolbar-actions">
          <button
            type="button"
            className="ghost-link"
            onClick={() => { void downloadBlob(); }}
            disabled={!canDownload}
          >
            {t('fileViewer.download')}
          </button>
          <button
            type="button"
            className="ghost-link"
            onClick={() => { void openInNewTab(); }}
            disabled={!canOpen}
          >
            {t('fileViewer.open')}
          </button>
        </div>
      </div>
      <div className="viewer-body image-body">
        <AuthenticatedProjectFileImage
          projectId={projectId}
          path={filePath}
          alt=""
          rev={Math.round(file.mtime)}
          trustExists
          allowBackgroundRetry
        />
      </div>
    </div>
  );
}

function SketchViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useTeamverT();
  return (
    <div className="viewer image-viewer sketch-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.sketchMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body image-body">
        <SketchPreview projectId={projectId} file={file} className="viewer-sketch-preview" />
      </div>
    </div>
  );
}

function VideoViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useTeamverT();
  const url = `${projectFileUrl(projectId, file.name)}?v=${Math.round(file.mtime)}`;
  return (
    <div className="viewer video-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.videoMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body video-body">
        <video src={url} controls playsInline preload="metadata" />
      </div>
    </div>
  );
}

function AudioViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useTeamverT();
  const url = `${projectFileUrl(projectId, file.name)}?v=${Math.round(file.mtime)}`;
  return (
    <div className="viewer audio-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.audioMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body audio-body">
        <div className="audio-card">
          <Icon name="mic" size={28} />
          <div className="audio-card-name">{file.name}</div>
          <audio src={url} controls preload="metadata" />
        </div>
      </div>
    </div>
  );
}

type SvgViewerMode = 'preview' | 'source';

interface SvgViewerProps {
  projectId: string;
  file: ProjectFile;
  initialMode?: SvgViewerMode;
  initialSource?: string | null | undefined;
}

export function SvgViewer({
  projectId,
  file,
  initialMode = 'preview',
  initialSource,
}: SvgViewerProps) {
  const t = useTeamverT();
  const [mode, setMode] = useState<SvgViewerMode>(initialMode);
  const [source, setSource] = useState<string | null>(initialSource ?? null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (mode !== 'source') return;
    if (initialSource !== undefined && reloadKey === 0) return;
    let cancelled = false;
    setLoadingSource(true);
    setSourceError(false);
    void fetchProjectFileText(projectId, file.name, {
      cache: 'no-store',
      cacheBustKey: `${Math.round(file.mtime)}-${reloadKey}`,
    }).then((next) => {
      if (cancelled) return;
      if (next === null) {
        setSource('');
        setSourceError(true);
      } else {
        setSource(next);
      }
      setLoadingSource(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, initialSource, mode, reloadKey]);

  return (
    <div className="viewer svg-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.imageMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            <button
              type="button"
              className={`viewer-tab ${mode === 'preview' ? 'active' : ''}`}
              aria-pressed={mode === 'preview'}
              onClick={() => setMode('preview')}
            >
              {t('fileViewer.preview')}
            </button>
            <button
              type="button"
              className={`viewer-tab ${mode === 'source' ? 'active' : ''}`}
              aria-pressed={mode === 'source'}
              onClick={() => setMode('source')}
            >
              {t('fileViewer.source')}
            </button>
          </div>
          <span className="viewer-divider" aria-hidden />
          <button
            type="button"
            className="viewer-action"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reloadDisk')}
          >
            <Icon name="reload" size={13} />
            <span>{t('fileViewer.reload')}</span>
          </button>
          <a
            className="ghost-link"
            href={projectFileUrl(projectId, file.name)}
            download={file.name}
          >
            {t('fileViewer.download')}
          </a>
          <a
            className="ghost-link"
            href={projectFileUrl(projectId, file.name)}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('fileViewer.open')}
          </a>
        </div>
      </div>
      <div className={`viewer-body ${mode === 'preview' ? 'image-body' : ''}`}>
        {mode === 'preview' ? (
          <AuthenticatedProjectFileImage
            projectId={projectId}
            path={projectFileResolvedPath(file)}
            alt=""
            rev={`${Math.round(file.mtime)}-${reloadKey}`}
            trustExists
            allowBackgroundRetry
          />
        ) : loadingSource ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : sourceError ? (
          <div className="viewer-empty">{t('fileViewer.previewUnavailable')}</div>
        ) : (
          <pre className="viewer-source">{source ?? ''}</pre>
        )}
      </div>
    </div>
  );
}

function TextViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useTeamverT();
  const [text, setText] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setText(null);
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name).then((t) => {
      if (!cancelled) setText(t ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, reloadKey]);

  async function copy() {
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  const displayText = useMemo(
    () => (text == null ? null : formatJsonFileTextForDisplay(file, text)),
    [file.name, file.mime, text],
  );
  const lineCount = displayText ? displayText.split('\n').length : 0;

  return (
    <div className="viewer text-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left" />
        <div className="viewer-toolbar-actions">
          <button
            type="button"
            className="viewer-action"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reloadDisk')}
          >
            <Icon name="reload" size={13} />
            <span>{t('fileViewer.reload')}</span>
          </button>
          <button
            type="button"
            className="viewer-action"
            disabled
            title={t('fileViewer.saveDisabled')}
          >
            <Icon name="check" size={13} />
            <span>{t('fileViewer.save')}</span>
          </button>
          <button
            type="button"
            className="viewer-action"
            onClick={() => void copy()}
            title={t('fileViewer.copyTitle')}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
            <span>{copied ? t('fileViewer.copied') : t('fileViewer.copy')}</span>
          </button>
        </div>
      </div>
      <div className="viewer-body">
        {text === null ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : displayText !== null && lineCount > 0 ? (
          <CodeWithLines text={displayText} />
        ) : (
          <pre className="viewer-source">{displayText}</pre>
        )}
      </div>
    </div>
  );
}

function formatJsonFileTextForDisplay(file: ProjectFile, text: string): string {
  if (!isJsonFile(file)) return text;
  try {
    if (hasPrecisionSensitiveJsonNumberText(text)) return text;
    const parsed = JSON.parse(text) as unknown;
    if (hasUnsafeJsonNumber(parsed)) return text;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

function hasPrecisionSensitiveJsonNumberText(text: string): boolean {
  let inString = false;
  let escaped = false;
  const numberTokenPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      i += 1;
      continue;
    }

    numberTokenPattern.lastIndex = i;
    const match = numberTokenPattern.exec(text);
    if (!match) {
      i += 1;
      continue;
    }

    const token = match[0];
    if (isSignedNegativeZeroJsonNumberToken(token)) return true;
    if (/[.eE]/.test(token) && isPrecisionSensitiveJsonNumberToken(token)) return true;
    i = numberTokenPattern.lastIndex;
  }
  return false;
}

function isSignedNegativeZeroJsonNumberToken(token: string): boolean {
  return /^-0(?:\.0+)?(?:[eE][+-]?\d+)?$/.test(token);
}

function isPrecisionSensitiveJsonNumberToken(token: string): boolean {
  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return true;
  const rendered = JSON.stringify(parsed);
  if (!rendered) return true;
  const originalValue = parseJsonNumberTokenAsDecimal(token);
  const renderedValue = parseJsonNumberTokenAsDecimal(rendered);
  return (
    !originalValue ||
    !renderedValue ||
    originalValue.coefficient !== renderedValue.coefficient ||
    originalValue.exponent !== renderedValue.exponent
  );
}

function parseJsonNumberTokenAsDecimal(token: string): { coefficient: bigint; exponent: number } | null {
  const match = /^(-)?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) return null;
  const [, sign, integerPart, fractionPart = '', exponentPart = '0'] = match;
  const coefficient = BigInt(`${sign ?? ''}${integerPart}${fractionPart}`);
  const exponent = Number(exponentPart) - fractionPart.length;
  return normalizeDecimalParts(coefficient, exponent);
}

function normalizeDecimalParts(coefficient: bigint, exponent: number): { coefficient: bigint; exponent: number } {
  if (coefficient === 0n) return { coefficient: 0n, exponent: 0 };
  let normalizedCoefficient = coefficient;
  let normalizedExponent = exponent;
  while (normalizedCoefficient % 10n === 0n) {
    normalizedCoefficient /= 10n;
    normalizedExponent += 1;
  }
  return { coefficient: normalizedCoefficient, exponent: normalizedExponent };
}

function hasUnsafeJsonNumber(value: unknown): boolean {
  if (typeof value === 'number') {
    return !Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value));
  }
  if (Array.isArray(value)) return value.some(hasUnsafeJsonNumber);
  if (value && typeof value === 'object') return Object.values(value).some(hasUnsafeJsonNumber);
  return false;
}

function isJsonFile(file: ProjectFile): boolean {
  return file.name.toLowerCase().endsWith('.json') || file.mime.toLowerCase().startsWith('application/json');
}

function MarkdownViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useTeamverT();
  const [text, setText] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const markdownArticleRef = useRef<HTMLElement | null>(null);
  const copyBlockTimerRef = useRef<number | null>(null);
  const copiedMarkdownBlockRef = useRef<HTMLElement | null>(null);
  const status = file.artifactManifest?.status ?? 'complete';
  const isStreaming = status === 'streaming';
  const isError = status === 'error';
  const exportTitle = file.name.replace(/\.mdx?$/i, '') || file.name;

  useEffect(() => {
    setText(null);
    copiedMarkdownBlockRef.current = null;
    if (copyBlockTimerRef.current) {
      window.clearTimeout(copyBlockTimerRef.current);
      copyBlockTimerRef.current = null;
    }
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name).then((next) => {
      if (!cancelled) setText(next ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, reloadKey]);

  useEffect(() => {
    return () => {
      copiedMarkdownBlockRef.current = null;
      if (copyBlockTimerRef.current) {
        window.clearTimeout(copyBlockTimerRef.current);
      }
    };
  }, []);

  async function copy() {
    if (text == null) return;
    const didCopy = await copyTextToClipboard(text);
    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  const html = useMemo(() => {
    if (text === null) return null;
    const renderPartial = MarkdownRenderer.renderPartial ?? renderMarkdownToSafeHtml;
    return decorateMarkdownCodeBlocks(renderPartial(text));
  }, [text]);

  useEffect(() => {
    const article = markdownArticleRef.current;
    if (!article) return;
    ensureMarkdownCodeBlockControls(article, t);
    if (copiedMarkdownBlockRef.current?.isConnected) {
      setMarkdownCodeBlockCopiedState(copiedMarkdownBlockRef.current, true, t);
    }
  }, [html, t]);

  async function handleMarkdownBodyClick(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(`button[${MARKDOWN_COPY_BLOCK_ATTR}]`);
    if (!button) return;
    const block = button.closest('.markdown-code-block');
    if (!(block instanceof HTMLElement)) return;
    const pre = block.querySelector('pre');
    if (!pre) return;
    const didCopy = await copyTextToClipboard(pre.textContent ?? '');
    if (!didCopy) return;
    if (copiedMarkdownBlockRef.current && copiedMarkdownBlockRef.current !== block) {
      setMarkdownCodeBlockCopiedState(copiedMarkdownBlockRef.current, false, t);
    }
    copiedMarkdownBlockRef.current = block;
    setMarkdownCodeBlockCopiedState(block, true, t);
    if (copyBlockTimerRef.current) {
      window.clearTimeout(copyBlockTimerRef.current);
    }
    copyBlockTimerRef.current = window.setTimeout(() => {
      if (copiedMarkdownBlockRef.current) {
        setMarkdownCodeBlockCopiedState(copiedMarkdownBlockRef.current, false, t);
      }
      copiedMarkdownBlockRef.current = null;
      copyBlockTimerRef.current = null;
    }, 1800);
  }

  return (
    <div className="viewer text-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          {isStreaming ? <span className="viewer-meta">{t('fileViewer.markdownStreamingMeta')}</span> : null}
          {isError ? <span className="viewer-meta">{t('fileViewer.markdownErrorMeta')}</span> : null}
        </div>
        <div className="viewer-toolbar-actions">
          <button
            type="button"
            className="viewer-action"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reloadDisk')}
          >
            <Icon name="reload" size={13} />
            <span>{t('fileViewer.reload')}</span>
          </button>
          <button
            type="button"
            className="viewer-action"
            onClick={() => void copy()}
            title={t('fileViewer.copyTitle')}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
            <span>{copied ? t('fileViewer.copied') : t('fileViewer.copy')}</span>
          </button>
          {text !== null ? (
            <div className="share-menu chrome-share-menu">
              <button
                type="button"
                className="viewer-action"
                aria-haspopup="menu"
                aria-expanded={downloadMenuOpen}
                aria-label={t('fileViewer.download')}
                onClick={() => setDownloadMenuOpen((v) => !v)}
              >
                <Icon name="download" size={13} />
                <span>{t('fileViewer.download')}</span>
              </button>
              {downloadMenuOpen ? (
                <div
                  className="share-menu-popover"
                  role="menu"
                  aria-label={embedUiLabel('Download and export options', '다운로드 및 내보내기')}
                >
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setDownloadMenuOpen(false);
                      exportAsMd(text, exportTitle);
                    }}
                  >
                    <span className="share-menu-icon"><RemixIcon name="file-line" size={15} /></span>
                    <span>{t('fileViewer.exportMd')}</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="viewer-body">
        {html === null ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : (
          <>
            {isStreaming ? <div className="markdown-status">{t('fileViewer.markdownStreamingStatus')}</div> : null}
            {isError ? <div className="markdown-status markdown-status-error">{t('fileViewer.markdownErrorStatus')}</div> : null}
            {/* Safe by contract: renderMarkdownToSafeHtml escapes raw HTML and rejects unsafe link protocols. */}
            <article
              ref={markdownArticleRef}
              className="markdown-rendered"
              onClick={(event) => void handleMarkdownBodyClick(event)}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function CodeWithLines({ text }: { text: string }) {
  const lines = text.split('\n');
  // Trailing newline produces a phantom empty line — keep gutter aligned.
  const gutter = lines.map((_, i) => `${i + 1}`).join('\n');
  return (
    <pre className="code-viewer">
      <code className="gutter" aria-hidden>
        {gutter}
      </code>
      <code className="lines">{text}</code>
    </pre>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function documentMetaLabel(file: ProjectFile, t: TranslateFn): string {
  if (file.kind === 'pdf') return t('fileViewer.pdfMeta');
  if (file.kind === 'document') return t('fileViewer.documentMeta');
  if (file.kind === 'presentation') return t('fileViewer.presentationMeta');
  if (file.kind === 'spreadsheet') return t('fileViewer.spreadsheetMeta');
  return t('fileViewer.binaryMeta', { size: humanSize(file.size) });
}

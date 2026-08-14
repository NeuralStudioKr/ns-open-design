'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { devLog } from '../lib/devLog';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { useI18n } from '../i18n';
import { useTeamverT } from '../teamver/branding/useTeamverT';
import { localizePluginDescription, localizePluginTitle } from './plugins-home/localization';
import type { Dict, Locale } from '../i18n/types';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { useAnalytics } from '../analytics/provider';
import {
  trackChatPanelClick,
  trackComposerBarClick,
  trackComposerSessionModeClick,
  trackDesignToolboxClick,
  trackFileUploadResult,
} from '../analytics/events';
import { sessionModeToTracking } from '@open-design/contracts/analytics';
import type {
  ComposerBarClickProps,
  DesignToolboxClickProps,
} from '@open-design/contracts/analytics';
import { deriveUploadCohort } from '../analytics/upload-tracking';
import { shouldFetchRecentLinkedDirs } from '../teamver/embedDaemonFetchPolicy';
import { uploadProjectFiles, openFolderDialog, fetchRecentLinkedDirs, pushRecentLinkedDir, dirExists } from "../providers/registry";
import { WorkingDirPicker } from './WorkingDirPicker';
import { useTeamverBranding } from '../teamver/branding/TeamverBrandingProvider';
import { embedAttachBlockReason } from '../teamver/branding/embedFileAttachPolicy';
import { resolveProjectUploadBatchErrorMessage } from '../teamver/projectUploadErrors';
import { getDesignBffClient } from '../teamver/designBffClient';
import { readActiveTeamverWorkspaceId } from '../teamver/activeTeamverWorkspace';
import { isTeamverEmbedMode, resolveTeamverDriveAssetUrl } from '../teamver/designApiBase';
import { embedUiLabel } from '../teamver/embedUiLabels';
import { AuthenticatedProjectFileImage } from './AuthenticatedProjectFileImage';
import { excludeAttachmentsBackedByVisualScreenshots, isEphemeralDrawingScreenshotPath, isRenderableImagePath, projectFilePathExists, projectFilePathsInclude, visualCommentScreenshotPaths } from '../utils/projectFilePaths';
import { mergeImageMentionAttachments } from '../utils/recoverChatAttachmentsFromMentions';
import {
  attachmentsHavePendingAnnotationPaths,
  commentAttachmentsHavePendingScreenshotPaths,
  flushPendingAnnotationUploads,
  isPendingAnnotationPath,
  pendingAnnotationPathForFile,
  remapPendingCommentScreenshotPaths,
} from '../utils/annotationPendingUpload';
import {
  shouldHideTeamverToolboxPlugin,
  shouldHideTeamverToolboxSkill,
  teamverToolboxPluginDescription,
  teamverToolboxPluginTitle,
  teamverToolboxSkillDescription,
  teamverToolboxSkillTitle,
} from '../teamver/branding/toolboxCatalogDisplay';
import {
  isTeamverEmbedDriveImportAllowed,
  isTeamverEmbedDesignSurfaceEnabled,
  subscribeTeamverDesignAccessChanged,
} from '../teamver/teamverDesignAccess';
import { subscribeTeamverWorkspaceChanged } from '../teamver/teamverWorkspaceEvents';
import {
  driveImportedToChatAttachments,
  formatDriveImportErrorForUser,
  formatTeamverDriveImportErrorMessage,
  importTeamverDriveAssets,
  type TeamverDriveImportPartialResult,
  type TeamverDriveImportAsset,
} from '../teamver/importDriveAssets';
import { teamverDriveAssetIdsFromChatAttachments } from '../teamver/driveImportAttachedIds';
import { TeamverDriveImportModal } from '../teamver/components/TeamverDriveImportModal';
import { TeamverCanvasSlideLaunchModal, type TeamverCanvasSlideLaunchSource } from '../teamver/components/TeamverCanvasSlideLaunchModal';
import {
  consumeTeamverDriveLaunchHandoff,
  readTeamverDriveLaunchHandoffAssets,
} from '../teamver/driveLaunchHandoff';
import { consumeTeamverCanvasLaunchHandoff } from '../teamver/canvasLaunchHandoff';
import {
  CANVAS_CREATE_SLIDES_PLUGIN_ID,
  DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
  canvasCreateSlidesPluginInputs,
  canvasCreateSlidesRunPrompt,
  canvasCreateSlidesSourceBrief,
  canvasSlideQuickLengthToSlideCount,
  buildSlideOnlyDeckTemplateCreateBinding,
  canvasCreateSlidesTurnMeta,
  driveCreateSlidesSourceBrief,
  fetchCanvasSlideTemplatePlugins,
  isExplicitCanvasSlideVisualTemplate,
  readTeamverCreateSlidesLaunchFromUrl,
  resolveCanvasSlideTemplate,
  type CanvasSlideQuickSettings,
} from '../teamver/canvasSlideLaunch';
import { seedTemplateClonedDeck } from '../teamver/seedTemplateClonedDeck';
import { buildTemplateCloneContentFillSeed } from '../teamver/templateCloneContentFill';
import { useCanvasSlideLaunchTemplates } from '../teamver/hooks/useCanvasSlideLaunchTemplates';
import {
  canvasImportedToChatAttachments,
  formatTeamverCanvasImportErrorMessage,
  importTeamverCanvas,
} from '../teamver/importCanvas';
import {
  redirectToTeamverLoginFromEmbed,
} from '../teamver/teamverBffAuthError';
import { isMainSsoRequiredError, isMainSsoUserMismatchError } from '../teamver/teamverMainSsoGate';
import { beginMainSsoMismatchRecovery } from '../teamver/mainSsoMismatchRecovery';
import { mayMutateProjectLinkedDirs } from '../teamver/embedLocalWorkspacePolicy';
import { visibleDesignToolboxActions, pluginsForSlideOnlyMvp, skillsForSlideOnlyMvp } from '../teamver/branding/slideOnlyMvpPolicy';
import { embedBlockedComposerSlashReason, embedSlideOnlyOutboundBlockReason } from '../teamver/branding/embedSlideOnlyOutboundGuard';
import { fetchAppliedPluginSnapshot, patchProject } from "../state/projects";
import { fetchMcpServers } from "../state/mcp";
import type { McpServerConfig, McpTemplate } from "../state/mcp";
import type { AppConfig, ChatAttachment, ChatCommentAttachment, Project, ProjectFile, ProjectMetadata, SkillSummary } from "../types";
import type {
  ContextItem,
  AppliedPluginSnapshot,
  ChatSessionMode,
  ConnectorDetail,
  InstalledPluginRecord,
  PluginSourceKind,
  ProjectContextConnectorRef,
  ProjectContextMcpServerRef,
  ResearchOptions,
  RunContextSelection,
  WorkspaceContextItem,
} from '@open-design/contracts';
import {
  buildVisualAnnotationAttachment,
  commentTargetDisplayName,
  COMMENT_ONLY_USER_PLACEHOLDER,
  dedupeCommentAttachments,
} from '../comments';
import { isVisualCommentAttachment } from '../edit-mode/scoped-deck-patch';
import { Icon, type IconName } from "./Icon";
import { SessionModeToggle } from './SessionModeToggle';
import { VisualCommentAttachmentChip } from './VisualCommentAttachmentChip';
import { ComposerPlusMenu } from './ComposerPlusMenu';
import {
  DESIGN_TOOLBOX_ACTIONS,
  designToolboxActionBadge,
  designToolboxActionDescription,
  designToolboxActionMatchesQuery,
  designToolboxActionTitle,
  findDesignToolboxSkill,
  getDesignToolboxAction,
  skillMatchesQuery,
  type DesignToolboxAction,
  type DesignToolboxActionId,
} from '../runtime/design-toolbox';
import { ComposerPluginPreview } from './ComposerPluginPreview';
import { computeToolboxDetailPosition } from './composer-detail-position';
import { PluginDetailsModal } from "./PluginDetailsModal";
import { PluginsSection, type PluginsSectionHandle } from "./PluginsSection";
import { BUILT_IN_PETS, CUSTOM_PET_ID } from "./pet/pets";
import {
  inlineMentionToken,
  mentionTokenPresent,
  type InlineMentionEntity,
} from '../utils/inlineMentions';
import {
  LexicalComposerInput,
  type LexicalComposerInputHandle,
  type CaretRect,
} from './composer/LexicalComposerInput';
import { CaretFloatingLayer } from './composer/CaretFloatingLayer';
import { ANNOTATION_EVENT, type AnnotationEventDetail } from "./PreviewDrawOverlay";
import { clearProjectRawFileMissing } from '../utils/projectFileFetchCache';
import {
  stageReadableUploadedAttachments,
  uploadedImagesReadableOnDisk,
} from '../utils/uploadedImagesReadable';
import { DesignSystemSwitchPicker } from "./DesignSystemSwitchPicker";
import { listenForConnectorsChanged } from './connectors-events';
import { fetchConnectorCatalogSnapshot } from './connectors-state';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

type ToolsTab = 'plugins' | 'skills' | 'mcp' | 'import';

type MentionTab = 'all' | 'tabs' | 'files' | 'plugins' | 'skills' | 'mcp' | 'connectors';

const USER_PLUGIN_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

interface SlashCommand {
  id: string;
  // Visible label, e.g. `/hatch`. Shown in the popover row.
  label: string;
  // Text inserted into the draft when the user picks the entry. The
  // cursor is positioned at the end of `insert`, so a trailing space
  // is the difference between a "ready for argument" command and a
  // "submit immediately" one.
  insert: string;
  // i18n key of the short description shown next to the label.
  descKey: keyof Dict;
  // Optional argument hint shown after the description.
  argHint?: string;
  // Icon glyph from the project Icon set.
  icon: 'sparkles' | 'eye' | 'sliders';
}

type DesignToolboxResourceKind =
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'mcp-template'
  | 'connector'
  | 'file';

interface DesignToolboxResourceIndex {
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  projectFiles: ProjectFile[];
}

type DesignToolboxResourceBase = {
  key: string;
  kind: DesignToolboxResourceKind;
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: IconName;
  searchText: string;
};

type DesignToolboxResource =
  | (DesignToolboxResourceBase & { kind: 'skill'; skill: SkillSummary })
  | (DesignToolboxResourceBase & { kind: 'plugin'; plugin: InstalledPluginRecord })
  | (DesignToolboxResourceBase & { kind: 'mcp'; server: McpServerConfig })
  | (DesignToolboxResourceBase & { kind: 'mcp-template'; template: McpTemplate })
  | (DesignToolboxResourceBase & { kind: 'connector'; connector: ConnectorDetail })
  | (DesignToolboxResourceBase & { kind: 'file'; file: ProjectFile });

interface Props {
  projectId: string | null;
  projectFiles: ProjectFile[];
  activeProjectFileName?: string | null;
  streaming: boolean;
  sessionMode?: ChatSessionMode;
  onSessionModeChange?: (mode: ChatSessionMode) => void;
  sendDisabled?: boolean;
  initialDraft?: string;
  draftStorageKey?: string;
  // Lazy ensure — the composer calls this before its first upload, so the
  // project folder exists on disk before files land in it. Returns the
  // project id when ready.
  onEnsureProject: () => Promise<string | null>;
  /** Refresh project `/files` after a composer upload so preview heal sees new images. */
  onProjectFilesMaybeChanged?: () => void;
  /** Open a project file in the workspace (e.g. seeded deck.html after template clone). */
  onRequestOpenFile?: (name: string) => void;
  commentAttachments?: ChatCommentAttachment[];
  onRemoveCommentAttachment?: (id: string) => void;
  // Available skills the user can compose into a turn via @<skill>. The
  // chat layer already filters out disabled skills before passing them in
  // here, so the picker can render the list as-is. Keep this optional so
  // the composer still works on surfaces that don't show a skills picker
  // (e.g. tests, screenshot harnesses).
  skills?: SkillSummary[];
  onSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
    meta?: ChatSendMeta,
  ) => void;
  onStop: () => void;
  // Opens the global settings dialog (CLI / model / agent picker). The
  // composer's leading gear icon routes here so users can switch models
  // without leaving the chat.
  onOpenSettings?: () => void;
  // Opens settings on the External MCP tab. Wired from ChatPane → App.
  // The composer's `/mcp` slash command and the MCP picker button route here.
  onOpenMcpSettings?: () => void;
  // The "+" menu's "add plugin" / "add connector" rows route to the home
  // surfaces (plugin registry / connector integrations). Wired from
  // ChatPane → ProjectView → App. Omitted → the add rows are hidden.
  onBrowsePlugins?: () => void;
  onOpenConnectors?: () => void;
  // Optional pet wiring. The composer no longer renders a visible pet
  // entry, but existing manual `/pet` commands still route here.
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  researchAvailable?: boolean;
  projectMetadata?: ProjectMetadata;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  activeWorkspaceContext?: WorkspaceContextItem | null;
  workspaceContexts?: WorkspaceContextItem[];
  // BYOK image-model picker shown above the textarea for protocols that
  // inject the daemon-side generate_image tool (SenseAudio, AIHubMix).
  // Hidden for every other BYOK tab so the composer stays clean. The
  // state owner is ProjectView (per-session, reset on refresh);
  // ChatComposer is a fully controlled select.
  byokApiProtocol?: AppConfig['apiProtocol'];
  byokImageModel?: string;
  onChangeByokImageModel?: (model: string) => void;
  byokVideoModel?: string;
  onChangeByokVideoModel?: (model: string) => void;
  byokSpeechModel?: string;
  onChangeByokSpeechModel?: (model: string) => void;
  byokSpeechVoice?: string;
  onChangeByokSpeechVoice?: (voice: string) => void;
  currentSkillId?: string | null;
  onProjectSkillChange?: (skillId: string | null) => void;
  // Set when the project was created with a plugin already pinned
  // (PluginLoopHome on Home). When provided, the in-composer plugin
  // rail collapses to the single pinned plugin so the user can see
  // which plugin is active without being offered every other installed
  // plugin (the user reported "选了 new-generation, 结果 composer 显
  // 示了多个 plugin"). The active plugin still appears as an
  // ActivePluginChip on each user message (see UserMessage in
  // ChatPane). Pass `null` (or omit) to render the full rail.
  pinnedPluginId?: string | null;
  /** Project-pinned applied-plugin snapshot — hydrate composer chip on remount. */
  pinnedAppliedPluginSnapshotId?: string | null;
  footerAccessory?: ReactNode;
  // Slot rendered in the composer's bottom toolbar, immediately right of the
  // "+" menu. Hosts the working-directory pill so the folder selector sits by
  // the composer (mirroring the home input) instead of the file-panel header.
  leadingAccessory?: ReactNode;
  // Design-system picker slot rendered at the top of the composer (above
  // the textarea). The former standalone chrome header row was removed;
  // ProjectView owns the project record so it renders the picker as a slot.
  designSystemPicker?: ReactNode;
  // Project's current `designSystemId`. The mid-chat design-system picker
  // uses this to surface a "current" indicator and to no-op a redundant
  // switch. Optional so test/screenshot harnesses can omit it.
  currentDesignSystemId?: string | null;
  // Fires after a successful `PATCH /api/projects/:id` from the mid-chat
  // design-system picker. Receives the full patched `Project` straight
  // from the PATCH response so the parent replaces its mirror wholesale —
  // rebuilding from a stale `project` prop would drop server-owned fields
  // the daemon refreshes on every PATCH (e.g. `updatedAt`).
  onActiveDesignSystemChange?: (project: Project) => void;
  // Optional transient banner sink. The composer emits one short message
  // here when a mid-chat design-system switch lands (or fails) so the user
  // has explicit confirmation without re-opening the picker.
  onShowToast?: (message: string) => void;
  /** Embed slide MVP fallback when the project has no design system yet. */
  embedSlideDesignSystemFallbackId?: string | null;
}

// Imperative handle so ancestors (e.g. example chips in ChatPane) can
// push text into the composer without owning its draft state.
export interface ChatComposerHandle {
  setDraft: (text: string) => void;
  restoreDraft: (draft: {
    text: string;
    attachments?: ChatAttachment[];
    commentAttachments?: ChatCommentAttachment[];
    /**
     * The queued turn's meta. When present, restoreDraft rebuilds the staged
     * plugin / connector / skill / MCP context (and re-shows their chips) so
     * editing a queued item keeps its bindings instead of silently dropping
     * them.
     */
    meta?: ChatSendMeta;
  }) => void;
  focus: () => void;
  /**
   * Run a design-toolbox action by id from outside the composer (e.g. the
   * assistant "next step" card). Resolves the action, matches its preferred
   * skill, and seeds the composer draft with the action prompt + `@skill`
   * mention — identical to picking the action inside the toolbox panel, so the
   * draft still waits for the user to send. No-op for an unknown id.
   */
  applyDesignToolboxAction: (id: DesignToolboxActionId) => void;
  /**
   * Seed the composer with a specific skill by id (same path as picking it in
   * the toolbox panel). Used by the next-step card's full skill list. No-op for
   * an unknown id.
   */
  applyDesignToolboxSkill: (skillId: string) => void;
  /** Legacy: open the standalone toolbox popover. Currently unused by callers. */
  openDesignToolbox: () => void;
}

export interface ChatSendMeta {
  queueOnly?: boolean;
  /** Internal: auto-start is already draining this queued send — do not re-queue. */
  drainQueuedSend?: boolean;
  research?: ResearchOptions;
  context?: RunContextSelection;
  /** Per-turn plugin inputs for scenario runs started from composer actions. */
  pluginInputs?: Record<string, unknown>;
  appliedPluginSnapshot?: AppliedPluginSnapshot;
  appliedPluginSnapshotId?: string;
  inlineAppliedPlugin?: {
    pluginId: string;
    label: string;
  };
  // Per-turn skill ids picked via the @-mention popover. The chat layer
  // forwards these to the daemon's `skillIds` field so the system prompt
  // for this run only is composed with the extra skill bodies, without
  // touching the project's persistent `skillId`.
  skillIds?: string[];
  /** Per-turn design system override (embed slide defaults, canvas one-confirm). */
  designSystemId?: string | null;
  /**
   * Canvas/Drive → Slide one-confirm pins. Surfaced on the turn meta so the
   * first send can compose against the picked template even when React
   * `project.metadata` has not yet refreshed after `patchProject`.
   */
  selectedDeckTemplateId?: string;
  selectedDeckTemplateTitle?: string;
  skipDiscoveryBrief?: boolean;
}

/**
 * The chat composer: textarea + paste/drop/attach buttons + @-mention
 * picker. Attachments are uploaded into the active project's folder so
 * the agent can reference them by relative path on its next turn.
 *
 * `@` typed at a word boundary opens a popover listing project files.
 * Selecting one inserts `@<path>` into the prompt and stages it as an
 * attachment so the daemon also includes it explicitly.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, Props>(
  function ChatComposer(
    {
      projectId,
      projectFiles,
      activeProjectFileName = null,
      streaming,
      sessionMode = 'design',
      onSessionModeChange,
      sendDisabled = false,
      initialDraft,
      draftStorageKey,
      onEnsureProject,
      onProjectFilesMaybeChanged,
      onRequestOpenFile,
      commentAttachments = [],
      onRemoveCommentAttachment,
      skills = [],
      onSend,
      onStop,
      onOpenMcpSettings,
      onBrowsePlugins,
      onOpenConnectors,
      petConfig,
      onAdoptPet,
      onTogglePet,
      onOpenPetSettings,
      researchAvailable = false,
      projectMetadata,
      onProjectMetadataChange,
      activeWorkspaceContext = null,
      workspaceContexts = [],
      byokApiProtocol,
      byokImageModel,
      onChangeByokImageModel,
      byokVideoModel,
      onChangeByokVideoModel,
      byokSpeechModel,
      onChangeByokSpeechModel,
      byokSpeechVoice,
      onChangeByokSpeechVoice,
      currentSkillId = null,
      onProjectSkillChange,
      pinnedPluginId = null,
      pinnedAppliedPluginSnapshotId = null,
      footerAccessory,
      leadingAccessory,
      designSystemPicker,
      currentDesignSystemId = null,
      onActiveDesignSystemChange,
      onShowToast,
      embedSlideDesignSystemFallbackId = null,
    },
    ref
  ) {
    const t = useTeamverT();
    const { locale } = useI18n();
    const branding = useTeamverBranding();
    const {
      hideLocalWorkspaceControls,
      hideComposerIntegrations,
      hidePluginRegistry,
      slideOnlyMvp,
    } = branding;
    const analytics = useAnalytics();
    const activeFileContext =
      projectMetadata?.importedFrom === 'folder' && activeProjectFileName
        ? activeProjectFileName
        : null;
    const activeFileDisplayName = activeFileContext ? lastPathSegment(activeFileContext) : null;
    const persistedComposerDraft = useMemo(
      () => loadComposerDraftState(draftStorageKey),
      // Only seed from storage on mount / storage-key change — not every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [draftStorageKey],
    );
    const [draft, setDraft] = useState(
      () => initialDraft ?? persistedComposerDraft.text,
    );
    const composerRootRef = useRef<HTMLDivElement | null>(null);
    // Synchronous mirror of `draft`. Event handlers that mutate the draft off
    // a captured render closure (notably the annotation listener, where two
    // uploads can resolve concurrently) read/write this ref so their edits
    // compose instead of clobbering one another. Kept in lockstep with `draft`
    // by handleEditorChange (the editor is the single source for typing) and by
    // the programmatic-set paths below.
    const draftRef = useRef(draft);

    // chat_panel page_view fires from ProjectView (which outlives
    // conversation switches) so the event measures real chat-panel
    // entries rather than ChatComposer remounts. See PR #2285 review
    // 2026-05-20 04:08 for the rationale.
    const [staged, setStaged] = useState<ChatAttachment[]>(
      () => persistedComposerDraft.attachments,
    );
    const attachedDriveAssetIds = useMemo(
      () => teamverDriveAssetIdsFromChatAttachments(staged),
      [staged],
    );
    const nextAttachmentOrderRef = useRef(
      nextChatAttachmentOrder(persistedComposerDraft.attachments),
    );
    const pendingAnnotationFilesRef = useRef<Map<string, File>>(new Map());
    const [pendingAnnotationPreviewUrls, setPendingAnnotationPreviewUrls] = useState<Record<string, string>>({});
    const [stagedVisualComments, setStagedVisualComments] = useState<ChatCommentAttachment[]>([]);
    // Skills the user has @-mentioned for this turn. We dedupe on id and
    // strip the chip when the user removes the corresponding `@<skill>`
    // token from the draft, keeping draft and chips in sync.
    const [stagedSkills, setStagedSkills] = useState<SkillSummary[]>([]);
    // Legacy standalone design-toolbox popover. The next-step card now renders
    // its own cascading skill menu, so nothing opens this anymore; kept compiling
    // behind `openDesignToolbox` until the panel subsystem is removed wholesale.
    const [designToolboxOpen, setDesignToolboxOpen] = useState(false);
    const [stagedMcpServers, setStagedMcpServers] = useState<McpServerConfig[]>([]);
    const [stagedConnectors, setStagedConnectors] = useState<ConnectorDetail[]>([]);
    const [stagedWorkspaceContexts, setStagedWorkspaceContexts] = useState<WorkspaceContextItem[]>([]);
    const [dismissedWorkspaceContextId, setDismissedWorkspaceContextId] = useState<string | null>(null);
    const activeWorkspaceContextId = activeWorkspaceContext?.id ?? null;
    const previousWorkspaceContextIdRef = useRef<string | null>(activeWorkspaceContextId);
    const [dragActive, setDragActive] = useState(false);
    // Lexical owns the caret, so the mention/slash trigger state only carries
    // the typed query — no cursor offset.
    const [mention, setMention] = useState<{ q: string } | null>(null);
    // Active-row index for the @-popover's visible union (files → tabs →
    // plugins → skills → mcp → connectors). Resets to 0 whenever the query
    // identity or tab changes; drives the visual highlight + Enter/Tab target.
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionTab, setMentionTab] = useState<MentionTab>('all');
    // Viewport caret box the floating popover anchors against. Sampled by the
    // editor at trigger-detection time; null when no trigger is live.
    const [caretRect, setCaretRect] = useState<CaretRect | null>(null);
    // Slash-command popover state — when the draft starts with `/` and the
    // cursor is still inside that token (no space committed yet), we show a
    // small palette of supported commands. The query is the text after `/`
    // so the user can type-to-filter.
    const [slash, setSlash] = useState<{ q: string } | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadAuthRelogin, setUploadAuthRelogin] = useState(false);
    const teamverDriveImportEnabled = useMemo(() => getDesignBffClient() !== null, []);
    const [designAccessTick, setDesignAccessTick] = useState(0);
    const [driveImportOpen, setDriveImportOpen] = useState(false);
    const [driveImportBusy, setDriveImportBusy] = useState(false);
    const [driveImportPartial, setDriveImportPartial] = useState<TeamverDriveImportPartialResult | null>(null);
    const [driveLaunchAssets, setDriveLaunchAssets] = useState<TeamverDriveImportAsset[]>([]);
    const [canvasSlideLaunch, setCanvasSlideLaunch] = useState<TeamverCanvasSlideLaunchSource | null>(null);
    const [canvasSlideLaunchBusy, setCanvasSlideLaunchBusy] = useState(false);
    const [canvasSlideLaunchError, setCanvasSlideLaunchError] = useState<string | null>(null);
    const [canvasSlideLaunchAuthRelogin, setCanvasSlideLaunchAuthRelogin] = useState(false);
    const [canvasSlideTemplateId, setCanvasSlideTemplateId] = useState<string>(() => {
      const pinned = projectMetadata?.selectedDeckTemplateId?.trim();
      return pinned || CANVAS_CREATE_SLIDES_PLUGIN_ID;
    });
    // Re-entering a project remounts the composer; restore the pinned visual
    // template so the picker/chip does not snap back to the default scenario.
    useEffect(() => {
      const pinned = projectMetadata?.selectedDeckTemplateId?.trim();
      if (!pinned) return;
      setCanvasSlideTemplateId((current) =>
        current === CANVAS_CREATE_SLIDES_PLUGIN_ID || !current ? pinned : current,
      );
    }, [projectMetadata?.selectedDeckTemplateId]);
    const [canvasSlideUserPrompt, setCanvasSlideUserPrompt] = useState('');
    const [canvasSlideQuickSettings, setCanvasSlideQuickSettings] = useState<CanvasSlideQuickSettings>(
      DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
    );
    const [teamverWorkspaceId, setTeamverWorkspaceId] = useState<string | null>(null);
    // External MCP servers configured by the user. Fetched lazily on mount;
    // shown in the slash-command palette so `/mcp <id>` inserts a hint into
    // the prompt that nudges the model to use that server's tools.
    const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
    const [mcpTemplates, setMcpTemplates] = useState<McpTemplate[]>([]);
    const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
    // Installed plugins, fetched lazily for the tools-menu Plugins tab and
    // the @-mention picker. Both surfaces share the same list so applying
    // a plugin from either path lands on the same project context.
    const [installedPlugins, setInstalledPlugins] = useState<InstalledPluginRecord[]>([]);
    // Hook merges the composer's own installedPlugins with the shared
    // deck-plugin cache — so even if the Canvas handoff lands before the
    // composer's own fetch settles, the picker still surfaces every deck
    // template instead of only the fallback tile.
    const { options: canvasSlideTemplates, loading: canvasSlideTemplatesLoading } =
      useCanvasSlideLaunchTemplates({
        active: canvasSlideLaunch !== null,
        callerPlugins: installedPlugins,
        locale,
      });
    const selectedCanvasSlideTemplate = useMemo(
      () => resolveCanvasSlideTemplate(canvasSlideTemplates, canvasSlideTemplateId),
      [canvasSlideTemplates, canvasSlideTemplateId],
    );
    // Detail modal — opened from a context chip click (kind === 'plugin')
    // or from the tools-menu "Details" affordance.
    const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
    const [activeAppliedPlugin, setActiveAppliedPlugin] =
      useState<AppliedPluginSnapshot | null>(null);
    // Project remount clears React state — restore the pinned applied plugin
    // so the composer chip / next-send snapshot survive page re-entry.
    // Clearing the pin must also clear the local chip (ProjectView does this;
    // keep the composer symmetric so stale snaps cannot re-attach after clear).
    useEffect(() => {
      const snapshotId = pinnedAppliedPluginSnapshotId?.trim();
      if (!snapshotId) {
        setActiveAppliedPlugin(null);
        return;
      }
      let cancelled = false;
      void fetchAppliedPluginSnapshot(snapshotId).then((snap) => {
        if (cancelled || !snap) return;
        setActiveAppliedPlugin((current) =>
          current?.snapshotId === snapshotId ? current : snap,
        );
      });
      return () => {
        cancelled = true;
      };
    }, [pinnedAppliedPluginSnapshotId]);
    // Latest metadata for pin clear — avoid wholesale PATCH from a stale React
    // closure when the user removes chips quickly after other metadata updates.
    const projectMetadataRef = useRef(projectMetadata);
    projectMetadataRef.current = projectMetadata;
    // Ids last hydrated from durable Home pins — used to prune chips when pins
    // shrink without wiping mid-chat staged MCP/connectors.
    const pinnedMcpIdsRef = useRef<Set<string>>(new Set());
    const pinnedConnectorIdsRef = useRef<Set<string>>(new Set());
    // Home create persists MCP/connector pins on project.metadata. Remount the
    // composer chips from those refs so re-entry matches what the daemon still
    // injects via projectMetadataContextSelection.
    useEffect(() => {
      const mcpRefs = projectMetadata?.contextMcpServers ?? [];
      const connectorRefs = projectMetadata?.contextConnectors ?? [];
      const nextMcpPins = new Set(
        mcpRefs.map((ref) => ref.id?.trim()).filter((id): id is string => Boolean(id)),
      );
      const nextConnectorPins = new Set(
        connectorRefs.map((ref) => ref.id?.trim()).filter((id): id is string => Boolean(id)),
      );
      setStagedMcpServers((current) =>
        reconcileStagedMcpFromProjectContext(current, mcpRefs, pinnedMcpIdsRef.current),
      );
      setStagedConnectors((current) =>
        reconcileStagedConnectorsFromProjectContext(
          current,
          connectorRefs,
          pinnedConnectorIdsRef.current,
        ),
      );
      pinnedMcpIdsRef.current = nextMcpPins;
      pinnedConnectorIdsRef.current = nextConnectorPins;
    }, [projectId, projectMetadata?.contextMcpServers, projectMetadata?.contextConnectors]);
    const pluginsSectionRef = useRef<PluginsSectionHandle | null>(null);
    const inlineBackedPluginRef = useRef<{ id: string; label: string } | null>(null);
    // Consolidated "tools" popover — a single dropdown anchored to the
    // leading sliders icon that hosts project context, MCP, Import actions,
    // and a shortcut to open the full Settings dialog. Replaces the previous
    // row of three standalone buttons (which overflowed in narrow chats).
    // The "+" menu (ComposerPlusMenu) owns its own open / submenu state.
    // Defer the (large) plugin / MCP / connector fetches until the composer is
    // actually used — first focus, the tools popover opening, an @/slash
    // trigger, or a pre-seeded draft. An untouched empty composer (e.g. a home
    // surface the user bounces off, or a background chat) never pays for the
    // full plugin-manifest list. Latches once true and never resets.
    const [composerEngaged, setComposerEngaged] = useState(
      () => (draft ?? '').trim().length > 0,
    );
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    // The Lexical editor handle — drives text/mention/clear/focus from the
    // host. Replaces the old textareaRef + manual selection plumbing. IME
    // composition guarding now lives inside the editor's command handlers.
    const editorRef = useRef<LexicalComposerInputHandle | null>(null);
    // Always points at the latest `applyDesignToolboxAction` closure so the
    // imperative handle (whose deps array doesn't track `draft`/`t`) never seeds
    // the composer from a stale draft when the next-step card fires an action.
    const applyDesignToolboxActionRef = useRef<(action: DesignToolboxAction) => void>(() => {});
    // Same latest-closure trick for picking a skill by id from the next-step card.
    const applyDesignToolboxSkillByIdRef = useRef<(skillId: string) => void>(() => {});
    const petEnabled = Boolean(onAdoptPet && onTogglePet);
    const linkedDirs = projectMetadata?.linkedDirs ?? [];
    // The project's working directory: the local folder the agent can read
    // (via `linkedDirs` → `--add-dir`). Shown in the WorkingDirPicker below
    // the input, mirroring Home. We treat it as a single primary folder.
    const workingDir = linkedDirs[0] ?? null;
    const [recentDirs, setRecentDirs] = useState<string[]>([]);
    useEffect(() => {
      if (!shouldFetchRecentLinkedDirs()) {
        setRecentDirs([]);
        return;
      }
      let cancelled = false;
      void fetchRecentLinkedDirs().then((dirs) => {
        if (!cancelled) setRecentDirs(dirs);
      });
      return () => {
        cancelled = true;
      };
    }, [hideLocalWorkspaceControls]);
    useEffect(() => {
      if (!isTeamverEmbedMode()) return;
      return subscribeTeamverDesignAccessChanged(() => {
        setDesignAccessTick((tick) => tick + 1);
      });
    }, []);
    const teamverDriveImportAllowed = useMemo(
      () =>
        isTeamverEmbedDriveImportAllowed({
          bffPresent: teamverDriveImportEnabled,
          workspaceId: teamverWorkspaceId,
          snapshotAppEnabled: isTeamverEmbedDesignSurfaceEnabled(),
        }),
      [teamverDriveImportEnabled, teamverWorkspaceId, designAccessTick],
    );
    useEffect(() => {
      if (teamverDriveImportAllowed) return;
      setDriveImportOpen(false);
      // Do not consume canvas URL here — workspace may still be loading
      // (allowed=false on first paint). Premature consume drops handoff on /.
      setCanvasSlideLaunch(null);
      setDriveLaunchAssets([]);
    }, [teamverDriveImportAllowed]);
    useEffect(() => {
      if (!teamverDriveImportEnabled) return;
      let cancelled = false;
      void readActiveTeamverWorkspaceId().then((id) => {
        if (cancelled) return;
        const trimmed = id?.trim() || '';
        setTeamverWorkspaceId(trimmed || null);
      });
      // Resync on workspace switch so Drive import/upload stays scoped to the
      // active tenant — without this the composer keeps the mount-time id and
      // every Main BE Drive fetch leaks the previous workspace.
      const unsubscribe = subscribeTeamverWorkspaceChanged(({ workspaceId }) => {
        if (cancelled) return;
        const trimmed = workspaceId.trim();
        setTeamverWorkspaceId(trimmed || null);
        // Drop in-flight import UI so asset picks from the previous tenant
        // cannot be attached after the switch. Re-bind create-slides from URL —
        // clearing without re-read leaves the modal permanently closed when
        // `allowed` stays true across workspace bootstrap.
        setDriveImportOpen(false);
        setDriveLaunchAssets([]);
        setCanvasSlideLaunchError(null);
        setCanvasSlideLaunch(readTeamverCreateSlidesLaunchFromUrl());
        setDriveImportPartial(null);
      });
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }, [teamverDriveImportEnabled]);
    useEffect(() => {
      if (!teamverDriveImportAllowed) return;
      // Home already queued auto-send for this project — do not re-open one-confirm.
      if (projectId) {
        try {
          if (window.sessionStorage.getItem(`od:auto-send-first:${projectId}`) === "1") {
            return;
          }
        } catch {
          /* ignore */
        }
      }
      const createSlides = readTeamverCreateSlidesLaunchFromUrl();
      if (createSlides) {
        // Keep URL params until confirm/cancel (same as Canvas handoff).
        setCanvasSlideLaunchError(null);
        setCanvasSlideLaunch(createSlides);
        return;
      }
      const assets = readTeamverDriveLaunchHandoffAssets();
      if (assets.length === 0) return;
      consumeTeamverDriveLaunchHandoff();
      setDriveLaunchAssets(assets);
      setDriveImportOpen(true);
    }, [teamverDriveImportAllowed, projectId, teamverWorkspaceId]);
    const rememberRecentDir = useCallback(async (dir: string) => {
      setRecentDirs((prev) => [dir, ...prev.filter((d) => d !== dir)].slice(0, 5));
      const persisted = await pushRecentLinkedDir(dir);
      setRecentDirs(persisted);
    }, []);
    // Live-check whether the selected working directory still exists, so a
    // folder deleted from disk turns the picker red without a page reload.
    // Re-checked when the dir changes, when the window/tab regains focus
    // (e.g. after deleting it in Finder), and when the picker is opened.
    const [workingDirMissing, setWorkingDirMissing] = useState(false);
    const checkWorkingDir = useCallback(async () => {
      if (!workingDir) {
        setWorkingDirMissing(false);
        return;
      }
      const ok = await dirExists(workingDir);
      setWorkingDirMissing(!ok);
    }, [workingDir]);
    useEffect(() => {
      void checkWorkingDir();
      const onFocus = () => void checkWorkingDir();
      const onVisible = () => {
        if (document.visibilityState === 'visible') void checkWorkingDir();
      };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }, [checkWorkingDir]);
    const visibleWorkspaceContext =
      activeWorkspaceContext && activeWorkspaceContext.id !== dismissedWorkspaceContextId
        ? activeWorkspaceContext
        : null;
    const selectedWorkspaceContexts = useMemo(() => {
      const out: WorkspaceContextItem[] = [];
      const seen = new Set<string>();
      const push = (item: WorkspaceContextItem | null | undefined) => {
        if (!item) return;
        const key = `${item.kind}:${item.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(item);
      };
      push(visibleWorkspaceContext);
      for (const item of stagedWorkspaceContexts) push(item);
      return out;
    }, [stagedWorkspaceContexts, visibleWorkspaceContext]);
    // initialDraft is only honored on the first non-empty value the parent
    // hands us. After we seed once, the composer is fully under user control
    // — re-renders that pass the same prompt back must not reseed. If the
    // initial useState above already consumed a non-empty initialDraft we
    // mark it seeded immediately, so an early clear by the user (typing or
    // backspace before the parent stops passing initialDraft) does not get
    // overwritten by the effect.
    const seededRef = useRef(Boolean(initialDraft));

    useEffect(() => {
      if (seededRef.current) return;
      if (initialDraft && initialDraft !== draft) {
        setDraft(initialDraft);
        seededRef.current = true;
      } else if (initialDraft === undefined) {
        seededRef.current = true;
      }
    }, [initialDraft, draft]);

    useEffect(() => {
      saveComposerDraftState(draftStorageKey, draft, staged);
    }, [draftStorageKey, draft, staged]);

    useEffect(() => {
      if (previousWorkspaceContextIdRef.current === activeWorkspaceContextId) return;
      previousWorkspaceContextIdRef.current = activeWorkspaceContextId;
      setDismissedWorkspaceContextId(null);
    }, [activeWorkspaceContextId]);

    // Latch `composerEngaged` true on the first real interaction so the
    // deferred fetches below run exactly once, when they are actually needed.
    useEffect(() => {
      if (composerEngaged) return;
      if (draft.trim().length > 0 || mention || slash || canvasSlideLaunch) {
        setComposerEngaged(true);
      }
    }, [canvasSlideLaunch, composerEngaged, draft, mention, slash]);

    // Lazy-fetch the user's external MCP servers list (once engaged) so the
    // `/mcp …` slash palette and the composer's MCP button popover have
    // something to render. We deliberately do not reactively re-fetch when
    // the user toggles servers from Settings — the dialog refreshes itself,
    // and the chat composer rehydrates next time the user re-opens it. A
    // background poll would be cheap but unnecessary for the typical
    // edit-once-then-chat workflow.
    useEffect(() => {
      if (!composerEngaged || hideComposerIntegrations) return;
      let cancelled = false;
      void (async () => {
        const data = await fetchMcpServers();
        if (cancelled || !data) return;
        setMcpServers(data.servers);
        setMcpTemplates(data.templates);
      })();
      return () => {
        cancelled = true;
      };
    }, [composerEngaged, hideComposerIntegrations]);

    // Skills now come from the parent (App.tsx → ProjectView → ChatPane → ChatComposer)
    // pre-filtered by enabled/disabled state. We no longer fetch a fresh list
    // here to avoid showing skills the user has disabled via Settings.

    // Lazy-fetch installed plugins once on mount; the tools-menu Plugins
    // tab and the @-mention picker both consume this list. Page through the
    // same deck catalog the Canvas→Slide modal uses so the picker is not
    // capped at the first Community page of 24.
    useEffect(() => {
      if (!projectId || !composerEngaged) return;
      let cancelled = false;
      void fetchCanvasSlideTemplatePlugins().then((rows) => {
        if (cancelled) return;
        setInstalledPlugins([...rows]);
      });
      return () => {
        cancelled = true;
      };
    }, [projectId, composerEngaged]);

    useEffect(() => {
      if (!composerEngaged || hideComposerIntegrations) return;
      let cancelled = false;
      void fetchConnectorCatalogSnapshot().then((rows) => {
        if (cancelled) return;
        setConnectors(rows.filter((connector) => connector.status === 'connected'));
      });
      return () => {
        cancelled = true;
      };
    }, [composerEngaged, hideComposerIntegrations]);

    useEffect(() => {
      if (!composerEngaged || hideComposerIntegrations) return;
      let cancelled = false;
      async function refreshConnectors() {
        const rows = await fetchConnectorCatalogSnapshot({ refreshDiscovery: true });
        if (cancelled) return;
        setConnectors(rows.filter((connector) => connector.status === 'connected'));
      }
      const stopListening = listenForConnectorsChanged(() => void refreshConnectors());
      return () => {
        cancelled = true;
        stopListening();
      };
    }, [composerEngaged, hideComposerIntegrations]);

    useEffect(() => {
      const inlinePlugin = inlineBackedPluginRef.current;
      if (!activeAppliedPlugin || inlinePlugin?.id !== activeAppliedPlugin.pluginId) return;
      if (mentionTokenPresent(draft, inlinePlugin.label)) return;
      inlineBackedPluginRef.current = null;
      pluginsSectionRef.current?.clear();
    }, [activeAppliedPlugin, draft]);

    // Composer-side plugin list: hide bundled atoms (pipeline-only). Keep
    // the full installed list available even when the project was created
    // from a pinned plugin, so users can switch or layer different plugin
    // context from the tools menu and @ picker.
    const pluginsForComposer = useMemo<InstalledPluginRecord[]>(() => {
      const allowedKinds = new Set(['skill', 'scenario', 'bundle']);
      const installed = installedPlugins.filter((p) => {
        const k = p.manifest?.od?.kind;
        return !k || allowedKinds.has(k);
      });
      return pluginsForSlideOnlyMvp(installed, { slideOnlyMvp });
    }, [installedPlugins, slideOnlyMvp]);

    const skillsForComposer = useMemo(
      () => skillsForSlideOnlyMvp(skills, { slideOnlyMvp }),
      [skills, slideOnlyMvp],
    );

    const enabledMcpServers = useMemo(
      () => mcpServers.filter((s) => s.enabled),
      [mcpServers],
    );

    function inlineBackedPluginFromRestoredDraft(
      text: string,
      appliedPlugin: AppliedPluginSnapshot | null | undefined,
      meta: ChatSendMeta | undefined,
    ): { id: string; label: string } | null {
      if (!appliedPlugin) return null;
      const restoredInline = meta?.inlineAppliedPlugin;
      if (restoredInline?.pluginId !== appliedPlugin.pluginId) return null;
      return mentionTokenPresent(text, restoredInline.label)
        ? { id: appliedPlugin.pluginId, label: restoredInline.label }
        : null;
    }

    const designToolboxResourceIndex = useMemo<DesignToolboxResourceIndex>(
      () => ({
        skills: skillsForComposer,
        plugins: pluginsForComposer,
        mcpServers: enabledMcpServers,
        mcpTemplates,
        connectors,
        projectFiles,
      }),
      [connectors, enabledMcpServers, mcpTemplates, pluginsForComposer, projectFiles, skillsForComposer],
    );
    const composerMentionEntities = useMemo(
      () =>
        buildComposerMentionEntities({
          connectors,
          files: projectFiles,
          mcpServers: enabledMcpServers,
          plugins: pluginsForComposer,
          skills: skillsForComposer,
          staged,
          workspaceContexts,
        }),
      [connectors, enabledMcpServers, pluginsForComposer, projectFiles, skillsForComposer, staged, workspaceContexts],
    );
    // Resolve which tabs to surface in the consolidated tools popover.
    // Plugins is always visible while a project is active so users can
    // apply context without leaving the composer. MCP shows when wired by
    // Catalog of supported slash commands. Each entry shows up in the
    // popover when the user types `/` in the composer. The `insert`
    // value is what we drop into the draft when the user picks the
    // entry — usually the canonical command form with a trailing space
    // ready for an argument.
    const slashCommands = useMemo<SlashCommand[]>(() => {
      const list: SlashCommand[] = [];
      // External MCP servers — `/mcp` opens settings, `/mcp <id>` inserts a
      // prompt-side hint nudging the model to use that server's tools. The
      // hint flows through to the agent verbatim; the daemon already wired
      // the MCP config into the agent's launch so the tools are callable.
      if (onOpenMcpSettings && !hideComposerIntegrations) {
        list.push({
          id: 'mcp',
          label: '/mcp',
          insert: '/mcp ',
          descKey: 'pet.slashPet',
          icon: 'sliders',
          argHint: 'open settings · <server-id> to insert hint',
        });
      }
      if (!hideComposerIntegrations) {
        for (const s of enabledMcpServers) {
          list.push({
            id: `mcp-${s.id}`,
            label: `/mcp ${s.id}`,
            insert: `Use the \`${s.id}\` MCP server tools. `,
            descKey: 'pet.slashPet',
            icon: 'sparkles',
            argHint: s.label || s.transport,
          });
        }
      }
      if (researchAvailable) {
        list.push({
          id: 'search',
          label: '/search',
          insert: '/search ',
          descKey: 'pet.slashSearch',
          icon: 'sparkles',
          argHint: t('pet.slashSearchArg'),
        });
      }
      return list;
    }, [researchAvailable, t, enabledMcpServers, onOpenMcpSettings, hideComposerIntegrations]);

    const filteredSlash = useMemo(() => {
      if (!slash) return [] as SlashCommand[];
      const q = slash.q.toLowerCase();
      if (!q) return slashCommands;
      return slashCommands.filter((c) => c.label.toLowerCase().includes(q));
    }, [slash, slashCommands]);

    function pickSlash(cmd: SlashCommand) {
      if (!slash) return;
      // Replace the in-flight `/<query>` trigger with the picked command's
      // canonical insertion text. Lexical owns the caret afterwards.
      editorRef.current?.replaceActiveTrigger(cmd.insert);
      editorRef.current?.focus();
      setSlash(null);
    }

    // Expand a `/hatch <concept>` draft into the canonical hatch-pet
    // skill prompt before sending. Returns null when the draft is not a
    // hatch command so the caller can fall through to the regular
    // submit path.
    function expandHatchCommand(input: string): string | null {
      const m = /^\/hatch(?:\s+([\s\S]*))?$/i.exec(input.trim());
      if (!m) return null;
      const concept = m[1]?.trim() ?? '';
      const intro = concept
        ? `Hatch a Codex-compatible animated pet for me. Concept: ${concept}.`
        : 'Hatch a Codex-compatible animated pet for me.';
      return [
        intro,
        '',
        'Use the @hatch-pet skill end-to-end:',
        '1. Generate the base look with $imagegen.',
        '2. Generate every row strip (idle, running-right, waving, jumping, failed, waiting, running, review).',
        '3. Mirror running-left from running-right only when the design is symmetric.',
        '4. Run the deterministic scripts (extract / compose / validate / contact-sheet / videos).',
        '5. Package the result into ${CODEX_HOME:-$HOME/.codex}/pets/<pet-name>/ with pet.json + spritesheet.webp.',
        '',
        'When the spritesheet is saved, tell me the absolute path and the pet folder name. I will adopt it from Settings → Pets → Recently hatched.',
      ].join('\n');
    }

    // `/mcp` (no arg) opens settings on the External MCP tab — pure UX hook,
    // never sent to the agent. `/mcp <id>` is intentionally NOT intercepted
    // here: the slash palette already replaces it with a natural-language
    // hint sentence ("Use the `<id>` MCP server tools."), and the user is
    // expected to keep typing the rest of the prompt before sending.
    function tryHandleMcpSlash(): boolean {
      if (!onOpenMcpSettings) return false;
      const trimmed = draft.trim();
      if (!/^\/mcp\s*$/i.test(trimmed)) return false;
      onOpenMcpSettings();
      setDraft('');
      editorRef.current?.clear();
      return true;
    }

    function expandSearchCommand(input: string): { prompt: string; query: string } | null {
      const m = /^\/search(?:\s+([\s\S]*))?$/i.exec(input.trim());
      if (!m) return null;
      const query = m[1]?.trim() ?? '';
      if (!query) return null;
      return {
        query,
        prompt: [
          `Search for: ${query}`,
          '',
          'Before answering, your first tool action must be the OD research command for your shell.',
          'POSIX: "$OD_NODE_BIN" "$OD_BIN" research search --query "<search query>" --max-sources 5',
          'PowerShell: & $env:OD_NODE_BIN $env:OD_BIN research search --query "<search query>" --max-sources 5',
          'cmd.exe: "%OD_NODE_BIN%" "%OD_BIN%" research search --query "<search query>" --max-sources 5',
          'Use the canonical query below as the exact search query, with safe quoting for your shell.',
          '',
          'Canonical query:',
          '',
          '```text',
          query.replace(/```/g, '`\u200b`\u200b`'),
          '```',
          'If the OD command fails because Tavily is not configured or unavailable, report that error, then use your own search capability as fallback and label the fallback clearly.',
          'After the command returns JSON or fallback search results, write a reusable Markdown report into Project files at `research/<safe-query-slug>.md` or another fresh project-relative path.',
          'The report must include the query, fetched time, short summary, key findings, source list with [1], [2] citations, and a note that source content is external untrusted evidence.',
          'Then summarize the findings with citations by source index and mention the Markdown report path.',
        ].join('\n'),
      };
    }

    // Parse a `/pet [arg]` slash command out of the draft. Recognized
    // forms: `/pet` (toggle wake/tuck), `/pet wake`, `/pet tuck`,
    // `/pet adopt` (open settings), or `/pet <id>` to adopt a built-in
    // by id. The slash is stripped from the draft on a successful match
    // so the user does not accidentally send the command to the agent.
    function tryHandlePetSlash(): boolean {
      if (!petEnabled) return false;
      const trimmed = draft.trim();
      const match = /^\/pet(?:\s+(\S+))?$/i.exec(trimmed);
      if (!match) return false;
      const arg = match[1]?.toLowerCase();
      if (!arg || arg === 'toggle') {
        onTogglePet?.();
      } else if (arg === 'wake' || arg === 'show') {
        if (petConfig?.adopted) {
          if (!petConfig.enabled) onTogglePet?.();
        } else {
          onOpenPetSettings?.();
        }
      } else if (arg === 'tuck' || arg === 'hide') {
        if (petConfig?.enabled) onTogglePet?.();
      } else if (arg === 'adopt' || arg === 'settings' || arg === 'change') {
        onOpenPetSettings?.();
      } else if (arg === CUSTOM_PET_ID) {
        onAdoptPet?.(CUSTOM_PET_ID);
      } else {
        const pet = BUILT_IN_PETS.find((p) => p.id === arg);
        if (pet) {
          onAdoptPet?.(pet.id);
        } else {
          return false;
        }
      }
      setDraft('');
      editorRef.current?.clear();
      return true;
    }

    useImperativeHandle(
      ref,
      () => ({
        setDraft: (text: string) => {
          setDraft(text);
          // Keep `@file.webp` / skill pills when an external surface reseeds
          // the composer — plain setText demotes file mentions to TextNodes.
          editorRef.current?.setText(
            text,
            buildComposerMentionEntities({
              connectors,
              files: projectFiles,
              mcpServers: enabledMcpServers,
              plugins: pluginsForComposer,
              skills: skillsForComposer,
              staged,
              workspaceContexts,
            }),
          );
          editorRef.current?.focus();
          seededRef.current = true;
        },
        restoreDraft: ({ text, attachments = [], commentAttachments = [], meta }) => {
          setDraft(text);
          const orderedAttachments = normalizeChatAttachmentOrders(attachments);
          setStaged(orderedAttachments);
          nextAttachmentOrderRef.current = nextChatAttachmentOrder(orderedAttachments);
          setStagedVisualComments(commentAttachments);
          // Rebuild staged context from the queued turn's meta so the
          // plugin / connector / skill / MCP / workspace-tab bindings (and their chips) come
          // back for editing instead of being dropped. Ids resolve against the
          // currently-loaded lists; ids that no longer resolve (uninstalled
          // since queueing) are skipped rather than crashing. The applied
          // plugin is restored from its full snapshot, so it needs no lookup.
          const ctx = meta?.context;
          const restoredSkills = ctx?.skillIds
            ? ctx.skillIds
                .map((id) => skills.find((s) => s.id === id))
                .filter((s): s is SkillSummary => Boolean(s))
            : [];
          const restoredMcpServers = ctx?.mcpServerIds
            ? ctx.mcpServerIds
                .map((id) => mcpServers.find((s) => s.id === id))
                .filter((s): s is McpServerConfig => Boolean(s))
            : [];
          const restoredConnectors = ctx?.connectorIds
            ? ctx.connectorIds
                .map((id) => connectors.find((c) => c.id === id))
                .filter((c): c is ConnectorDetail => Boolean(c))
            : [];
          const restoredWorkspace = ctx?.workspaceItems ?? [];
          setStagedSkills(restoredSkills);
          setStagedMcpServers(restoredMcpServers);
          setStagedConnectors(restoredConnectors);
          setStagedWorkspaceContexts(restoredWorkspace);
          const restoredAppliedPlugin = meta?.appliedPluginSnapshot ?? null;
          setActiveAppliedPlugin(restoredAppliedPlugin);
          inlineBackedPluginRef.current = inlineBackedPluginFromRestoredDraft(
            text,
            restoredAppliedPlugin,
            meta,
          );
          setUploadError(null);
          setMention(null);
          setSlash(null);
          // Seed with attachment/file entities in the same tick — otherwise
          // setText runs before React applies `staged` and `@file.webp` stays
          // plain text instead of a chip.
          editorRef.current?.setText(
            text,
            buildComposerMentionEntities({
              connectors: restoredConnectors.length > 0 ? restoredConnectors : connectors,
              files: projectFiles,
              mcpServers: restoredMcpServers.length > 0 ? restoredMcpServers : enabledMcpServers,
              plugins: pluginsForComposer,
              skills: restoredSkills.length > 0 ? restoredSkills : skillsForComposer,
              staged: orderedAttachments,
              workspaceContexts: restoredWorkspace,
            }),
          );
          editorRef.current?.focus();
          seededRef.current = true;
        },
        focus: () => {
          editorRef.current?.focus();
        },
        applyDesignToolboxAction: (id: DesignToolboxActionId) => {
          const action = getDesignToolboxAction(id);
          if (!action) return;
          applyDesignToolboxActionRef.current(action);
        },
        applyDesignToolboxSkill: (skillId: string) => {
          applyDesignToolboxSkillByIdRef.current(skillId);
        },
        openDesignToolbox: () => {
          setComposerEngaged(true);
          setDesignToolboxOpen(true);
        },
      }),
      [
        connectors,
        enabledMcpServers,
        mcpServers,
        pluginsForComposer,
        projectFiles,
        skills,
        skillsForComposer,
        staged,
        workspaceContexts,
      ]
    );

    function reset() {
      setDraft("");
      setStaged([]);
      nextAttachmentOrderRef.current = 0;
      setStagedVisualComments([]);
      for (const url of Object.values(pendingAnnotationPreviewUrls)) {
        URL.revokeObjectURL(url);
      }
      pendingAnnotationFilesRef.current.clear();
      setPendingAnnotationPreviewUrls({});
      setStagedSkills([]);
      setStagedMcpServers([]);
      setStagedConnectors([]);
      setStagedWorkspaceContexts([]);
      pluginsSectionRef.current?.clear();
      inlineBackedPluginRef.current = null;
      setActiveAppliedPlugin(null);
      setUploadError(null);
      setMention(null);
      setMentionTab('all');
      setSlash(null);
      editorRef.current?.clear();
    }

    function currentCommentAttachments(extra: ChatCommentAttachment[] = []): ChatCommentAttachment[] {
      return sortChatCommentAttachmentsByOrder([...commentAttachments, ...stagedVisualComments, ...extra]);
    }

    /** Show all comment chips, including visual marks with screenshot thumbnails. */
    function stagedVisibleCommentAttachments(extra: ChatCommentAttachment[] = []): ChatCommentAttachment[] {
      return currentCommentAttachments(extra);
    }

    function currentRunContextMeta(): ChatSendMeta | undefined {
      const skillIds = stagedSkills.map((s) => s.id);
      const pluginIds = activeAppliedPlugin ? [activeAppliedPlugin.pluginId] : [];
      const mcpServerIds = stagedMcpServers.map((s) => s.id);
      const connectorIds = stagedConnectors.map((c) => c.id);
      const workspaceItems = selectedWorkspaceContexts;
      const context: RunContextSelection = {
        ...(skillIds.length > 0 ? { skillIds } : {}),
        ...(pluginIds.length > 0 ? { pluginIds } : {}),
        ...(mcpServerIds.length > 0 ? { mcpServerIds } : {}),
        ...(connectorIds.length > 0 ? { connectorIds } : {}),
        ...(workspaceItems.length > 0 ? { workspaceItems } : {}),
      };
      const meta: ChatSendMeta = {
        ...(skillIds.length > 0 ? { skillIds } : {}),
        ...(activeAppliedPlugin
          ? {
              appliedPluginSnapshot: activeAppliedPlugin,
              appliedPluginSnapshotId: activeAppliedPlugin.snapshotId,
              ...(inlineBackedPluginRef.current?.id === activeAppliedPlugin.pluginId
                ? {
                    inlineAppliedPlugin: {
                      pluginId: activeAppliedPlugin.pluginId,
                      label: inlineBackedPluginRef.current.label,
                    },
                  }
                : {}),
            }
          : {}),
        ...(Object.keys(context).length > 0 ? { context } : {}),
      };
      return Object.keys(meta).length > 0 ? meta : undefined;
    }

    function annotationOutboundAttachments(
      uploaded: ChatAttachment[],
      visualAttachment: ChatCommentAttachment | null,
    ): ChatAttachment[] {
      const screenshotBacked = visualAttachment
        ? visualCommentScreenshotPaths([visualAttachment])
        : [];
      const keepStaged = staged.filter((attachment) => {
        if (isEphemeralDrawingScreenshotPath(attachment.path)) return false;
        if (projectFilePathsInclude(screenshotBacked, attachment.path)) return false;
        return true;
      });
      const keepUploaded = uploaded.filter((attachment) => {
        if (projectFilePathsInclude(screenshotBacked, attachment.path)) return false;
        return true;
      });
      return sortChatAttachmentsByOrder([...keepStaged, ...keepUploaded]);
    }

    function annotationCommentAttachmentsForSend(
      visualAttachment: ChatCommentAttachment | null,
    ): ChatCommentAttachment[] {
      const nonVisual = commentAttachments.filter((item) => !isVisualCommentAttachment(item));
      const stagedNonVisual = stagedVisualComments.filter((item) => !isVisualCommentAttachment(item));
      const merged = visualAttachment
        ? [...nonVisual, ...stagedNonVisual, visualAttachment]
        : [...nonVisual, ...stagedVisualComments];
      return dedupeCommentAttachments(merged);
    }

    function storePendingAnnotationFile(path: string, file: File) {
      pendingAnnotationFilesRef.current.set(path, file);
      setPendingAnnotationPreviewUrls((current) => {
        const previous = current[path];
        if (previous) URL.revokeObjectURL(previous);
        return { ...current, [path]: URL.createObjectURL(file) };
      });
    }

    function clearPendingAnnotationPath(path: string) {
      pendingAnnotationFilesRef.current.delete(path);
      setPendingAnnotationPreviewUrls((current) => {
        if (!current[path]) return current;
        URL.revokeObjectURL(current[path]!);
        const next = { ...current };
        delete next[path];
        return next;
      });
    }

    function clearDeferredAnnotationStaging() {
      const pendingPaths = [...pendingAnnotationFilesRef.current.keys()];
      if (pendingPaths.length === 0) return;
      for (const path of pendingPaths) clearPendingAnnotationPath(path);
      const pendingSet = new Set(pendingPaths);
      setStaged((current) => current.filter((attachment) => !pendingSet.has(attachment.path)));
      setStagedVisualComments((current) =>
        current.filter((attachment) => !pendingSet.has(String(attachment.screenshotPath || ''))),
      );
    }

    function sendComposedTurn(
      prompt: string,
      attachments: ChatAttachment[],
      nextCommentAttachments: ChatCommentAttachment[],
      meta?: ChatSendMeta,
    ): boolean {
      if (!prompt && attachments.length === 0 && nextCommentAttachments.length === 0) return false;
      void flushAndSendComposedTurn(prompt, attachments, nextCommentAttachments, meta);
      return true;
    }

    async function flushAndSendComposedTurn(
      prompt: string,
      attachments: ChatAttachment[],
      nextCommentAttachments: ChatCommentAttachment[],
      meta?: ChatSendMeta,
    ): Promise<void> {
      const slideOnlyBlock = embedSlideOnlyOutboundBlockReason(prompt, { slideOnlyMvp });
      if (slideOnlyBlock) {
        setUploadError(slideOnlyBlock);
        return;
      }

      let flushedAttachments = attachments;
      let flushedComments = nextCommentAttachments;
      const needsFlush =
        attachmentsHavePendingAnnotationPaths(attachments)
        || commentAttachmentsHavePendingScreenshotPaths(nextCommentAttachments);

      if (needsFlush) {
        const id = projectId ?? await ensureProject();
        if (!id) {
          setUploadError(t('chat.annotationProjectCreateFailed'));
          return;
        }
        setUploading(true);
        try {
          const { attachments: uploadedAttachments, pathReplacements } =
            await flushPendingAnnotationUploads(
              id,
              attachments,
              pendingAnnotationFilesRef.current,
              uploadedImagesReadableOnDisk,
            );
          flushedAttachments = uploadedAttachments;
          flushedComments = remapPendingCommentScreenshotPaths(
            nextCommentAttachments,
            pathReplacements,
          );
          for (const pendingPath of pathReplacements.keys()) {
            clearPendingAnnotationPath(pendingPath);
          }
          if (
            pathReplacements.size === 0
            && (
              attachmentsHavePendingAnnotationPaths(attachments)
              || commentAttachmentsHavePendingScreenshotPaths(nextCommentAttachments)
            )
          ) {
            setUploadError(t('chat.annotationUploadFailed'));
            return;
          }
        } catch {
          setUploadError(t('chat.annotationUploadFailed'));
          return;
        } finally {
          setUploading(false);
        }
      }

      // After refresh, draft may still have `@image.webp` pills while `staged`
      // was empty (legacy text-only localStorage). Rehydrate before send so
      // vision + `[Attached image embed]` contracts are not dropped.
      const hydratedFromMentions = mergeImageMentionAttachments(flushedAttachments, prompt);
      const nextAttachments = excludeAttachmentsBackedByVisualScreenshots(
        activeFileContext && !hydratedFromMentions.some((attachment) => attachment.path === activeFileContext)
          ? [
              {
                path: activeFileContext,
                name: activeFileDisplayName ?? activeFileContext,
                kind: 'file' as const,
              },
              ...hydratedFromMentions,
            ]
          : hydratedFromMentions,
        flushedComments,
      );
      onSend(prompt, nextAttachments, dedupeCommentAttachments(flushedComments), meta);
      reset();
    }

    function queueMeta(meta?: ChatSendMeta): ChatSendMeta {
      return { ...(meta ?? {}), queueOnly: true };
    }

    function reserveAttachmentOrders(count: number): number {
      const orderStart = Math.max(nextAttachmentOrderRef.current, nextChatAttachmentOrder(staged));
      nextAttachmentOrderRef.current = orderStart + count;
      return orderStart;
    }

    function appendOrderedStagedAttachments(attachments: ChatAttachment[]) {
      if (attachments.length === 0) return;
      const knownPaths = new Set(staged.map((attachment) => attachment.path));
      const nextAttachments = attachments.filter((attachment) => !knownPaths.has(attachment.path));
      setStaged((current) => {
        const currentPaths = new Set(current.map((attachment) => attachment.path));
        const additions = attachments.filter((attachment) => !currentPaths.has(attachment.path));
        if (additions.length === 0) return current;
        const next = sortChatAttachmentsByOrder([...current, ...additions]);
        nextAttachmentOrderRef.current = Math.max(
          nextAttachmentOrderRef.current,
          nextChatAttachmentOrder(next),
        );
        return next;
      });
      // Keep durable `@path` mentions alongside chips (paperclip / Drive /
      // annotation uploads). Refresh recovery scans content when
      // attachments_json is empty.
      const insertedTokens = new Set<string>();
      for (const item of nextAttachments) {
        if (item.kind !== 'image' && !looksLikeImage(item.path)) continue;
        const path = item.path.trim();
        if (!path) continue;
        const token = inlineMentionToken(path);
        if (draftRef.current.includes(token) || insertedTokens.has(token)) continue;
        insertedTokens.add(token);
        editorRef.current?.insertMention({
          token,
          entity: { id: path, kind: 'file', label: path, title: `File: ${path}` },
        });
      }
    }

    function appendContextAttachment(filePath: string) {
      setStaged((current) => {
        if (current.some((item) => item.path === filePath)) return current;
        const order = Math.max(nextAttachmentOrderRef.current, nextChatAttachmentOrder(current));
        nextAttachmentOrderRef.current = order + 1;
        return sortChatAttachmentsByOrder([
          ...current,
          {
            path: filePath,
            name: filePath.split("/").pop() || filePath,
            kind: looksLikeImage(filePath) ? "image" : "file",
            order,
          },
        ]);
      });
    }

    function replaceEditorDraft(text: string) {
      draftRef.current = text;
      setDraft(text);
      editorRef.current?.setText(
        text,
        buildComposerMentionEntities({
          connectors,
          files: projectFiles,
          mcpServers: enabledMcpServers,
          plugins: pluginsForComposer,
          skills: skillsForComposer,
          staged,
          workspaceContexts,
        }),
      );
    }

    async function insertSkillMention(skill: SkillSummary) {
      const applied = await applyProjectSkill(skill);
      if (!applied) return;
      // Stage the skill so it rides this turn's skillIds, then insert an
      // atomic `@<name>` pill carrying the skill's real id. The onChange
      // prune keys on `skill:<id>` being present in the editor text, so the
      // chip survives until the user deletes the pill.
      setStagedSkills((prev) =>
        prev.some((s) => s.id === skill.id) ? prev : [...prev, skill],
      );
      editorRef.current?.insertMention({
        token: inlineMentionToken(skill.name),
        entity: { id: skill.id, kind: 'skill', label: skill.name },
      });
      setMention(null);
    }

    function stageSkillForCurrentTurn(skill: SkillSummary) {
      setStagedSkills((prev) =>
        prev.some((s) => s.id === skill.id) ? prev : [...prev, skill],
      );
    }

    function applyDesignToolboxPrompt(
      prompt: string,
      skill: SkillSummary | null,
    ) {
      const nextPrompt = skill
        ? `${inlineMentionToken(skill.name)}\n${prompt}`
        : prompt;
      if (skill) stageSkillForCurrentTurn(skill);
      applyDesignToolboxDraft(nextPrompt);
    }

    function applyDesignToolboxDraft(prompt: string) {
      replaceEditorDraft(prompt);
      editorRef.current?.focus();
    }

    // Fills the fixed page/area/project context for the rest of the composer
    // bottom bar (plus menu, design-system / working-dir switch, agent
    // selector, context-chip removal).
    const trackComposerBar = (
      fields: Omit<ComposerBarClickProps, 'page_name' | 'area' | 'project_id'>,
    ) => {
      trackComposerBarClick(analytics.track, {
        page_name: 'chat_panel',
        area: 'chat_composer',
        ...(projectId ? { project_id: projectId } : {}),
        ...fields,
      });
    };

    // Fills the fixed page/area/project context so toolbox call sites only
    // pass the event-specific fields (element + ids).
    const trackDesignToolbox = (
      fields: Omit<DesignToolboxClickProps, 'page_name' | 'area' | 'project_id'>,
    ) => {
      trackDesignToolboxClick(analytics.track, {
        page_name: 'chat_panel',
        area: 'chat_composer',
        ...(projectId ? { project_id: projectId } : {}),
        ...fields,
      });
    };

    // Every toolbox resource carries a common `kind` + `id`, and the tracking
    // enum mirrors `DesignToolboxResourceKind` exactly, so this is a direct
    // projection.
    function designToolboxResourceTracking(resource: DesignToolboxResource): {
      resource_kind: NonNullable<DesignToolboxClickProps['resource_kind']>;
      resource_id: string;
    } {
      return { resource_kind: resource.kind, resource_id: resource.id };
    }

    function applyDesignToolboxAction(action: DesignToolboxAction) {
      const skill = findDesignToolboxSkill(action, skills);
      applyDesignToolboxPrompt(
        designToolboxActionPrompt({
          action,
          skill,
          workspaceItem: visibleWorkspaceContext,
          activeDraft: draft,
          resourceIndex: designToolboxResourceIndex,
          t,
        }),
        skill,
      );
    }
    // Recreated each render, so this captures the latest draft/context closure
    // for the imperative handle (see applyDesignToolboxActionRef).
    applyDesignToolboxActionRef.current = applyDesignToolboxAction;

    function applyDesignToolboxSkill(skill: SkillSummary) {
      applyDesignToolboxPrompt(
        designToolboxSkillPrompt({
          skill,
          workspaceItem: visibleWorkspaceContext,
          activeDraft: draft,
          resourceIndex: designToolboxResourceIndex,
          t,
        }),
        skill,
      );
    }
    // Latest-closure bridge for the imperative handle (see the ref declaration).
    applyDesignToolboxSkillByIdRef.current = (skillId: string) => {
      const skill = skills.find((s) => s.id === skillId);
      if (skill) applyDesignToolboxSkill(skill);
    };

    function applyDesignToolboxResource(resource: DesignToolboxResource) {
      if (resource.kind === 'skill') {
        applyDesignToolboxSkill(resource.skill);
        return;
      }

      if (resource.kind === 'file') {
        const path = resource.file.path ?? resource.file.name;
        // Stage as a composer attachment chip + short @mention only.
        // Do NOT dump the global resource index / workflow boilerplate into
        // the visible draft — that text is noisy for uploaded images and
        // unnecessary because the attachment already rides with the turn.
        insertMention(path);
        editorRef.current?.focus();
        return;
      }

      const prompt = designToolboxResourcePrompt({
        resource,
        workspaceItem: visibleWorkspaceContext,
        activeDraft: draft,
        resourceIndex: designToolboxResourceIndex,
        t,
      });

      if (resource.kind === 'plugin') {
        void (async () => {
          inlineBackedPluginRef.current = {
            id: resource.plugin.id,
            label: resource.plugin.title,
          };
          await pluginsSectionRef.current?.applyById(resource.plugin.id, resource.plugin);
          applyDesignToolboxDraft(`${inlineMentionToken(resource.plugin.title)}\n${prompt}`);
        })();
        return;
      }

      if (resource.kind === 'mcp') {
        const label = resource.server.label || resource.server.id;
        setStagedMcpServers((current) =>
          current.some((item) => item.id === resource.server.id)
            ? current
            : [...current, resource.server],
        );
        applyDesignToolboxDraft(`${inlineMentionToken(label)}\n${prompt}`);
        return;
      }

      if (resource.kind === 'connector') {
        setStagedConnectors((current) =>
          current.some((item) => item.id === resource.connector.id)
            ? current
            : [...current, resource.connector],
        );
        applyDesignToolboxDraft(`${inlineMentionToken(resource.connector.name)}\n${prompt}`);
        return;
      }

      applyDesignToolboxDraft(prompt);
    }

    function removeStagedSkill(id: string) {
      trackComposerBar({ element: 'context_remove', resource_kind: 'skill', resource_id: id });
      const skill = stagedSkills.find((s) => s.id === id) ?? null;
      setStagedSkills((prev) => prev.filter((s) => s.id !== id));
      const labels = [id, skill?.name ?? ''];
      replaceEditorDraft(stripInlineMentionLabels(draft, labels));
    }

    function removeStagedMcpServer(id: string) {
      trackComposerBar({ element: 'context_remove', resource_kind: 'mcp', resource_id: id });
      const server = stagedMcpServers.find((item) => item.id === id) ?? null;
      setStagedMcpServers((prev) => prev.filter((item) => item.id !== id));
      replaceEditorDraft(stripInlineMentionLabels(draft, [
        id,
        server?.label ?? '',
      ]));
      void clearPinnedProjectContextRef('contextMcpServers', id);
    }

    function removeStagedConnector(id: string) {
      trackComposerBar({ element: 'context_remove', resource_kind: 'connector', resource_id: id });
      const connector = stagedConnectors.find((item) => item.id === id) ?? null;
      setStagedConnectors((prev) => prev.filter((item) => item.id !== id));
      replaceEditorDraft(stripInlineMentionLabels(draft, [
        id,
        connector?.name ?? '',
      ]));
      void clearPinnedProjectContextRef('contextConnectors', id);
    }

    async function clearPinnedProjectContextRef(
      field: 'contextMcpServers' | 'contextConnectors',
      id: string,
    ): Promise<void> {
      if (!projectId) return;
      const base = projectMetadataRef.current;
      if (!base) return;
      const pinned = base[field];
      if (!Array.isArray(pinned) || !pinned.some((entry) => entry.id === id)) return;
      const nextList = pinned.filter((entry) => entry.id !== id);
      const metadata: ProjectMetadata = {
        ...base,
        ...(nextList.length > 0 ? { [field]: nextList } : { [field]: [] }),
      };
      const patched = await patchProject(projectId, { metadata });
      // Failed PATCH must not overwrite newer local/parent state with a stale
      // optimistic snapshot. On success, prefer server metadata; if the daemon
      // omits it, keep the payload we just acknowledged.
      if (!patched) return;
      onProjectMetadataChange?.(patched.metadata ?? metadata);
    }

    function removeWorkspaceContext(id: string) {
      trackComposerBar({ element: 'context_remove', resource_kind: 'workspace', resource_id: id });
      if (visibleWorkspaceContext?.id === id) setDismissedWorkspaceContextId(id);
      const workspaceItem = selectedWorkspaceContexts.find((item) => item.id === id) ?? null;
      setStagedWorkspaceContexts((prev) => prev.filter((item) => item.id !== id));
      if (workspaceItem) {
        replaceEditorDraft(stripInlineMentionLabels(draft, [
          workspaceItem.label,
          workspaceItem.id,
          workspaceItem.title ?? '',
          workspaceItem.path ?? '',
          workspaceItem.url ?? '',
        ]));
      }
    }

    async function ensureProject(): Promise<string | null> {
      if (projectId) return projectId;
      return onEnsureProject();
    }

    async function uploadFiles(files: File[]) {
      if (files.length === 0) return;
      const blocked: File[] = [];
      const allowedFiles: File[] = [];
      if (slideOnlyMvp) {
        for (const file of files) {
          const reason = embedAttachBlockReason(file.name, {
            mimeType: file.type,
            sizeBytes: file.size,
            slideOnlyMvp: true,
          });
          if (reason) blocked.push(file);
          else allowedFiles.push(file);
        }
      } else {
        allowedFiles.push(...files);
      }
      if (slideOnlyMvp && blocked.length > 0) {
        const preview = blocked
          .slice(0, 2)
          .map((file) => file.name)
          .join(', ');
        const suffix = blocked.length > 2 ? ` 외 ${blocked.length - 2}개` : '';
        setUploadError(
          `슬라이드 첨부 정책에 맞지 않는 파일 ${blocked.length}개를 건너뛰었습니다${preview ? ` (${preview}${suffix})` : ''}.`,
        );
      }
      if (allowedFiles.length === 0) return;

      const id = await ensureProject();
      if (!id) return;
      setUploading(true);
      if (!(slideOnlyMvp && blocked.length > 0)) {
        setUploadError(null);
      }
      // Cohort math is identical to the Design Files Upload button; see
      // `analytics/upload-tracking.ts`. v2 doc fires one
      // file_upload_result per surface so this path reports
      // `page_name='chat_panel'` / `area='chat_composer'`.
      const cohort = deriveUploadCohort(allowedFiles);
      const orderStart = reserveAttachmentOrders(allowedFiles.length);
      try {
        const result = await uploadProjectFiles(id, allowedFiles);
        if (result.uploaded.length > 0) {
          for (const item of result.uploaded) {
            clearProjectRawFileMissing(id, item.path);
          }
          const ready = await uploadedImagesReadableOnDisk(id, result.uploaded);
          const { staged, coldImageCount } = stageReadableUploadedAttachments(
            result.uploaded,
            ready,
          );
          if (staged.length > 0) {
            const orderedUploaded = assignChatAttachmentOrders(staged, orderStart);
            appendOrderedStagedAttachments(orderedUploaded);
          }
          // Keep Design Files / preview heal index in sync with on-disk uploads
          // before the next send refreshes `/files`.
          onProjectFilesMaybeChanged?.();
          if (coldImageCount > 0) {
            // Chips are staged optimistically; send-time / preview fetch retries
            // with NFC/NFD + Drive alternates. Show an info banner so the user
            // knows to wait a moment before sending if S3 sync is still catching up.
            const banner = slideOnlyMvp
              ? `이미지 ${coldImageCount}개가 아직 준비 중입니다. 잠시 후 전송해 주세요.`
              : `${coldImageCount} image(s) are still syncing — wait a moment before sending.`;
            setUploadError(banner);
            // Background poll — once every cold image becomes readable, clear
            // the banner so the user is not left with a stale warning after
            // sync-down catches up. Bounded to ~15s (5 retries × 3s) so a
            // truly stuck upload eventually stops re-checking.
            const coldItems = result.uploaded.filter(
              (item) => item.kind === 'image' && !ready.some((r) => r.path === item.path),
            );
            if (coldItems.length > 0) {
              void (async () => {
                for (let attempt = 0; attempt < 5; attempt += 1) {
                  await new Promise((resolve) => setTimeout(resolve, 3000));
                  const stillCold = await uploadedImagesReadableOnDisk(
                    id,
                    coldItems,
                    [0],
                  );
                  if (stillCold.length === coldItems.length) {
                    // All previously-cold images now readable — clear only if
                    // the banner we set is still the current error.
                    setUploadError((current) => (current === banner ? null : current));
                    return;
                  }
                }
              })();
            }
          }
        }
        const partial = result.failed.length > 0;
        if (partial) {
          setUploadError(
            resolveProjectUploadBatchErrorMessage({
              uploadedCount: result.uploaded.length,
              failedCount: result.failed.length,
              error: result.error,
              slideOnlyMvp,
            }),
          );
          devLog.warn('Some attachments failed to upload', {
            failedCount: result.failed.length,
            uploadedCount: result.uploaded.length,
            error: result.error,
          });
        }
        trackFileUploadResult(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          project_id: id,
          ...cohort,
          result: partial ? 'failed' : 'success',
          ...(partial && result.error ? { error_code: result.error } : {}),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setUploadError(
          slideOnlyMvp
            ? `파일 첨부에 실패했습니다.`
            : `Attachment upload failed (${detail}).`,
        );
        trackFileUploadResult(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          project_id: id,
          ...cohort,
          result: 'failed',
          error_code: detail,
        });
      } finally {
        setUploading(false);
      }
    }

    async function importDriveAttachments(assets: TeamverDriveImportAsset[]) {
      if (assets.length === 0) return;
      if (!teamverDriveImportAllowed) return;
      const blocked: TeamverDriveImportAsset[] = [];
      const allowedAssets: TeamverDriveImportAsset[] = [];
      if (slideOnlyMvp) {
        for (const asset of assets) {
          const reason = embedAttachBlockReason(asset.filename ?? asset.assetId, {
            mimeType: asset.mimeType,
            slideOnlyMvp: true,
          });
          if (reason) blocked.push(asset);
          else allowedAssets.push(asset);
        }
      } else {
        allowedAssets.push(...assets);
      }
      if (slideOnlyMvp && blocked.length > 0) {
        setUploadError(
          `슬라이드 첨부 정책에 맞지 않는 Drive 파일 ${blocked.length}개를 건너뛰었습니다.`,
        );
      }
      if (allowedAssets.length === 0) return;

      const id = await ensureProject();
      if (!id) return;
      setDriveImportBusy(true);
      if (!(slideOnlyMvp && blocked.length > 0)) {
        setUploadError(null);
        setUploadAuthRelogin(false);
      }
      const orderStart = Math.max(nextAttachmentOrderRef.current, nextChatAttachmentOrder(staged));
      try {
        const result = await importTeamverDriveAssets(id, allowedAssets);
        if (result.imported.length > 0) {
          for (const item of result.imported) {
            clearProjectRawFileMissing(id, item.path);
          }
          const attachments = driveImportedToChatAttachments(result.imported);
          // Wait for S3/scratch materialization before staging so preview +
          // vision blocks do not race a cold refs/drive path.
          const ready = await uploadedImagesReadableOnDisk(id, attachments);
          const { staged: stagedAttachments, coldImageCount } =
            stageReadableUploadedAttachments(attachments, ready);
          if (stagedAttachments.length > 0) {
            appendOrderedStagedAttachments(
              assignChatAttachmentOrders(stagedAttachments, orderStart),
            );
          }
          onProjectFilesMaybeChanged?.();
          if (coldImageCount > 0) {
            setUploadError(
              `Drive 이미지 ${coldImageCount}개가 아직 준비 중입니다. 잠시 후 전송해 주세요.`,
            );
          }
        }
        if (result.partial) {
          const failedById = new Map(result.failed.map((item) => [item.assetId, item.errorCode]));
          const failures = allowedAssets
            .filter((asset) => failedById.has(asset.assetId))
            .map((asset) => ({
              asset,
              errorCode: failedById.get(asset.assetId) ?? "drive_import_failed",
            }));
          setDriveImportPartial({
            importedCount: result.imported.length,
            failures,
          });
          setUploadError(null);
          setUploadAuthRelogin(false);
          return;
        }
        setDriveImportPartial(null);
        if (result.imported.length > 0) {
          setDriveImportOpen(false);
          setDriveLaunchAssets([]);
        }
      } catch (err) {
        if (isMainSsoUserMismatchError(err)) {
          void beginMainSsoMismatchRecovery();
          setUploadError(null);
          setUploadAuthRelogin(false);
        } else {
          setUploadError(formatTeamverDriveImportErrorMessage(err));
          setUploadAuthRelogin(isMainSsoRequiredError(err));
        }
      } finally {
        setDriveImportBusy(false);
      }
    }

    async function confirmCanvasSlideLaunch() {
      if (!canvasSlideLaunch || canvasSlideLaunchBusy || streaming) return;
      if (!teamverDriveImportAllowed) {
        setCanvasSlideLaunchError(
          canvasSlideLaunch.kind === "canvas"
            ? "Teamver 작업공간을 먼저 선택한 뒤 다시 시도하세요."
            : formatDriveImportErrorForUser("teamver_workspace_required"),
        );
        return;
      }

      const id = await ensureProject();
      if (!id) return;

      setCanvasSlideLaunchBusy(true);
      setCanvasSlideLaunchError(null);
      setCanvasSlideLaunchAuthRelogin(false);
      setUploadError(null);
      try {
        if (canvasSlideLaunch.kind === "canvas") {
          const handoff = canvasSlideLaunch.handoff;
          const promptForRun = canvasSlideUserPrompt;
          const result = await importTeamverCanvas(id, handoff);
          for (const item of result.imported) {
            clearProjectRawFileMissing(id, item.path);
          }
          const importedAttachments = canvasImportedToChatAttachments(result.imported);
          const readyCanvas = await uploadedImagesReadableOnDisk(id, importedAttachments);
          const { staged: readableCanvas, coldImageCount: coldCanvasImages } =
            stageReadableUploadedAttachments(importedAttachments, readyCanvas);
          if (importedAttachments.some((item) => item.kind === 'image') && readableCanvas.every((item) => item.kind !== 'image')) {
            setCanvasSlideLaunchError(
              'Canvas에서 가져온 이미지를 아직 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.',
            );
            return;
          }
          if (coldCanvasImages > 0) {
            setCanvasSlideLaunchError(
              `Canvas 이미지 ${coldCanvasImages}개를 아직 읽을 수 없어 제외하고 계속합니다.`,
            );
          }
          const attachments = assignChatAttachmentOrders(
            readableCanvas,
            Math.max(nextAttachmentOrderRef.current, nextChatAttachmentOrder(staged)),
          );
          onProjectFilesMaybeChanged?.();
          // Explicit visual templates (Daisy Days, etc.) own the look via the
          // example.html kit. Do not auto-bind Neutral Modern here — HomeView
          // already skips it; ChatComposer used to re-patch designSystemId=default
          // and reintroduce skeleton terracotta / slate priors.
          const designSystemIdForRun =
            slideOnlyMvp && isExplicitCanvasSlideVisualTemplate(selectedCanvasSlideTemplate)
              ? (currentDesignSystemId ?? null)
              : (currentDesignSystemId ?? embedSlideDesignSystemFallbackId ?? null);
          const templateBinding = buildSlideOnlyDeckTemplateCreateBinding(
            selectedCanvasSlideTemplate,
            { slideOnlyMvp },
          );
          const projectPatch: Parameters<typeof patchProject>[1] = {};
          if (
            designSystemIdForRun
            && !currentDesignSystemId
            && !(slideOnlyMvp && isExplicitCanvasSlideVisualTemplate(selectedCanvasSlideTemplate))
          ) {
            projectPatch.designSystemId = designSystemIdForRun;
          }
          // Always persist Canvas→Slide skipDiscovery / kind / template pins.
          // Default template launches have no selectedDeckTemplateId but still
          // must keep skipDiscoveryBrief after reload/reattach.
          projectPatch.metadata = {
            ...(projectMetadata ?? {}),
            ...templateBinding.projectMetadata,
          };
          if (Object.keys(projectPatch).length > 0) {
            const patched = await patchProject(id, projectPatch);
            if (patched) onActiveDesignSystemChange?.(patched);
          }
          const sourceBrief = canvasCreateSlidesSourceBrief(handoff);
          // Explicit visual templates: daemon Clones example.html from plugin
          // FS and content-swaps Source headings into deck.html as an initial
          // preview seed. Continue into the model run so the AI generates
          // real content from the source + user prompt.
          if (
            slideOnlyMvp
            && isExplicitCanvasSlideVisualTemplate(selectedCanvasSlideTemplate)
            && templateBinding.projectMetadata.selectedDeckTemplateId
          ) {
            const seeded = await seedTemplateClonedDeck({
              projectId: id,
              pluginId: templateBinding.projectMetadata.selectedDeckTemplateId,
              templateTitle: selectedCanvasSlideTemplate.title,
              sourceBrief,
              userInstruction: promptForRun,
              deckTitle:
                handoff.title?.trim()
                || handoff.threadTitle?.trim()
                || promptForRun.trim().slice(0, 80)
                || null,
              slideCountHint: canvasSlideQuickLengthToSlideCount(
                canvasSlideQuickSettings.length,
              ),
            });
            if (seeded.ok) {
              onProjectFilesMaybeChanged?.();
              onRequestOpenFile?.(seeded.fileName);
              consumeTeamverCanvasLaunchHandoff();
              setCanvasSlideLaunch(null);
              setCanvasSlideLaunchError(null);
              setCanvasSlideUserPrompt('');
              setCanvasSlideQuickSettings(DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS);
              // Clone seeded LOOK only — immediately AI-fill content into
              // attached deck.html (existing-deck edit), never dump the prompt.
              const fillSeed = buildTemplateCloneContentFillSeed({
                userInstruction: promptForRun,
                sourceBrief,
                templateTitle: selectedCanvasSlideTemplate.title,
              });
              const deckAttachment: ChatAttachment = {
                path: seeded.fileName,
                name: seeded.fileName,
                kind: 'file',
              };
              const baseMeta = currentRunContextMeta();
              const canvasMeta = canvasCreateSlidesTurnMeta(selectedCanvasSlideTemplate.id, {
                designSystemId: designSystemIdForRun,
                mergeContext: baseMeta?.context,
              });
              sendComposedTurn(
                fillSeed,
                [...attachments, deckAttachment],
                [],
                {
                  ...baseMeta,
                  ...canvasMeta,
                  skipDiscoveryBrief: true,
                  ...(templateBinding.projectMetadata.selectedDeckTemplateId
                    ? {
                        selectedDeckTemplateId:
                          templateBinding.projectMetadata.selectedDeckTemplateId,
                        selectedDeckTemplateTitle:
                          templateBinding.projectMetadata.selectedDeckTemplateTitle,
                      }
                    : {}),
                },
              );
              void patchProject(id, {
                metadata: {
                  ...(projectMetadata ?? {}),
                  ...templateBinding.projectMetadata,
                  templateClonedDeckSeeded: true,
                  templateCloneContentFillPending: false,
                },
              });
              return;
            }
          }
          const baseMeta = currentRunContextMeta();
          const canvasMeta = canvasCreateSlidesTurnMeta(selectedCanvasSlideTemplate.id, {
            designSystemId: designSystemIdForRun,
            mergeContext: baseMeta?.context,
          });
          const sent = sendComposedTurn(
            canvasCreateSlidesRunPrompt(
              selectedCanvasSlideTemplate.title,
              sourceBrief,
              promptForRun,
              canvasSlideQuickSettings,
              { hasSourceMaterial: true },
            ),
            attachments,
            [],
            {
              ...baseMeta,
              ...canvasMeta,
              // Race-safe: patchProject metadata may not be in React state yet.
              skipDiscoveryBrief: true,
              ...(templateBinding.projectMetadata.selectedDeckTemplateId
                ? {
                    selectedDeckTemplateId:
                      templateBinding.projectMetadata.selectedDeckTemplateId,
                    selectedDeckTemplateTitle:
                      templateBinding.projectMetadata.selectedDeckTemplateTitle,
                  }
                : {}),
              pluginInputs: {
                ...canvasCreateSlidesPluginInputs(
                  handoff.title?.trim()
                    || handoff.threadTitle?.trim()
                    || attachments[0]?.name
                    || attachments[0]?.path
                    || null,
                  selectedCanvasSlideTemplate.title,
                  sourceBrief,
                  promptForRun,
                  canvasSlideQuickSettings,
                ),
                ...templateBinding.pluginInputsPatch,
              },
              context: {
                ...(baseMeta?.context ?? {}),
                ...canvasMeta.context,
              },
            },
          );
          // Consume handoff only after send is accepted so a failed compose
          // keeps the modal/URL token for retry (aligned with HomeView).
          if (sent) {
            consumeTeamverCanvasLaunchHandoff();
            setCanvasSlideLaunch(null);
            setCanvasSlideLaunchError(null);
            setCanvasSlideUserPrompt('');
            setCanvasSlideQuickSettings(DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS);
          }
          return;
        }

        const asset = canvasSlideLaunch.asset;
        const promptForRun = canvasSlideUserPrompt;
        const blocked = embedAttachBlockReason(asset.filename ?? asset.assetId, {
          mimeType: asset.mimeType,
          slideOnlyMvp,
        });
        if (blocked) {
          setCanvasSlideLaunchError(blocked);
          return;
        }

        const result = await importTeamverDriveAssets(id, [asset]);
        if (result.partial || result.imported.length === 0) {
          const errorCode = result.failed[0]?.errorCode ?? 'drive_import_failed';
          setCanvasSlideLaunchError(formatDriveImportErrorForUser(errorCode));
          return;
        }
        for (const item of result.imported) {
          clearProjectRawFileMissing(id, item.path);
        }
        const importedAttachments = driveImportedToChatAttachments(result.imported);
        const readyImported = await uploadedImagesReadableOnDisk(id, importedAttachments);
        const { staged: readableImported, coldImageCount: coldDriveImages } =
          stageReadableUploadedAttachments(importedAttachments, readyImported);
        if (
          importedAttachments.some((item) => item.kind === 'image')
          && readableImported.every((item) => item.kind !== 'image')
        ) {
          setCanvasSlideLaunchError(
            'Drive에서 가져온 이미지를 아직 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.',
          );
          return;
        }
        const attachments = assignChatAttachmentOrders(
          readableImported,
          Math.max(nextAttachmentOrderRef.current, nextChatAttachmentOrder(staged)),
        );
        onProjectFilesMaybeChanged?.();
        if (coldDriveImages > 0) {
          setCanvasSlideLaunchError(
            `Drive 이미지 ${coldDriveImages}개를 아직 읽을 수 없어 제외하고 계속합니다.`,
          );
        }
        const designSystemIdForRun =
          slideOnlyMvp && isExplicitCanvasSlideVisualTemplate(selectedCanvasSlideTemplate)
            ? (currentDesignSystemId ?? null)
            : (currentDesignSystemId ?? embedSlideDesignSystemFallbackId ?? null);
        const templateBinding = buildSlideOnlyDeckTemplateCreateBinding(
          selectedCanvasSlideTemplate,
          { slideOnlyMvp },
        );
        const projectPatch: Parameters<typeof patchProject>[1] = {};
        if (
          designSystemIdForRun
          && !currentDesignSystemId
          && !(slideOnlyMvp && isExplicitCanvasSlideVisualTemplate(selectedCanvasSlideTemplate))
        ) {
          projectPatch.designSystemId = designSystemIdForRun;
        }
        // Always persist Canvas→Slide skipDiscovery / kind / template pins
        // (including default template launches without selectedDeckTemplateId).
        projectPatch.metadata = {
          ...(projectMetadata ?? {}),
          ...templateBinding.projectMetadata,
        };
        if (Object.keys(projectPatch).length > 0) {
          const patched = await patchProject(id, projectPatch);
          if (patched) onActiveDesignSystemChange?.(patched);
        }
        const sourceBrief = driveCreateSlidesSourceBrief(asset);
        if (
          slideOnlyMvp
          && isExplicitCanvasSlideVisualTemplate(selectedCanvasSlideTemplate)
          && templateBinding.projectMetadata.selectedDeckTemplateId
        ) {
          const seeded = await seedTemplateClonedDeck({
            projectId: id,
            pluginId: templateBinding.projectMetadata.selectedDeckTemplateId,
            templateTitle: selectedCanvasSlideTemplate.title,
            sourceBrief,
            userInstruction: promptForRun,
            deckTitle:
              asset.filename?.trim()
              || promptForRun.trim().slice(0, 80)
              || null,
            slideCountHint: canvasSlideQuickLengthToSlideCount(
              canvasSlideQuickSettings.length,
            ),
          });
          if (seeded.ok) {
            onProjectFilesMaybeChanged?.();
            onRequestOpenFile?.(seeded.fileName);
            consumeTeamverDriveLaunchHandoff();
            setCanvasSlideLaunch(null);
            setCanvasSlideLaunchError(null);
            setCanvasSlideUserPrompt('');
            setCanvasSlideQuickSettings(DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS);
            const fillSeed = buildTemplateCloneContentFillSeed({
              userInstruction: promptForRun,
              sourceBrief,
              templateTitle: selectedCanvasSlideTemplate.title,
            });
            const deckAttachment: ChatAttachment = {
              path: seeded.fileName,
              name: seeded.fileName,
              kind: 'file',
            };
            const baseMeta = currentRunContextMeta();
            const canvasMeta = canvasCreateSlidesTurnMeta(selectedCanvasSlideTemplate.id, {
              designSystemId: designSystemIdForRun,
              mergeContext: baseMeta?.context,
            });
            sendComposedTurn(
              fillSeed,
              [...attachments, deckAttachment],
              [],
              {
                ...baseMeta,
                ...canvasMeta,
                skipDiscoveryBrief: true,
                ...(templateBinding.projectMetadata.selectedDeckTemplateId
                  ? {
                      selectedDeckTemplateId:
                        templateBinding.projectMetadata.selectedDeckTemplateId,
                      selectedDeckTemplateTitle:
                        templateBinding.projectMetadata.selectedDeckTemplateTitle,
                    }
                  : {}),
              },
            );
            void patchProject(id, {
              metadata: {
                ...(projectMetadata ?? {}),
                ...templateBinding.projectMetadata,
                templateClonedDeckSeeded: true,
                templateCloneContentFillPending: false,
              },
            });
            return;
          }
        }
        {
          const baseMeta = currentRunContextMeta();
          const canvasMeta = canvasCreateSlidesTurnMeta(selectedCanvasSlideTemplate.id, {
            designSystemId: designSystemIdForRun,
            mergeContext: baseMeta?.context,
          });
          const sent = sendComposedTurn(
            canvasCreateSlidesRunPrompt(
              selectedCanvasSlideTemplate.title,
              sourceBrief,
              promptForRun,
              canvasSlideQuickSettings,
              { hasSourceMaterial: true },
            ),
            attachments,
            [],
            {
              ...baseMeta,
              ...canvasMeta,
              // Race-safe: patchProject metadata may not be in React state yet.
              skipDiscoveryBrief: true,
              ...(templateBinding.projectMetadata.selectedDeckTemplateId
                ? {
                    selectedDeckTemplateId:
                      templateBinding.projectMetadata.selectedDeckTemplateId,
                    selectedDeckTemplateTitle:
                      templateBinding.projectMetadata.selectedDeckTemplateTitle,
                  }
                : {}),
              pluginInputs: {
                ...canvasCreateSlidesPluginInputs(
                  asset.filename ?? asset.assetId,
                  selectedCanvasSlideTemplate.title,
                  sourceBrief,
                  promptForRun,
                  canvasSlideQuickSettings,
                ),
                ...templateBinding.pluginInputsPatch,
              },
              context: {
                ...(baseMeta?.context ?? {}),
                ...canvasMeta.context,
              },
            },
          );
          if (sent) {
            consumeTeamverDriveLaunchHandoff();
            setCanvasSlideLaunch(null);
            setCanvasSlideLaunchError(null);
            setCanvasSlideUserPrompt('');
            setCanvasSlideQuickSettings(DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS);
          }
        }
      } catch (err) {
        if (isMainSsoUserMismatchError(err)) {
          void beginMainSsoMismatchRecovery();
          setCanvasSlideLaunchError(null);
          setCanvasSlideLaunchAuthRelogin(false);
        } else {
          const message =
            canvasSlideLaunch.kind === "canvas"
              ? formatTeamverCanvasImportErrorMessage(err)
              : formatTeamverDriveImportErrorMessage(err);
          setCanvasSlideLaunchError(message);
          setCanvasSlideLaunchAuthRelogin(isMainSsoRequiredError(err));
        }
      } finally {
        setCanvasSlideLaunchBusy(false);
      }
    }

    async function uploadClipboardImagesFromAsyncClipboard() {
      if (!navigator.clipboard?.read) return false;
      try {
        const items = await navigator.clipboard.read();
        const files: File[] = [];
        const stamp = Date.now();
        for (const item of items) {
          const imageType = item.types.find((type) => type.startsWith('image/'));
          if (!imageType) continue;
          const blob = await item.getType(imageType);
          const extension = imageType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
          files.push(new File([blob], `clipboard-screenshot-${stamp}.${extension}`, { type: imageType }));
        }
        if (files.length === 0) return false;
        await uploadFiles(files);
        return true;
      } catch (err) {
        devLog.warn('Could not read image from clipboard', err);
        return false;
      }
    }

    useEffect(() => {
      function onAnnotation(e: Event) {
        const detail = (e as CustomEvent<AnnotationEventDetail>).detail;
        if (!detail) return;
        void (async () => {
          let acked = false;
          const ack = (result: { ok: boolean; message?: string }) => {
            if (acked) return;
            acked = true;
            detail.ack?.(result);
          };
          let uploaded: ChatAttachment[] = [];
          let visualAttachmentInput: Parameters<typeof buildVisualAnnotationAttachment>[0] | null = null;
          let visualAttachment: ChatCommentAttachment | null = null;
          try {
            const buildVisualAttachmentInputFromAnnotationDetail = (
              order: number,
              idSeed: string,
              screenshotPath: string,
            ): Parameters<typeof buildVisualAnnotationAttachment>[0] => {
              const bounds = detail.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
              const inferredMarkKind =
                detail.markKind
                ?? (detail.bounds ? 'stroke' : detail.target ? 'click' : 'stroke');
              return {
                order,
                idSeed,
                screenshotPath,
                markKind: inferredMarkKind,
                note: detail.note,
                bounds,
                ...(typeof detail.slideIndex === 'number' && Number.isFinite(detail.slideIndex)
                  ? { slideIndex: Math.max(0, Math.floor(detail.slideIndex)) }
                  : {}),
                target: detail.target
                  ? {
                      filePath: detail.target.filePath || detail.filePath || screenshotPath,
                      elementId: detail.target.elementId,
                      selector: detail.target.selector,
                      label: detail.target.label,
                      text: detail.target.text,
                      position: detail.target.position,
                      htmlHint: detail.target.htmlHint,
                      ...(typeof detail.slideIndex === 'number' && Number.isFinite(detail.slideIndex)
                        ? { slideIndex: Math.max(0, Math.floor(detail.slideIndex)) }
                        : {}),
                    }
                  : {
                      filePath:
                        detail.filePath && !isRenderableImagePath(detail.filePath)
                          ? detail.filePath
                          : screenshotPath,
                      position: detail.bounds ?? bounds,
                      ...(typeof detail.slideIndex === 'number' && Number.isFinite(detail.slideIndex)
                        ? { slideIndex: Math.max(0, Math.floor(detail.slideIndex)) }
                        : {}),
                    },
              };
            };

            // Upload the annotation screenshot together with any images the
            // user attached in the markup composer. The screenshot (when
            // present) is first so it keeps backing the structured visual
            // comment; the rest ride along as ordinary chat attachments.
            const annotationFiles = [detail.file, ...(detail.extraFiles ?? [])].filter(
              (f): f is File => Boolean(f),
            );
            if (annotationFiles.length > 0) {
              const orderStart = reserveAttachmentOrders(annotationFiles.length);
              const buildVisualAttachmentInputFromScreenshot = (
                screenshot: ChatAttachment,
              ): Parameters<typeof buildVisualAnnotationAttachment>[0] =>
                buildVisualAttachmentInputFromAnnotationDetail(
                  isFiniteAttachmentOrder(screenshot.order) ? screenshot.order : orderStart,
                  screenshot.path,
                  screenshot.path,
                );

              if (detail.action === 'draft') {
                uploaded = annotationFiles.map((file, index) => {
                  const path = pendingAnnotationPathForFile(file);
                  storePendingAnnotationFile(path, file);
                  return {
                    path,
                    name: file.name,
                    kind: 'image' as const,
                    order: orderStart + index,
                  };
                });
                const screenshot = detail.file ? uploaded[0] : null;
                if (screenshot) {
                  visualAttachmentInput = buildVisualAttachmentInputFromScreenshot(screenshot);
                }
              } else {
                if (detail.action === 'send' || detail.action === 'queue') {
                  clearDeferredAnnotationStaging();
                }
                const id = await ensureProject();
                if (!id) {
                  ack({ ok: false, message: t('chat.annotationProjectCreateFailed') });
                  return;
                }
                setUploading(true);
                const result = await uploadProjectFiles(id, annotationFiles);
                const readableUploaded = result.uploaded.length > 0
                  ? await uploadedImagesReadableOnDisk(id, result.uploaded)
                  : [];
                const { staged: resolvedUploaded, coldImageCount: coldAnnotationImages } =
                  stageReadableUploadedAttachments(result.uploaded, readableUploaded);
                if (resolvedUploaded.length > 0) {
                  uploaded = assignChatAttachmentOrders(
                    resolvedUploaded,
                    orderStart,
                  );
                  onProjectFilesMaybeChanged?.();
                  if (coldAnnotationImages > 0) {
                    // Chips are staged optimistically; do not block the ack.
                    // Send-time / preview fetch retries via NFC/NFD ladder.
                  }
                }
                if (resolvedUploaded.length > 0) {
                  const screenshot = detail.file ? uploaded[0] : null;
                  if (screenshot) {
                    visualAttachmentInput = buildVisualAttachmentInputFromScreenshot(screenshot);
                  } else if (
                    !detail.file
                    && detail.markKind
                    && detail.note.trim()
                    && (detail.bounds || detail.target)
                  ) {
                    visualAttachmentInput = buildVisualAttachmentInputFromAnnotationDetail(
                      orderStart,
                      `${detail.markKind}-${orderStart}`,
                      '',
                    );
                  }
                }
                if (
                  result.uploaded.length > resolvedUploaded.length
                  || result.failed.length > 0
                ) {
                  const failedReadCount = result.uploaded.length - resolvedUploaded.length;
                  const uploadErrorMessage = resolveProjectUploadBatchErrorMessage({
                    uploadedCount: uploaded.length,
                    failedCount: result.failed.length + failedReadCount,
                    error: result.error,
                    slideOnlyMvp,
                  });
                  setUploadError(uploadErrorMessage);
                  if (uploaded.length === 0) {
                    ack({
                      ok: false,
                      message: uploadErrorMessage || t('chat.annotationUploadFailed'),
                    });
                    return;
                  }
                }
              }
            }

            // Capture degraded to bounds + note (no screenshot bytes): still stage
            // structured visual comment so graft / fast-path get pagePosition.
            if (
              !visualAttachmentInput
              && !detail.file
              && detail.markKind
              && (detail.bounds || detail.target)
            ) {
              const orderStart = reserveAttachmentOrders(1);
              visualAttachmentInput = buildVisualAttachmentInputFromAnnotationDetail(
                orderStart,
                `${detail.markKind}-${orderStart}`,
                '',
              );
            }

            setUploading(false);

            const appendAnnotationToComposer = () => {
              if (uploaded.length > 0) {
                appendOrderedStagedAttachments(uploaded);
              }
              if (visualAttachmentInput) {
                setStagedVisualComments((current) => [
                  ...current,
                  buildVisualAnnotationAttachment({
                    ...visualAttachmentInput!,
                  }),
                ]);
              }
              if (detail.note) {
                // Accumulate through draftRef so two annotations resolving
                // concurrently compose (each reads the other's write) instead
                // of both starting from the same stale closure. Mirror the
                // result into the editor with setText so the now-non-empty
                // editor does not fire an onChange('') that would clobber the
                // accumulated draft back to empty. Pass staged entities so
                // concurrent `@image` pills are not demoted to plain text.
                const nextDraft = draftRef.current
                  ? `${draftRef.current}\n${detail.note}`
                  : detail.note;
                draftRef.current = nextDraft;
                setDraft(nextDraft);
                const stagedForSeed = (() => {
                  if (uploaded.length === 0) return staged;
                  const known = new Set(staged.map((item) => item.path));
                  return sortChatAttachmentsByOrder([
                    ...staged,
                    ...uploaded.filter((item) => !known.has(item.path)),
                  ]);
                })();
                editorRef.current?.setText(
                  nextDraft,
                  buildComposerMentionEntities({
                    connectors,
                    files: projectFiles,
                    mcpServers: enabledMcpServers,
                    plugins: pluginsForComposer,
                    skills: skillsForComposer,
                    staged: stagedForSeed,
                    workspaceContexts,
                  }),
                );
              }
              editorRef.current?.focus();
            };

            const composeAnnotationSendPrompt = (
              draftText: string,
              note: string,
              hasOutbound: boolean,
            ): string => {
              const prompt = [draftText.trim(), note].filter(Boolean).join('\n');
              if (prompt.trim() || !hasOutbound) return prompt;
              return COMMENT_ONLY_USER_PLACEHOLDER;
            };

            const finishAnnotationSend = (
              prompt: string,
              attachments: ChatAttachment[],
              nextCommentAttachments: ChatCommentAttachment[],
              meta?: ChatSendMeta,
            ) => {
              if (
                !prompt.trim()
                && attachments.length === 0
                && nextCommentAttachments.length === 0
              ) {
                ack({ ok: false, message: t('chat.annotationFailed') });
                return;
              }
              const slideOnlyBlock = embedSlideOnlyOutboundBlockReason(prompt, { slideOnlyMvp });
              if (slideOnlyBlock) {
                ack({ ok: false, message: slideOnlyBlock });
                return;
              }
              sendComposedTurn(prompt, attachments, nextCommentAttachments, meta);
              ack({ ok: true });
            };

            if (detail.action === 'queue') {
              if (visualAttachmentInput) {
                visualAttachment = buildVisualAnnotationAttachment({
                  ...visualAttachmentInput,
                });
              }
              const hasOutbound = uploaded.length > 0 || Boolean(visualAttachment);
              const prompt = composeAnnotationSendPrompt(draft.trim(), detail.note, hasOutbound);
              const attachments = annotationOutboundAttachments(uploaded, visualAttachment);
              const nextCommentAttachments = annotationCommentAttachmentsForSend(visualAttachment);
              finishAnnotationSend(prompt, attachments, nextCommentAttachments, queueMeta(currentRunContextMeta()));
              return;
            }

            if (detail.action === 'send') {
              if (visualAttachmentInput) {
                visualAttachment = buildVisualAnnotationAttachment({
                  ...visualAttachmentInput,
                });
              }
              const hasOutbound = uploaded.length > 0 || Boolean(visualAttachment);
              const prompt = composeAnnotationSendPrompt(draft.trim(), detail.note, hasOutbound);
              const attachments = annotationOutboundAttachments(uploaded, visualAttachment);
              const nextCommentAttachments = annotationCommentAttachmentsForSend(visualAttachment);
              const sendMeta = streaming || sendDisabled
                ? queueMeta(currentRunContextMeta())
                : currentRunContextMeta();
              finishAnnotationSend(prompt, attachments, nextCommentAttachments, sendMeta);
              return;
            }

            if (detail.action === 'draft') {
              appendAnnotationToComposer();
              ack({ ok: true });
              return;
            }

            ack({ ok: false, message: t('chat.annotationFailed') });
          } catch (err) {
            devLog.warn('Could not send annotation', err);
            setUploadError(slideOnlyMvp ? t('chat.annotationFailed') : (err instanceof Error ? err.message : t('chat.annotationFailed')));
            ack({ ok: false, message: t('chat.annotationFailed') });
          } finally {
            setUploading(false);
          }
        })();
      }
      window.addEventListener(ANNOTATION_EVENT, onAnnotation);
      return () => window.removeEventListener(ANNOTATION_EVENT, onAnnotation);
    }, [
      commentAttachments,
      draft,
      onSend,
      projectId,
      selectedWorkspaceContexts,
      staged,
      stagedConnectors,
      stagedMcpServers,
      stagedSkills,
      stagedVisualComments,
      streaming,
      sendDisabled,
      slideOnlyMvp,
      t,
    ]);

    // Paste handler invoked by the editor's PastePlugin. `files` are the items
    // the clipboard exposed synchronously; when empty we fall back to the
    // async Clipboard API to recover pasted screenshots that some browsers
    // only surface through `navigator.clipboard.read()`.
    function handlePasteFiles(files: File[]) {
      if (files.length > 0) {
        void uploadFiles(files);
        return;
      }
      void uploadClipboardImagesFromAsyncClipboard();
    }

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) void uploadFiles(files);
    }

    async function handleLinkFolder() {
      if (!projectId || !mayMutateProjectLinkedDirs()) return;
      const selected = await openFolderDialog();
      if (!selected) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const existing = base.linkedDirs ?? [];
      if (existing.includes(selected)) return;
      const metadata: ProjectMetadata = { ...base, linkedDirs: [...existing, selected] };
      const result = await patchProject(projectId, { metadata });
      if (result?.metadata) onProjectMetadataChange?.(result.metadata);
    }

    // The WorkingDirPicker treats the project's working directory as a single
    // primary folder, so selecting one replaces `linkedDirs`. The folder is
    // read-only awareness for the agent (→ `--add-dir`), not a Design Files
    // import, and `baseDir` is never touched.
    async function setWorkingDirFolder(dir: string) {
      if (!projectId || !mayMutateProjectLinkedDirs()) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const metadata: ProjectMetadata = { ...base, linkedDirs: [dir] };
      const result = await patchProject(projectId, { metadata });
      // The daemon rejects stale/inaccessible/system dirs with
      // INVALID_LINKED_DIR (patchProject → null). Only commit the selection
      // and promote it in recents when the project accepted it; otherwise
      // surface the failure and leave recents untouched so a rejected path
      // isn't re-promoted to the top of the menu.
      if (!result?.metadata) {
        onShowToast?.(t('homeWorkingDir.applyFailed'));
        return;
      }
      onProjectMetadataChange?.(result.metadata);
      void rememberRecentDir(dir);
    }
    async function handlePickWorkingDir() {
      const selected = await openFolderDialog();
      if (selected) await setWorkingDirFolder(selected);
    }
    async function clearWorkingDir() {
      if (!projectId || !mayMutateProjectLinkedDirs()) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const metadata: ProjectMetadata = { ...base, linkedDirs: [] };
      const result = await patchProject(projectId, { metadata });
      if (result?.metadata) onProjectMetadataChange?.(result.metadata);
    }

    async function handleSwitchDesignSystem(
      designSystemId: string | null,
      title: string | null,
    ): Promise<boolean> {
      if (!projectId) return false;
      if (designSystemId === currentDesignSystemId) return true;
      const result = await patchProject(projectId, { designSystemId });
      if (!result) {
        onShowToast?.(t('chat.importDesignSystemFailed'));
        return false;
      }
      trackComposerBar({
        element: 'design_system_switch',
        ...(designSystemId ? { design_system_id: designSystemId } : {}),
      });
      onActiveDesignSystemChange?.(result);
      const switchedTitle = designSystemId === null
        ? t('chat.importDesignSystemNone')
        : title ?? designSystemId;
      onShowToast?.(t('chat.importDesignSystemSwitched', { title: switchedTitle }));
      return true;
    }


    // Lexical drives every text change through this callback. `present` is the
    // entity list the editor's text currently references (MentionNodes plus
    // plain `@token`s matched against composerMentionEntities, deduped by
    // kind:id). We prune the staged skill/mcp/connector chips to whatever the
    // text still references — generalizing the old skill-only regex prune so a
    // hand-deleted token also drops its chip and never leaks into the run
    // context. `staged` (files) is intentionally NOT pruned: users attach
    // files via the upload button without leaving an `@<path>` token.
    function handleEditorChange(text: string, present: InlineMentionEntity[]) {
      draftRef.current = text;
      setDraft(text);
      const set = new Set(present.map((e) => `${e.kind}:${e.id}`));
      if (
        activeAppliedPlugin
        && inlineBackedPluginRef.current?.id === activeAppliedPlugin.pluginId
        && !set.has(`plugin:${activeAppliedPlugin.pluginId}`)
        && !mentionTokenPresent(text, inlineBackedPluginRef.current.label)
      ) {
        inlineBackedPluginRef.current = null;
        pluginsSectionRef.current?.clear();
      }
      setStagedSkills((prev) => prev.filter((s) => set.has(`skill:${s.id}`)));
      setStagedMcpServers((prev) => prev.filter((m) => set.has(`mcp:${m.id}`)));
      setStagedConnectors((prev) =>
        prev.filter((c) => set.has(`connector:${c.id}`)),
      );
      setStagedWorkspaceContexts((prev) =>
        prev.filter((item) => set.has(`workspace:${item.id}`)),
      );
      // Typed/pasted `@goldfish.webp` (or restored pills) should rehydrate the
      // staged attachment chips so send/vision do not depend on paperclip alone.
      const mentionedImages = mergeImageMentionAttachments([], text);
      if (mentionedImages.length > 0) {
        setStaged((current) => {
          const merged = mergeImageMentionAttachments(current, text);
          return merged.length === current.length ? current : sortChatAttachmentsByOrder(merged);
        });
      }
    }

    // Lexical reports the active @/slash trigger derived from the caret. The
    // mention popover state collapses to `{ q }`; the slash state replicates
    // the old detection effect (reset the keyboard index on open). IME
    // suppression already happened in the editor (it bails while composing).
    function handleEditorTrigger({
      mention: nextMention,
      slash: nextSlash,
      anchorRect,
    }: {
      mention: { q: string } | null;
      slash: { q: string } | null;
      anchorRect: CaretRect | null;
    }) {
      setCaretRect(anchorRect);
      if (nextMention && !mention) {
        setMentionTab('all');
      } else if (!nextMention) {
        setMentionTab('all');
      }
      setMention((prev) => {
        // Reset the active row only when the query identity changes (mirror of
        // the slash reset) so re-renders from unrelated state don't snap it.
        if (nextMention && (!prev || prev.q !== nextMention.q)) setMentionIndex(0);
        return nextMention;
      });
      if (nextSlash) {
        setSlash(nextSlash);
        setSlashIndex(0);
      } else {
        setSlash(null);
      }
    }

    // Routes popover navigation keys lifted verbatim from the old textarea
    // onKeyDown. Returns true when the key was consumed so the editor can
    // preventDefault; false lets the editor handle it normally (e.g. plain
    // arrow keys when no popover is open).
    function handlePopoverKey(
      key: 'ArrowDown' | 'ArrowUp' | 'Tab' | 'Enter' | 'Escape',
    ): boolean {
      if (slash && filteredSlash.length > 0) {
        if (key === 'ArrowDown') {
          setSlashIndex((i) => (i + 1) % filteredSlash.length);
          return true;
        }
        if (key === 'ArrowUp') {
          setSlashIndex(
            (i) => (i - 1 + filteredSlash.length) % filteredSlash.length,
          );
          return true;
        }
        if (key === 'Tab' || key === 'Enter') {
          const safe = Math.min(slashIndex, filteredSlash.length - 1);
          pickSlash(filteredSlash[safe]!);
          return true;
        }
        if (key === 'Escape') {
          setSlash(null);
          return true;
        }
      }
      if (mention && key === 'Escape') {
        setMention(null);
        return true;
      }
      if (mention) {
        // Drive a single index over the visible section union. MentionPopover
        // renders the same files-first section order and highlights the
        // matching row from activeIndex.
        const showFiles = mentionTab === 'all' || mentionTab === 'files';
        const showTabs = mentionTab === 'all' || mentionTab === 'tabs';
        const showPlugins = mentionTab === 'all' || mentionTab === 'plugins';
        const showSkills = mentionTab === 'all' || mentionTab === 'skills';
        const showMcp = mentionTab === 'all' || mentionTab === 'mcp';
        const showConnectors = mentionTab === 'all' || mentionTab === 'connectors';
        const total =
          (showFiles ? filteredFiles.length : 0) +
          (showTabs ? filteredWorkspaceContexts.length : 0) +
          (showPlugins ? filteredPlugins.length : 0) +
          (showSkills ? filteredSkills.length : 0) +
          (showMcp ? filteredMcpServers.length : 0) +
          (showConnectors ? filteredConnectors.length : 0);
        if (total > 0) {
          if (key === 'ArrowDown') {
            setMentionIndex((i) => (i + 1) % total);
            return true;
          }
          if (key === 'ArrowUp') {
            setMentionIndex((i) => (i - 1 + total) % total);
            return true;
          }
          if (key === 'Tab' || key === 'Enter') {
            pickMentionByFlatIndex(Math.min(mentionIndex, total - 1));
            return true;
          }
        }
      }
      return false;
    }

    // Resolve a flat visible-section index to the right insert call. Section
    // order MUST match MentionPopover's render order (files→tabs→plugins
    // →skills→mcp→connectors); the activeIndex highlight and Enter target stay in
    // lockstep across "All" and individual tabs.
    function pickMentionByFlatIndex(flat: number) {
      let i = flat;
      if (mentionTab === 'all' || mentionTab === 'files') {
        if (i < filteredFiles.length) {
          insertMention(filteredFiles[i]!.path ?? filteredFiles[i]!.name);
          return;
        }
        i -= filteredFiles.length;
      }
      if (mentionTab === 'all' || mentionTab === 'tabs') {
        if (i < filteredWorkspaceContexts.length) {
          insertWorkspaceMention(filteredWorkspaceContexts[i]!);
          return;
        }
        i -= filteredWorkspaceContexts.length;
      }
      if (mentionTab === 'all' || mentionTab === 'plugins') {
        if (i < filteredPlugins.length) {
          void insertPluginMention(filteredPlugins[i]!);
          return;
        }
        i -= filteredPlugins.length;
      }
      if (mentionTab === 'all' || mentionTab === 'skills') {
        if (i < filteredSkills.length) {
          void insertSkillMention(filteredSkills[i]!);
          return;
        }
        i -= filteredSkills.length;
      }
      if (mentionTab === 'all' || mentionTab === 'mcp') {
        if (i < filteredMcpServers.length) {
          insertMcpMention(filteredMcpServers[i]!);
          return;
        }
        i -= filteredMcpServers.length;
      }
      if (mentionTab === 'all' || mentionTab === 'connectors') {
        if (i < filteredConnectors.length) {
          insertConnectorMention(filteredConnectors[i]!);
          return;
        }
      }
    }

    function insertMention(filePath: string) {
      editorRef.current?.insertMention({
        token: inlineMentionToken(filePath),
        entity: { id: filePath, kind: 'file', label: filePath },
      });
      if (!staged.some((s) => s.path === filePath)) {
        appendContextAttachment(filePath);
      }
      setMention(null);
    }

    async function insertPluginMention(record: InstalledPluginRecord) {
      editorRef.current?.insertMention({
        token: inlineMentionToken(record.title),
        entity: { id: record.id, kind: 'plugin', label: record.title },
      });
      setMention(null);
      inlineBackedPluginRef.current = { id: record.id, label: record.title };
      await pluginsSectionRef.current?.applyById(record.id, record);
    }

    function insertMcpMention(server: McpServerConfig) {
      setStagedMcpServers((current) => (
        current.some((item) => item.id === server.id) ? current : [...current, server]
      ));
      editorRef.current?.insertMention({
        token: inlineMentionToken(server.label || server.id),
        entity: { id: server.id, kind: 'mcp', label: server.label || server.id },
      });
      setMention(null);
    }

    function insertConnectorMention(connector: ConnectorDetail) {
      setStagedConnectors((current) => (
        current.some((item) => item.id === connector.id) ? current : [...current, connector]
      ));
      editorRef.current?.insertMention({
        token: inlineMentionToken(connector.name),
        entity: { id: connector.id, kind: 'connector', label: connector.name },
      });
      setMention(null);
    }

    function insertWorkspaceMention(item: WorkspaceContextItem) {
      setStagedWorkspaceContexts((current) =>
        current.some((candidate) => candidate.id === item.id)
          ? current
          : [...current, item],
      );
      editorRef.current?.insertMention({
        token: inlineMentionToken(item.label),
        entity: { id: item.id, kind: 'workspace', label: item.label },
      });
      setMention(null);
    }

    async function applyProjectSkill(skill: SkillSummary): Promise<boolean> {
      if (!projectId) return false;
      const result = await patchProject(projectId, { skillId: skill.id });
      if (!result) return false;
      onProjectSkillChange?.(result.skillId ?? skill.id);
      return true;
    }

    function removeStaged(p: string) {
      trackComposerBar({ element: 'context_remove', resource_kind: 'attachment', resource_id: p });
      if (isPendingAnnotationPath(p)) clearPendingAnnotationPath(p);
      setStaged((s) => s.filter((a) => a.path !== p));
      setStagedVisualComments((current) => current.filter((attachment) => attachment.screenshotPath !== p));
      // Strip the `@<path>` token from the draft and push the result back into
      // the editor so the pill disappears in lockstep with the chip.
      replaceEditorDraft(stripInlineMentionToken(draft, p));
    }

    function removeCommentAttachment(id: string) {
      const screenshotPath =
        stagedVisualComments.find((attachment) => attachment.id === id)?.screenshotPath?.trim()
        ?? commentAttachments.find((attachment) => attachment.id === id)?.screenshotPath?.trim()
        ?? '';
      if (screenshotPath) {
        setStaged((current) => current.filter((attachment) => attachment.path !== screenshotPath));
      }
      const wasStagedVisual = stagedVisualComments.some((attachment) => attachment.id === id);
      setStagedVisualComments((current) => current.filter((attachment) => attachment.id !== id));
      if (!wasStagedVisual) {
        onRemoveCommentAttachment?.(id);
      }
    }

    async function submit() {
      const prompt = draft.trim();
      if (sendDisabled) return;
      const embedSlashBlock = embedBlockedComposerSlashReason(prompt, { slideOnlyMvp });
      if (embedSlashBlock) {
        setUploadError(embedSlashBlock);
        return;
      }
      // Intercept `/pet …` and `/mcp` before sending so the slash command
      // never hits the agent — these are local UX hooks, not model prompts.
      if (tryHandlePetSlash()) return;
      if (tryHandleMcpSlash()) return;
      // `/hatch <concept>` expands into the canonical hatch-pet skill
      // prompt and *is* sent to the agent — the agent runs the skill,
      // packages a Codex pet under `~/.codex/pets/`, and the user
      // adopts it from "Recently hatched" in pet settings afterwards.
      const contextMeta = currentRunContextMeta();
      const hatched = expandHatchCommand(prompt);
      const nextCommentAttachments = currentCommentAttachments();
      if (hatched) {
        if (streaming) return;
        onSend(
          hatched,
          excludeAttachmentsBackedByVisualScreenshots(staged, nextCommentAttachments),
          nextCommentAttachments,
          contextMeta,
        );
        reset();
        return;
      }
      const search = researchAvailable ? expandSearchCommand(prompt) : null;
      if (search) {
        if (streaming) return;
        onSend(
          search.prompt,
          excludeAttachmentsBackedByVisualScreenshots(staged, nextCommentAttachments),
          nextCommentAttachments,
          {
            ...contextMeta,
            research: { enabled: true, query: search.query },
          },
        );
        reset();
        return;
      }
      if (!prompt && staged.length === 0 && nextCommentAttachments.length === 0) return;
      sendComposedTurn(prompt, staged, nextCommentAttachments, contextMeta);
    }

    // The @-picker offers a unified search across context surfaces:
    // workspace tabs first, then project files, plugins, skills, active MCP
    // servers, and connectors. Picked
    // entities keep an inline @ token for orientation while richer
    // context is still applied behind the scenes when available.
    const mentionQuery = mention ? mention.q.toLowerCase() : '';
    // The suggestion lists below only matter while the @-popover is open
    // (each is `[]` otherwise). Memoize them on `[mention, mentionQuery,
    // <source>]` so the filter/sort passes run only when the query or the
    // backing list actually changes — not on every unrelated composer render
    // (streaming flips, draft typing routed through Lexical, staged-chip churn).
    // `mention` is in the deps (not just `mentionQuery`) so the open/close gate
    // re-evaluates: a null→{q:''} transition keeps the query '' but must flip
    // the list from `[]` to live results.
    const filteredWorkspaceContexts = useMemo(
      () =>
        mention
          ? workspaceContexts
              .filter((item) => {
                if (!mentionQuery) return true;
                return workspaceContextSearchText(item).toLowerCase().includes(mentionQuery);
              })
              .slice(0, 12)
          : [],
      [mention, mentionQuery, workspaceContexts],
    );
    const filteredFiles = useMemo(
      () =>
        mention
          ? projectFiles
              .filter((f) => f.type === undefined || f.type === "file")
              .filter((f) => {
                const key = f.path ?? f.name;
                return key.toLowerCase().includes(mentionQuery);
              })
              .slice(0, 12)
          : [],
      [mention, mentionQuery, projectFiles],
    );
    const filteredPlugins = useMemo(
      () =>
        mention
          ? pluginsForComposer
              .filter((p) => {
                if (!mentionQuery) return true;
                return (
                  p.title.toLowerCase().includes(mentionQuery) ||
                  p.id.toLowerCase().includes(mentionQuery) ||
                  (p.manifest?.description ?? '').toLowerCase().includes(mentionQuery) ||
                  (p.manifest?.tags ?? []).join(' ').toLowerCase().includes(mentionQuery)
                );
              })
              .slice(0, 8)
          : [],
      [mention, mentionQuery, pluginsForComposer],
    );
    const filteredMcpServers = useMemo(
      () =>
        mention
          ? enabledMcpServers
              .filter((s) => {
                if (!mentionQuery) return true;
                return [
                  s.id,
                  s.label ?? '',
                  s.transport,
                  s.url ?? '',
                  s.command ?? '',
                ]
                  .join(' ')
                  .toLowerCase()
                  .includes(mentionQuery);
              })
              .slice(0, 8)
          : [],
      [mention, mentionQuery, enabledMcpServers],
    );
    const filteredConnectors = useMemo(
      () =>
        mention
          ? connectors
              .filter((connector) => {
                if (!mentionQuery) return true;
                return [
                  connector.id,
                  connector.name,
                  connector.provider,
                  connector.category,
                  connector.description ?? '',
                  connector.accountLabel ?? '',
                ]
                  .join(' ')
                  .toLowerCase()
                  .includes(mentionQuery);
              })
              .slice(0, 8)
          : [],
      [mention, mentionQuery, connectors],
    );
    // Already-staged skills drop out of the suggestion list (carried over
    // from main) so the @-popover keeps moving forward as the user picks.
    const filteredSkills = useMemo(() => {
      if (!mention) return [];
      const stagedSkillIds = new Set(stagedSkills.map((s) => s.id));
      return skillsForComposer
        .filter((s) => !stagedSkillIds.has(s.id))
        .filter((s) => skillMatchesQuery(s, mentionQuery))
        .sort((a, b) => skillMentionRank(a, mentionQuery) - skillMentionRank(b, mentionQuery));
    }, [mention, mentionQuery, skillsForComposer, stagedSkills]);
    const hasComposerPayload =
      draft.trim().length > 0 || staged.length > 0 || currentCommentAttachments().length > 0;
    const showStopButton = streaming && !hasComposerPayload;
    const showSendButton = !streaming || hasComposerPayload;

    return (
      <div
        className={[
          'composer',
          dragActive ? 'drag-active' : '',
          activeFileContext ? 'composer-active-file-mode' : '',
        ].filter(Boolean).join(' ')}
        data-testid="chat-composer"
        ref={composerRootRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="composer-shell">
          {/*
            Spec §8.4 — context bar above the composer input. The
            section now behaves as a pure context bar: it renders the
            active plugin's chips + inputs form when one is applied,
            but never the always-on rail. Plugins are picked from the
            tools-menu Plugins tab or the @-mention popover so the
            composer chrome stays out of the way until the user wants
            to attach context.
          */}
          {projectId ? (
            <PluginsSection
              ref={pluginsSectionRef}
              projectId={projectId}
              showRail={false}
              renderActiveChip={false}
              onApplied={(brief, applied) => {
                setActiveAppliedPlugin(applied.appliedPlugin);
                // Use functional setState so stale closures from the @-mention
                // flow (which awaits applyById after setDraft) still see the
                // latest draft value before deciding whether to seed.
                if (typeof brief === 'string' && brief.length > 0) {
                  setDraft((cur) => (cur.trim().length === 0 ? brief : cur));
                }
              }}
              onCleared={() => {
                inlineBackedPluginRef.current = null;
                setActiveAppliedPlugin(null);
              }}
              onChipDetails={(item: ContextItem) => {
                if (item.kind !== 'plugin') return;
                const record = installedPlugins.find((p) => p.id === item.id);
                if (record) setDetailsRecord(record);
              }}
            />
          ) : null}
          {designSystemPicker || selectedWorkspaceContexts.length > 0 || stagedSkills.length > 0 || stagedMcpServers.length > 0 || stagedConnectors.length > 0 || staged.length > 0 || activeAppliedPlugin ? (
            <StagedRunContexts
              designSystemPicker={designSystemPicker}
              workspaceItems={selectedWorkspaceContexts}
              currentWorkspaceContextId={visibleWorkspaceContext?.id ?? null}
              skills={stagedSkills}
              mcpServers={stagedMcpServers}
              connectors={stagedConnectors}
              attachments={excludeAttachmentsBackedByVisualScreenshots(
                staged,
                currentCommentAttachments(),
              )}
              pluginChip={
                activeAppliedPlugin
                  ? {
                      id: activeAppliedPlugin.pluginId,
                      title: activeAppliedPlugin.pluginTitle ?? activeAppliedPlugin.pluginId,
                    }
                  : null
              }
              projectId={projectId}
              projectFileNames={projectFiles.map((file) => file.name)}
              onRemoveWorkspace={removeWorkspaceContext}
              onRemoveSkill={removeStagedSkill}
              onRemoveMcp={removeStagedMcpServer}
              onRemoveConnector={removeStagedConnector}
              onRemoveAttachment={removeStaged}
              onRemovePlugin={() => {
                pluginsSectionRef.current?.clear();
                setActiveAppliedPlugin(null);
              }}
              onPluginDetails={(id) => {
                const record = installedPlugins.find((plugin) => plugin.id === id);
                if (record) setDetailsRecord(record);
              }}
              attachmentPreviewUrl={(attachment) => pendingAnnotationPreviewUrls[attachment.path] ?? null}
              t={t}
            />
          ) : null}
          {activeFileContext ? (
            <div
              className="composer-active-file"
              data-testid="composer-active-file"
              title={activeFileContext}
            >
              <span className="composer-active-file__label">{t('chat.activeFileEditingLabel')}</span>
              <span className="composer-active-file__name">{activeFileContext}</span>
            </div>
          ) : null}
          {stagedVisibleCommentAttachments().length > 0 ? (
            <StagedCommentAttachments
              attachments={stagedVisibleCommentAttachments()}
              projectId={projectId}
              projectFileNames={projectFiles.map((file) => file.name)}
              attachmentPreviewUrl={(path) => pendingAnnotationPreviewUrls[path] ?? null}
              onRemove={removeCommentAttachment}
              t={t}
            />
          ) : null}
          {/* The inline BYOK media-model pickers (image / video / speech +
              voice) were removed pending a unified model-selection surface.
              The selected models still flow into the run from the project's
              creation-time pick (see ProjectView byok*ModelOverride → submit);
              this only drops the per-composer override UI. The byok* props and
              handlers are intentionally retained as the plumbing the unified
              picker will reuse. */}
          <div
            className="composer-input-wrap"
            onFocus={() => setComposerEngaged(true)}
          >
            <LexicalComposerInput
              ref={editorRef}
              draft={draft}
              placeholder={
                activeFileDisplayName
                  ? t('chat.activeFilePlaceholder', { file: activeFileDisplayName })
                  : t('chat.composerPlaceholder')
              }
              title={activeFileDisplayName ?? t('chat.composerPlaceholder')}
              knownEntities={composerMentionEntities}
              onChange={handleEditorChange}
              onTrigger={handleEditorTrigger}
              onEnterSend={() => void submit()}
              onPasteFiles={handlePasteFiles}
              popoverOpen={Boolean(mention) || Boolean(slash && filteredSlash.length > 0)}
              onPopoverKey={handlePopoverKey}
              comboboxAria={{
                expanded: Boolean(mention),
                activeId: mention ? `mention-opt-${mentionIndex}` : null,
              }}
            />
          </div>
          <CaretFloatingLayer
            caret={caretRect}
            open={Boolean(mention)}
            boundaryRef={composerRootRef}
          >
            <MentionPopover
              files={filteredFiles}
              workspaceContexts={filteredWorkspaceContexts}
              plugins={filteredPlugins}
              skills={filteredSkills}
              mcpServers={filteredMcpServers}
              connectors={filteredConnectors}
              query={mention?.q ?? ''}
              tab={mentionTab}
              onTabChange={(nextTab) => {
                setMentionTab(nextTab);
                setMentionIndex(0);
              }}
              activeIndex={mentionIndex}
              currentSkillId={currentSkillId}
              onPickFile={insertMention}
              onPickWorkspaceContext={insertWorkspaceMention}
              onPickPlugin={(record) => void insertPluginMention(record)}
              onPickSkill={(skill) => void insertSkillMention(skill)}
              onPickMcp={insertMcpMention}
              onPickConnector={insertConnectorMention}
            />
          </CaretFloatingLayer>
          <CaretFloatingLayer
            caret={caretRect}
            open={Boolean(slash && filteredSlash.length > 0)}
            boundaryRef={composerRootRef}
          >
            <SlashPopover
              commands={filteredSlash}
              activeIndex={Math.min(slashIndex, filteredSlash.length - 1)}
              onPick={pickSlash}
              onHover={(i) => setSlashIndex(i)}
              t={t}
            />
          </CaretFloatingLayer>
          <div className="composer-row">
            <input
              ref={fileInputRef}
              data-testid="chat-file-input"
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                void uploadFiles(files);
                e.target.value = '';
              }}
            />
            <ComposerPlusMenu
              triggerTestId="chat-plus-trigger"
              onOpen={() => {
                trackComposerBar({ element: 'plus_menu_open' });
                setComposerEngaged(true);
              }}
              connectors={hideComposerIntegrations ? [] : connectors}
              onPickConnector={(connector) => {
                trackComposerBar({
                  element: 'plus_pick',
                  resource_kind: 'connector',
                  resource_id: connector.id,
                });
                insertConnectorMention(connector);
              }}
              onAddConnector={hideComposerIntegrations ? undefined : () => {
                trackComposerBar({ element: 'plus_add', resource_kind: 'connector' });
                onOpenConnectors?.();
              }}
              showConnectors={!hideComposerIntegrations}
              plugins={pluginsForComposer}
              onPickPlugin={(record) => {
                trackComposerBar({
                  element: 'plus_pick',
                  resource_kind: 'plugin',
                  resource_id: record.id,
                });
                void insertPluginMention(record);
              }}
              onAddPlugin={hidePluginRegistry ? undefined : () => {
                trackComposerBar({ element: 'plus_add', resource_kind: 'plugin' });
                onBrowsePlugins?.();
              }}
              mcpServers={hideComposerIntegrations ? [] : enabledMcpServers}
              onPickMcp={(server) => {
                trackComposerBar({
                  element: 'plus_pick',
                  resource_kind: 'mcp',
                  resource_id: server.id,
                });
                insertMcpMention(server);
              }}
              onAddMcp={hideComposerIntegrations ? undefined : () => {
                trackComposerBar({ element: 'plus_add', resource_kind: 'mcp' });
                onOpenMcpSettings?.();
              }}
              showMcp={!hideComposerIntegrations}
              onAttachFiles={() => {
                trackChatPanelClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'chat_panel',
                  element: 'attachment',
                });
                fileInputRef.current?.click();
              }}
              onAttachFromDrive={
                teamverDriveImportAllowed
                  ? () => {
                      trackChatPanelClick(analytics.track, {
                        page_name: 'chat_panel',
                        area: 'chat_panel',
                        element: 'attachment',
                      });
                      setDriveImportOpen(true);
                    }
                  : undefined
              }
              attachLoading={uploading || driveImportBusy}
              toolboxLabel={t('chat.designToolbox.title')}
              renderToolbox={(close) => (
                <DesignToolboxPanel
                  actions={visibleDesignToolboxActions(DESIGN_TOOLBOX_ACTIONS, { slideOnlyMvp })}
                  skills={skillsForComposer}
                  plugins={pluginsForComposer}
                  mcpServers={hideComposerIntegrations ? [] : enabledMcpServers}
                  mcpTemplates={hideComposerIntegrations ? [] : mcpTemplates}
                  connectors={hideComposerIntegrations ? [] : connectors}
                  projectFiles={projectFiles}
                  activeSkillIds={stagedSkills.map((skill) => skill.id)}
                  activePluginId={activeAppliedPlugin?.pluginId ?? pinnedPluginId ?? null}
                  activeMcpServerIds={stagedMcpServers.map((server) => server.id)}
                  activeConnectorIds={stagedConnectors.map((connector) => connector.id)}
                  activeFilePaths={staged.map((item) => item.path)}
                  teamverBranded={branding.enabled}
                  onOpened={() => trackDesignToolbox({ element: 'design_toolbox_open' })}
                  onPickAction={(action) => {
                    trackDesignToolbox({
                      element: 'design_toolbox_action',
                      toolbox_action_id: action.id,
                    });
                    applyDesignToolboxAction(action);
                    close();
                  }}
                  onPickSkill={(skill) => {
                    trackDesignToolbox({
                      element: 'design_toolbox_resource',
                      resource_kind: 'skill',
                      resource_id: skill.id,
                    });
                    applyDesignToolboxSkill(skill);
                    close();
                  }}
                  onPickResource={(resource) => {
                    trackDesignToolbox({
                      element: 'design_toolbox_resource',
                      ...designToolboxResourceTracking(resource),
                    });
                    applyDesignToolboxResource(resource);
                    close();
                  }}
                />
              )}
            />
            {designToolboxOpen ? (
              <div className="composer-toolbox-standalone">
                {/* Click-catcher backdrop. A <div> (not a <button>) so it never
                    inherits the app's global button:hover fill, which otherwise
                    painted the whole screen when the cursor crossed it. */}
                <div
                  className="composer-toolbox-standalone-backdrop"
                  aria-hidden="true"
                  onClick={() => setDesignToolboxOpen(false)}
                />
                <div
                  className="plus-menu__popup composer-toolbox-standalone-popup"
                  role="menu"
                >
                  <DesignToolboxPanel
                    actions={visibleDesignToolboxActions(DESIGN_TOOLBOX_ACTIONS, { slideOnlyMvp })}
                    skills={skillsForComposer}
                    plugins={pluginsForComposer}
                    mcpServers={hideComposerIntegrations ? [] : enabledMcpServers}
                    mcpTemplates={hideComposerIntegrations ? [] : mcpTemplates}
                    connectors={hideComposerIntegrations ? [] : connectors}
                    projectFiles={projectFiles}
                    activeSkillIds={stagedSkills.map((skill) => skill.id)}
                    activePluginId={activeAppliedPlugin?.pluginId ?? pinnedPluginId ?? null}
                    activeMcpServerIds={stagedMcpServers.map((server) => server.id)}
                    activeConnectorIds={stagedConnectors.map((connector) => connector.id)}
                    activeFilePaths={staged.map((item) => item.path)}
                    teamverBranded={branding.enabled}
                    onOpened={() => trackDesignToolbox({ element: 'design_toolbox_open' })}
                    onPickAction={(action) => {
                      trackDesignToolbox({
                        element: 'design_toolbox_action',
                        toolbox_action_id: action.id,
                      });
                      applyDesignToolboxAction(action);
                      setDesignToolboxOpen(false);
                    }}
                    onPickSkill={(skill) => {
                      trackDesignToolbox({
                        element: 'design_toolbox_resource',
                        resource_kind: 'skill',
                        resource_id: skill.id,
                      });
                      applyDesignToolboxSkill(skill);
                      setDesignToolboxOpen(false);
                    }}
                    onPickResource={(resource) => {
                      trackDesignToolbox({
                        element: 'design_toolbox_resource',
                        ...designToolboxResourceTracking(resource),
                      });
                      applyDesignToolboxResource(resource);
                      setDesignToolboxOpen(false);
                    }}
                  />
                </div>
              </div>
            ) : null}
            {leadingAccessory}
            <span className="composer-spacer" />
            {footerAccessory}
            {!slideOnlyMvp ? (
              <SessionModeToggle
                mode={sessionMode}
                onChange={(next) => {
                  if (next !== sessionMode) {
                    trackComposerSessionModeClick(analytics.track, {
                      page_name: 'chat_panel',
                      area: 'chat_composer',
                      element: 'session_mode_toggle',
                      mode_before: sessionModeToTracking(sessionMode),
                      mode_after: sessionModeToTracking(next),
                      ...(projectId ? { project_id: projectId } : {}),
                    });
                  }
                  onSessionModeChange?.(next);
                }}
              />
            ) : null}
            {showStopButton ? (
              <button
                type="button"
                className="composer-send stop od-tooltip"
                onClick={onStop}
                title={t('chat.stop')}
                data-tooltip={t('chat.stop')}
                aria-label={t('chat.stop')}
              >
                <Icon name="stop" size={13} />
                <span>{t('chat.stop')}</span>
              </button>
            ) : null}
            {showSendButton ? (
              <button
                type="button"
                className="composer-send od-tooltip"
                data-testid="chat-send"
                onClick={() => {
                  trackChatPanelClick(analytics.track, {
                    page_name: 'chat_panel',
                    area: 'chat_panel',
                    element: 'send',
                  });
                  void submit();
                }}
                disabled={sendDisabled || !hasComposerPayload}
                aria-label={t('chat.send')}
                title={t('chat.send')}
                data-tooltip={t('chat.send')}
              >
                <Icon name="send" size={13} />
                <span>{t('chat.send')}</span>
              </button>
            ) : null}
          </div>
        </div>
        {projectId && !hideLocalWorkspaceControls ? (
          <div className="composer-workdir-row">
            <WorkingDirPicker
              placement="up"
              workingDir={workingDir}
              invalid={workingDirMissing}
              recentDirs={recentDirs}
              onOpen={() => void checkWorkingDir()}
              onPickDirectory={() => void handlePickWorkingDir()}
              onSelectRecent={(dir) => void setWorkingDirFolder(dir)}
              onClear={() => void clearWorkingDir()}
            />
          </div>
        ) : null}
        {uploadError ? (
          <span className="composer-hint" role="status">
            {uploadError}
            {uploadAuthRelogin ? (
              <>
                {" "}
                <button
                  type="button"
                  className="teamver-drive-picker-empty__login"
                  data-testid="composer-drive-import-login"
                  onClick={redirectToTeamverLoginFromEmbed}
                >
                  다시 로그인
                </button>
              </>
            ) : null}
          </span>
        ) : null}
        {detailsRecord ? (
          <PluginDetailsModal
            record={detailsRecord}
            onClose={() => setDetailsRecord(null)}
            onUse={async (record) => {
              inlineBackedPluginRef.current = null;
              await pluginsSectionRef.current?.applyById(record.id, record);
              setDetailsRecord(null);
            }}
            hideUseAction
          />
        ) : null}
        {teamverDriveImportAllowed && canvasSlideLaunch ? (
          <TeamverCanvasSlideLaunchModal
            open
            source={canvasSlideLaunch}
            confirming={canvasSlideLaunchBusy}
            errorMessage={canvasSlideLaunchError}
            templateOptions={canvasSlideTemplates}
            templatesLoading={canvasSlideTemplatesLoading}
            selectedTemplateId={selectedCanvasSlideTemplate.id}
            onTemplateChange={setCanvasSlideTemplateId}
            userPrompt={canvasSlideUserPrompt}
            onUserPromptChange={setCanvasSlideUserPrompt}
            quickSettings={canvasSlideQuickSettings}
            onQuickSettingsChange={setCanvasSlideQuickSettings}
            onRelogin={
              canvasSlideLaunchAuthRelogin ? redirectToTeamverLoginFromEmbed : null
            }
            onClose={() => {
              if (!canvasSlideLaunchBusy) {
                if (canvasSlideLaunch.kind === "canvas") {
                  consumeTeamverCanvasLaunchHandoff();
                } else {
                  consumeTeamverDriveLaunchHandoff();
                }
                setCanvasSlideLaunch(null);
                setCanvasSlideLaunchError(null);
                setCanvasSlideLaunchAuthRelogin(false);
                setCanvasSlideUserPrompt('');
                setCanvasSlideQuickSettings(DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS);
              }
            }}
            onConfirm={confirmCanvasSlideLaunch}
          />
        ) : null}
        {teamverDriveImportAllowed && teamverWorkspaceId ? (
          <TeamverDriveImportModal
            open={driveImportOpen}
            workspaceId={teamverWorkspaceId}
            confirming={driveImportBusy}
            initialAssets={driveLaunchAssets}
            partialResult={driveImportPartial}
            onRetryFailed={() => {
              if (!driveImportPartial) return;
              void importDriveAttachments(driveImportPartial.failures.map((item) => item.asset));
            }}
            onDismissPartial={() => {
              setDriveImportPartial(null);
              setDriveImportOpen(false);
              setDriveLaunchAssets([]);
            }}
            onClose={() => {
              if (!driveImportBusy) {
                setDriveImportPartial(null);
                setDriveImportOpen(false);
                setDriveLaunchAssets([]);
              }
            }}
            onConfirm={importDriveAttachments}
            attachedDriveAssetIds={attachedDriveAssetIds}
          />
        ) : null}
      </div>
    );
  }
);

function buildComposerMentionEntities({
  connectors,
  files,
  mcpServers,
  plugins,
  skills,
  staged,
  workspaceContexts,
}: {
  connectors: ConnectorDetail[];
  files: ProjectFile[];
  mcpServers: McpServerConfig[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  staged: ChatAttachment[];
  workspaceContexts: WorkspaceContextItem[];
}): InlineMentionEntity[] {
  const entities: InlineMentionEntity[] = [];
  const workspaceSeen = new Set<string>();
  for (const item of workspaceContexts) {
    if (!item.id || !item.label) continue;
    const key = `workspace:${item.id}`;
    if (workspaceSeen.has(key)) continue;
    workspaceSeen.add(key);
    entities.push({
      id: item.id,
      kind: 'workspace',
      label: item.label,
      token: inlineMentionToken(item.label),
      title: `Workspace: ${item.label}`,
    });
  }
  for (const plugin of plugins) {
    entities.push({
      id: plugin.id,
      kind: 'plugin',
      label: plugin.title,
      token: inlineMentionToken(plugin.title),
      title: `Plugin: ${plugin.title}`,
    });
  }
  for (const skill of skills) {
    entities.push({
      id: skill.id,
      kind: 'skill',
      label: skill.name,
      token: inlineMentionToken(skill.name),
      title: `Skill: ${skill.name}`,
    });
    if (skill.id !== skill.name) {
      entities.push({
        id: skill.id,
        kind: 'skill',
        label: skill.id,
        token: inlineMentionToken(skill.id),
        title: `Skill: ${skill.name}`,
      });
    }
  }
  for (const server of mcpServers) {
    const label = server.label || server.id;
    entities.push({
      id: server.id,
      kind: 'mcp',
      label,
      token: inlineMentionToken(label),
      title: `MCP: ${label}`,
    });
    if (server.id !== label) {
      entities.push({
        id: server.id,
        kind: 'mcp',
        label: server.id,
        token: inlineMentionToken(server.id),
        title: `MCP: ${label}`,
      });
    }
  }
  for (const connector of connectors) {
    entities.push({
      id: connector.id,
      kind: 'connector',
      label: connector.name,
      token: inlineMentionToken(connector.name),
      title: `Connector: ${connector.name}`,
    });
    if (connector.id !== connector.name) {
      entities.push({
        id: connector.id,
        kind: 'connector',
        label: connector.id,
        token: inlineMentionToken(connector.id),
        title: `Connector: ${connector.name}`,
      });
    }
  }
  const filePaths = new Set<string>();
  for (const file of files) {
    const path = file.path ?? file.name;
    if (!path || filePaths.has(path)) continue;
    filePaths.add(path);
    entities.push({
      id: path,
      kind: 'file',
      label: path,
      token: inlineMentionToken(path),
      title: `File: ${path}`,
    });
  }
  for (const attachment of staged) {
    if (!attachment.path || filePaths.has(attachment.path)) continue;
    filePaths.add(attachment.path);
    entities.push({
      id: attachment.path,
      kind: 'file',
      label: attachment.path,
      token: inlineMentionToken(attachment.path),
      title: `File: ${attachment.path}`,
    });
  }
  return entities;
}

function isFiniteAttachmentOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeChatAttachmentOrders(attachments: ChatAttachment[]): ChatAttachment[] {
  let fallbackOrder = 0;
  return attachments.map((attachment) => {
    if (isFiniteAttachmentOrder(attachment.order)) {
      fallbackOrder = Math.max(fallbackOrder, Math.floor(attachment.order) + 1);
      return { ...attachment, order: Math.floor(attachment.order) };
    }
    const order = fallbackOrder;
    fallbackOrder += 1;
    return { ...attachment, order };
  });
}

function assignChatAttachmentOrders(
  attachments: ChatAttachment[],
  orderStart: number,
): ChatAttachment[] {
  return attachments.map((attachment, index) => ({
    ...attachment,
    order: orderStart + index,
  }));
}

function nextChatAttachmentOrder(attachments: ChatAttachment[]): number {
  return attachments.reduce(
    (max, attachment, index) =>
      Math.max(max, isFiniteAttachmentOrder(attachment.order) ? Math.floor(attachment.order) + 1 : index + 1),
    0,
  );
}

function sortChatAttachmentsByOrder(attachments: ChatAttachment[]): ChatAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = isFiniteAttachmentOrder(a.attachment.order) ? a.attachment.order : a.index;
      const bOrder = isFiniteAttachmentOrder(b.attachment.order) ? b.attachment.order : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

function sortChatCommentAttachmentsByOrder(attachments: ChatCommentAttachment[]): ChatCommentAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = isFiniteAttachmentOrder(a.attachment.order) ? a.attachment.order : a.index;
      const bOrder = isFiniteAttachmentOrder(b.attachment.order) ? b.attachment.order : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

function workspaceContextIcon(item: WorkspaceContextItem): IconName {
  if (item.kind === 'browser') return 'globe';
  if (item.kind === 'folder' || item.kind === 'design-files') return 'folder';
  if (item.kind === 'terminal') return 'terminal';
  if (item.kind === 'side-chat') return 'comment';
  if (item.kind === 'design-system') return 'blocks';
  return 'file';
}

function workspaceContextTitle(item: WorkspaceContextItem): string {
  return [
    workspaceContextKindLabel(item.kind),
    item.path ? `path: ${item.path}` : null,
    item.absolutePath ? `absolute: ${item.absolutePath}` : null,
    item.url ? `url: ${item.url}` : null,
    item.title ? `title: ${item.title}` : null,
  ].filter(Boolean).join(' | ');
}

function workspaceContextDescription(item: WorkspaceContextItem): string {
  const embed = isTeamverEmbedMode();
  if (item.kind === 'design-files') {
    return item.path || (embed ? '프로젝트 파일' : 'Project files');
  }
  if (item.kind === 'terminal') {
    return item.title || (embed ? '터미널 세션' : 'Terminal session');
  }
  if (item.kind === 'browser') {
    return item.url || item.title || (embed ? '브라우저' : 'Browser');
  }
  return item.url || item.path || item.absolutePath || item.title || item.tabId || item.id;
}

function lastPathSegment(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || path;
}

function projectFileMentionTitle(file: ProjectFile, fallback: string): string {
  return file.name || lastPathSegment(fallback);
}

function projectFileMentionDescription(file: ProjectFile, fallback: string): string {
  const label = projectFileMentionTitle(file, fallback);
  if (fallback && fallback !== label) return fallback;
  return [file.kind, file.mime].filter(Boolean).join(' · ');
}

function workspaceContextSearchText(item: WorkspaceContextItem): string {
  return [
    item.id,
    item.kind,
    item.label,
    item.tabId ?? '',
    item.path ?? '',
    item.absolutePath ?? '',
    item.url ?? '',
    item.title ?? '',
  ].join(' ');
}

function workspaceContextKindLabel(kind: WorkspaceContextItem['kind']): string {
  if (isTeamverEmbedMode()) {
    switch (kind) {
      case 'browser':
        return '브라우저';
      case 'design-files':
        return '디자인 파일';
      case 'design-system':
        return '디자인 시스템';
      case 'folder':
        return '폴더';
      case 'terminal':
        return '터미널';
      case 'side-chat':
        return '사이드 채팅';
      case 'live-artifact':
        return '라이브 산출물';
      case 'file':
      default:
        return '파일';
    }
  }
  switch (kind) {
    case 'browser':
      return 'Browser';
    case 'design-files':
      return 'Design files';
    case 'design-system':
      return 'Design system';
    case 'folder':
      return 'Folder';
    case 'terminal':
      return 'Terminal';
    case 'side-chat':
      return 'Side chat';
    case 'live-artifact':
      return 'Live artifact';
    case 'file':
    default:
      return 'File';
  }
}

function mcpServerFromProjectContextRef(ref: ProjectContextMcpServerRef): McpServerConfig {
  const transport =
    ref.transport === 'sse' || ref.transport === 'http' || ref.transport === 'stdio'
      ? ref.transport
      : 'stdio';
  return {
    id: ref.id,
    enabled: true,
    transport,
    ...(ref.label ? { label: ref.label } : {}),
    ...(ref.url ? { url: ref.url } : {}),
    ...(ref.command ? { command: ref.command } : {}),
  };
}

function connectorFromProjectContextRef(ref: ProjectContextConnectorRef): ConnectorDetail {
  const status =
    ref.status === 'connected'
    || ref.status === 'available'
    || ref.status === 'error'
    || ref.status === 'disabled'
      ? ref.status
      : 'connected';
  return {
    id: ref.id,
    name: ref.name,
    provider: ref.provider ?? 'unknown',
    category: ref.category ?? 'other',
    status,
    tools: [],
    ...(ref.description ? { description: ref.description } : {}),
    ...(ref.accountLabel ? { accountLabel: ref.accountLabel } : {}),
  };
}

function mergeStagedMcpFromProjectContext(
  current: McpServerConfig[],
  refs: ProjectContextMcpServerRef[],
): McpServerConfig[] {
  if (refs.length === 0) return current;
  const byId = new Map(current.map((server) => [server.id, server]));
  let changed = false;
  for (const ref of refs) {
    const id = ref.id?.trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, mcpServerFromProjectContextRef({ ...ref, id }));
    changed = true;
  }
  return changed ? [...byId.values()] : current;
}

function reconcileStagedMcpFromProjectContext(
  current: McpServerConfig[],
  refs: ProjectContextMcpServerRef[],
  previouslyPinnedIds: ReadonlySet<string>,
): McpServerConfig[] {
  const merged = mergeStagedMcpFromProjectContext(current, refs);
  const pinnedIds = new Set(
    refs.map((ref) => ref.id?.trim()).filter((id): id is string => Boolean(id)),
  );
  const next = merged.filter((server) => {
    if (pinnedIds.has(server.id)) return true;
    if (previouslyPinnedIds.has(server.id)) return false;
    return true;
  });
  return next.length === merged.length && next.every((s, i) => s === merged[i])
    ? merged
    : next;
}

function mergeStagedConnectorsFromProjectContext(
  current: ConnectorDetail[],
  refs: ProjectContextConnectorRef[],
): ConnectorDetail[] {
  if (refs.length === 0) return current;
  const byId = new Map(current.map((connector) => [connector.id, connector]));
  let changed = false;
  for (const ref of refs) {
    const id = ref.id?.trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, connectorFromProjectContextRef({ ...ref, id }));
    changed = true;
  }
  return changed ? [...byId.values()] : current;
}

function reconcileStagedConnectorsFromProjectContext(
  current: ConnectorDetail[],
  refs: ProjectContextConnectorRef[],
  previouslyPinnedIds: ReadonlySet<string>,
): ConnectorDetail[] {
  const merged = mergeStagedConnectorsFromProjectContext(current, refs);
  const pinnedIds = new Set(
    refs.map((ref) => ref.id?.trim()).filter((id): id is string => Boolean(id)),
  );
  const next = merged.filter((connector) => {
    if (pinnedIds.has(connector.id)) return true;
    if (previouslyPinnedIds.has(connector.id)) return false;
    return true;
  });
  return next.length === merged.length && next.every((c, i) => c === merged[i])
    ? merged
    : next;
}

function StagedRunContexts({
  designSystemPicker,
  workspaceItems,
  currentWorkspaceContextId,
  skills,
  mcpServers,
  connectors,
  attachments,
  pluginChip,
  projectId,
  projectFileNames,
  onRemoveWorkspace,
  onRemoveSkill,
  onRemoveMcp,
  onRemoveConnector,
  onRemoveAttachment,
  onRemovePlugin,
  onPluginDetails,
  attachmentPreviewUrl,
  t,
}: {
  designSystemPicker?: ReactNode;
  workspaceItems: WorkspaceContextItem[];
  currentWorkspaceContextId: string | null;
  skills: SkillSummary[];
  mcpServers: McpServerConfig[];
  connectors: ConnectorDetail[];
  attachments: ChatAttachment[];
  pluginChip?: { id: string; title: string } | null;
  projectId: string | null;
  projectFileNames?: readonly string[];
  attachmentPreviewUrl?: (attachment: ChatAttachment) => string | null;
  onRemoveWorkspace: (id: string) => void;
  onRemoveSkill: (id: string) => void;
  onRemoveMcp: (id: string) => void;
  onRemoveConnector: (id: string) => void;
  onRemoveAttachment: (path: string) => void;
  onRemovePlugin?: () => void;
  onPluginDetails?: (id: string) => void;
  t: TranslateFn;
}) {
  // Attachment thumbnails preview in a portal modal; keep that state here so the
  // file chips can live in the same wrap row as the design-system picker and
  // other run-context chips (so files flow to the picker's right, wrapping to a
  // new line only when the row fills) instead of forcing a separate row below.
  const [preview, setPreview] = useState<ChatAttachment | null>(null);
  const projectFileNameSet = useMemo(
    () => new Set(projectFileNames ?? []),
    [projectFileNames],
  );
  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);
  return (
    <>
    <div
      className="staged-row staged-context-row"
      data-testid="staged-contexts"
    >
      {designSystemPicker ? (
        <div className="staged-context-picker staged-context-picker--design-system">
          {designSystemPicker}
        </div>
      ) : null}
      {pluginChip ? (
        <div className="staged-chip staged-context staged-context--plugin">
          {/* Two sibling controls — a details button (icon + name) and the
              remove button — rather than a role=button wrapper containing the
              remove button. Nested interactive controls break focus order and
              assistive-tech announcements. */}
          <button
            type="button"
            className="staged-context-open"
            onClick={() => onPluginDetails?.(pluginChip.id)}
            title={pluginChip.title}
            aria-label={pluginChip.title}
          >
            <span className="staged-icon" aria-hidden>
              <Icon name="sparkles" size={12} />
            </span>
            <span className="staged-name" title={pluginChip.title}>{pluginChip.title}</span>
          </button>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemovePlugin?.()}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: pluginChip.title })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ) : null}
      {workspaceItems.map((workspaceItem) => {
        const kindLabel =
          workspaceItem.id === currentWorkspaceContextId
            ? embedUiLabel('Current', '현재')
            : workspaceContextKindLabel(workspaceItem.kind);
        return (
          <div
            key={workspaceItem.id}
            className={`staged-chip staged-context staged-context--workspace staged-context--workspace-${workspaceItem.kind}`}
          >
            <span className="staged-icon" aria-hidden>
              <Icon name={workspaceContextIcon(workspaceItem)} size={12} />
            </span>
            <span className="staged-name" title={workspaceContextTitle(workspaceItem)}>
              <span className="staged-context-kind">{kindLabel}</span>
              {workspaceItem.label}
            </span>
            <button
              type="button"
              className="staged-remove od-tooltip"
              onClick={() => onRemoveWorkspace(workspaceItem.id)}
              title={t('common.delete')}
              data-tooltip={t('common.delete')}
              aria-label={t('chat.removeAria', { name: workspaceItem.label })}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
      {skills.map((s) => (
        <div
          key={s.id}
          className={`staged-chip staged-context staged-context--skill staged-skill-${s.source ?? 'built-in'}`}
        >
          <span className="staged-icon" aria-hidden>
            <Icon name="sparkles" size={12} />
          </span>
          <span className="staged-name" title={s.description || s.name}>
            @{s.name}
          </span>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemoveSkill(s.id)}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: s.name })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
      {mcpServers.map((server) => {
        const label = server.label || server.id;
        return (
          <div
            key={server.id}
            className="staged-chip staged-context staged-context--mcp"
          >
            <span className="staged-icon" aria-hidden>
              <Icon name="link" size={12} />
            </span>
            <span className="staged-name" title={server.command || server.url || server.id}>
              @{label}
            </span>
            <button
              type="button"
              className="staged-remove od-tooltip"
              onClick={() => onRemoveMcp(server.id)}
              title={t('common.delete')}
              data-tooltip={t('common.delete')}
              aria-label={t('chat.removeAria', { name: label })}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
      {connectors.map((connector) => (
        <div
          key={connector.id}
          className="staged-chip staged-context staged-context--connector"
        >
          <span className="staged-icon" aria-hidden>
            <Icon name="link" size={12} />
          </span>
          <span className="staged-name" title={connector.accountLabel ?? connector.provider}>
            @{connector.name}
          </span>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemoveConnector(connector.id)}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: connector.name })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
      {attachments.map((a, index) => {
        const localPreview = attachmentPreviewUrl?.(a) ?? null;
        const canPreview = a.kind === 'image' && Boolean(projectId || localPreview);
        const embed = isTeamverEmbedMode();
        return (
          <div key={a.path} className={`staged-chip staged-${a.kind}`}>
            <span
              className="staged-order"
              aria-label={embed ? `첨부 ${index + 1}` : `Attachment ${index + 1}`}
            >
              {index + 1}
            </span>
            {canPreview ? (
              <button
                type="button"
                className="staged-preview-trigger"
                onClick={() => setPreview(a)}
                title={a.path}
                aria-label={embed ? `${a.name} 미리보기` : `Preview ${a.name}`}
              >
                {localPreview ? (
                  <img src={localPreview} alt="" decoding="async" />
                ) : (
                  <AuthenticatedProjectFileImage
                    projectId={projectId!}
                    path={a.path}
                    alt=""
                    className=""
                    fetchEnabled
                    // Fresh staged uploads may race `/files`; non-drawing
                    // attachments can trustExists. Ephemeral drawings rely on
                    // localPreview above or a single missing-cached probe.
                    trustExists={!isEphemeralDrawingScreenshotPath(a.path)}
                    // HA pod S3 sync-up→sync-down race for freshly-uploaded
                    // images: opt into the brief background retry ladder so
                    // the chip does not settle on the failed glyph before
                    // scratch fills. Chat history chips already do this.
                    allowBackgroundRetry={!isEphemeralDrawingScreenshotPath(a.path)}
                  />
                )}
                <span className="staged-name">{a.name}</span>
              </button>
            ) : (
              <>
                <span className="staged-icon" aria-hidden>
                  <Icon name="file" size={13} />
                </span>
                <span className="staged-name" title={a.path}>
                  {a.name}
                </span>
              </>
            )}
            {a.source?.type === 'teamver-drive' ? (
              <a
                className="staged-source-link od-tooltip"
                href={resolveTeamverDriveAssetUrl(a.source.assetId)}
                target="_blank"
                rel="noreferrer"
                title="Teamver 드라이브에서 원본 열기"
                data-tooltip="Teamver 드라이브에서 원본 열기"
                aria-label={`${a.name} 원본을 Teamver 드라이브에서 열기`}
              >
                <Icon name="external-link" size={11} />
              </a>
            ) : null}
            <button
              type="button"
              className="staged-remove od-tooltip"
              onClick={() => onRemoveAttachment(a.path)}
              title={t('common.delete')}
              data-tooltip={t('common.delete')}
              aria-label={t('chat.removeAria', { name: a.name })}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
    </div>
    {preview && projectId ? createPortal(
      <div
        className="staged-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={preview.name}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setPreview(null);
        }}
      >
        <div className="staged-preview-card">
          <div className="staged-preview-head">
            <span title={preview.path}>{preview.name}</span>
            <button
              type="button"
              className="icon-only od-tooltip"
              onClick={() => setPreview(null)}
              aria-label={t('common.close')}
              title={t('common.close')}
              data-tooltip={t('common.close')}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          {attachmentPreviewUrl?.(preview) ? (
            <img src={attachmentPreviewUrl(preview)!} alt={preview.name} decoding="async" />
          ) : (
            <AuthenticatedProjectFileImage
              projectId={projectId}
              path={preview.path}
              alt={preview.name}
              fetchEnabled
              trustExists
            />
          )}
        </div>
      </div>,
      document.body
    ) : null}
    </>
  );
}

function StagedCommentAttachments({
  attachments,
  projectId,
  projectFileNames,
  attachmentPreviewUrl,
  onRemove,
  t,
}: {
  attachments: ChatCommentAttachment[];
  projectId: string | null;
  projectFileNames?: readonly string[];
  attachmentPreviewUrl?: (path: string) => string | null;
  onRemove: (id: string) => void;
  t: TranslateFn;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="staged-row comment-staged-row" data-testid="staged-comment-attachments">
      {attachments.map((a) => (
        <VisualCommentAttachmentChip
          key={a.id}
          attachment={a}
          projectId={projectId}
          projectFileNames={projectFileNames}
          localPreviewUrl={
            a.screenshotPath ? attachmentPreviewUrl?.(a.screenshotPath) ?? null : null
          }
          onRemove={onRemove}
          showRemove
          t={t}
        />
      ))}
    </div>
  );
}

function ToolsPluginsPanel({
  plugins,
  activePluginId,
  onApply,
  onShowDetails,
}: {
  plugins: InstalledPluginRecord[];
  activePluginId: string | null;
  onApply: (record: InstalledPluginRecord) => void | Promise<void>;
  onShowDetails: (record: InstalledPluginRecord) => void;
}) {
  const { locale, t } = useI18n();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [source, setSource] = useState<'community' | 'mine'>('community');
  const [query, setQuery] = useState('');
  const communityPlugins = useMemo(
    () => plugins.filter((p) => p.sourceKind === 'bundled'),
    [plugins],
  );
  const userPlugins = useMemo(
    () => plugins.filter((p) => USER_PLUGIN_SOURCE_KINDS.has(p.sourceKind)),
    [plugins],
  );
  const scopedPlugins = source === 'community' ? communityPlugins : userPlugins;
  const visiblePlugins = useMemo(
    () => scopedPlugins.filter((p) => pluginMatchesQuery(p, query)),
    [scopedPlugins, query],
  );

  return (
    <>
      <div className="composer-tools-filter">
        <div className="composer-tools-segments" role="tablist" aria-label={t('chat.plusMenu.pluginSourceAria')}>
          <button
            type="button"
            role="tab"
            aria-selected={source === 'community'}
            className={`composer-tools-segment${source === 'community' ? ' active' : ''}`}
            onClick={() => setSource('community')}
            title={`${communityPlugins.length} ${t('chat.mentionPluginOfficial')}`}
          >
            {t('chat.mentionPluginOfficial')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === 'mine'}
            className={`composer-tools-segment${source === 'mine' ? ' active' : ''}`}
            onClick={() => setSource('mine')}
            title={`${userPlugins.length} ${t('chat.plusMenu.pluginsMine')}`}
          >
            {t('chat.plusMenu.pluginsMine')}
          </button>
        </div>
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('chat.plusMenu.searchPlugins')}
          aria-label={t('chat.plusMenu.searchPlugins')}
        />
      </div>
      {visiblePlugins.length === 0 ? (
        <div className="composer-tools-empty">
          {plugins.length === 0 ? (
            <>
              {embedUiLabel(
                'No plugins installed yet. Browse Official or add your own with ',
                '아직 설치된 플러그인이 없습니다. Official을 둘러보거나 ',
              )}
              <code>od plugin install &lt;source&gt;</code>
              {embedUiLabel('.', ' 로 추가하세요.')}
            </>
          ) : query ? (
            <>
              {embedUiLabel(
                `No ${source === 'community' ? 'Official' : 'My plugins'} results for “${query}”.`,
                `${source === 'community' ? 'Official' : '내 플러그인'}에서 “${query}” 결과가 없습니다.`,
              )}
            </>
          ) : (
            <>
              {embedUiLabel(
                `No ${source === 'community' ? 'Official' : 'My plugins'} plugins available.`,
                `${source === 'community' ? 'Official' : '내 플러그인'}에 사용 가능한 플러그인이 없습니다.`,
              )}
            </>
          )}
        </div>
      ) : (
        <div className="composer-tools-list">
          {visiblePlugins.map((p) => {
            const pluginTitle = localizePluginTitle(locale, p);
            const pluginDescription = localizePluginDescription(locale, p);
            return (
            <div
              key={p.id}
              className={`composer-tools-row composer-tools-row--plugin${
                p.id === activePluginId ? ' active' : ''
              }`}
            >
              <button
                type="button"
                className="composer-tools-row-main"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setPendingId(p.id);
                  try {
                    await onApply(p);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={pendingId !== null}
                aria-busy={pendingId === p.id ? 'true' : undefined}
                title={pluginDescription || pluginTitle}
              >
                <Icon name="sparkles" size={12} />
                <span className="composer-tools-row-body">
                  <strong>{pluginTitle}</strong>
                  {pluginDescription ? (
                    <span className="composer-tools-row-meta">
                      {pluginDescription}
                    </span>
                  ) : (
                    <span className="composer-tools-row-meta">{p.id}</span>
                  )}
                </span>
                {pendingId === p.id ? (
                  <span className="composer-tools-row-pending">Applying…</span>
                ) : null}
              </button>
              <button
                type="button"
                className="composer-tools-row-side"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onShowDetails(p)}
                title={`View details for ${pluginTitle}`}
                aria-label={`View details for ${pluginTitle}`}
              >
                <Icon name="eye" size={12} />
              </button>
            </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ToolsMcpPanel({
  servers,
  templates,
  onInsert,
  onManage,
}: {
  servers: McpServerConfig[];
  templates: McpTemplate[];
  onInsert: (serverId: string) => void;
  onManage: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const visibleServers = useMemo(
    () => servers.filter((s) => mcpServerMatchesQuery(s, query)),
    [servers, query],
  );
  const visibleTemplates = useMemo(
    () => templates.filter((tpl) => mcpTemplateMatchesQuery(tpl, query)).slice(0, 8),
    [templates, query],
  );

  return (
    <>
      <div className="composer-tools-filter">
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('chat.plusMenu.searchMcp')}
          aria-label={t('chat.plusMenu.searchMcp')}
        />
      </div>
      {visibleServers.length === 0 ? (
        <div className="composer-tools-empty">
          {servers.length === 0
            ? embedUiLabel(
                'No enabled MCP servers configured yet.',
                '활성화된 MCP 서버가 아직 없습니다.',
              )
            : embedUiLabel(
                `No configured MCP results for “${query}”.`,
                `“${query}”에 맞는 MCP 결과가 없습니다.`,
              )}
        </div>
      ) : (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">{t('settings.mediaProviderConfigured')}</div>
          {visibleServers.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              className="composer-tools-row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(s.id)}
              title={`Insert a hint that nudges the model to use ${s.label || s.id}`}
            >
              <Icon name="link" size={12} />
              <span className="composer-tools-row-body">
                <strong>{s.label || s.id}</strong>
                <span className="composer-tools-row-meta">{s.transport}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {visibleTemplates.length > 0 ? (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">{t('chat.plusMenu.mcpTemplates')}</div>
          {visibleTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              role="menuitem"
              className="composer-tools-row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onManage}
              title={`Add ${tpl.label} from Settings`}
            >
              <Icon name="plus" size={12} />
              <span className="composer-tools-row-body">
                <strong>{tpl.label}</strong>
                <span className="composer-tools-row-meta">
                  {tpl.transport}
                  {tpl.category ? ` · ${tpl.category}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="composer-tools-row composer-tools-row-action"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onManage}
      >
        <Icon name="settings" size={12} />
        <span>Manage MCP servers…</span>
      </button>
    </>
  );
}

function DesignToolboxPanel({
  actions,
  skills,
  plugins,
  mcpServers,
  mcpTemplates,
  connectors,
  projectFiles,
  activeSkillIds,
  activePluginId,
  activeMcpServerIds,
  activeConnectorIds,
  activeFilePaths,
  onPickAction,
  onPickSkill,
  onPickResource,
  onOpened,
  teamverBranded = false,
}: {
  actions: DesignToolboxAction[];
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  projectFiles: ProjectFile[];
  activeSkillIds: string[];
  activePluginId: string | null;
  activeMcpServerIds: string[];
  activeConnectorIds: string[];
  activeFilePaths: string[];
  onPickAction: (action: DesignToolboxAction) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickResource: (resource: DesignToolboxResource) => void;
  onOpened?: () => void;
  teamverBranded?: boolean;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  // Fire once when the toolbox panel mounts (i.e. the user opened it).
  useEffect(() => {
    onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const activeSkillSet = useMemo(() => new Set(activeSkillIds), [activeSkillIds]);
  const activeMcpServerSet = useMemo(() => new Set(activeMcpServerIds), [activeMcpServerIds]);
  const activeConnectorSet = useMemo(() => new Set(activeConnectorIds), [activeConnectorIds]);
  const activeFileSet = useMemo(() => new Set(activeFilePaths), [activeFilePaths]);
  const resources = useMemo(
    () =>
      buildDesignToolboxResources({
        skills,
        plugins,
        mcpServers,
        mcpTemplates,
        connectors,
        projectFiles,
        locale,
        t,
        teamverBranded,
      }),
    [connectors, locale, mcpServers, mcpTemplates, plugins, projectFiles, skills, t, teamverBranded],
  );
  const visibleActions = useMemo(
    () =>
      actions.filter((action) => {
        const skill = findDesignToolboxSkill(action, skills);
        return designToolboxActionMatchesQuery(
          action,
          query,
          skill,
          t,
          skill ? [localizeSkillName(locale, skill), localizeSkillDescription(locale, skill)] : [],
        );
      }),
    [actions, query, skills, locale, t],
  );
  const visibleResources = useMemo(
    () => {
      const source = query
        ? resources.filter((resource) => designToolboxResourceMatchesQuery(resource, query))
        : designToolboxDefaultResources(actions, resources);
      return source.slice(0, query ? 14 : 8);
    },
    [actions, query, resources],
  );

  // One shared hover-detail panel for the whole list — swapping a single
  // portaled panel as the cursor sweeps rows, instead of one panel per row
  // (which ghosted: the close delay left several stacked on screen at once).
  const [toolboxDetail, setToolboxDetail] = useState<{
    key: string;
    left: number;
    top: number;
    node: ReactNode;
  } | null>(null);
  const detailCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelDetailClose() {
    if (detailCloseTimer.current) {
      clearTimeout(detailCloseTimer.current);
      detailCloseTimer.current = null;
    }
  }
  function showToolboxDetail(key: string, rect: DOMRect, node: ReactNode) {
    cancelDetailClose();
    // Plugin rows render a tall visual preview; the helper clamps both axes
    // into the viewport so the fixed panel never lands off-screen on a
    // narrow pane (see computeToolboxDetailPosition).
    const { left, top } = computeToolboxDetailPosition(
      rect,
      { width: window.innerWidth, height: window.innerHeight },
      { detailWidth: 264, gap: 8, margin: 8, estimatedHeight: 340 },
    );
    setToolboxDetail({ key, left, top, node });
  }
  function scheduleToolboxDetailClose(key: string) {
    cancelDetailClose();
    detailCloseTimer.current = setTimeout(() => {
      setToolboxDetail((cur) => (cur?.key === key ? null : cur));
      detailCloseTimer.current = null;
    }, 160);
  }
  useEffect(() => () => cancelDetailClose(), []);

  return (
    <>
      <div className="composer-design-toolbox-head">
        <div className="composer-design-toolbox-title">
          <Icon name="lightbulb" size={14} />
          <span>{t('chat.designToolbox.title')}</span>
        </div>
      </div>
      <div className="plus-menu__search">
        <Icon name="search" size={13} />
        <input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('chat.designToolbox.searchPlaceholder')}
          aria-label={t('chat.designToolbox.searchAria')}
        />
      </div>
      {visibleActions.length > 0 || visibleResources.length > 0 ? (
        <div className="plus-menu__list">
          {visibleActions.length > 0 ? (
            <div className="plus-menu__section-label">
              {t('chat.designToolbox.followupSection')}
            </div>
          ) : null}
          {visibleActions.map((action) => {
            const skill = findDesignToolboxSkill(action, skills);
            const actionTitle = designToolboxActionTitle(action, t);
            const actionDescription = designToolboxActionDescription(action, t);
            const skillName = skill ? localizeSkillName(locale, skill) : null;
            return (
              <ToolboxItemRow
                key={action.id}
                detailKey={action.id}
                icon={action.icon}
                name={actionTitle}
                onHover={showToolboxDetail}
                onLeave={scheduleToolboxDetailClose}
                onPick={() => onPickAction(action)}
                detail={
                  <>
                    <div className="plus-menu__detail-title">{actionTitle}</div>
                    {actionDescription ? (
                      <div className="plus-menu__detail-desc">{actionDescription}</div>
                    ) : null}
                    {skillName ? (
                      <div className="plus-menu__detail-skill">@{skillName}</div>
                    ) : null}
                    <div className="plus-menu__detail-badge">
                      {designToolboxActionBadge(action, t)}
                    </div>
                  </>
                }
              />
            );
          })}
          {visibleResources.length > 0 ? (
            <div className="plus-menu__section-label">
              {t('chat.designToolbox.resourcesSection')}
            </div>
          ) : null}
          {visibleResources.map((resource) => {
            const active = designToolboxResourceIsActive(resource, {
              skillIds: activeSkillSet,
              pluginId: activePluginId,
              mcpServerIds: activeMcpServerSet,
              connectorIds: activeConnectorSet,
              filePaths: activeFileSet,
            });
            return (
              <ToolboxItemRow
                key={resource.key}
                detailKey={resource.key}
                icon={resource.icon}
                name={resource.title}
                active={active}
                onHover={showToolboxDetail}
                onLeave={scheduleToolboxDetailClose}
                onPick={() => {
                  if (resource.kind === 'skill') {
                    onPickSkill(resource.skill);
                  } else {
                    onPickResource(resource);
                  }
                }}
                detail={
                  // Plugin rows reuse the rich visual preview (poster /
                  // sandboxed example iframe + meta); every other kind keeps
                  // the compact text detail since it has no preview asset.
                  resource.kind === 'plugin' ? (
                    <ComposerPluginPreview record={resource.plugin} locale={locale} />
                  ) : (
                    <>
                      <div className="plus-menu__detail-title">{resource.title}</div>
                      {resource.subtitle ? (
                        <div className="plus-menu__detail-desc">{resource.subtitle}</div>
                      ) : null}
                      <div className="plus-menu__detail-skill">
                        {designToolboxResourceKindLabel(resource.kind, t)}
                      </div>
                      <div className="plus-menu__detail-badge">
                        {active ? t('chat.designToolbox.selected') : resource.badge}
                      </div>
                    </>
                  )
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="plus-menu__empty">
          {t('chat.designToolbox.noResources', { query })}
        </div>
      )}
      {toolboxDetail
        ? createPortal(
            <div
              className="plus-menu__detail"
              style={{ left: toolboxDetail.left, top: toolboxDetail.top }}
              onMouseEnter={cancelDetailClose}
              onMouseLeave={() => scheduleToolboxDetailClose(toolboxDetail.key)}
            >
              {toolboxDetail.node}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// A single toolbox row, styled like the Connectors/Plugins submenu rows
// (single line: icon + name). Clicking applies the entry; hovering shows a
// third-level detail panel (title / description / @skill / badge). The detail
// panel is PORTALED to <body> because the parent flyout uses `overflow-y: auto`
// (height-capped scroll) which would otherwise clip a nested panel.
// The hover detail panel is owned by the PARENT
// (DesignToolboxPanel) as ONE shared panel — not per-row — so sweeping across
// rows swaps the single panel in place instead of stacking several portaled
// panels that briefly coexist (the close delay would otherwise leave 2-4 of
// them on screen at once, reading as ghosting). The row just reports hover
// enter/leave with its rect + detail node.
function ToolboxItemRow({
  icon,
  name,
  active,
  detailKey,
  detail,
  onHover,
  onLeave,
  onPick,
}: {
  icon: IconName;
  name: string;
  active?: boolean;
  detailKey: string;
  detail: ReactNode;
  onHover: (key: string, rect: DOMRect, detail: ReactNode) => void;
  onLeave: (key: string) => void;
  onPick: () => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={rowRef}
      className="plus-menu__subitem"
      onMouseEnter={() => {
        const r = rowRef.current?.getBoundingClientRect();
        if (r) onHover(detailKey, r, detail);
      }}
      onMouseLeave={() => onLeave(detailKey)}
    >
      <button
        type="button"
        role="menuitem"
        className={`plus-menu__item${active ? ' is-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPick}
      >
        <Icon name={icon} size={15} className="plus-menu__item-icon" />
        <span>{name}</span>
      </button>
    </div>
  );
}

function ToolsSkillsPanel({
  skills,
  currentSkillId,
  onPick,
}: {
  skills: SkillSummary[];
  currentSkillId: string | null;
  onPick: (skill: SkillSummary) => void | Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const visibleSkills = useMemo(
    () => skills.filter((s) => skillMatchesQuery(s, query)).slice(0, 24),
    [skills, query],
  );
  return (
    <>
      <div className="composer-tools-filter">
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('chat.plusMenu.searchSkills')}
          aria-label={t('chat.plusMenu.searchSkills')}
        />
      </div>
      {visibleSkills.length === 0 ? (
        <div className="composer-tools-empty">
          {skills.length === 0
            ? embedUiLabel('No skills available yet.', '사용 가능한 스킬이 아직 없습니다.')
            : embedUiLabel(
                `No skills found for “${query}”.`,
                `“${query}”에 맞는 스킬이 없습니다.`,
              )}
        </div>
      ) : (
        <div className="composer-tools-list">
          {visibleSkills.map((skill) => {
            const active = skill.id === currentSkillId;
            return (
              <button
                key={skill.id}
                type="button"
                role="menuitem"
                className={`composer-tools-row${active ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setPendingId(skill.id);
                  try {
                    await onPick(skill);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={pendingId !== null}
                title={localizeSkillDescription(locale, skill)}
              >
                <Icon name={active ? 'check' : 'file'} size={12} />
                <span className="composer-tools-row-body">
                  <strong>{localizeSkillName(locale, skill)}</strong>
                  <span className="composer-tools-row-meta">
                    {skill.mode}
                    {skill.surface ? ` · ${skill.surface}` : ''}
                  </span>
                </span>
                {pendingId === skill.id ? (
                  <span className="composer-tools-row-pending">Applying…</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function pluginMatchesQuery(plugin: InstalledPluginRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    plugin.title,
    plugin.id,
    plugin.sourceKind,
    plugin.source,
    plugin.manifest?.description ?? '',
    ...(plugin.manifest?.tags ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}


function buildDesignToolboxResources({
  skills,
  plugins,
  mcpServers,
  mcpTemplates,
  connectors,
  projectFiles,
  locale,
  t,
  teamverBranded,
}: DesignToolboxResourceIndex & {
  locale: Locale;
  t: TranslateFn;
  teamverBranded?: boolean;
}): DesignToolboxResource[] {
  const resources: DesignToolboxResource[] = [];
  const teamverEmbed = teamverBranded || isTeamverEmbedMode();

  for (const skill of skills) {
    if (teamverEmbed && shouldHideTeamverToolboxSkill(skill, locale)) {
      continue;
    }
    const title = teamverEmbed
      ? teamverToolboxSkillTitle(locale, skill)
      : localizeSkillName(locale, skill);
    const subtitle = teamverEmbed
      ? teamverToolboxSkillDescription(locale, skill)
      : localizeSkillDescription(locale, skill);
    resources.push({
      key: `skill:${skill.id}`,
      kind: 'skill',
      id: skill.id,
      title,
      subtitle,
      badge: designToolboxSkillBadge(skill, t),
      icon: designToolboxSkillIcon(skill),
      searchText: [
        'skill',
        skill.id,
        skill.name,
        title,
        subtitle,
        skill.mode,
        skill.surface ?? '',
        skill.category ?? '',
        ...skill.triggers,
      ].join(' '),
      skill,
    });
  }

  for (const plugin of plugins) {
    if (teamverEmbed && shouldHideTeamverToolboxPlugin(plugin, locale)) {
      continue;
    }
    const title = teamverEmbed
      ? teamverToolboxPluginTitle(locale, plugin)
      : localizePluginTitle(locale, plugin);
    const subtitle = teamverEmbed
      ? teamverToolboxPluginDescription(locale, plugin) || plugin.id
      : localizePluginDescription(locale, plugin) || plugin.id;
    resources.push({
      key: `plugin:${plugin.id}`,
      kind: 'plugin',
      id: plugin.id,
      title,
      subtitle,
      badge: plugin.manifest?.od?.kind ?? 'plugin',
      icon: 'sparkles',
      searchText: [
        'plugin',
        plugin.id,
        plugin.title,
        plugin.sourceKind,
        plugin.source,
        subtitle,
        ...(plugin.manifest?.tags ?? []),
        plugin.manifest?.od?.kind ?? '',
        plugin.manifest?.od?.scenario ?? '',
        plugin.manifest?.od?.mode ?? '',
      ].join(' '),
      plugin,
    });
  }

  for (const server of mcpServers) {
    const title = server.label || server.id;
    const subtitle = server.command || server.url || server.transport;
    resources.push({
      key: `mcp:${server.id}`,
      kind: 'mcp',
      id: server.id,
      title,
      subtitle,
      badge: 'MCP',
      icon: 'link',
      searchText: [
        'mcp',
        server.id,
        title,
        subtitle,
        server.transport,
        server.templateId ?? '',
      ].join(' '),
      server,
    });
  }

  for (const template of mcpTemplates) {
    resources.push({
      key: `mcp-template:${template.id}`,
      kind: 'mcp-template',
      id: template.id,
      title: template.label,
      subtitle: template.description,
      badge: template.category,
      icon: 'plus',
      searchText: [
        'mcp template',
        template.id,
        template.label,
        template.description,
        template.transport,
        template.category,
        template.homepage ?? '',
        template.example ?? '',
      ].join(' '),
      template,
    });
  }

  for (const connector of connectors) {
    const toolCount = connector.toolCount ?? connector.tools.length;
    resources.push({
      key: `connector:${connector.id}`,
      kind: 'connector',
      id: connector.id,
      title: connector.name,
      subtitle: [
        connector.description ?? connector.provider,
        toolCount > 0 ? `${toolCount} tools` : null,
        connector.accountLabel ?? null,
      ].filter(Boolean).join(' · '),
      badge: connector.category || 'connector',
      icon: 'link',
      searchText: [
        'connector',
        connector.id,
        connector.name,
        connector.provider,
        connector.category,
        connector.description ?? '',
        connector.accountLabel ?? '',
        ...(connector.featuredToolNames ?? []),
        ...(connector.allowedToolNames ?? []),
        ...connector.tools.slice(0, 20).flatMap((tool) => [tool.name, tool.title, tool.description ?? '']),
      ].join(' '),
      connector,
    });
  }

  const seenFiles = new Set<string>();
  for (const file of projectFiles) {
    if (file.type === 'dir') continue;
    const path = file.path ?? file.name;
    if (!path || seenFiles.has(path)) continue;
    seenFiles.add(path);
    resources.push({
      key: `file:${path}`,
      kind: 'file',
      id: path,
      title: path,
      subtitle: [file.kind, file.mime, file.artifactKind ?? ''].filter(Boolean).join(' · '),
      badge: file.artifactKind ?? file.kind,
      icon: looksLikeImage(path) ? 'image' : 'file',
      searchText: [
        'file',
        'design file',
        path,
        file.name,
        file.kind,
        file.mime,
        file.artifactKind ?? '',
      ].join(' '),
      file,
    });
  }

  return resources;
}

function designToolboxResourceMatchesQuery(
  resource: DesignToolboxResource,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return resource.searchText.toLowerCase().includes(q);
}

function designToolboxDefaultResources(
  actions: DesignToolboxAction[],
  resources: DesignToolboxResource[],
): DesignToolboxResource[] {
  const out: DesignToolboxResource[] = [];
  const seen = new Set<string>();
  function add(resource: DesignToolboxResource | null | undefined) {
    if (!resource || seen.has(resource.key)) return;
    seen.add(resource.key);
    out.push(resource);
  }
  function addByKindId(kind: DesignToolboxResourceKind, id: string) {
    add(resources.find((resource) => resource.kind === kind && resource.id === id));
  }

  addByKindId('skill', 'creative-director');
  for (const action of actions) {
    const skill = resources.find((resource) =>
      resource.kind === 'skill'
      && action.preferredSkillIds.some((id) => resource.skill.id === id || resource.skill.name === id),
    );
    add(skill);
  }
  for (const term of ['design', 'image', 'video', 'motion', 'figma']) {
    for (const resource of resources) {
      if (out.length >= 8) return out;
      if (resource.kind !== 'skill' && designToolboxResourceMatchesQuery(resource, term)) {
        add(resource);
      }
    }
  }
  return out;
}

function designToolboxResourceKindLabel(
  kind: DesignToolboxResourceKind,
  t: TranslateFn,
): string {
  switch (kind) {
    case 'skill':
      return t('chat.designToolbox.kind.skill');
    case 'plugin':
      return t('chat.designToolbox.kind.plugin');
    case 'mcp':
      return t('chat.designToolbox.kind.mcp');
    case 'mcp-template':
      return t('chat.designToolbox.kind.mcpTemplate');
    case 'connector':
      return t('chat.designToolbox.kind.connector');
    case 'file':
      return t('chat.designToolbox.kind.designFile');
  }
}

function designToolboxResourceIsActive(
  resource: DesignToolboxResource,
  active: {
    skillIds: Set<string>;
    pluginId: string | null;
    mcpServerIds: Set<string>;
    connectorIds: Set<string>;
    filePaths: Set<string>;
  },
): boolean {
  switch (resource.kind) {
    case 'skill':
      return active.skillIds.has(resource.skill.id);
    case 'plugin':
      return active.pluginId === resource.plugin.id;
    case 'mcp':
      return active.mcpServerIds.has(resource.server.id);
    case 'connector':
      return active.connectorIds.has(resource.connector.id);
    case 'file':
      return active.filePaths.has(resource.file.path ?? resource.file.name);
    case 'mcp-template':
      return false;
  }
}


function isDesignToolboxSkill(skill: SkillSummary): boolean {
  const category = skill.category ?? '';
  if (
    [
      'animation-motion',
      'creative-direction',
      'image-generation',
      'video-generation',
      'web-artifacts',
    ].includes(category)
  ) {
    return true;
  }
  return [
    'animation',
    'motion',
    'gsap',
    'polish',
    'critique',
    'taste',
    'anti slop',
    'anti ai',
    'image',
    'video',
    'frontend',
    'beautify',
  ].some((term) => skillMatchesQuery(skill, term));
}

function designToolboxDefaultSkills(
  actions: DesignToolboxAction[],
  skills: SkillSummary[],
): SkillSummary[] {
  const out: SkillSummary[] = [];
  const seen = new Set<string>();
  function add(skill: SkillSummary | null | undefined) {
    if (!skill || seen.has(skill.id)) return;
    seen.add(skill.id);
    out.push(skill);
  }
  for (const action of actions) {
    add(findDesignToolboxSkill(action, skills));
  }
  for (const action of actions) {
    for (const id of action.preferredSkillIds) {
      add(skills.find((skill) => skill.id === id || skill.name === id));
    }
  }
  return out;
}

function designToolboxSkillBadge(skill: SkillSummary, t: TranslateFn): string {
  if (skill.mode === 'video' || skill.category === 'video-generation') return t('chat.designToolbox.badge.video');
  if (skill.mode === 'image' || skill.category === 'image-generation') return t('chat.designToolbox.badge.image');
  if (skill.category === 'animation-motion') return t('chat.designToolbox.badge.motion');
  if (skill.category === 'creative-direction') return t('chat.designToolbox.badge.polish');
  return skill.mode;
}

function designToolboxSkillIcon(skill: SkillSummary): IconName {
  if (skill.mode === 'video' || skill.category === 'video-generation') return 'play';
  if (skill.mode === 'image' || skill.category === 'image-generation') return 'image';
  if (skill.category === 'animation-motion') return 'sliders';
  if (skill.category === 'creative-direction') return 'sparkles';
  return 'file';
}

function designToolboxContextLine(
  workspaceItem: WorkspaceContextItem | null,
  t: TranslateFn,
): string {
  if (!workspaceItem) {
    return t('chat.designToolbox.prompt.contextGeneric');
  }
  const label = workspaceItem.label || workspaceItem.path || workspaceItem.title || workspaceItem.id;
  return t('chat.designToolbox.prompt.contextSpecific', {
    kind: designToolboxWorkspaceKindLabel(workspaceItem.kind, t),
    label,
  });
}

function designToolboxDraftLine(activeDraft: string, t: TranslateFn): string {
  const trimmed = activeDraft.trim();
  if (!trimmed) return '';
  return t('chat.designToolbox.prompt.preserveDraft', { draft: trimmed });
}

function designToolboxWorkspaceKindLabel(
  kind: WorkspaceContextItem['kind'],
  t: TranslateFn,
): string {
  switch (kind) {
    case 'browser':
      return t('chat.designToolbox.context.browser');
    case 'design-files':
      return t('chat.designToolbox.context.designFiles');
    case 'design-system':
      return t('chat.designToolbox.context.designSystem');
    case 'folder':
      return t('chat.designToolbox.context.folder');
    case 'terminal':
      return t('chat.designToolbox.context.terminal');
    case 'side-chat':
      return t('chat.designToolbox.context.sideChat');
    case 'live-artifact':
      return t('chat.designToolbox.context.liveArtifact');
    case 'file':
    default:
      return t('chat.designToolbox.context.file');
  }
}

function designToolboxActionPrompt({
  action,
  skill,
  workspaceItem,
  activeDraft,
  resourceIndex,
  t,
}: {
  action: DesignToolboxAction;
  skill: SkillSummary | null;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
  t: TranslateFn;
}): string {
  const skillLine = skill
    ? t('chat.designToolbox.prompt.selectedSkill', { skill: skill.name })
    : t('chat.designToolbox.prompt.noSkill');
  const resourceLines = designToolboxResourceIndexLines(resourceIndex, t);
  const draftLine = designToolboxDraftLine(activeDraft, t);
  const base = [
    designToolboxContextLine(workspaceItem, t),
    skillLine,
    ...resourceLines,
    draftLine,
  ].filter(Boolean);

  switch (action.id) {
    case 'auto-match':
      return [
        ...base,
        t('chat.designToolbox.prompt.autoMatchIntro'),
        t('chat.designToolbox.prompt.autoMatchStep1'),
        t('chat.designToolbox.prompt.autoMatchStep2'),
        t('chat.designToolbox.prompt.autoMatchStep3'),
        t('chat.designToolbox.prompt.autoMatchStep4'),
      ].join('\n');
    case 'motion':
      return [
        ...base,
        t('chat.designToolbox.prompt.motion'),
      ].join('\n');
    case 'motion-polish':
      return [
        ...base,
        t('chat.designToolbox.prompt.motionPolish'),
      ].join('\n');
    case 'anti-ai-polish':
      return [
        ...base,
        t('chat.designToolbox.prompt.antiAiPolish'),
      ].join('\n');
    case 'visual-polish':
      return [
        ...base,
        t('chat.designToolbox.prompt.visualPolish'),
      ].join('\n');
    case 'image-gen':
      return [
        ...base,
        t('chat.designToolbox.prompt.imageGen'),
      ].join('\n');
    case 'video-gen':
      return [
        ...base,
        t('chat.designToolbox.prompt.videoGen'),
      ].join('\n');
  }
}

function designToolboxSkillPrompt({
  skill,
  workspaceItem,
  activeDraft,
  resourceIndex,
  t,
}: {
  skill: SkillSummary;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
  t: TranslateFn;
}): string {
  return [
    designToolboxContextLine(workspaceItem, t),
    t('chat.designToolbox.prompt.useSkill', { skill: skill.name }),
    ...designToolboxResourceIndexLines(resourceIndex, t),
    designToolboxDraftLine(activeDraft, t),
    t('chat.designToolbox.prompt.skillInstruction'),
  ].filter(Boolean).join('\n');
}

function designToolboxResourcePrompt({
  resource,
  workspaceItem,
  activeDraft,
  resourceIndex,
  t,
}: {
  resource: Exclude<DesignToolboxResource, { kind: 'skill' }>;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
  t: TranslateFn;
}): string {
  const base = [
    designToolboxContextLine(workspaceItem, t),
    t('chat.designToolbox.prompt.selectedResource', {
      kind: designToolboxResourceKindLabel(resource.kind, t),
      title: resource.title,
      id: resource.id,
    }),
    resource.subtitle ? t('chat.designToolbox.prompt.resourceDescription', { description: resource.subtitle }) : '',
    ...designToolboxResourceIndexLines(resourceIndex, t),
    designToolboxDraftLine(activeDraft, t),
  ].filter(Boolean);

  switch (resource.kind) {
    case 'plugin':
      return [
        ...base,
        t('chat.designToolbox.prompt.pluginResource'),
      ].join('\n');
    case 'mcp':
      return [
        ...base,
        t('chat.designToolbox.prompt.mcpResource'),
      ].join('\n');
    case 'mcp-template':
      return [
        ...base,
        t('chat.designToolbox.prompt.mcpTemplateResource'),
      ].join('\n');
    case 'connector':
      return [
        ...base,
        t('chat.designToolbox.prompt.connectorResource'),
      ].join('\n');
    case 'file':
      // Kept for callers/tests that still build a file resource prompt, but
      // the composer UX stages the file as an attachment instead of pasting
      // this block into the draft (see applyDesignToolboxResource).
      return [
        t('chat.designToolbox.prompt.selectedResource', {
          kind: designToolboxResourceKindLabel(resource.kind, t),
          title: resource.title,
          id: resource.id,
        }),
        t('chat.designToolbox.prompt.fileResource'),
      ].join('\n');
  }
}

function designToolboxResourceIndexLines(
  index: DesignToolboxResourceIndex,
  t: TranslateFn,
): string[] {
  const files = index.projectFiles
    .filter((file) => file.type !== 'dir')
    .map((file) => file.path ?? file.name);
  return [
    t('chat.designToolbox.prompt.resourceIndex', {
      skills: index.skills.length,
      plugins: index.plugins.length,
      mcpEnabled: index.mcpServers.length,
      mcpTemplates: index.mcpTemplates.length,
      connectors: index.connectors.length,
      files: files.length,
    }),
    designToolboxCompactLine(t('chat.designToolbox.prompt.searchableSkills'), index.skills.map((skill) => skill.name), 60, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.searchablePlugins'), index.plugins.map((plugin) => plugin.title), 40, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.availableMcp'), [
      ...index.mcpServers.map((server) => server.label || server.id),
      ...index.mcpTemplates.map((template) => t('chat.designToolbox.prompt.mcpTemplateName', { name: template.label })),
    ], 40, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.connectedConnectors'), index.connectors.map((connector) => connector.name), 30, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.referenceDesignFiles'), files, 40, t),
    t('chat.designToolbox.prompt.processRule'),
  ].filter(Boolean);
}

function designToolboxCompactLine(
  label: string,
  values: string[],
  limit: number,
  t: TranslateFn,
): string {
  const clean = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (clean.length === 0) return '';
  const shown = clean.slice(0, limit);
  const suffix = clean.length > shown.length
    ? t('chat.designToolbox.prompt.moreSuffix', { count: clean.length - shown.length })
    : '';
  return t('chat.designToolbox.prompt.compactLine', {
    label,
    values: shown.join(', '),
    suffix,
  });
}

function skillMentionRank(skill: SkillSummary, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const id = skill.id.toLowerCase();
  const name = skill.name.toLowerCase();
  if (id.startsWith(q) || name.startsWith(q)) return 0;
  return 1;
}

function mcpServerMatchesQuery(server: McpServerConfig, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    server.id,
    server.label ?? '',
    server.transport,
    server.url ?? '',
    server.command ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function mcpTemplateMatchesQuery(tpl: McpTemplate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    tpl.id,
    tpl.label,
    tpl.description,
    tpl.transport,
    tpl.category,
    tpl.homepage ?? '',
    tpl.example ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function pluginSourceLabel(plugin: InstalledPluginRecord, t: TranslateFn): string {
  return plugin.sourceKind === 'bundled' ? t('chat.mentionPluginOfficial') : t('chat.mentionPluginMine');
}

function ToolsImportPanel({
  t,
  onLinkFolder,
  currentDesignSystemId,
  onSwitchDesignSystem,
}: {
  t: TranslateFn;
  onLinkFolder?: () => Promise<void> | void;
  currentDesignSystemId?: string | null;
  // When omitted (no active project) the design-system import row stays
  // disabled with the existing "Coming soon" affordance so users aren't
  // routed into a picker that has nothing to PATCH. Returns true on a
  // successful PATCH so the picker can close itself; false leaves the
  // picker open so the user can retry.
  onSwitchDesignSystem?: (
    designSystemId: string | null,
    title: string | null,
  ) => Promise<boolean>;
}) {
  const [view, setView] = useState<'root' | 'designSystems'>('root');

  if (view === 'designSystems' && onSwitchDesignSystem) {
    return (
      <DesignSystemSwitchPicker
        t={t}
        currentDesignSystemId={currentDesignSystemId}
        onSelect={onSwitchDesignSystem}
        onBack={() => setView('root')}
      />
    );
  }

  return (
    <div className="composer-tools-list">
      <ImportItem icon="upload" label={t('chat.importFig')} t={t} />
      <ImportItem icon="grid" label={t('chat.importWeb')} t={t} />
      {onLinkFolder ? (
      <ImportItem
        icon="folder"
        label={t('chat.importFolder')}
        t={t}
        enabled
        onClick={() => void onLinkFolder()}
      />
      ) : null}
      <ImportItem
        icon="sparkles"
        label={t('chat.importSkills')}
        t={t}
        enabled={!!onSwitchDesignSystem}
        onClick={() => setView('designSystems')}
        testId="composer-import-design-systems"
      />
      <ImportItem icon="file" label={t('chat.importProject')} t={t} />
    </div>
  );
}

function ImportItem({
  icon,
  label,
  t,
  enabled,
  onClick,
  testId,
}: {
  icon: "upload" | "link" | "grid" | "folder" | "sparkles" | "file";
  label: string;
  t: TranslateFn;
  enabled?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`composer-import-item${enabled ? ' composer-import-item-enabled' : ''}`}
      role="menuitem"
      tabIndex={-1}
      disabled={!enabled}
      title={enabled ? label : t('chat.importComingSoon')}
      onClick={enabled && onClick ? onClick : (e) => e.preventDefault()}
      data-testid={testId}
    >
      <span className="ico" aria-hidden>
        <Icon name={icon} size={14} />
      </span>
      <span className="composer-import-item-label">{label}</span>
      {!enabled && <span className="composer-import-item-soon">{t('chat.importSoon')}</span>}
    </button>
  );
}

function SlashPopover({
  commands,
  activeIndex,
  onPick,
  onHover,
  t,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onPick: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
  t: TranslateFn;
}) {
  return (
    <div
      className="slash-popover"
      data-testid="slash-popover"
      role="listbox"
      aria-label={t('pet.slashPopoverAria')}
    >
      <div className="slash-popover-head">
        <span>{t('pet.slashPopoverTitle')}</span>
        <span className="slash-popover-hint">{t('pet.slashPopoverHint')}</span>
      </div>
      {commands.map((cmd, idx) => {
        const active = idx === activeIndex;
        return (
          <button
            key={cmd.id}
            id={`slash-opt-${idx}`}
            type="button"
            role="option"
            aria-selected={active}
            className={`slash-item${active ? ' active' : ''}`}
            onMouseDown={(e) => {
              // Prevent the textarea from losing focus before the click
              // handler fires — otherwise selectionStart resets and the
              // pick replacement targets the wrong substring.
              e.preventDefault();
            }}
            onMouseEnter={() => onHover(idx)}
            onClick={() => onPick(cmd)}
          >
            <span className="slash-item-icon" aria-hidden>
              <Icon name={cmd.icon} size={13} />
            </span>
            <span className="slash-item-body">
              <span className="slash-item-row">
                <code className="slash-item-label">{cmd.label}</code>
                {cmd.argHint ? (
                  <span className="slash-item-arg">{cmd.argHint}</span>
                ) : null}
              </span>
              <span className="slash-item-desc">{t(cmd.descKey)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MentionPopover({
  files,
  workspaceContexts,
  connectors,
  plugins,
  skills,
  mcpServers,
  query,
  tab,
  onTabChange,
  activeIndex,
  currentSkillId,
  onPickFile,
  onPickWorkspaceContext,
  onPickPlugin,
  onPickSkill,
  onPickMcp,
  onPickConnector,
}: {
  files: ProjectFile[];
  workspaceContexts: WorkspaceContextItem[];
  connectors: ConnectorDetail[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  mcpServers: McpServerConfig[];
  query: string;
  tab: MentionTab;
  onTabChange: (tab: MentionTab) => void;
  activeIndex: number;
  currentSkillId: string | null;
  onPickFile: (path: string) => void;
  onPickWorkspaceContext: (item: WorkspaceContextItem) => void;
  onPickPlugin: (record: InstalledPluginRecord) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickMcp: (server: McpServerConfig) => void;
  onPickConnector: (connector: ConnectorDetail) => void;
}) {
  const { locale, t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const tabs: Array<{ id: MentionTab; label: string }> = [
    { id: 'all', label: t('chat.mentionTabAll') },
    { id: 'files', label: t('chat.mentionTabFiles') },
    { id: 'tabs', label: t('chat.mentionTabTabs') },
    { id: 'plugins', label: t('chat.mentionTabPlugins') },
    { id: 'skills', label: t('chat.mentionTabSkills') },
    { id: 'mcp', label: t('chat.mentionTabMcp') },
    { id: 'connectors', label: t('chat.mentionTabConnectors') },
  ];
  const showTabs = tab === 'all' || tab === 'tabs';
  const showFiles = tab === 'all' || tab === 'files';
  const showPlugins = tab === 'all' || tab === 'plugins';
  const showSkills = tab === 'all' || tab === 'skills';
  const showMcp = tab === 'all' || tab === 'mcp';
  const showConnectors = tab === 'all' || tab === 'connectors';
  const hasVisibleResults =
    (showFiles && files.length > 0) ||
    (showTabs && workspaceContexts.length > 0) ||
    (showPlugins && plugins.length > 0) ||
    (showSkills && skills.length > 0) ||
    (showMcp && mcpServers.length > 0) ||
    (showConnectors && connectors.length > 0);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [connectors, files, plugins, skills, mcpServers, tab, workspaceContexts]);
  let optionIndex = 0;
  return (
    <div className="mention-popover" data-testid="mention-popover">
      <div className="mention-tabs" role="tablist" aria-label={t('chat.mentionTabsAria')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`mention-tab${tab === item.id ? ' active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mention-results" ref={ref} role="listbox" id="mention-listbox">
        {!hasVisibleResults ? (
          <div className="mention-empty">
            {query ? (
              <>{t('chat.mentionNoResults', { query })}</>
            ) : (
              <>{t('chat.mentionSearchPrompt')}</>
            )}
          </div>
        ) : null}
        {showFiles && files.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionFiles')}</div>
            {files.map((f) => {
              const key = f.path ?? f.name;
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`file-${key}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickFile(key)}
                >
                  <Icon name="file" size={12} />
                  <span className="mention-item-body">
                    <strong>{projectFileMentionTitle(f, key)}</strong>
                    <span className="mention-meta mention-meta--desc mention-meta--path">
                      {projectFileMentionDescription(f, key)}
                    </span>
                  </span>
                  {f.size != null ? (
                    <span className="mention-meta mention-item-kind">{prettySize(f.size)}</span>
                  ) : null}
                </button>
              );
            })}
          </>
        ) : null}
        {showTabs && workspaceContexts.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionTabs')}</div>
            {workspaceContexts.map((item) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`workspace-${item.kind}-${item.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item mention-item--workspace${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickWorkspaceContext(item)}
                  title={workspaceContextTitle(item)}
                >
                  <Icon name={workspaceContextIcon(item)} size={12} />
                  <span className="mention-item-body">
                    <strong>{item.label}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {workspaceContextDescription(item)}
                    </span>
                  </span>
                  <span className="mention-meta mention-item-kind">{workspaceContextKindLabel(item.kind)}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showPlugins && plugins.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionPlugins')}</div>
            {plugins.map((p) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              const pluginTitle = localizePluginTitle(locale, p);
              const pluginDescription = localizePluginDescription(locale, p);
              return (
                <button
                  key={`plugin-${p.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item mention-item--plugin${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickPlugin(p)}
                  title={pluginDescription || pluginTitle}
                >
                  <Icon name="sparkles" size={12} />
                  <span className="mention-item-body">
                    <strong>{pluginTitle}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {pluginDescription || p.id}
                    </span>
                  </span>
                  <span className="mention-meta mention-item-kind">{pluginSourceLabel(p, t)}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showSkills && skills.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionSkills')}</div>
            {skills.map((skill) => {
              const flat = optionIndex;
              optionIndex += 1;
              const rowActive = flat === activeIndex;
              const isCurrent = skill.id === currentSkillId;
              return (
                <button
                  key={`skill-${skill.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={rowActive}
                  className={`mention-item${rowActive ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickSkill(skill)}
                  title={localizeSkillDescription(locale, skill)}
                >
                  <Icon name={isCurrent ? 'check' : 'file'} size={12} />
                  <span className="mention-item-body">
                    <strong>{localizeSkillName(locale, skill)}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {localizeSkillDescription(locale, skill) || skill.id}
                    </span>
                  </span>
                  <span className="mention-meta mention-item-kind">{isCurrent ? t('chat.mentionActiveSkill') : skill.mode}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showMcp && mcpServers.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionMcp')}</div>
            {mcpServers.map((server) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`mcp-${server.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickMcp(server)}
                  title={t('chat.mentionUseMcpTitle', { name: server.label || server.id })}
                >
                  <Icon name="link" size={12} />
                  <span className="mention-item-body">
                    <strong>{server.label || server.id}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {server.url || server.command || server.id}
                    </span>
                  </span>
                  <span className="mention-meta mention-item-kind">{server.transport}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showConnectors && connectors.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionConnectors')}</div>
            {connectors.map((connector) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`connector-${connector.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickConnector(connector)}
                  title={t('chat.mentionUseConnectorTitle', { name: connector.name })}
                >
                  <Icon name="link" size={12} />
                  <span className="mention-item-body">
                    <strong>{connector.name}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {connector.description || connector.provider || connector.id}
                    </span>
                  </span>
                  <span className="mention-meta mention-item-kind">{connector.accountLabel ?? connector.provider}</span>
                </button>
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripInlineMentionToken(text: string, label: string): string {
  const token = inlineMentionToken(label);
  return text.replace(
    new RegExp(`(^|[\\s([{"'])${escapeRegExp(token)}(?=$|\\s|[.,;:!?)}\\]"'])([^\\S\\r\\n])?`, 'g'),
    '$1',
  );
}

function stripInlineMentionLabels(text: string, labels: string[]): string {
  const uniqueLabels = Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean)));
  return uniqueLabels.reduce(
    (current, label) => stripInlineMentionToken(current, label),
    text,
  );
}

type PersistedComposerDraftV1 = {
  v: 1;
  text: string;
  attachments: ChatAttachment[];
};

function isStoredComposerAttachment(value: unknown): value is ChatAttachment {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<ChatAttachment>;
  return typeof row.path === 'string'
    && row.path.trim().length > 0
    && typeof row.name === 'string'
    && (row.kind === 'image' || row.kind === 'file');
}

function loadComposerDraftState(key?: string): { text: string; attachments: ChatAttachment[] } {
  if (!key || typeof window === 'undefined') return { text: '', attachments: [] };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { text: '', attachments: [] };
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedComposerDraftV1>;
      if (parsed && parsed.v === 1 && typeof parsed.text === 'string') {
        const attachments = Array.isArray(parsed.attachments)
          ? normalizeChatAttachmentOrders(parsed.attachments.filter(isStoredComposerAttachment))
          : [];
        return { text: parsed.text, attachments };
      }
    } catch {
      // Legacy plain-text drafts remain supported.
    }
    return { text: raw, attachments: [] };
  } catch {
    return { text: '', attachments: [] };
  }
}

function saveComposerDraftState(
  key: string | undefined,
  draft: string,
  attachments: readonly ChatAttachment[],
) {
  if (!key || typeof window === 'undefined') return;
  try {
    if (!draft && attachments.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    const payload: PersistedComposerDraftV1 = {
      v: 1,
      text: draft,
      attachments: normalizeChatAttachmentOrders(
        attachments
          .filter((item) => item.path.trim().length > 0)
          // Pending annotation blobs are session-only — do not revive after refresh.
          .filter((item) => !isPendingAnnotationPath(item.path))
          .slice(0, 16),
      ),
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable in privacy modes; the composer should still work.
  }
}

function looksLikeImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

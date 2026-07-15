import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useAnalytics } from './analytics/provider';
import {
  trackFileUploadResult,
  trackProjectCreateResult,
} from './analytics/events';
import { deriveUploadCohort } from './analytics/upload-tracking';
import { detectClientType } from './analytics/identity';
import {
  deriveConfigureGlobals,
  projectKindToTracking,
  fidelityToTracking,
} from '@open-design/contracts/analytics';
import type { AmrModelsResponse, ChatSessionMode } from '@open-design/contracts';
import { EntryView } from './components/EntryView';
import { EmbedBootstrapGate } from './components/EmbedBootstrapGate';
import { CenteredLoader } from './components/Loading';
import type { IntegrationTab } from './components/IntegrationsView';
import { MarketplaceView } from './components/MarketplaceView';
import { PluginDetailView } from './components/PluginDetailView';
import type { CreateInput, ImportClaudeDesignOutcome } from './components/NewProjectPanel';
import { MemoryToast } from './components/MemoryToast';
import { Toast } from './components/Toast';
import { PetOverlay, type PetTaskCenter, type PetTaskSummary } from './components/pet/PetOverlay';
import { buildActiveRunSummaries, activeRunSummariesEqual, buildActiveRunSignature, buildPetTaskCenter } from './components/pet/taskCenter';
import { migrateCustomPetAtlas } from './components/pet/pets';
import { ProjectView } from './components/ProjectView';
import { TeamverWorkspaceEscapeBar } from './components/TeamverWorkspaceEscapeBar';
import { TooltipLayer } from './components/TooltipLayer';
import { openWorkspaceTab, WorkspaceTabsBar } from './components/WorkspaceTabsBar';
import {
  DesignSystemCreationFlow,
  DesignSystemDetailView,
} from './components/DesignSystemFlow';
import {
  IframeKeepAliveProvider,
  useIframeKeepAlivePool,
} from './components/IframeKeepAlivePool';
import {
  SettingsDialog,
  switchApiProtocolConfig,
  updateCurrentApiProtocolConfig,
  type SettingsSection,
  type SettingsHighlight,
} from './components/SettingsDialog';
import {
  clampTeamverEmbedSettingsSection,
  resolveTeamverBranding,
} from './teamver/branding/config';
import { useTeamverBranding } from './teamver/branding/TeamverBrandingProvider';
import { isDesignTemplateEnabled } from './teamver/branding/designTemplateVisibility';
import { applyTeamverEmbedConfigLockIfNeeded, isTeamverExecutionConfigLocked } from './teamver/branding/applyEmbedConfigLock';
import { mergeTeamverRuntimeConfigIntoAppConfig, reloadTeamverRuntimeConfigIntoAppConfig } from './teamver/applyTeamverRuntimeConfig';
import { isTeamverEmbedMode } from './teamver/designApiBase';
import {
  shouldFetchAgentRegistryOnBoot,
  shouldFetchAmrIntegrationApis,
  shouldFetchAppVersionAboutPanel,
  shouldFetchEntryCatalogsOnBoot,
  shouldFetchHomeProjectsOnBoot,
  shouldFetchMediaProviderConfig,
  shouldFetchPromptTemplateCatalog,
  shouldPollDaemonRuns,
  shouldPostDaemonActiveContext,
  shouldShowOpenDesignPrivacyConsent,
} from './teamver/embedDaemonFetchPolicy';
import { resolveEmbedSlideDesignSystemId } from './teamver/embedSlideDesignSystem';
import {
  subscribeTeamverEmbedSessionChanged,
} from './teamver/teamverEmbedSession';
import {
  isTeamverEmbedBootComplete,
  revealTeamverEmbedChrome,
  waitForTeamverEmbedBoot,
} from './teamver/teamverEmbedBoot';
import { completeTeamverEmbedInitialUi } from './teamver/teamverEmbedInitialUi';
import { installTeamverEmbedHistoryBoundary } from './teamver/teamverEmbedHistoryGuard';
import { consumeEmbedLaunchPrefs } from './teamver/teamverEmbedAuthNavigation';
import {
  clampTeamverEmbedRoute,
  teamverEmbedRouteChanged,
} from './teamver/clampTeamverEmbedRoute';
import { subscribeTeamverWorkspaceChanged } from './teamver/teamverWorkspaceEvents';
import {
  assertTeamverProjectAccessIfNeeded,
  ensureTeamverProjectRegisteredById,
  formatTeamverProjectRegistryErrorMessage,
  formatTeamverProjectAccessDeniedMessage,
  formatTeamverProjectNotFoundMessage,
  registerTeamverProjectIfNeeded,
  syncAllDaemonProjectsToRegistry,
  TeamverProjectRegistryError,
  unregisterTeamverProjectFromRegistryIfNeeded,
} from './teamver/projectRegistry';
import {
  driveImportedToChatAttachments,
  formatTeamverDriveImportErrorMessage,
  importTeamverDriveAssets,
} from './teamver/importDriveAssets';
import { clearTeamverEmbedListCaches, clearTeamverEmbedProjectCaches } from './teamver/teamverEmbedListCaches';
import { clearProjectCoverCache } from './teamver/projectCoverLoader';
import { resetEmbedRunTrackingRefs, seedEmbedRunTrackingFromRuns, processEmbedBackgroundRunCompletions, buildEmbedKnownProjectIds, filterRunsForEmbedKnownProjects, pruneSessionActiveRunProjectIds, buildEmbedActiveRunAllowMissingIds } from './teamver/teamverEmbedRunTracking';
import { publishTeamverSessionActiveRunProjectIds } from './teamver/teamverEmbedSessionRuns';
import { loadProjectListPage, loadProjectListSafe, loadRecentProjectsForHome } from './teamver/loadProjectList';
import { runTeamverEmbedSessionBoot } from './teamver/teamverEmbedSessionBoot';
import { shouldNavigateHomeAfterWorkspaceProjectList } from './teamver/teamverWorkspaceProjectRoute';
import {
  capturePreWorkspaceSwitchProjectGuards,
  isPreWorkspaceSwitchTrustedProject,
  shouldSkipWorkspaceSwitchSideEffects,
} from './teamver/workspaceSwitchGuards';
import { isTeamverSessionTrustedProject } from './teamver/sessionTrustedProjects';
import { navigateExtrasForBackgroundRun } from './teamver/backgroundRunNavigate';
import { mergeByokBackgroundRunSummaries, reconcileByokBackgroundChatsAfterPoll, syntheticByokRunsForTaskCenter } from './teamver/backgroundChatRecovery';
import { subscribeTeamverBackgroundChat } from './teamver/teamverBackgroundChatEvents';
import { listActiveByokProxyStreams } from './providers/byokProxyActive';
import { armTeamverPublishMenuOnProjectOpen } from './teamver/teamverPostRunNavigation';
import { prefetchDesignsTabViewport } from './teamver/prefetchDesignsTabViewport';
import { warmEmbedProjectListCaches } from './teamver/warmEmbedProjectListCaches';
import {
  mergeProjectIntoList,
  mergeRecentProjectsIntoList,
  readEmbedProjectDetailRoute,
  shouldDeferEmbedProjectListRefresh,
} from './teamver/embedProjectListRefresh';
import { prefetchLatestPublishSummaries } from './teamver/latestPublishSummary';
import {
  patchEmbedBackgroundRunSummaryForProject,
  projectAffectsEmbedBackgroundRunSurfaces,
  syncEmbedBackgroundRunSurfacesForProject,
  type EmbedBackgroundRunNotice,
} from './teamver/embedBackgroundRunSurfaces';
import {
  formatTeamverDesignDisabledMessage,
  isTeamverDesignAppEnabled,
  readTeamverDesignAccessSnapshot,
  subscribeTeamverDesignAccessChanged,
} from './teamver/teamverDesignAccess';
import { readActiveTeamverWorkspaceId } from './teamver/useTeamverEmbed';
import { useTeamverAppVersionAutoReload } from './teamver/useTeamverAppVersionAutoReload';
import { PrivacyConsentModal } from './components/PrivacyConsentModal';
import {
  daemonIsLive,
  fetchAppVersionInfo,
  fetchAgentsStream,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
  uploadProjectFiles,
  replaceProjectWorkingDir,
} from './providers/registry';
import {
  RUNS_CHANGED_EVENT,
  fetchAmrModels,
  fetchVelaLoginStatus,
  listProjectRuns,
  type VelaLoginStatus,
} from './providers/daemon';
import { AMR_LOGIN_STATUS_EVENT } from './components/amrLoginPolling';
import { navigate, useRoute } from './router';
import {
  fetchDaemonConfig,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PET,
  fetchMediaProvidersFromDaemon,
  hasAnyConfiguredProvider,
  fetchComposioConfigFromDaemon,
  loadConfig,
  mergeDaemonConfig,
  mergeDaemonMediaProviders,
  saveConfig,
  shouldSyncLocalMediaProvidersToDaemon,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
  syncMediaProvidersToDaemon,
} from './state/config';
import { playSound, showCompletionNotification } from './utils/notifications';
import { applyAppearanceToDocument } from './state/appearance';
import { isMacPlatform } from './utils/platform';
import {
  createProject,
  createPluginShareProject,
  deleteProject as deleteProjectApi,
  getProject,
  importClaudeDesignZip,
  importFolderProject,
  listTemplates,
  deleteTemplate,
  patchProject,
} from './state/projects';
import { useModalWindowDragGuard } from './hooks/useModalWindowDragGuard';
import type {
  PluginShareAction,
  PluginShareProjectOutcome,
} from './state/projects';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import { useI18n } from './i18n';
import { liveArtifactTabId } from './types';
import type {
  AgentInfo,
  AgentModelChoice,
  ApiProtocol,
  AppConfig,
  AppVersionInfo,
  ChatAttachment,
  DesignSystemGenerationJob,
  DesignSystemSummary,
  Project,
  ProjectTemplate,
  ProviderModelOption,
  PromptTemplateSummary,
  SkillSummary,
} from './types';

const APP_CONFIG_CHANGED_EVENT = 'open-design:app-config-changed';
const AMR_AGENT_ID = 'amr';
const AMR_PROFILE_ENV_KEY = 'OPEN_DESIGN_AMR_PROFILE';
const RUNS_POLL_ACTIVE_MS = 5_000;
const RUNS_POLL_IDLE_MS = 30_000;
const RUNS_POLL_IDLE_HIDDEN_MS = 120_000;

export function shouldSyncMediaProvidersOnSave(
  mediaProviders: AppConfig['mediaProviders'],
  options?: { force?: boolean },
): boolean {
  return Boolean(options?.force) || hasAnyConfiguredProvider(mediaProviders);
}

function normalizeSavedComposioConfig(config: AppConfig['composio']): AppConfig['composio'] {
  const apiKey = config?.apiKey?.trim() ?? '';
  if (apiKey) {
    return {
      ...config,
      apiKey: '',
      apiKeyConfigured: true,
      apiKeyTail: apiKey.slice(-4),
    };
  }
  return { ...(config ?? {}) };
}

function amrProfileForConfig(config: AppConfig): string | null {
  const profile = config.agentCliEnv?.[AMR_AGENT_ID]?.[AMR_PROFILE_ENV_KEY];
  return typeof profile === 'string' && profile ? profile : null;
}

function sameAgentModelChoice(
  left: AgentModelChoice | undefined,
  right: AgentModelChoice | undefined,
): boolean {
  return (left?.model ?? null) === (right?.model ?? null)
    && (left?.reasoning ?? null) === (right?.reasoning ?? null);
}

function clearStaleAmrModelChoiceOnProfileChange(
  previous: AppConfig,
  next: AppConfig,
): AppConfig {
  if (amrProfileForConfig(previous) === amrProfileForConfig(next)) return next;

  const previousChoice = previous.agentModels?.[AMR_AGENT_ID];
  const nextChoice = next.agentModels?.[AMR_AGENT_ID];
  if (!nextChoice || !sameAgentModelChoice(previousChoice, nextChoice)) return next;

  const nextAgentModels = { ...(next.agentModels ?? {}) };
  delete nextAgentModels[AMR_AGENT_ID];
  return { ...next, agentModels: nextAgentModels };
}

type ProjectListRequest = {
  generation: number;
  mutationVersion: number;
  workspaceId: string | null;
};

export async function persistComposioConfigChange(
  current: AppConfig,
  composio: AppConfig['composio'],
  sync: (config: AppConfig['composio']) => Promise<boolean> = syncComposioConfigToDaemon,
): Promise<AppConfig> {
  const saved = await sync(composio);
  if (!saved) throw new Error('Composio config save failed');
  return {
    ...current,
    composio: normalizeSavedComposioConfig(composio),
  };
}

export function buildPersistedConfig(next: AppConfig, current: AppConfig): AppConfig {
  const stalePrivacySnapshot =
    current.privacyDecisionAt != null && next.privacyDecisionAt == null;
  return {
    ...next,
    apiKey: next.apiKeyConfigured ? '' : next.apiKey,
    onboardingCompleted: current.onboardingCompleted ? true : next.onboardingCompleted,
    ...(stalePrivacySnapshot
      ? {
          installationId: current.installationId,
          privacyDecisionAt: current.privacyDecisionAt,
          telemetry: current.telemetry,
        }
      : {}),
    composio: next.composio
      ? {
          apiKey: '',
          apiKeyConfigured: Boolean(next.composio.apiKeyConfigured),
          apiKeyTail: next.composio.apiKeyTail ?? '',
        }
      : next.composio,
  };
}

/**
 * True when `next` and `last` produce an identical persisted shape —
 * i.e. the only diffs between them are fields that buildPersistedConfig
 * intentionally strips before disk/daemon writes (the Composio API key
 * draft today; any future save-on-explicit-confirm secrets later).
 *
 * The autosave loop in Settings uses this to skip the "All changes
 * saved" indicator transition when the user has only typed an unsaved
 * secret. Without it, autosave completes a no-op write and flashes
 * "Saved" — misleading users into trusting that a sensitive key has
 * been persisted when in fact only the section-local "Save key"
 * gesture commits it.
 */
export function isAutosaveDraftOnlyChange(next: AppConfig, last: AppConfig): boolean {
  return (
    JSON.stringify(buildPersistedConfig(next, next))
    === JSON.stringify(buildPersistedConfig(last, last))
  );
}

export function resolveSettingsCloseConfig(
  rendered: AppConfig,
  latestPersisted: AppConfig,
): AppConfig {
  const base = latestPersisted === rendered ? rendered : latestPersisted;
  return base.onboardingCompleted ? base : { ...base, onboardingCompleted: true };
}

function mergeAmrModelsIntoAgents(
  agents: AgentInfo[],
  amrModels: AmrModelsResponse | null,
): AgentInfo[] {
  if (!amrModels || amrModels.models.length === 0) return agents;
  return agents.map((agent) => {
    if (agent.id !== 'amr') return agent;
    const shouldPreferAgentModels =
      amrModels.source === 'preset' &&
      Array.isArray(agent.models) &&
      agent.models.length > 0;
    if (shouldPreferAgentModels) return agent;
    return { ...agent, models: amrModels.models, modelsSource: 'live' };
  });
}

const CANONICAL_AGENT_ORDER = [
  'amr',
  'claude',
  'codex',
  'devin',
  'gemini',
  'opencode',
  'hermes',
  'trae-cli',
  'grok-build',
  'kimi',
  'cursor-agent',
  'qwen',
  'qoder',
  'copilot',
  'pi',
  'kiro',
  'kilo',
  'vibe',
  'deepseek',
  'aider',
  'antigravity',
  'reasonix',
] as const;

const CANONICAL_AGENT_ORDER_INDEX = new Map<string, number>(
  CANONICAL_AGENT_ORDER.map((id, index) => [id, index]),
);

function orderAgentsByRegistry(agents: AgentInfo[]): AgentInfo[] {
  return agents
    .map((agent, index) => ({ agent, index }))
    .sort((left, right) => {
      const leftRank =
        CANONICAL_AGENT_ORDER_INDEX.get(left.agent.id) ??
        CANONICAL_AGENT_ORDER.length;
      const rightRank =
        CANONICAL_AGENT_ORDER_INDEX.get(right.agent.id) ??
        CANONICAL_AGENT_ORDER.length;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.index - right.index;
    })
    .map(({ agent }) => agent);
}

function upsertAgent(agents: AgentInfo[], agent: AgentInfo): AgentInfo[] {
  const index = agents.findIndex((item) => item.id === agent.id);
  if (index === -1) return [...agents, agent];
  const next = agents.slice();
  next[index] = agent;
  return next;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

export function App() {
  // `reducedMotion="user"` makes every motion/react component honor the OS
  // `prefers-reduced-motion` setting: transform/layout animations are zeroed
  // out while opacity-only changes are kept. The CSS `@media (prefers-reduced-
  // motion: reduce)` block covers the CSS-keyframe surfaces, but the dialogs,
  // toasts and popovers that moved to motion/react need this gate too — without
  // it they keep springing/sliding for users who asked us not to animate.
  return (
    <MotionConfig reducedMotion="user">
      <IframeKeepAliveProvider>
        <AppInner />
      </IframeKeepAliveProvider>
    </MotionConfig>
  );
}

function AppInner() {
  const { t } = useI18n();
  const { hideWorkspaceTabsBar, slideOnlyMvp } = useTeamverBranding();
  const embedEntryBackView = slideOnlyMvp ? 'home' : 'design-systems';
  const iframeKeepAlivePool = useIframeKeepAlivePool();
  const clientType = useMemo(() => detectClientType(), []);
  useModalWindowDragGuard();
  // Embed-only: poll daemon `/api/version` so a stale FE bundle does not
  // outlive a daemon redeploy. Without this the user had to `cmd+shift+r`
  // after every deploy to recover from `teamver_project_s3_prefix_required`
  // 502s caused by old FE JS racing the fresh daemon API surface
  // (docs-teamver/18_OD_Tenant_Storage.md §3.4).
  useTeamverAppVersionAutoReload();
  // Observability marker. `apps/web/src/observability/white-screen.ts`
  // keys its "app actually mounted" success condition on this attribute
  // because the dynamic-import loading shell (`<div class="od-loading-shell">
  // Loading Open Design…</div>`) is itself >MIN_VISIBLE_TEXT and would
  // otherwise be mistaken for a real mount. Survives subsequent render
  // crashes — once App has mounted at least once, it's no longer a white
  // screen (subsequent failures show up as `$exception`).
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-od-app-mounted', '1');
    }
  }, []);
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const launchPrefsAppliedRef = useRef(false);

  useLayoutEffect(() => {
    if (!isTeamverEmbedMode() || launchPrefsAppliedRef.current) return;
    const prefs = consumeEmbedLaunchPrefs();
    if (!prefs.theme) return;
    launchPrefsAppliedRef.current = true;
    setConfig((current) => {
      if (current.theme === prefs.theme) return current;
      const next = { ...current, theme: prefs.theme! };
      saveConfig(next);
      return next;
    });
  }, []);
  const configRef = useRef(config);
  configRef.current = config;
  const latestPersistedConfigRef = useRef(config);
  latestPersistedConfigRef.current = config;
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Surfaced when a Home-picked working dir could not be applied to a freshly
  // created project (expired/invalid desktop token, daemon rejection). Without
  // this the failure was swallowed and the user believed their folder was in
  // effect while the project actually stayed in the managed root.
  const [workingDirError, setWorkingDirError] = useState<string | null>(null);
  const [embedDesignAppEnabled, setEmbedDesignAppEnabled] = useState(true);
  const [embedWorkspaceId, setEmbedWorkspaceId] = useState<string | null>(null);
  const [settingsWelcome, setSettingsWelcome] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution');
  const [settingsHighlight, setSettingsHighlight] = useState<SettingsHighlight>(null);
  const [integrationInitialTab, setIntegrationInitialTab] = useState<IntegrationTab>('mcp');
  const [daemonLive, setDaemonLive] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const amrModelsRef = useRef<AmrModelsResponse | null>(null);
  const amrPollGenerationRef = useRef(0);
  const agentStreamRequestSeqRef = useRef(0);
  const [amrPollRestartToken, setAmrPollRestartToken] = useState(0);
  const [providerModelsCache, setProviderModelsCache] = useState<
    Record<string, ProviderModelOption[]>
  >({});
  // Functional skills (capabilities the agent invokes mid-task) — stays
  // small and lives under the Settings → Skills surface.
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  // Design templates (rendering catalogue: decks, prototypes, image/video/
  // audio templates) — sourced from /api/design-templates and shown in the
  // EntryView Templates tab. See specs/current/skills-and-design-templates.md.
  const [designTemplates, setDesignTemplates] = useState<SkillSummary[]>([]);
  const fetchDesignTemplatesForCurrentBranding = useCallback(
    () => fetchDesignTemplates(slideOnlyMvp ? { mode: 'deck', limit: 24 } : undefined),
    [slideOnlyMvp],
  );
  const [designSystems, setDesignSystems] = useState<DesignSystemSummary[]>([]);
  const [pendingDesignSystemRevisionJobs, setPendingDesignSystemRevisionJobs] = useState<
    Record<string, DesignSystemGenerationJob>
  >({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [petTaskCenter, setPetTaskCenter] = useState<PetTaskCenter>({
    running: [],
    queued: [],
    recent: [],
  });
  const [backgroundRunSummaries, setBackgroundRunSummaries] = useState<PetTaskSummary[]>([]);
  const [backgroundRunNotice, setBackgroundRunNotice] = useState<EmbedBackgroundRunNotice | null>(null);
  const activeRunIdsRef = useRef<Set<string>>(new Set());
  const notifiedBackgroundRunIdsRef = useRef<Set<string>>(new Set());
  const sessionActiveRunProjectIdsRef = useRef<Set<string>>(new Set());
  const byokBackgroundChatsRef = useRef<
    Map<string, { conversationId: string; assistantMessageId: string }>
  >(new Map());
  const byokProxyIdlePollsRef = useRef<Map<string, number>>(new Map());
  const embedActiveWorkspaceIdRef = useRef<string | null>(null);
  const workspaceSwitchReconcilingRef = useRef(false);
  const preWorkspaceSwitchTrustedProjectsRef = useRef<Set<string>>(new Set());
  const projectsRef = useRef<Project[]>(projects);
  const wasActiveRunRef = useRef(false);
  const activeRunSignatureRef = useRef("");
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  const pendingLocalProjectIdsRef = useRef<Set<string>>(new Set());
  const locallyDeletedProjectIdsRef = useRef<Map<string, number>>(new Map());
  const projectListMutationVersionRef = useRef(0);
  const projectListRequestGenerationRef = useRef(0);
  const latestAppliedProjectListGenerationRef = useRef(0);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<
    PromptTemplateSummary[]
  >([]);
  const [appVersionInfo, setAppVersionInfo] = useState<AppVersionInfo | null>(
    null,
  );
  const [daemonMediaProviders, setDaemonMediaProviders] = useState<
    AppConfig['mediaProviders'] | null
  >(null);
  const [daemonMediaProvidersFetchState, setDaemonMediaProvidersFetchState] = useState<
    'idle' | 'ok' | 'error'
  >('idle');
  const [mediaProvidersNotice, setMediaProvidersNotice] = useState<string | null>(null);
  // Per-resource loading flags. Each goes false the moment its own fetch
  // resolves so each entry-view tab can render as its data lands instead of
  // every tab waiting on the slowest endpoint (typically `/api/agents`,
  // which probes CLI versions and can take seconds on cold start). The entry
  // view picks the right flag for whichever tab the user is currently on.
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [dsLoading, setDsLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsHasMore, setProjectsHasMore] = useState(false);
  const [projectsLoadingMore, setProjectsLoadingMore] = useState(false);
  const [projectsPageLoading, setProjectsPageLoading] = useState(false);
  const [projectsRefreshing, setProjectsRefreshing] = useState(false);
  const projectsLoadingRef = useRef(projectsLoading);
  const projectsPageLoadedRef = useRef(false);
  const projectsNextCursorRef = useRef<string | null>(null);
  useEffect(() => {
    projectsLoadingRef.current = projectsLoading;
  }, [projectsLoading]);
  const [promptTemplatesLoading, setPromptTemplatesLoading] = useState(true);
  // Goes true once the daemon-persisted config (agentId/designSystemId/etc.)
  // has merged into local state. Auto-selection effects below wait on this
  // so they don't race ahead of the daemon-stored choice and overwrite it
  // with a freshly picked first-available agent.
  const [daemonConfigLoaded, setDaemonConfigLoaded] = useState(false);
  // Narrower flag dedicated to the Composio API key hydration. The key is
  // persisted by the daemon (and only reflected back via apiKeyConfigured
  // + apiKeyTail), so after a dev-server restart there is a window where
  // the dialog can render an empty Composio input even though a saved key
  // exists. Settings → Connectors uses this to render a skeleton over the
  // input + buttons instead of an empty input that the user might
  // mistake for "no key saved" — and to disable Save/Clear so a misclick
  // can't overwrite the saved state with `''` before hydration lands.
  const [composioConfigLoading, setComposioConfigLoading] = useState(true);
  const route = useRoute();
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    if (!isTeamverEmbedMode()) {
      completeTeamverEmbedInitialUi();
    }
  }, []);

  const analytics = useAnalytics();

  const beginAgentStreamRequest = useCallback(() => {
    agentStreamRequestSeqRef.current += 1;
    return agentStreamRequestSeqRef.current;
  }, []);

  const isCurrentAgentStreamRequest = useCallback((requestId: number) => {
    return agentStreamRequestSeqRef.current === requestId;
  }, []);

  const restartAmrPolling = useCallback(() => {
    amrPollGenerationRef.current += 1;
    setAmrPollRestartToken((current) => current + 1);
  }, []);

  // v2 schema removed the standalone `app_launch` event; the initial
  // page_view fires from each top-level page surface (home / projects /
  // automations / plugins / design_systems / integrations) instead.
  // `detectClientType` still feeds analytics identity via the provider.
  void detectClientType;

  const rememberLocalProject = useCallback((projectId: string) => {
    const trimmed = projectId.trim();
    if (!trimmed) return;
    pendingLocalProjectIdsRef.current.add(trimmed);
    locallyDeletedProjectIdsRef.current.delete(trimmed);
    projectListMutationVersionRef.current += 1;
  }, []);

  const isSessionTrustedEmbedProject = useCallback((projectId: string) => {
    if (!isTeamverEmbedMode()) return false;
    return isTeamverSessionTrustedProject(projectId, {
      pendingLocalProjectIds: pendingLocalProjectIdsRef.current,
      sessionActiveRunProjectIds: sessionActiveRunProjectIdsRef.current,
    });
  }, []);

  const clearLocalProject = useCallback((projectId: string, options?: { deleted?: boolean }) => {
    pendingLocalProjectIdsRef.current.delete(projectId);
    projectListMutationVersionRef.current += 1;
    if (options?.deleted) {
      locallyDeletedProjectIdsRef.current.set(
        projectId,
        projectListMutationVersionRef.current,
      );
      // Invalidate in-flight list applies that started before this delete so
      // a stale registry membership response cannot resurrect the row.
      projectListRequestGenerationRef.current += 1;
      latestAppliedProjectListGenerationRef.current =
        projectListRequestGenerationRef.current;
    }
  }, []);

  const beginProjectListRequest = useCallback((): ProjectListRequest => {
    projectListRequestGenerationRef.current += 1;
    return {
      generation: projectListRequestGenerationRef.current,
      mutationVersion: projectListMutationVersionRef.current,
      workspaceId: isTeamverEmbedMode() ? embedActiveWorkspaceIdRef.current : null,
    };
  }, []);

  // Re-fetch design-api `runtime-config` after workspace switch / pageshow so
  // BE env rotations propagate without a full reload. Skips persist/state when
  // the merge is a no-op (same key/protocol/baseUrl/model).
  const reloadTeamverRuntimeConfig = useCallback(async (options?: { force?: boolean }) => {
    if (!isTeamverEmbedMode()) return;
    try {
      const prevConfig = latestPersistedConfigRef.current;
      const merged = await reloadTeamverRuntimeConfigIntoAppConfig(prevConfig, options);
      if (merged === prevConfig) return;
      const locked = saveConfig(merged);
      latestPersistedConfigRef.current = locked;
      setConfig(locked);
    } catch (err) {
      console.warn("[teamver] runtime-config reload failed", err);
    }
  }, []);

  const isStaleProjectListWorkspace = useCallback((request: ProjectListRequest) => {
    if (
      isTeamverEmbedMode()
      && request.workspaceId
      && embedActiveWorkspaceIdRef.current
      && request.workspaceId !== embedActiveWorkspaceIdRef.current
    ) {
      console.info('[teamver] project list response ignored after workspace changed', {
        requestWorkspaceId: request.workspaceId,
        activeWorkspaceId: embedActiveWorkspaceIdRef.current,
      });
      return true;
    }
    return false;
  }, []);

  /**
   * Home recent rail refresh — upsert status/metadata without dropping the
   * projects-tab page (or detail-prefetch rows) already held in memory.
   */
  const upsertRecentProjects = useCallback((list: Project[], request: ProjectListRequest) => {
    if (isStaleProjectListWorkspace(request)) return false;
    if (request.generation < latestAppliedProjectListGenerationRef.current) {
      return false;
    }
    latestAppliedProjectListGenerationRef.current = request.generation;
    const pendingLocalProjectIds = pendingLocalProjectIdsRef.current;
    const locallyDeletedProjectIds = locallyDeletedProjectIdsRef.current;
    for (const project of list) pendingLocalProjectIds.delete(project.id);
    const activeDeletedProjectIds = new Set(locallyDeletedProjectIds.keys());
    const visibleList =
      activeDeletedProjectIds.size > 0
        ? list.filter((project) => !activeDeletedProjectIds.has(project.id))
        : list;
    setProjects((current) =>
      mergeRecentProjectsIntoList(current, visibleList, {
        excludeIds: activeDeletedProjectIds,
      }),
    );
    return true;
  }, [isStaleProjectListWorkspace]);

  const reconcileFetchedProjects = useCallback((list: Project[], request: ProjectListRequest) => {
    if (isStaleProjectListWorkspace(request)) return false;
    const pendingLocalProjectIds = pendingLocalProjectIdsRef.current;
    const locallyDeletedProjectIds = locallyDeletedProjectIdsRef.current;
    const fetchedIds = new Set(list.map((project) => project.id));
    if (request.generation < latestAppliedProjectListGenerationRef.current) {
      const visibleList =
        locallyDeletedProjectIds.size > 0
          ? list.filter((project) => !locallyDeletedProjectIds.has(project.id))
          : list;
      if (visibleList.length === 0) return false;
      const hydratableProjects = visibleList.filter(
        (project) =>
          pendingLocalProjectIds.has(project.id),
      );
      if (hydratableProjects.length === 0) return false;
      const hydratableById = new Map(
        hydratableProjects.map((project) => [project.id, project]),
      );
      for (const project of hydratableProjects) {
        pendingLocalProjectIds.delete(project.id);
      }
      setProjects((current) => {
        let changed = false;
        const currentIds = new Set<string>();
        const next = current.map((project) => {
          currentIds.add(project.id);
          const hydrated = hydratableById.get(project.id);
          if (!hydrated) return project;
          changed = true;
          hydratableById.delete(project.id);
          return hydrated;
        });
        for (const project of hydratableById.values()) {
          if (currentIds.has(project.id)) continue;
          changed = true;
          next.push(project);
        }
        return changed ? next : current;
      });
      return true;
    }
    latestAppliedProjectListGenerationRef.current = request.generation;
    for (const id of fetchedIds) pendingLocalProjectIds.delete(id);
    for (const [id, deletedAtMutationVersion] of locallyDeletedProjectIds) {
      if (
        request.mutationVersion >= deletedAtMutationVersion
        && !fetchedIds.has(id)
      ) {
        locallyDeletedProjectIds.delete(id);
      }
    }
    const activeDeletedProjectIds = new Set(locallyDeletedProjectIds.keys());
    const visibleList =
      activeDeletedProjectIds.size > 0
        ? list.filter((project) => !activeDeletedProjectIds.has(project.id))
        : list;
    const visibleFetchedIds =
      activeDeletedProjectIds.size > 0
        ? new Set(visibleList.map((project) => project.id))
        : fetchedIds;
    setProjects((current) => {
      const preserved = current.filter(
        (project) =>
          pendingLocalProjectIds.has(project.id) &&
          !visibleFetchedIds.has(project.id) &&
          !activeDeletedProjectIds.has(project.id),
      );
      return preserved.length > 0 ? [...preserved, ...visibleList] : visibleList;
    });
    return true;
  }, [isStaleProjectListWorkspace]);

  // Propagate the Privacy toggle through to PostHog without a reload —
  // posthog-js's opt_out_capturing flips a localStorage flag that makes
  // every subsequent capture() a no-op. When the user opts back in we
  // call opt_in_capturing to resume.
  useEffect(() => {
    analytics.setConsent(config.telemetry?.metrics === true);
  }, [analytics.setConsent, config.telemetry?.metrics]);

  // Sync PostHog's distinct_id with the anonymous installationId, both on
  // first opt-in (when the daemon stamps a fresh id) and on Delete-my-data
  // rotation (when PrivacySection.tsx generates a new one). posthog-js
  // caches the previous id in localStorage; identify() alone would stitch
  // the two ids together, so applyIdentity() does reset() first to
  // guarantee the new session is fully decoupled from the deleted one.
  useEffect(() => {
    if (config.telemetry?.metrics !== true) return;
    analytics.setIdentity(config.installationId ?? null);
  }, [analytics.setIdentity, config.installationId, config.telemetry?.metrics]);

  // App-level AMR sign-in state — declared here because the configure
  // globals effect below reads it; the sync effects live next to the
  // other AMR plumbing further down.
  const [amrLoginStatus, setAmrLoginStatus] = useState<VelaLoginStatus | null>(null);

  // v2 analytics requires every event to carry the configure-state
  // triplet (has_available_configure_cli / configure_type /
  // configure_availability). We push it into the PostHog global register
  // whenever the user's execution-mode config or the detected agent list
  // changes; the next capture inherits the fresh values, so dashboards
  // can segment by execution setup without per-helper boilerplate.
  //
  // Gated on `agentsLoading` so the cold-start probe (`fetchAgentsStream()`
  // lands asynchronously after this effect's first run) does not stamp
  // the first home/projects/plugins page_view with
  // has_available_configure_cli=false / configure_availability=unavailable
  // on machines that DO have an installed CLI. While the probe is in
  // flight we leave the boot defaults ('unknown'/'unknown') in place,
  // matching what the helper would return for an empty agent list with
  // no mode pinned.
  useEffect(() => {
    if (agentsLoading) return;
    const byokConfigured = (() => {
      if (config.apiKeyConfigured && isTeamverEmbedMode()) return true;
      const protocols = config.apiProtocolConfigs;
      if (!protocols) return Boolean(config.apiKey?.trim());
      return Object.values(protocols).some(
        (cfg) => Boolean(cfg?.apiKey?.trim()),
      );
    })();
    const globals = deriveConfigureGlobals({
      mode: config.mode,
      agentId: config.agentId,
      agents: agents.map((a) => ({ id: a.id, available: a.available })),
      byokConfigured,
      amrAuthorized: amrLoginStatus?.loggedIn === true,
    });
    analytics.setConfigureGlobals(globals);
  }, [
    analytics.setConfigureGlobals,
    agentsLoading,
    amrLoginStatus,
    config.mode,
    config.agentId,
    config.apiKey,
    config.apiProtocolConfigs,
    agents,
  ]);

  // Sync theme preference to the <html> element so CSS variables pick it up.
  // useLayoutEffect (vs useEffect) fires before the browser paints, so a
  // live theme switch in Settings applies atomically — no 1-frame flash of
  // the old theme. Safe here because the component tree is ssr:false.
  useLayoutEffect(() => {
    applyAppearanceToDocument({
      theme: config.theme ?? 'system',
      accentColor: config.accentColor,
    });
  }, [config.theme, config.accentColor]);

  // Tell the daemon what the user is currently looking at, so the MCP
  // server can surface it as `get_active_context` to a coding agent in
  // another repo. Best-effort fire-and-forget; the daemon holds it in
  // memory with a short TTL and the MCP layer falls back to
  // {active:false} if this hasn't run.
  const activeProjectId = route.kind === 'project' ? route.projectId : null;
  const activeFileName = route.kind === 'project' ? route.fileName : null;
  // Gate the privacy banner on three things:
  //   1. Daemon config has hydrated (privacyDecisionAt is daemon-owned).
  //   2. The user has not yet made a privacy decision.
  //   3. Onboarding is complete (Skip and design-system creation both flip
  //      onboardingCompleted to true; see handleCompleteOnboarding wiring).
  // Once onboarding is done the banner is allowed on any route — including
  // the project view the design-system finish path drops the user into, so
  // they can read and acknowledge the disclosure while the first generation
  // is running. Settings is irrelevant to visibility; the banner sits above
  // the modal-backdrop layer in index.css so opening Settings does not hide
  // it.
  const showPrivacyConsent =
    shouldShowOpenDesignPrivacyConsent() &&
    daemonConfigLoaded &&
    config.privacyDecisionAt == null &&
    config.onboardingCompleted === true;
  useEffect(() => {
    if (!shouldPostDaemonActiveContext()) return;
    const body = activeProjectId
      ? { projectId: activeProjectId, fileName: activeFileName }
      : { active: false };
    fetch('/api/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // Daemon down or transient network — not worth surfacing.
    });
  }, [activeProjectId, activeFileName]);

  useEffect(() => {
    if (!daemonLive || !shouldFetchAmrIntegrationApis()) return;
    let cancelled = false;
    let timer: number | null = null;
    const pollGeneration = amrPollGenerationRef.current + 1;
    amrPollGenerationRef.current = pollGeneration;
    const pollDelayMs = 1_000;
    const maxPresetPolls = 10;
    let presetPolls = 0;

    const applyAmrModels = async () => {
      const result = await fetchAmrModels();
      if (
        cancelled ||
        amrPollGenerationRef.current !== pollGeneration ||
        !result ||
        !Array.isArray(result.models) ||
        result.models.length === 0
      ) {
        return;
      }
      amrModelsRef.current = result;
      setAgents((current) => mergeAmrModelsIntoAgents(current, result));
      const shouldPollPreset =
        result.source === 'preset' &&
        !result.remoteError &&
        presetPolls < maxPresetPolls;
      if (shouldPollPreset) {
        presetPolls += 1;
        timer = window.setTimeout(() => {
          void applyAmrModels();
        }, pollDelayMs);
      }
    };

    void applyAmrModels();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [amrPollRestartToken, daemonLive]);

  // App-level AMR sign-in state. Feeds two analytics globals: the
  // `amr` configure_type bucket (deriveConfigureGlobals below) and the
  // `user_id` public param (the AMR account id is the only join key
  // between this PostHog project and the AMR-side one). Child surfaces
  // push status changes up via onAmrLoginStatusChange; the global
  // AMR_LOGIN_STATUS_EVENT covers logins finishing in surfaces that
  // unmounted before their poll settled.
  useEffect(() => {
    if (!shouldFetchAmrIntegrationApis()) return;
    let cancelled = false;
    const sync = async () => {
      const status = await fetchVelaLoginStatus();
      if (!cancelled && status) setAmrLoginStatus(status);
    };
    void sync();
    const onStatusEvent = () => {
      void sync();
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onStatusEvent);
    return () => {
      cancelled = true;
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusEvent);
    };
  }, [daemonLive]);

  useEffect(() => {
    analytics.setUserId(
      amrLoginStatus?.loggedIn === true ? amrLoginStatus.user?.id ?? null : null,
    );
  }, [analytics.setUserId, amrLoginStatus]);

  const handleAmrLoginStatusChange = useCallback((status: VelaLoginStatus | null) => {
    if (status) setAmrLoginStatus(status);
    if (status?.loggedIn !== true) return;
    restartAmrPolling();
  }, [restartAmrPolling]);

  // Bootstrap — detect daemon, then fan out independent fetches so each
  // entry-view tab can render the moment its own data lands. Earlier this
  // was one Promise.all behind a global "Loading workspace…" placeholder,
  // which made the slowest endpoint (typically `/api/agents` on cold start)
  // gate every tab including the ones that don't need agents at all.
  useEffect(() => {
    let cancelled = false;
    const agentStreamAbort = new AbortController();
    (async () => {
      const bootRouteKind = routeRef.current.kind;
      const fetchEntryCatalogs = shouldFetchEntryCatalogsOnBoot(bootRouteKind);
      const fetchHomeProjects = shouldFetchHomeProjectsOnBoot(bootRouteKind);
      const embedSessionBootPromise = isTeamverEmbedMode()
        ? runTeamverEmbedSessionBoot({
            isCancelled: () => cancelled,
            readDetailRoute: () => readEmbedProjectDetailRoute(routeRef.current),
            onProjectPrefetched: (project) => {
              setProjects((current) => {
                const existingIndex = current.findIndex(
                  (candidate) => candidate.id === project.id,
                );
                if (existingIndex < 0) return [...current, project];
                return current.map((candidate) =>
                  candidate.id === project.id ? project : candidate,
                );
              });
            },
          })
        : Promise.resolve(null);
      const alive = await daemonIsLive();
      if (cancelled) return;
      setDaemonLive(alive);
      if (!alive) {
        // No daemon — clear every loading flag so empty states render
        // instead of the entry view sitting on indefinite spinners.
        setAgentsLoading(false);
        setSkillsLoading(false);
        setDsLoading(false);
        setProjectsLoading(false);
        setPromptTemplatesLoading(false);
        setDaemonConfigLoaded(true);
        // Composio hydration also depends on the daemon. With no daemon
        // we just keep whatever localStorage already held; drop the
        // skeleton so the Settings → Connectors input reflects state.
        setComposioConfigLoading(false);
        await embedSessionBootPromise.catch(() => undefined);
        return;
      }

      const agentRequestId = beginAgentStreamRequest();
      if (shouldFetchAgentRegistryOnBoot()) {
        void fetchAgentsStream({
          signal: agentStreamAbort.signal,
          onAgent: (agent) => {
            if (cancelled || !isCurrentAgentStreamRequest(agentRequestId)) return;
            setAgents((current) =>
              mergeAmrModelsIntoAgents(
                upsertAgent(current, agent),
                amrModelsRef.current,
              ),
            );
          },
        })
          .then((list) => {
            if (cancelled || !isCurrentAgentStreamRequest(agentRequestId)) return;
            setAgents(
              mergeAmrModelsIntoAgents(
                orderAgentsByRegistry(list),
                amrModelsRef.current,
              ),
            );
          })
          .catch((err) => {
            if (
              cancelled ||
              isAbortError(err) ||
              !isCurrentAgentStreamRequest(agentRequestId)
            ) {
              return;
            }
            setAgents([]);
          })
          .finally(() => {
            if (cancelled || !isCurrentAgentStreamRequest(agentRequestId)) return;
            setAgentsLoading(false);
          });
      } else {
        setAgents([]);
        setAgentsLoading(false);
      }

      // Functional skills + design templates land independently. Both
      // gate `skillsLoading` together so the EntryView stops rendering
      // its loader once both registries respond — neither tab would have
      // a complete picture if we cleared the flag on the first reply.
      let functionalReady = false;
      let templatesReady = false;
      const maybeClearLoading = () => {
        if (functionalReady && templatesReady) setSkillsLoading(false);
      };
      if (fetchEntryCatalogs) {
        void fetchSkills().then((list) => {
          if (cancelled) return;
          setSkills(list);
          functionalReady = true;
          maybeClearLoading();
        });

        void fetchDesignTemplatesForCurrentBranding().then((list) => {
          if (cancelled) return;
          setDesignTemplates(list);
          templatesReady = true;
          maybeClearLoading();
        });

        void fetchDesignSystems().then((list) => {
          if (cancelled) return;
          setDesignSystems(list);
          setDsLoading(false);
        });
      } else {
        setSkills([]);
        setDesignTemplates([]);
        setDesignSystems([]);
        setSkillsLoading(false);
        setDsLoading(false);
      }

      const request = beginProjectListRequest();
      if (fetchHomeProjects) {
        void (async () => {
          if (isTeamverEmbedMode()) {
            await embedSessionBootPromise.catch(() => undefined);
            await waitForTeamverEmbedBoot();
          }
          if (cancelled) return;
          const result = await loadRecentProjectsForHome();
          if (cancelled) return;
          if (!result.ok) {
            setWorkingDirError(result.errorMessage);
          } else {
            setWorkingDirError(null);
            reconcileFetchedProjects(result.projects, request);
            warmEmbedProjectListCaches(result.projects);
          }
          setProjectsLoading(false);
        })();
      } else {
        setProjectsLoading(false);
      }

      if (fetchEntryCatalogs) {
        void listTemplates().then((list) => {
          if (cancelled) return;
          setTemplates(list);
        });
      }

      if (shouldFetchPromptTemplateCatalog()) {
        void fetchPromptTemplates().then((list) => {
          if (cancelled) return;
          setPromptTemplates(list);
          setPromptTemplatesLoading(false);
        });
      } else {
        setPromptTemplates([]);
        setPromptTemplatesLoading(false);
      }

      if (shouldFetchAppVersionAboutPanel()) {
        void fetchAppVersionInfo().then((info) => {
          if (cancelled) return;
          setAppVersionInfo(info);
        });
      }

      // Daemon-persisted config + composio config + media provider config land
      // together so the welcome-modal decision and daemon-backed settings
      // apply in one merge, avoiding a flash where local-only state is shown
      // before daemon overrides it.
      void Promise.all([
        fetchDaemonConfig(),
        isTeamverEmbedMode() ? Promise.resolve(null) : fetchComposioConfigFromDaemon(),
        shouldFetchMediaProviderConfig()
          ? fetchMediaProvidersFromDaemon()
          : Promise.resolve({ status: 'ok' as const, providers: {} }),
        embedSessionBootPromise,
      ]).then(([
        daemonConfig,
        daemonComposioConfig,
        daemonMediaProvidersResult,
        teamverRuntimeConfig,
      ]) => {
        if (cancelled) return;
        const daemonMediaProvidersLoaded =
          daemonMediaProvidersResult.status === 'ok'
            ? daemonMediaProvidersResult.providers
            : null;
        setDaemonMediaProviders(daemonMediaProvidersLoaded);
        setDaemonMediaProvidersFetchState(daemonMediaProvidersResult.status);
        setMediaProvidersNotice(
          daemonMediaProvidersResult.status === 'error'
            ? t('settings.mediaProviderLoadError')
            : null,
        );
        // Compute the next config outside the setConfig updater so we can
        // both (a) call navigate() after setConfig returns — calling it
        // inside the updater would trigger a Router setState during React's
        // render phase — and (b) read next.onboardingCompleted synchronously,
        // since React batches setConfig and the updater doesn't run until
        // the next render. latestPersistedConfigRef is kept in sync with
        // the rendered config and is safe to read here.
        const baseConfig = latestPersistedConfigRef.current;
        const migratedLocalMediaProviders = shouldSyncLocalMediaProvidersToDaemon(
          baseConfig.mediaProviders,
          daemonMediaProvidersLoaded,
        );
        let next = mergeDaemonMediaProviders(
          clearStaleAmrModelChoiceOnProfileChange(
            baseConfig,
            mergeDaemonConfig(baseConfig, daemonConfig),
          ),
          daemonMediaProvidersLoaded,
        );
        const hasLocalComposioKey = Boolean(next.composio?.apiKey?.trim());
        if (!hasLocalComposioKey && daemonComposioConfig) {
          next.composio = daemonComposioConfig;
        }
        if (teamverRuntimeConfig?.configured) {
          next = mergeTeamverRuntimeConfigIntoAppConfig(next, teamverRuntimeConfig);
        }
        const lockedNext = applyTeamverEmbedConfigLockIfNeeded(next);
        saveConfig(lockedNext);
        if (
          daemonMediaProvidersResult.status === 'ok' &&
          migratedLocalMediaProviders &&
          hasAnyConfiguredProvider(lockedNext.mediaProviders)
        ) {
          void syncMediaProvidersToDaemon(lockedNext.mediaProviders, {
            daemonProviders: daemonMediaProvidersLoaded,
          });
        }
        void syncConfigToDaemon(lockedNext);
        // Embed: Composio UI is hidden; daemon PUT is loopback-only (403 on remote staging).
        if (!isTeamverEmbedMode()) {
          void syncComposioConfigToDaemon(lockedNext.composio);
        }
        latestPersistedConfigRef.current = lockedNext;
        setConfig(lockedNext);

        // Route first-run users through the global onboarding panel.
        // Embed skips onboarding — execution is server-managed (API mode lock).
        if (!lockedNext.onboardingCompleted && !isTeamverEmbedMode()) {
          navigate({ kind: 'home', view: 'onboarding' }, { replace: true });
        }
        setDaemonConfigLoaded(true);
        // Composio key hydration is part of this same daemon-config
        // fetch — by the time we land here the daemon has either
        // returned the saved-key shape (apiKeyConfigured + tail) or
        // it errored and we kept whatever localStorage held. Either
        // way it is safe to drop the skeleton.
        setComposioConfigLoading(false);
      });
    })();
    return () => {
      cancelled = true;
      agentStreamAbort.abort();
    };
  }, [
    beginAgentStreamRequest,
    beginProjectListRequest,
    fetchDesignTemplatesForCurrentBranding,
    isCurrentAgentStreamRequest,
    reconcileFetchedProjects,
  ]);

  // Auto-pick the first available agent once both the daemon-stored config
  // and the agents listing have landed. Splitting this out of bootstrap
  // avoids racing the local-config initial value against a slow agents
  // probe — by the time this runs, daemonConfig has already overlaid the
  // user's previous choice, so we only fill an empty slot.
  //
  // First-run onboarding is the one time we must NOT do this: the onboarding
  // flow is the sole authority for the initial agent pick (AMR is the
  // recommended default there), and AMR (vela) detection is asynchronous. If
  // this fallback fires during onboarding while AMR is still being detected it
  // snaps the slot to the registry-first *detected* agent (Claude) and
  // persists it to the daemon, which then races and clobbers the user's AMR
  // selection on the next launch. Gate on onboardingCompleted so this only
  // backfills an empty slot for returning users.
  useEffect(() => {
    if (!daemonConfigLoaded || agentsLoading) return;
    if (isTeamverEmbedMode()) return;
    if (config.onboardingCompleted !== true) return;
    if (config.agentId) return;
    const firstAvailable = agents.find((a) => a.available);
    if (!firstAvailable) return;
    setConfig((prev) => {
      if (prev.agentId) return prev;
      const next: AppConfig = { ...prev, agentId: firstAvailable.id };
      saveConfig(next);
      void syncConfigToDaemon(next);
      return next;
    });
  }, [
    daemonConfigLoaded,
    agentsLoading,
    agents,
    config.agentId,
    config.onboardingCompleted,
  ]);

  // Embed: browser back from Design home should stay in Design, not Main FE /thread.
  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    return installTeamverEmbedHistoryBoundary();
  }, []);

  // Embed: block deep-links to hidden OD surfaces (plugins / integrations / marketplace).
  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    const branding = resolveTeamverBranding();
    const clamped = clampTeamverEmbedRoute(route, branding);
    if (teamverEmbedRouteChanged(route, clamped)) {
      navigate(clamped, { replace: true });
    }
  }, [route]);

  // Embed: daemon merge or config writers can drift mode/agent — re-apply lock.
  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    const locked = applyTeamverEmbedConfigLockIfNeeded(config);
    if (locked === config) return;
    latestPersistedConfigRef.current = locked;
    saveConfig(locked);
    setConfig(locked);
    void syncConfigToDaemon(locked);
  }, [config]);

  // Auto-pick the default design system the same way — only after daemon
  // config has merged so we never overwrite a daemon-stored selection.
  useEffect(() => {
    if (!daemonConfigLoaded || dsLoading) return;
    if (config.designSystemId) return;
    if (designSystems.length === 0) return;
    const id =
      designSystems.find((d) => d.id === 'default')?.id ?? designSystems[0]!.id;
    setConfig((prev) => {
      if (prev.designSystemId) return prev;
      const next: AppConfig = { ...prev, designSystemId: id };
      saveConfig(next);
      void syncConfigToDaemon(next);
      return next;
    });
  }, [daemonConfigLoaded, dsLoading, designSystems, config.designSystemId]);

  // One-shot self-healing migration for pets adopted before the
  // overlay learned atlas-row switching. If the stored pet is a
  // custom / codex pet whose imageUrl is a single-row strip
  // (no atlas), we silently re-download the full spritesheet so
  // hover, drag, and idle-ambient variety all light up on next render.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const upgraded = await migrateCustomPetAtlas(config);
      if (!upgraded || cancelled) return;
      setConfig((prev) => {
        if (!prev.pet) return prev;
        const next: AppConfig = {
          ...prev,
          pet: { ...prev.pet, custom: upgraded },
        };
        saveConfig(next);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // Snapshot the config at mount; migration is one-shot per session
    // and should not re-run every time config changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mergeProjectsByRecency = useCallback((current: Project[], incoming: Project[]) => {
    const merged = new Map<string, Project>();
    for (const project of [...current, ...incoming]) {
      merged.set(project.id, project);
    }
    return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);

  const applyProjectsPageResult = useCallback((
    result: { projects: Project[]; hasMore: boolean; nextCursor: string | null },
    request: ProjectListRequest,
    mode: 'replace' | 'append',
  ) => {
    projectsNextCursorRef.current = result.nextCursor;
    setProjectsHasMore(result.hasMore);
    if (mode === 'replace') {
      reconcileFetchedProjects(result.projects, request);
    } else {
      setProjects((current) => mergeProjectsByRecency(current, result.projects));
    }
    warmEmbedProjectListCaches(result.projects);
  }, [mergeProjectsByRecency, reconcileFetchedProjects]);

  const ensureProjectsListPageLoaded = useCallback(async () => {
    if (projectsPageLoadedRef.current) return;
    projectsPageLoadedRef.current = true;
    setProjectsPageLoading(true);
    const request = beginProjectListRequest();
    try {
      const result = await loadProjectListPage();
      if (!result.ok) {
        projectsPageLoadedRef.current = false;
        setWorkingDirError(result.errorMessage);
        return;
      }
      setWorkingDirError(null);
      applyProjectsPageResult(result, request, 'replace');
    } finally {
      setProjectsPageLoading(false);
    }
  }, [applyProjectsPageResult, beginProjectListRequest]);

  const loadMoreProjects = useCallback(async () => {
    if (projectsLoadingMore || !projectsHasMore || !projectsNextCursorRef.current) return;
    setProjectsLoadingMore(true);
    try {
      let cursor: string | null = projectsNextCursorRef.current;
      // Embed registry filter can drop an entire daemon page — advance until
      // we surface rows or exhaust server pages (cap avoids runaway loops).
      for (let attempt = 0; attempt < 8 && cursor; attempt += 1) {
        const result = await loadProjectListPage(cursor);
        if (!result.ok) {
          setWorkingDirError(result.errorMessage);
          return;
        }
        projectsNextCursorRef.current = result.nextCursor;
        setProjectsHasMore(result.hasMore);
        if (result.projects.length > 0) {
          setProjects((current) => mergeProjectsByRecency(current, result.projects));
          warmEmbedProjectListCaches(result.projects);
        }
        if (result.projects.length > 0 || !result.hasMore) break;
        cursor = result.nextCursor;
      }
    } finally {
      setProjectsLoadingMore(false);
    }
  }, [mergeProjectsByRecency, projectsHasMore, projectsLoadingMore]);

  const refreshProjects = useCallback(async () => {
    const request = beginProjectListRequest();
    const result = await loadProjectListPage();
    if (!result.ok) {
      // Retain the previous list on transient failure so the surface does
      // not flash empty. Reset the ref so the next `/projects` visit retries.
      projectsPageLoadedRef.current = false;
      setWorkingDirError(result.errorMessage);
      return;
    }
    setWorkingDirError(null);
    projectsPageLoadedRef.current = true;
    applyProjectsPageResult(result, request, 'replace');
  }, [applyProjectsPageResult, beginProjectListRequest]);

  const refreshEmbedProjectMetadata = useCallback(async (projectId: string) => {
    const trimmedId = projectId.trim();
    if (!trimmedId) return;
    if (locallyDeletedProjectIdsRef.current.has(trimmedId)) return;
    try {
      const project = await getProject(trimmedId);
      if (!project) return;
      if (locallyDeletedProjectIdsRef.current.has(trimmedId)) return;
      setProjects((current) => mergeProjectIntoList(current, project));
      warmEmbedProjectListCaches([project]);
      setWorkingDirError(null);
    } catch {
      // Detail view keeps working from daemon state; list/registry sync is optional.
    }
  }, []);

  const refreshProjectsSurface = useCallback(async () => {
    const detailRoute = readEmbedProjectDetailRoute(routeRef.current);
    if (detailRoute) {
      await refreshEmbedProjectMetadata(detailRoute.projectId);
      return;
    }
    await refreshProjects();
  }, [refreshEmbedProjectMetadata, refreshProjects]);

  useEffect(() => {
    if (route.kind !== 'home' || route.view !== 'projects') return;
    void ensureProjectsListPageLoaded();
  }, [route, ensureProjectsListPageLoaded]);

  const notifyEmbedSubmitBlocked = useCallback(() => {
    if (isTeamverEmbedMode() && !embedWorkspaceId) {
      setWorkingDirError(
        formatTeamverProjectRegistryErrorMessage("teamver_workspace_required"),
      );
      return;
    }
    setWorkingDirError(
      formatTeamverDesignDisabledMessage(
        readTeamverDesignAccessSnapshot()?.appDisabledReason,
      ),
    );
  }, [embedWorkspaceId]);

  const embedInteractionDisabled =
    isTeamverEmbedMode() && (!embedDesignAppEnabled || !embedWorkspaceId);

  useEffect(() => {
    if (!isTeamverEmbedMode()) {
      setEmbedWorkspaceId(null);
      return;
    }
    let cancelled = false;
    const syncWorkspace = async () => {
      await waitForTeamverEmbedBoot();
      if (cancelled) return;
      const id = (await readActiveTeamverWorkspaceId())?.trim() || null;
      if (!cancelled) {
        embedActiveWorkspaceIdRef.current = id;
        setEmbedWorkspaceId(id);
      }
    };
    void syncWorkspace();
    const unsubscribeWorkspace = subscribeTeamverWorkspaceChanged(({ workspaceId }) => {
      setEmbedWorkspaceId(workspaceId.trim() || null);
    });
    const unsubscribeSession = subscribeTeamverEmbedSessionChanged(({ authenticated }) => {
      if (!authenticated) {
        setEmbedWorkspaceId(null);
        return;
      }
      void syncWorkspace();
    });
    return () => {
      cancelled = true;
      unsubscribeWorkspace();
      unsubscribeSession();
    };
  }, []);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    const syncDesignAccess = () => {
      setEmbedDesignAppEnabled(readTeamverDesignAccessSnapshot()?.appEnabled ?? true);
    };
    syncDesignAccess();
    return subscribeTeamverDesignAccessChanged(syncDesignAccess);
  }, []);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    setBackgroundRunSummaries((prev) => {
      if (prev.length === 0) return prev;
      const projectsById = new Map(projects.map((project) => [project.id, project]));
      const next = prev
        .filter(
          (summary) =>
            !locallyDeletedProjectIdsRef.current.has(summary.projectId)
            && (
              projectsById.has(summary.projectId)
              || pendingLocalProjectIdsRef.current.has(summary.projectId)
              || sessionActiveRunProjectIdsRef.current.has(summary.projectId)
            ),
        )
        .map((summary) => {
          const project = projectsById.get(summary.projectId);
          if (!project) return summary;
          return patchEmbedBackgroundRunSummaryForProject(summary, project);
        });
      return activeRunSummariesEqual(prev, next) ? prev : next;
    });
  }, [projects]);

  // Dismiss run-completion toast once the user opens that project (list/back nav).
  const activeRouteProjectIdForToast =
    route.kind === 'project' ? route.projectId : null;
  useEffect(() => {
    if (!isTeamverEmbedMode() || !activeRouteProjectIdForToast) return;
    setBackgroundRunNotice((notice) =>
      notice?.projectId === activeRouteProjectIdForToast ? null : notice,
    );
  }, [activeRouteProjectIdForToast]);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    return subscribeTeamverBackgroundChat(({ projectId, conversationId, assistantMessageId, active }) => {
      if (active) {
        byokBackgroundChatsRef.current.set(projectId, { conversationId, assistantMessageId });
        sessionActiveRunProjectIdsRef.current.add(projectId);
        byokProxyIdlePollsRef.current.delete(projectId);
      } else {
        byokBackgroundChatsRef.current.delete(projectId);
        sessionActiveRunProjectIdsRef.current.delete(projectId);
        byokProxyIdlePollsRef.current.delete(projectId);
      }
      publishTeamverSessionActiveRunProjectIds(sessionActiveRunProjectIdsRef.current);
      const byokRuns = syntheticByokRunsForTaskCenter(byokBackgroundChatsRef.current);
      const currentProjects = projectsRef.current;
      const projectsById = new Map(currentProjects.map((project) => [project.id, project.name]));
      const allowMissingProjectIds = buildEmbedActiveRunAllowMissingIds({
        sessionActiveRunProjectIds: sessionActiveRunProjectIdsRef.current,
        pendingLocalProjectIds: pendingLocalProjectIdsRef.current,
        locallyDeletedProjectIds: locallyDeletedProjectIdsRef.current,
      });
      const mergedRuns = [...byokRuns];
      if (configRef.current.pet?.enabled) {
        setPetTaskCenter(buildPetTaskCenter(currentProjects, mergedRuns, allowMissingProjectIds));
      }
      const daemonSummaries = buildActiveRunSummaries(
        currentProjects,
        mergedRuns,
        allowMissingProjectIds,
      );
      const activeSummaries = mergeByokBackgroundRunSummaries(
        daemonSummaries,
        byokBackgroundChatsRef.current,
        projectsById,
      );
      setBackgroundRunSummaries((prev) =>
        activeRunSummariesEqual(prev, activeSummaries) ? prev : activeSummaries,
      );
      wasActiveRunRef.current = activeSummaries.length > 0;
    });
  }, []);

  // Embed: leave project workspace when Design app becomes disabled mid-session.
  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    return subscribeTeamverDesignAccessChanged((detail) => {
      if (detail.appEnabled) return;
      setBackgroundRunNotice(null);
      setBackgroundRunSummaries([]);
      const current = routeRef.current;
      if (current.kind !== 'project') return;
      console.info('[teamver] home-nav: design app disabled mid-session', {
        projectId: current.projectId,
        reason: detail.appDisabledReason ?? null,
      });
      setWorkingDirError(formatTeamverDesignDisabledMessage(detail.appDisabledReason));
      navigate({ kind: 'home', view: 'home' }, { replace: true });
    });
  }, []);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    return subscribeTeamverWorkspaceChanged(({ workspaceId }) => {
      if (!isTeamverEmbedBootComplete()) return;
      const trimmed = workspaceId.trim();
      if (!trimmed) return;
      if (shouldSkipWorkspaceSwitchSideEffects(embedActiveWorkspaceIdRef.current, trimmed)) {
        embedActiveWorkspaceIdRef.current = trimmed;
        return;
      }
      const preSwitchProjectGuards = capturePreWorkspaceSwitchProjectGuards({
        route: routeRef.current,
        pendingLocalProjectIds: pendingLocalProjectIdsRef.current,
        sessionActiveRunProjectIds: sessionActiveRunProjectIdsRef.current,
      });
      workspaceSwitchReconcilingRef.current = true;
      preWorkspaceSwitchTrustedProjectsRef.current = preSwitchProjectGuards;
      embedActiveWorkspaceIdRef.current = trimmed;
      pendingLocalProjectIdsRef.current.clear();
      locallyDeletedProjectIdsRef.current.clear();
      clearTeamverEmbedListCaches();
      projectsPageLoadedRef.current = false;
      projectsNextCursorRef.current = null;
      // Keep previous cards visible until the new workspace list arrives —
      // clearing first left a permanent empty home when reload failed.
      setProjectsHasMore(false);
      setProjectsLoading(true);
      setProjectsRefreshing(true);
      setBackgroundRunSummaries([]);
      setBackgroundRunNotice(null);
      byokBackgroundChatsRef.current.clear();
      byokProxyIdlePollsRef.current.clear();
      resetEmbedRunTrackingRefs({
        activeRunIds: activeRunIdsRef,
        notifiedBackgroundRunIds: notifiedBackgroundRunIdsRef,
        wasActiveRun: wasActiveRunRef,
        activeRunSignature: activeRunSignatureRef,
        sessionActiveRunProjectIds: sessionActiveRunProjectIdsRef,
      });
      void (async () => {
        try {
          try {
            await syncAllDaemonProjectsToRegistry();
          } catch (err) {
            console.warn("[teamver] registry sync on workspace switch failed", err);
          }
          void reloadTeamverRuntimeConfig({ force: true });
          const request = beginProjectListRequest();
          const result = await loadProjectListPage();
          if (!result.ok) {
            projectsPageLoadedRef.current = false;
            setWorkingDirError(result.errorMessage);
            return;
          }
          projectsPageLoadedRef.current = true;
          applyProjectsPageResult(result, request, 'replace');
          setWorkingDirError(null);
          warmEmbedProjectListCaches(result.projects);
          window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
          const current = routeRef.current;
          if (shouldNavigateHomeAfterWorkspaceProjectList(current, result.projects)) {
            const currentProjectId = current.kind === 'project' ? current.projectId : null;
            const allowed = currentProjectId
              ? isPreWorkspaceSwitchTrustedProject(currentProjectId, preSwitchProjectGuards) ||
                isSessionTrustedEmbedProject(currentProjectId) ||
                await assertTeamverProjectAccessIfNeeded(currentProjectId)
              : false;
            if (allowed) {
              console.info('[teamver] workspace switch — project missing from list but access confirmed', {
                projectId: currentProjectId,
                workspaceId: trimmed,
              });
              return;
            }
            console.info('[teamver] home-nav: workspace switch — project not in new list', {
              projectId: currentProjectId,
              workspaceId: trimmed,
            });
            setWorkingDirError(formatTeamverProjectAccessDeniedMessage());
            navigate({ kind: 'home', view: 'home' }, { replace: true });
          }
        } finally {
          setProjectsLoading(false);
          setProjectsRefreshing(false);
          workspaceSwitchReconcilingRef.current = false;
          preWorkspaceSwitchTrustedProjectsRef.current = new Set();
        }
      })();
    });
  }, [
    applyProjectsPageResult,
    beginProjectListRequest,
    isSessionTrustedEmbedProject,
    reloadTeamverRuntimeConfig,
  ]);

  // Pageshow/visibility return — recover from sleep/standby/backgrounded tab
  // and pick up BE runtime-config changes (rotated keys, model swap, base url).
  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      void reloadTeamverRuntimeConfig();
    };
    window.addEventListener("pageshow", handler);
    document.addEventListener("visibilitychange", handler);
    return () => {
      window.removeEventListener("pageshow", handler);
      document.removeEventListener("visibilitychange", handler);
    };
  }, [reloadTeamverRuntimeConfig]);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    return subscribeTeamverEmbedSessionChanged(({ authenticated }) => {
      if (!authenticated) {
        pendingLocalProjectIdsRef.current.clear();
        locallyDeletedProjectIdsRef.current.clear();
        clearTeamverEmbedListCaches();
        projectsPageLoadedRef.current = false;
        setProjects([]);
        setProjectsLoading(false);
        setProjectsRefreshing(false);
        setBackgroundRunSummaries([]);
        setBackgroundRunNotice(null);
        resetEmbedRunTrackingRefs({
          activeRunIds: activeRunIdsRef,
          notifiedBackgroundRunIds: notifiedBackgroundRunIdsRef,
          wasActiveRun: wasActiveRunRef,
          activeRunSignature: activeRunSignatureRef,
          sessionActiveRunProjectIds: sessionActiveRunProjectIdsRef,
        });
        void listProjectRuns()
          .then((runs) => {
            seedEmbedRunTrackingFromRuns(
              {
                activeRunIds: activeRunIdsRef,
                notifiedBackgroundRunIds: notifiedBackgroundRunIdsRef,
                wasActiveRun: wasActiveRunRef,
                activeRunSignature: activeRunSignatureRef,
                sessionActiveRunProjectIds: sessionActiveRunProjectIdsRef,
              },
              runs,
              [],
            );
          })
          .catch(() => {});
        return;
      }
      void (async () => {
        const detailRoute = readEmbedProjectDetailRoute(routeRef.current);
        if (detailRoute) {
          await refreshEmbedProjectMetadata(detailRoute.projectId);
          void reloadTeamverRuntimeConfig({ force: true });
          return;
        }
        if (projectsRef.current.length > 0) {
          setProjectsRefreshing(true);
        } else {
          setProjectsLoading(true);
        }
        await refreshProjects();
        void reloadTeamverRuntimeConfig({ force: true });
        setProjectsLoading(false);
        setProjectsRefreshing(false);
      })();
    });
  }, [refreshEmbedProjectMetadata, refreshProjects, reloadTeamverRuntimeConfig]);

  const refreshDesignSystems = useCallback(async () => {
    const list = await fetchDesignSystems();
    setDesignSystems(list);
  }, []);

  const refreshSkills = useCallback(async () => {
    const list = await fetchSkills();
    setSkills(list);
  }, []);

  const refreshTemplates = useCallback(async () => {
    const list = await listTemplates();
    setTemplates(list);
  }, []);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    const ok = await deleteTemplate(id);
    if (ok) await refreshTemplates();
    return ok;
  }, [refreshTemplates]);

  const reloadMediaProvidersFromDaemon = useCallback(async () => {
    const result = await fetchMediaProvidersFromDaemon();
    if (result.status !== 'ok') {
      setDaemonMediaProvidersFetchState('error');
      setMediaProvidersNotice(
        t('settings.mediaProviderLoadError'),
      );
      return null;
    }
    setDaemonMediaProviders(result.providers);
    setDaemonMediaProvidersFetchState('ok');
    setMediaProvidersNotice(null);
    setConfig((prev) => {
      const merged = mergeDaemonMediaProviders(prev, result.providers);
      saveConfig(merged);
      return merged;
    });
    return result.providers;
  }, []);

  /**
   * Autosave-driven persistence path. The settings dialog calls this on
   * every committed edit (via a debounced effect) so localStorage and
   * the daemon stay in lock-step with the user's draft. We deliberately
   * do NOT touch the Composio secret here — it has its own gesture
   * (handleConfigPersistComposioKey) so partial keys never leave the
   * browser. Onboarding is also left alone; the dialog's close path
   * is the canonical "I'm done" signal.
   */
  const handleConfigPersist = useCallback(async (
    next: AppConfig,
    options?: { forceMediaProviderSync?: boolean },
  ) => {
    // Strip the in-flight Composio secret before anything hits disk so
    // a half-typed key can't survive in localStorage. If the dialog is
    // closing, preserve any onboarding completion that the close gesture
    // already committed so an unmount autosave cannot re-open the welcome flow.
    const persisted = buildPersistedConfig(next, configRef.current);
    latestPersistedConfigRef.current = persisted;
    saveConfig(persisted);
    setConfig(persisted);
    const shouldSyncMediaProviders =
      daemonMediaProvidersFetchState === 'ok'
      && shouldSyncMediaProvidersOnSave(persisted.mediaProviders, {
        force: options?.forceMediaProviderSync,
      });
    await Promise.all([
      shouldSyncMediaProviders
        ? syncMediaProvidersToDaemon(persisted.mediaProviders, {
            force: options?.forceMediaProviderSync,
            daemonProviders: daemonMediaProviders,
            throwOnError: options?.forceMediaProviderSync,
          })
        : Promise.resolve(),
      syncConfigToDaemon(persisted, { throwOnError: true }),
    ]);
  }, [daemonMediaProviders, daemonMediaProvidersFetchState]);

  /**
   * Explicit Composio API-key save. Called from the section-local
   * "Save key" button so secrets never ride the autosave keystroke
   * loop. Once the daemon confirms, we normalize the saved config
   * (strip the secret, store apiKeyConfigured + apiKeyTail) and feed
   * it back into local state so the saved-key badge appears.
   */
  const handleConfigPersistComposioKey = useCallback(
    async (composio: AppConfig['composio']) => {
      const next = await persistComposioConfigChange(config, composio);
      setConfig((curr) => {
        const merged: AppConfig = { ...curr, composio: next.composio };
        saveConfig(merged);
        return merged;
      });
    },
    [config],
  );

  const handleModeChange = useCallback(
    (mode: AppConfig['mode']) => {
      if (isTeamverExecutionConfigLocked()) return;
      const next = { ...config, mode };
      saveConfig(next);
      setConfig(next);
    },
    [config],
  );

  // Quick theme switch from the settings dropdown in the entry view.
  // Skips the full SettingsDialog round-trip so the appearance flip
  // feels instantaneous; the live preview comes for free because the
  // `useLayoutEffect` above re-runs `applyAppearanceToDocument` the
  // moment `config.theme` changes. We still persist to localStorage
  // and the daemon so the choice survives reloads.
  const handleThemeChange = useCallback(
    (theme: AppConfig['theme']) => {
      const next = { ...config, theme };
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const handleAgentChange = useCallback(
    (agentId: string) => {
      if (isTeamverExecutionConfigLocked()) return;
      const next = { ...config, agentId };
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const handleAgentModelChange = useCallback(
    (agentId: string, choice: { model?: string; reasoning?: string }) => {
      if (isTeamverExecutionConfigLocked()) return;
      const prev = config.agentModels?.[agentId] ?? {};
      const merged = { ...prev, ...choice };
      const nextAgentModels = {
        ...(config.agentModels ?? {}),
        [agentId]: merged,
      };
      const next = { ...config, agentModels: nextAgentModels };
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  // BYOK protocol switch — also flips `mode` to 'api' so the user does
  // not have to take a second step after picking a provider from the
  // inline switcher. The helper preserves any per-protocol fields the
  // user had previously configured for the target protocol.
  const handleApiProtocolChange = useCallback(
    (protocol: ApiProtocol) => {
      if (isTeamverExecutionConfigLocked()) return;
      const next = switchApiProtocolConfig(config, protocol);
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  // BYOK model picker — patches `model` (and the per-protocol shadow
  // copy) without touching apiKey/baseUrl so the user can swap models
  // mid-session without retyping their key.
  const handleApiModelChange = useCallback(
    (model: string) => {
      if (isTeamverExecutionConfigLocked()) return;
      const next = updateCurrentApiProtocolConfig(config, { model });
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const handleChangeDefaultDesignSystem = useCallback(
    (designSystemId: string | null) => {
      const next = { ...config, designSystemId };
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const refreshAgents = useCallback(
    async (options?: { throwOnError?: boolean; agentCliEnv?: AppConfig['agentCliEnv'] }) => {
      if (options && Object.prototype.hasOwnProperty.call(options, 'agentCliEnv')) {
        const nextConfig = clearStaleAmrModelChoiceOnProfileChange(config, {
          ...config,
          agentCliEnv: options.agentCliEnv ?? {},
        });
        amrModelsRef.current = null;
        saveConfig(nextConfig);
        await syncConfigToDaemon(nextConfig);
        setConfig(nextConfig);
      }
      const agentRequestId = beginAgentStreamRequest();
      setAgentsLoading(true);
      try {
        const next = await fetchAgentsStream({
          onAgent: (agent) => {
            if (!isCurrentAgentStreamRequest(agentRequestId)) return;
            setAgents((current) =>
              mergeAmrModelsIntoAgents(
                upsertAgent(current, agent),
                amrModelsRef.current,
              ),
            );
          },
        });
        const ordered = orderAgentsByRegistry(next);
        if (isCurrentAgentStreamRequest(agentRequestId)) {
          setAgents(mergeAmrModelsIntoAgents(ordered, amrModelsRef.current));
          setAgentsLoading(false);
        }
        return ordered;
      } catch (err) {
        if (!isCurrentAgentStreamRequest(agentRequestId)) return [];
        setAgentsLoading(false);
        if (options?.throwOnError) throw err;
        setAgents([]);
        return [];
      }
    },
    [beginAgentStreamRequest, config, isCurrentAgentStreamRequest],
  );

  useEffect(() => {
    const handleAppConfigChanged = () => {
      void fetchDaemonConfig().then((daemonConfig) => {
        const merged = clearStaleAmrModelChoiceOnProfileChange(
          latestPersistedConfigRef.current,
          mergeDaemonConfig(latestPersistedConfigRef.current, daemonConfig),
        );
        const next = applyTeamverEmbedConfigLockIfNeeded(merged);
        latestPersistedConfigRef.current = next;
        saveConfig(next);
        setConfig(next);
        amrModelsRef.current = null;
        restartAmrPolling();
        void refreshAgents();
      });
    };
    window.addEventListener(APP_CONFIG_CHANGED_EVENT, handleAppConfigChanged);
    return () => window.removeEventListener(APP_CONFIG_CHANGED_EVENT, handleAppConfigChanged);
  }, [refreshAgents, restartAmrPolling]);

  const handleCreateProject = useCallback(
    async (
      input: CreateInput & {
        pendingPrompt?: string;
        pluginId?: string;
        pluginType?: string;
        appliedPluginSnapshotId?: string;
        pluginInputs?: Record<string, unknown>;
        conversationMode?: ChatSessionMode;
        autoSendFirstMessage?: boolean;
        requestId?: string;
        pendingFiles?: File[];
        pendingDriveAssets?: import('./teamver/importDriveAssets').TeamverDriveImportAsset[];
        userWorkingDirToken?: string;
      },
    ): Promise<boolean> => {
      // Honor an explicit `null` design system — the create panel defaults
      // to "None" for every kind now, and the user expects that to land
      // as a no-design-system project rather than silently inheriting the
      // workspace default.
      const derivedPendingPrompt =
      input.pendingPrompt ??
      (input.metadata?.promptTemplate?.prompt?.trim() || undefined);

      const kind = input.metadata?.kind ?? null;
      const fidelity = fidelityToTracking(input.metadata?.fidelity ?? null);
      const creationSource: 'blank' | 'template' | 'zip' | 'folder' =
        kind === 'template' ? 'template' : 'blank';
      if (isTeamverEmbedMode()) {
        const workspaceId = (await readActiveTeamverWorkspaceId())?.trim();
        if (!workspaceId) {
          setWorkingDirError(
            formatTeamverProjectRegistryErrorMessage("teamver_workspace_required"),
          );
          return false;
        }
        if (!isTeamverDesignAppEnabled(workspaceId)) {
          setWorkingDirError(
            formatTeamverDesignDisabledMessage(
              readTeamverDesignAccessSnapshot()?.appDisabledReason,
            ),
          );
          return false;
        }
      }
      const resolvedDesignSystemId = isTeamverEmbedMode()
        ? resolveEmbedSlideDesignSystemId({
            explicitId: input.designSystemId,
            workspaceDefaultId: config.designSystemId,
            designSystems,
          })
        : input.designSystemId;
      let result;
      try {
        result = await createProject({
          name: input.name,
          skillId: input.skillId,
          designSystemId: resolvedDesignSystemId,
          pendingPrompt: derivedPendingPrompt,
          metadata: input.metadata,
          ...(input.conversationMode ? { conversationMode: input.conversationMode } : {}),
          ...(input.pluginId ? { pluginId: input.pluginId } : {}),
          ...(input.appliedPluginSnapshotId
            ? { appliedPluginSnapshotId: input.appliedPluginSnapshotId }
            : {}),
          ...(input.pluginInputs ? { pluginInputs: input.pluginInputs } : {}),
        });
      } catch (err) {
        const errorCode =
          err instanceof Error && err.message.trim()
            ? err.message
            : 'CREATE_REQUEST_FAILED';
        trackProjectCreateResult(
          analytics.track,
          {
            page_name: 'home',
            area: 'new_project',
            project_source: 'create_button',
            project_id: null,
            project_kind: projectKindToTracking(kind),
            fidelity,
            result: 'failed',
            error_code: errorCode,
          },
          { requestId: input.requestId },
        );
        if (isTeamverEmbedMode() && err instanceof TeamverProjectRegistryError) {
          setWorkingDirError(formatTeamverProjectRegistryErrorMessage(err.code));
          return false;
        }
        throw err;
      }
      if (!result) {
        trackProjectCreateResult(
          analytics.track,
          {
            page_name: 'home',
            area: 'new_project',
            project_source: 'create_button',
            project_id: null,
            project_kind: projectKindToTracking(kind, input.metadata?.videoModel),
            fidelity,
            ...(input.pluginId ? { plugin_id: input.pluginId } : {}),
            ...(input.pluginType ? { plugin_type: input.pluginType } : {}),
            result: 'failed',
            error_code: 'CREATE_REQUEST_FAILED',
          },
          { requestId: input.requestId },
        );
        return false;
      }
      const pendingFiles = Array.isArray(input.pendingFiles)
        ? input.pendingFiles.filter((file): file is File => file instanceof File)
        : [];
      const pendingDriveAssets = Array.isArray(input.pendingDriveAssets)
        ? input.pendingDriveAssets.filter(
            (asset): asset is import('./teamver/importDriveAssets').TeamverDriveImportAsset =>
              Boolean(asset && typeof asset === 'object' && typeof asset.assetId === 'string'),
          )
        : [];
      // Flip the project onto the user-picked working directory BEFORE
      // uploading staged Home attachments. `replaceProjectWorkingDir` changes
      // `metadata.baseDir`, so the project starts reading from the external
      // folder. If we uploaded first, the staged files would land in the
      // temporary managed `.od/projects/<id>` root and then silently vanish
      // from Design Files and the first auto-send context once the working
      // dir flips. Doing the handoff first means the initial upload lands in
      // the final tree.
      const userWorkingDir = isTeamverEmbedMode()
        ? undefined
        : input.metadata?.userWorkingDir;
      let workingDirHandoffFailed = false;
      if (userWorkingDir) {
        try {
          await replaceProjectWorkingDir(
            result.project.id,
            userWorkingDir,
            input.userWorkingDirToken,
          );
        } catch (err) {
          // The desktop working-dir token is short-lived (~60s TTL); if the
          // user lingered on Home or the POST was otherwise rejected, the
          // handoff fails AFTER the project already exists. Do NOT swallow
          // this and do NOT proceed: uploading staged attachments or
          // auto-sending the first message would target the managed
          // `.od/projects/<id>` root the user did not choose. Mark the
          // handoff as failed so the upload + auto-send branches below are
          // skipped, then surface a create-time error so the user can
          // re-pick the working directory from inside the project.
          console.warn('Failed to set working directory for new project', userWorkingDir, err);
          workingDirHandoffFailed = true;
          setWorkingDirError(
            `Couldn't apply the chosen folder "${userWorkingDir}". The project was created in the default location — re-pick the working directory from the project before uploading files or sending a message.`,
          );
        }
      }
      let firstMessageAttachments: ChatAttachment[] = [];
      if (!workingDirHandoffFailed && pendingFiles.length > 0) {
        // Home composer attaches stay client-side until submit lands a
        // project; the actual upload happens here. v2 doc wants one
        // file_upload_result per surface — `page_name='home'` /
        // `area='chat_composer'` so it's distinguishable from the
        // file_manager Upload button and the chat_panel composer.
        const cohort = deriveUploadCohort(pendingFiles);
        const uploadResult = await uploadProjectFiles(result.project.id, pendingFiles);
        firstMessageAttachments = uploadResult.uploaded;
        const partial = uploadResult.failed.length > 0;
        if (partial) {
          console.warn('Some Home attachments failed to upload', uploadResult.failed);
        }
        trackFileUploadResult(analytics.track, {
          page_name: 'home',
          area: 'chat_composer',
          project_id: result.project.id,
          ...cohort,
          result: partial ? 'failed' : 'success',
          ...(partial && uploadResult.error
            ? { error_code: uploadResult.error }
            : {}),
        });
      }
      if (!workingDirHandoffFailed && pendingDriveAssets.length > 0) {
        try {
          const driveResult = await importTeamverDriveAssets(result.project.id, pendingDriveAssets);
          const driveAttachments = driveImportedToChatAttachments(driveResult.imported);
          firstMessageAttachments = [...firstMessageAttachments, ...driveAttachments];
          if (driveResult.partial) {
            console.warn('Some Home Drive attachments failed to import', driveResult.failed);
            setWorkingDirError(
              `일부 Drive 파일을 가져오지 못했습니다 (${driveResult.failed.length}개). 프로젝트는 생성되었습니다.`,
            );
          }
        } catch (err) {
          console.warn('Home Drive import failed for new project', err);
          setWorkingDirError(formatTeamverDriveImportErrorMessage(err));
        }
      }
      trackProjectCreateResult(
        analytics.track,
        {
          page_name: 'home',
          area: 'new_project',
          project_source: 'create_button',
          project_id: result.project.id,
          project_kind: projectKindToTracking(kind, input.metadata?.videoModel),
          fidelity,
          ...(input.pluginId ? { plugin_id: input.pluginId } : {}),
          ...(input.pluginType ? { plugin_type: input.pluginType } : {}),
          result: 'success',
        },
        { requestId: input.requestId },
      );
      // PluginLoopHome flow: the user already typed (or accepted) the
      // first message on Home. Mark this project so ProjectView fires
      // sendMessage(pendingPrompt) once on mount instead of just
      // pre-filling the composer. Scoped to sessionStorage so a page
      // reload after the run has started does not refire.
      if (
        !workingDirHandoffFailed &&
        input.autoSendFirstMessage &&
        (derivedPendingPrompt !== undefined || firstMessageAttachments.length > 0)
      ) {
        try {
          window.sessionStorage.setItem(
            `od:auto-send-first:${result.project.id}`,
            '1',
          );
          if (firstMessageAttachments.length > 0) {
            window.sessionStorage.setItem(
              `od:auto-send-attachments:${result.project.id}`,
              JSON.stringify(firstMessageAttachments),
            );
          } else {
            window.sessionStorage.removeItem(
              `od:auto-send-attachments:${result.project.id}`,
            );
          }
        } catch {
          /* sessionStorage may be unavailable (e.g. SSR / private mode); fall
             back to manual send. */
        }
      }
      const project = result.appliedPluginSnapshotId
        ? {
            ...result.project,
            appliedPluginSnapshotId: result.appliedPluginSnapshotId,
          }
        : result.project;
      rememberLocalProject(project.id);
      flushSync(() => {
        setProjects((curr) => [
          project,
          ...curr.filter((p) => p.id !== project.id),
        ]);
      });
      const projectRoute = {
        kind: 'project',
        projectId: project.id,
        fileName: null,
      } as const;
      if (!hideWorkspaceTabsBar) {
        openWorkspaceTab(projectRoute);
      }
      navigate(projectRoute);
      return true;
    },
    [analytics.track, config.designSystemId, designSystems, hideWorkspaceTabsBar, rememberLocalProject],
  );

  const handleCreatePluginShareProject = useCallback(
    async (
      pluginId: string,
      action: PluginShareAction,
      locale?: string,
    ): Promise<PluginShareProjectOutcome> => {
      const outcome = await createPluginShareProject(pluginId, action, locale);
      if (!outcome.ok) return outcome;
      try {
        window.sessionStorage.setItem(
          `od:auto-send-first:${outcome.project.id}`,
          '1',
        );
      } catch {
        // If sessionStorage is unavailable, the project still opens with
        // the prepared prompt in the composer.
      }
      const project = outcome.appliedPluginSnapshotId
        ? {
            ...outcome.project,
            appliedPluginSnapshotId: outcome.appliedPluginSnapshotId,
          }
        : outcome.project;
      rememberLocalProject(project.id);
      setProjects((curr) => [
        project,
        ...curr.filter((p) => p.id !== project.id),
      ]);
      navigate({
        kind: 'project',
        projectId: project.id,
        fileName: null,
      });
      return outcome;
    },
    [rememberLocalProject],
  );

  const handleImportClaudeDesign = useCallback(async (
    file: File,
  ): Promise<ImportClaudeDesignOutcome> => {
    try {
      const result = await importClaudeDesignZip(file);
      rememberLocalProject(result.project.id);
      setProjects((curr) => [
        result.project,
        ...curr.filter((p) => p.id !== result.project.id),
      ]);
      navigate({
        kind: 'project',
        projectId: result.project.id,
        fileName: result.entryFile,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'The ZIP could not be imported.',
      };
    }
  }, [rememberLocalProject]);

  const handleImportFolder = useCallback(async (baseDir: string) => {
    const result = await importFolderProject({ baseDir });
    rememberLocalProject(result.project.id);
    setProjects((curr) => [result.project, ...curr.filter((p) => p.id !== result.project.id)]);
    navigate({
      kind: 'project',
      projectId: result.project.id,
      fileName: null,
    });
  }, [rememberLocalProject]);

  // PR #974: on desktop, the host bridge owns the picker and import POST
  // atomically. The renderer never sees the path, token, or daemon DTO;
  // it receives host-owned project identifiers and refreshes project state
  // through the normal daemon API.
  const handleImportFolderResponse = useCallback(async (result: OpenDesignHostProjectImportSuccess) => {
    rememberLocalProject(result.projectId);
    const project = await getProject(result.projectId);
    if (project != null) {
      try {
        await registerTeamverProjectIfNeeded(project);
      } catch (err) {
        if (err instanceof TeamverProjectRegistryError) {
          console.info('[teamver] home-nav: project registry error on import', {
            projectId: result.projectId,
            code: err.code,
          });
          setWorkingDirError(formatTeamverProjectRegistryErrorMessage(err.code));
          navigate({ kind: 'home', view: 'home' }, { replace: true });
          return;
        }
        throw err;
      }
      setProjects((curr) => [project, ...curr.filter((p) => p.id !== project.id)]);
    } else {
      // Daemon hasn't materialized the full record yet (race between the
      // host's import POST and our /api/projects read). Seed a minimal
      // placeholder so the route stays alive and ProjectView mounts; the
      // pending-local id keeps reconcileFetchedProjects from evicting the
      // stub until a project-list snapshot actually includes it, and the
      // next refresh swaps it for the real Project record. Without the
      // stub, a stale `[]` list response would replace `projects` with `[]`
      // and the route-guard effect would bounce the user back to Home.
      const stub: Project = {
        id: result.projectId,
        name: '',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setProjects((curr) => [stub, ...curr.filter((p) => p.id !== stub.id)]);
      const request = beginProjectListRequest();
      const listResult = await loadProjectListSafe();
      if (listResult.ok) {
        reconcileFetchedProjects(listResult.projects, request);
      } else if (isTeamverEmbedMode()) {
        setWorkingDirError(listResult.errorMessage);
      }
    }
    navigate({
      kind: 'project',
      projectId: result.projectId,
      fileName: null,
    });
  }, [beginProjectListRequest, rememberLocalProject, reconcileFetchedProjects]);

  const navigateToProject = useCallback(
    async (
      projectId: string,
      extras: { fileName?: string | null; conversationId?: string | null } = {},
    ) => {
      if (isSessionTrustedEmbedProject(projectId)) {
        navigate({
          kind: 'project',
          projectId,
          fileName: extras.fileName ?? null,
          ...(extras.conversationId !== undefined
            ? { conversationId: extras.conversationId }
            : {}),
        });
        return;
      }

      const visibleOnList = projects.some((project) => project.id === projectId);
      let allowed = await assertTeamverProjectAccessIfNeeded(projectId);
      if (!allowed && visibleOnList) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        allowed = await assertTeamverProjectAccessIfNeeded(projectId);
      }
      if (!allowed) {
        if (isTeamverEmbedMode()) {
          setWorkingDirError(formatTeamverProjectAccessDeniedMessage());
        }
        return;
      }
      navigate({
        kind: 'project',
        projectId,
        fileName: extras.fileName ?? null,
        ...(extras.conversationId !== undefined
          ? { conversationId: extras.conversationId }
          : {}),
      });
    },
    [isSessionTrustedEmbedProject, projects],
  );

  const activeProjectRouteId = route.kind === 'project' ? route.projectId : null;
  useEffect(() => {
    if (!activeProjectRouteId) return;
    if (workspaceSwitchReconcilingRef.current) return;
    if (isPreWorkspaceSwitchTrustedProject(
      activeProjectRouteId,
      preWorkspaceSwitchTrustedProjectsRef.current,
    )) return;
    if (isSessionTrustedEmbedProject(activeProjectRouteId)) return;
    if (projects.some((project) => project.id === activeProjectRouteId)) return;
    let cancelled = false;
    void (async () => {
      let allowed = await assertTeamverProjectAccessIfNeeded(activeProjectRouteId);
      if (!allowed) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (cancelled) return;
        allowed = await assertTeamverProjectAccessIfNeeded(activeProjectRouteId);
      }
      if (cancelled || allowed) return;
      console.info('[teamver] home-nav: project access denied on route mount', {
        projectId: activeProjectRouteId,
      });
      if (isTeamverEmbedMode()) {
        setWorkingDirError(formatTeamverProjectAccessDeniedMessage());
      }
      navigate({ kind: 'home', view: 'home' }, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectRouteId, isSessionTrustedEmbedProject, projects]);

  const handleOpenProject = useCallback(
    (id: string, options?: { fileName?: string | null; conversationId?: string | null }) => {
      void navigateToProject(id, {
        fileName: options?.fileName ?? null,
        ...(options?.conversationId !== undefined
          ? { conversationId: options.conversationId }
          : {}),
      });
    },
    [navigateToProject],
  );

  useEffect(() => {
    if (!daemonLive) {
      setPetTaskCenter({ running: [], queued: [], recent: [] });
      setBackgroundRunSummaries([]);
      byokBackgroundChatsRef.current.clear();
      byokProxyIdlePollsRef.current.clear();
      resetEmbedRunTrackingRefs({
        activeRunIds: activeRunIdsRef,
        notifiedBackgroundRunIds: notifiedBackgroundRunIdsRef,
        wasActiveRun: wasActiveRunRef,
        activeRunSignature: activeRunSignatureRef,
        sessionActiveRunProjectIds: sessionActiveRunProjectIdsRef,
      });
      return;
    }

    let cancelled = false;
    let runsPollTimer: number | null = null;
    let runsPollInFlight = false;
    let runsPollPending = false;

    function clearRunsPollTimer() {
      if (runsPollTimer !== null) {
        window.clearTimeout(runsPollTimer);
        runsPollTimer = null;
      }
    }

    function nextRunsPollDelay() {
      if (!isTeamverEmbedMode()) return 2_000;
      if (wasActiveRunRef.current) return RUNS_POLL_ACTIVE_MS;
      if (document.visibilityState !== 'visible') return RUNS_POLL_IDLE_HIDDEN_MS;
      return RUNS_POLL_IDLE_MS;
    }

    const refresh = async () => {
      const runs = shouldPollDaemonRuns() ? await listProjectRuns() : [];
      if (cancelled) return;

      const currentProjects = projectsRef.current;
      const projectsById = new Map(currentProjects.map((project) => [project.id, project]));
      pruneSessionActiveRunProjectIds(sessionActiveRunProjectIdsRef.current, {
        projectsById,
        locallyDeletedProjectIds: locallyDeletedProjectIdsRef.current,
      });
      const knownProjectIds = isTeamverEmbedMode()
        ? buildEmbedKnownProjectIds({
            projectIds: currentProjects.map((project) => project.id),
            pendingLocalProjectIds: pendingLocalProjectIdsRef.current,
            sessionActiveRunProjectIds: sessionActiveRunProjectIdsRef.current,
            openProjectId: routeRef.current.kind === 'project' ? routeRef.current.projectId : null,
            locallyDeletedProjectIds: locallyDeletedProjectIdsRef.current,
          })
        : null;
      const trackedRuns = knownProjectIds
        ? filterRunsForEmbedKnownProjects(runs, knownProjectIds)
        : runs;
      if (isTeamverEmbedMode() && byokBackgroundChatsRef.current.size > 0) {
        const streamsByProjectId = new Map<
          string,
          Awaited<ReturnType<typeof listActiveByokProxyStreams>>
        >();
        let streamPollFailed = false;
        await Promise.all(
          [...byokBackgroundChatsRef.current.keys()].map(async (projectId) => {
            try {
              const streams = await listActiveByokProxyStreams(projectId);
              streamsByProjectId.set(projectId, streams);
            } catch (err) {
              streamPollFailed = true;
              console.warn("[teamver] byok background stream poll failed", {
                projectId,
                error: err,
              });
            }
          }),
        );
        if (cancelled) return;
        if (!streamPollFailed) {
          const removed = reconcileByokBackgroundChatsAfterPoll(
            byokBackgroundChatsRef.current,
            byokProxyIdlePollsRef.current,
            streamsByProjectId,
          );
          for (const projectId of removed) {
            sessionActiveRunProjectIdsRef.current.delete(projectId);
          }
        }
      }
      const byokRuns = isTeamverEmbedMode()
        ? syntheticByokRunsForTaskCenter(byokBackgroundChatsRef.current)
        : [];
      const allTrackedRuns = [...trackedRuns, ...byokRuns];
      const previousActiveRunIds = activeRunIdsRef.current;
      const nextActiveRunIds = new Set<string>();
      for (const run of trackedRuns) {
        if (run.status === 'queued' || run.status === 'running') {
          nextActiveRunIds.add(run.id);
          const projectId = run.projectId?.trim();
          if (projectId) sessionActiveRunProjectIdsRef.current.add(projectId);
        }
      }
      activeRunIdsRef.current = nextActiveRunIds;
      publishTeamverSessionActiveRunProjectIds(sessionActiveRunProjectIdsRef.current);

      const completed = trackedRuns
        .filter(
          (run) =>
            (run.status === 'succeeded' || run.status === 'failed')
            && previousActiveRunIds.has(run.id)
            && !notifiedBackgroundRunIdsRef.current.has(run.id)
            && run.projectId,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);

      const embedRunRefs = {
        activeRunIds: activeRunIdsRef,
        notifiedBackgroundRunIds: notifiedBackgroundRunIdsRef,
        wasActiveRun: wasActiveRunRef,
        activeRunSignature: activeRunSignatureRef,
        sessionActiveRunProjectIds: sessionActiveRunProjectIdsRef,
      };
      const completedRun = isTeamverEmbedMode()
        ? processEmbedBackgroundRunCompletions(
            completed,
            projectsById,
            !projectsLoadingRef.current,
            embedRunRefs,
            pendingLocalProjectIdsRef.current,
            locallyDeletedProjectIdsRef.current,
          )
        : (() => {
            for (const run of completed) notifiedBackgroundRunIdsRef.current.add(run.id);
            return completed[0];
          })();

      if (isTeamverEmbedMode() && completedRun?.projectId) {
        const currentRoute = routeRef.current;
        const inSameProject =
          currentRoute.kind === 'project' && currentRoute.projectId === completedRun.projectId;
        let completedProject = projectsById.get(completedRun.projectId);
        if (completedRun.status === 'succeeded') {
          const fresh = await getProject(completedRun.projectId);
          if (cancelled) return;
          if (fresh) {
            completedProject = fresh;
            clearProjectCoverCache(completedRun.projectId);
            void prefetchDesignsTabViewport([fresh]);
            void prefetchLatestPublishSummaries([completedRun.projectId]);
            if (!locallyDeletedProjectIdsRef.current.has(fresh.id)) {
              setProjects((curr) => {
                const idx = curr.findIndex((item) => item.id === fresh.id);
                if (idx < 0) return [...curr, fresh];
                return curr.map((item) => (item.id === fresh.id ? fresh : item));
              });
            }
          }
        }
        if (!inSameProject && !locallyDeletedProjectIdsRef.current.has(completedRun.projectId)) {
          const resolvedProjectName = completedProject?.name ?? 'teamver Design';
          const status = completedRun.status as 'succeeded' | 'failed';
          const reopenExtras = navigateExtrasForBackgroundRun(completedRun, completedProject);
          setBackgroundRunNotice({
            runId: completedRun.id,
            projectId: completedRun.projectId,
            projectName: resolvedProjectName,
            conversationId: completedRun.conversationId ?? null,
            status,
            reopenExtras,
          });

          const notifications = configRef.current.notifications ?? DEFAULT_NOTIFICATIONS;
          if (notifications.soundEnabled) {
            playSound(status === 'succeeded'
              ? notifications.successSoundId
              : notifications.failureSoundId);
          }
          if (notifications.desktopEnabled) {
            const shouldInterrupt = status === 'failed' || document.hidden || !document.hasFocus();
            if (shouldInterrupt) {
              void showCompletionNotification({
                status,
                title: status === 'succeeded' ? '슬라이드 작업 완료' : '슬라이드 작업 실패',
                body: resolvedProjectName,
                onClick: () => {
                  window.focus();
                  setBackgroundRunNotice(null);
                  const extras = reopenExtras;
                  if (status === 'succeeded' && extras.fileName?.trim()) {
                    armTeamverPublishMenuOnProjectOpen(completedRun.projectId!, extras.fileName);
                  }
                  void navigateToProject(completedRun.projectId!, extras);
                },
              });
            }
          }
        }
      }

      const allowMissingProjectIds = buildEmbedActiveRunAllowMissingIds({
        sessionActiveRunProjectIds: sessionActiveRunProjectIdsRef.current,
        pendingLocalProjectIds: pendingLocalProjectIdsRef.current,
        locallyDeletedProjectIds: locallyDeletedProjectIdsRef.current,
      });

      const center = buildPetTaskCenter(currentProjects, allTrackedRuns, allowMissingProjectIds);
      if (config.pet?.enabled) {
        setPetTaskCenter(center);
      } else {
        setPetTaskCenter({ running: [], queued: [], recent: [] });
      }

      const projectNamesById = new Map(currentProjects.map((project) => [project.id, project.name]));
      const daemonSummaries = buildActiveRunSummaries(
        currentProjects,
        isTeamverEmbedMode() ? allTrackedRuns : runs,
        allowMissingProjectIds,
      );
      const activeSummaries = isTeamverEmbedMode()
        ? mergeByokBackgroundRunSummaries(
            daemonSummaries,
            byokBackgroundChatsRef.current,
            projectNamesById,
          )
        : daemonSummaries;
      if (isTeamverEmbedMode()) {
        setBackgroundRunSummaries((prev) =>
          activeRunSummariesEqual(prev, activeSummaries) ? prev : activeSummaries,
        );
      }

      const active = activeSummaries.length > 0;
      const signature = buildActiveRunSignature(activeSummaries);
      const hadActive = wasActiveRunRef.current;
      wasActiveRunRef.current = active;

      if (active || hadActive) {
        const signatureChanged = signature !== activeRunSignatureRef.current;
        if (signatureChanged || (!active && hadActive)) {
          activeRunSignatureRef.current = signature;
          // Embed detail view: run completion already refreshes the finishing
          // project via GET /api/projects/:id above. A full daemon list plus
          // registry membership sync (GET /teamver-bff/projects) is redundant
          // while the user stays on a project workspace.
          const onProjectDetail = routeRef.current.kind === 'project';
          const onHome = routeRef.current.kind === 'home';
          if (!(isTeamverEmbedMode() && onProjectDetail)) {
            const request = beginProjectListRequest();
            const result = isTeamverEmbedMode() && onHome
              ? await loadRecentProjectsForHome()
              : await loadProjectListSafe();
            if (!cancelled && result.ok) {
              if (isTeamverEmbedMode() && onHome) {
                upsertRecentProjects(result.projects, request);
              } else {
                reconcileFetchedProjects(result.projects, request);
              }
              warmEmbedProjectListCaches(result.projects);
            }
          }
        }
      }
    };

    function scheduleNextRunsPoll() {
      if (cancelled) return;
      clearRunsPollTimer();
      runsPollTimer = window.setTimeout(() => {
        runsPollTimer = null;
        runRunsPoll();
      }, nextRunsPollDelay());
    }

    function runRunsPoll() {
      if (cancelled) return;
      if (runsPollInFlight) {
        runsPollPending = true;
        return;
      }
      runsPollInFlight = true;
      void refresh()
        .catch((err) => {
          console.warn("[teamver] runs poll failed", err);
        })
        .finally(() => {
          runsPollInFlight = false;
          if (cancelled) return;
          if (runsPollPending) {
            runsPollPending = false;
            runRunsPoll();
            return;
          }
          scheduleNextRunsPoll();
        });
    }

    const handleRunsChanged = () => {
      clearRunsPollTimer();
      runRunsPoll();
    };

    const handleRunsVisibilityChange = () => {
      clearRunsPollTimer();
      if (document.visibilityState === 'visible') {
        runRunsPoll();
      } else {
        scheduleNextRunsPoll();
      }
    };

    if (isTeamverEmbedMode() && routeRef.current.kind === 'project') {
      scheduleNextRunsPoll();
    } else {
      runRunsPoll();
    }
    window.addEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
    document.addEventListener('visibilitychange', handleRunsVisibilityChange);
    return () => {
      cancelled = true;
      window.removeEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
      document.removeEventListener('visibilitychange', handleRunsVisibilityChange);
      clearRunsPollTimer();
    };
  }, [
    beginProjectListRequest,
    config.pet?.enabled,
    daemonLive,
    navigateToProject,
    reconcileFetchedProjects,
  ]);

  const handleOpenLiveArtifact = useCallback((projectId: string, artifactId: string) => {
    void navigateToProject(projectId, { fileName: liveArtifactTabId(artifactId) });
  }, [navigateToProject]);

  const handleDeleteProject = useCallback(async (id: string) => {
    const ok = await deleteProjectApi(id);
    if (!ok) return false;
    const registryOk = await unregisterTeamverProjectFromRegistryIfNeeded(id);
    if (!registryOk) return false;
    if (isTeamverEmbedMode()) {
      clearTeamverEmbedProjectCaches(id);
    }
    clearLocalProject(id, { deleted: true });
    iframeKeepAlivePool.evictProject(id, { includeActive: true });
    sessionActiveRunProjectIdsRef.current.delete(id);
    publishTeamverSessionActiveRunProjectIds(sessionActiveRunProjectIdsRef.current);
    setProjects((curr) => curr.filter((p) => p.id !== id));
    setBackgroundRunNotice((notice) => (notice?.projectId === id ? null : notice));
    setBackgroundRunSummaries((prev) => prev.filter((summary) => summary.projectId !== id));
    if (route.kind === 'project' && route.projectId === id) {
      navigate({ kind: 'home', view: 'home' });
    }
    return true;
  }, [clearLocalProject, iframeKeepAlivePool, route]);

  const handleRenameProject = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const previous = projectsRef.current.find((p) => p.id === id);
    if (!previous) return;
    const optimistic: Project = { ...previous, name: trimmed };
    setProjects((curr) =>
      curr.map((p) => (p.id === id ? optimistic : p)),
    );
    if (isTeamverEmbedMode()) {
      setBackgroundRunNotice((notice) =>
        syncEmbedBackgroundRunSurfacesForProject(optimistic, { notice, summaries: [] }).notice,
      );
      setBackgroundRunSummaries((prev) =>
        syncEmbedBackgroundRunSurfacesForProject(optimistic, { notice: null, summaries: prev }).summaries,
      );
    }
    const updated = await patchProject(id, { name: trimmed });
    if (!updated) {
      setProjects((curr) =>
        curr.map((p) => (p.id === id ? previous : p)),
      );
      if (isTeamverEmbedMode()) {
        setBackgroundRunNotice((notice) =>
          syncEmbedBackgroundRunSurfacesForProject(previous, { notice, summaries: [] }).notice,
        );
        setBackgroundRunSummaries((prev) =>
          syncEmbedBackgroundRunSurfacesForProject(previous, { notice: null, summaries: prev }).summaries,
        );
      }
      return;
    }
    if (!isTeamverEmbedMode()) return;
    try {
      await registerTeamverProjectIfNeeded(updated);
    } catch (err) {
      console.warn('[teamver] registry sync after project rename failed', err);
    }
  }, []);

  const handleBack = useCallback(() => {
    navigate({ kind: 'home', view: 'home' });
  }, []);

  const handleClearPendingPrompt = useCallback(() => {
    const projectId = route.kind === 'project' ? route.projectId : null;
    if (!projectId) return;
    setProjects((curr) =>
      curr.map((p) =>
        p.id === projectId ? { ...p, pendingPrompt: undefined } : p,
      ),
    );
    void patchProject(projectId, { pendingPrompt: null });
  }, [route]);

  const handleTouchProject = useCallback(() => {
    const projectId = route.kind === 'project' ? route.projectId : null;
    if (!projectId) return;
    const updatedAt = Date.now();
    setProjects((curr) =>
      curr.map((p) => (p.id === projectId ? { ...p, updatedAt } : p)),
    );
    void patchProject(projectId, { updatedAt });
  }, [route]);

  const handleProjectChange = useCallback((updated: Project) => {
    const previous = projectsRef.current.find((p) => p.id === updated.id);
    setProjects((curr) => {
      if (
        isTeamverEmbedMode()
        && previous?.metadata?.entryFile !== updated.metadata?.entryFile
      ) {
        clearProjectCoverCache(updated.id);
        void prefetchDesignsTabViewport([updated]);
      }
      if (
        previous
        && (
          previous.skillId !== updated.skillId
          || previous.designSystemId !== updated.designSystemId
          || previous.customInstructions !== updated.customInstructions
        )
      ) {
        iframeKeepAlivePool.evictProject(updated.id, { includeActive: true });
      }
      return curr.map((p) => (p.id === updated.id ? updated : p));
    });
    if (
      isTeamverEmbedMode()
      && projectAffectsEmbedBackgroundRunSurfaces(previous, updated)
    ) {
      setBackgroundRunNotice((notice) =>
        syncEmbedBackgroundRunSurfacesForProject(updated, { notice, summaries: [] }).notice,
      );
      setBackgroundRunSummaries((prev) =>
        syncEmbedBackgroundRunSurfacesForProject(updated, { notice: null, summaries: prev }).summaries,
      );
    }
  }, [iframeKeepAlivePool]);

  // ProjectView's prompt-context signature derives from SkillSummary /
  // DesignSystemSummary fields, so a body-only registry edit (same name,
  // description, etc.) leaves every signature unchanged and the active
  // preview keeps serving stale prompt context. Settings → Skills /
  // Settings → Design Systems call back through these handlers after
  // every successful mutation; we drop any pool entry whose project
  // depends on the affected id — active or parked — so the next mount
  // recomposes the system prompt with the new body. `projectsRef` (declared
  // near project state) keeps these callbacks stable across renders.
  const handleSkillsChanged = useCallback(
    (affectedSkillId?: string) => {
      void fetchSkills().then((list) => setSkills(list));
      void fetchDesignTemplatesForCurrentBranding().then((list) => setDesignTemplates(list));
      iframeKeepAlivePool.evictMatching(
        (entry) => {
          const proj = projectsRef.current.find((p) => p.id === entry.projectId);
          if (!proj) return false;
          if (affectedSkillId) return proj.skillId === affectedSkillId;
          return proj.skillId != null;
        },
        { includeActive: true },
      );
    },
    [fetchDesignTemplatesForCurrentBranding, iframeKeepAlivePool],
  );

  const handleDesignSystemsChanged = useCallback(
    (affectedDesignSystemId?: string) => {
      void fetchDesignSystems().then((list) => setDesignSystems(list));
      iframeKeepAlivePool.evictMatching(
        (entry) => {
          const proj = projectsRef.current.find((p) => p.id === entry.projectId);
          if (!proj) return false;
          if (affectedDesignSystemId) {
            return proj.designSystemId === affectedDesignSystemId;
          }
          return proj.designSystemId != null;
        },
        { includeActive: true },
      );
    },
    [iframeKeepAlivePool],
  );
  const handleDesignSystemImportRebuildJob = useCallback(
    (designSystemId: string, job: DesignSystemGenerationJob) => {
      setPendingDesignSystemRevisionJobs((current) => ({
        ...current,
        [designSystemId]: job,
      }));
    },
    [],
  );
  const handleDesignSystemRevisionJobConsumed = useCallback((designSystemId: string, jobId: string) => {
    setPendingDesignSystemRevisionJobs((current) => {
      if (current[designSystemId]?.id !== jobId) return current;
      const next = { ...current };
      delete next[designSystemId];
      return next;
    });
  }, []);

  const activeProject =
    route.kind === 'project'
      ? (projects.find((p) => p.id === route.projectId) ?? null)
      : null;

  // Keep cream bootstrap until the first real surface is ready — otherwise
  // session boot unmasks a dark EntryShell while projects are still empty.
  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    if (route.kind === 'project' && activeProject) {
      revealTeamverEmbedChrome();
      return;
    }
    if (route.kind === 'home' && !projectsLoading) {
      revealTeamverEmbedChrome();
    }
  }, [activeProject, projectsLoading, route.kind]);

  // Deep-linked route to a project we don't have yet (e.g. after a refresh
  // that finishes after the project list comes back). Fetch it in the
  // background so the view can render rather than bouncing to home.
  useEffect(() => {
    if (route.kind !== 'project') return;
    if (activeProject) return;
    if (!isTeamverEmbedMode() && !projects.length && !daemonLive) return;
    if (projects.some((p) => p.id === route.projectId)) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureTeamverProjectRegisteredById(route.projectId);
      } catch (err) {
        console.warn('[teamver] home-nav: deep-linked project registry preflight failed', {
          projectId: route.projectId,
          error: err,
        });
      }
      const project = await getProject(route.projectId);
      if (cancelled) return;
      if (project) {
        let allowed = isSessionTrustedEmbedProject(route.projectId);
        if (!allowed) {
          try {
            allowed = await assertTeamverProjectAccessIfNeeded(route.projectId);
          } catch (err) {
            console.warn('[teamver] home-nav: deep-linked project access check failed', {
              projectId: route.projectId,
              error: err,
            });
            // Project detail/registry lookup already succeeded. Treat access
            // check transport errors as transient so direct file links do not
            // remain on the loading shell forever.
            allowed = true;
          }
        }
        if (cancelled) return;
        if (!allowed) {
          if (isTeamverEmbedMode()) {
            setWorkingDirError(formatTeamverProjectAccessDeniedMessage());
          }
          navigate({ kind: 'home', view: 'home' }, { replace: true });
          return;
        }
        setProjects((curr) => {
          const existingIndex = curr.findIndex((candidate) => candidate.id === project.id);
          if (existingIndex < 0) {
            return [...curr, project];
          }
          return curr.map((candidate) => (candidate.id === project.id ? project : candidate));
        });
        warmEmbedProjectListCaches([project]);
        return;
      }
      const detailRoute = readEmbedProjectDetailRoute(route);
      if (detailRoute) {
        if (!pendingLocalProjectIdsRef.current.has(detailRoute.projectId)) {
          console.info('[teamver] home-nav: deep-linked project not found (detail route)', {
            projectId: detailRoute.projectId,
          });
          if (isTeamverEmbedMode()) {
            setWorkingDirError(formatTeamverProjectNotFoundMessage());
          }
          navigate({ kind: 'home', view: 'home' }, { replace: true });
        }
        return;
      }
      const request = beginProjectListRequest();
      const result = await loadProjectListSafe();
      if (cancelled) return;
      if (!result.ok) {
        if (isTeamverEmbedMode()) {
          setWorkingDirError(result.errorMessage);
        }
        return;
      }
      setWorkingDirError(null);
      const applied = reconcileFetchedProjects(result.projects, request);
      if (!applied) return;
      warmEmbedProjectListCaches(result.projects);
      const fetchedProject = locallyDeletedProjectIdsRef.current.has(route.projectId)
        ? undefined
        : result.projects.find((p) => p.id === route.projectId);
      const staleRequest = request.mutationVersion < projectListMutationVersionRef.current;
      const knownLocalProject =
        staleRequest && pendingLocalProjectIdsRef.current.has(route.projectId);
      if (!fetchedProject && !knownLocalProject) {
        console.info('[teamver] home-nav: deep-linked project missing after list refresh', {
          projectId: route.projectId,
        });
        if (isTeamverEmbedMode()) {
          setWorkingDirError(formatTeamverProjectNotFoundMessage());
        }
        navigate({ kind: 'home', view: 'home' }, { replace: true });
      }
    })().catch((err) => {
      if (cancelled) return;
      console.warn('[teamver] home-nav: deep-linked project hydration failed', {
        projectId: route.projectId,
        error: err,
      });
      if (isTeamverEmbedMode()) {
        setWorkingDirError(formatTeamverProjectNotFoundMessage());
      }
      navigate({ kind: 'home', view: 'home' }, { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [
    route,
    activeProject,
    projects,
    daemonLive,
    beginProjectListRequest,
    isSessionTrustedEmbedProject,
    reconcileFetchedProjects,
  ]);

  const openSettings = useCallback((
    section: SettingsSection = 'execution',
    opts?: { highlight?: SettingsHighlight },
  ) => {
    const branding = resolveTeamverBranding();
    if (section === 'composio' || section === 'mcpClient' || section === 'integrations') {
      if (branding.enabled) {
        setSettingsWelcome(false);
        setSettingsInitialSection('language');
        setSettingsHighlight(null);
        setSettingsOpen(true);
        return;
      }
      setIntegrationInitialTab(
        section === 'composio'
          ? 'connectors'
          : section === 'mcpClient'
            ? 'mcp'
            : 'use-everywhere',
      );
      navigate({ kind: 'home', view: 'integrations' });
      return;
    }
    const safeSection: SettingsSection = branding.enabled
      ? clampTeamverEmbedSettingsSection(section, branding)
      : section;
    setSettingsWelcome(false);
    setSettingsInitialSection(safeSection);
    setSettingsHighlight(branding.enabled ? null : (opts?.highlight ?? null));
    setSettingsOpen(true);
  }, []);

  // Entry point from the failed-run AMR nudge: open Settings on the execution
  // section and flag the AMR agent card for a one-shot scroll-into-view +
  // highlight (and a sign-in coachmark when not yet authorized).
  const openAmrSettings = useCallback(() => {
    openSettings('execution', { highlight: 'amr' });
  }, [openSettings]);

  const openPetSettings = useCallback(() => {
    setSettingsWelcome(false);
    setSettingsInitialSection('pet');
    setSettingsOpen(true);
  }, []);

  const openMcpSettings = useCallback(() => {
    setIntegrationInitialTab('mcp');
    navigate({ kind: 'home', view: 'integrations' });
  }, []);

  // The composer "+" menu's "add plugin" / "add connector" rows route to the
  // home plugin-registry / connector-integration surfaces.
  const openPluginRegistry = useCallback(() => {
    navigate({ kind: 'home', view: 'plugins' });
  }, []);

  const openConnectorIntegrations = useCallback(() => {
    setIntegrationInitialTab('connectors');
    navigate({ kind: 'home', view: 'integrations' });
  }, []);

  const handleCompleteOnboarding = useCallback(() => {
    const current = latestPersistedConfigRef.current;
    if (current.onboardingCompleted) return;
    const next: AppConfig = { ...current, onboardingCompleted: true };
    latestPersistedConfigRef.current = next;
    saveConfig(next);
    void syncConfigToDaemon(next);
    setConfig(next);
  }, []);

  // Cmd+, (mac) / Ctrl+, (win/linux) opens Settings. Capture phase so we
  // beat the browser's default Preferences dialog. Platform-gated so
  // meta/ctrl don't conflict across OS.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (primary && !e.shiftKey && !e.altKey && e.key === ',') {
        if (e.isComposing) return;
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [openSettings]);

  // Explicit enabled toggle — true = wake, false = tuck. Persists to
  // localStorage so the overlay state survives across reloads. We keep
  // `adopted` untouched so the entry-view CTA does not regress to
  // "adopt me" once the user has already chosen.
  const handleSetPetEnabled = useCallback((enabled: boolean) => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = { ...curr, pet: { ...prev, enabled } };
      saveConfig(next);
      return next;
    });
  }, []);

  const handleTuckPet = useCallback(
    () => handleSetPetEnabled(false),
    [handleSetPetEnabled],
  );

  // Toggle wake/tuck — used by the pet rail and the composer button.
  const handleTogglePet = useCallback(() => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = {
        ...curr,
        pet: { ...prev, enabled: !prev.enabled },
      };
      saveConfig(next);
      return next;
    });
  }, []);

  // Inline adopt — the right-hand pet rail and the composer's pet menu
  // both call this to switch pets without bouncing the user into
  // Settings. It always wakes the overlay so the change is visible.
  const handleAdoptPet = useCallback((petId: string) => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = {
        ...curr,
        pet: { ...prev, adopted: true, enabled: true, petId },
      };
      saveConfig(next);
      return next;
    });
  }, []);

  // When the user lands on the entry view (route.kind === 'home'), pull
  // a fresh template list. The template store is global — if they just
  // saved a template inside a project, returning home should reflect it
  // immediately in the From-template tab without forcing a page reload.
  useEffect(() => {
    if (route.kind !== 'home') return;
    void refreshTemplates();
  }, [route.kind, refreshTemplates]);

  // Embed: returning from project detail (or other non-home routes) must
  // refresh the recent rail. Deep-link boot skips home recent fetch, so
  // without this the strip stays empty or stuck on the single prefetched row.
  // Update previousRouteKindRef only after scheduling/handling a transition so
  // React Strict Mode remounts still re-fetch (early prev=home skip would leave
  // empty+loading if the first effect's cancelled cleanup skipped apply).
  const previousRouteKindRef = useRef(route.kind);
  useEffect(() => {
    if (!isTeamverEmbedMode()) {
      previousRouteKindRef.current = route.kind;
      return;
    }
    const previousKind = previousRouteKindRef.current;
    if (route.kind !== 'home' || previousKind === 'home') {
      previousRouteKindRef.current = route.kind;
      return;
    }
    let cancelled = false;
    const request = beginProjectListRequest();
    if (projectsRef.current.length === 0) setProjectsLoading(true);
    else setProjectsRefreshing(true);
    void (async () => {
      try {
        const result = await loadRecentProjectsForHome();
        if (cancelled) return;
        if (!result.ok) {
          setWorkingDirError(result.errorMessage);
          return;
        }
        setWorkingDirError(null);
        upsertRecentProjects(result.projects, request);
        warmEmbedProjectListCaches(result.projects);
        previousRouteKindRef.current = 'home';
      } finally {
        if (!cancelled) {
          setProjectsLoading(false);
          setProjectsRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [beginProjectListRequest, route.kind, upsertRecentProjects]);

  // Existing card grids (DesignsTab, ProjectView), pickers (NewProjectPanel,
  // ChatComposer mention) all look skills up by id without caring whether
  // the id resolves to a functional skill or a design template. Pass them
  // the union so the post-split refactor stays invisible to those callers.
  const allSkillSummaries = useMemo(
    () => [...skills, ...designTemplates],
    [skills, designTemplates],
  );
  const enabledSkills = useMemo(
    () =>
      allSkillSummaries.filter((s) =>
        isDesignTemplateEnabled(s, config.disabledSkills, { slideOnlyMvp }),
      ),
    [allSkillSummaries, config.disabledSkills, slideOnlyMvp],
  );
  // Functional-skills-only enabled subset — what ProjectView's chat
  // composer @-picker should see. Without this, a skill the user has
  // disabled in Settings still appears in an existing project's @-mention
  // popover and can ride along to the daemon via skillIds, breaking the
  // Library toggle for projects opened on the post-split branch.
  const enabledFunctionalSkills = useMemo(
    () =>
      skills.filter(
        (s) => !(config.disabledSkills ?? []).includes(s.id),
      ),
    [skills, config.disabledSkills],
  );
  // Templates-only enabled subset — what the EntryView Templates gallery
  // actually renders. Filtering in App keeps the EntryView prop surface
  // narrow ("here are the templates the user has not disabled").
  const enabledDesignTemplates = useMemo(
    () =>
      designTemplates.filter((s) =>
        isDesignTemplateEnabled(s, config.disabledSkills, { slideOnlyMvp }),
      ),
    [designTemplates, config.disabledSkills, slideOnlyMvp],
  );
  const enabledDS = useMemo(
    () =>
      designSystems.filter(
        (d) => !(config.disabledDesignSystems ?? []).includes(d.id),
      ),
    [designSystems, config.disabledDesignSystems],
  );

  // Phase 2B / spec §11.6 — marketplace deep UI dispatch. The
  // /marketplace and /marketplace/:id routes render outside the
  // EntryView / ProjectView split so the discovery surface stays
  // independent of any active project.
  let appMain: ReactNode;
  if (route.kind === 'marketplace') {
    appMain = <MarketplaceView />;
  } else if (route.kind === 'marketplace-detail') {
    appMain = <PluginDetailView pluginId={route.pluginId} />;
  } else if (route.kind === 'design-system-create') {
    appMain = (
      <DesignSystemCreationFlow
        onBack={() => navigate({ kind: 'home', view: embedEntryBackView })}
        onCreated={(projectId, project) => {
          if (project) {
            setProjects((curr) => [
              project,
              ...curr.filter((p) => p.id !== project.id),
            ]);
          }
          navigate({ kind: 'project', projectId, conversationId: null, fileName: null });
        }}
        onProjectPrepared={(project) => {
          setProjects((curr) => [
            project,
            ...curr.filter((p) => p.id !== project.id),
          ]);
        }}
        onSystemsRefresh={refreshDesignSystems}
        config={config}
        onOpenConnectorsTab={() => openSettings('composio')}
      />
    );
  } else if (route.kind === 'design-system-detail') {
    appMain = (
      <DesignSystemDetailView
        id={route.designSystemId}
        selectedId={config.designSystemId}
        config={config}
        agents={agents}
        onBack={() => navigate({ kind: 'home', view: embedEntryBackView })}
        onOpenProject={(projectId) => {
          void navigateToProject(projectId, { conversationId: null, fileName: null });
        }}
        onSetDefault={handleChangeDefaultDesignSystem}
        onSystemsRefresh={refreshDesignSystems}
        onProjectsRefresh={refreshProjectsSurface}
        initialRevisionJob={pendingDesignSystemRevisionJobs[route.designSystemId] ?? null}
        onInitialRevisionJobConsumed={(jobId) =>
          handleDesignSystemRevisionJobConsumed(route.designSystemId, jobId)
        }
      />
    );
  } else if (activeProject) {
    appMain = (
      <ProjectView
        key={activeProject.id}
        project={activeProject}
        routeFileName={route.kind === 'project' ? route.fileName : null}
        routeConversationId={route.kind === 'project' ? route.conversationId : null}
        config={config}
        agents={agents}
        skills={enabledFunctionalSkills}
        designTemplates={designTemplates}
        designSystems={designSystems}
        daemonLive={daemonLive}
        onModeChange={handleModeChange}
        onAgentChange={handleAgentChange}
        onAgentModelChange={handleAgentModelChange}
        onApiModelChange={handleApiModelChange}
        onRefreshAgents={refreshAgents}
        onThemeChange={handleThemeChange}
        onOpenSettings={openSettings}
        onOpenAmrSettings={openAmrSettings}
        onOpenMcpSettings={openMcpSettings}
        onBrowsePlugins={openPluginRegistry}
        onOpenConnectors={openConnectorIntegrations}
        onAdoptPetInline={handleAdoptPet}
        onTogglePet={handleTogglePet}
        onOpenPetSettings={openPetSettings}
        onBack={handleBack}
        onClearPendingPrompt={handleClearPendingPrompt}
        onTouchProject={handleTouchProject}
        onProjectChange={handleProjectChange}
        onProjectsRefresh={refreshProjectsSurface}
        onChangeDefaultDesignSystem={handleChangeDefaultDesignSystem}
        onDesignSystemsRefresh={refreshDesignSystems}
        embedSubmitDisabled={embedInteractionDisabled}
        onEmbedSubmitBlocked={notifyEmbedSubmitBlocked}
      />
    );
  } else if (isTeamverEmbedMode() && route.kind === 'project' && !activeProject) {
    appMain = (
      <div className="embed-route-loading" data-testid="embed-project-route-loading">
        <CenteredLoader fullBleed />
      </div>
    );
  } else {
    appMain = (
      <EntryView
        skills={enabledSkills}
        designTemplates={enabledDesignTemplates}
        designSystems={enabledDS}
        projects={projects}
        templates={templates}
        onDeleteTemplate={handleDeleteTemplate}
        promptTemplates={promptTemplates}
        defaultDesignSystemId={config.designSystemId}
        agents={agents}
        agentsLoading={agentsLoading}
        config={config}
        providerModelsCache={providerModelsCache}
        onProviderModelsCacheChange={setProviderModelsCache}
        integrationInitialTab={integrationInitialTab}
        composioConfigLoading={composioConfigLoading}
        daemonLive={daemonLive}
        onModeChange={handleModeChange}
        onAgentChange={handleAgentChange}
        onAgentModelChange={handleAgentModelChange}
        onApiProtocolChange={handleApiProtocolChange}
        onApiModelChange={handleApiModelChange}
        onConfigPersist={handleConfigPersist}
        onRefreshAgents={refreshAgents}
        onThemeChange={handleThemeChange}
        skillsLoading={skillsLoading}
        designSystemsLoading={dsLoading}
        projectsLoading={projectsLoading}
        projectsPageLoading={projectsPageLoading}
        projectsRefreshing={projectsRefreshing}
        projectsHasMore={projectsHasMore}
        projectsLoadingMore={projectsLoadingMore}
        onLoadMoreProjects={loadMoreProjects}
        promptTemplatesLoading={promptTemplatesLoading}
        onCreateProject={handleCreateProject}
        onCreatePluginShareProject={handleCreatePluginShareProject}
        {...(isTeamverEmbedMode()
          ? {}
          : {
              onImportClaudeDesign: handleImportClaudeDesign,
              onImportFolder: handleImportFolder,
              onImportFolderResponse: handleImportFolderResponse,
            })}
        onOpenProject={handleOpenProject}
        onOpenLiveArtifact={handleOpenLiveArtifact}
        onDeleteProject={handleDeleteProject}
        onRenameProject={handleRenameProject}
        onChangeDefaultDesignSystem={handleChangeDefaultDesignSystem}
        {...(slideOnlyMvp
          ? {}
          : {
              onCreateDesignSystem: () => navigate({ kind: 'design-system-create' }),
              onOpenDesignSystem: (id: string) =>
                navigate({ kind: 'design-system-detail', designSystemId: id }),
            })}
        onDesignSystemsRefresh={refreshDesignSystems}
        onPersistComposioKey={handleConfigPersistComposioKey}
        onOpenSettings={openSettings}
        onCompleteOnboarding={handleCompleteOnboarding}
        backgroundRunSummaries={backgroundRunSummaries}
        embedSubmitDisabled={embedInteractionDisabled}
        onEmbedSubmitBlocked={notifyEmbedSubmitBlocked}
      />
    );
  }
  const showTeamverWorkspaceEscape =
    hideWorkspaceTabsBar && isTeamverEmbedMode() && route.kind === 'project';
  return (
    <>
      <EmbedBootstrapGate>
        <div
          className={`workspace-shell workspace-shell--${clientType}${
            hideWorkspaceTabsBar ? ' workspace-shell--no-tabs' : ''
          }${showTeamverWorkspaceEscape ? ' workspace-shell--embed-escape' : ''}`}
          data-client-type={clientType}
        >
          {hideWorkspaceTabsBar ? null : (
            <WorkspaceTabsBar
              route={route}
              projects={projects}
              onboardingCompleted={config.onboardingCompleted === true}
            />
          )}
          {showTeamverWorkspaceEscape ? (
            <TeamverWorkspaceEscapeBar
              onDesignHome={() => navigate({ kind: 'home', view: 'home' })}
            />
          ) : null}
          <div className="workspace-shell__body">
            {appMain}
          </div>
        </div>
      </EmbedBootstrapGate>
      {clientType === 'desktop' ? null : (
        <PetOverlay
          pet={config.pet?.enabled ? config.pet : undefined}
          taskCenter={petTaskCenter}
          onOpenProject={handleOpenProject}
        />
      )}
      <TooltipLayer />
      <AnimatePresence>
      {settingsOpen ? (
        <SettingsDialog
          initial={config}
          agents={agents}
          agentsLoading={agentsLoading}
          daemonLive={daemonLive}
          appVersionInfo={appVersionInfo}
          welcome={settingsWelcome}
          initialSection={settingsInitialSection}
          initialHighlight={settingsHighlight}
          composioConfigLoading={composioConfigLoading}
          onPersist={handleConfigPersist}
          onPersistComposioKey={handleConfigPersistComposioKey}
          onClose={() => {
            // Closing the dialog is the canonical "I'm done" gesture
            // now that there is no global Save button. We mark
            // onboardingCompleted on close so the welcome modal stops
            // re-prompting on every refresh, regardless of whether
            // the user changed anything during the session.
            const next = resolveSettingsCloseConfig(config, latestPersistedConfigRef.current);
            if (!next.onboardingCompleted || !config.onboardingCompleted) {
              latestPersistedConfigRef.current = next;
              saveConfig(next);
              void syncConfigToDaemon(next);
              setConfig(next);
            }
            setSettingsOpen(false);
            setSettingsHighlight(null);
          }}
          onRefreshAgents={refreshAgents}
          onAmrLoginStatusChange={handleAmrLoginStatusChange}
          onSkillsRefresh={refreshSkills}
          daemonMediaProviders={daemonMediaProviders}
          daemonMediaProvidersFetchState={daemonMediaProvidersFetchState}
          mediaProvidersNotice={mediaProvidersNotice}
          onReloadMediaProviders={reloadMediaProvidersFromDaemon}
          onProjectsRefresh={refreshProjectsSurface}
          onSkillsChanged={handleSkillsChanged}
          onDesignSystemsChanged={handleDesignSystemsChanged}
          onDesignSystemImportRebuildJob={handleDesignSystemImportRebuildJob}
          providerModelsCache={providerModelsCache}
          onProviderModelsCacheChange={setProviderModelsCache}
        />
      ) : null}
      </AnimatePresence>
      <MemoryToast onOpenMemory={() => openSettings('memory')} />
      {workingDirError ? (
        <Toast
          message={workingDirError}
          role="alert"
          onDismiss={() => setWorkingDirError(null)}
        />
      ) : null}
      {backgroundRunNotice && !workingDirError ? (
        <Toast
          key={backgroundRunNotice.runId}
          message={backgroundRunNotice.status === 'succeeded'
            ? `${backgroundRunNotice.projectName} 슬라이드 작업이 완료되었습니다.`
            : `${backgroundRunNotice.projectName} 슬라이드 작업에 실패했습니다.`}
          details={backgroundRunNotice.status === 'succeeded' && backgroundRunNotice.reopenExtras.fileName
            ? '미리보기 후 보내기 메뉴에서 Drive에 발행할 수 있습니다.'
            : undefined}
          actionLabel={
            backgroundRunNotice.status === 'succeeded' && backgroundRunNotice.reopenExtras.fileName
              ? '미리보기 · Drive 발행'
              : '프로젝트 열기'
          }
          onAction={() => {
            const notice = backgroundRunNotice;
            setBackgroundRunNotice(null);
            if (notice.status === 'succeeded' && notice.reopenExtras.fileName?.trim()) {
              armTeamverPublishMenuOnProjectOpen(
                notice.projectId,
                notice.reopenExtras.fileName,
              );
            }
            void navigateToProject(notice.projectId, notice.reopenExtras);
          }}
          tone={backgroundRunNotice.status === 'succeeded' ? 'success' : 'error'}
          role={backgroundRunNotice.status === 'failed' ? 'alert' : 'status'}
          ttlMs={8000}
          onDismiss={() => setBackgroundRunNotice(null)}
        />
      ) : null}
      {/* First-run privacy consent banner. It waits for daemon config
          hydration because privacyDecisionAt is daemon-owned and stripped
          from localStorage. It waits for `onboardingCompleted` so first-run
          users see the welcome panel before the disclosure (Skip and
          finish both flip the flag). Independent of Settings: z-index in
          index.css sits above modal backdrops so opening Settings does
          not hide the banner. */}
      <AnimatePresence>
      {showPrivacyConsent ? (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        >
        <PrivacyConsentModal
          onAccept={() => {
            // Default opt-in: clicking "I get it" enables the same telemetry
            // surface the previous two-button "Share usage data" path opted
            // into. The banner footer + PrivacySection give the user a
            // one-click path to flip everything off later.
            // The banner owns only the privacy decision; it does not drive
            // navigation. Onboarding is gated by `onboardingCompleted` on
            // its own and runs in parallel.
            const installationId = generateInstallationIdSafe();
            void handleConfigPersist({
              ...latestPersistedConfigRef.current,
              installationId,
              privacyDecisionAt: Date.now(),
              telemetry: { metrics: true, content: true },
            });
          }}
        />
      </motion.div>
      ) : null}
      </AnimatePresence>
    </>
  );
}

function generateInstallationIdSafe(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

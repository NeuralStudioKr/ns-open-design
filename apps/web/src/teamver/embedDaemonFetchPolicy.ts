import { isTeamverEmbedMode } from './designApiBase';
import { resolveTeamverBranding } from './branding/config';

/**
 * Teamver embed — which optional daemon HTTP calls are allowed on boot / mount.
 * Core product paths (projects, messages, design-templates deck, app-config) stay on.
 */

function branding() {
  return resolveTeamverBranding();
}

/** GitHub star count + Discord presence — entry marketing topbar / settings. */
export function shouldFetchMarketingCommunityApis(): boolean {
  return !isTeamverEmbedMode();
}

/** Open Design social-share URL builder — settings popover / FileViewer chrome share. */
export function shouldFetchSocialSharePayload(hideExternalLinks: boolean): boolean {
  return !hideExternalLinks;
}

/** FileViewer project social share menu (`hideExternalShareSurfaces`). */
export function shouldFetchProjectSocialShare(hideExternalShareSurfaces: boolean): boolean {
  return !hideExternalShareSurfaces;
}

/**
 * CLI agent registry SSE (`GET /api/agents?stream=1`).
 * Embed locks `mode=api` and `agentId=null` — listing local CLIs is unused.
 */
export function shouldFetchAgentRegistryOnBoot(): boolean {
  return !isTeamverEmbedMode();
}

/** AMR/Vela (`/api/integrations/vela/*`, `/api/amr/models`) — desktop CLI only. */
export function shouldFetchAmrIntegrationApis(): boolean {
  return !isTeamverEmbedMode();
}

/** Image/video prompt template catalog — hidden in embed slide-only MVP. */
export function shouldFetchPromptTemplateCatalog(): boolean {
  if (!isTeamverEmbedMode()) return true;
  return !branding().slideOnlyMvp;
}

/** Media provider daemon config — slide-only embed hides media composer surfaces. */
export function shouldFetchMediaProviderConfig(): boolean {
  if (!isTeamverEmbedMode()) return true;
  return !branding().slideOnlyMvp;
}

/**
 * Composio/MCP connector catalog (`/api/connectors*`) — embed hides integrations UI.
 * EntryView mounted hidden tabs still used to prefetch for NewProjectModal; skip in embed.
 */
export function shouldFetchConnectorCatalog(): boolean {
  if (!isTeamverEmbedMode()) return true;
  return !branding().hideComposerIntegrations;
}

/** Automations tab APIs — routines/templates/proposals. */
export function shouldFetchAutomationTaskApis(): boolean {
  if (!isTeamverEmbedMode()) return true;
  return !branding().hideNavViews.has('tasks');
}

/** Plugins nav + marketplaces registry (`PluginsView` mount). */
export function shouldMountPluginRegistryView(): boolean {
  if (!isTeamverEmbedMode()) return true;
  return !branding().hideNavViews.has('plugins');
}

/** Desktop folder picker recents (`GET /api/recent-dirs`). */
export function shouldFetchRecentLinkedDirs(): boolean {
  if (!isTeamverEmbedMode()) return true;
  return !branding().hideLocalWorkspaceControls;
}

/** Memory extraction SSE toast — embed Settings has no Memory section. */
export function shouldSubscribeMemoryEvents(): boolean {
  return !isTeamverEmbedMode();
}

/** Live AIHubMix model catalog (`/api/media/providers/aihubmix/models`). */
export function shouldFetchAihubmixMediaCatalog(): boolean {
  if (!isTeamverEmbedMode()) return true;
  return !branding().slideOnlyMvp;
}

/** Settings → About version panel (duplicate of analytics `/api/version` in embed). */
export function shouldFetchAppVersionAboutPanel(): boolean {
  return !isTeamverEmbedMode();
}

/** MCP/local-agent active context (`POST /api/active`) — unused in Teamver embed. */
export function shouldPostDaemonActiveContext(): boolean {
  return !isTeamverEmbedMode();
}

/**
 * Global daemon run list (`GET /api/runs`) — embed BYOK uses per-project stream
 * polls instead. Skipping avoids nginx auth_request 302s to Main sign-in while idle.
 */
export function shouldPollDaemonRuns(): boolean {
  return !isTeamverEmbedMode();
}

/**
 * Entry catalogs (skills/design-templates/design-systems/templates) are only
 * needed for home/settings surfaces. A direct project-file deep link should
 * not fan out every catalog before the selected artifact can render.
 */
export function shouldFetchEntryCatalogsOnBoot(routeKind: string): boolean {
  if (!isTeamverEmbedMode()) return true;
  return routeKind === 'home' || routeKind === 'design-system-create' || routeKind === 'design-system-detail';
}

/**
 * Slide-only embed home: keep `design-templates` on the critical path;
 * defer skills / design-systems until the browser is idle.
 * Project `/api/templates` is skipped entirely in slide-only (see
 * `shouldFetchProjectTemplatesCatalog`).
 */
export function shouldDeferNonCriticalEntryCatalogsOnBoot(): boolean {
  if (!isTeamverEmbedMode()) return false;
  return branding().slideOnlyMvp;
}

/**
 * Legacy project templates (`GET /api/templates`). Slide-only embed uses
 * `design-templates?mode=deck` + plugin catalog; boot/idle must not fan out
 * the unused `/api/templates` list. Settings refresh still calls `listTemplates`
 * when that surface mounts.
 */
export function shouldFetchProjectTemplatesCatalog(): boolean {
  if (!isTeamverEmbedMode()) return true;
  return !branding().slideOnlyMvp;
}

const DEFAULT_IDLE_TIMEOUT_MS = 2500;

/** `requestIdleCallback` with timeout; falls back to `setTimeout`. */
export function scheduleWhenIdle(
  callback: () => void,
  options?: { timeoutMs?: number },
): () => void {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  if (typeof globalThis.requestIdleCallback === 'function') {
    const id = globalThis.requestIdleCallback(() => callback(), { timeout: timeoutMs });
    return () => {
      if (typeof globalThis.cancelIdleCallback === 'function') {
        globalThis.cancelIdleCallback(id);
      }
    };
  }
  const timer = globalThis.setTimeout(callback, timeoutMs);
  return () => globalThis.clearTimeout(timer);
}

/** Home recent rail (`GET /api/projects/recent`) — defer on project-file deep links. */
export function shouldFetchHomeProjectsOnBoot(routeKind: string): boolean {
  if (!isTeamverEmbedMode()) return true;
  return routeKind === 'home';
}

/**
 * Community gallery HTML preview probes — wide IntersectionObserver rootMargin
 * (eager). Embed keeps this false so only ~120px in-view cards fetch; HtmlSurface
 * still arms those visible tiles (not hover-only).
 */
export function shouldEagerLoadCommunityPluginPreviews(): boolean {
  return !isTeamverEmbedMode();
}

/**
 * Open Design first-run privacy banner (`PrivacyConsentModal`).
 * Teamver embed users accept Teamver terms at sign-up — OD usage-sharing
 * disclosure + github PRIVACY.md link must not appear.
 */
export function shouldShowOpenDesignPrivacyConsent(): boolean {
  return !isTeamverEmbedMode();
}

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

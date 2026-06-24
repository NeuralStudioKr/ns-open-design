import { isTeamverEmbedMode } from "../designApiBase";
import { readTeamverViteEnv } from "../teamverViteEnv";
import { TEAMVER_BRAND_ASSETS } from "./assets";
import {
  TEAMVER_DEFAULT_BRAND_SUBTITLE,
  TEAMVER_DEFAULT_BRAND_TITLE,
  TEAMVER_DEFAULT_HERO_SUBTITLE,
} from "./siteMetadata";

/** SettingsDialog / EntrySettingsMenu sections exposed in Teamver embed. */
export const TEAMVER_EMBED_SETTINGS_SECTIONS = [
  "language",
  "appearance",
  "designTemplates",
] as const;

export type TeamverEmbedSettingsSection = (typeof TEAMVER_EMBED_SETTINGS_SECTIONS)[number];

export type TeamverBrandingConfig = {
  enabled: boolean;
  title: string;
  subtitle: string;
  faviconUrl: string;
  logoUrl: string;
  logoUrlDark: string;
  navMarkUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  hideExternalLinks: boolean;
  /** Left nav destinations hidden in embed (tasks / plugins / integrations). */
  hideNavViews: ReadonlySet<"tasks" | "plugins" | "integrations">;
  hideTopbarExecutionSwitcher: boolean;
  hideUseEverywhereChip: boolean;
  /** Gear popover → full Settings dialog entry point. */
  hideSettingsDialogLink: boolean;
  allowedSettingsSections: ReadonlySet<TeamverEmbedSettingsSection> | null;
  hideStudioExecutionControls: boolean;
  /**
   * Hide OD-specific tips on the project edit surface (embed default on):
   * Design Files footer (rotating tips + drop hint), empty-chat starter
   * examples, connect-repo CTA, FileViewer inspect/comment hint box.
   */
  hideUsefulTips: boolean;
  hideHandoffButton: boolean;
  /** Chat assistant role header — hide provider/model labels. */
  hideAssistantModelLabels: boolean;
  /**
   * loop 182 — Hide assistant thinking blocks in embed. Reasoning stays on the
   * model side; users should not see chain-of-thought or `<odThinking>` prose.
   */
  hideAssistantThinkingDetails: boolean;
  /** Force API (BYOK) mode and skip onboarding — prevents CLI/BYOK drift. */
  lockExecutionConfig: boolean;
  /** Hide local folder pickers, linked-dir UI, and folder import (embed = tenant S3). */
  hideLocalWorkspaceControls: boolean;
  /** Figma-style workspace tab strip (Home + project tabs) — embed uses rail/back only. */
  hideWorkspaceTabsBar: boolean;
  /** Embed launch: deck/slide creation only — hide media and non-deck create paths. */
  slideOnlyMvp: boolean;
  /** Hide MCP + connector affordances in Home/Project composers (settings already gated). */
  hideComposerIntegrations: boolean;
  /** Hide the Home community / plugin gallery (`HomeTemplatesReveal` + `PluginsHomeSection`). */
  hideCommunityGallery: boolean;
  /** Hide entry points to the plugin registry / marketplace (`+` menu add row, etc.). */
  hidePluginRegistry: boolean;
  /**
   * loop 171 — Hide *external* share/publish surfaces inside Teamver embed.
   * Drive Publish (Teamver workspace tenant) and local exports (PDF/PPTX/Image
   * /JSX/HTML/ZIP download) stay visible. What this gate hides:
   *   - FileViewer "chrome share" menu (Copy share-link, Open share page,
   *     Vercel/Cloudflare publish, Project social share / `SocialShareGrid`)
   *   - PreviewModal share popover social platforms + copy_link items
   *   - "Share to Open Design" community contribute action
   *     (`ProjectView.handleShareToOpenDesign` callback wiring)
   * Rationale: workspace content stays inside the Teamver tenant boundary;
   * Drive Publish + Drive Import + Drive permissions remain the canonical
   * cross-user share channel.
   */
  hideExternalShareSurfaces: boolean;
};

function readEnv(key: string): string | undefined {
  return readTeamverViteEnv(key);
}

function readBrandSubtitle(): string {
  return readEnv("VITE_TEAMVER_BRAND_SUBTITLE") || TEAMVER_DEFAULT_BRAND_SUBTITLE;
}

function readBrandTitle(): string {
  return readEnv("VITE_TEAMVER_BRAND_TITLE") || TEAMVER_DEFAULT_BRAND_TITLE;
}

function readFaviconUrl(): string {
  return readEnv("VITE_TEAMVER_FAVICON_URL") || TEAMVER_BRAND_ASSETS.favicon;
}

function readLogoUrl(): string {
  return readEnv("VITE_TEAMVER_LOGO_URL") || TEAMVER_BRAND_ASSETS.logoLight;
}

function readLogoUrlDark(): string {
  return readEnv("VITE_TEAMVER_LOGO_DARK_URL") || TEAMVER_BRAND_ASSETS.logoDark;
}

function readNavMarkUrl(): string {
  return readEnv("VITE_TEAMVER_NAV_MARK_URL") || TEAMVER_BRAND_ASSETS.navMark;
}

function readHeroTitle(brandTitle: string): string {
  return readEnv("VITE_TEAMVER_HERO_TITLE") || brandTitle;
}

function readHeroSubtitle(_brandSubtitle: string): string {
  return readEnv("VITE_TEAMVER_HERO_SUBTITLE") || TEAMVER_DEFAULT_HERO_SUBTITLE;
}

export function resolveTeamverBranding(): TeamverBrandingConfig {
  const enabled = isTeamverEmbedMode();
  const title = readBrandTitle();
  const subtitle = readBrandSubtitle();
  const faviconUrl = enabled
    ? readFaviconUrl()
    : "/app-icon.svg";
  const logoUrl = enabled ? readLogoUrl() : "/app-icon.svg";
  const logoUrlDark = enabled ? readLogoUrlDark() : "/app-icon.svg";
  const navMarkUrl = enabled ? readNavMarkUrl() : "/app-icon.svg";
  const heroTitle = readHeroTitle(title);
  const heroSubtitle = readHeroSubtitle(subtitle);

  const embedUi = enabled
    ? {
        hideNavViews: new Set(["tasks", "plugins", "integrations"] as const),
        hideTopbarExecutionSwitcher: true,
        hideUseEverywhereChip: true,
        hideSettingsDialogLink: true,
        allowedSettingsSections: new Set(TEAMVER_EMBED_SETTINGS_SECTIONS),
        hideStudioExecutionControls: true,
        hideUsefulTips: true,
        hideHandoffButton: true,
        hideAssistantModelLabels: true,
        hideAssistantThinkingDetails: false,
        lockExecutionConfig: true,
        hideLocalWorkspaceControls: true,
        hideWorkspaceTabsBar: true,
        slideOnlyMvp: true,
        hideComposerIntegrations: true,
        hideCommunityGallery: true,
        hidePluginRegistry: true,
        hideExternalShareSurfaces: true,
      }
    : {
        hideNavViews: new Set<"tasks" | "plugins" | "integrations">(),
        hideTopbarExecutionSwitcher: false,
        hideUseEverywhereChip: false,
        hideSettingsDialogLink: false,
        allowedSettingsSections: null,
        hideStudioExecutionControls: false,
        hideUsefulTips: false,
        hideHandoffButton: false,
        hideAssistantModelLabels: false,
        hideAssistantThinkingDetails: false,
        lockExecutionConfig: false,
        hideLocalWorkspaceControls: false,
        hideWorkspaceTabsBar: false,
        slideOnlyMvp: false,
        hideComposerIntegrations: false,
        hideCommunityGallery: false,
        hidePluginRegistry: false,
        hideExternalShareSurfaces: false,
      };

  return {
    enabled,
    title,
    subtitle,
    faviconUrl,
    logoUrl,
    logoUrlDark,
    navMarkUrl,
    heroTitle,
    heroSubtitle,
    hideExternalLinks: enabled,
    ...embedUi,
  };
}

/** Clamp SettingsDialog section opens in embed to language/appearance only. */
export function clampTeamverEmbedSettingsSection(
  section: string | undefined,
  branding: Pick<TeamverBrandingConfig, "enabled" | "allowedSettingsSections">,
): TeamverEmbedSettingsSection {
  const fallback: TeamverEmbedSettingsSection = "language";
  if (!branding.enabled || !branding.allowedSettingsSections) {
    return fallback;
  }
  if (
    section &&
    branding.allowedSettingsSections.has(section as TeamverEmbedSettingsSection)
  ) {
    return section as TeamverEmbedSettingsSection;
  }
  return fallback;
}

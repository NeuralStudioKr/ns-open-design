import { isTeamverEmbedMode } from "../designApiBase";
import { TEAMVER_BRAND_ASSETS } from "./assets";

/** SettingsDialog / EntrySettingsMenu sections exposed in Teamver embed. */
export const TEAMVER_EMBED_SETTINGS_SECTIONS = ["language", "appearance"] as const;

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
  hideUsefulTips: boolean;
  hideHandoffButton: boolean;
  /** Chat assistant role header — hide provider/model labels. */
  hideAssistantModelLabels: boolean;
};

function readEnv(key: string): string | undefined {
  return (import.meta.env[key] as string | undefined)?.trim() || undefined;
}

function readBrandSubtitle(): string {
  return readEnv("VITE_TEAMVER_BRAND_SUBTITLE") || "AI Design Studio";
}

function readBrandTitle(): string {
  return readEnv("VITE_TEAMVER_BRAND_TITLE") || "Teamver Design";
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

function readHeroSubtitle(brandSubtitle: string): string {
  return readEnv("VITE_TEAMVER_HERO_SUBTITLE") || brandSubtitle;
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

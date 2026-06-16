import { isTeamverEmbedMode } from "../designApiBase";

export type TeamverBrandingConfig = {
  enabled: boolean;
  title: string;
  subtitle: string;
  faviconUrl: string;
  hideExternalLinks: boolean;
};

function readBrandSubtitle(): string {
  const fromEnv = (import.meta.env.VITE_TEAMVER_BRAND_SUBTITLE as string | undefined)?.trim();
  return fromEnv || "by Teamver";
}

function readBrandTitle(): string {
  const fromEnv = (import.meta.env.VITE_TEAMVER_BRAND_TITLE as string | undefined)?.trim();
  return fromEnv || "Teamver Design";
}

function readFaviconUrl(): string {
  const fromEnv = (import.meta.env.VITE_TEAMVER_FAVICON_URL as string | undefined)?.trim();
  return fromEnv || "/app-icon.png";
}

export function resolveTeamverBranding(): TeamverBrandingConfig {
  const enabled = isTeamverEmbedMode();
  return {
    enabled,
    title: readBrandTitle(),
    subtitle: readBrandSubtitle(),
    faviconUrl: readFaviconUrl(),
    hideExternalLinks: enabled,
  };
}

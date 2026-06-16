"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { resolveTeamverBranding, type TeamverBrandingConfig } from "./config";
import { TeamverBrandingHead } from "./TeamverBrandingHead";

const TeamverBrandingContext = createContext<TeamverBrandingConfig>({
  enabled: false,
  title: "Open Design",
  subtitle: "",
  faviconUrl: "/app-icon.svg",
  logoUrl: "/app-icon.svg",
  logoUrlDark: "/app-icon.svg",
  navMarkUrl: "/app-icon.svg",
  heroTitle: "Open Design",
  heroSubtitle: "",
  hideExternalLinks: false,
  hideNavViews: new Set(),
  hideTopbarExecutionSwitcher: false,
  hideUseEverywhereChip: false,
  hideSettingsDialogLink: false,
  allowedSettingsSections: null,
  hideStudioExecutionControls: false,
  hideUsefulTips: false,
  hideHandoffButton: false,
  hideAssistantModelLabels: false,
  lockExecutionConfig: false,
});

export function TeamverBrandingProvider({ children }: { children: ReactNode }) {
  const branding = useMemo(() => resolveTeamverBranding(), []);
  return (
    <TeamverBrandingContext.Provider value={branding}>
      <TeamverBrandingHead />
      {children}
    </TeamverBrandingContext.Provider>
  );
}

export function useTeamverBranding(): TeamverBrandingConfig {
  return useContext(TeamverBrandingContext);
}

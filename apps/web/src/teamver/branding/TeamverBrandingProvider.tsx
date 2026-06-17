"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { resolveTeamverBranding, type TeamverBrandingConfig } from "./config";
import { TeamverBrandingHead } from "./TeamverBrandingHead";

const TeamverBrandingContext = createContext<TeamverBrandingConfig>({
  enabled: false,
  title: "Teamver Design",
  subtitle: "AI Design Studio",
  faviconUrl: "/teamver/Logo-icon.svg",
  logoUrl: "/teamver/Logo.svg",
  logoUrlDark: "/teamver/Logo-dark.svg",
  navMarkUrl: "/teamver/Logo-icon.svg",
  heroTitle: "Teamver Design",
  heroSubtitle: "Create visual designs and layouts with AI from your workspace context.",
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

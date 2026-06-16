"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { resolveTeamverBranding, type TeamverBrandingConfig } from "./config";
import { TeamverBrandingHead } from "./TeamverBrandingHead";

const TeamverBrandingContext = createContext<TeamverBrandingConfig>({
  enabled: false,
  title: "Open Design",
  faviconUrl: "/app-icon.png",
  hideExternalLinks: false,
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

"use client";

import { useEffect } from "react";
import { useTeamverBranding } from "./TeamverBrandingProvider";

export function TeamverBrandingHead() {
  const { enabled, title, faviconUrl } = useTeamverBranding();

  useEffect(() => {
    if (!enabled) return;
    document.title = title;
    const icon =
      document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
      document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]');
    if (icon) {
      icon.href = faviconUrl;
    }
  }, [enabled, title, faviconUrl]);

  return null;
}

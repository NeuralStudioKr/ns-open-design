"use client";

import { useEffect } from "react";
import { useTeamverBranding } from "./TeamverBrandingProvider";

function ensureLink(rel: string, href: string): void {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

/** Document title + favicon (fe-v2 / slide 와 동일 Teamver favicon.ico). */
export function TeamverBrandingHead() {
  const { enabled, title, faviconUrl } = useTeamverBranding();

  useEffect(() => {
    if (!enabled) return;
    document.title = title;
    ensureLink("icon", faviconUrl);
    ensureLink("shortcut icon", faviconUrl);
  }, [enabled, title, faviconUrl]);

  return null;
}

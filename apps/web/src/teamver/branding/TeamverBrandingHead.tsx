"use client";

import { useEffect } from "react";
import { resolveTeamverSiteMetadataValues } from "./siteMetadata";
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

function ensureMeta(name: string, content: string, property = false): void {
  const selector = property
    ? `meta[property="${name}"]`
    : `meta[name="${name}"]`;
  let meta = document.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement("meta");
    if (property) {
      meta.setAttribute("property", name);
    } else {
      meta.name = name;
    }
    document.head.appendChild(meta);
  }
  meta.content = content;
}

/** Document title, favicon, and OG/Twitter tags for Teamver embed. */
export function TeamverBrandingHead() {
  const { enabled, title, faviconUrl } = useTeamverBranding();

  useEffect(() => {
    if (!enabled) return;

    const meta = resolveTeamverSiteMetadataValues();
    const pageUrl =
      typeof window !== "undefined" ? window.location.origin : meta.siteUrl;

    document.title = title;
    ensureLink("icon", faviconUrl);
    ensureLink("shortcut icon", faviconUrl);
    ensureLink("apple-touch-icon", faviconUrl);

    ensureMeta("application-name", "teamver");
    ensureMeta("apple-mobile-web-app-title", title);
    ensureMeta("og:type", "website", true);
    ensureMeta("og:title", meta.ogTitle, true);
    ensureMeta("og:description", meta.description, true);
    ensureMeta("og:site_name", meta.ogTitle, true);
    ensureMeta("og:url", pageUrl, true);
    ensureMeta("og:image", meta.ogImageUrl, true);
    ensureMeta("twitter:card", "summary_large_image");
    ensureMeta("twitter:title", meta.ogTitle);
    ensureMeta("twitter:description", meta.description);
    ensureMeta("twitter:image", meta.ogImageUrl);
    ensureMeta("description", meta.description);
  }, [enabled, title, faviconUrl]);

  return null;
}

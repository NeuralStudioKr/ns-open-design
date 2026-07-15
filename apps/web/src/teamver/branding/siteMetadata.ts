import type { Metadata } from "next";

import { readTeamverViteEnv } from "../teamverViteEnv";
import { TEAMVER_BRAND_ASSETS } from "./assets";

export const TEAMVER_OG_SERVICE_NAME = "teamver";
export const TEAMVER_DEFAULT_BRAND_TITLE = "teamver Design";
export const TEAMVER_DEFAULT_BRAND_SUBTITLE = "AI로 슬라이드·디자인 초안까지";
export const TEAMVER_DEFAULT_OG_TITLE = `${TEAMVER_OG_SERVICE_NAME} | Design`;
export const TEAMVER_DEFAULT_OG_DESCRIPTION =
  "팀을 위한 AI 기반 협업 워크스페이스. 아이디어를 AI로 슬라이드·문서 초안까지 빠르게.";
export const TEAMVER_DEFAULT_HERO_SUBTITLE = TEAMVER_DEFAULT_OG_DESCRIPTION;
export const TEAMVER_DEFAULT_SITE_URL = "https://design.teamver.com";
export const TEAMVER_DEFAULT_OG_IMAGE_PATH = TEAMVER_BRAND_ASSETS.ogImage;

export type TeamverSiteMetadata = {
  title: string;
  ogTitle: string;
  description: string;
  siteUrl: string;
  ogImageUrl: string;
  faviconUrl: string;
};

export function isTeamverEmbedBuild(): boolean {
  const flag = readTeamverViteEnv("VITE_TEAMVER_EMBED")?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function resolveTeamverSiteUrl(): string {
  return (
    readTeamverViteEnv("VITE_TEAMVER_SITE_URL") ||
    readTeamverViteEnv("VITE_TEAMVER_DESIGN_APP_URL") ||
    TEAMVER_DEFAULT_SITE_URL
  );
}

export function resolveTeamverOgImageUrl(): string {
  const override = readTeamverViteEnv("VITE_TEAMVER_OG_IMAGE_URL");
  if (override?.trim()) return override.trim();
  return new URL(TEAMVER_DEFAULT_OG_IMAGE_PATH, resolveTeamverSiteUrl()).href;
}

export function resolveTeamverSiteMetadataValues(): TeamverSiteMetadata {
  const title = readTeamverViteEnv("VITE_TEAMVER_BRAND_TITLE") || TEAMVER_DEFAULT_BRAND_TITLE;
  const ogTitle = readTeamverViteEnv("VITE_TEAMVER_OG_TITLE") || TEAMVER_DEFAULT_OG_TITLE;
  const description =
    readTeamverViteEnv("VITE_TEAMVER_OG_DESCRIPTION") || TEAMVER_DEFAULT_OG_DESCRIPTION;
  const siteUrl = resolveTeamverSiteUrl();
  const ogImageUrl = resolveTeamverOgImageUrl();
  const faviconUrl =
    readTeamverViteEnv("VITE_TEAMVER_FAVICON_URL") || TEAMVER_BRAND_ASSETS.favicon;

  return { title, ogTitle, description, siteUrl, ogImageUrl, faviconUrl };
}

export function buildTeamverRootMetadata(): Metadata {
  const meta = resolveTeamverSiteMetadataValues();

  return {
    metadataBase: new URL(meta.siteUrl),
    title: meta.ogTitle,
    description: meta.description,
    applicationName: TEAMVER_OG_SERVICE_NAME,
    openGraph: {
      type: "website",
      locale: "ko_KR",
      title: meta.ogTitle,
      description: `✨ ${meta.description}`,
      url: meta.siteUrl,
      siteName: meta.ogTitle,
      images: [
        {
          url: meta.ogImageUrl,
          width: 1200,
          height: 630,
          alt: "teamver Design preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.ogTitle,
      description: meta.description,
      images: [meta.ogImageUrl],
    },
    icons: {
      icon: meta.faviconUrl,
      shortcut: meta.faviconUrl,
      apple: meta.faviconUrl,
    },
  };
}

export function buildRootLayoutMetadata(): Metadata {
  if (isTeamverEmbedBuild()) {
    return buildTeamverRootMetadata();
  }

  return {
    title: "Open Design",
    icons: {
      icon: "/app-icon.png",
      apple: "/app-icon.png",
    },
  };
}

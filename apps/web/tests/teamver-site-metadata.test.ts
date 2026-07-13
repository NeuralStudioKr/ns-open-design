import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildRootLayoutMetadata,
  buildTeamverRootMetadata,
  isTeamverEmbedBuild,
  resolveTeamverSiteMetadataValues,
  TEAMVER_DEFAULT_OG_TITLE,
} from "../src/teamver/branding/siteMetadata";
import { resolveLoadingShellLabel } from "../src/teamver/branding/loadingShellLabel";

function firstOgImage(images: NonNullable<ReturnType<typeof buildTeamverRootMetadata>["openGraph"]>["images"]) {
  return Array.isArray(images) ? images[0] : images;
}

describe("Teamver site metadata", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("detects embed build from VITE_TEAMVER_EMBED", () => {
    process.env.VITE_TEAMVER_EMBED = "1";
    expect(isTeamverEmbedBuild()).toBe(true);
    delete process.env.VITE_TEAMVER_EMBED;
    expect(isTeamverEmbedBuild()).toBe(false);
  });

  it("builds Teamver OG metadata aligned with fe-v2 naming", () => {
    process.env.VITE_TEAMVER_EMBED = "1";
    process.env.VITE_TEAMVER_SITE_URL = "https://stg-design.teamver.com";
    process.env.VITE_TEAMVER_OG_IMAGE_URL =
      "https://stg-design.teamver.com/teamver/teamver-design-opengraph.png";

    const metadata = buildTeamverRootMetadata();
    expect(metadata.title).toBe(TEAMVER_DEFAULT_OG_TITLE);
    expect(metadata.applicationName).toBe("teamver");
    expect(metadata.openGraph?.title).toBe(TEAMVER_DEFAULT_OG_TITLE);
    expect(metadata.openGraph?.url).toBe("https://stg-design.teamver.com");
    expect(firstOgImage(metadata.openGraph?.images)).toMatchObject({
      url: "https://stg-design.teamver.com/teamver/teamver-design-opengraph.png",
    });
    expect(metadata.icons).toMatchObject({
      icon: "/teamver/Logo-icon.svg",
    });
  });

  it("returns Open Design metadata outside embed builds", () => {
    delete process.env.VITE_TEAMVER_EMBED;
    expect(buildRootLayoutMetadata().title).toBe("Open Design");
  });

  it("uses a fixed Korean loading shell copy in embed builds", () => {
    process.env.VITE_TEAMVER_EMBED = "1";
    expect(resolveLoadingShellLabel()).toBe("불러오는 중…");
  });

  it("uses the same fixed loading copy on teamver.com hostnames without embed env", () => {
    delete process.env.VITE_TEAMVER_EMBED;
    vi.stubGlobal("window", {
      location: { hostname: "design.teamver.com" },
    } as Window & typeof globalThis);
    expect(resolveLoadingShellLabel()).toBe("불러오는 중…");
    vi.unstubAllGlobals();
  });

  it("exposes document title separate from OG title", () => {
    process.env.VITE_TEAMVER_BRAND_TITLE = "Teamver Design";
    process.env.VITE_TEAMVER_OG_TITLE = "teamver | AI Design";
    const values = resolveTeamverSiteMetadataValues();
    expect(values.title).toBe("Teamver Design");
    expect(values.ogTitle).toBe("teamver | AI Design");
  });

  it("resolves Design OG image from siteUrl when env override is unset", () => {
    process.env.VITE_TEAMVER_EMBED = "1";
    process.env.VITE_TEAMVER_SITE_URL = "https://stg-design.teamver.com";
    delete process.env.VITE_TEAMVER_OG_IMAGE_URL;

    const values = resolveTeamverSiteMetadataValues();
    expect(values.ogImageUrl).toBe(
      "https://stg-design.teamver.com/teamver/teamver-design-opengraph.png",
    );
  });
});

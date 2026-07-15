// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TeamverBrandingProvider } from "../src/teamver/branding/TeamverBrandingProvider";

function metaContent(selector: string): string | null {
  return document.head.querySelector<HTMLMetaElement>(selector)?.content ?? null;
}

function linkHref(rel: string): string | null {
  return document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)?.getAttribute("href") ?? null;
}

describe("TeamverBrandingHead", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    cleanup();
    document.title = "";
    document.head.querySelectorAll("meta, link").forEach((node) => node.remove());
    process.env = { ...envBackup };
  });

  it("patches runtime title, favicon, and social metadata in embed builds", async () => {
    process.env.VITE_TEAMVER_EMBED = "1";
    process.env.VITE_TEAMVER_SITE_URL = "https://stg-design.teamver.com";
    process.env.VITE_TEAMVER_OG_IMAGE_URL =
      "https://stg-design.teamver.com/teamver/teamver-design-opengraph.png";

    render(
      <TeamverBrandingProvider>
        <div>Teamver embed</div>
      </TeamverBrandingProvider>,
    );

    await waitFor(() => {
      expect(document.title).toBe("teamver Design");
      expect(linkHref("icon")).toBe("/teamver/Logo-icon.svg");
      expect(metaContent('meta[property="og:title"]')).toBe("teamver | Design");
      expect(metaContent('meta[property="og:image"]')).toBe(
        "https://stg-design.teamver.com/teamver/teamver-design-opengraph.png",
      );
      expect(metaContent('meta[name="twitter:card"]')).toBe("summary_large_image");
      expect(metaContent('meta[name="application-name"]')).toBe("teamver");
    });
  });
});

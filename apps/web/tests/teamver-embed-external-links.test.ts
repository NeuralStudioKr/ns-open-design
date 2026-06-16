import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const BLOCKED_EXTERNAL_HOSTS = [
  "github.com",
  "discord.gg",
  "discord.com",
  "nexu.io",
  "open-design.dev",
];

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf8");
}

describe("Teamver embed upstream touchpoints (P-7 static)", () => {
  it("EntryShell patch target has no blocked external hrefs in Teamver blocks", () => {
    const source = readRepoFile("apps/web/src/components/EntryShell.tsx");
    const teamverBlocks = source.match(/teamver|Teamver|isTeamverEmbedMode[\s\S]{0,800}/gi) ?? [];
    const blob = teamverBlocks.join("\n");
    for (const blocked of BLOCKED_EXTERNAL_HOSTS) {
      expect(blob.toLowerCase()).not.toContain(blocked);
    }
  });

  it("App.tsx Teamver embed bootstrap has no blocked external hrefs", () => {
    const source = readRepoFile("apps/web/src/App.tsx");
    const embedSection = source.match(/teamver[\s\S]{0,2000}/gi)?.join("\n") ?? source;
    for (const blocked of BLOCKED_EXTERNAL_HOSTS) {
      expect(embedSection.toLowerCase()).not.toContain(`https://${blocked}`);
      expect(embedSection.toLowerCase()).not.toContain(`http://${blocked}`);
    }
  });

  it("fork-native teamver module has no hard-coded blocked marketing links", () => {
    const source = readRepoFile("apps/web/src/teamver/branding/TeamverBrandingProvider.tsx");
    for (const blocked of BLOCKED_EXTERNAL_HOSTS) {
      expect(source.toLowerCase()).not.toContain(blocked);
    }
  });
});

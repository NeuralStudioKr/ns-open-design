import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "../..");

describe("teamver embed session boot", () => {
  it("runs BFF session boot independently of daemon health", () => {
    const app = readFileSync(resolve(webRoot, "src/App.tsx"), "utf8");
    const boot = readFileSync(
      resolve(webRoot, "src/teamver/teamverEmbedSessionBoot.ts"),
      "utf8",
    );

    expect(boot).toContain("runTeamverEmbedSessionBoot");
    expect(boot).toContain("completeTeamverEmbedBoot");
    expect(app).toContain("runTeamverEmbedSessionBoot");
    expect(app).toContain("embedSessionBootPromise");
    expect(app).toMatch(
      /const embedSessionBootPromise[\s\S]*?const alive = await daemonIsLive\(\)/,
    );
    expect(app).toContain("await embedSessionBootPromise.catch");
  });

  it("does not block embed deep-link hydration on daemonLive alone", () => {
    const app = readFileSync(resolve(webRoot, "src/App.tsx"), "utf8");
    expect(app).toContain(
      "if (!isTeamverEmbedMode() && !projects.length && !daemonLive) return;",
    );
  });

  it("does not leave direct project deep links on the loading shell when hydration throws", () => {
    const app = readFileSync(resolve(webRoot, "src/App.tsx"), "utf8");
    expect(app).toContain("deep-linked project registry preflight failed");
    expect(app).toContain("deep-linked project access check failed");
    expect(app).toContain("deep-linked project hydration failed");
    expect(app).toContain("direct file links do not");
  });

  it("unlocks embed boot before registry sync and project prefetch", () => {
    const boot = readFileSync(
      resolve(webRoot, "src/teamver/teamverEmbedSessionBoot.ts"),
      "utf8",
    );
    const completeIdx = boot.indexOf("completeTeamverEmbedBoot()");
    const registryIdx = boot.indexOf("void syncAllDaemonProjectsToRegistry()");
    const prefetchIdx = boot.indexOf("await ensureTeamverProjectRegisteredById");
    expect(completeIdx).toBeGreaterThan(-1);
    expect(registryIdx).toBeGreaterThan(completeIdx);
    expect(prefetchIdx).toBeGreaterThan(completeIdx);
    // Persist last-good session for clear/logout hygiene — do not unlock the
    // gate from sessionStorage alone (authenticated flash → login redirect).
    expect(boot).not.toContain("readFreshEmbedAuthSnapshot");
    expect(boot).toContain("persistEmbedAuthSnapshot");
  });

  it("client-app prefetches auth while the App chunk loads", () => {
    const client = readFileSync(
      resolve(webRoot, "app/[[...slug]]/client-app.tsx"),
      "utf8",
    );
    expect(client).toContain("prefetchEmbedAuthSessionOnBoot");
  });
});

describe("embed bootstrap gate boot fallback", () => {
  it("unblocks the shell when embed boot stalls", () => {
    const gate = readFileSync(
      resolve(webRoot, "src/components/EmbedBootstrapGate.tsx"),
      "utf8",
    );
    expect(gate).toContain("TEAMVER_EMBED_BOOT_FALLBACK_MS");
    expect(gate).toContain("completeTeamverEmbedBoot");
  });
});

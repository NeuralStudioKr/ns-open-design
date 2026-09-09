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
    expect(boot).toContain("consumeTeamverAuthReturnPending");
    expect(boot).toContain("shouldDeferEmbedLoginRedirect");
    expect(boot).toContain("setActiveTeamverWorkspace");
  });

  it("client-app prefetches auth while the App chunk loads", () => {
    const client = readFileSync(
      resolve(webRoot, "app/[[...slug]]/client-app.tsx"),
      "utf8",
    );
    expect(client).toContain("prefetchEmbedAuthSessionOnBoot");
  });

  it("루프477: an in-Design workspace pick outranks Main's launch hint", () => {
    const boot = readFileSync(
      resolve(webRoot, "src/teamver/teamverEmbedSessionBoot.ts"),
      "utf8",
    );

    // Consume, not peek — the hint lives in sessionStorage and would otherwise
    // re-apply on every refresh (0908-N01 P1).
    expect(boot).toContain("consumeLaunchWorkspaceIdHint()");
    expect(boot).not.toContain("readLaunchWorkspaceIdFromBrowserUrl");
    expect(boot).toContain("readStoredWorkspaceIdOnSession(session)");
    // Precedence itself — and the BFF realign that 0908-N01 slice E added on
    // top of it — is asserted through the collaborators in
    // `embed-session-boot-workspace.test.ts`. Matching the branch source here
    // only broke that fix without catching anything.
    expect(boot).toContain("storedOnSession ?? launchWorkspaceId");
  });

  it("루프477: the auth callback applies the same precedence and realigns the BFF", () => {
    const callback = readFileSync(
      resolve(webRoot, "app/auth/callback/page.tsx"),
      "utf8",
    );

    expect(callback).toContain("readStoredWorkspaceIdOnSession(session)");
    expect(callback).toContain("const preferred = storedOnSession ?? launchWs");
    // Exchange pinned the BFF session to the launch hint — keeping the stored
    // pick locally without a server POST drifts X-Workspace-Id (§13/§14).
    expect(callback).toContain("const needsRealign = preferred !== launchWs");
  });

  it("루프477: mount does not reconcile the workspace while boot is still running", () => {
    const hook = readFileSync(
      resolve(webRoot, "src/teamver/useTeamverEmbed.ts"),
      "utf8",
    );

    // Both boot and a boot-time refresh reconcile with preserveStoredWorkspace
    // false, so racing them lets the loser overwrite the stored pick.
    expect(hook).toMatch(
      /if \(!isTeamverEmbedBootComplete\(\)\) \{\s*await waitForTeamverEmbedBoot\(\);/,
    );
    expect(hook).toContain("preserveStoredWorkspace: !resetRefreshState && isTeamverEmbedBootComplete()");
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

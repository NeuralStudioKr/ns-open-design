import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("home recent projects stability", () => {
  it("awaits embed session boot before loading the home recent rail", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("if (fetchHomeProjects) {");
    expect(start).toBeGreaterThan(0);
    const block = app.slice(start, start + 600);
    expect(block).toContain("await embedSessionBootPromise.catch");
    expect(block).toContain("await waitForTeamverEmbedBoot()");
    expect(block).toContain("loadRecentProjectsForHome()");
  });

  it("uses recent listing (not full daemon list) on home during runs poll refresh", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("const onProjectDetail = routeRef.current.kind === 'project';");
    expect(start).toBeGreaterThan(0);
    const block = app.slice(start, start + 700);
    expect(block).toContain("const onHome = routeRef.current.kind === 'home';");
    expect(block).toContain("loadRecentProjectsForHome()");
    expect(block).toContain("loadProjectListSafe()");
    expect(block).toContain("upsertRecentProjects");
    expect(block).toMatch(/onHome[\s\S]*loadRecentProjectsForHome/);
  });

  it("refreshes recent projects when navigating back to embed home", () => {
    const app = readSource("src/App.tsx");
    expect(app).toContain("previousRouteKindRef");
    expect(app).toMatch(
      /previousKind === 'home'[\s\S]*loadRecentProjectsForHome/,
    );
    expect(app).toContain("upsertRecentProjects(result.projects, request)");
  });

  it("clears in-memory projects on workspace switch before reload", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("return subscribeTeamverWorkspaceChanged(({ workspaceId }) => {");
    expect(start).toBeGreaterThan(0);
    const block = app.slice(start, start + 4500);
    // Keep previous cards until reload succeeds — early setProjects([]) left
    // empty home when BFF/list failed. Failure path may clear after the attempt.
    expect(block).not.toMatch(/setProjects\(\[\]\);\s*\n\s*setProjectsHasMore\(false\);\s*\n\s*setProjectsLoading/);
    expect(block).toContain("projectsPageLoadedRef.current = false");
    expect(block).toContain("setProjectsLoading(true)");
    expect(block).toContain("Keep previous cards visible until the new workspace list arrives");
    expect(block).toContain("loadProjectsForWorkspaceSwitch");
  });

  it("waits for registry sync before filtering daemon project lists in embed", () => {
    const projects = readSource("src/state/projects.ts");
    expect(projects).toContain("waitForTeamverRegistrySyncIfNeeded");
    expect(projects).toContain("listEmbedProjectsFromRegistry");
    expect(projects).toMatch(
      /listRecentProjects[\s\S]*listEmbedProjectsFromRegistry/,
    );
  });

  it("uses registry membership SSOT for embed recent instead of daemon top-N intersect", () => {
    const projects = readSource("src/state/projects.ts");
    expect(projects).toContain("status-hints");
    expect(projects).toContain("fetchDaemonProjectStatusHints");
    expect(projects).toContain("listEmbedProjectsPageFromRegistry");
    expect(projects).toContain("mergeDaemonFieldsOntoRegistryProjects");
  });

  it("awaits in-flight registry sync before embed recent list resolve", () => {
    const projects = readSource("src/state/projects.ts");
    expect(projects).toMatch(
      /isTeamverEmbedMode\(\)[\s\S]*waitForTeamverRegistrySyncIfNeeded[\s\S]*listEmbedProjectsFromRegistry/,
    );
  });

  it("refreshes recent without marking previousRouteKind home until apply succeeds", () => {
    const app = readSource("src/App.tsx");
    expect(app).toContain("previousRouteKindRef.current = 'home'");
    expect(app).toMatch(
      /upsertRecentProjects\(result\.projects, request\)[\s\S]*previousRouteKindRef\.current = 'home'/,
    );
  });

  it("keeps embed boot gate unlock ahead of legacy registry sync", () => {
    const boot = readSource("src/teamver/teamverEmbedSessionBoot.ts");
    expect(boot).toContain("completeTeamverEmbedBoot()");
    expect(boot).toContain("void syncAllDaemonProjectsToRegistry()");
  });
});

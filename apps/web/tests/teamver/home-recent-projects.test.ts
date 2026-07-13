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
    const block = app.slice(start, start + 2200);
    expect(block).toContain("setProjects([])");
    expect(block).toContain("projectsPageLoadedRef.current = false");
    expect(block).toContain("setProjectsLoading(true)");
  });

  it("waits for registry sync before filtering daemon project lists in embed", () => {
    const projects = readSource("src/state/projects.ts");
    expect(projects).toContain("waitForTeamverRegistrySyncIfNeeded");
    expect(projects).toMatch(
      /normalizeProjectsResponse[\s\S]*waitForTeamverRegistrySyncIfNeeded/,
    );
  });

  it("awaits legacy registry sync during embed session boot", () => {
    const boot = readSource("src/teamver/teamverEmbedSessionBoot.ts");
    expect(boot).toContain("await syncAllDaemonProjectsToRegistry()");
    expect(boot).not.toContain("void syncAllDaemonProjectsToRegistry()");
  });
});

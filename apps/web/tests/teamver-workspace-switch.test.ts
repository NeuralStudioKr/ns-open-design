import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("embed workspace switch side effects", () => {
  it("clears stale workingDirError after a successful project list reload", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("return subscribeTeamverWorkspaceChanged(() => {");
    expect(start).toBeGreaterThan(0);
    const block = app.slice(start, start + 2800);
    expect(block).toContain("loadProjectListSafe()");
    expect(block).toContain("setWorkingDirError(null)");
    expect(block.indexOf("setWorkingDirError(null)")).toBeGreaterThan(
      block.indexOf("reconcileFetchedProjects"),
    );
  });

  it("clears embed list caches (registry·cover·publish chip) on workspace switch", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("return subscribeTeamverWorkspaceChanged(() => {");
    const block = app.slice(start, start + 1200);
    expect(block).toContain("clearTeamverEmbedListCaches()");
  });

  it("forwards active workspace on daemon run create in embed", () => {
    const daemon = readSource("src/providers/daemon.ts");
    const headers = readSource("src/teamver/teamverDaemonHeaders.ts");
    expect(daemon).toContain("buildTeamverDaemonRequestHeaders");
    expect(headers).toContain("X-Workspace-Id");
  });

  it("clears stale workingDirError after refreshProjects succeeds", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("const refreshProjects = useCallback");
    expect(start).toBeGreaterThan(0);
    const block = app.slice(start, start + 400);
    expect(block).toContain("setWorkingDirError(null)");
  });
});

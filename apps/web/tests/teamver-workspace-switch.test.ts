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
    expect(headers).toContain("readActiveTeamverWorkspaceId");
    expect(headers).toContain("X-Workspace-Id");
  });

  it("routes embed BFF workspace reads through activeTeamverWorkspace helper", () => {
    for (const relativePath of [
      "src/teamver/publishToDrive.ts",
      "src/teamver/importDriveAssets.ts",
      "src/teamver/listProjectOutputs.ts",
      "src/teamver/batchLatestPublishSummary.ts",
      "src/teamver/maybeReportTeamverUsageAfterSave.ts",
      "src/teamver/components/TeamverPublishDriveMenuItem.tsx",
      "src/components/ChatComposer.tsx",
    ]) {
      const source = readSource(relativePath);
      expect(source).toMatch(/activeTeamverWorkspace|readActiveTeamverWorkspaceId|requireActiveTeamverWorkspaceId|resolveActiveTeamverWorkspaceId/);
      expect(source).not.toMatch(/workspaceStore\?\.get\(\)/);
    }
  });

  it("forwards active workspace on daemon run list polling in embed", () => {
    const daemon = readSource("src/providers/daemon.ts");
    expect(daemon).toMatch(
      /export async function listProjectRuns[\s\S]*?buildTeamverDaemonRequestHeaders/,
    );
    expect(daemon).toMatch(
      /export async function listActiveChatRuns[\s\S]*?buildTeamverDaemonRequestHeaders/,
    );
    expect(daemon).toMatch(
      /export async function fetchChatRunStatus[\s\S]*?buildTeamverDaemonRequestHeaders/,
    );
    expect(daemon).toMatch(
      /buildTeamverDaemonRequestHeaders[\s\S]*?\/api\/runs\/\$\{encodeURIComponent\(runId\)\}\/cancel/,
    );
    expect(daemon).toMatch(
      /buildTeamverDaemonRequestHeaders[\s\S]*?\/api\/runs\/\$\{encodeURIComponent\(runId\)\}\/events/,
    );
    expect(daemon).toMatch(
      /export async function reportChatRunFeedback[\s\S]*?buildTeamverDaemonRequestHeaders/,
    );
  });

  it("clears background run UI and re-seeds run tracking on workspace switch", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("return subscribeTeamverWorkspaceChanged(() => {");
    expect(start).toBeGreaterThan(0);
    const block = app.slice(start, start + 3200);
    expect(block).toContain("setBackgroundRunSummaries([])");
    expect(block).toContain("setBackgroundRunNotice(null)");
    expect(block).toContain("resetEmbedRunTrackingRefs");
    expect(block).toContain("filterRunsForEmbedKnownProjects");
    expect(block).toContain("seedEmbedRunTrackingFromRuns");
    expect(block.indexOf("resetEmbedRunTrackingRefs")).toBeLessThan(
      block.indexOf("seedEmbedRunTrackingFromRuns"),
    );
  });

  it("gates embed create/chat until active workspace is resolved", () => {
    const app = readSource("src/App.tsx");
    expect(app).toContain("embedWorkspaceId");
    expect(app).toContain("embedInteractionDisabled");
    expect(app).toMatch(
      /embedInteractionDisabled[\s\S]*?embedSubmitDisabled=\{embedInteractionDisabled\}/,
    );
    expect(app).toContain('formatTeamverProjectRegistryErrorMessage("teamver_workspace_required")');
  });

  it("clears stale workingDirError after refreshProjects succeeds", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("const refreshProjects = useCallback");
    expect(start).toBeGreaterThan(0);
    const block = app.slice(start, start + 400);
    expect(block).toContain("setWorkingDirError(null)");
  });
});

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
    const start = app.indexOf("return subscribeTeamverWorkspaceChanged(({ workspaceId }) => {");
    expect(start).toBeGreaterThan(0);
    const block = app.slice(start, start + 4500);
    expect(block).toContain("loadProjectsForWorkspaceSwitch");
    expect(block).toContain("homeRecent: onHome");
    expect(block).toContain("isStaleProjectListWorkspace(request)");
    expect(block).toContain("setWorkingDirError(null)");
    expect(block).toContain("applyProjectsPageResult");
    expect(block).toContain("setProjectsRefreshing(true)");
    expect(block).toContain("clearListRecentProjectsInflight()");
    expect(block).not.toMatch(/setProjects\(\[\]\);\s*\n\s*setProjectsHasMore\(false\);\s*\n\s*setProjectsLoading/);
  });

  it("clears previous-tenant cards when workspace switch list reload fails", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("return subscribeTeamverWorkspaceChanged(({ workspaceId }) => {");
    const block = app.slice(start, start + 4500);
    expect(block).toMatch(/if \(!result\.ok\) \{[\s\S]*setProjects\(\[\]\)/);
  });

  it("clears embed list caches (registry·cover·publish chip) on workspace switch", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("return subscribeTeamverWorkspaceChanged(({ workspaceId }) => {");
    const block = app.slice(start, start + 1200);
    expect(block).toContain("clearTeamverEmbedListCaches()");
  });

  it("ignores stale project-list responses from a previous workspace", () => {
    const app = readSource("src/App.tsx");
    expect(app).toContain("workspaceId: isTeamverEmbedMode() ? embedActiveWorkspaceIdRef.current : null");
    expect(app).toContain("request.workspaceId !== embedActiveWorkspaceIdRef.current");
    expect(app).toContain("project list response ignored after workspace changed");
  });

  it("forwards active workspace on daemon run create in embed", () => {
    const daemon = readSource("src/providers/daemon.ts");
    const headers = readSource("src/teamver/teamverDaemonHeaders.ts");
    expect(daemon).toContain("fetchTeamverDaemon");
    expect(daemon).toMatch(
      /fetchTeamverDaemon\('\/api\/runs'[\s\S]*?teamverProjectId: projectId/,
    );
    expect(headers).toContain("readActiveTeamverWorkspaceId");
    expect(headers).toContain("buildTeamverDaemonRequestHeaders");
    expect(headers).toContain("X-Workspace-Id");
  });

  it("delegates embed BYOK usage+billing to daemon message PUT (§4.11)", () => {
    const source = readSource("src/teamver/maybeReportTeamverUsageAfterSave.ts");
    expect(source).toContain("daemon authoritative");
    expect(source).toContain("reportByokTeamverUsageAndBillingFromDaemon");
    expect(source).not.toContain("reportTeamverDesignUsage");
    expect(source).not.toContain("finalizeTeamverByokBilling");
  });

  it("routes embed BFF workspace reads through activeTeamverWorkspace helper", () => {
    for (const relativePath of [
      "src/teamver/publishToDrive.ts",
      "src/teamver/importDriveAssets.ts",
      "src/teamver/listProjectOutputs.ts",
      "src/teamver/batchLatestPublishSummary.ts",
      "src/components/ChatComposer.tsx",
    ]) {
      const source = readSource(relativePath);
      expect(source).toMatch(/activeTeamverWorkspace|readActiveTeamverWorkspaceId|requireActiveTeamverWorkspaceId|resolveActiveTeamverWorkspaceId/);
      expect(source).not.toMatch(/workspaceStore\?\.get\(\)/);
    }
  });

  it("forwards active workspace on daemon project CRUD in embed", () => {
    const projects = readSource("src/state/projects.ts");
    const registry = readSource("src/providers/registry.ts");
    expect(projects).toContain("fetchTeamverDaemon");
    expect(projects).not.toMatch(/await fetch\(`\/api\/projects/);
    expect(registry).toContain("fetchTeamverDaemon");
    expect(readSource("src/hooks/useProjectDetail.ts")).toContain("fetchTeamverDaemon");
    for (const relativePath of [
      "src/hooks/useDesignMdState.ts",
      "src/hooks/useFinalizeProject.ts",
      "src/components/FileViewer.tsx",
      "src/components/GenUIInbox.tsx",
    ]) {
      expect(readSource(relativePath)).toContain("fetchTeamverDaemon");
      expect(readSource(relativePath)).not.toMatch(/fetch\([`'"].*\/api\/projects/);
    }
  });

  it("forwards active workspace on daemon run list polling in embed", () => {
    const daemon = readSource("src/providers/daemon.ts");
    const headers = readSource("src/teamver/teamverDaemonHeaders.ts");
    expect(headers).toMatch(/isTeamverEmbedMode\(\) \? "include"/);
    expect(daemon).toMatch(
      /export async function listProjectRuns[\s\S]*?fetchTeamverDaemon\('\/api\/runs'/,
    );
    expect(daemon).toMatch(
      /export async function listActiveChatRuns[\s\S]*?fetchTeamverDaemon\(`\/api\/runs\?\$\{qs/,
    );
    expect(daemon).toMatch(
      /export async function fetchChatRunStatus[\s\S]*?fetchTeamverDaemon\(`\/api\/runs/,
    );
    expect(daemon).toMatch(
      /fetchTeamverDaemon[\s\S]*?\/api\/runs\/\$\{encodeURIComponent\(runId\)\}\/cancel/,
    );
    expect(daemon).toMatch(
      /fetchTeamverDaemon[\s\S]*?\/api\/runs\/\$\{encodeURIComponent\(runId\)\}\/events/,
    );
    expect(daemon).toMatch(
      /export async function reportChatRunFeedback[\s\S]*?fetchTeamverDaemon/,
    );
  });

  it("clears background run UI and re-seeds run tracking on workspace switch", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("return subscribeTeamverWorkspaceChanged(({ workspaceId }) => {");
    expect(start).toBeGreaterThan(0);
    const block = app.slice(start, start + 4500);
    expect(block).toContain("shouldSkipWorkspaceSwitchSideEffects");
    expect(block).toContain("capturePreWorkspaceSwitchProjectGuards");
    expect(block).toContain("setBackgroundRunSummaries([])");
    expect(block).toContain("setBackgroundRunNotice(null)");
    expect(block).toContain("resetEmbedRunTrackingRefs");
    expect(block).toContain("window.dispatchEvent(new Event(RUNS_CHANGED_EVENT))");
    expect(block.indexOf("resetEmbedRunTrackingRefs")).toBeLessThan(
      block.indexOf("window.dispatchEvent(new Event(RUNS_CHANGED_EVENT))"),
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

  it("ProjectView detaches local run streams on workspace switch without POST cancel (loop 396)", () => {
    const projectView = readSource("src/components/ProjectView.tsx");
    expect(projectView).toContain("detachLocalRunStreamConsumers");
    expect(projectView).toMatch(
      /subscribeTeamverWorkspaceChanged[\s\S]*?commitQueuedChatSends\(\[\]\)/,
    );
  });

  it("ProjectView detaches local run streams on embed session logout (loop 399)", () => {
    const projectView = readSource("src/components/ProjectView.tsx");
    expect(projectView).toMatch(
      /subscribeTeamverEmbedSessionChanged[\s\S]*?detachLocalRunStreamConsumers\(\)/,
    );
  });

  it("ProjectView preserves queued chat sends across session expiry (P2 A3)", () => {
    const projectView = readSource("src/components/ProjectView.tsx");
    // Skip the import line and land on the actual `return subscribe...` call.
    const start = projectView.indexOf(
      "return subscribeTeamverEmbedSessionChanged(",
    );
    expect(start).toBeGreaterThan(0);
    const block = projectView.slice(start, start + 1500);
    // The handler must NOT wipe the queue silently — previously this line
    // was `commitQueuedChatSends([])` which lost user prompts on expiry.
    expect(block).not.toMatch(/commitQueuedChatSends\(\[\]\)/);
    // Observability marker documents the queue was preserved.
    expect(block).toContain("chat-queue: preserved across session expiry");
  });

  it("clears stale workingDirError after refreshProjects succeeds", () => {
    const app = readSource("src/App.tsx");
    const start = app.indexOf("const refreshProjects = useCallback");
    expect(start).toBeGreaterThan(0);
    const block = app.slice(start, start + 800);
    expect(block).toContain("setWorkingDirError(null)");
  });

  it("defers project list refresh on embed detail surfaces", () => {
    const app = readSource("src/App.tsx");
    expect(app).toContain("refreshProjectsSurface");
    expect(app).toContain("shouldDeferEmbedProjectListRefresh");
    expect(app).toContain("onProjectsRefresh={refreshProjectsSurface}");
    expect(app).toContain("readEmbedProjectDetailRoute");
    expect(app).toMatch(
      /readEmbedProjectDetailRoute\(routeRef\.current\)[\s\S]*?refreshEmbedProjectMetadata/,
    );
    expect(app).toMatch(
      /readEmbedProjectDetailRoute\(route\)[\s\S]*?loadProjectListSafe/,
    );
  });
});

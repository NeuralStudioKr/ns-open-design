import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf8");
}

describe("Teamver embed local workspace UI guards", () => {
  it("enables the central hideLocalWorkspaceControls branding flag", () => {
    const source = readRepoFile("apps/web/src/teamver/branding/config.ts");

    expect(source).toContain("hideLocalWorkspaceControls: true");
    expect(source).toContain("hideLocalWorkspaceControls: false");
  });

  it("hides Home and project composer working directory pickers", () => {
    const homeView = readRepoFile("apps/web/src/components/HomeView.tsx");
    const chatComposer = readRepoFile("apps/web/src/components/ChatComposer.tsx");

    expect(homeView).toContain("hideLocalWorkspaceControls ? undefined : handlePickWorkingDir");
    expect(homeView).toContain("hideLocalWorkspaceControls ? null : workingDir");
    expect(chatComposer).toContain("projectId && !hideLocalWorkspaceControls");
  });

  it("hides New Project local folder controls and strips working-dir metadata", () => {
    const source = readRepoFile("apps/web/src/components/NewProjectPanel.tsx");

    expect(source).toContain("!hideLocalWorkspaceControls && workingDir");
    expect(source).toContain("!hideLocalWorkspaceControls && workingDirToken");
    expect(source).toContain("{!hideLocalWorkspaceControls ? (");
    expect(source).toContain("!hideLocalWorkspaceControls && folderImport.available");
  });

  it("does not pass folder-import handlers through embed entry surfaces", () => {
    const appSource = readRepoFile("apps/web/src/App.tsx");
    const entryShell = readRepoFile("apps/web/src/components/EntryShell.tsx");

    expect(appSource).toContain("isTeamverEmbedMode()");
    expect(appSource).toContain("onImportFolder: handleImportFolder");
    expect(entryShell).toContain("!hideLocalWorkspaceControls && onImportFolder");
    expect(entryShell).toContain("!hideLocalWorkspaceControls && onImportFolderResponse");
  });
});

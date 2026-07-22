import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("embed in-project run success publish flow (loop 403)", () => {
  it("arms publish state but does not auto-open Drive modal on file route entry", () => {
    const projectView = readSource("src/components/ProjectView.tsx");
    const fileViewer = readSource("src/components/FileViewer.tsx");

    expect(projectView).toContain("maybeArmTeamverPublishMenuAfterRunSuccess");
    expect(projectView).toMatch(
      /maybeArmTeamverPublishMenuAfterRunSuccess[\s\S]*?requestOpenFile\(producedHtmlToOpen\)/,
    );
    expect(projectView).toMatch(
      /consumeTeamverPublishMenuArm\(project\.id, routeFileName\);/,
    );
    expect(projectView).not.toMatch(
      /consumeTeamverPublishMenuArm[\s\S]*?setShareRequest\(\{ name: routeFileName, nonce:/,
    );
    expect(projectView).not.toContain("maybeOneClickPublishToDrive");
    expect(fileViewer).toContain("setDownloadMenuOpen(true)");
    expect(fileViewer).toContain("focusTargetSelectNonce={drivePublishFocusNonce}");
    expect(fileViewer).toContain("TeamverPublishDriveModal");
    expect(fileViewer).toContain("setDrivePublishModalOpen(true)");
  });
});

describe("embed background run success publish flow (loop 398)", () => {
  it("arms publish menu from App completion toast without opening Drive modal on route entry", () => {
    const app = readSource("src/App.tsx");
    const projectView = readSource("src/components/ProjectView.tsx");

    expect(app).toContain("armTeamverPublishMenuOnProjectOpen");
    expect(app).toContain("미리보기 · Drive 발행");
    expect(projectView).toContain("consumeTeamverPublishMenuArm");
    expect(projectView).toMatch(
      /consumeTeamverPublishMenuArm\(project\.id, routeFileName\);/,
    );
    expect(projectView).not.toMatch(
      /consumeTeamverPublishMenuArm[\s\S]*?setShareRequest\(\{ name: routeFileName, nonce:/,
    );
    expect(projectView).not.toContain("maybeOneClickPublishToDrive");
  });
});

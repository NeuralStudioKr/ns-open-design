import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("embed in-project run success publish flow (loop 402)", () => {
  it("arms publish menu from ProjectView html auto-open before consume on preview", () => {
    const projectView = readSource("src/components/ProjectView.tsx");

    expect(projectView).toContain("maybeArmTeamverPublishMenuAfterRunSuccess");
    expect(projectView).toMatch(
      /maybeArmTeamverPublishMenuAfterRunSuccess[\s\S]*?requestOpenFile\(producedHtmlToOpen\)/,
    );
    expect(projectView).toMatch(
      /consumeTeamverPublishMenuArm[\s\S]*?setDownloadRequest\(\{ name: routeFileName, nonce:/,
    );
  });
});

describe("embed background run success publish flow (loop 398)", () => {
  it("arms publish menu from App completion toast and ProjectView consumes on preview open", () => {
    const app = readSource("src/App.tsx");
    const projectView = readSource("src/components/ProjectView.tsx");

    expect(app).toContain("armTeamverPublishMenuOnProjectOpen");
    expect(app).toContain("미리보기 · Drive 발행");
    expect(projectView).toContain("consumeTeamverPublishMenuArm");
    expect(projectView).toMatch(
      /consumeTeamverPublishMenuArm[\s\S]*?setDownloadRequest\(\{ name: routeFileName, nonce:/,
    );
  });
});

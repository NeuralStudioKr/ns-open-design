import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("embed background run success publish flow (loop 398)", () => {
  it("arms publish menu from App completion toast and ProjectView opens deploy on preview", () => {
    const app = readSource("src/App.tsx");
    const projectView = readSource("src/components/ProjectView.tsx");

    expect(app).toContain("armTeamverPublishMenuOnProjectOpen");
    expect(app).toContain("미리보기 · Drive 발행");
    expect(projectView).toContain("consumeTeamverPublishMenuArm");
    expect(projectView).toMatch(
      /consumeTeamverPublishMenuArm[\s\S]*?setShareRequest\(\{ name: routeFileName, nonce:/,
    );
    expect(projectView).not.toContain("maybeOneClickPublishToDrive");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("embed project header navigation", () => {
  it("uses escape bar only for back navigation in embed project view", () => {
    const projectView = readSource("src/components/ProjectView.tsx");
    const app = readSource("src/App.tsx");

    expect(projectView).toContain("onBack={isTeamverEmbedMode() ? undefined : onBack}");
    expect(projectView).toContain("backLabel={isTeamverEmbedMode() ? undefined : t('project.backToProjects')}");
    expect(app).toContain("TeamverWorkspaceEscapeBar");
    expect(app).toContain('onDesignHome={() => navigate({ kind: \'home\', view: \'home\' })}');
  });
});

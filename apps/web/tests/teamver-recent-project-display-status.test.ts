import { describe, expect, it } from "vitest";
import {
  buildActiveRunStatusByProjectId,
  hasProjectArtifactSignal,
  resolveRecentProjectDisplayStatus,
} from "../src/teamver/recentProjectDisplayStatus";
import type { PetTaskSummary } from "../src/components/pet/PetOverlay";

function summary(
  overrides: Partial<PetTaskSummary> & Pick<PetTaskSummary, "projectId" | "status">,
): PetTaskSummary {
  return {
    projectId: overrides.projectId,
    projectName: overrides.projectName ?? "Deck",
    status: overrides.status,
    count: overrides.count ?? 1,
  };
}

describe("resolveRecentProjectDisplayStatus", () => {
  it("prefers live running/queued over registry status", () => {
    const byProject = buildActiveRunStatusByProjectId([
      summary({ projectId: "p1", status: "running" }),
    ]);
    expect(resolveRecentProjectDisplayStatus("p1", "succeeded", byProject)).toBe(
      "running",
    );
    expect(resolveRecentProjectDisplayStatus("p2", "succeeded", byProject)).toBe(
      "succeeded",
    );
  });

  it("falls back to registry when there is no active run", () => {
    expect(
      resolveRecentProjectDisplayStatus("p1", "failed", new Map()),
    ).toBe("failed");
    expect(
      resolveRecentProjectDisplayStatus("p1", undefined, new Map()),
    ).toBe("not_started");
  });

  it("treats visible artifact output as completed when registry is still not_started", () => {
    expect(
      resolveRecentProjectDisplayStatus("p1", "not_started", new Map(), {
        hasArtifactSignal: true,
      }),
    ).toBe("succeeded");
    expect(
      resolveRecentProjectDisplayStatus("p1", undefined, new Map(), {
        hasArtifactSignal: true,
      }),
    ).toBe("succeeded");
    expect(
      resolveRecentProjectDisplayStatus("p1", "failed", new Map(), {
        hasArtifactSignal: true,
      }),
    ).toBe("failed");
  });

  it("keeps live active run status above artifact completion inference", () => {
    const byProject = buildActiveRunStatusByProjectId([
      summary({ projectId: "p1", status: "running" }),
    ]);
    expect(
      resolveRecentProjectDisplayStatus("p1", "not_started", byProject, {
        hasArtifactSignal: true,
      }),
    ).toBe("running");
  });

  it("detects artifact signals from entry files or resolved covers", () => {
    expect(hasProjectArtifactSignal({ metadata: { kind: "deck", entryFile: "deck.html" } })).toBe(
      true,
    );
    expect(
      hasProjectArtifactSignal(
        { metadata: { kind: "other" } },
        { kind: "html", name: "index.html", version: 1 },
      ),
    ).toBe(true);
    expect(hasProjectArtifactSignal({ metadata: { kind: "other" } })).toBe(false);
  });
});

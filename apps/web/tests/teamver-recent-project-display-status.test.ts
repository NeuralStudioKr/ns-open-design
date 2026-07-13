import { describe, expect, it } from "vitest";
import {
  buildActiveRunStatusByProjectId,
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
});

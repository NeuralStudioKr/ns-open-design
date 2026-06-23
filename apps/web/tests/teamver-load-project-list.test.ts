import { afterEach, describe, expect, it, vi } from "vitest";

import { loadProjectListSafe } from "../src/teamver/loadProjectList";
import * as designApiBase from "../src/teamver/designApiBase";
import * as projectsState from "../src/state/projects";
import { TeamverProjectRegistryError } from "../src/teamver/projectRegistry";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/state/projects", () => ({
  listProjects: vi.fn(),
}));

describe("loadProjectListSafe", () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(projectsState.listProjects).mockReset();
  });

  it("returns projects on success", async () => {
    vi.mocked(projectsState.listProjects).mockResolvedValue([
      {
        id: "p1",
        name: "Deck",
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    await expect(loadProjectListSafe()).resolves.toEqual({
      ok: true,
      projects: [
        expect.objectContaining({ id: "p1" }),
      ],
    });
  });

  it("surfaces registry list failures in embed mode", async () => {
    vi.mocked(projectsState.listProjects).mockRejectedValue(
      new TeamverProjectRegistryError("teamver_project_registry_list_failed"),
    );

    const result = await loadProjectListSafe();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toContain("목록");
    }
  });
});

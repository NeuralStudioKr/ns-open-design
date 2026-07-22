// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/projectRegistry", () => ({
  listTeamverRegistryProjects: vi.fn(),
  TeamverProjectRegistryError: class TeamverProjectRegistryError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));

import {
  clearTeamverDeletedProjectTombstonesForTests,
  markTeamverProjectDeletedTombstone,
  readTeamverDeletedProjectIds,
} from "../src/teamver/deletedProjectTombstones";
import { listEmbedProjectsFromRegistry } from "../src/teamver/embedRegistryProjectList";
import * as projectRegistry from "../src/teamver/projectRegistry";
import type { TeamverRegisteredProject } from "../src/teamver/projectRegistry";

describe("Teamver deleted project tombstones", () => {
  afterEach(() => {
    clearTeamverDeletedProjectTombstonesForTests();
    vi.mocked(projectRegistry.listTeamverRegistryProjects).mockReset();
  });

  it("persists deleted project ids for the current browser session", () => {
    markTeamverProjectDeletedTombstone("p-deleted");

    expect(readTeamverDeletedProjectIds()).toEqual(new Set(["p-deleted"]));
  });

  it("filters tombstoned projects from embed registry lists after refresh", async () => {
    markTeamverProjectDeletedTombstone("p-deleted");
    vi.mocked(projectRegistry.listTeamverRegistryProjects).mockResolvedValue([
      { odProjectId: "p-kept", title: "Kept", updatedAt: 20 },
      { odProjectId: "p-deleted", title: "Deleted", updatedAt: 30 },
    ] as TeamverRegisteredProject[]);

    const projects = await listEmbedProjectsFromRegistry();

    expect(projects.map((project) => project.id)).toEqual(["p-kept"]);
  });
});

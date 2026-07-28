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

vi.mock("../src/teamver/activeTeamverWorkspace", () => ({
  resolveActiveTeamverWorkspaceId: vi.fn(async () => "ws-1"),
}));

import {
  clearTeamverDeletedProjectTombstonesForTests,
  markTeamverProjectDeletedTombstone,
  mergeDeletedProjectIdSets,
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
    markTeamverProjectDeletedTombstone("p-deleted", "ws-1");

    expect(readTeamverDeletedProjectIds("ws-1")).toEqual(new Set(["p-deleted"]));
  });

  it("keeps tombstones across sessionStorage clear when stored in localStorage", () => {
    markTeamverProjectDeletedTombstone("p-old", "ws-1");
    sessionStorage.clear();

    expect(readTeamverDeletedProjectIds("ws-1")).toEqual(new Set(["p-old"]));
  });

  it("merges session tombstones with in-memory delete markers", () => {
    markTeamverProjectDeletedTombstone("p-session", "ws-1");
    const memory = new Map<string, number>([["p-memory", 1]]);

    expect(mergeDeletedProjectIdSets(memory, "ws-1")).toEqual(
      new Set(["p-session", "p-memory"]),
    );
  });

  it("filters tombstoned projects from embed registry lists after refresh", async () => {
    markTeamverProjectDeletedTombstone("p-deleted", "ws-1");
    vi.mocked(projectRegistry.listTeamverRegistryProjects).mockResolvedValue([
      { odProjectId: "p-kept", title: "Kept", updatedAt: 20 },
      { odProjectId: "p-deleted", title: "Deleted", updatedAt: 30 },
    ] as TeamverRegisteredProject[]);

    const projects = await listEmbedProjectsFromRegistry();

    expect(projects.map((project) => project.id)).toEqual(["p-kept"]);
  });

  it("drops registry rows already marked deleted on design-api", async () => {
    vi.mocked(projectRegistry.listTeamverRegistryProjects).mockResolvedValue([
      { odProjectId: "p-active", title: "Active", updatedAt: 20 },
      { odProjectId: "p-gone", title: "Gone", updatedAt: 30, status: "deleted" },
    ] as TeamverRegisteredProject[]);

    const projects = await listEmbedProjectsFromRegistry();

    expect(projects.map((project) => project.id)).toEqual(["p-active"]);
  });
});

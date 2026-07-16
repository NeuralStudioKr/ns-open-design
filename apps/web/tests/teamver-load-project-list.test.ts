import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadProjectListPage,
  loadProjectListSafe,
  loadProjectsForWorkspaceSwitch,
  loadRecentProjectsForHome,
} from "../src/teamver/loadProjectList";
import * as designApiBase from "../src/teamver/designApiBase";
import * as projectsState from "../src/state/projects";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/state/projects", () => ({
  listProjects: vi.fn(),
  listRecentProjects: vi.fn(),
  listProjectsPage: vi.fn(),
}));

describe("loadProjectListSafe", () => {
  afterEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(projectsState.listProjects).mockReset();
    vi.mocked(projectsState.listRecentProjects).mockReset();
    vi.mocked(projectsState.listProjectsPage).mockReset();
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

  it("returns projects when registry list is unavailable in embed mode", async () => {
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
      projects: [expect.objectContaining({ id: "p1" })],
    });
  });
});

describe("loadRecentProjectsForHome", () => {
  afterEach(() => {
    vi.mocked(projectsState.listRecentProjects).mockReset();
  });

  it("loads recent projects for the home rail", async () => {
    vi.mocked(projectsState.listRecentProjects).mockResolvedValue([
      {
        id: "p1",
        name: "Recent",
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    await expect(loadRecentProjectsForHome()).resolves.toEqual({
      ok: true,
      projects: [expect.objectContaining({ id: "p1" })],
    });
  });
});

describe("loadProjectListPage", () => {
  afterEach(() => {
    vi.mocked(projectsState.listProjectsPage).mockReset();
  });

  it("returns paginated projects with cursor metadata", async () => {
    vi.mocked(projectsState.listProjectsPage).mockResolvedValue({
      projects: [
        {
          id: "p1",
          name: "Deck",
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      hasMore: true,
      nextCursor: "2:p1",
    });

    await expect(loadProjectListPage()).resolves.toEqual({
      ok: true,
      projects: [expect.objectContaining({ id: "p1" })],
      hasMore: true,
      nextCursor: "2:p1",
    });
  });
});

describe("loadProjectsForWorkspaceSwitch", () => {
  afterEach(() => {
    vi.mocked(projectsState.listRecentProjects).mockReset();
    vi.mocked(projectsState.listProjectsPage).mockReset();
  });

  it("uses recent listing when homeRecent is true", async () => {
    vi.mocked(projectsState.listRecentProjects).mockResolvedValue([
      {
        id: "r1",
        name: "Recent",
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    await expect(loadProjectsForWorkspaceSwitch({ homeRecent: true })).resolves.toEqual({
      ok: true,
      projects: [expect.objectContaining({ id: "r1" })],
      hasMore: false,
      nextCursor: null,
    });
    expect(projectsState.listProjectsPage).not.toHaveBeenCalled();
  });

  it("uses paginated listing when homeRecent is false", async () => {
    vi.mocked(projectsState.listProjectsPage).mockResolvedValue({
      projects: [
        {
          id: "p1",
          name: "Deck",
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    await expect(loadProjectsForWorkspaceSwitch({ homeRecent: false })).resolves.toEqual({
      ok: true,
      projects: [expect.objectContaining({ id: "p1" })],
      hasMore: false,
      nextCursor: null,
    });
    expect(projectsState.listRecentProjects).not.toHaveBeenCalled();
  });
});

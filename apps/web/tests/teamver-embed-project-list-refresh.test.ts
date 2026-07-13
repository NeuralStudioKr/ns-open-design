import { describe, expect, it, vi } from "vitest";

import * as designApiBase from "../src/teamver/designApiBase";
import {
  mergeProjectIntoList,
  mergeRecentProjectsIntoList,
  readEmbedProjectDetailRoute,
  shouldDeferEmbedProjectListRefresh,
} from "../src/teamver/embedProjectListRefresh";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

const project = {
  id: "p1",
  name: "Deck",
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 2,
};

describe("embedProjectListRefresh", () => {
  it("defers list refresh on embed project detail routes", () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    expect(
      shouldDeferEmbedProjectListRefresh({
        kind: "project",
        projectId: "p1",
        fileName: null,
      }),
    ).toBe(true);
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
    expect(
      shouldDeferEmbedProjectListRefresh({
        kind: "project",
        projectId: "p1",
        fileName: null,
      }),
    ).toBe(false);
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    expect(
      shouldDeferEmbedProjectListRefresh({ kind: "home", view: "home" }),
    ).toBe(false);
  });

  it("reads the active embed project route id", () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
    expect(
      readEmbedProjectDetailRoute({
        kind: "project",
        projectId: "p1",
        fileName: null,
      }),
    ).toEqual({
      kind: "project",
      projectId: "p1",
      fileName: null,
    });
    expect(readEmbedProjectDetailRoute({ kind: "home", view: "home" })).toBeNull();
  });

  it("merges a project into an existing list by id", () => {
    expect(mergeProjectIntoList([], project)).toEqual([project]);
    expect(
      mergeProjectIntoList(
        [project, { ...project, id: "p2", name: "Other" }],
        { ...project, name: "Updated", updatedAt: 9 },
      ),
    ).toEqual([
      { ...project, name: "Updated", updatedAt: 9 },
      { ...project, id: "p2", name: "Other" },
    ]);
  });

  it("upserts recent slice without dropping paginated list rows", () => {
    const current = [
      { ...project, id: "p-old", name: "Old", updatedAt: 1 },
      {
        ...project,
        id: "p1",
        name: "Stale",
        updatedAt: 2,
        status: { value: "running" as const },
      },
      { ...project, id: "p2", name: "Keep", updatedAt: 3 },
    ];
    const recent = [
      {
        ...project,
        id: "p1",
        name: "Fresh",
        updatedAt: 10,
        status: { value: "succeeded" as const },
      },
      { ...project, id: "p-new", name: "New", updatedAt: 11 },
    ];
    expect(mergeRecentProjectsIntoList(current, recent)).toEqual([
      { ...project, id: "p-new", name: "New", updatedAt: 11 },
      {
        ...project,
        id: "p1",
        name: "Fresh",
        updatedAt: 10,
        status: { value: "succeeded" },
      },
      { ...project, id: "p2", name: "Keep", updatedAt: 3 },
      { ...project, id: "p-old", name: "Old", updatedAt: 1 },
    ]);
  });
});

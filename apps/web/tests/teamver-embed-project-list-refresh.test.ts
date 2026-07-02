import { describe, expect, it, vi } from "vitest";

import * as designApiBase from "../src/teamver/designApiBase";
import {
  mergeProjectIntoList,
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

  it("merges a refreshed project row into the local list", () => {
    expect(mergeProjectIntoList([], project)).toEqual([project]);
    expect(
      mergeProjectIntoList([project], { ...project, name: "Renamed", updatedAt: 9 }),
    ).toEqual([{ ...project, name: "Renamed", updatedAt: 9 }]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Project } from "../src/types";
import { warmEmbedProjectListCaches } from "../src/teamver/warmEmbedProjectListCaches";

const mocks = vi.hoisted(() => ({
  prefetchHomeProjectCovers: vi.fn(),
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: () => mocks.isTeamverEmbedMode(),
}));

vi.mock("../src/teamver/prefetchHomeProjectCovers", () => ({
  prefetchHomeProjectCovers: (projects: Project[]) => mocks.prefetchHomeProjectCovers(projects),
}));

const sampleProject: Project = {
  id: "p1",
  name: "Deck",
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 2,
};

describe("warmEmbedProjectListCaches", () => {
  afterEach(() => {
    mocks.prefetchHomeProjectCovers.mockClear();
    mocks.isTeamverEmbedMode.mockReturnValue(true);
  });

  it("prefetches bounded home project covers in embed mode", () => {
    warmEmbedProjectListCaches([sampleProject]);
    expect(mocks.prefetchHomeProjectCovers).toHaveBeenCalledWith([sampleProject]);
  });

  it("skips when not in embed mode or list is empty", () => {
    mocks.isTeamverEmbedMode.mockReturnValue(false);
    warmEmbedProjectListCaches([sampleProject]);
    warmEmbedProjectListCaches([]);
    expect(mocks.prefetchHomeProjectCovers).not.toHaveBeenCalled();
  });
});

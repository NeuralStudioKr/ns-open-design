import { afterEach, describe, expect, it, vi } from "vitest";

import type { Project } from "../src/types";
import { warmEmbedProjectListCaches } from "../src/teamver/warmEmbedProjectListCaches";

const prefetchDesignsTabViewport = vi.fn();
const isTeamverEmbedMode = vi.fn(() => true);

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: () => isTeamverEmbedMode(),
}));

vi.mock("../src/teamver/prefetchDesignsTabViewport", () => ({
  prefetchDesignsTabViewport: (projects: Project[]) => prefetchDesignsTabViewport(projects),
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
    prefetchDesignsTabViewport.mockClear();
    isTeamverEmbedMode.mockReturnValue(true);
  });

  it("prefetches DesignsTab viewport hints in embed mode", () => {
    warmEmbedProjectListCaches([sampleProject]);
    expect(prefetchDesignsTabViewport).toHaveBeenCalledWith([sampleProject]);
  });

  it("skips when not in embed mode or list is empty", () => {
    isTeamverEmbedMode.mockReturnValue(false);
    warmEmbedProjectListCaches([sampleProject]);
    warmEmbedProjectListCaches([]);
    expect(prefetchDesignsTabViewport).not.toHaveBeenCalled();
  });
});

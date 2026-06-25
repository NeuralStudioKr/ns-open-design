import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCoverHintsMock = vi.fn(async () => ({ ok: false }));
const fetchProjectFilesMock = vi.fn(async () => []);
const prefetchLatestPublishSummariesMock = vi.fn();

vi.stubGlobal("fetch", (...args: unknown[]) => fetchCoverHintsMock(...args));

vi.mock("../src/providers/registry", () => ({
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFilesMock(...args),
}));

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/teamverDesignAccess", () => ({
  isTeamverEmbedDesignSurfaceEnabled: vi.fn(() => true),
}));

vi.mock("../src/teamver/latestPublishSummary", () => ({
  prefetchLatestPublishSummaries: (...args: unknown[]) =>
    prefetchLatestPublishSummariesMock(...args),
}));

import { prefetchDesignsTabViewport } from "../src/teamver/prefetchDesignsTabViewport";
import { prefetchHomeProjectCovers } from "../src/teamver/prefetchHomeProjectCovers";
import { resetProjectCoverLoaderStateForTests } from "../src/teamver/projectCoverLoader";
import type { Project } from "../src/types";

function project(id: string, updatedAt: number): Project {
  return {
    id,
    name: id,
    skillId: null,
    createdAt: 1,
    updatedAt,
    metadata: { kind: "deck" },
  };
}

describe("prefetch cover-hints coalesce (loop 358 · S-6)", () => {
  beforeEach(() => {
    fetchCoverHintsMock.mockReset();
    fetchCoverHintsMock.mockResolvedValue({ ok: true, json: async () => ({ hints: [] }) });
    fetchProjectFilesMock.mockReset();
    fetchProjectFilesMock.mockResolvedValue([]);
    prefetchLatestPublishSummariesMock.mockReset();
    resetProjectCoverLoaderStateForTests();
  });

  afterEach(() => {
    resetProjectCoverLoaderStateForTests();
  });

  it("warmEmbed-style parallel viewport + home prefetch hits cover-hints once", async () => {
    const projects = Array.from({ length: 8 }, (_, index) =>
      project(`p${index}`, 100 - index),
    );

    await Promise.all([
      prefetchDesignsTabViewport(projects),
      prefetchHomeProjectCovers(projects),
    ]);

    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    expect(prefetchLatestPublishSummariesMock).toHaveBeenCalledTimes(1);
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();
  });

  it("home recent prefetch uses cover-hints only and skips /files listing", async () => {
    const projects = Array.from({ length: 6 }, (_, index) =>
      project(`home-${index}`, 100 - index),
    );

    await prefetchHomeProjectCovers(projects);

    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { clearTeamverEmbedListCaches, clearTeamverEmbedProjectCaches } from "../src/teamver/teamverEmbedListCaches";

const invalidateTeamverProjectRegistryCaches = vi.fn();
const clearProjectCoverCache = vi.fn();
const clearLatestPublishSummaryCache = vi.fn();

vi.mock("../src/teamver/projectRegistry", () => ({
  invalidateTeamverProjectRegistryCaches: () => invalidateTeamverProjectRegistryCaches(),
}));

vi.mock("../src/teamver/projectCoverLoader", () => ({
  clearProjectCoverCache: (id?: string) => clearProjectCoverCache(id),
}));

vi.mock("../src/teamver/latestPublishSummary", () => ({
  clearLatestPublishSummaryCache: (id?: string) => clearLatestPublishSummaryCache(id),
}));

describe("clearTeamverEmbedListCaches", () => {
  afterEach(() => {
    invalidateTeamverProjectRegistryCaches.mockClear();
    clearProjectCoverCache.mockClear();
    clearLatestPublishSummaryCache.mockClear();
  });

  it("clears registry, cover, and publish summary caches together", () => {
    clearTeamverEmbedListCaches();
    expect(invalidateTeamverProjectRegistryCaches).toHaveBeenCalledTimes(1);
    expect(clearProjectCoverCache).toHaveBeenCalledTimes(1);
    expect(clearLatestPublishSummaryCache).toHaveBeenCalledTimes(1);
  });

  it("clears per-project cover and publish caches on delete", () => {
    clearTeamverEmbedProjectCaches("p-deleted");
    expect(clearProjectCoverCache).toHaveBeenCalledWith("p-deleted");
    expect(clearLatestPublishSummaryCache).toHaveBeenCalledWith("p-deleted");
    expect(invalidateTeamverProjectRegistryCaches).not.toHaveBeenCalled();
  });
});

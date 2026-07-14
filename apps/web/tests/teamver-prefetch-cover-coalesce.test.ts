import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCoverHintsMock = vi.fn(async () => ({ ok: false }));
const fetchProjectFilesMock = vi.fn(async () => []);
const prefetchLatestPublishSummariesMock = vi.fn();

vi.mock("../src/teamver/teamverDaemonHeaders", () => ({
  fetchTeamverDaemon: (...args: unknown[]) => fetchCoverHintsMock(...args),
}));

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
import { isTeamverEmbedMode } from "../src/teamver/designApiBase";
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
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    resetProjectCoverLoaderStateForTests();
  });

  afterEach(() => {
    resetProjectCoverLoaderStateForTests();
  });

  it("warmEmbed-style parallel viewport + home prefetch coalesces cover-hints without home /files", async () => {
    const projects = Array.from({ length: 8 }, (_, index) =>
      project(`p${index}`, 100 - index),
    );
    fetchProjectFilesMock.mockImplementation(async (projectId: string) => [
      {
        name: `${projectId}.html`,
        kind: "html",
        mtime: 1,
        size: 1,
        mime: "text/html",
      },
    ]);

    await Promise.all([
      prefetchDesignsTabViewport(projects),
      prefetchHomeProjectCovers(projects),
    ]);

    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    expect(prefetchLatestPublishSummariesMock).toHaveBeenCalledTimes(1);
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();
  });

  it("home recent prefetch skips /files on embed when cover-hints are empty", async () => {
    const projects = Array.from({ length: 6 }, (_, index) =>
      project(`home-${index}`, 100 - index),
    );
    fetchProjectFilesMock.mockImplementation(async (projectId: string) => [
      {
        name: `${projectId}.html`,
        kind: "html",
        mtime: 1,
        size: 1,
        mime: "text/html",
      },
    ]);

    const covers = await prefetchHomeProjectCovers(projects);

    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();
    expect(covers["home-0"]).toBeNull();
  });

  it("standalone home recent prefetch may still use bounded /files fallback", async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    const projects = Array.from({ length: 6 }, (_, index) =>
      project(`home-standalone-${index}`, 100 - index),
    );
    fetchProjectFilesMock.mockImplementation(async (projectId: string) => [
      {
        name: `${projectId}.html`,
        kind: "html",
        mtime: 1,
        size: 1,
        mime: "text/html",
      },
    ]);

    const covers = await prefetchHomeProjectCovers(projects);

    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    expect(fetchProjectFilesMock).toHaveBeenCalledTimes(6);
    expect(covers["home-standalone-0"]).toEqual({
      kind: "html",
      name: "home-standalone-0.html",
    });
  });

  it("home recent prefetch still skips /files listing when cover-hints resolve covers", async () => {
    const projects = Array.from({ length: 6 }, (_, index) =>
      project(`hinted-${index}`, 100 - index),
    );
    fetchCoverHintsMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        hints: projects.map((item) => ({
          projectId: item.id,
          entryFile: `${item.id}.html`,
          coverKind: "html",
          coverPath: `${item.id}.html`,
          coverVersion: 100,
        })),
      }),
    });

    const covers = await prefetchHomeProjectCovers(projects);

    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();
    expect(covers["hinted-0"]).toEqual({
      kind: "html",
      name: "hinted-0.html",
      version: 100,
    });
  });
});

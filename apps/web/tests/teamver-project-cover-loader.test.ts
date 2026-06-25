import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchProjectFilesMock = vi.fn();
const fetchCoverHintsMock = vi.fn(async () => ({ ok: false }));

vi.mock("../src/providers/registry", () => ({
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFilesMock(...args),
}));

vi.stubGlobal("fetch", (...args: unknown[]) => fetchCoverHintsMock(...args));

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock("../src/teamver/teamverDesignAccess", () => ({
  isTeamverEmbedDesignSurfaceEnabled: vi.fn(() => true),
}));

import {
  embedProjectCoverHintsOnly,
  prefetchProjectCoverHintsForProjects,
  projectNeedsCoverFileFetch,
  resetProjectCoverLoaderStateForTests,
  resolveProjectCoverFile,
  resolveProjectCoverFiles,
  resolveProjectCoverOptionsForListSurface,
} from "../src/teamver/projectCoverLoader";
import { isTeamverEmbedMode } from "../src/teamver/designApiBase";
import { isTeamverEmbedDesignSurfaceEnabled } from "../src/teamver/teamverDesignAccess";
import type { Project } from "../src/types";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Deck",
    skillId: null,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe("projectCoverLoader", () => {
  beforeEach(() => {
    fetchProjectFilesMock.mockReset();
    fetchCoverHintsMock.mockReset();
    fetchCoverHintsMock.mockResolvedValue({ ok: false });
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(isTeamverEmbedDesignSurfaceEnabled).mockReturnValue(true);
    resetProjectCoverLoaderStateForTests();
  });

  afterEach(() => {
    resetProjectCoverLoaderStateForTests();
  });

  it("embed list surfaces default to hints-only cover resolve options", () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(isTeamverEmbedDesignSurfaceEnabled).mockReturnValue(true);
    expect(embedProjectCoverHintsOnly()).toBe(true);
    expect(resolveProjectCoverOptionsForListSurface()).toEqual({
      allowFilesFallback: false,
    });

    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    expect(embedProjectCoverHintsOnly()).toBe(false);
    expect(resolveProjectCoverOptionsForListSurface()).toEqual({});
  });

  it("skips fetch when metadata entryFile is present", async () => {
    const deck = project({ metadata: { kind: "deck", entryFile: "index.html" } });
    expect(projectNeedsCoverFileFetch(deck)).toBe(false);
    await expect(resolveProjectCoverFile(deck)).resolves.toBeNull();
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();
  });

  it("fetches cover once and reuses cache", async () => {
    fetchProjectFilesMock.mockResolvedValue([
      {
        name: "index.html",
        kind: "html",
        mtime: 10,
        size: 1,
        mime: "text/html",
      },
    ]);

    const deck = project({ metadata: { kind: "deck" } });
    const first = await resolveProjectCoverFile(deck);
    const second = await resolveProjectCoverFile(deck);

    expect(first).toEqual({ kind: "html", name: "index.html" });
    expect(second).toEqual(first);
    expect(fetchProjectFilesMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces cover-hints batch before /files fallback", async () => {
    fetchCoverHintsMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        hints: [
          {
            projectId: "p1",
            entryFile: "deck.html",
            coverKind: "html",
            coverPath: "deck.html",
          },
          {
            projectId: "p2",
            entryFile: "other.html",
            coverKind: "html",
            coverPath: "other.html",
          },
        ],
      }),
    });

    const projects = [
      project({ id: "p1", metadata: { kind: "deck" } }),
      project({ id: "p2", metadata: { kind: "deck" } }),
    ];

    await Promise.all(projects.map((item) => resolveProjectCoverFile(item)));

    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchCoverHintsMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.projectIds).toEqual(expect.arrayContaining(["p1", "p2"]));
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();
  });

  it("skips /files listing when allowFilesFallback is false", async () => {
    fetchCoverHintsMock.mockResolvedValue({
      ok: true,
      json: async () => ({ hints: [] }),
    });
    fetchProjectFilesMock.mockResolvedValue([
      { name: "deck.html", kind: "html", mtime: 1, size: 1, mime: "text/html" },
    ]);

    const projects = [
      project({ id: "p1", metadata: { kind: "deck" } }),
      project({ id: "p2", metadata: { kind: "deck" } }),
    ];

    const covers = await resolveProjectCoverFiles(projects, {
      allowFilesFallback: false,
    });

    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();
    expect(covers.p1).toBeNull();
    expect(covers.p2).toBeNull();
  });

  it("limits concurrent file fetches in batch resolve", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    fetchProjectFilesMock.mockImplementation(async (projectId: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return [
        {
          name: `${projectId}.html`,
          kind: "html",
          mtime: 1,
          size: 1,
          mime: "text/html",
        },
      ];
    });

    const projects = Array.from({ length: 8 }, (_, index) =>
      project({ id: `p${index}`, metadata: { kind: "deck" } }),
    );

    const covers = await resolveProjectCoverFiles(projects, { concurrency: 2 });

    expect(Object.keys(covers)).toHaveLength(8);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(fetchProjectFilesMock).toHaveBeenCalledTimes(8);
  });

  it("prefetchProjectCoverHintsForProjects drains via shared batch queue", async () => {
    fetchCoverHintsMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        hints: [
          {
            projectId: "p1",
            entryFile: "deck.html",
            coverKind: "html",
            coverPath: "deck.html",
          },
        ],
      }),
    });

    const projects = [
      project({ id: "p1", metadata: { kind: "deck" } }),
      project({ id: "p2", metadata: { kind: "deck" } }),
    ];

    await prefetchProjectCoverHintsForProjects(projects);

    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();
    await expect(resolveProjectCoverFile(projects[0]!)).resolves.toEqual({
      kind: "html",
      name: "deck.html",
    });
  });

  it("merges parallel prefetchProjectCoverHintsForProjects into one HTTP call", async () => {
    fetchCoverHintsMock.mockResolvedValue({
      ok: true,
      json: async () => ({ hints: [] }),
    });

    const batchA = [
      project({ id: "p1", metadata: { kind: "deck" } }),
      project({ id: "p2", metadata: { kind: "deck" } }),
    ];
    const batchB = [
      project({ id: "p3", metadata: { kind: "deck" } }),
      project({ id: "p4", metadata: { kind: "deck" } }),
    ];

    await Promise.all([
      prefetchProjectCoverHintsForProjects(batchA),
      prefetchProjectCoverHintsForProjects(batchB),
    ]);

    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchCoverHintsMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.projectIds).toEqual(expect.arrayContaining(["p1", "p2", "p3", "p4"]));
  });

  it("does not re-hint after prefetch until hint TTL expires", async () => {
    vi.useFakeTimers();
    fetchCoverHintsMock.mockResolvedValue({
      ok: true,
      json: async () => ({ hints: [] }),
    });
    fetchProjectFilesMock.mockResolvedValue([
      { name: "deck.html", kind: "html", mtime: 1, size: 1, mime: "text/html" },
    ]);

    const deck = project({ id: "p1", metadata: { kind: "deck" } });
    await prefetchProjectCoverHintsForProjects([deck]);
    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);

    fetchCoverHintsMock.mockClear();
    await resolveProjectCoverFile(deck);
    expect(fetchCoverHintsMock).not.toHaveBeenCalled();
    expect(fetchProjectFilesMock).toHaveBeenCalledTimes(1);

    fetchCoverHintsMock.mockClear();
    fetchProjectFilesMock.mockClear();
    vi.advanceTimersByTime(61_000);

    await prefetchProjectCoverHintsForProjects([deck]);
    expect(fetchCoverHintsMock).toHaveBeenCalledTimes(1);
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

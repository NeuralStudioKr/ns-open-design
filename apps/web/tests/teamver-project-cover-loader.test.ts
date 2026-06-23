import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchProjectFilesMock = vi.fn();
const fetchCoverHintsMock = vi.fn(async () => ({ ok: false }));

vi.mock("../src/providers/registry", () => ({
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFilesMock(...args),
}));

vi.stubGlobal("fetch", (...args: unknown[]) => fetchCoverHintsMock(...args));

import {
  projectNeedsCoverFileFetch,
  resetProjectCoverLoaderStateForTests,
  resolveProjectCoverFile,
  resolveProjectCoverFiles,
} from "../src/teamver/projectCoverLoader";
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
    resetProjectCoverLoaderStateForTests();
  });

  afterEach(() => {
    resetProjectCoverLoaderStateForTests();
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
});

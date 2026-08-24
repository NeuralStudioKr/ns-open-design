import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCoverHintsMock = vi.fn(async () => ({ ok: false }));
const fetchProjectFilesMock = vi.fn(async () => []);
const prefetchLatestPublishSummariesMock = vi.fn();

vi.mock("../src/teamver/teamverDaemonHeaders", () => ({
  fetchTeamverDaemon: (...args: unknown[]) => fetchCoverHintsMock(...args),
}));

vi.mock("../src/providers/registry", () => ({
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFilesMock(...args),
  projectFileUrl: (projectId: string, filePath: string) =>
    `/api/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
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
import {
  __resetPrefetchHomeProjectCoversForTests,
  prefetchHomeProjectCovers,
} from "../src/teamver/prefetchHomeProjectCovers";
import { resetProjectCoverLoaderStateForTests } from "../src/teamver/projectCoverLoader";
import { isTeamverEmbedMode } from "../src/teamver/designApiBase";
import { resetTeamverProjectPreviewScopeForTests } from "../src/teamver/teamverProjectPreviewScope";
import { __resetWarmTeamverHtmlCoverCacheForTests } from "../src/teamver/warmTeamverHtmlCoverCache";
import { clearHtmlCoverCacheStoreForTests } from "../src/teamver/htmlCoverCacheStore";
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

function daemonCallsMatching(substr: string): number {
  return fetchCoverHintsMock.mock.calls.filter((call) => String(call[0]).includes(substr))
    .length;
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
    __resetPrefetchHomeProjectCoversForTests();
    resetTeamverProjectPreviewScopeForTests();
    __resetWarmTeamverHtmlCoverCacheForTests();
    clearHtmlCoverCacheStoreForTests();
  });

  afterEach(() => {
    resetProjectCoverLoaderStateForTests();
    __resetPrefetchHomeProjectCoversForTests();
    resetTeamverProjectPreviewScopeForTests();
    __resetWarmTeamverHtmlCoverCacheForTests();
    clearHtmlCoverCacheStoreForTests();
  });

  it("warmEmbed-style parallel viewport + home prefetch coalesces cover-hints; home may use bounded /files", async () => {
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

    expect(daemonCallsMatching("cover-hints")).toBe(1);
    expect(prefetchLatestPublishSummariesMock).toHaveBeenCalledTimes(1);
    // Home recent caps at HOME_RECENT_LIST_LIMIT (6); DesignsTab stays hints-only.
    expect(fetchProjectFilesMock).toHaveBeenCalledTimes(6);
  });

  it("home recent prefetch uses bounded /files fallback on embed when cover-hints are empty", async () => {
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

    expect(daemonCallsMatching("cover-hints")).toBe(1);
    expect(fetchProjectFilesMock).toHaveBeenCalledTimes(6);
    expect(covers["home-0"]).toEqual({
      kind: "html",
      name: "home-0.html",
    });
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

    expect(daemonCallsMatching("cover-hints")).toBe(1);
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
    fetchCoverHintsMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cover-hints")) {
        return {
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
        };
      }
      if (url.includes("preview-url-batch")) {
        return {
          ok: true,
          json: async () => ({
            results: projects.map((item) => ({
              projectId: item.id,
              ok: true,
              url: `/api/projects/${item.id}/preview/scope/${item.id}.html`,
              file: `${item.id}.html`,
            })),
          }),
        };
      }
      if (url.includes("cover-html-batch")) {
        return {
          ok: true,
          json: async () => ({
            results: projects.map((item) => ({
              projectId: item.id,
              ok: true,
              file: `${item.id}.html`,
              html: `<!doctype html><html><body><section class="slide">${item.id}</section></body></html>`,
            })),
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const covers = await prefetchHomeProjectCovers(projects);

    expect(daemonCallsMatching("cover-hints")).toBe(1);
    expect(fetchProjectFilesMock).not.toHaveBeenCalled();
    expect(covers["hinted-0"]).toEqual({
      kind: "html",
      name: "hinted-0.html",
      version: 100,
    });
  });

  it("parallel home prefetch (warmEmbed + RecentStrip) POSTs preview-url/cover-html batch once each", async () => {
    const projects = Array.from({ length: 4 }, (_, index) =>
      project(`race-${index}`, 100 - index),
    );
    fetchCoverHintsMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cover-hints")) {
        return {
          ok: true,
          json: async () => ({
            hints: projects.map((item) => ({
              projectId: item.id,
              entryFile: `${item.id}.html`,
              coverKind: "html",
              coverPath: `${item.id}.html`,
              coverVersion: 1,
            })),
          }),
        };
      }
      if (url.includes("preview-url-batch")) {
        return {
          ok: true,
          json: async () => ({
            results: projects.map((item) => ({
              projectId: item.id,
              ok: true,
              url: `/api/projects/${item.id}/preview/scope/${item.id}.html`,
              file: `${item.id}.html`,
            })),
          }),
        };
      }
      if (url.includes("cover-html-batch")) {
        return {
          ok: true,
          json: async () => ({
            results: projects.map((item) => ({
              projectId: item.id,
              ok: true,
              file: `${item.id}.html`,
              html: `<!doctype html><html><body><section class="slide">${item.id}</section></body></html>`,
            })),
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // Simulate App warmEmbed + RecentProjectsStrip racing on the same list.
    await Promise.all([
      prefetchHomeProjectCovers(projects),
      prefetchHomeProjectCovers(projects),
      prefetchHomeProjectCovers(projects),
      prefetchHomeProjectCovers(projects),
    ]);

    expect(daemonCallsMatching("cover-hints")).toBe(1);
    expect(daemonCallsMatching("preview-url-batch")).toBe(1);
    expect(daemonCallsMatching("cover-html-batch")).toBe(1);
  });
});

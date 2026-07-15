import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTeamverDriveBrowsePageCached,
  loadTeamverDriveBrowsePageCached,
  resetTeamverDriveBrowsePageCachesForTests,
  setTeamverDriveBrowsePageCached,
} from "../src/teamver/driveBrowsePageCache";

describe("driveBrowsePageCache", () => {
  afterEach(() => {
    resetTeamverDriveBrowsePageCachesForTests();
  });

  it("dedupes concurrent loaders for the same cache key", async () => {
    let resolveLoader!: (value: {
      targets: [];
      assets: [];
      recentAssets: [];
      hasMore: boolean;
      nextCursor: null;
    }) => void;
    const loader = vi.fn(
      () =>
        new Promise< {
          targets: [];
          assets: [];
          recentAssets: [];
          hasMore: boolean;
          nextCursor: null;
        }>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    const a = loadTeamverDriveBrowsePageCached("ws:personal:root:start", loader);
    const b = loadTeamverDriveBrowsePageCached("ws:personal:root:start", loader);
    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoader({
      targets: [],
      assets: [],
      recentAssets: [],
      hasMore: false,
      nextCursor: null,
    });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb);
    expect(getTeamverDriveBrowsePageCached("ws:personal:root:start")).toEqual(ra);
  });

  it("returns a TTL hit without calling the loader", async () => {
    setTeamverDriveBrowsePageCached("ws:personal:root:start", {
      targets: [],
      assets: [],
      recentAssets: [],
      hasMore: false,
      nextCursor: null,
    });
    const loader = vi.fn(async () => ({
      targets: [],
      assets: [],
      recentAssets: [],
      hasMore: true,
      nextCursor: "x",
    }));
    const entry = await loadTeamverDriveBrowsePageCached("ws:personal:root:start", loader);
    expect(loader).not.toHaveBeenCalled();
    expect(entry.hasMore).toBe(false);
  });

  it("retries once when a shared inflight was aborted", async () => {
    const { loadTeamverDriveBrowsePageCachedForSignal } = await import(
      "../src/teamver/driveBrowsePageCache"
    );
    let rejectFirst!: (reason: unknown) => void;
    const first = new Promise<{
      targets: [];
      assets: [];
      recentAssets: [];
      hasMore: boolean;
      nextCursor: null;
    }>((_resolve, reject) => {
      rejectFirst = reject;
    });

    const hang = loadTeamverDriveBrowsePageCached("ws:retry:root:start", () => first);
    void hang.catch(() => undefined);
    rejectFirst(new DOMException("The operation was aborted.", "AbortError"));
    await hang.catch(() => undefined);

    const controller = new AbortController();
    const loader = vi.fn(async () => ({
      targets: [] as [],
      assets: [] as [],
      recentAssets: [] as [],
      hasMore: false,
      nextCursor: null,
    }));
    const entry = await loadTeamverDriveBrowsePageCachedForSignal(
      "ws:retry:root:start",
      controller.signal,
      loader,
    );
    expect(loader).toHaveBeenCalledTimes(1);
    expect(entry.hasMore).toBe(false);
  });
});

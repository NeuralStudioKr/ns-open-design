import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The cache module imports `listPluginsPage` from `state/projects.ts`; we
// mock it so this suite stays hermetic (no real fetch, no daemon config).
vi.mock("../src/state/projects", async () => {
  const actual = await vi.importActual<typeof import("../src/state/projects")>(
    "../src/state/projects",
  );
  return {
    ...actual,
    listPluginsPage: vi.fn(async () => ({
      plugins: [
        {
          id: "html-ppt-hermes",
          title: "Hermes",
          manifest: { title: "Hermes", od: { mode: "deck" } },
        },
      ] as unknown as import("@open-design/contracts").InstalledPluginRecord[],
      total: 1,
      limit: 24,
      offset: 0,
      nextOffset: null,
    })),
  };
});

// Re-import AFTER the mock has been registered.
const {
  fetchCanvasSlideTemplatePlugins,
  __resetCanvasSlideTemplatePluginsCacheForTests,
} = await import("../src/teamver/canvasSlideLaunch");
const { listPluginsPage } = await import("../src/state/projects");

describe("fetchCanvasSlideTemplatePlugins (in-memory TTL cache)", () => {
  beforeEach(() => {
    __resetCanvasSlideTemplatePluginsCacheForTests();
    (listPluginsPage as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    __resetCanvasSlideTemplatePluginsCacheForTests();
  });

  it("returns the deck-mode plugin list on first call and hits the API exactly once", async () => {
    const first = await fetchCanvasSlideTemplatePlugins();
    expect(first.map((p) => p.id)).toEqual(["html-ppt-hermes"]);
    expect(listPluginsPage).toHaveBeenCalledTimes(1);
    expect(listPluginsPage).toHaveBeenCalledWith({ mode: "deck", limit: 24 });
  });

  it("pages through the catalog until nextOffset is exhausted", async () => {
    const page = (ids: string[], nextOffset: number | null) => ({
      plugins: ids.map((id) => ({
        id,
        title: id,
        manifest: { title: id, od: { mode: "deck" } },
      })) as unknown as import("@open-design/contracts").InstalledPluginRecord[],
      total: 3,
      limit: 24,
      offset: nextOffset === 24 ? 0 : nextOffset === null ? 24 : 0,
      nextOffset,
    });
    (listPluginsPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page(["a", "b"], 24))
      .mockResolvedValueOnce(page(["c"], null));
    const plugins = await fetchCanvasSlideTemplatePlugins();
    expect(plugins.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(listPluginsPage).toHaveBeenCalledTimes(2);
    expect(listPluginsPage).toHaveBeenNthCalledWith(1, { mode: "deck", limit: 24 });
    expect(listPluginsPage).toHaveBeenNthCalledWith(2, {
      mode: "deck",
      limit: 24,
      offset: 24,
    });
  });

  it("continues paging when a filtered page is empty but nextOffset remains", async () => {
    const page = (
      ids: string[],
      offset: number,
      nextOffset: number | null,
    ) => ({
      plugins: ids.map((id) => ({
        id,
        title: id,
        manifest: { title: id, od: { mode: "deck" } },
      })) as unknown as import("@open-design/contracts").InstalledPluginRecord[],
      total: 2,
      limit: 24,
      offset,
      nextOffset,
    });
    (listPluginsPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page(["a"], 0, 24))
      .mockResolvedValueOnce(page([], 24, 48))
      .mockResolvedValueOnce(page(["b"], 48, null));
    const plugins = await fetchCanvasSlideTemplatePlugins();
    expect(plugins.map((p) => p.id)).toEqual(["a", "b"]);
    expect(listPluginsPage).toHaveBeenCalledTimes(3);
  });

  it("returns the cached list on the second call without hitting the API again", async () => {
    const first = await fetchCanvasSlideTemplatePlugins();
    const second = await fetchCanvasSlideTemplatePlugins();
    expect(second).toBe(first);
    expect(listPluginsPage).toHaveBeenCalledTimes(1);
  });

  it("coalesces parallel in-flight callers into a single fetch", async () => {
    const [a, b, c] = await Promise.all([
      fetchCanvasSlideTemplatePlugins(),
      fetchCanvasSlideTemplatePlugins(),
      fetchCanvasSlideTemplatePlugins(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(listPluginsPage).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when the caller opts in with `{force:true}`", async () => {
    await fetchCanvasSlideTemplatePlugins();
    await fetchCanvasSlideTemplatePlugins({ force: true });
    expect(listPluginsPage).toHaveBeenCalledTimes(2);
  });

  it("still returns a non-null (empty) list when the underlying fetch throws", async () => {
    (listPluginsPage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down"),
    );
    const result = await fetchCanvasSlideTemplatePlugins();
    expect(result).toEqual([]);
    // A second call within the TTL window keeps returning the (empty) cached
    // value so we don't spam the daemon after a transient failure.
    const again = await fetchCanvasSlideTemplatePlugins();
    expect(again).toEqual([]);
    expect(listPluginsPage).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstalledPluginRecord } from "@open-design/contracts";

// Mock the state layer so the hook's cache path is deterministic under jsdom.
const cachedFetch = vi.fn(async () => ({
  plugins: [
    {
      id: "html-ppt-hermes",
      title: "Hermes",
      manifest: { title: "Hermes", od: { mode: "deck" } },
    } as unknown as InstalledPluginRecord,
    {
      id: "html-ppt-cobalt-grid",
      title: "Cobalt Grid",
      manifest: { title: "Cobalt Grid", od: { mode: "deck" } },
    } as unknown as InstalledPluginRecord,
  ],
  total: 2,
  limit: 24,
  offset: 0,
  nextOffset: null,
}));

vi.mock("../src/state/projects", async () => {
  const actual = await vi.importActual<typeof import("../src/state/projects")>(
    "../src/state/projects",
  );
  return {
    ...actual,
    listPluginsPage: cachedFetch,
  };
});

const { useCanvasSlideLaunchTemplates } = await import(
  "../src/teamver/hooks/useCanvasSlideLaunchTemplates"
);
const { __resetCanvasSlideTemplatePluginsCacheForTests, CANVAS_CREATE_SLIDES_PLUGIN_ID } =
  await import("../src/teamver/canvasSlideLaunch");

type Options = Parameters<typeof useCanvasSlideLaunchTemplates>[0];

// Tiny probe component that surfaces the hook output through the DOM so the
// tests can inspect it without pulling in `@testing-library/react-hooks`.
function Probe({ options, onRender }: { options: Options; onRender: (out: unknown[]) => void }) {
  const templates = useCanvasSlideLaunchTemplates(options);
  onRender(templates);
  return null;
}

async function flushMicrotasks() {
  // Wait for the hook's inner `void fetchCanvasSlideTemplatePlugins()` promise
  // chain to settle so the cached-plugins state has been committed.
  await Promise.resolve();
  await Promise.resolve();
}

describe("useCanvasSlideLaunchTemplates", () => {
  beforeEach(() => {
    __resetCanvasSlideTemplatePluginsCacheForTests();
    cachedFetch.mockClear();
  });

  afterEach(() => {
    cleanup();
    __resetCanvasSlideTemplatePluginsCacheForTests();
  });

  it("returns only the fallback tile when `active` is false — no fetch fires", async () => {
    const latest: unknown[][] = [];
    render(
      <Probe
        options={{ active: false, locale: "ko" }}
        onRender={(out) => latest.push(out)}
      />,
    );
    await flushMicrotasks();
    expect(cachedFetch).not.toHaveBeenCalled();
    const last = latest.at(-1) as { id: string }[];
    expect(last.map((option) => option.id)).toEqual([CANVAS_CREATE_SLIDES_PLUGIN_ID]);
  });

  it("fetches the deck-plugin cache once when active, then dedupes with caller plugins", async () => {
    const callerPlugins: InstalledPluginRecord[] = [
      {
        id: "html-ppt-hermes",
        title: "Hermes (caller version)",
        manifest: { title: "Hermes", od: { mode: "deck" } },
      } as unknown as InstalledPluginRecord,
    ];

    const latest: unknown[][] = [];
    let currentActive = true;
    const { rerender } = render(
      <Probe
        options={{ active: currentActive, callerPlugins, locale: "ko" }}
        onRender={(out) => latest.push(out)}
      />,
    );
    await flushMicrotasks();

    // Force a re-render after the cache settles so we can read the merged output.
    await act(async () => {
      rerender(
        <Probe
          options={{ active: currentActive, callerPlugins, locale: "ko" }}
          onRender={(out) => latest.push(out)}
        />,
      );
      await flushMicrotasks();
    });

    expect(cachedFetch).toHaveBeenCalledTimes(1);
    const last = latest.at(-1) as { id: string }[];
    // Fallback + hermes (from caller) + cobalt (from cache). No duplicated hermes.
    expect(last.map((option) => option.id)).toEqual([
      CANVAS_CREATE_SLIDES_PLUGIN_ID,
      "html-ppt-hermes",
      "html-ppt-cobalt-grid",
    ]);
  });

  it("preserves caller-supplied plugin records over the cached page during dedup", async () => {
    const callerHermes = {
      id: "html-ppt-hermes",
      title: "Hermes — caller wins",
      manifest: { title: "Hermes", od: { mode: "deck" } },
    } as unknown as InstalledPluginRecord;
    const latest: unknown[][] = [];
    const { rerender } = render(
      <Probe
        options={{ active: true, callerPlugins: [callerHermes], locale: "ko" }}
        onRender={(out) => latest.push(out)}
      />,
    );
    await act(async () => {
      rerender(
        <Probe
          options={{ active: true, callerPlugins: [callerHermes], locale: "ko" }}
          onRender={(out) => latest.push(out)}
        />,
      );
      await flushMicrotasks();
    });
    const last = latest.at(-1) as { id: string; title: string }[];
    const hermes = last.find((option) => option.id === "html-ppt-hermes");
    expect(hermes).toBeDefined();
    expect(hermes?.title).toBe("Hermes — caller wins");
  });
});

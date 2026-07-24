// Shared hook that resolves the slide-template option list for the Canvas /
// Drive → Design "one-confirm" launch modal.
//
// Both HomeView and ChatComposer host the same launch modal, but they source
// their `InstalledPluginRecord[]` differently:
//   - HomeView: dedicated fetch keyed on `canvasSlideLaunch !== null`.
//   - ChatComposer: piggy-backs on the composer's own `installedPlugins`
//                   state (fetched lazily when the composer engages), which
//                   may be empty at the exact moment a Canvas handoff lands.
//
// Both surfaces need the same behaviour: as soon as the launch modal is
// active, the picker must show every deck-mode plugin that ships one, not
// only the built-in "기본 슬라이드 템플릿" fallback. This hook centralizes
// that:
//   1. Merges any caller-supplied plugin records (e.g. composer's own state).
//    2. When the launch is active, kicks off / awaits the TTL-cached
//     `fetchCanvasSlideTemplatePlugins()` so the picker never renders with
//     just the fallback tile even if the caller hasn't fetched yet.
//   3. Returns the option list already localized + deduped via the existing
//     `canvasSlideTemplateOptions` transform.

import { useEffect, useMemo, useState } from "react";
import type { InstalledPluginRecord } from "@open-design/contracts";
import {
  canvasSlideTemplateOptions,
  fetchCanvasSlideTemplatePlugins,
  type TeamverCanvasSlideTemplateOption,
} from "../canvasSlideLaunch";

interface Options {
  /**
   * Whether the launch flow is currently active. When falsy the hook stays
   * cheap — it never triggers a plugin fetch and simply mirrors any caller
   * plugins it can already see.
   */
  active: boolean;
  /**
   * Caller-supplied plugin records (e.g. ChatComposer.installedPlugins). May
   * be empty; the hook fills the gap by fetching the shared cache.
   */
  callerPlugins?: readonly InstalledPluginRecord[];
  /** Locale used for `localizePluginTitle` when building option labels. */
  locale: string;
}

export function useCanvasSlideLaunchTemplates(
  options: Options,
): TeamverCanvasSlideTemplateOption[] {
  const { active, callerPlugins, locale } = options;
  const [cachedPlugins, setCachedPlugins] = useState<readonly InstalledPluginRecord[]>([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetchCanvasSlideTemplatePlugins().then((plugins) => {
      if (cancelled) return;
      setCachedPlugins(plugins);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  return useMemo(() => {
    // Prefer caller plugins first so a composer / project that has already
    // loaded a page picks up freshly installed deck plugins immediately;
    // fall back to the cached page for the empty-initial-state case. The
    // downstream transform dedupes by plugin id so the merge is safe even
    // when both lists overlap.
    const seen = new Set<string>();
    const merged: InstalledPluginRecord[] = [];
    for (const plugin of callerPlugins ?? []) {
      const id = plugin.id?.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(plugin);
    }
    for (const plugin of cachedPlugins) {
      const id = plugin.id?.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(plugin);
    }
    return canvasSlideTemplateOptions(merged, locale);
  }, [cachedPlugins, callerPlugins, locale]);
}

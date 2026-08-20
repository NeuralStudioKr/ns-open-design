import type { ProjectCoverHtmlBatchResponse } from "@open-design/contracts";

import { buildHtmlCoverSrcDoc } from "./htmlCoverSrcDoc";
import { projectCoverMediaUrl } from "./projectCoverMediaUrl";
import { isTeamverEmbedMode } from "./designApiBase";
import { fetchTeamverDaemon } from "./teamverDaemonHeaders";
import {
  htmlCoverCacheKey,
  peekHtmlCoverCache,
  seedHtmlCoverCache,
} from "./htmlCoverCacheStore";
import {
  peekTeamverProjectPreviewPrefix,
  projectScopedPreviewUrl,
  sanitizePreviewEntryFile,
} from "./teamverProjectPreviewScope";

const BATCH_MAX = 12;

export type WarmHtmlCoverItem = {
  projectId: string;
  file: string;
  /** Matches ProjectCardHtmlCover mode (deckCoverOnly). */
  mode: "deck" | "page";
};

let htmlCoverWarmPending: WarmHtmlCoverItem[] = [];
let htmlCoverWarmInflight: Promise<void> | null = null;

async function drainHtmlCoverWarm(): Promise<void> {
  while (htmlCoverWarmPending.length > 0) {
    const queued = htmlCoverWarmPending;
    htmlCoverWarmPending = [];
    const need: WarmHtmlCoverItem[] = [];
    const seen = new Set<string>();
    for (const item of queued) {
      const id = item.projectId?.trim();
      const file = sanitizePreviewEntryFile(item.file);
      if (!id || !file || seen.has(id)) continue;
      seen.add(id);
      const rawUrl = projectCoverMediaUrl(id, file);
      const key = htmlCoverCacheKey(item.mode, rawUrl);
      if (peekHtmlCoverCache(key)) continue;
      need.push({ projectId: id, file, mode: item.mode });
      if (need.length >= BATCH_MAX) break;
    }
    if (need.length === 0) continue;

    try {
      const resp = await fetchTeamverDaemon("/api/projects/cover-html-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: need.map(({ projectId, file }) => ({ projectId, file })),
        }),
      });
      if (!resp.ok) continue;
      let body: ProjectCoverHtmlBatchResponse;
      try {
        body = (await resp.json()) as ProjectCoverHtmlBatchResponse;
      } catch {
        continue;
      }

      const modeById = new Map(need.map((row) => [row.projectId, row.mode]));
      for (const row of body.results ?? []) {
        if (!row || row.ok !== true || !row.html?.trim()) continue;
        const mode = modeById.get(row.projectId) ?? "page";
        const file = sanitizePreviewEntryFile(row.file) ?? row.file;
        const rawUrl = projectCoverMediaUrl(row.projectId, file);
        const prefix = peekTeamverProjectPreviewPrefix(row.projectId);
        const baseHref = prefix
          ? projectScopedPreviewUrl(prefix, file)
          : rawUrl;
        // Batch HTML is first-slide isolated on the daemon — always use deck
        // preview CSS so page-mode multi-slide decks match /raw fallback (N08).
        const srcDoc = buildHtmlCoverSrcDoc(row.html, baseHref, { preferDeck: true });
        seedHtmlCoverCache(htmlCoverCacheKey(mode, rawUrl), srcDoc);
      }
    } catch {
      // Soft-fail — cards fall back to per-card /raw.
    }
  }
}

/**
 * Warm HTML card srcDoc cache with one POST (home Recent).
 * Requires preview prefixes already warmed (0806-N06) for scoped `<base href>`.
 * Concurrent callers coalesce onto one in-flight drain (N05 ×1 baseline).
 */
export async function warmTeamverHtmlCoverCache(
  items: readonly WarmHtmlCoverItem[],
): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  if (items.length === 0) return;
  htmlCoverWarmPending.push(...items);
  if (!htmlCoverWarmInflight) {
    htmlCoverWarmInflight = drainHtmlCoverWarm().finally(() => {
      htmlCoverWarmInflight = null;
    });
  }
  await htmlCoverWarmInflight;
}

/** @internal vitest */
export function __resetWarmTeamverHtmlCoverCacheForTests(): void {
  htmlCoverWarmPending = [];
  htmlCoverWarmInflight = null;
}

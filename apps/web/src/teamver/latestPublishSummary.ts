import { isTeamverEmbedMode, resolveTeamverDriveAssetUrl } from "./designApiBase";
import { batchFetchLatestPublishSummaries } from "./batchLatestPublishSummary";
import { listTeamverProjectOutputs } from "./listProjectOutputs";
import { PUBLISH_CHIP_BATCH_MAX } from "./publishChipLimits";
import { sortReadyPublishOutputsDesc } from "./publishToDrive";
import { isTeamverEmbedDesignSurfaceEnabled } from "./teamverDesignAccess";

export type TeamverLatestPublishSummary = {
  projectId: string;
  version: number;
  kind: string;
  driveUrl: string;
  filename: string;
};

const cache = new Map<string, Promise<TeamverLatestPublishSummary | null>>();
const pendingBatchIds = new Set<string>();
let activeBatch: Promise<void> | null = null;
let batchGeneration = 0;

export function clearLatestPublishSummaryCache(projectId?: string): void {
  batchGeneration += 1;
  if (projectId?.trim()) {
    cache.delete(projectId.trim());
    pendingBatchIds.delete(projectId.trim());
    return;
  }
  cache.clear();
  pendingBatchIds.clear();
  activeBatch = null;
}

function summaryFromOutputs(
  projectId: string,
  outputs: Parameters<typeof sortReadyPublishOutputsDesc>[0],
): TeamverLatestPublishSummary | null {
  const ready = sortReadyPublishOutputsDesc(outputs);
  const latest = ready[0];
  if (!latest || !latest.driveAssetId.trim()) return null;
  return {
    projectId,
    version: ready.length,
    kind: latest.kind,
    driveUrl: resolveTeamverDriveAssetUrl(latest.driveAssetId),
    filename: latest.filename,
  };
}

async function drainPublishSummaryBatch(expectedGeneration: number): Promise<void> {
  while (pendingBatchIds.size > 0) {
    if (expectedGeneration !== batchGeneration) return;

    const missing = [...pendingBatchIds]
      .filter((id) => !cache.has(id))
      .slice(0, PUBLISH_CHIP_BATCH_MAX);
    for (const id of missing) {
      pendingBatchIds.delete(id);
    }
    if (missing.length === 0) {
      pendingBatchIds.clear();
      continue;
    }

    const batchResult = await batchFetchLatestPublishSummaries(missing);
    if (expectedGeneration !== batchGeneration) return;

    if (batchResult.status !== "ok") {
      // BFF/workspace not ready or transient HTTP error — leave uncached for per-project fallback.
      return;
    }

    for (const id of missing) {
      if (cache.has(id)) continue;
      cache.set(id, Promise.resolve(batchResult.summaries[id] ?? null));
    }
  }
}

async function ensurePublishSummaryBatch(): Promise<void> {
  const generation = batchGeneration;
  if (!activeBatch) {
    activeBatch = drainPublishSummaryBatch(generation).finally(() => {
      activeBatch = null;
    });
  }
  await activeBatch;
}

/** Warm chip cache for project cards — one batch API call instead of N `/outputs`. */
export async function prefetchLatestPublishSummaries(projectIds: string[]): Promise<void> {
  if (!isTeamverEmbedMode()) return;

  for (const raw of projectIds) {
    const id = raw.trim();
    if (!id || cache.has(id)) continue;
    pendingBatchIds.add(id);
  }
  if (pendingBatchIds.size === 0) return;
  await ensurePublishSummaryBatch();
}

/** Latest ready Drive publish for a project (session-cached). */
export async function fetchLatestPublishSummary(
  projectId: string,
): Promise<TeamverLatestPublishSummary | null> {
  const id = projectId.trim();
  if (!id) return null;
  if (isTeamverEmbedMode() && !isTeamverEmbedDesignSurfaceEnabled()) {
    return null;
  }

  const existing = cache.get(id);
  if (existing) return existing;

  if (isTeamverEmbedMode()) {
    pendingBatchIds.add(id);
    await ensurePublishSummaryBatch();
    if (cache.has(id)) {
      return cache.get(id)!;
    }
  }

  const run = (async () => {
    const result = await listTeamverProjectOutputs(id);
    if (!result) return null;
    return summaryFromOutputs(id, result.outputs);
  })();

  cache.set(id, run);
  return run;
}

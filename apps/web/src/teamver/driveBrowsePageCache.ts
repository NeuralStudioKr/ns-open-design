import type { TeamverDriveImportAssetRow, TeamverDriveImportListRow } from "./driveImportList";
import type { TeamverDrivePublishTarget } from "./drivePublishTargets";
import type { TeamverDrivePublishRecentAsset } from "./drivePublishRecentAssets";

export type TeamverDriveBrowsePageCacheEntry = {
  /** Raw import list rows (folder + asset). Preferred when present for Import modal reuse. */
  rows?: TeamverDriveImportListRow[];
  targets: TeamverDrivePublishTarget[];
  assets: TeamverDriveImportAssetRow[];
  recentAssets: TeamverDrivePublishRecentAsset[];
  hasMore: boolean;
  nextCursor: string | null;
};

const BROWSE_PAGE_CACHE_MS = 60_000;
const browsePageCache = new Map<string, { entry: TeamverDriveBrowsePageCacheEntry; at: number }>();
const browsePageInflight = new Map<string, Promise<TeamverDriveBrowsePageCacheEntry>>();

export function getTeamverDriveBrowsePageCached(
  cacheKey: string,
): TeamverDriveBrowsePageCacheEntry | null {
  const cached = browsePageCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.at >= BROWSE_PAGE_CACHE_MS) {
    browsePageCache.delete(cacheKey);
    return null;
  }
  return cached.entry;
}

export function setTeamverDriveBrowsePageCached(
  cacheKey: string,
  entry: TeamverDriveBrowsePageCacheEntry,
): void {
  browsePageCache.set(cacheKey, { entry, at: Date.now() });
}

/**
 * TTL peek, else single-flight the loader so Import + Picker (or double refresh)
 * do not stampede the same workspace/scope/folder list call.
 */
export async function loadTeamverDriveBrowsePageCached(
  cacheKey: string,
  loader: () => Promise<TeamverDriveBrowsePageCacheEntry>,
): Promise<TeamverDriveBrowsePageCacheEntry> {
  const cached = getTeamverDriveBrowsePageCached(cacheKey);
  if (cached) return cached;

  const existing = browsePageInflight.get(cacheKey);
  if (existing) return existing;

  const run = loader()
    .then((entry) => {
      setTeamverDriveBrowsePageCached(cacheKey, entry);
      return entry;
    })
    .finally(() => {
      browsePageInflight.delete(cacheKey);
    });
  browsePageInflight.set(cacheKey, run);
  return run;
}

export function invalidateTeamverDriveBrowsePageCaches(workspaceId?: string | null): void {
  const ws = workspaceId?.trim();
  if (!ws) {
    browsePageCache.clear();
    browsePageInflight.clear();
    return;
  }
  for (const key of [...browsePageCache.keys()]) {
    if (key.startsWith(`${ws}:`) || key.startsWith(`${ws.trim()}:`)) {
      browsePageCache.delete(key);
    }
  }
  for (const key of [...browsePageInflight.keys()]) {
    if (key.startsWith(`${ws}:`) || key.startsWith(`${ws.trim()}:`)) {
      browsePageInflight.delete(key);
    }
  }
}

/** @internal vitest */
export function resetTeamverDriveBrowsePageCachesForTests(): void {
  browsePageCache.clear();
  browsePageInflight.clear();
}

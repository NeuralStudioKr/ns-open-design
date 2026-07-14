import type { TeamverDriveImportAssetRow } from "./driveImportList";
import type { TeamverDrivePublishTarget } from "./drivePublishTargets";
import type { TeamverDrivePublishRecentAsset } from "./drivePublishRecentAssets";

export type TeamverDriveBrowsePageCacheEntry = {
  targets: TeamverDrivePublishTarget[];
  assets: TeamverDriveImportAssetRow[];
  recentAssets: TeamverDrivePublishRecentAsset[];
  hasMore: boolean;
  nextCursor: string | null;
};

const BROWSE_PAGE_CACHE_MS = 60_000;
const browsePageCache = new Map<string, { entry: TeamverDriveBrowsePageCacheEntry; at: number }>();

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

export function invalidateTeamverDriveBrowsePageCaches(workspaceId?: string | null): void {
  const ws = workspaceId?.trim();
  if (!ws) {
    browsePageCache.clear();
    return;
  }
  for (const key of [...browsePageCache.keys()]) {
    if (key.startsWith(`${ws}:`) || key.startsWith(`${ws.trim()}:`)) {
      browsePageCache.delete(key);
    }
  }
}

/** @internal vitest */
export function resetTeamverDriveBrowsePageCachesForTests(): void {
  browsePageCache.clear();
}

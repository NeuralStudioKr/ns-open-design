import { getTeamverDriveJson } from "./driveApi";

const HOME_RECENT_CACHE_MS = 60_000;

type HomeRecentCacheEntry = {
  raw: unknown;
  at: number;
};

const homeRecentCache = new Map<string, HomeRecentCacheEntry>();
const homeRecentInflight = new Map<string, Promise<unknown>>();

function cacheKey(workspaceId: string, include: string): string {
  return `${workspaceId.trim()}::${include}`;
}

/** Shared `/api/v2/drive/home/recent` fetch with short TTL + inflight dedupe. */
export async function fetchTeamverDriveHomeRecentRaw(
  workspaceId: string,
  options: { limit?: number; include?: string } = {},
): Promise<unknown> {
  const ws = workspaceId.trim();
  if (!ws) return { assets: [], sharedWithMe: [] };

  const requested = Math.max(1, Math.min(options.limit ?? 16, 48));
  // Always pull a fixed upstream page so import/publish surfaces share one cache entry.
  const fetchLimit = Math.max(requested, 24);
  const include = (options.include ?? "assets,shared_with_me").trim() || "assets,shared_with_me";
  const key = cacheKey(ws, include);

  const cached = homeRecentCache.get(key);
  if (cached && Date.now() - cached.at < HOME_RECENT_CACHE_MS) return cached.raw;

  const inflight = homeRecentInflight.get(key);
  if (inflight) return inflight;

  const query = new URLSearchParams();
  query.set("limit", String(fetchLimit));
  query.set("include", include);

  const promise = getTeamverDriveJson(`/api/v2/drive/home/recent?${query.toString()}`, ws)
    .then((raw) => {
      homeRecentCache.set(key, { raw, at: Date.now() });
      return raw;
    })
    .finally(() => {
      homeRecentInflight.delete(key);
    });

  homeRecentInflight.set(key, promise);
  return promise;
}

export function invalidateTeamverDriveHomeRecentCaches(workspaceId?: string | null): void {
  const ws = workspaceId?.trim();
  if (!ws) {
    homeRecentCache.clear();
    homeRecentInflight.clear();
    return;
  }
  for (const key of [...homeRecentCache.keys()]) {
    if (key.startsWith(`${ws}::`)) homeRecentCache.delete(key);
  }
  for (const key of [...homeRecentInflight.keys()]) {
    if (key.startsWith(`${ws}::`)) homeRecentInflight.delete(key);
  }
}

import { isDriveImageAsset } from "./driveFileVisual";
import { postTeamverDriveJson } from "./driveApi";

export type DriveImportThumbnailRequest = {
  assetId: string;
  name: string;
  mimeType?: string;
  sharedDriveId?: string | null;
};

const MAX_THUMBNAIL_BATCH = 24;
const THUMB_CACHE_MAX = 120;

const thumbUrlCache = new Map<string, string>();

function thumbCacheKey(workspaceId: string, assetId: string): string {
  return `${workspaceId.trim()}:${assetId.trim()}`;
}

function rememberThumb(key: string, url: string): void {
  if (thumbUrlCache.has(key)) thumbUrlCache.delete(key);
  thumbUrlCache.set(key, url);
  while (thumbUrlCache.size > THUMB_CACHE_MAX) {
    const oldest = thumbUrlCache.keys().next().value;
    if (oldest == null) break;
    thumbUrlCache.delete(oldest);
  }
}

export function peekTeamverDriveImportThumbnail(
  workspaceId: string,
  assetId: string,
): string | undefined {
  return thumbUrlCache.get(thumbCacheKey(workspaceId, assetId));
}

export function invalidateTeamverDriveImportThumbnails(workspaceId?: string | null): void {
  const ws = workspaceId?.trim();
  if (!ws) {
    thumbUrlCache.clear();
    return;
  }
  for (const key of [...thumbUrlCache.keys()]) {
    if (key.startsWith(`${ws}:`)) thumbUrlCache.delete(key);
  }
}

export async function fetchTeamverDriveImportThumbnails(params: {
  workspaceId: string;
  items: DriveImportThumbnailRequest[];
}): Promise<Map<string, string>> {
  const workspaceId = params.workspaceId.trim();
  if (!workspaceId || params.items.length === 0) return new Map();

  const unique = new Map<string, DriveImportThumbnailRequest>();
  for (const item of params.items) {
    const assetId = item.assetId.trim();
    if (!assetId || unique.has(assetId)) continue;
    if (!isDriveImageAsset(item.name, item.mimeType)) continue;
    unique.set(assetId, {
      assetId,
      name: item.name,
      mimeType: item.mimeType,
      sharedDriveId: item.sharedDriveId ?? null,
    });
  }

  const out = new Map<string, string>();
  const missing: DriveImportThumbnailRequest[] = [];
  for (const item of unique.values()) {
    const cached = thumbUrlCache.get(thumbCacheKey(workspaceId, item.assetId));
    if (cached) out.set(item.assetId, cached);
    else missing.push(item);
  }

  const batch = missing.slice(0, MAX_THUMBNAIL_BATCH);
  if (batch.length === 0) return out;

  try {
    const raw = (await postTeamverDriveJson(
      "/api/v2/asset/object-url/batch",
      {
        items: batch.map((item) => ({
          asset_id: item.assetId,
          shared_drive_id: item.sharedDriveId ?? null,
        })),
      },
      workspaceId,
    )) as {
      items?: Array<{ assetId?: string; objectUrl?: string; error?: string }>;
    };

    for (const item of raw.items ?? []) {
      const assetId = item.assetId?.trim();
      const url = item.objectUrl?.trim();
      if (assetId && url && !item.error) {
        rememberThumb(thumbCacheKey(workspaceId, assetId), url);
        out.set(assetId, url);
      }
    }
    return out;
  } catch {
    return out;
  }
}

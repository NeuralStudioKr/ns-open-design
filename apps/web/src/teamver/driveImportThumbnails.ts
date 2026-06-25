import { isDriveImageAsset } from "./driveFileVisual";
import { postTeamverDriveJson } from "./driveApi";

export type DriveImportThumbnailRequest = {
  assetId: string;
  name: string;
  mimeType?: string;
  sharedDriveId?: string | null;
};

const MAX_THUMBNAIL_BATCH = 24;

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

  const batch = [...unique.values()].slice(0, MAX_THUMBNAIL_BATCH);
  if (batch.length === 0) return new Map();

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

    const out = new Map<string, string>();
    for (const item of raw.items ?? []) {
      const assetId = item.assetId?.trim();
      const url = item.objectUrl?.trim();
      if (assetId && url && !item.error) out.set(assetId, url);
    }
    return out;
  } catch {
    return new Map();
  }
}

import { snakeToCamelDeep } from "@teamver/app-sdk";
import { resolveTeamverMainApiBaseUrl } from "./designApiBase";
import { isDriveImageAsset } from "./driveFileVisual";

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

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Workspace-Id": workspaceId,
  };

  const response = await fetch(
    `${resolveTeamverMainApiBaseUrl().replace(/\/+$/, "")}/api/v2/asset/object-url/batch`,
    {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        items: batch.map((item) => ({
          asset_id: item.assetId,
          shared_drive_id: item.sharedDriveId ?? null,
        })),
      }),
    },
  );
  if (!response.ok) return new Map();

  const raw = snakeToCamelDeep(await response.json()) as {
    items?: Array<{ assetId?: string; objectUrl?: string; error?: string }>;
  };

  const out = new Map<string, string>();
  for (const item of raw.items ?? []) {
    const assetId = item.assetId?.trim();
    const url = item.objectUrl?.trim();
    if (assetId && url && !item.error) out.set(assetId, url);
  }
  return out;
}

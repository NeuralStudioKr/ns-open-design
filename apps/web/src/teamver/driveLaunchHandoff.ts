import type { TeamverDriveImportAsset } from "./importDriveAssets";

const ASSET_ID_PARAM = "teamverDriveAssetId";
const ASSET_NAME_PARAM = "teamverDriveAssetName";
const ASSET_MIME_PARAM = "teamverDriveAssetMimeType";
const DRIVE_INTENT_PARAM = "teamverDriveIntent";

/** Matches import modal multi-pick cap. */
export const TEAMVER_DRIVE_LAUNCH_HANDOFF_MAX = 12;

export type TeamverDriveLaunchIntent = "create-slides";

function readParamValues(params: URLSearchParams, key: string): string[] {
  const all = params.getAll(key).map((value) => value.trim()).filter(Boolean);
  if (all.length > 0) return all;
  const single = params.get(key)?.trim();
  return single ? [single] : [];
}

export function readTeamverDriveLaunchHandoffAssets(): TeamverDriveImportAsset[] {
  if (typeof window === "undefined") return [];
  const params = new URLSearchParams(window.location.search);
  const ids = readParamValues(params, ASSET_ID_PARAM);
  const names = readParamValues(params, ASSET_NAME_PARAM);
  const mimes = readParamValues(params, ASSET_MIME_PARAM);
  if (ids.length === 0) return [];

  const assets: TeamverDriveImportAsset[] = [];
  for (let index = 0; index < ids.length && assets.length < TEAMVER_DRIVE_LAUNCH_HANDOFF_MAX; index++) {
    const assetId = ids[index]!;
    const filename = names[index] ?? "";
    if (!assetId || !filename) continue;
    assets.push({
      assetId,
      filename,
      mimeType: mimes[index] || undefined,
    });
  }
  return assets;
}

/** First handoff asset — backward compatible with single-file query params. */
export function readTeamverDriveLaunchHandoff(): TeamverDriveImportAsset | null {
  return readTeamverDriveLaunchHandoffAssets()[0] ?? null;
}

export function readTeamverDriveLaunchIntent(): TeamverDriveLaunchIntent | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(DRIVE_INTENT_PARAM) === "create-slides"
    ? "create-slides"
    : null;
}

export function buildTeamverDriveLaunchHandoffQuery(
  assets: TeamverDriveImportAsset[],
  options?: { intent?: TeamverDriveLaunchIntent },
): string {
  const params = new URLSearchParams();
  for (const asset of assets.slice(0, TEAMVER_DRIVE_LAUNCH_HANDOFF_MAX)) {
    const assetId = asset.assetId.trim();
    const filename = asset.filename?.trim() ?? "";
    if (!assetId || !filename) continue;
    params.append(ASSET_ID_PARAM, assetId);
    params.append(ASSET_NAME_PARAM, filename);
    if (asset.mimeType?.trim()) params.append(ASSET_MIME_PARAM, asset.mimeType.trim());
  }
  if (options?.intent) params.set(DRIVE_INTENT_PARAM, options.intent);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function consumeTeamverDriveLaunchHandoff(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete(ASSET_ID_PARAM);
  url.searchParams.delete(ASSET_NAME_PARAM);
  url.searchParams.delete(ASSET_MIME_PARAM);
  url.searchParams.delete(DRIVE_INTENT_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

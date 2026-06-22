import type { TeamverDriveImportAsset } from "./importDriveAssets";

const ASSET_ID_PARAM = "teamverDriveAssetId";
const ASSET_NAME_PARAM = "teamverDriveAssetName";
const ASSET_MIME_PARAM = "teamverDriveAssetMimeType";
const DRIVE_INTENT_PARAM = "teamverDriveIntent";

export type TeamverDriveLaunchIntent = "create-slides";

export function readTeamverDriveLaunchHandoff(): TeamverDriveImportAsset | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const assetId = params.get(ASSET_ID_PARAM)?.trim() ?? "";
  const filename = params.get(ASSET_NAME_PARAM)?.trim() ?? "";
  if (!assetId || !filename) return null;
  const mimeType = params.get(ASSET_MIME_PARAM)?.trim() || undefined;
  return { assetId, filename, mimeType };
}

export function readTeamverDriveLaunchIntent(): TeamverDriveLaunchIntent | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(DRIVE_INTENT_PARAM) === "create-slides"
    ? "create-slides"
    : null;
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

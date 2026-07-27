import type { ChatAttachment } from "@open-design/contracts";
import type { TeamverDriveImportAsset } from "./importDriveAssets";

/** Drive asset IDs already present in composer/home staging (avoid duplicate import picks). */
export function teamverDriveAssetIdsFromChatAttachments(
  attachments: readonly ChatAttachment[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of attachments) {
    const source = item.source;
    if (source?.type !== "teamver-drive") continue;
    const assetId = source.assetId?.trim();
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    ids.push(assetId);
  }
  return ids;
}

export function teamverDriveAssetIdsFromImportAssets(
  assets: readonly TeamverDriveImportAsset[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const asset of assets) {
    const assetId = asset.assetId?.trim();
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    ids.push(assetId);
  }
  return ids;
}

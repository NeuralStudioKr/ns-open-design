import { fetchTeamverDriveHomeRecentRaw } from "./driveHomeRecentCache";

export type TeamverDrivePublishRecentAsset = {
  assetId: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  folderId: string;
  sharedDriveId: string | null;
};

/** Drive home `/recent` personal assets for publish picker thumbnail grid (Phase 1-2c). */
export async function listTeamverDrivePublishRecentAssets(
  workspaceId: string,
  options: { limit?: number } = {},
): Promise<TeamverDrivePublishRecentAsset[]> {
  const ws = workspaceId.trim();
  if (!ws) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 16, 24));
  // Prefer the richer shared cache key so picker assets + home-recent locations
  // collapse to one upstream `/home/recent` when both surfaces open together.
  const raw = await fetchTeamverDriveHomeRecentRaw(ws, {
    limit,
    include: "assets,shared_with_me",
  });
  const assets = Array.isArray((raw as { assets?: unknown[] })?.assets)
    ? (raw as { assets: unknown[] }).assets
    : [];
  const rows: TeamverDrivePublishRecentAsset[] = [];
  const seen = new Set<string>();

  for (const item of assets) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const assetId = String(row.assetId ?? "").trim();
    const name = String(row.name ?? "").trim();
    const folderId = String(row.folderId ?? "").trim();
    if (!assetId || !name || !folderId) continue;
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    const sharedDriveId = String(row.sharedDriveId ?? "").trim() || null;
    if (sharedDriveId) continue;
    const mimeType =
      typeof row.type === "string" && row.type.trim()
        ? row.type.trim()
        : typeof row.mimeType === "string"
          ? row.mimeType
          : undefined;
    const sizeBytes = typeof row.sizeBytes === "number" ? row.sizeBytes : undefined;
    rows.push({
      assetId,
      name,
      mimeType,
      sizeBytes,
      folderId,
      sharedDriveId,
    });
  }

  return rows.slice(0, limit);
}

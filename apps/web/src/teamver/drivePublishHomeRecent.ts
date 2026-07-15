import { fetchTeamverDriveHomeRecentRaw } from "./driveHomeRecentCache";
import type { TeamverDrivePublishTarget } from "./drivePublishTargets";

function publishTargetKey(target: TeamverDrivePublishTarget): string {
  return `${target.sharedDriveId ?? "personal"}:${target.folderId ?? "root"}`;
}

/** Drive home `/recent` → publish folder quick picks (loop 359 · S-2 step 7b). */
export async function listTeamverDrivePublishHomeRecentTargets(
  workspaceId: string,
  options: { limit?: number } = {},
): Promise<TeamverDrivePublishTarget[]> {
  const ws = workspaceId.trim();
  if (!ws) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 12, 24));
  const raw = await fetchTeamverDriveHomeRecentRaw(ws, {
    limit,
    include: "assets,shared_with_me",
  });
  const targets: TeamverDrivePublishTarget[] = [];
  const seen = new Set<string>();

  function push(target: TeamverDrivePublishTarget): void {
    const key = publishTargetKey(target);
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(target);
  }

  const sharedWithMe = Array.isArray((raw as { sharedWithMe?: unknown[] })?.sharedWithMe)
    ? (raw as { sharedWithMe: unknown[] }).sharedWithMe
    : [];
  for (const item of sharedWithMe) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const sharedDriveId = String(row.sharedDriveId ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (!sharedDriveId || !name) continue;
    push({
      id: `shared:${sharedDriveId}`,
      label: name,
      description: "공유된 팀 드라이브",
      folderId: null,
      sharedDriveId,
    });
  }

  const assets = Array.isArray((raw as { assets?: unknown[] })?.assets)
    ? (raw as { assets: unknown[] }).assets
    : [];
  for (const item of assets) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const folderId = String(row.folderId ?? "").trim();
    if (!folderId) continue;
    const sharedDriveId = String(row.sharedDriveId ?? "").trim() || null;
    const driveLabel = String(row.sharedDriveName ?? "").trim()
      || (sharedDriveId ? "팀 드라이브" : "내 드라이브");
    const assetName = String(row.name ?? "").trim() || "파일";
    push({
      id: sharedDriveId ? `shared:${sharedDriveId}:${folderId}` : `personal:${folderId}`,
      label: driveLabel,
      description: `최근: ${assetName}`,
      folderId,
      sharedDriveId,
    });
  }

  return targets.slice(0, limit);
}

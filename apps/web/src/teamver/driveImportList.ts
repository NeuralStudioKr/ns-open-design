import { extractTeamverDriveItems, getTeamverDriveJson } from "./driveApi";

export type TeamverDriveImportPick = {
  assetId: string;
  name: string;
  mimeType?: string;
  sharedDriveId?: string | null;
};

export type TeamverDriveImportFolderRow = {
  kind: "folder";
  folderId: string;
  name: string;
  sharedDriveId?: string | null;
};

export type TeamverDriveImportAssetRow = {
  kind: "asset";
  assetId: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  sharedDriveId?: string | null;
};

export type TeamverDriveImportListRow = TeamverDriveImportFolderRow | TeamverDriveImportAssetRow;

export const TEAMVER_DRIVE_IMPORT_SEARCH_MIN = 2;

export type TeamverDriveImportScope =
  | { mode: "personal"; folderId: string | null; label: string }
  | { mode: "shared"; sharedDriveId: string; folderId: string | null; label: string };

/** Keep browse/recent rows scoped to the active personal vs shared-drive tab. */
export function importRowMatchesScope(
  row: TeamverDriveImportListRow,
  scope: TeamverDriveImportScope,
): boolean {
  if (scope.mode === "personal") return !row.sharedDriveId;
  return row.sharedDriveId === scope.sharedDriveId;
}

function extractListItems(raw: unknown): unknown[] {
  return extractTeamverDriveItems(raw);
}

function normalizeFolderRow(raw: Record<string, unknown>, sharedDriveId?: string | null): TeamverDriveImportFolderRow | null {
  const folderId = String(raw.folderId ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!folderId || !name) return null;
  return {
    kind: "folder",
    folderId,
    name,
    sharedDriveId: sharedDriveId ?? (typeof raw.sharedDriveId === "string" ? raw.sharedDriveId : null),
  };
}

function normalizeAssetRow(raw: Record<string, unknown>, sharedDriveId?: string | null): TeamverDriveImportAssetRow | null {
  const assetId = String(raw.assetId ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!assetId || !name) return null;
  const mimeType = typeof raw.type === "string" && raw.type.trim()
    ? raw.type.trim()
    : typeof raw.mimeType === "string"
      ? raw.mimeType
      : undefined;
  const sizeBytes = typeof raw.sizeBytes === "number" ? raw.sizeBytes : undefined;
  return {
    kind: "asset",
    assetId,
    name,
    mimeType,
    sizeBytes,
    sharedDriveId: sharedDriveId ?? (typeof raw.sharedDriveId === "string" ? raw.sharedDriveId : null),
  };
}

function normalizeListRow(raw: unknown, sharedDriveId?: string | null): TeamverDriveImportListRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if ("assetId" in row && row.assetId) {
    return normalizeAssetRow(row, sharedDriveId);
  }
  if ("folderId" in row && row.folderId) {
    return normalizeFolderRow(row, sharedDriveId);
  }
  return null;
}

export async function listTeamverDriveImportRows(params: {
  workspaceId: string;
  folderId?: string | null;
  sharedDriveId?: string | null;
  search?: string;
  limit?: number;
}): Promise<TeamverDriveImportListRow[]> {
  const workspaceId = params.workspaceId.trim();
  if (!workspaceId) return [];

  const query = new URLSearchParams();
  if (params.folderId) query.set("folder_id", params.folderId);
  if (params.sharedDriveId) query.set("shared_drive_id", params.sharedDriveId);
  const search = params.search?.trim();
  if (search) query.set("search", search);
  query.set("limit", String(Math.max(1, Math.min(params.limit ?? 80, 120))));

  const raw = await getTeamverDriveJson(`/api/drive/list?${query.toString()}`, workspaceId);
  const sharedDriveId = params.sharedDriveId ?? null;
  const rows: TeamverDriveImportListRow[] = [];
  for (const item of extractListItems(raw)) {
    const normalized = normalizeListRow(item, sharedDriveId);
    if (normalized) rows.push(normalized);
  }
  return rows;
}

export async function listTeamverDriveImportScopes(workspaceId: string): Promise<TeamverDriveImportScope[]> {
  const trimmed = workspaceId.trim();
  if (!trimmed) return [];

  const scopes: TeamverDriveImportScope[] = [
    { mode: "personal", folderId: null, label: "내 드라이브" },
  ];

  try {
    const raw = await getTeamverDriveJson("/api/v2/shared-drive", trimmed);
    const drives = extractListItems(raw);
    for (const drive of drives) {
      if (!drive || typeof drive !== "object") continue;
      const obj = drive as Record<string, unknown>;
      const id = String(obj.id ?? "").trim();
      const name = String(obj.name ?? "").trim();
      const status = String(obj.status ?? "").toLowerCase();
      if (!id || !name) continue;
      if (status && status !== "active") continue;
      scopes.push({
        mode: "shared",
        sharedDriveId: id,
        folderId: null,
        label: name,
      });
    }
  } catch {
    // shared drives optional
  }

  return scopes;
}

function normalizeSearchHit(raw: unknown, sharedDriveId?: string | null): TeamverDriveImportListRow | null {
  if (!raw || typeof raw !== "object") return null;
  const hit = raw as Record<string, unknown>;
  const hitType = String(hit.hitType ?? "").trim().toLowerCase();
  if (hitType === "folder") {
    return normalizeFolderRow(
      {
        folderId: hit.folderId,
        name: hit.name,
        sharedDriveId: hit.sharedDriveId,
      },
      sharedDriveId,
    );
  }
  if (hitType === "asset") {
    return normalizeAssetRow(
      {
        assetId: hit.assetId,
        name: hit.name,
        type: hit.kind,
        sharedDriveId: hit.sharedDriveId,
      },
      sharedDriveId,
    );
  }
  return normalizeListRow(hit, sharedDriveId);
}

function normalizeRecentAsset(raw: unknown): TeamverDriveImportAssetRow | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  return normalizeAssetRow(
    {
      assetId: item.assetId,
      name: item.name,
      type: item.kind,
      sizeBytes: item.sizeBytes,
      sharedDriveId: item.sharedDriveId,
    },
    typeof item.sharedDriveId === "string" ? item.sharedDriveId : null,
  );
}

function dedupeImportRows(rows: TeamverDriveImportListRow[]): TeamverDriveImportListRow[] {
  const seen = new Set<string>();
  const out: TeamverDriveImportListRow[] = [];
  for (const row of rows) {
    const key = row.kind === "folder" ? `folder:${row.folderId}` : `asset:${row.assetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export async function listTeamverDriveImportRecent(params: {
  workspaceId: string;
  limit?: number;
}): Promise<TeamverDriveImportAssetRow[]> {
  const workspaceId = params.workspaceId.trim();
  if (!workspaceId) return [];

  const query = new URLSearchParams();
  query.set("limit", String(Math.max(1, Math.min(params.limit ?? 24, 48))));
  query.set("include", "assets");

  const raw = await getTeamverDriveJson(`/api/v2/drive/home/recent?${query.toString()}`, workspaceId);
  const assets = Array.isArray((raw as { assets?: unknown[] })?.assets)
    ? (raw as { assets: unknown[] }).assets
    : extractListItems(raw);
  const rows: TeamverDriveImportAssetRow[] = [];
  for (const item of assets) {
    const normalized = normalizeRecentAsset(item);
    if (normalized) rows.push(normalized);
  }
  return rows;
}

export async function searchTeamverDriveImportRows(params: {
  workspaceId: string;
  query: string;
  sharedDriveId?: string | null;
  limit?: number;
}): Promise<TeamverDriveImportListRow[]> {
  const workspaceId = params.workspaceId.trim();
  const trimmed = params.query.trim();
  if (!workspaceId || trimmed.length < TEAMVER_DRIVE_IMPORT_SEARCH_MIN) return [];

  const limit = Math.max(1, Math.min(params.limit ?? 80, 120));
  const sharedDriveId = params.sharedDriveId ?? null;
  const listQuery = new URLSearchParams();
  listQuery.set("search", trimmed);
  listQuery.set("limit", String(limit));
  if (sharedDriveId) listQuery.set("shared_drive_id", sharedDriveId);

  const v2Query = new URLSearchParams();
  v2Query.set("q", trimmed);
  v2Query.set("limit", String(limit));
  if (sharedDriveId) v2Query.set("shared_drive_id", sharedDriveId);

  const [v2Settled, listSettled] = await Promise.allSettled([
    getTeamverDriveJson(`/api/v2/drive/home/search?${v2Query.toString()}`, workspaceId),
    getTeamverDriveJson(`/api/drive/list?${listQuery.toString()}`, workspaceId),
  ]);

  const merged: TeamverDriveImportListRow[] = [];
  if (v2Settled.status === "fulfilled") {
    const hits = Array.isArray((v2Settled.value as { hits?: unknown[] })?.hits)
      ? (v2Settled.value as { hits: unknown[] }).hits
      : extractListItems(v2Settled.value);
    for (const hit of hits) {
      const normalized = normalizeSearchHit(hit, sharedDriveId);
      if (normalized) merged.push(normalized);
    }
  }
  if (listSettled.status === "fulfilled") {
    for (const item of extractListItems(listSettled.value)) {
      const normalized = normalizeListRow(item, sharedDriveId);
      if (normalized) merged.push(normalized);
    }
  }

  return dedupeImportRows(merged).slice(0, limit);
}

import { extractTeamverDriveItems, getTeamverDriveJson } from "./driveApi";
import {
  fetchTeamverDriveHomeRecentRaw,
  invalidateTeamverDriveHomeRecentCaches,
} from "./driveHomeRecentCache";
import { invalidateTeamverDriveBrowsePageCaches } from "./driveBrowsePageCache";
import { invalidateTeamverDriveImportThumbnails } from "./driveImportThumbnails";

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
  folderType?: string | null;
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

export const TEAMVER_DRIVE_IMPORT_BROWSE_PAGE_SIZE = 24;

export type TeamverDriveImportScope =
  | { mode: "personal"; folderId: string | null; label: string }
  | { mode: "shared"; sharedDriveId: string; folderId: string | null; label: string };

export type TeamverDriveImportBrowsePage = {
  rows: TeamverDriveImportListRow[];
  hasMore: boolean;
  nextCursor: string | null;
};

const ALL_FILES_FOLDER_NAMES = [
  "전체 파일",
  "전체파일",
  "All files",
  "All Files",
  "すべてのファイル",
];

type RawFolderTree = {
  items?: RawFolder[];
  rootFolderId?: string | null;
  data?: RawFolderTree;
};

type RawFolder = {
  folderId?: string | null;
  folderType?: string | null;
};

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

function extractListPage(raw: unknown): {
  items: unknown[];
  hasMore: boolean;
  nextCursor: string | null;
} {
  const items = extractListItems(raw);
  if (!raw || typeof raw !== "object") {
    return { items, hasMore: false, nextCursor: null };
  }
  const meta = (raw as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object") {
    return { items, hasMore: false, nextCursor: null };
  }
  const record = meta as Record<string, unknown>;
  const nextCursor =
    typeof record.nextCursor === "string" && record.nextCursor.trim()
      ? record.nextCursor.trim()
      : null;
  return {
    items,
    hasMore: Boolean(record.hasMore) || nextCursor != null,
    nextCursor,
  };
}

function normalizeImportRootFolderId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as RawFolderTree;
  const direct = body.rootFolderId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (body.data) return normalizeImportRootFolderId(body.data);
  return null;
}

function normalizeFolderRow(
  raw: Record<string, unknown>,
  sharedDriveId?: string | null,
): TeamverDriveImportFolderRow | null {
  const folderId = String(raw.folderId ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!folderId || !name) return null;
  const folderType =
    typeof raw.folderType === "string" && raw.folderType.trim()
      ? raw.folderType.trim()
      : null;
  return {
    kind: "folder",
    folderId,
    name,
    folderType,
    sharedDriveId: sharedDriveId ?? (typeof raw.sharedDriveId === "string" ? raw.sharedDriveId : null),
  };
}

function normalizeAssetRow(
  raw: Record<string, unknown>,
  sharedDriveId?: string | null,
): TeamverDriveImportAssetRow | null {
  const assetId = String(raw.assetId ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!assetId || !name) return null;
  const mimeType =
    typeof raw.type === "string" && raw.type.trim()
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

function isAllFilesFolderRow(row: TeamverDriveImportFolderRow): boolean {
  const folderType = (row.folderType ?? "").toUpperCase();
  if (folderType === "ALL_FILES" || folderType === "ALL") return true;
  const name = row.name.trim();
  return ALL_FILES_FOLDER_NAMES.some((label) => label.toLowerCase() === name.toLowerCase());
}

/**
 * Align with ns-teamver-fe-v2 `filterDrivePickerListItems` — strip ROOT / ALL_FILES
 * shell rows so browse matches Main Drive import modal rather than a flat mixed list.
 */
export function filterTeamverDriveImportListRows(
  rows: TeamverDriveImportListRow[],
  options: {
    rootFolderId: string | null;
    sharedDriveId: string | null;
    atScopeRoot: boolean;
  },
): TeamverDriveImportListRow[] {
  const { rootFolderId, sharedDriveId, atScopeRoot } = options;
  const isPersonalDrive = !sharedDriveId;

  let base = rows.filter((row) => {
    if (row.kind !== "folder") return true;
    const folderType = (row.folderType ?? "").toUpperCase();
    if (folderType === "ROOT") return false;
    if (
      rootFolderId &&
      row.folderId === rootFolderId &&
      (row.name === "개인 드라이브" || row.name === "내 드라이브")
    ) {
      return false;
    }
    return true;
  });

  if (atScopeRoot && sharedDriveId && rootFolderId) {
    base = base.filter(
      (row) =>
        !(
          row.kind === "folder" &&
          (row.folderId === rootFolderId || isAllFilesFolderRow(row))
        ),
    );
  }
  if (isPersonalDrive) {
    base = base.filter((row) => !(row.kind === "folder" && isAllFilesFolderRow(row)));
  }
  return base;
}

/** Main FE parity: at scope root use resolved ROOT folder_id, not null (mixed/global list). */
export function resolveTeamverDriveImportListFolderId(
  scope: TeamverDriveImportScope,
  navFolderId: string | null,
): string | null {
  if (navFolderId) return navFolderId;
  return scope.folderId ?? null;
}

export async function listTeamverDriveImportRows(params: {
  workspaceId: string;
  folderId?: string | null;
  sharedDriveId?: string | null;
  search?: string;
  limit?: number;
  before?: string | null;
}): Promise<TeamverDriveImportListRow[]> {
  const page = await fetchTeamverDriveImportListPage(params);
  return page.rows;
}

async function fetchTeamverDriveImportListPage(params: {
  workspaceId: string;
  folderId?: string | null;
  sharedDriveId?: string | null;
  search?: string;
  limit?: number;
  before?: string | null;
}): Promise<TeamverDriveImportBrowsePage> {
  const workspaceId = params.workspaceId.trim();
  if (!workspaceId) return { rows: [], hasMore: false, nextCursor: null };

  const query = new URLSearchParams();
  if (params.folderId) query.set("folder_id", params.folderId);
  if (params.sharedDriveId) query.set("shared_drive_id", params.sharedDriveId);
  const search = params.search?.trim();
  if (search) query.set("search", search);
  if (params.before) query.set("before", params.before);
  query.set("limit", String(Math.max(1, Math.min(params.limit ?? TEAMVER_DRIVE_IMPORT_BROWSE_PAGE_SIZE, 120))));

  const raw = await getTeamverDriveJson(`/api/drive/list?${query.toString()}`, workspaceId);
  const sharedDriveId = params.sharedDriveId ?? null;
  const { items, hasMore, nextCursor } = extractListPage(raw);
  const rows: TeamverDriveImportListRow[] = [];
  for (const item of items) {
    const normalized = normalizeListRow(item, sharedDriveId);
    if (normalized) rows.push(normalized);
  }
  return { rows, hasMore, nextCursor };
}

export async function browseTeamverDriveImportPage(params: {
  workspaceId: string;
  scope: TeamverDriveImportScope;
  navFolderId?: string | null;
  limit?: number;
  before?: string | null;
}): Promise<TeamverDriveImportBrowsePage> {
  const sharedDriveId = params.scope.mode === "shared" ? params.scope.sharedDriveId : null;
  const navFolderId = params.navFolderId ?? null;
  const listFolderId = resolveTeamverDriveImportListFolderId(params.scope, navFolderId);
  const atScopeRoot = navFolderId == null;

  const page = await fetchTeamverDriveImportListPage({
    workspaceId: params.workspaceId,
    folderId: listFolderId,
    sharedDriveId,
    limit: params.limit,
    before: params.before,
  });

  const scoped = page.rows.filter((row) => importRowMatchesScope(row, params.scope));
  const filtered = filterTeamverDriveImportListRows(scoped, {
    rootFolderId: params.scope.folderId ?? null,
    sharedDriveId,
    atScopeRoot,
  });

  return {
    rows: filtered,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  };
}

function rootFolderIdFromSharedDriveListItem(obj: Record<string, unknown>): string | null {
  // Main `GET /api/v2/shared-drive` already returns root_folder_id (camelized by
  // the Drive BFF client). Prefer that — never N-parallel folder-tree calls on
  // modal open just to discover the root id.
  const camel = obj.rootFolderId;
  if (typeof camel === "string" && camel.trim()) return camel.trim();
  const snake = obj.root_folder_id;
  if (typeof snake === "string" && snake.trim()) return snake.trim();
  return null;
}

async function resolveSharedDriveRootFolderId(
  workspaceId: string,
  sharedDriveId: string,
): Promise<string | null> {
  const trimmed = workspaceId.trim();
  const driveId = sharedDriveId.trim();
  if (!trimmed || !driveId) return null;
  const cacheKey = `${trimmed}:${driveId}`;
  const cached = sharedDriveRootCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DRIVE_IMPORT_CACHE_MS) return cached.rootFolderId;
  try {
    const tree = await getTeamverDriveJson(
      `/api/v2/shared-drive/${encodeURIComponent(driveId)}/folder-tree`,
      trimmed,
    );
    const rootFolderId = normalizeImportRootFolderId(tree);
    sharedDriveRootCache.set(cacheKey, { rootFolderId, at: Date.now() });
    return rootFolderId;
  } catch {
    return null;
  }
}

async function fetchImportScopesUncached(workspaceId: string): Promise<TeamverDriveImportScope[]> {
  const trimmed = workspaceId.trim();
  if (!trimmed) return [];

  // Personal shallow + shared list in parallel (independent). Previously shared
  // waited on personal, then fire-hosed folder-tree once per drive.
  const [personalResult, sharedListResult] = await Promise.allSettled([
    getPersonalShallowTreeCached(trimmed),
    getSharedDriveListCached(trimmed),
  ]);

  let personalRootId: string | null = null;
  if (personalResult.status === "fulfilled") {
    personalRootId = normalizeImportRootFolderId(personalResult.value);
  }

  const scopes: TeamverDriveImportScope[] = [
    { mode: "personal", folderId: personalRootId, label: "내 드라이브" },
  ];

  if (sharedListResult.status !== "fulfilled") {
    return scopes;
  }

  try {
    const drives = extractListItems(sharedListResult.value);
    const sharedScopes = await Promise.all(
      drives.map(async (drive) => {
        if (!drive || typeof drive !== "object") return null;
        const obj = drive as Record<string, unknown>;
        const id = String(obj.id ?? "").trim();
        const name = String(obj.name ?? "").trim();
        const status = String(obj.status ?? "").toLowerCase();
        if (!id || !name) return null;
        if (status && status !== "active") return null;
        // List response includes rootFolderId (Main 620736e2). Fall back to
        // folder-tree only for older Main / partial payloads.
        let rootFolderId = rootFolderIdFromSharedDriveListItem(obj);
        if (!rootFolderId) {
          rootFolderId = await resolveSharedDriveRootFolderId(trimmed, id);
        } else {
          sharedDriveRootCache.set(`${trimmed}:${id}`, {
            rootFolderId,
            at: Date.now(),
          });
        }
        return {
          mode: "shared" as const,
          sharedDriveId: id,
          folderId: rootFolderId,
          label: name,
        };
      }),
    );
    for (const scope of sharedScopes) {
      if (scope) scopes.push(scope);
    }
  } catch {
    // shared drives optional
  }

  return scopes;
}

/** Session-scoped Drive import caches — avoids duplicate scope/shallow fetches across publish menu + picker. */
const DRIVE_IMPORT_CACHE_MS = 60_000;
const importScopesCache = new Map<string, { scopes: TeamverDriveImportScope[]; at: number }>();
const importScopesInflight = new Map<string, Promise<TeamverDriveImportScope[]>>();
const personalShallowCache = new Map<string, { raw: unknown; at: number }>();
const personalShallowInflight = new Map<string, Promise<unknown>>();
const sharedDriveListCache = new Map<string, { raw: unknown; at: number }>();
const sharedDriveListInflight = new Map<string, Promise<unknown>>();
const sharedDriveRootCache = new Map<string, { rootFolderId: string | null; at: number }>();

export function invalidateTeamverDriveImportCaches(workspaceId?: string | null): void {
  const ws = workspaceId?.trim();
  if (!ws) {
    importScopesCache.clear();
    importScopesInflight.clear();
    personalShallowCache.clear();
    personalShallowInflight.clear();
    sharedDriveListCache.clear();
    sharedDriveListInflight.clear();
    sharedDriveRootCache.clear();
    invalidateTeamverDriveHomeRecentCaches();
    invalidateTeamverDriveImportThumbnails();
    invalidateTeamverDriveBrowsePageCaches();
    return;
  }
  importScopesCache.delete(ws);
  importScopesInflight.delete(ws);
  personalShallowCache.delete(ws);
  personalShallowInflight.delete(ws);
  sharedDriveListCache.delete(ws);
  sharedDriveListInflight.delete(ws);
  for (const key of sharedDriveRootCache.keys()) {
    if (key.startsWith(`${ws}:`)) sharedDriveRootCache.delete(key);
  }
  invalidateTeamverDriveHomeRecentCaches(ws);
  invalidateTeamverDriveImportThumbnails(ws);
  invalidateTeamverDriveBrowsePageCaches(ws);
}

/** @internal vitest — personal shallow_tree with session cache (shared with scopes + publish quick-pick). */
export async function getPersonalShallowTreeCached(workspaceId: string): Promise<unknown> {
  const trimmed = workspaceId.trim();
  if (!trimmed) throw new Error("teamver_workspace_required");
  const cached = personalShallowCache.get(trimmed);
  if (cached && Date.now() - cached.at < DRIVE_IMPORT_CACHE_MS) return cached.raw;
  const inflight = personalShallowInflight.get(trimmed);
  if (inflight) return inflight;
  const promise = getTeamverDriveJson("/api/drive/folder?shallow_tree=true", trimmed)
    .then((raw) => {
      personalShallowCache.set(trimmed, { raw, at: Date.now() });
      return raw;
    })
    .finally(() => {
      personalShallowInflight.delete(trimmed);
    });
  personalShallowInflight.set(trimmed, promise);
  return promise;
}

async function getSharedDriveListCached(workspaceId: string): Promise<unknown> {
  const trimmed = workspaceId.trim();
  const cached = sharedDriveListCache.get(trimmed);
  if (cached && Date.now() - cached.at < DRIVE_IMPORT_CACHE_MS) return cached.raw;
  const inflight = sharedDriveListInflight.get(trimmed);
  if (inflight) return inflight;
  const promise = getTeamverDriveJson("/api/v2/shared-drive", trimmed)
    .then((raw) => {
      sharedDriveListCache.set(trimmed, { raw, at: Date.now() });
      return raw;
    })
    .finally(() => {
      sharedDriveListInflight.delete(trimmed);
    });
  sharedDriveListInflight.set(trimmed, promise);
  return promise;
}

export async function listTeamverDriveImportScopes(workspaceId: string): Promise<TeamverDriveImportScope[]> {
  const trimmed = workspaceId.trim();
  if (!trimmed) return [];
  const cached = importScopesCache.get(trimmed);
  if (cached && Date.now() - cached.at < DRIVE_IMPORT_CACHE_MS) return cached.scopes;
  const inflight = importScopesInflight.get(trimmed);
  if (inflight) return inflight;
  const promise = fetchImportScopesUncached(trimmed)
    .then((scopes) => {
      importScopesCache.set(trimmed, { scopes, at: Date.now() });
      return scopes;
    })
    .finally(() => {
      importScopesInflight.delete(trimmed);
    });
  importScopesInflight.set(trimmed, promise);
  return promise;
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

/** Personal-drive root only — BE recent aggregates all drives; shared tab uses browse. */
export async function listTeamverDriveImportRecent(params: {
  workspaceId: string;
  limit?: number;
}): Promise<TeamverDriveImportAssetRow[]> {
  const workspaceId = params.workspaceId.trim();
  if (!workspaceId) return [];

  const limit = Math.max(1, Math.min(params.limit ?? 16, 48));
  const raw = await fetchTeamverDriveHomeRecentRaw(workspaceId, {
    limit,
    include: "assets,shared_with_me",
  });
  const assets = Array.isArray((raw as { assets?: unknown[] })?.assets)
    ? (raw as { assets: unknown[] }).assets
    : extractListItems(raw);
  const rows: TeamverDriveImportAssetRow[] = [];
  for (const item of assets) {
    const normalized = normalizeRecentAsset(item);
    if (normalized && !normalized.sharedDriveId) rows.push(normalized);
  }
  return rows.slice(0, limit);
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

  // SSOT (14_Design_Drive): merge v2 home/search + legacy list search so neither
  // index's partial hits are dropped. Dedupe below.
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

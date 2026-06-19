import { extractTeamverDriveItems, getTeamverDriveJson } from "./driveApi";
import {
  TEAMVER_DRIVE_IMPORT_SEARCH_MIN,
  listTeamverDriveImportScopes,
  searchTeamverDriveImportRows,
  type TeamverDriveImportScope,
} from "./driveImportList";

type RawFolder = {
  folderId?: string | null;
  name?: string | null;
  folderType?: string | null;
  children?: RawFolder[] | null;
};

type RawFolderTree = {
  items?: RawFolder[];
  rootFolderId?: string | null;
  data?: RawFolderTree;
};

type RawSharedDrive = {
  id?: string | null;
  name?: string | null;
  workspaceId?: string | null;
  status?: string | null;
  myMemberRole?: string | null;
};

export type TeamverDrivePublishTarget = {
  id: string;
  label: string;
  description: string;
  folderId: string | null;
  sharedDriveId: string | null;
};

const TARGET_LIMIT = 28;
export const TEAMVER_DRIVE_PUBLISH_SEARCH_MIN = TEAMVER_DRIVE_IMPORT_SEARCH_MIN;

async function getJson(path: string, workspaceId?: string | null): Promise<unknown> {
  return getTeamverDriveJson(path, workspaceId);
}

function extractArray<T>(raw: unknown): T[] {
  return extractTeamverDriveItems<T>(raw);
}

function normalizeFolderId(folder: RawFolder): string | null {
  return (folder.folderId ?? "").trim() || null;
}

function normalizeFolderName(folder: RawFolder): string {
  return (folder.name ?? "").trim() || "Untitled folder";
}

function normalizeRootFolderId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as RawFolderTree;
  const direct = body.rootFolderId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return normalizeRootFolderId(body.data);
}

function normalizeFolderItems(raw: unknown): RawFolder[] {
  if (!raw || typeof raw !== "object") return [];
  const body = raw as RawFolderTree;
  if (Array.isArray(body.items)) return body.items;
  if (body.data) return normalizeFolderItems(body.data);
  return [];
}

function flattenFolders(items: RawFolder[], depth = 0): Array<{ folder: RawFolder; depth: number }> {
  const rows: Array<{ folder: RawFolder; depth: number }> = [];
  for (const folder of items) {
    rows.push({ folder, depth });
    const children = Array.isArray(folder.children) ? folder.children : [];
    rows.push(...flattenFolders(children, depth + 1));
  }
  return rows;
}

function folderTargetLabel(folder: RawFolder, depth: number): string {
  const prefix = depth > 0 ? `${"  ".repeat(Math.min(depth, 3))}- ` : "";
  return `${prefix}${normalizeFolderName(folder)}`;
}

function isRootFolder(folder: RawFolder, rootFolderId: string | null): boolean {
  const id = normalizeFolderId(folder);
  if (rootFolderId && id === rootFolderId) return true;
  const folderType = (folder.folderType ?? "").toUpperCase();
  return folderType === "ROOT" || folderType === "SHARED_ROOT";
}

function normalizeSharedDrive(raw: RawSharedDrive): RawSharedDrive | null {
  const id = (raw.id ?? "").trim();
  const name = (raw.name ?? "").trim();
  if (!id || !name) return null;
  const status = (raw.status ?? "").toLowerCase();
  if (status && status !== "active") return null;
  return { ...raw, id, name };
}

function isSharedDrive(raw: RawSharedDrive | null): raw is RawSharedDrive & { id: string; name: string } {
  return raw !== null && typeof raw.id === "string" && typeof raw.name === "string";
}

async function fetchPersonalTargets(workspaceId: string): Promise<TeamverDrivePublishTarget[]> {
  const raw = await getJson("/api/drive/folder?shallow_tree=true", workspaceId);
  const rootFolderId = normalizeRootFolderId(raw);
  const targets: TeamverDrivePublishTarget[] = [
    {
      id: "personal-root",
      label: "My Drive",
      description: "Personal drive root",
      folderId: rootFolderId,
      sharedDriveId: null,
    },
  ];
  for (const row of flattenFolders(normalizeFolderItems(raw))) {
    const folderId = normalizeFolderId(row.folder);
    if (!folderId || isRootFolder(row.folder, rootFolderId)) continue;
    targets.push({
      id: `personal:${folderId}`,
      label: folderTargetLabel(row.folder, row.depth),
      description: "My Drive folder",
      folderId,
      sharedDriveId: null,
    });
  }
  return targets;
}

async function fetchSharedDriveTargets(workspaceId: string): Promise<TeamverDrivePublishTarget[]> {
  const raw = await getJson("/api/v2/shared-drive", workspaceId);
  const drives = extractArray<RawSharedDrive>(raw).map(normalizeSharedDrive).filter(isSharedDrive);
  const targetGroups = await Promise.all(
    drives.map(async (drive) => {
      try {
        const tree = await getJson(
          `/api/v2/shared-drive/${encodeURIComponent(drive.id)}/folder-tree`,
          workspaceId,
        );
        const rootFolderId = normalizeRootFolderId(tree);
        const targets: TeamverDrivePublishTarget[] = [{
          id: `shared:${drive.id}`,
          label: drive.name,
          description: "Team drive root",
          folderId: rootFolderId,
          sharedDriveId: drive.id,
        }];
        for (const row of flattenFolders(normalizeFolderItems(tree))) {
          const folderId = normalizeFolderId(row.folder);
          if (!folderId || isRootFolder(row.folder, rootFolderId)) continue;
          targets.push({
            id: `shared:${drive.id}:${folderId}`,
            label: `${drive.name} / ${folderTargetLabel(row.folder, Math.max(0, row.depth - 1))}`,
            description: "Team drive folder",
            folderId,
            sharedDriveId: drive.id,
          });
        }
        return targets;
      } catch {
        return [{
          id: `shared:${drive.id}`,
          label: drive.name,
          description: "Team drive root",
          folderId: null,
          sharedDriveId: drive.id,
        }];
      }
    }),
  );
  return targetGroups.flat();
}

export async function listTeamverDrivePublishTargets(
  workspaceId: string,
  options: { limit?: number } = {},
): Promise<TeamverDrivePublishTarget[]> {
  const trimmed = workspaceId.trim();
  if (!trimmed) return [];
  const [personal, shared] = await Promise.allSettled([
    fetchPersonalTargets(trimmed),
    fetchSharedDriveTargets(trimmed),
  ]);
  const targets = [
    ...(personal.status === "fulfilled" ? personal.value : []),
    ...(shared.status === "fulfilled" ? shared.value : []),
  ];
  if (targets.length > 0) {
    const limit = Math.max(1, options.limit ?? TARGET_LIMIT);
    return targets.slice(0, limit);
  }
  return [
    {
      id: "personal-default",
      label: "My Drive",
      description: "Default Drive destination",
      folderId: null,
      sharedDriveId: null,
    },
  ];
}

function scopeRootTarget(scope: TeamverDriveImportScope): TeamverDrivePublishTarget {
  if (scope.mode === "shared") {
    return {
      id: `shared:${scope.sharedDriveId}`,
      label: scope.label,
      description: "Team drive root",
      folderId: scope.folderId,
      sharedDriveId: scope.sharedDriveId,
    };
  }
  return {
    id: "personal-root",
    label: scope.label,
    description: "Personal drive root",
    folderId: scope.folderId,
    sharedDriveId: null,
  };
}

function targetDedupeKey(target: TeamverDrivePublishTarget): string {
  return `${target.sharedDriveId ?? "personal"}:${target.folderId ?? "root"}`;
}

function dedupePublishTargets(targets: TeamverDrivePublishTarget[]): TeamverDrivePublishTarget[] {
  const seen = new Set<string>();
  const out: TeamverDrivePublishTarget[] = [];
  for (const target of targets) {
    const key = targetDedupeKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}

export async function searchTeamverDrivePublishTargets(
  workspaceId: string,
  query: string,
  options: { limit?: number } = {},
): Promise<TeamverDrivePublishTarget[]> {
  const trimmedWorkspaceId = workspaceId.trim();
  const trimmedQuery = query.trim();
  if (!trimmedWorkspaceId || trimmedQuery.length < TEAMVER_DRIVE_PUBLISH_SEARCH_MIN) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 80, 120));
  const scopes = await listTeamverDriveImportScopes(trimmedWorkspaceId);
  const scopeBySharedDriveId = new Map(
    scopes
      .filter((scope): scope is Extract<TeamverDriveImportScope, { mode: "shared" }> => scope.mode === "shared")
      .map((scope) => [scope.sharedDriveId, scope]),
  );
  const lowerQuery = trimmedQuery.toLowerCase();
  const rootMatches = scopes
    .filter((scope) => scope.label.toLowerCase().includes(lowerQuery))
    .map(scopeRootTarget);

  const searchGroups = await Promise.allSettled(
    scopes.map((scope) =>
      searchTeamverDriveImportRows({
        workspaceId: trimmedWorkspaceId,
        query: trimmedQuery,
        sharedDriveId: scope.mode === "shared" ? scope.sharedDriveId : null,
        limit,
      }),
    ),
  );
  const folderTargets: TeamverDrivePublishTarget[] = [];
  for (const group of searchGroups) {
    if (group.status !== "fulfilled") continue;
    for (const row of group.value) {
      if (row.kind !== "folder") continue;
      const sharedDriveId = row.sharedDriveId ?? null;
      const scope = sharedDriveId ? scopeBySharedDriveId.get(sharedDriveId) : null;
      folderTargets.push({
        id: sharedDriveId
          ? `shared:${sharedDriveId}:${row.folderId}`
          : `personal:${row.folderId}`,
        label: scope ? `${scope.label} / ${row.name}` : row.name,
        description: sharedDriveId ? "Team drive folder search result" : "My Drive folder search result",
        folderId: row.folderId,
        sharedDriveId,
      });
    }
  }

  return dedupePublishTargets([...rootMatches, ...folderTargets]).slice(0, limit);
}

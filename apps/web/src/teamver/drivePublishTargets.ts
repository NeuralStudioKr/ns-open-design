import { snakeToCamelDeep } from "@teamver/app-sdk";
import { resolveTeamverMainApiBaseUrl } from "./designApiBase";

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

function apiUrl(path: string): string {
  return `${resolveTeamverMainApiBaseUrl().replace(/\/+$/, "")}${path}`;
}

async function getJson(path: string, workspaceId?: string | null): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const trimmedWorkspaceId = workspaceId?.trim();
  if (trimmedWorkspaceId) headers["X-Workspace-Id"] = trimmedWorkspaceId;
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    throw new Error(`teamver_drive_target_fetch_failed:${response.status}`);
  }
  const raw = await response.json();
  return snakeToCamelDeep(raw);
}

function extractArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  for (const key of ["data", "items", "results", "list", "drives", "sharedDrives"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === "object") {
      const nested = extractArray<T>(value);
      if (nested.length > 0) return nested;
    }
  }
  return [];
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
  const targets = await Promise.all(
    drives.map(async (drive) => {
      try {
        const tree = await getJson(
          `/api/v2/shared-drive/${encodeURIComponent(drive.id)}/folder-tree`,
          workspaceId,
        );
        return {
          id: `shared:${drive.id}`,
          label: drive.name,
          description: "Team drive root",
          folderId: normalizeRootFolderId(tree),
          sharedDriveId: drive.id,
        } satisfies TeamverDrivePublishTarget;
      } catch {
        return {
          id: `shared:${drive.id}`,
          label: drive.name,
          description: "Team drive root",
          folderId: null,
          sharedDriveId: drive.id,
        } satisfies TeamverDrivePublishTarget;
      }
    }),
  );
  return targets;
}

export async function listTeamverDrivePublishTargets(
  workspaceId: string,
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
  if (targets.length > 0) return targets.slice(0, TARGET_LIMIT);
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

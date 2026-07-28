const SESSION_KEY_V1 = "teamver_design_deleted_project_tombstones_v1";
const LOCAL_KEY_V2 = "teamver_design_deleted_project_tombstones_v2";
/** User-initiated deletes — keep far longer than a browser session. */
const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60_000;
const LEGACY_SESSION_TTL_MS = 24 * 60 * 60_000;

type TombstoneMap = Record<string, number>;
type WorkspaceTombstoneStore = Record<string, TombstoneMap>;

function now(): number {
  return Date.now();
}

function normalizeWorkspaceId(workspaceId?: string | null): string {
  const trimmed = workspaceId?.trim();
  return trimmed || "_default";
}

function readSessionV1Flat(): TombstoneMap {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_V1);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: TombstoneMap = {};
    const cutoff = now() - LEGACY_SESSION_TTL_MS;
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (!id.trim() || typeof at !== "number" || !Number.isFinite(at)) continue;
      if (at < cutoff) continue;
      out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

function readLocalStore(): WorkspaceTombstoneStore {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_KEY_V2);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as WorkspaceTombstoneStore;
  } catch {
    return {};
  }
}

function writeLocalStore(store: WorkspaceTombstoneStore): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCAL_KEY_V2, JSON.stringify(store));
  } catch {
    // Ignore quota / private-mode errors.
  }
}

function pruneTombstones(map: TombstoneMap, ttlMs: number): TombstoneMap {
  const cutoff = now() - ttlMs;
  const out: TombstoneMap = {};
  for (const [id, at] of Object.entries(map)) {
    if (!id.trim() || typeof at !== "number" || !Number.isFinite(at)) continue;
    if (at < cutoff) continue;
    out[id] = at;
  }
  return out;
}

function readWorkspaceTombstones(workspaceId?: string | null): TombstoneMap {
  const ws = normalizeWorkspaceId(workspaceId);
  const store = readLocalStore();
  const fromLocal = pruneTombstones(store[ws] ?? {}, TOMBSTONE_TTL_MS);
  // One-time migration: legacy session-only tombstones apply to the active workspace.
  const legacy = ws === "_default" ? {} : readSessionV1Flat();
  if (Object.keys(legacy).length === 0) return fromLocal;
  return { ...legacy, ...fromLocal };
}

function writeWorkspaceTombstones(
  workspaceId: string | null | undefined,
  tombstones: TombstoneMap,
): void {
  const ws = normalizeWorkspaceId(workspaceId);
  const store = readLocalStore();
  const pruned = pruneTombstones(tombstones, TOMBSTONE_TTL_MS);
  if (Object.keys(pruned).length === 0) {
    delete store[ws];
  } else {
    store[ws] = pruned;
  }
  writeLocalStore(store);
  // Drop legacy session map once persisted locally.
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(SESSION_KEY_V1);
    } catch {
      // ignore
    }
  }
}

export function markTeamverProjectDeletedTombstone(
  projectId: string,
  workspaceId?: string | null,
): void {
  const id = projectId.trim();
  if (!id) return;
  const tombstones = readWorkspaceTombstones(workspaceId);
  tombstones[id] = now();
  writeWorkspaceTombstones(workspaceId, tombstones);
}

export function clearTeamverProjectDeletedTombstone(
  projectId: string,
  workspaceId?: string | null,
): void {
  const id = projectId.trim();
  if (!id) return;
  const tombstones = readWorkspaceTombstones(workspaceId);
  if (!(id in tombstones)) return;
  delete tombstones[id];
  writeWorkspaceTombstones(workspaceId, tombstones);
}

export function readTeamverDeletedProjectIds(
  workspaceId?: string | null,
): Set<string> {
  return new Set(Object.keys(readWorkspaceTombstones(workspaceId)));
}

export function isTeamverProjectDeletedTombstoned(
  projectId: string,
  workspaceId?: string | null,
): boolean {
  const id = projectId.trim();
  if (!id) return false;
  return readWorkspaceTombstones(workspaceId)[id] !== undefined;
}

/** Session/local tombstones plus in-memory delete markers (App list reconcile). */
export function mergeDeletedProjectIdSets(
  locallyDeleted?: ReadonlyMap<string, unknown>,
  workspaceId?: string | null,
): Set<string> {
  const out = readTeamverDeletedProjectIds(workspaceId);
  if (!locallyDeleted) return out;
  for (const id of locallyDeleted.keys()) out.add(id);
  return out;
}

/** @internal vitest */
export function clearTeamverDeletedProjectTombstonesForTests(): void {
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(SESSION_KEY_V1);
    } catch {
      // ignore
    }
  }
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(LOCAL_KEY_V2);
    } catch {
      // ignore
    }
  }
}

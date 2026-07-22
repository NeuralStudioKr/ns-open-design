const STORAGE_KEY = "teamver_design_deleted_project_tombstones_v1";
const TOMBSTONE_TTL_MS = 24 * 60 * 60_000;

type TombstoneMap = Record<string, number>;

function now(): number {
  return Date.now();
}

function readTombstones(): TombstoneMap {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: TombstoneMap = {};
    const cutoff = now() - TOMBSTONE_TTL_MS;
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

function writeTombstones(tombstones: TombstoneMap): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tombstones));
  } catch {
    // Ignore private-mode quota/storage errors.
  }
}

export function markTeamverProjectDeletedTombstone(projectId: string): void {
  const id = projectId.trim();
  if (!id) return;
  const tombstones = readTombstones();
  tombstones[id] = now();
  writeTombstones(tombstones);
}

export function clearTeamverProjectDeletedTombstone(projectId: string): void {
  const id = projectId.trim();
  if (!id) return;
  const tombstones = readTombstones();
  if (!(id in tombstones)) return;
  delete tombstones[id];
  writeTombstones(tombstones);
}

export function readTeamverDeletedProjectIds(): Set<string> {
  return new Set(Object.keys(readTombstones()));
}

export function isTeamverProjectDeletedTombstoned(projectId: string): boolean {
  const id = projectId.trim();
  return Boolean(id && readTombstones()[id] !== undefined);
}

/** @internal vitest */
export function clearTeamverDeletedProjectTombstonesForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

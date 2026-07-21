/**
 * Session-scoped stash for HTML artifact writes that failed with a daemon 401.
 *
 * The scenario: a long slide run finishes successfully via the BYOK proxy but
 * the Design BFF cookie has expired mid-flight, so every follow-up daemon
 * request (files list, write file, message PUT) returns 401. Without this
 * stash the freshly-generated deck lives only inside `parsedArtifact.html`
 * closure/`artifact` state and disappears when the user navigates or reloads.
 *
 * By snapshotting the write payload to sessionStorage keyed by projectId +
 * fileName, a subsequent auth recovery (or explicit "다시 시도") can replay
 * the write without asking the model to regenerate the deck. sessionStorage
 * (not localStorage) matches the reload/tab lifetime of the failed run — a
 * cross-tab or day-later replay would surprise the user and race with a new
 * run that could have overwritten the same file name.
 *
 * Values are intentionally bounded (single JSON per file). A 2 MB soft cap +
 * TTL prunes stale entries so a repeated failure cannot balloon storage.
 *
 * Design notes:
 * - Reads/writes are best-effort: sessionStorage may throw (quota, disabled,
 *   privacy mode) and we must never break the surrounding flow.
 * - No new dependencies; contracts stay pure UI-adjacent.
 * - Keys are namespaced (`od:pending-artifact-write:*`) so we can list-and-
 *   drain without scanning unrelated entries.
 */

/** Fires the same day; we don't want to replay a slide from last week. */
const PENDING_WRITE_TTL_MS = 24 * 60 * 60 * 1000;

/** Reject payloads that would fill most of the tab-scoped 5 MB budget by themselves. */
const PENDING_WRITE_MAX_BYTES = 2 * 1024 * 1024;

const KEY_PREFIX = "od:pending-artifact-write:";
let pendingWriteSequence = 0;

export interface PendingArtifactWrite {
  projectId: string;
  fileName: string;
  htmlBody: string;
  /**
   * Serialized ArtifactManifest for the write. Kept as unknown so we don't
   * pull the manifest type across the storage boundary; the caller can cast
   * on read since it wrote the value.
   */
  artifactManifest?: unknown;
  /** ms epoch. Older entries beyond `PENDING_WRITE_TTL_MS` are pruned on read. */
  stashedAt: number;
  /** Tab-local monotonic order for writes stashed inside the same millisecond. */
  stashedOrder?: number;
}

function storageKey(projectId: string, fileName: string): string {
  return `${KEY_PREFIX}${projectId}:${fileName}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function safeParse(raw: string | null): PendingArtifactWrite | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingArtifactWrite> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (
      typeof parsed.projectId !== "string" ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.htmlBody !== "string" ||
      typeof parsed.stashedAt !== "number"
    ) {
      return null;
    }
    return {
      projectId: parsed.projectId,
      fileName: parsed.fileName,
      htmlBody: parsed.htmlBody,
      artifactManifest: parsed.artifactManifest,
      stashedAt: parsed.stashedAt,
      ...(typeof parsed.stashedOrder === "number" ? { stashedOrder: parsed.stashedOrder } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Persist a failed write for later replay. Returns true when the payload
 * was stashed, false when storage is unavailable or the payload is too large.
 */
export function stashPendingArtifactWrite(entry: {
  projectId: string;
  fileName: string;
  htmlBody: string;
  artifactManifest?: unknown;
}): boolean {
  const storage = getStorage();
  if (!storage) return false;
  const projectId = entry.projectId.trim();
  const fileName = entry.fileName.trim();
  if (!projectId || !fileName) return false;
  if (typeof entry.htmlBody !== "string" || !entry.htmlBody.trim()) return false;
  const payload: PendingArtifactWrite = {
    projectId,
    fileName,
    htmlBody: entry.htmlBody,
    artifactManifest: entry.artifactManifest,
    stashedAt: Date.now(),
    stashedOrder: pendingWriteSequence += 1,
  };
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return false;
  }
  // Guard against a single deck blowing the entire tab-scoped budget.
  if (serialized.length > PENDING_WRITE_MAX_BYTES) return false;
  try {
    storage.setItem(storageKey(projectId, fileName), serialized);
    return true;
  } catch {
    // Quota exceeded — try clearing older entries for the same project.
    try {
      clearProjectPendingArtifactWrites(projectId);
      storage.setItem(storageKey(projectId, fileName), serialized);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * List currently-stashed writes for a project, pruning any that fell outside
 * the TTL. Callers use this on auth-recovery to enumerate replay candidates.
 */
export function listPendingArtifactWrites(projectId: string): PendingArtifactWrite[] {
  const storage = getStorage();
  if (!storage) return [];
  const trimmed = projectId.trim();
  if (!trimmed) return [];
  const prefix = `${KEY_PREFIX}${trimmed}:`;
  const now = Date.now();
  const results: PendingArtifactWrite[] = [];
  // Snapshot the keys up-front — removeItem below mutates the length.
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return [];
  }
  for (const key of keys) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      continue;
    }
    const parsed = safeParse(raw);
    if (!parsed) {
      // Corrupt entry — drop it so we do not repeatedly parse-fail.
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
      continue;
    }
    if (parsed.projectId !== trimmed) {
      continue;
    }
    if (now - parsed.stashedAt > PENDING_WRITE_TTL_MS) {
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
      continue;
    }
    results.push(parsed);
  }
  // Newest first so a replay burst restores the freshest deck first. Preserve
  // stash order when multiple writes land inside the same millisecond.
  results.sort((a, b) => (b.stashedAt - a.stashedAt) || ((b.stashedOrder ?? 0) - (a.stashedOrder ?? 0)));
  return results;
}

/**
 * Read the most-recent stashed write for a project without pruning. Used by
 * the memory-only preview fallback so the workspace can render the deck the
 * user just watched stream in even when the daemon file list came back empty.
 */
export function peekLatestPendingArtifactWrite(
  projectId: string,
): PendingArtifactWrite | null {
  const [head] = listPendingArtifactWrites(projectId);
  return head ?? null;
}

export function clearPendingArtifactWrite(projectId: string, fileName: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(projectId, fileName));
  } catch {
    /* ignore */
  }
}

export function clearProjectPendingArtifactWrites(projectId: string): void {
  const storage = getStorage();
  if (!storage) return;
  const trimmed = projectId.trim();
  if (!trimmed) return;
  const prefix = `${KEY_PREFIX}${trimmed}:`;
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return;
  }
  for (const key of keys) {
    try {
      const parsed = safeParse(storage.getItem(key));
      if (!parsed || parsed.projectId === trimmed) {
        storage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
  }
}

export const __TEST__ = {
  KEY_PREFIX,
  PENDING_WRITE_TTL_MS,
  PENDING_WRITE_MAX_BYTES,
};

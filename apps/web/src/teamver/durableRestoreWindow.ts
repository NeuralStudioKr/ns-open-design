/**
 * 0908-N01 slice J — time-box G4 durable restore after an unrequested reconcile.
 *
 * A reconcile may move only the active key (G3 blocks durable promotion). Boot
 * G4 undoes that flake by preferring durable — but without a window, a user who
 * stayed on the reconciled workspace for hours is yanked back on the next F5
 * (risk 7). Stamp the unrequested move; restore only inside the TTL.
 */

export const DURABLE_RESTORE_WINDOW_MS = 5 * 60_000;

const STORAGE_KEY = "teamver_design_unrequested_ws_move_v1";

export type UnrequestedWorkspaceMoveStamp = {
  userId: string;
  from: string;
  to: string;
  at: number;
};

function readStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function parseStamp(raw: string | null): UnrequestedWorkspaceMoveStamp | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UnrequestedWorkspaceMoveStamp>;
    const userId = typeof parsed.userId === "string" ? parsed.userId.trim() : "";
    const from = typeof parsed.from === "string" ? parsed.from.trim() : "";
    const to = typeof parsed.to === "string" ? parsed.to.trim() : "";
    const at = typeof parsed.at === "number" ? parsed.at : Number.NaN;
    if (!userId || !from || !to || !Number.isFinite(at)) return null;
    return { userId, from, to, at };
  } catch {
    return null;
  }
}

export function readUnrequestedWorkspaceMoveStamp(
  userId?: string | null,
): UnrequestedWorkspaceMoveStamp | null {
  const uid = userId?.trim() || null;
  if (!uid) return null;
  const storage = readStorage();
  if (!storage) return null;
  const stamp = parseStamp(storage.getItem(STORAGE_KEY));
  if (!stamp || stamp.userId !== uid) return null;
  return stamp;
}

export function markUnrequestedWorkspaceMove(input: {
  userId: string | null | undefined;
  from: string | null | undefined;
  to: string | null | undefined;
  at?: number;
}): void {
  const userId = input.userId?.trim() || null;
  const from = input.from?.trim() || null;
  const to = input.to?.trim() || null;
  if (!userId || !from || !to || from === to) return;
  const storage = readStorage();
  if (!storage) return;
  const stamp: UnrequestedWorkspaceMoveStamp = {
    userId,
    from,
    to,
    at: input.at ?? Date.now(),
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(stamp));
  } catch {
    // Quota / private mode — G4 falls back to "no stamp → do not restore".
  }
}

export function clearUnrequestedWorkspaceMove(userId?: string | null): void {
  const storage = readStorage();
  if (!storage) return;
  const uid = userId?.trim() || null;
  if (uid) {
    const stamp = parseStamp(storage.getItem(STORAGE_KEY));
    if (stamp && stamp.userId !== uid) return;
  }
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Prefer durable over a still-valid active key only when an unrequested move
 * recently produced exactly this disagreement (from=durable, to=active).
 *
 * No stamp / wrong pair / expired TTL → false (caller keeps active + heals).
 * Callers must still require durable to be on the session and app-enabled.
 */
export function shouldRestoreDurableOverActive(input: {
  userId: string | null | undefined;
  durableId: string | null | undefined;
  activeId: string | null | undefined;
  now?: number;
  windowMs?: number;
}): boolean {
  const userId = input.userId?.trim() || null;
  const durableId = input.durableId?.trim() || null;
  const activeId = input.activeId?.trim() || null;
  if (!userId || !durableId || !activeId || durableId === activeId) return false;

  const stamp = readUnrequestedWorkspaceMoveStamp(userId);
  if (!stamp) return false;
  if (stamp.from !== durableId || stamp.to !== activeId) return false;

  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? DURABLE_RESTORE_WINDOW_MS;
  return now - stamp.at <= windowMs;
}

/** @internal tests */
export function resetDurableRestoreWindowForTests(): void {
  clearUnrequestedWorkspaceMove();
}

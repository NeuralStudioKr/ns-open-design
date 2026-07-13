import type { DesignAuthSession } from "./designBffClient";

const SNAPSHOT_KEY = "teamver:embed-auth-snapshot-v1";
/** Only reuse for near-term revisits — longer windows risk stale ACL/UI. */
export const EMBED_AUTH_SNAPSHOT_MAX_AGE_MS = 90_000;

export type EmbedAuthSnapshot = {
  at: number;
  session: DesignAuthSession;
  activeWorkspaceId: string | null;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

/** Persist last successful authenticated session for optimistic next paint. */
export function persistEmbedAuthSnapshot(input: {
  session: DesignAuthSession;
  activeWorkspaceId: string | null;
}): void {
  if (!canUseStorage()) return;
  if (!input.session.authenticated) {
    clearEmbedAuthSnapshot();
    return;
  }
  const snapshot: EmbedAuthSnapshot = {
    at: Date.now(),
    session: input.session,
    activeWorkspaceId: input.activeWorkspaceId?.trim() || null,
  };
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // quota / private mode
  }
}

export function clearEmbedAuthSnapshot(): void {
  if (!canUseStorage()) return;
  try {
    sessionStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Fresh authenticated snapshot (persist/clear hygiene for logout paths).
 * Do not unlock EmbedBootstrapGate from this alone — that can flash
 * authenticated chrome then hard-redirect when the live probe disagrees.
 */
export function readFreshEmbedAuthSnapshot(
  maxAgeMs: number = EMBED_AUTH_SNAPSHOT_MAX_AGE_MS,
): EmbedAuthSnapshot | null {
  if (!canUseStorage()) return null;
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EmbedAuthSnapshot;
    if (!parsed?.session?.authenticated) return null;
    if (!Number.isFinite(parsed.at) || Date.now() - parsed.at > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** @internal vitest */
export function resetEmbedAuthSnapshotForTests(): void {
  clearEmbedAuthSnapshot();
}

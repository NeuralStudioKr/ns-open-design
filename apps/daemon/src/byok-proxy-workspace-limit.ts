/**
 * Per-workspace concurrent BYOK proxy stream cap (PR3 §5.6).
 * Env `OD_BYOK_PROXY_MAX_PER_WORKSPACE` — default 8; 0 disables the limit.
 */

const activeByWorkspace = new Map<string, number>();

export function maxByokProxyStreamsPerWorkspace(): number {
  const raw = (process.env.OD_BYOK_PROXY_MAX_PER_WORKSPACE ?? '').trim();
  if (!raw) return 8;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 8;
}

export type WorkspaceProxySlot = {
  workspaceId: string;
  release: () => void;
};

/**
 * Reserve a proxy stream slot for `workspaceId`. Returns null when the cap is
 * reached (caller should answer 429).
 */
export function tryAcquireWorkspaceProxySlot(
  workspaceId: string | null | undefined,
): WorkspaceProxySlot | null {
  const trimmed = typeof workspaceId === 'string' ? workspaceId.trim() : '';
  if (!trimmed) return { workspaceId: '', release: () => {} };

  const max = maxByokProxyStreamsPerWorkspace();
  if (max === 0) return { workspaceId: trimmed, release: () => {} };

  const current = activeByWorkspace.get(trimmed) ?? 0;
  if (current >= max) {
    console.warn(
      JSON.stringify({
        metric: 'od_byok_proxy_workspace_limit',
        workspaceId: trimmed,
        active: current,
        max,
      }),
    );
    return null;
  }
  activeByWorkspace.set(trimmed, current + 1);
  let released = false;
  return {
    workspaceId: trimmed,
    release: () => {
      if (released) return;
      released = true;
      const next = (activeByWorkspace.get(trimmed) ?? 1) - 1;
      if (next <= 0) activeByWorkspace.delete(trimmed);
      else activeByWorkspace.set(trimmed, next);
    },
  };
}

/** @internal vitest */
export function resetWorkspaceProxySlotsForTests(): void {
  activeByWorkspace.clear();
}

/** @internal vitest */
export function workspaceProxyActiveCountForTests(workspaceId: string): number {
  return activeByWorkspace.get(workspaceId.trim()) ?? 0;
}

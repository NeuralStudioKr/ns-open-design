/**
 * Cross-tab coordination for `POST /teamver-bff/auth/refresh`.
 *
 * Why: `_refresh_apps_tokens_coalesced` on the BE is a **single-process**
 * inflight cache. Two tabs on the same origin can each hit Main
 * `/api/apps/auth/refresh` with the same rotating refresh_token — one wins
 * the rotation, the other observes 401 and lands in soft sticky decline.
 *
 * This module provides a best-effort leader-election over `localStorage` +
 * `BroadcastChannel`:
 *
 * 1. Tabs about to POST call `acquireBffRefreshLeader()`.
 * 2. If another tab holds the lock (recent write), the caller waits for a
 *    result broadcast for up to `LEADER_WAIT_MS`. On success it can skip
 *    the POST entirely and rely on the sibling's Set-Cookie.
 * 3. If the wait times out (lock crashed, no broadcast), the follower
 *    proceeds with its own POST as a fallback.
 * 4. Leaders publish the result via BroadcastChannel so followers on the
 *    same or new tab know the outcome.
 *
 * The `localStorage` write is a plain race — two tabs may both think they
 * acquired the lock if `localStorage` writes interleave. That's fine: the
 * BE coalesce (30s per user) still de-dupes the second refresh, and the
 * follower falls back to POST only when it does not observe a result.
 */

import { postTeamverEmbedBroadcast, subscribeTeamverEmbedBroadcast } from "./teamverEmbedBroadcast";

const LOCK_KEY = "teamver_bff_refresh_lock_v1";
const LOCK_TTL_MS = 4_000;
/** Match lock TTL — shorter waits caused followers to POST while the leader's
 * Main refresh was still in flight, doubling rotation races. */
const LEADER_WAIT_MS = 3_500;

type LockEntry = {
  tabId: string;
  at: number;
};

type RefreshResult = {
  ok: boolean;
  status: number;
  at: number;
};

let followerResolvers: Array<(result: RefreshResult) => void> = [];
let broadcastInstalled = false;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

function readLock(): LockEntry | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tabId?: unknown; at?: unknown };
    if (typeof parsed.tabId !== "string") return null;
    if (typeof parsed.at !== "number") return null;
    const now = Date.now();
    // Absolute distance handles fake-timer test env where Date.now can
    // regress relative to a real-time write from a prior test file
    // (persisted localStorage). In production the clock is monotonic per
    // tab, so the elapsed-time gate is what matters.
    if (Math.abs(now - parsed.at) > LOCK_TTL_MS) return null;
    return { tabId: parsed.tabId, at: parsed.at };
  } catch {
    return null;
  }
}

function writeLock(entry: LockEntry): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(entry));
  } catch {
    // quota / privacy mode — safe to ignore, we degrade to per-tab coalesce.
  }
}

function clearLock(tabId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { tabId?: unknown };
    if (parsed.tabId === tabId) {
      localStorage.removeItem(LOCK_KEY);
    }
  } catch {
    // ignore
  }
}

function ensureBroadcastInstalled(): void {
  if (broadcastInstalled) return;
  broadcastInstalled = true;
  subscribeTeamverEmbedBroadcast((message) => {
    if (message.kind !== "bff-refresh-result") return;
    const result: RefreshResult = {
      ok: Boolean((message as unknown as { ok?: unknown }).ok),
      status: Number((message as unknown as { status?: unknown }).status) || 0,
      at: Date.now(),
    };
    const resolvers = followerResolvers;
    followerResolvers = [];
    for (const resolver of resolvers) {
      try {
        resolver(result);
      } catch {
        // best-effort
      }
    }
  });
}

let cachedTabId: string | null = null;
function readTabId(): string {
  if (cachedTabId) return cachedTabId;
  cachedTabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return cachedTabId;
}

export type BffRefreshLeaderRole = "leader" | "follower";

/**
 * Acquire the cross-tab BFF refresh lock.
 *
 * Returns `"leader"` when the caller should proceed with POST /auth/refresh.
 * Returns `"follower"` when another tab is already refreshing (or already
 * finished refreshing very recently). Follower must call
 * `awaitLeaderResult()` to observe the outcome before falling back to POST.
 */
export function acquireBffRefreshLeader(): BffRefreshLeaderRole {
  // Without localStorage there is no shared lock — every tab must act as
  // its own leader (SSR/node test env). We still install the broadcast
  // hook so peer-tab result relay works if BroadcastChannel is present.
  if (!hasLocalStorage()) {
    ensureBroadcastInstalled();
    return "leader";
  }
  ensureBroadcastInstalled();
  const held = readLock();
  const tabId = readTabId();
  if (held && held.tabId !== tabId) {
    return "follower";
  }
  writeLock({ tabId, at: Date.now() });
  // Read-back verification — if another tab won the interleaved write,
  // fall back to follower so we do not race Main /apps/auth/refresh.
  const readBack = readLock();
  if (!readBack || readBack.tabId !== tabId) {
    return "follower";
  }
  return "leader";
}

/**
 * Wait for the current leader to publish a refresh result. Returns `null`
 * on timeout — caller should then attempt its own POST as a fallback.
 */
export function awaitLeaderResult(timeoutMs: number = LEADER_WAIT_MS): Promise<RefreshResult | null> {
  ensureBroadcastInstalled();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResult = (result: RefreshResult) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      resolve(result);
    };
    followerResolvers.push(onResult);
    timer = setTimeout(() => {
      timer = null;
      const idx = followerResolvers.indexOf(onResult);
      if (idx >= 0) followerResolvers.splice(idx, 1);
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Publish a refresh result to peer tabs and release the lock. Called by
 * the leader after `POST /auth/refresh` finishes (success or failure).
 */
export function releaseBffRefreshLeader(result: { ok: boolean; status: number }): void {
  ensureBroadcastInstalled();
  const tabId = readTabId();
  clearLock(tabId);
  postTeamverEmbedBroadcast({
    kind: "bff-refresh-result",
    ok: Boolean(result.ok),
    status: Number(result.status) || 0,
  });
}

/** @internal test */
export function resetBffRefreshLeaderForTests(): void {
  followerResolvers = [];
  broadcastInstalled = false;
  cachedTabId = null;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(LOCK_KEY);
    } catch {
      // ignore
    }
  }
}

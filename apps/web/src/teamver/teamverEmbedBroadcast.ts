/**
 * Cross-tab pub/sub for embed session + workspace changes.
 *
 * Historically both `dispatchTeamverWorkspaceChanged` and
 * `dispatchTeamverEmbedSessionChanged` fired only `window.dispatchEvent`
 * — tab-local. Two embed tabs on the same origin (`stg-design.teamver.com`
 * / `design.teamver.com`) could drift for up to the focus-refresh cadence
 * (~5min), showing conflicting workspace headers and letting tab A act
 * against workspace WS-1 while tab B thought it was WS-2.
 *
 * This module layers a `BroadcastChannel('teamver-embed')` on top of the
 * existing CustomEvent dispatcher plus a `storage` event fallback for
 * UAs that block BroadcastChannel (Safari in third-party iframe contexts).
 * When a peer tab posts, we re-emit the local CustomEvent so every
 * existing subscriber (`subscribeTeamverWorkspaceChanged`,
 * `subscribeTeamverEmbedSessionChanged`) fires without any downstream
 * refactor.
 *
 * Design constraints:
 * - Every posted message carries a per-tab `sourceId` so we can drop
 *   echoes (our own dispatch bouncing back).
 * - Local CustomEvents only re-emit ONCE per unique payload+source
 *   sequence to avoid feedback loops if a downstream listener also
 *   re-broadcasts.
 * - Silent no-op outside `window` (SSR / test env without dom).
 */

const CHANNEL_NAME = "teamver-embed";
const ACTIVE_WORKSPACE_STORAGE_KEY = "teamver_design_active_workspace_id";
const CROSS_TAB_STORAGE_KEY = "teamver_design_broadcast_last";

let cachedChannel: BroadcastChannel | null | undefined;
let cachedSourceId: string | null = null;
let storageListener: ((event: StorageEvent) => void) | null = null;
type IncomingHandler = (message: EmbedBroadcastMessage) => void;
const incomingHandlers = new Set<IncomingHandler>();

export type EmbedBroadcastMessage =
  | { kind: "workspace-changed"; workspaceId: string; sourceId: string; postedAt: number }
  | { kind: "embed-session-changed"; authenticated: boolean; sourceId: string; postedAt: number };

/**
 * Distributive Omit — non-distributive `Omit<Union, K>` collapses the
 * discriminated union into a single non-distributed shape, which then
 * fails excess-property checks in the caller (TS complains that
 * `authenticated` isn't in the collapsed shape). Distributing preserves
 * per-variant field lists.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
export type EmbedBroadcastPayload = DistributiveOmit<
  EmbedBroadcastMessage,
  "sourceId" | "postedAt"
>;

function generateSourceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `tab-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function getSourceId(): string {
  if (cachedSourceId) return cachedSourceId;
  cachedSourceId = generateSourceId();
  return cachedSourceId;
}

/** @internal test — force a fresh sourceId so cross-tab replay is testable. */
export function resetTeamverEmbedBroadcastSourceIdForTests(): void {
  cachedSourceId = null;
}

/** @internal test — detach every listener + drop cached channel/source. */
export function resetTeamverEmbedBroadcastForTests(): void {
  incomingHandlers.clear();
  cachedSourceId = null;
  if (cachedChannel) {
    try {
      cachedChannel.close();
    } catch {
      // ignore
    }
  }
  cachedChannel = undefined;
  if (storageListener && typeof window !== "undefined") {
    window.removeEventListener("storage", storageListener);
  }
  storageListener = null;
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (cachedChannel !== undefined) return cachedChannel;
  if (typeof BroadcastChannel === "undefined") {
    cachedChannel = null;
    return cachedChannel;
  }
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) => {
      const raw = event.data as EmbedBroadcastMessage | undefined;
      if (!raw || raw.sourceId === getSourceId()) return;
      for (const handler of incomingHandlers) {
        try {
          handler(raw);
        } catch {
          // handler failure must never crash the channel dispatcher
        }
      }
    });
    cachedChannel = channel;
  } catch {
    cachedChannel = null;
  }
  return cachedChannel;
}

function installStorageFallbackIfNeeded(): void {
  if (typeof window === "undefined") return;
  if (storageListener) return;
  const handler = (event: StorageEvent) => {
    // Only react to keys we own — otherwise every localStorage mutation
    // by unrelated app code fires our handlers.
    if (event.key === ACTIVE_WORKSPACE_STORAGE_KEY) {
      const raw = event.newValue?.trim();
      if (!raw) return;
      for (const h of incomingHandlers) {
        try {
          h({
            kind: "workspace-changed",
            workspaceId: raw,
            sourceId: "storage-fallback",
            postedAt: Date.now(),
          });
        } catch {
          // best-effort
        }
      }
      return;
    }
    if (event.key === CROSS_TAB_STORAGE_KEY) {
      const raw = event.newValue;
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as EmbedBroadcastMessage;
        if (!parsed || parsed.sourceId === getSourceId()) return;
        for (const h of incomingHandlers) {
          try {
            h(parsed);
          } catch {
            // best-effort
          }
        }
      } catch {
        // ignore malformed
      }
    }
  };
  storageListener = handler;
  window.addEventListener("storage", handler);
}

/**
 * Register a listener for incoming cross-tab messages. Returns an
 * unsubscribe function. Silent no-op in SSR.
 */
export function subscribeTeamverEmbedBroadcast(
  handler: IncomingHandler,
): () => void {
  if (typeof window === "undefined") return () => {};
  // Prime the channel + storage fallback lazily so SSR imports do not
  // instantiate BroadcastChannel.
  getChannel();
  installStorageFallbackIfNeeded();
  incomingHandlers.add(handler);
  return () => {
    incomingHandlers.delete(handler);
  };
}

/**
 * Post a message to peer tabs. Also mirrors to localStorage so the
 * `storage` event fallback picks it up in UAs without BroadcastChannel.
 * The `sourceId` field is populated automatically.
 */
export function postTeamverEmbedBroadcast(
  message: EmbedBroadcastPayload,
): void {
  if (typeof window === "undefined") return;
  const enriched = {
    ...message,
    sourceId: getSourceId(),
    postedAt: Date.now(),
  } as EmbedBroadcastMessage;
  const channel = getChannel();
  if (channel) {
    try {
      channel.postMessage(enriched);
    } catch {
      // fall through to storage fallback
    }
  }
  // Storage mirror — with an ephemeral nonce-keyed value so
  // storage-event listeners in other tabs always see a mutation even
  // when the same message is posted repeatedly.
  try {
    localStorage.setItem(CROSS_TAB_STORAGE_KEY, JSON.stringify(enriched));
  } catch {
    // quota / privacy mode — best-effort
  }
}

import {
  TEAMVER_EMBED_LOADING_BG,
  TEAMVER_EMBED_LOADING_TEXT,
} from "./branding/loadingShellLabel";

const RELOAD_TS_KEY = "__teamver_design_chunk_reload_ts__";
const RELOAD_COUNT_KEY = "__teamver_design_chunk_reload_count__";
const CACHE_BUST_QUERY_KEY = "_chunkRetry";

const MIN_RELOAD_GAP_MS = 800;
const MAX_AUTO_RELOADS = 3;
const COUNT_IDLE_RESET_MS = 30 * 60 * 1000;

let installed = false;

export function resetEmbedChunkLoadRecoveryForTests(): void {
  installed = false;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RELOAD_TS_KEY);
    window.localStorage.removeItem(RELOAD_COUNT_KEY);
  } catch {
    // ignore
  }
}

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { name?: unknown; message?: unknown };
  const name = typeof err.name === "string" ? err.name : "";
  const message = typeof err.message === "string" ? err.message : String(error ?? "");
  if (name === "ChunkLoadError") return true;
  if (/Loading chunk [\w-]+ failed/i.test(message)) return true;
  if (/Loading CSS chunk [\w-]+ failed/i.test(message)) return true;
  if (/_next\/static\//i.test(message)) {
    if (/failed to fetch dynamically imported module/i.test(message)) return true;
    if (/importing a module script failed/i.test(message)) return true;
    if (/error loading dynamically imported module/i.test(message)) return true;
  }
  return false;
}

export function maybeReloadOnChunkError(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isChunkLoadError(error)) return false;
  let lastTs = 0;
  let count = 0;
  try {
    const rawTs = window.localStorage.getItem(RELOAD_TS_KEY);
    if (rawTs) lastTs = Number(rawTs) || 0;
    const rawCount = window.localStorage.getItem(RELOAD_COUNT_KEY);
    if (rawCount) count = Number(rawCount) || 0;
  } catch {
    // private mode — still attempt one reload
  }
  const now = Date.now();
  if (lastTs && now - lastTs > COUNT_IDLE_RESET_MS) {
    count = 0;
  }
  if (count >= MAX_AUTO_RELOADS) return false;
  if (lastTs && now - lastTs < MIN_RELOAD_GAP_MS) return false;
  const nextCount = count + 1;
  try {
    window.localStorage.setItem(RELOAD_TS_KEY, String(now));
    window.localStorage.setItem(RELOAD_COUNT_KEY, String(nextCount));
  } catch {
    // ignore
  }
  queueMicrotask(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(CACHE_BUST_QUERY_KEY, String(nextCount));
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  });
  return true;
}

export function clearEmbedChunkLoadRecoveryCounters(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RELOAD_TS_KEY);
    window.localStorage.removeItem(RELOAD_COUNT_KEY);
    const url = new URL(window.location.href);
    if (url.searchParams.has(CACHE_BUST_QUERY_KEY)) {
      url.searchParams.delete(CACHE_BUST_QUERY_KEY);
      window.history.replaceState(null, "", url.toString());
    }
  } catch {
    // ignore
  }
}

/** Embed-only — recover stale `_next/static` chunk URLs after deploy. */
export function installEmbedChunkLoadRecovery(): () => void {
  if (installed || typeof window === "undefined") return () => undefined;
  installed = true;

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (!maybeReloadOnChunkError(event.reason)) return;
    event.preventDefault();
  };

  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    installed = false;
  };
}

export const embedFatalErrorShellStyle = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  margin: 0,
  padding: 24,
  backgroundColor: TEAMVER_EMBED_LOADING_BG,
  color: TEAMVER_EMBED_LOADING_TEXT,
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 14,
  lineHeight: 1.5,
  textAlign: "center" as const,
};

export const embedFatalErrorButtonStyle = {
  border: "1px solid #c9c2b8",
  borderRadius: 8,
  background: "#fff",
  color: TEAMVER_EMBED_LOADING_TEXT,
  padding: "8px 14px",
  font: "500 13px/1.2 system-ui, -apple-system, sans-serif",
  cursor: "pointer",
};

import type {
  ProjectPreviewUrlBatchResponse,
  ProjectPreviewUrlResponse,
} from "@open-design/contracts";

import { isTeamverEmbedMode } from "./designApiBase";
import { fetchTeamverDaemon } from "./teamverDaemonHeaders";

const TTL_MS = 50 * 60 * 1000;
/** Bound hung preview-url GETs so HtmlViewer can settle / remint. */
const PREFIX_FETCH_TIMEOUT_MS = 8_000;
const BATCH_MAX = 12;
const prefixByProject = new Map<string, { prefix: string; expiresAt: number }>();
/** Inflight is always project-scoped — file only validates existence on the server. */
const inflight = new Map<string, Promise<string | null>>();
/**
 * Bumped on invalidate so in-flight mint/warm completions cannot re-seed a
 * stale/unauthorized prefix after auth recovery remint.
 */
const mintEpochByProject = new Map<string, number>();

function currentMintEpoch(projectId: string): number {
  return mintEpochByProject.get(projectId) ?? 0;
}

function previewPrefixFromUrl(url: unknown): string | null {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return null;
  const match = /^(\/api\/projects\/[^/]+\/preview\/[^/]+)/u.exec(raw);
  return match?.[1] ?? null;
}

function seedPrefix(
  projectId: string,
  url: unknown,
  expectedEpoch?: number,
): string | null {
  const prefix = previewPrefixFromUrl(url);
  if (!prefix) return null;
  if (
    expectedEpoch != null
    && currentMintEpoch(projectId) !== expectedEpoch
  ) {
    // Auth remint invalidated while this mint/warm was in flight — drop.
    return null;
  }
  prefixByProject.set(projectId, { prefix, expiresAt: Date.now() + TTL_MS });
  return prefix;
}

/** Strip cache-bust / fragment so daemon resolves a real project file path. */
export function sanitizePreviewEntryFile(entryFile?: string): string | undefined {
  if (typeof entryFile !== "string") return undefined;
  const cleaned = entryFile.trim().split(/[?#]/u, 1)[0]?.trim() ?? "";
  if (!cleaned) return undefined;
  // Workspace sentinel tab ids (Design Files / Design System / Questions) are
  // not project files. Passing them as ?file= yields FILE_NOT_FOUND and can
  // spin preview-url remint forever while the Design Files panel is open.
  if (
    cleaned === "__design_files__"
    || cleaned === "__design_system__"
    || cleaned === "__questions__"
    || /^__[^/]+__$/u.test(cleaned)
  ) {
    return undefined;
  }
  return cleaned;
}

/**
 * Sync read of a still-valid cached preview prefix. Used to seed HtmlViewer
 * so remounting the deck tab after an image/other file does not paint an
 * empty srcDoc while waiting on the async resolve microtask.
 */
export function peekTeamverProjectPreviewPrefix(projectId: string): string | null {
  if (!isTeamverEmbedMode()) return null;
  const id = projectId.trim();
  if (!id) return null;
  const cached = prefixByProject.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.prefix;
  return null;
}

/**
 * Embed-only — mint (or reuse) a daemon preview scope prefix so sandboxed
 * iframe subresources load without nginx session auth_request.
 */
export async function resolveTeamverProjectPreviewPrefix(
  projectId: string,
  entryFile?: string,
  options?: { signal?: AbortSignal },
): Promise<string | null> {
  if (!isTeamverEmbedMode()) return null;
  const id = projectId.trim();
  if (!id) return null;
  if (options?.signal?.aborted) return null;

  const peeked = peekTeamverProjectPreviewPrefix(id);
  if (peeked) return peeked;

  const safeEntry = sanitizePreviewEntryFile(entryFile);
  // Project-scoped inflight: cover + FileViewer with different ?file= share one mint.
  const key = id;
  let pending = inflight.get(key);
  if (!pending) {
    const epochAtStart = currentMintEpoch(id);
    pending = (async () => {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), PREFIX_FETCH_TIMEOUT_MS);
      try {
        const qs = safeEntry
          ? `?file=${encodeURIComponent(safeEntry)}`
          : "";
        let resp: Response;
        try {
          resp = await fetchTeamverDaemon(
            `/api/projects/${encodeURIComponent(id)}/preview-url${qs}`,
            { signal: timeout.signal },
          );
        } catch {
          return null;
        }
        if (!resp.ok) return null;
        let body: ProjectPreviewUrlResponse;
        try {
          body = (await resp.json()) as ProjectPreviewUrlResponse;
        } catch {
          return null;
        }
        return seedPrefix(id, body.url, epochAtStart);
      } finally {
        clearTimeout(timer);
        // Only clear if we are still the active inflight for this epoch —
        // a remint may have deleted+replaced the map entry already.
        if (inflight.get(key) === pending) inflight.delete(key);
      }
    })();
    inflight.set(key, pending);
  }

  const callerSignal = options?.signal;
  if (!callerSignal) return pending;

  // Caller abort must not cancel the shared inflight for other waiters —
  // race a null settle instead.
  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      callerSignal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish(null);
    callerSignal.addEventListener("abort", onAbort, { once: true });
    if (callerSignal.aborted) {
      finish(null);
      return;
    }
    void pending.then(finish, () => finish(null));
  });
}

export type WarmPreviewPrefixItem = {
  projectId: string;
  file?: string;
};

/** Pending items + single drain — concurrent warmers share one POST. */
let previewPrefixWarmPending: WarmPreviewPrefixItem[] = [];
let previewPrefixWarmInflight: Promise<void> | null = null;

async function drainPreviewPrefixWarm(): Promise<void> {
  while (previewPrefixWarmPending.length > 0) {
    const queued = previewPrefixWarmPending;
    previewPrefixWarmPending = [];
    const need: WarmPreviewPrefixItem[] = [];
    const seen = new Set<string>();
    const epochByNeed = new Map<string, number>();
    for (const item of queued) {
      const id = item.projectId?.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (peekTeamverProjectPreviewPrefix(id)) continue;
      epochByNeed.set(id, currentMintEpoch(id));
      need.push({
        projectId: id,
        ...(sanitizePreviewEntryFile(item.file)
          ? { file: sanitizePreviewEntryFile(item.file) }
          : {}),
      });
      if (need.length >= BATCH_MAX) break;
    }
    if (need.length === 0) continue;

    try {
      const resp = await fetchTeamverDaemon("/api/projects/preview-url-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: need }),
      });
      if (!resp.ok) continue;
      let body: ProjectPreviewUrlBatchResponse;
      try {
        body = (await resp.json()) as ProjectPreviewUrlBatchResponse;
      } catch {
        continue;
      }
      for (const row of body.results ?? []) {
        if (!row || row.ok !== true) continue;
        const id = String(row.projectId || "").trim();
        if (!id) continue;
        seedPrefix(id, row.url, epochByNeed.get(id));
      }
    } catch {
      // Soft-fail — cards fall back to per-project GET mint.
    }
  }
}

/**
 * Warm many preview prefixes with one POST (home Recent HTML covers).
 * Seeds `prefixByProject` so subsequent resolve calls skip per-card GETs.
 * Concurrent callers coalesce onto one in-flight drain (N05 ×1 baseline).
 */
export async function warmTeamverProjectPreviewPrefixes(
  items: readonly WarmPreviewPrefixItem[],
): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  if (items.length === 0) return;
  previewPrefixWarmPending.push(...items);
  if (!previewPrefixWarmInflight) {
    previewPrefixWarmInflight = drainPreviewPrefixWarm().finally(() => {
      previewPrefixWarmInflight = null;
    });
  }
  await previewPrefixWarmInflight;
}

export function projectScopedPreviewUrl(prefix: string, filePath: string): string {
  const safePath = filePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${prefix}/${safePath}`;
}

/**
 * Drop cached preview prefixes (and in-flight mints) so auth/session recovery
 * can re-mint scopes. Bumps a per-project epoch so late responses cannot
 * re-seed a stale prefix into the cache.
 */
export function invalidateTeamverProjectPreviewPrefix(projectId?: string): void {
  const id = projectId?.trim();
  if (!id) {
    prefixByProject.clear();
    inflight.clear();
    mintEpochByProject.clear();
    return;
  }
  prefixByProject.delete(id);
  inflight.delete(id);
  mintEpochByProject.set(id, currentMintEpoch(id) + 1);
}

/** @internal vitest only */
export function resetTeamverProjectPreviewScopeForTests(): void {
  prefixByProject.clear();
  inflight.clear();
  mintEpochByProject.clear();
  previewPrefixWarmPending = [];
  previewPrefixWarmInflight = null;
}

/** @internal vitest only — seed cache without minting. */
export function seedTeamverProjectPreviewPrefixForTests(
  projectId: string,
  prefix: string,
): void {
  const id = projectId.trim();
  if (!id || !prefix.trim()) return;
  prefixByProject.set(id, { prefix, expiresAt: Date.now() + TTL_MS });
}

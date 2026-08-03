import type { ProjectPreviewUrlResponse } from "@open-design/contracts";

import { isTeamverEmbedMode } from "./designApiBase";
import { fetchTeamverDaemon } from "./teamverDaemonHeaders";

const TTL_MS = 50 * 60 * 1000;
/** Bound hung preview-url GETs so HtmlViewer fail-open can settle. */
const PREFIX_FETCH_TIMEOUT_MS = 8_000;
const prefixByProject = new Map<string, { prefix: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string | null>>();

function previewPrefixFromUrl(url: unknown): string | null {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return null;
  const match = /^(\/api\/projects\/[^/]+\/preview\/[^/]+)/u.exec(raw);
  return match?.[1] ?? null;
}

/** Strip cache-bust / fragment so daemon resolves a real project file path. */
export function sanitizePreviewEntryFile(entryFile?: string): string | undefined {
  if (typeof entryFile !== "string") return undefined;
  const cleaned = entryFile.trim().split(/[?#]/u, 1)[0]?.trim() ?? "";
  return cleaned.length > 0 ? cleaned : undefined;
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

  const cached = prefixByProject.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.prefix;

  const safeEntry = sanitizePreviewEntryFile(entryFile);
  const key = safeEntry ? `${id}:${safeEntry}` : id;
  let pending = inflight.get(key);
  if (!pending) {
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
        const prefix = previewPrefixFromUrl(body.url);
        if (!prefix) return null;
        prefixByProject.set(id, { prefix, expiresAt: Date.now() + TTL_MS });
        return prefix;
      } finally {
        clearTimeout(timer);
        inflight.delete(key);
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

export function projectScopedPreviewUrl(prefix: string, filePath: string): string {
  const safePath = filePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${prefix}/${safePath}`;
}

/** Drop cached preview prefixes so auth/session recovery can re-mint scopes. */
export function invalidateTeamverProjectPreviewPrefix(projectId?: string): void {
  const id = projectId?.trim();
  if (!id) {
    prefixByProject.clear();
    return;
  }
  prefixByProject.delete(id);
}

/** @internal vitest only */
export function resetTeamverProjectPreviewScopeForTests(): void {
  prefixByProject.clear();
  inflight.clear();
}

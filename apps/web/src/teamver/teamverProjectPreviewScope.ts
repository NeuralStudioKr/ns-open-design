import type { ProjectPreviewUrlResponse } from "@open-design/contracts";

import { isTeamverEmbedMode } from "./designApiBase";
import { fetchTeamverDaemon } from "./teamverDaemonHeaders";

const TTL_MS = 50 * 60 * 1000;
const prefixByProject = new Map<string, { prefix: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string | null>>();

function previewPrefixFromUrl(url: string): string | null {
  const match = /^(\/api\/projects\/[^/]+\/preview\/[^/]+)/u.exec(url.trim());
  return match?.[1] ?? null;
}

/**
 * Embed-only — mint (or reuse) a daemon preview scope prefix so sandboxed
 * iframe subresources load without nginx session auth_request.
 */
export async function resolveTeamverProjectPreviewPrefix(
  projectId: string,
  entryFile?: string,
): Promise<string | null> {
  if (!isTeamverEmbedMode()) return null;
  const id = projectId.trim();
  if (!id) return null;

  const cached = prefixByProject.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.prefix;

  const key = entryFile ? `${id}:${entryFile}` : id;
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const qs = entryFile
          ? `?file=${encodeURIComponent(entryFile)}`
          : "";
        const resp = await fetchTeamverDaemon(
          `/api/projects/${encodeURIComponent(id)}/preview-url${qs}`,
        );
        if (!resp.ok) return null;
        const body = (await resp.json()) as ProjectPreviewUrlResponse;
        const prefix = previewPrefixFromUrl(body.url);
        if (!prefix) return null;
        prefixByProject.set(id, { prefix, expiresAt: Date.now() + TTL_MS });
        return prefix;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, pending);
  }
  return pending;
}

export function projectScopedPreviewUrl(prefix: string, filePath: string): string {
  const safePath = filePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${prefix}/${safePath}`;
}

/** @internal vitest only */
export function resetTeamverProjectPreviewScopeForTests(): void {
  prefixByProject.clear();
  inflight.clear();
}

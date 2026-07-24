import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  getDesignBffClient,
  shouldSkipTeamverBffAuthCalls,
  withDesignBffCookieAuthRecovery,
} from "./designBffClient";
import { requireActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";
import { assertTeamverDesignAppEnabled } from "./teamverDesignAccess";
import type { TeamverCanvasLaunchHandoff } from "./canvasLaunchHandoff";

export type TeamverCanvasPreview = {
  sessionId: string;
  artifactId: string;
  title?: string;
  preview?: string;
  threadTitle?: string;
  sectionCount?: number;
  headings?: string[];
  updatedAt?: string;
};

type CanvasPreviewResponse = {
  sessionId?: string;
  artifactId?: string;
  title?: string | null;
  preview?: string | null;
  threadTitle?: string | null;
  sectionCount?: number | null;
  headings?: string[] | null;
  updatedAt?: string | null;
};

/**
 * In-memory cache for `fetchTeamverCanvasPreview`. Re-opening the Canvas →
 * Design launch modal (or bouncing Home ↔ project) reuses the enriched
 * preview instead of firing `GET /canvas/preview` again for the same
 * sessionId+artifactId pair. Kept short (a launch flow rarely stretches
 * past a minute) and per-workspace-safe (workspace switches wipe the
 * canvas handoff, so the cache key still lands on a fresh handoff).
 */
const CANVAS_PREVIEW_CACHE_TTL_MS = 60_000;
type CanvasPreviewCacheEntry = {
  fetchedAt: number;
  value: TeamverCanvasPreview | null;
};
const canvasPreviewCache = new Map<string, CanvasPreviewCacheEntry>();
const canvasPreviewInflight = new Map<string, Promise<TeamverCanvasPreview | null>>();

function canvasPreviewCacheKey(
  handoff: Pick<TeamverCanvasLaunchHandoff, "sessionId" | "artifactId">,
): string {
  return `${handoff.sessionId.trim()}::${handoff.artifactId.trim()}`;
}

/** Test-only reset for the canvas-preview in-memory cache. */
export function __resetTeamverCanvasPreviewCacheForTests(): void {
  canvasPreviewCache.clear();
  canvasPreviewInflight.clear();
}

/**
 * Live Canvas meta for one-confirm (no project required).
 * Falls back silently — callers keep URL handoff on failure.
 *
 * Reads through a short-lived in-memory cache keyed on sessionId+artifactId
 * so a user who opens the launch modal twice in a row does not pay for a
 * second BFF round-trip. Cache miss inflights coalesce so parallel opens
 * (Home + ChatComposer both mounting at once) share a single request.
 */
export async function fetchTeamverCanvasPreview(
  handoff: Pick<TeamverCanvasLaunchHandoff, "sessionId" | "artifactId">,
): Promise<TeamverCanvasPreview | null> {
  const key = canvasPreviewCacheKey(handoff);
  const now = Date.now();
  const cached = canvasPreviewCache.get(key);
  if (cached && now - cached.fetchedAt < CANVAS_PREVIEW_CACHE_TTL_MS) {
    return cached.value;
  }
  const inflight = canvasPreviewInflight.get(key);
  if (inflight) return inflight;

  const promise = performTeamverCanvasPreviewFetch(handoff)
    .then((value) => {
      canvasPreviewCache.set(key, { fetchedAt: Date.now(), value });
      return value;
    })
    .finally(() => {
      canvasPreviewInflight.delete(key);
    });
  canvasPreviewInflight.set(key, promise);
  return promise;
}

async function performTeamverCanvasPreviewFetch(
  handoff: Pick<TeamverCanvasLaunchHandoff, "sessionId" | "artifactId">,
): Promise<TeamverCanvasPreview | null> {
  const client = getDesignBffClient();
  if (!client) return null;
  if (shouldSkipTeamverBffAuthCalls()) return null;

  const sessionId = handoff.sessionId.trim();
  const artifactId = handoff.artifactId.trim();
  if (!sessionId || !artifactId) return null;

  try {
    const workspaceId = await requireActiveTeamverWorkspaceId();
    await assertTeamverDesignAppEnabled(workspaceId);

    const query = new URLSearchParams({
      sessionId,
      artifactId,
    });
    const response = await withDesignBffCookieAuthRecovery(() =>
      client.http.get<CanvasPreviewResponse>(`/canvas/preview?${query.toString()}`, {
        workspaceId,
        ...TEAMVER_BFF_REQUEST_OPTIONS,
      }),
    );

    const headings = Array.isArray(response.headings)
      ? response.headings.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
      : [];
    return {
      sessionId: response.sessionId?.trim() || sessionId,
      artifactId: response.artifactId?.trim() || artifactId,
      ...(response.title?.trim() ? { title: response.title.trim() } : {}),
      ...(response.preview?.trim() ? { preview: response.preview.trim() } : {}),
      ...(response.threadTitle?.trim() ? { threadTitle: response.threadTitle.trim() } : {}),
      ...(typeof response.sectionCount === "number" && response.sectionCount > 0
        ? { sectionCount: response.sectionCount }
        : {}),
      ...(headings.length > 0 ? { headings } : {}),
      ...(response.updatedAt?.trim() ? { updatedAt: response.updatedAt.trim() } : {}),
    };
  } catch (err) {
    // SDK maps 401→AuthenticationError, 403→ForbiddenError — duck-type status.
    if (err instanceof Error) {
      const status = Number((err as { status?: unknown }).status);
      if (status === 401 || status === 403) return null;
    }
    return null;
  }
}

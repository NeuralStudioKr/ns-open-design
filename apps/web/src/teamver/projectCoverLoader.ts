import { isDesignSystemProject } from "../components/design-system-project";
import { fetchProjectFiles } from "../providers/registry";
import type { Project } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";
import { fetchProjectCoverHints, projectCoverFileFromHint } from "./projectCoverHints";
import { PROJECT_LIST_VIEWPORT_BATCH } from "./projectListLimits";
import { pickProjectCoverFile, type ProjectCoverFile } from "./projectPreviewFile";
import { isTeamverEmbedDesignSurfaceEnabled } from "./teamverDesignAccess";

const COVER_FETCH_CACHE_MS = 60_000;
const DEFAULT_COVER_FETCH_CONCURRENCY = 4;
/** Cap concurrent `/files` fallbacks so visible-card resolve cannot stampede. */
const FILES_FALLBACK_CONCURRENCY = 3;
let filesFallbackActive = 0;
const filesFallbackWaiters: Array<() => void> = [];

async function withFilesFallbackSlot<T>(run: () => Promise<T>): Promise<T> {
  if (filesFallbackActive >= FILES_FALLBACK_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      filesFallbackWaiters.push(resolve);
    });
  }
  filesFallbackActive += 1;
  try {
    return await run();
  } finally {
    filesFallbackActive -= 1;
    const next = filesFallbackWaiters.shift();
    if (next) next();
  }
}

export type ResolveProjectCoverOptions = {
  /** When false, stop after cover-hints/metadata — skip full `/files` listing. */
  allowFilesFallback?: boolean;
};

/** Embed warm/prefetch may stay hints-only; visible cards still use `/files` fallback. */
export function embedProjectCoverHintsOnly(): boolean {
  return isTeamverEmbedMode() && isTeamverEmbedDesignSurfaceEnabled();
}

/**
 * Warm / first-viewport cover-hints batch — no `/files` fan-out.
 * Visible DesignsTab thumbs must NOT use this (see `useLazyProjectCover`).
 */
export function resolveProjectCoverOptionsForListSurface(): ResolveProjectCoverOptions {
  return embedProjectCoverHintsOnly() ? { allowFilesFallback: false } : {};
}

/**
 * Home recent rail — bounded at HOME_RECENT_LIST_LIMIT.
 * Always allow `/files` after hints miss so thumbs stay painted when cover-hints
 * are empty/fail. Concurrency is capped by HOME_COVER_FETCH_CONCURRENCY.
 */
export function resolveProjectCoverOptionsForHomeSurface(): ResolveProjectCoverOptions {
  return { allowFilesFallback: true };
}

type CoverCacheEntry = {
  cover: ProjectCoverFile | null;
  at: number;
  /** True when null was cached from hints-only resolve — `/files` may still succeed. */
  hintsOnlyMiss?: boolean;
};

const coverCache = new Map<string, CoverCacheEntry>();
const inflight = new Map<string, Promise<ProjectCoverFile | null>>();
const pendingHintIds = new Set<string>();
const hintCheckedAt = new Map<string, number>();
let activeHintBatch: Promise<void> | null = null;

function hintsCheckedRecently(id: string): boolean {
  const at = hintCheckedAt.get(id);
  return at !== undefined && Date.now() - at < COVER_FETCH_CACHE_MS;
}

function markHintsChecked(ids: string[]): void {
  const now = Date.now();
  for (const id of ids) hintCheckedAt.set(id, now);
}

/** True when project card cover cannot be resolved from metadata alone. */
export function projectNeedsCoverFileFetch(project: Project): boolean {
  if (isDesignSystemProject(project)) return true;
  const entry = project.metadata?.entryFile?.trim();
  if (!entry) return true;
  const isDeckProject =
    project.metadata?.kind === "deck" || project.metadata?.skipDiscoveryBrief === true;
  // Deck HTML covers always fetch cover-hints for `coverVersion` cache-busting
  // (trusted entryFile alone yields a stale path-stable thumb after edits).
  // Bad Canvas entry pins also re-resolve so deck*.html can win.
  if (isDeckProject && /\.html?$/i.test(entry)) {
    return true;
  }
  return false;
}

type ProjectCoverClearListener = (projectId: string | null) => void;
const projectCoverClearListeners = new Set<ProjectCoverClearListener>();

/** Subscribe to cover-cache clears so list cards can drop stale overrides. */
export function subscribeProjectCoverClear(
  listener: ProjectCoverClearListener,
): () => void {
  projectCoverClearListeners.add(listener);
  return () => {
    projectCoverClearListeners.delete(listener);
  };
}

function notifyProjectCoverClear(projectId: string | null): void {
  for (const listener of projectCoverClearListeners) {
    try {
      listener(projectId);
    } catch {
      // Listener failures must not break cache maintenance.
    }
  }
}

export function clearProjectCoverCache(projectId?: string): void {
  if (projectId?.trim()) {
    const id = projectId.trim();
    coverCache.delete(id);
    inflight.delete(id);
    pendingHintIds.delete(id);
    hintCheckedAt.delete(id);
    notifyProjectCoverClear(id);
    return;
  }
  coverCache.clear();
  inflight.clear();
  pendingHintIds.clear();
  hintCheckedAt.clear();
  activeHintBatch = null;
  notifyProjectCoverClear(null);
}

/** Apply batch cover-hints (metadata / shallow scan) without listing all files. */
export function seedProjectCoverHints(covers: Record<string, ProjectCoverFile | null>): void {
  const now = Date.now();
  for (const [projectId, cover] of Object.entries(covers)) {
    const existing = coverCache.get(projectId);
    if (existing?.cover && !cover) continue;
    if (existing?.cover && cover && projectCoverFileEqual(existing.cover, cover)) {
      coverCache.set(projectId, { ...existing, at: now });
      continue;
    }
    coverCache.set(projectId, {
      cover,
      at: now,
      ...(cover === null ? { hintsOnlyMiss: true } : {}),
    });
  }
}

/**
 * Enqueue cover-hints for many cards and drain via the shared coalesced batch
 * (max PROJECT_LIST_VIEWPORT_BATCH per HTTP). Prefetch + lazy resolve share
 * the same queue so warmEmbed cannot double-hit /cover-hints.
 */
function coverHintCacheFresh(cached: CoverCacheEntry | undefined): boolean {
  if (!cached) return false;
  if (Date.now() - cached.at >= COVER_FETCH_CACHE_MS) return false;
  // Positive cover or an explicit hints-only miss both count as "already hinted".
  return Boolean(cached.cover) || Boolean(cached.hintsOnlyMiss);
}

export async function prefetchProjectCoverHintsForProjects(
  projects: Project[],
): Promise<void> {
  for (const project of projects) {
    if (!projectNeedsCoverFileFetch(project)) continue;
    const id = project.id.trim();
    if (!id || hintsCheckedRecently(id)) continue;
    if (coverHintCacheFresh(coverCache.get(id))) continue;
    pendingHintIds.add(id);
  }
  if (pendingHintIds.size === 0) return;
  await ensureCoverHintBatch();
}

/** Seed batch results including null → hintsOnlyMiss (avoids ambiguous cache gaps). */
function seedCoverHintResults(hints: Record<string, ProjectCoverFile | null>): void {
  if (Object.keys(hints).length === 0) return;
  seedProjectCoverHints(hints);
}

async function drainCoverHintBatch(): Promise<void> {
  while (pendingHintIds.size > 0) {
    const missing = [...pendingHintIds]
      .filter((id) => {
        if (hintsCheckedRecently(id)) return false;
        return !coverHintCacheFresh(coverCache.get(id));
      })
      .slice(0, PROJECT_LIST_VIEWPORT_BATCH);
    for (const id of missing) {
      pendingHintIds.delete(id);
    }
    if (missing.length === 0) {
      pendingHintIds.clear();
      continue;
    }

    const hints = await fetchProjectCoverHints(missing);
    markHintsChecked(missing);
    seedCoverHintResults(
      Object.fromEntries(
        missing.map((id) => [id, hints[id] ? projectCoverFileFromHint(hints[id]!) : null] as const),
      ),
    );
  }
}

async function ensureCoverHintBatch(): Promise<void> {
  if (!activeHintBatch) {
    activeHintBatch = (async () => {
      await new Promise<void>((resolve) => {
        queueMicrotask(() => resolve());
      });
      await drainCoverHintBatch();
    })().finally(() => {
      activeHintBatch = null;
    });
  }
  await activeHintBatch;
}

function projectCoverFileEqual(
  left: ProjectCoverFile | null | undefined,
  right: ProjectCoverFile | null | undefined,
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.kind === right.kind && left.name === right.name && left.version === right.version;
}

/** @internal vitest only */
export function resetProjectCoverLoaderStateForTests(): void {
  clearProjectCoverCache();
  filesFallbackActive = 0;
  filesFallbackWaiters.length = 0;
}

export async function resolveProjectCoverFile(
  project: Project,
  options: ResolveProjectCoverOptions = {},
): Promise<ProjectCoverFile | null> {
  const allowFilesFallback = options.allowFilesFallback !== false;
  if (!projectNeedsCoverFileFetch(project)) return null;

  const id = project.id.trim();
  if (!id) return null;

  const cached = coverCache.get(id);
  if (cached && Date.now() - cached.at < COVER_FETCH_CACHE_MS) {
    if (cached.cover) return cached.cover;
    if (!cached.hintsOnlyMiss || !allowFilesFallback) {
      return null;
    }
  }

  const existing = inflight.get(id);
  if (existing) return existing;

  const run = (async () => {
    try {
      if (!hintsCheckedRecently(id)) {
        pendingHintIds.add(id);
        await ensureCoverHintBatch();
      }

      const hinted = coverCache.get(id);
      if (hinted?.cover && Date.now() - hinted.at < COVER_FETCH_CACHE_MS) {
        return hinted.cover;
      }

      if (!allowFilesFallback) {
        coverCache.set(id, { cover: null, at: Date.now(), hintsOnlyMiss: true });
        return null;
      }

      return withFilesFallbackSlot(async () => {
        const files = await fetchProjectFiles(id);
        const cover = pickProjectCoverFile(project, files);
        coverCache.set(id, { cover, at: Date.now(), hintsOnlyMiss: false });
        return cover;
      });
    } catch {
      coverCache.set(id, { cover: null, at: Date.now(), hintsOnlyMiss: false });
      return null;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, run);
  return run;
}

export async function resolveProjectCoverFiles(
  projects: Project[],
  options: ResolveProjectCoverOptions & { concurrency?: number } = {},
): Promise<Record<string, ProjectCoverFile | null>> {
  const { concurrency: concurrencyOption, ...resolveOptions } = options;
  const concurrency = Math.max(1, concurrencyOption ?? DEFAULT_COVER_FETCH_CONCURRENCY);
  const result: Record<string, ProjectCoverFile | null> = {};
  const toFetch: Project[] = [];

  for (const project of projects) {
    if (!projectNeedsCoverFileFetch(project)) {
      result[project.id] = null;
      continue;
    }
    toFetch.push(project);
  }

  await mapPool(toFetch, concurrency, async (project) => {
    result[project.id] = await resolveProjectCoverFile(project, resolveOptions);
  });

  return result;
}

async function mapPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (current === undefined) return;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

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

export type ResolveProjectCoverOptions = {
  /** When false, stop after cover-hints/metadata — skip full `/files` listing. */
  allowFilesFallback?: boolean;
};

/** Embed project list cards — cover-hints + metadata only; no per-card `/files` listing. */
export function embedProjectCoverHintsOnly(): boolean {
  return isTeamverEmbedMode() && isTeamverEmbedDesignSurfaceEnabled();
}

export function resolveProjectCoverOptionsForListSurface(): ResolveProjectCoverOptions {
  return embedProjectCoverHintsOnly() ? { allowFilesFallback: false } : {};
}

/** Home recent rail — bounded at HOME_RECENT_LIST_LIMIT; may use /files when hints miss. */
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
  return !project.metadata?.entryFile;
}

export function clearProjectCoverCache(projectId?: string): void {
  if (projectId?.trim()) {
    const id = projectId.trim();
    coverCache.delete(id);
    inflight.delete(id);
    pendingHintIds.delete(id);
    hintCheckedAt.delete(id);
    return;
  }
  coverCache.clear();
  inflight.clear();
  pendingHintIds.clear();
  hintCheckedAt.clear();
  activeHintBatch = null;
}

/** Apply batch cover-hints (metadata / shallow scan) without listing all files. */
export function seedProjectCoverHints(covers: Record<string, ProjectCoverFile | null>): void {
  const now = Date.now();
  for (const [projectId, cover] of Object.entries(covers)) {
    if (coverCache.has(projectId)) continue;
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
export async function prefetchProjectCoverHintsForProjects(
  projects: Project[],
): Promise<void> {
  for (const project of projects) {
    if (!projectNeedsCoverFileFetch(project)) continue;
    const id = project.id.trim();
    if (!id || hintsCheckedRecently(id)) continue;
    const cached = coverCache.get(id);
    if (cached?.cover && Date.now() - cached.at < COVER_FETCH_CACHE_MS) continue;
    pendingHintIds.add(id);
  }
  if (pendingHintIds.size === 0) return;
  await ensureCoverHintBatch();
}

function seedPositiveCoverHints(hints: Record<string, ProjectCoverFile | null>): void {
  const positive: Record<string, ProjectCoverFile | null> = {};
  for (const [projectId, cover] of Object.entries(hints)) {
    if (cover) positive[projectId] = cover;
  }
  if (Object.keys(positive).length > 0) {
    seedProjectCoverHints(positive);
  }
}

async function drainCoverHintBatch(): Promise<void> {
  while (pendingHintIds.size > 0) {
    const missing = [...pendingHintIds]
      .filter((id) => {
        if (hintsCheckedRecently(id)) return false;
        const cached = coverCache.get(id);
        return !cached?.cover || Date.now() - cached.at >= COVER_FETCH_CACHE_MS;
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
    seedPositiveCoverHints(
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

/** @internal vitest only */
export function resetProjectCoverLoaderStateForTests(): void {
  clearProjectCoverCache();
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

      const files = await fetchProjectFiles(id);
      const cover = pickProjectCoverFile(project, files);
      coverCache.set(id, { cover, at: Date.now(), hintsOnlyMiss: false });
      return cover;
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

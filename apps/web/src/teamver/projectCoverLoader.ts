import { isDesignSystemProject } from "../components/design-system-project";
import { fetchProjectFiles } from "../providers/registry";
import type { Project } from "../types";
import { fetchProjectCoverHints, projectCoverFileFromHint } from "./projectCoverHints";
import { PROJECT_LIST_VIEWPORT_BATCH } from "./projectListLimits";
import { pickProjectCoverFile, type ProjectCoverFile } from "./projectPreviewFile";

const COVER_FETCH_CACHE_MS = 60_000;
const DEFAULT_COVER_FETCH_CONCURRENCY = 4;

const coverCache = new Map<string, { cover: ProjectCoverFile | null; at: number }>();
const inflight = new Map<string, Promise<ProjectCoverFile | null>>();
const pendingHintIds = new Set<string>();
let activeHintBatch: Promise<void> | null = null;

/** True when project card cover cannot be resolved from metadata alone. */
export function projectNeedsCoverFileFetch(project: Project): boolean {
  if (isDesignSystemProject(project)) return true;
  return !project.metadata?.entryFile;
}

export function clearProjectCoverCache(projectId?: string): void {
  if (projectId?.trim()) {
    coverCache.delete(projectId.trim());
    inflight.delete(projectId.trim());
    pendingHintIds.delete(projectId.trim());
    return;
  }
  coverCache.clear();
  inflight.clear();
  pendingHintIds.clear();
  activeHintBatch = null;
}

/** Apply batch cover-hints (metadata / shallow scan) without listing all files. */
export function seedProjectCoverHints(covers: Record<string, ProjectCoverFile | null>): void {
  const now = Date.now();
  for (const [projectId, cover] of Object.entries(covers)) {
    if (coverCache.has(projectId)) continue;
    coverCache.set(projectId, { cover, at: now });
  }
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
        const cached = coverCache.get(id);
        return !cached || Date.now() - cached.at >= COVER_FETCH_CACHE_MS;
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
    seedPositiveCoverHints(
      Object.fromEntries(
        missing.map((id) => [id, hints[id] ? projectCoverFileFromHint(hints[id]!) : null] as const),
      ),
    );
  }
}

async function ensureCoverHintBatch(): Promise<void> {
  if (!activeHintBatch) {
    activeHintBatch = drainCoverHintBatch().finally(() => {
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
): Promise<ProjectCoverFile | null> {
  if (!projectNeedsCoverFileFetch(project)) return null;

  const id = project.id.trim();
  if (!id) return null;

  const cached = coverCache.get(id);
  if (cached && Date.now() - cached.at < COVER_FETCH_CACHE_MS) {
    return cached.cover;
  }

  const existing = inflight.get(id);
  if (existing) return existing;

  const run = (async () => {
    try {
      pendingHintIds.add(id);
      await ensureCoverHintBatch();

      const hinted = coverCache.get(id);
      if (hinted && Date.now() - hinted.at < COVER_FETCH_CACHE_MS && hinted.cover) {
        return hinted.cover;
      }

      const files = await fetchProjectFiles(id);
      const cover = pickProjectCoverFile(project, files);
      coverCache.set(id, { cover, at: Date.now() });
      return cover;
    } catch {
      coverCache.set(id, { cover: null, at: Date.now() });
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
  options: { concurrency?: number } = {},
): Promise<Record<string, ProjectCoverFile | null>> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_COVER_FETCH_CONCURRENCY);
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
    result[project.id] = await resolveProjectCoverFile(project);
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

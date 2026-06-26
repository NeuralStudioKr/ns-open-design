import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { MaterializingProjectStorage } from './materializing-project-storage.js';

/** Lazy-only materialized projects — evict when idle (no active run). */
export function scratchIdleEvictEnabled(): boolean {
  const raw = (process.env.OD_SCRATCH_EVICT_IDLE ?? '').trim();
  if (raw === '0') return false;
  if (raw === '1') return true;
  return process.env.OD_SCRATCH_EVICT_AFTER_RUN === '1';
}

export function scratchIdleEvictAfterMs(): number {
  const raw = (process.env.OD_SCRATCH_EVICT_IDLE_AFTER_MS ?? '').trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const lazyRaw = (process.env.OD_PROJECT_LAZY_SYNC_TTL_MS ?? '').trim();
  const lazy = lazyRaw ? Number(lazyRaw) : NaN;
  if (Number.isFinite(lazy) && lazy > 0) {
    return Math.max(lazy * 2, lazy + 30_000);
  }
  return 120_000;
}

export type IdleScratchEvictResult = {
  evicted: string[];
  skippedActive: string[];
  skippedRecent: string[];
  skippedSyncFailed: string[];
};

/**
 * Remove scratch/projects/<id> when the directory mtime is older than idleAfterMs
 * and no chat run is active on that project.
 */
export async function evictIdleScratchProjects(options: {
  projectsDir: string;
  storage: MaterializingProjectStorage;
  isActiveProject: (projectId: string) => boolean;
  /** Skip projects whose last sync-up failed (scratch may be only copy). */
  shouldSkipEvict?: (projectId: string) => boolean;
  idleAfterMs?: number;
  nowMs?: number;
  /** Serialize with sync-up/sync-down (project-materialization-runtime). */
  withProjectLock?: <T>(projectId: string, fn: () => Promise<T>) => Promise<T>;
}): Promise<IdleScratchEvictResult> {
  const idleAfterMs = options.idleAfterMs ?? scratchIdleEvictAfterMs();
  const nowMs = options.nowMs ?? Date.now();
  const result: IdleScratchEvictResult = {
    evicted: [],
    skippedActive: [],
    skippedRecent: [],
    skippedSyncFailed: [],
  };

  let entries: string[];
  try {
    entries = await fsp.readdir(options.projectsDir);
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as NodeJS.ErrnoException).code) : '';
    if (code === 'ENOENT') return result;
    throw err;
  }

  for (const name of entries) {
    const projectId = name.trim();
    if (!projectId) continue;
    const projectPath = path.join(options.projectsDir, projectId);
    let stat;
    try {
      stat = await fsp.stat(projectPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const evictIfIdle = async (): Promise<void> => {
      if (options.isActiveProject(projectId)) {
        result.skippedActive.push(projectId);
        return;
      }
      if (options.shouldSkipEvict?.(projectId)) {
        result.skippedSyncFailed.push(projectId);
        return;
      }
      let latestStat;
      try {
        latestStat = await fsp.stat(projectPath);
      } catch {
        return;
      }
      const idleMs = nowMs - latestStat.mtimeMs;
      if (idleMs < idleAfterMs) {
        result.skippedRecent.push(projectId);
        return;
      }

      await options.storage.evictScratchProject(projectId);
      result.evicted.push(projectId);
      console.info(
        JSON.stringify({
          metric: 'od_scratch_idle_evicted',
          projectId,
          idleMs: Math.round(idleMs),
          idleAfterMs,
        }),
      );
    };

    if (options.withProjectLock) {
      await options.withProjectLock(projectId, evictIfIdle);
    } else {
      await evictIfIdle();
    }
  }

  if (result.evicted.length > 0) {
    console.info(
      `[project-materialization] idle scratch evict: ${result.evicted.length} project(s) — ${result.evicted.join(', ')}`,
    );
  }

  return result;
}

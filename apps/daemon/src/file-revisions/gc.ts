// Periodic GC for file revision snapshots (undo/redo history bytes).
//
// Owns count retention, byte compaction, and orphan cleanup. Push schedules
// batched deferred sweeps (retention + compaction via PUSH_PRUNE_MAX); this
// worker is the authoritative safety net on a fixed interval. Sweeps:
//   - orphan BLOB rows (metadata deleted, snapshot left behind)
//   - global per-file retention (uncapped)
//   - deferred snapshot byte compaction (uncapped)
//   - orphan `.od/revisions/*` files on disk (files mode / migration leftovers)
//   - optional SQLite VACUUM when enough bytes were reclaimed
//
// Disabled when `OD_FILE_REVISION_GC_INTERVAL_MS` is `0`.

import type Database from 'better-sqlite3';
import {
  collectFileRevisionStorageStats,
  runFileRevisionGc,
  type FileRevisionGcResult,
} from './maintenance.js';
import { updateFileRevisionMetrics, markFileRevisionGcSuccess } from './metrics.js';
import {
  resolveFileRevisionSnapshotStorage,
} from './snapshot-storage.js';

export interface FileRevisionGcWorkerOptions {
  db: Database.Database;
  projectsRoot: string;
  resolveProjectDir: (projectId: string) => string;
  sqliteDbFile?: string;
  intervalMs?: number;
  vacuumSqlite?: boolean;
  logger?: (msg: string, meta?: Record<string, unknown>) => void;
  onTick?: (result: FileRevisionGcResult) => void;
}

export interface FileRevisionGcHandle {
  stop(): void;
  sweep(): Promise<FileRevisionGcResult>;
  stats(): Promise<Awaited<ReturnType<typeof collectFileRevisionStorageStats>>>;
}

const NOOP_HANDLE: FileRevisionGcHandle = {
  stop: () => undefined,
  sweep: async () => ({
    orphanSnapshotsRemoved: 0,
    orphanSnapshotBytesReclaimed: 0,
    retentionRevisionsPruned: 0,
    globalBudgetRevisionsPruned: 0,
    globalBudgetBytesReclaimed: 0,
    orphanFilesRemoved: 0,
    vacuum: null,
  }),
  stats: async () => ({
    revisionRowCount: 0,
    snapshotRowCount: 0,
    orphanSnapshotRowCount: 0,
    totalSnapshotBytes: 0,
    storageMode: resolveFileRevisionSnapshotStorage(),
  }),
};

export function resolveFileRevisionGcIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OD_FILE_REVISION_GC_INTERVAL_MS;
  if (raw == null || raw.trim() === '') return 6 * 60 * 60 * 1000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 6 * 60 * 60 * 1000;
  return parsed;
}

export function resolveFileRevisionGcVacuumEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.OD_FILE_REVISION_GC_VACUUM ?? '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  // Default on for sqlite snapshot mode — BLOB deletes need VACUUM to shrink the file.
  return resolveFileRevisionSnapshotStorage(env) === 'sqlite';
}

let lastVacuumAtMs: number | null = null;

export function startFileRevisionGc(opts: FileRevisionGcWorkerOptions): FileRevisionGcHandle {
  const intervalMs = opts.intervalMs ?? resolveFileRevisionGcIntervalMs();
  const log = opts.logger ?? defaultLogger;
  const vacuumSqlite = opts.vacuumSqlite ?? resolveFileRevisionGcVacuumEnabled();

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    log('[file-revisions] GC disabled (OD_FILE_REVISION_GC_INTERVAL_MS <= 0)');
    return NOOP_HANDLE;
  }

  const sweep = async (): Promise<FileRevisionGcResult> => runFileRevisionGc({
    db: opts.db,
    projectsRoot: opts.projectsRoot,
    resolveProjectDir: opts.resolveProjectDir,
    vacuumSqlite,
    ...(opts.sqliteDbFile ? { sqliteDbFile: opts.sqliteDbFile } : {}),
    ...(lastVacuumAtMs != null ? { lastVacuumAtMs } : {}),
  });

  const tick = () => {
    void sweep().then(async (result) => {
      if (
        result.orphanSnapshotsRemoved > 0
        || result.retentionRevisionsPruned > 0
        || result.globalBudgetRevisionsPruned > 0
        || result.orphanFilesRemoved > 0
        || result.vacuum
      ) {
        log('[file-revisions] GC sweep', result as unknown as Record<string, unknown>);
      }
      if (result.vacuum) {
        lastVacuumAtMs = Date.now();
      }
      try {
        const stats = await collectFileRevisionStorageStats(opts.db, opts.projectsRoot);
        updateFileRevisionMetrics(stats);
        markFileRevisionGcSuccess();
      } catch (err) {
        log(`[file-revisions] GC metrics update failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      opts.onTick?.(result);
    }).catch((err) => {
      log(`[file-revisions] GC tick failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();

  return {
    stop: () => {
      clearInterval(timer);
    },
    sweep,
    stats: () => collectFileRevisionStorageStats(opts.db, opts.projectsRoot),
  };
}

function defaultLogger(msg: string, meta?: Record<string, unknown>): void {
  if (meta) {
    console.info(msg, meta);
  } else {
    console.info(msg);
  }
}

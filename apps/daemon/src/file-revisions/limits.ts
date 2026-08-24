import {
  FILE_REVISION_MAX_SNAPSHOT_BYTES_DEFAULT,
  FILE_REVISION_MAX_TOTAL_BYTES_DEFAULT,
} from '@open-design/contracts';

export function resolveFileRevisionMaxSnapshotBytes(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.OD_FILE_REVISION_MAX_SNAPSHOT_BYTES;
  if (raw == null || raw.trim() === '') return FILE_REVISION_MAX_SNAPSHOT_BYTES_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 64 * 1024) return FILE_REVISION_MAX_SNAPSHOT_BYTES_DEFAULT;
  return Math.min(parsed, 64 * 1024 * 1024);
}

/** 0 disables the global byte budget (unlimited). */
export function resolveFileRevisionMaxTotalBytes(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.OD_FILE_REVISION_MAX_TOTAL_BYTES;
  if (raw == null || raw.trim() === '') return FILE_REVISION_MAX_TOTAL_BYTES_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return FILE_REVISION_MAX_TOTAL_BYTES_DEFAULT;
  return parsed;
}

export const FILE_REVISION_MAX_SNAPSHOT_BYTES = resolveFileRevisionMaxSnapshotBytes();
export const FILE_REVISION_MAX_TOTAL_BYTES = resolveFileRevisionMaxTotalBytes();

/** Hard safety ceiling for a single uncompressed revision push (not a soft prune target). */
export const FILE_REVISION_ABSOLUTE_MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;

/** Max revision rows deleted per deferred sweep pass (count retention + byte compaction). */
export function resolveFileRevisionPushPruneMax(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.OD_FILE_REVISION_PUSH_PRUNE_MAX;
  if (raw == null || raw.trim() === '') return 8;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 8;
  return Math.min(parsed, 100);
}

export const FILE_REVISION_PUSH_PRUNE_MAX = resolveFileRevisionPushPruneMax();

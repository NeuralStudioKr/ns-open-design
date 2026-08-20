import { Gauge, register } from 'prom-client';

import type { FileRevisionStorageStats } from './maintenance.js';

export const fileRevisionSnapshotBytes = new Gauge({
  name: 'od_file_revision_snapshot_bytes',
  help: 'Total stored revision snapshot bytes (compressed BLOB / sqlite).',
  registers: [register],
});

export const fileRevisionSnapshotRows = new Gauge({
  name: 'od_file_revision_snapshot_rows',
  help: 'Total revision snapshot rows in DaemonDb.',
  registers: [register],
});

export const fileRevisionOrphanSnapshotRows = new Gauge({
  name: 'od_file_revision_orphan_snapshot_rows',
  help: 'Snapshot rows with no matching file_revisions metadata row.',
  registers: [register],
});

export const fileRevisionMetadataRows = new Gauge({
  name: 'od_file_revision_metadata_rows',
  help: 'Total file_revisions metadata rows.',
  registers: [register],
});

export const fileRevisionRetentionDeferredExcess = new Gauge({
  name: 'od_file_revision_retention_deferred_excess',
  help: 'Revision rows still over per-file retention after the latest deferred sweep.',
  registers: [register],
});

export const fileRevisionDeferredSweepQueueDepth = new Gauge({
  name: 'od_file_revision_deferred_sweep_queue_depth',
  help: 'Pending deferred retention/compaction sweep work items.',
  registers: [register],
});

export const fileRevisionGcLastSuccessUnix = new Gauge({
  name: 'od_file_revision_gc_last_success_unix',
  help: 'Unix timestamp of the last successful periodic GC sweep.',
  registers: [register],
});

export function updateFileRevisionMetrics(stats: FileRevisionStorageStats): void {
  const diskBytes = stats.diskSnapshotBytes ?? 0;
  fileRevisionSnapshotBytes.set(stats.totalSnapshotBytes + diskBytes);
  fileRevisionSnapshotRows.set(stats.snapshotRowCount);
  fileRevisionOrphanSnapshotRows.set(stats.orphanSnapshotRowCount);
  fileRevisionMetadataRows.set(stats.revisionRowCount);
}

export function updateFileRevisionDeferredMetrics(input: {
  queueDepth: number;
  retentionDeferredExcess: number;
}): void {
  fileRevisionDeferredSweepQueueDepth.set(input.queueDepth);
  fileRevisionRetentionDeferredExcess.set(input.retentionDeferredExcess);
}

export function markFileRevisionGcSuccess(atMs: number = Date.now()): void {
  fileRevisionGcLastSuccessUnix.set(Math.floor(atMs / 1000));
}

export function __resetFileRevisionMetricsForTests(): void {
  fileRevisionSnapshotBytes.reset();
  fileRevisionSnapshotRows.reset();
  fileRevisionOrphanSnapshotRows.reset();
  fileRevisionMetadataRows.reset();
  fileRevisionRetentionDeferredExcess.reset();
  fileRevisionDeferredSweepQueueDepth.reset();
  fileRevisionGcLastSuccessUnix.reset();
}

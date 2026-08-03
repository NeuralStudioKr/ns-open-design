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

export function updateFileRevisionMetrics(stats: FileRevisionStorageStats): void {
  fileRevisionSnapshotBytes.set(stats.totalSnapshotBytes);
  fileRevisionSnapshotRows.set(stats.snapshotRowCount);
  fileRevisionOrphanSnapshotRows.set(stats.orphanSnapshotRowCount);
  fileRevisionMetadataRows.set(stats.revisionRowCount);
}

export function __resetFileRevisionMetricsForTests(): void {
  fileRevisionSnapshotBytes.reset();
  fileRevisionSnapshotRows.reset();
  fileRevisionOrphanSnapshotRows.reset();
  fileRevisionMetadataRows.reset();
}

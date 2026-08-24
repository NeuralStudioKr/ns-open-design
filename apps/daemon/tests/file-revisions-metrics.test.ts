import { register } from 'prom-client';
import { describe, expect, it } from 'vitest';
import {
  __resetFileRevisionMetricsForTests,
  updateFileRevisionMetrics,
} from '../src/file-revisions/metrics.js';

describe('file revision prometheus metrics', () => {
  it('publishes storage stats gauges', async () => {
    __resetFileRevisionMetricsForTests();
    updateFileRevisionMetrics({
      revisionRowCount: 3,
      snapshotRowCount: 3,
      orphanSnapshotRowCount: 1,
      totalSnapshotBytes: 4096,
      storageMode: 'sqlite',
    });
    const metrics = await register.getMetricsAsJSON();
    const value = (name: string) => metrics.find((metric) => metric.name === name)?.values[0]?.value;
    expect(value('od_file_revision_snapshot_bytes')).toBe(4096);
    expect(value('od_file_revision_snapshot_rows')).toBe(3);
    expect(value('od_file_revision_orphan_snapshot_rows')).toBe(1);
    expect(value('od_file_revision_metadata_rows')).toBe(3);
  });
});

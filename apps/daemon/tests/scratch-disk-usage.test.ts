import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildScratchDiskUsageMarker,
  measureScratchDiskUsage,
  scratchDiskMetricsEnabled,
} from '../src/storage/scratch-disk-usage.js';

describe('scratch-disk-usage', () => {
  let root: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-scratch-test-'));
    await fs.mkdir(path.join(root, 'projects/p1'), { recursive: true });
    await fs.writeFile(path.join(root, 'projects/p1/a.txt'), 'hello'); // 5 bytes
    await fs.writeFile(path.join(root, 'projects/p1/b.bin'), Buffer.alloc(1024, 0xff)); // 1024 bytes
    await fs.mkdir(path.join(root, 'projects/p2/sub'), { recursive: true });
    await fs.writeFile(path.join(root, 'projects/p2/sub/c.dat'), Buffer.alloc(2048)); // 2048 bytes
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('measureScratchDiskUsage', () => {
    it('walks recursively and sums regular files', async () => {
      const sample = await measureScratchDiskUsage(root);
      expect(sample.files).toBe(3);
      expect(sample.bytes).toBe(5 + 1024 + 2048);
      expect(sample.errors).toBe(0);
    });

    it('returns zero counts when scratch dir is missing', async () => {
      const missing = path.join(root, 'does-not-exist');
      const sample = await measureScratchDiskUsage(missing);
      expect(sample.files).toBe(0);
      expect(sample.bytes).toBe(0);
      expect(sample.errors).toBe(0);
    });

    it('safely skips dangling symlinks without crashing or following them', async () => {
      const bad = path.join(root, 'bad');
      await fs.mkdir(bad, { recursive: true });
      const dangling = path.join(bad, 'dangling');
      await fs.symlink(path.join(bad, 'nope'), dangling);
      const sample = await measureScratchDiskUsage(bad);
      expect(sample.files).toBe(0);
      expect(sample.bytes).toBe(0);
      // walk() treats symlinks (real-file false, real-dir false) as skipped,
      // not as errors — so this also confirms we don't double-count via stat.
      expect(sample.errors).toBe(0);
    });
  });

  describe('buildScratchDiskUsageMarker', () => {
    it('emits the canonical marker with threshold flag', async () => {
      vi.stubEnv('OD_SCRATCH_DISK_THRESHOLD_MB', '1');
      const marker = buildScratchDiskUsageMarker({
        sample: { scratchDir: '/scratch', bytes: 2 * 1024 * 1024, files: 4, errors: 0 },
        stage: 'run_end',
        projectId: 'p1',
        runId: 'r1',
      });
      expect(marker).toEqual({
        metric: 'od_scratch_disk_usage',
        stage: 'run_end',
        scratchDir: '/scratch',
        bytes: 2 * 1024 * 1024,
        files: 4,
        errors: 0,
        projectId: 'p1',
        runId: 'r1',
        thresholdBytes: 1 * 1024 * 1024,
        overThreshold: true,
      });
      vi.unstubAllEnvs();
    });

    it('omits projectId / runId when missing and respects sub-threshold values', () => {
      vi.stubEnv('OD_SCRATCH_DISK_THRESHOLD_MB', '4096');
      const marker = buildScratchDiskUsageMarker({
        sample: { scratchDir: '/x', bytes: 10, files: 1, errors: 0 },
        stage: 'run_end_exception',
      });
      expect(marker.projectId).toBeUndefined();
      expect(marker.runId).toBeUndefined();
      expect(marker.overThreshold).toBe(false);
      expect(marker.thresholdBytes).toBe(4096 * 1024 * 1024);
      vi.unstubAllEnvs();
    });

    it('skips threshold fields when OD_SCRATCH_DISK_THRESHOLD_MB<=0', () => {
      vi.stubEnv('OD_SCRATCH_DISK_THRESHOLD_MB', '0');
      const marker = buildScratchDiskUsageMarker({
        sample: { scratchDir: '/x', bytes: 99, files: 1, errors: 0 },
        stage: 'run_end',
      });
      expect(marker.thresholdBytes).toBeUndefined();
      expect(marker.overThreshold).toBeUndefined();
      vi.unstubAllEnvs();
    });
  });

  describe('scratchDiskMetricsEnabled', () => {
    it('returns true only when OD_SCRATCH_DISK_METRICS=1', () => {
      expect(scratchDiskMetricsEnabled({ OD_SCRATCH_DISK_METRICS: '1' })).toBe(true);
      expect(scratchDiskMetricsEnabled({ OD_SCRATCH_DISK_METRICS: 'true' })).toBe(false);
      expect(scratchDiskMetricsEnabled({})).toBe(false);
    });
  });
});

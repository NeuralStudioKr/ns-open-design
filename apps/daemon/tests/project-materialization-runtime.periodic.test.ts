import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createProjectMaterializationRuntime } from '../src/storage/project-materialization-runtime.js';
import type { ProjectStorageLayout } from '../src/storage/project-storage-layout.js';

describe('createProjectMaterializationRuntime — periodic scratch sampler', () => {
  let scratchRoot: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-runtime-periodic-'));
    await fs.writeFile(path.join(scratchRoot, 'a.txt'), 'abc');
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(async () => {
    infoSpy.mockRestore();
    vi.unstubAllEnvs();
    await fs.rm(scratchRoot, { recursive: true, force: true });
  });

  function s3Layout(): ProjectStorageLayout {
    return {
      mode: 's3',
      scratchDir: scratchRoot,
      projectsDir: path.join(scratchRoot, 'projects'),
    };
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  it('does not start a timer when scratch metrics are disabled', async () => {
    const runtime = createProjectMaterializationRuntime(s3Layout(), null);
    await sleep(120);
    const periodicCalls = infoSpy.mock.calls
      .map((c) => String(c[0] ?? ''))
      .filter((line) => line.includes('"od_scratch_disk_usage"'));
    expect(periodicCalls).toHaveLength(0);
    runtime.dispose();
  });

  it('does not start a timer outside S3 mode even when metrics enabled', async () => {
    vi.stubEnv('OD_SCRATCH_DISK_METRICS', '1');
    const runtime = createProjectMaterializationRuntime(
      { mode: 'local', projectsDir: path.join(scratchRoot, 'projects') },
      null,
    );
    await sleep(120);
    const periodicCalls = infoSpy.mock.calls
      .map((c) => String(c[0] ?? ''))
      .filter((line) => line.includes('"od_scratch_disk_usage"'));
    expect(periodicCalls).toHaveLength(0);
    runtime.dispose();
  });

  it('emits a periodic marker each interval and stops on dispose', async () => {
    vi.stubEnv('OD_SCRATCH_DISK_METRICS', '1');
    vi.stubEnv('OD_SCRATCH_DISK_METRIC_INTERVAL_MS', '40');

    const runtime = createProjectMaterializationRuntime(s3Layout(), null);
    await sleep(150);

    const periodicCalls = infoSpy.mock.calls
      .map((c) => String(c[0] ?? ''))
      .filter((line) => line.includes('"od_scratch_disk_usage"') && line.includes('"stage":"periodic"'));
    expect(periodicCalls.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(periodicCalls[0]!);
    expect(parsed.metric).toBe('od_scratch_disk_usage');
    expect(parsed.stage).toBe('periodic');
    expect(parsed.scratchDir).toBe(scratchRoot);

    runtime.dispose();
    const calls_before_pause = periodicCalls.length;
    await sleep(120);
    const after = infoSpy.mock.calls
      .map((c) => String(c[0] ?? ''))
      .filter((line) => line.includes('"od_scratch_disk_usage"') && line.includes('"stage":"periodic"'));
    expect(after.length).toBe(calls_before_pause);
  });

  it('skips timer setup when OD_SCRATCH_DISK_METRIC_INTERVAL_MS<=0', async () => {
    vi.stubEnv('OD_SCRATCH_DISK_METRICS', '1');
    vi.stubEnv('OD_SCRATCH_DISK_METRIC_INTERVAL_MS', '0');

    const runtime = createProjectMaterializationRuntime(s3Layout(), null);
    await sleep(120);
    const periodicCalls = infoSpy.mock.calls
      .map((c) => String(c[0] ?? ''))
      .filter((line) => line.includes('"od_scratch_disk_usage"'));
    expect(periodicCalls).toHaveLength(0);
    runtime.dispose();
  });
});

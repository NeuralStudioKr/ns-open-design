import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MaterializingProjectStorage } from '../src/storage/materializing-project-storage.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';
import { safelyEvictScratchAfterRun } from '../src/storage/scratch-evict-policy.js';

describe('safelyEvictScratchAfterRun', () => {
  let scratchRoot = '';
  let remoteRoot = '';
  const previousEvict = process.env.OD_SCRATCH_EVICT_AFTER_RUN;

  afterEach(async () => {
    process.env.OD_SCRATCH_EVICT_AFTER_RUN = previousEvict ?? '1';
    await Promise.all([
      scratchRoot ? rm(scratchRoot, { recursive: true, force: true }) : Promise.resolve(),
      remoteRoot ? rm(remoteRoot, { recursive: true, force: true }) : Promise.resolve(),
    ]);
    scratchRoot = '';
    remoteRoot = '';
  });

  async function makeStorage() {
    scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-evict-scratch-'));
    remoteRoot = await mkdtemp(path.join(tmpdir(), 'od-evict-remote-'));
    return new MaterializingProjectStorage(
      new LocalProjectStorage(scratchRoot),
      new LocalProjectStorage(remoteRoot),
    );
  }

  it('evicts empty scratch after successful sync-up with no uploads', async () => {
    process.env.OD_SCRATCH_EVICT_AFTER_RUN = '1';
    const storage = await makeStorage();
    const remote = storage.flatRemote();
    const evict = vi.spyOn(storage, 'evictScratchProject').mockResolvedValue(undefined);

    await safelyEvictScratchAfterRun({
      storage,
      projectId: 'p-empty',
      remote,
      runStartTimeMs: Date.now(),
      syncResult: { uploaded: 0, skipped: 0, failed: 0 },
    });

    expect(evict).toHaveBeenCalledWith('p-empty');
  });

  it('retains scratch when run sync failed', async () => {
    process.env.OD_SCRATCH_EVICT_AFTER_RUN = '1';
    const storage = await makeStorage();
    await storage.writeFile('p1', 'stale.html', Buffer.from('<p>x</p>'));
    const remote = storage.flatRemote();
    const evict = vi.spyOn(storage, 'evictScratchProject').mockResolvedValue(undefined);

    await safelyEvictScratchAfterRun({
      storage,
      projectId: 'p1',
      remote,
      runStartTimeMs: Date.now(),
      syncResult: { uploaded: 0, skipped: 1, failed: 1 },
    });

    expect(evict).not.toHaveBeenCalled();
  });

  it('retains scratch and retries full sync when pre-run files were skipped', async () => {
    process.env.OD_SCRATCH_EVICT_AFTER_RUN = '1';
    const storage = await makeStorage();
    const remote = storage.flatRemote();
    await storage.writeFile('p1', 'index.html', Buffer.from('<p>template</p>'));
    const evict = vi.spyOn(storage, 'evictScratchProject').mockResolvedValue(undefined);
    const infos: string[] = [];
    const infoSpy = vi.spyOn(console, 'info').mockImplementation((m: unknown) => {
      if (typeof m === 'string') infos.push(m);
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await safelyEvictScratchAfterRun({
        storage,
        projectId: 'p1',
        remote,
        runStartTimeMs: Date.now(),
        syncResult: { uploaded: 0, skipped: 1, failed: 0 },
      });

      expect(evict).toHaveBeenCalledWith('p1');
      const remoteStore = new LocalProjectStorage(remoteRoot);
      await expect(remoteStore.readFile('p1', 'index.html')).resolves.toEqual(
        Buffer.from('<p>template</p>'),
      );
      expect(infos.some((line) => line.includes('sync-up retry'))).toBe(true);
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('defers evict when full retry still leaves scratch without remote objects', async () => {
    process.env.OD_SCRATCH_EVICT_AFTER_RUN = '1';
    const storage = await makeStorage();
    await storage.writeFile('p1', 'index.html', Buffer.from('<p>orphan</p>'));
    const remote = storage.flatRemote();
    vi.spyOn(storage, 'syncUp').mockResolvedValue({ uploaded: 0, skipped: 1, failed: 0 });
    const evict = vi.spyOn(storage, 'evictScratchProject').mockResolvedValue(undefined);
    const infos: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((m: unknown) => {
      if (typeof m === 'string') infos.push(m);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await safelyEvictScratchAfterRun({
      storage,
      projectId: 'p1',
      remote,
      runStartTimeMs: Date.now(),
      syncResult: { uploaded: 0, skipped: 1, failed: 0 },
    });

    expect(evict).not.toHaveBeenCalled();
    expect(infos.some((line) => line.includes('"metric":"od_scratch_evict_deferred"'))).toBe(true);
  });
});

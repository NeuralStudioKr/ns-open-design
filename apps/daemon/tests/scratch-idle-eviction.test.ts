import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { LocalProjectStorage } from '../src/storage/project-storage.js';
import { MaterializingProjectStorage } from '../src/storage/materializing-project-storage.js';
import {
  evictIdleScratchProjects,
  scratchIdleEvictAfterMs,
  scratchIdleEvictEnabled,
} from '../src/storage/scratch-idle-eviction.js';

describe('scratch-idle-eviction', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults idle evict on when post-run evict is enabled', () => {
    vi.stubEnv('OD_SCRATCH_EVICT_AFTER_RUN', '1');
    delete process.env.OD_SCRATCH_EVICT_IDLE;
    expect(scratchIdleEvictEnabled()).toBe(true);
  });

  it('respects OD_SCRATCH_EVICT_IDLE=0', () => {
    vi.stubEnv('OD_SCRATCH_EVICT_AFTER_RUN', '1');
    vi.stubEnv('OD_SCRATCH_EVICT_IDLE', '0');
    expect(scratchIdleEvictEnabled()).toBe(false);
  });

  it('derives idle threshold from lazy TTL', () => {
    vi.stubEnv('OD_PROJECT_LAZY_SYNC_TTL_MS', '60000');
    delete process.env.OD_SCRATCH_EVICT_IDLE_AFTER_MS;
    expect(scratchIdleEvictAfterMs()).toBe(120_000);
  });

  describe('evictIdleScratchProjects', () => {
    let scratchRoot: string;
    let projectsDir: string;
    let storage: MaterializingProjectStorage;

    beforeEach(async () => {
      scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-idle-evict-'));
      projectsDir = path.join(scratchRoot, 'projects');
      await fs.mkdir(projectsDir, { recursive: true });
      const fakeRemote = {
        listFiles: async () => [],
        readFile: async () => Buffer.alloc(0),
        writeFile: async () => ({ path: '', size: 0, mtimeMs: 0 }),
        deleteFile: async () => {},
        statFile: async () => null,
      };
      storage = new MaterializingProjectStorage(
        new LocalProjectStorage(projectsDir),
        fakeRemote as never,
      );
    });

    afterEach(async () => {
      await fs.rm(scratchRoot, { recursive: true, force: true });
    });

    it('evicts idle project dirs and skips active ones', async () => {
      const oldDir = path.join(projectsDir, 'p-old');
      const activeDir = path.join(projectsDir, 'p-active');
      await fs.mkdir(oldDir, { recursive: true });
      await fs.mkdir(activeDir, { recursive: true });
      const oldTime = new Date(Date.now() - 300_000);
      await fs.utimes(oldDir, oldTime, oldTime);

      const result = await evictIdleScratchProjects({
        projectsDir,
        storage,
        isActiveProject: (id) => id === 'p-active',
        idleAfterMs: 60_000,
      });

      expect(result.evicted).toEqual(['p-old']);
      expect(result.skippedActive).toEqual(['p-active']);
      await expect(fs.stat(oldDir)).rejects.toThrow();
      await expect(fs.stat(activeDir)).resolves.toBeDefined();
    });

    it('skips recently touched project dirs', async () => {
      const recentDir = path.join(projectsDir, 'p-recent');
      await fs.mkdir(recentDir, { recursive: true });

      const result = await evictIdleScratchProjects({
        projectsDir,
        storage,
        isActiveProject: () => false,
        idleAfterMs: 60_000,
      });

      expect(result.evicted).toHaveLength(0);
      expect(result.skippedRecent).toEqual(['p-recent']);
    });

    it('skips projects flagged with sync failures', async () => {
      const oldDir = path.join(projectsDir, 'p-stale');
      await fs.mkdir(oldDir, { recursive: true });
      const oldTime = new Date(Date.now() - 300_000);
      await fs.utimes(oldDir, oldTime, oldTime);

      const result = await evictIdleScratchProjects({
        projectsDir,
        storage,
        isActiveProject: () => false,
        shouldSkipEvict: (id) => id === 'p-stale',
        idleAfterMs: 60_000,
      });

      expect(result.evicted).toHaveLength(0);
      expect(result.skippedSyncFailed).toEqual(['p-stale']);
      await expect(fs.stat(oldDir)).resolves.toBeDefined();
    });

    it('defers eviction when syncUpBeforeEvict reports failure (unsynced scratch)', async () => {
      const oldDir = path.join(projectsDir, 'p-unsynced');
      await fs.mkdir(oldDir, { recursive: true });
      await fs.writeFile(path.join(oldDir, 'artifact.html'), '<html></html>', 'utf8');
      const oldTime = new Date(Date.now() - 300_000);
      await fs.utimes(oldDir, oldTime, oldTime);

      const calls: string[] = [];
      const result = await evictIdleScratchProjects({
        projectsDir,
        storage,
        isActiveProject: () => false,
        idleAfterMs: 60_000,
        syncUpBeforeEvict: async (id) => {
          calls.push(id);
          return { ok: false, uploaded: 0, failed: 0, reason: 'no_cached_remote' };
        },
      });

      expect(calls).toEqual(['p-unsynced']);
      expect(result.evicted).toHaveLength(0);
      expect(result.skippedUnsynced).toEqual(['p-unsynced']);
      await expect(fs.stat(oldDir)).resolves.toBeDefined();
      await expect(fs.stat(path.join(oldDir, 'artifact.html'))).resolves.toBeDefined();
    });

    it('evicts after a successful syncUpBeforeEvict', async () => {
      const oldDir = path.join(projectsDir, 'p-synced');
      await fs.mkdir(oldDir, { recursive: true });
      await fs.writeFile(path.join(oldDir, 'artifact.html'), '<html></html>', 'utf8');
      const oldTime = new Date(Date.now() - 300_000);
      await fs.utimes(oldDir, oldTime, oldTime);

      const result = await evictIdleScratchProjects({
        projectsDir,
        storage,
        isActiveProject: () => false,
        idleAfterMs: 60_000,
        syncUpBeforeEvict: async () => ({ ok: true, uploaded: 1, failed: 0 }),
      });

      expect(result.evicted).toEqual(['p-synced']);
      expect(result.skippedUnsynced).toHaveLength(0);
      await expect(fs.stat(oldDir)).rejects.toThrow();
    });

    it('treats syncUpBeforeEvict exceptions as deferral reasons', async () => {
      const oldDir = path.join(projectsDir, 'p-throws');
      await fs.mkdir(oldDir, { recursive: true });
      await fs.writeFile(path.join(oldDir, 'artifact.html'), '<html></html>', 'utf8');
      const oldTime = new Date(Date.now() - 300_000);
      await fs.utimes(oldDir, oldTime, oldTime);

      const result = await evictIdleScratchProjects({
        projectsDir,
        storage,
        isActiveProject: () => false,
        idleAfterMs: 60_000,
        syncUpBeforeEvict: async () => {
          throw new Error('s3 unreachable');
        },
      });

      expect(result.evicted).toHaveLength(0);
      expect(result.skippedUnsynced).toEqual(['p-throws']);
      await expect(fs.stat(oldDir)).resolves.toBeDefined();
    });
  });
});

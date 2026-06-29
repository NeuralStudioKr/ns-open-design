import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createProjectMaterializationRuntime } from '../src/storage/project-materialization-runtime.js';
import { resolveProjectStorageLayout } from '../src/storage/project-storage-layout.js';
import {
  registerBootOrphanProjects,
  scanScratchOrphanProjectIds,
} from '../src/storage/scratch-boot-recovery.js';

describe('scratch-boot-recovery', () => {
  let scratchRoot = '';

  afterEach(async () => {
    if (scratchRoot) {
      await rm(scratchRoot, { recursive: true, force: true });
      scratchRoot = '';
    }
  });

  it('detects non-empty scratch project directories', async () => {
    scratchRoot = await mkdtemp(path.join(tmpdir(), 'od-boot-orphan-'));
    await mkdir(path.join(scratchRoot, 'p-orphan'), { recursive: true });
    await writeFile(path.join(scratchRoot, 'p-orphan', 'index.html'), '<p>hi</p>');
    await mkdir(path.join(scratchRoot, 'p-empty'), { recursive: true });

    const orphans = await scanScratchOrphanProjectIds(scratchRoot);
    expect(orphans).toEqual(['p-orphan']);
  });

  it('registers boot orphans on the materialization runtime', async () => {
    const layout = resolveProjectStorageLayout({ OD_PROJECT_STORAGE: 's3' }, '/data');
    const runtime = createProjectMaterializationRuntime(layout, null);
    registerBootOrphanProjects(runtime, ['p1', 'p2']);
    expect(runtime.consumeBootOrphanProject('p1')).toBe(true);
    expect(runtime.consumeBootOrphanProject('p1')).toBe(false);
    expect(runtime.consumeBootOrphanProject('p2')).toBe(true);
  });
});

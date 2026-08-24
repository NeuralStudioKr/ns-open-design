import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteProjectFile, readProjectFile, renameProjectFile } from '../src/projects.js';
import { readDeletedProjectRelpaths } from '../src/project-deleted-relpaths.js';

describe('readProjectFile Hangul NFC/NFD fallback', () => {
  let projectsRoot: string;
  const projectId = 'proj-nfc-nfd';

  beforeEach(async () => {
    projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-nfc-nfd-'));
    await mkdir(path.join(projectsRoot, projectId, 'refs', 'drive'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectsRoot, { recursive: true, force: true });
  });

  it('finds an NFC-request path when disk file is NFD', async () => {
    const nfd = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFD');
    const nfc = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFC');
    expect(nfd).not.toBe(nfc);
    await writeFile(path.join(projectsRoot, projectId, 'refs', 'drive', nfd), Buffer.from([1, 2, 3]));

    const requested = `refs/drive/${nfc}`;
    const file = await readProjectFile(projectsRoot, projectId, requested);
    expect(file.buffer.length).toBe(3);
  });

  it('finds an NFD-request path when disk file is NFC', async () => {
    const nfd = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFD');
    const nfc = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFC');
    await writeFile(path.join(projectsRoot, projectId, 'refs', 'drive', nfc), Buffer.from([9, 8, 7, 6]));

    const requested = `refs/drive/${nfd}`;
    const file = await readProjectFile(projectsRoot, projectId, requested);
    expect(file.buffer.length).toBe(4);
  });

  it('still throws ENOENT when neither Unicode form exists', async () => {
    const requested = 'refs/drive/does-not-exist.webp';
    await expect(readProjectFile(projectsRoot, projectId, requested)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('deleteProjectFile Hangul NFC/NFD fallback', () => {
  let projectsRoot: string;
  const projectId = 'proj-delete';

  beforeEach(async () => {
    projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-del-nfd-'));
    await mkdir(path.join(projectsRoot, projectId), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectsRoot, { recursive: true, force: true });
  });

  it('deletes an NFD-stored file via an NFC request and tombstones both forms', async () => {
    const nfd = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFD');
    const nfc = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFC');
    expect(nfd).not.toBe(nfc);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(projectsRoot, projectId, nfd), Buffer.from([0, 1, 2]));
    await deleteProjectFile(projectsRoot, projectId, nfc);
    const dir = path.join(projectsRoot, projectId);
    const tombstones = await readDeletedProjectRelpaths(dir);
    // Both Unicode forms tombstoned so sibling-node sync-down cannot resurrect.
    expect(tombstones.has(nfc)).toBe(true);
    expect(tombstones.has(nfd)).toBe(true);
  });

  it('renames an NFD-stored file via an NFC request', async () => {
    const nfd = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFD');
    const nfc = 'msh9rso1-서빙하는-금붕어.webp'.normalize('NFC');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(projectsRoot, projectId, nfd), Buffer.from([9, 8, 7, 6]));
    const result = await renameProjectFile(projectsRoot, projectId, nfc, 'goldfish-nfc.webp');
    expect(result.newName).toBe('goldfish-nfc.webp');
    const renamed = await readProjectFile(projectsRoot, projectId, 'goldfish-nfc.webp');
    expect(renamed.buffer.length).toBe(4);
  });
});

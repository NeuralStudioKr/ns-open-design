import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readProjectFile } from '../src/projects.js';

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

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  addDeletedProjectRelpath,
  filterDeletedProjectRelpaths,
  normalizeProjectRelpath,
  PROJECT_DELETED_RELPATHS_MANIFEST,
  readDeletedProjectRelpaths,
  removeDeletedProjectRelpath,
} from '../src/project-deleted-relpaths.js';

describe('project-deleted-relpaths', () => {
  it('normalizes project relpaths for tombstone matching', () => {
    expect(normalizeProjectRelpath('uploads/foo.png')).toBe('uploads/foo.png');
    expect(normalizeProjectRelpath('/uploads/foo.png')).toBe('uploads/foo.png');
    expect(normalizeProjectRelpath('uploads\\foo.png')).toBe('uploads/foo.png');
  });

  it('records and filters deleted relpaths', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-project-'));
    await addDeletedProjectRelpath(projectDir, 'drawing-2026.png');
    await addDeletedProjectRelpath(projectDir, 'uploads/mark.png');

    const deleted = await readDeletedProjectRelpaths(projectDir);
    expect(deleted).toEqual(new Set(['drawing-2026.png', 'uploads/mark.png']));

    const files = filterDeletedProjectRelpaths(
      [
        { name: 'drawing-2026.png', path: 'drawing-2026.png' },
        { name: 'deck.html', path: 'deck.html' },
      ],
      deleted,
    );
    expect(files.map((file) => file.name)).toEqual(['deck.html']);

    await removeDeletedProjectRelpath(projectDir, 'drawing-2026.png');
    const after = await readDeletedProjectRelpaths(projectDir);
    expect(after).toEqual(new Set(['uploads/mark.png']));

    const manifest = await readFile(
      path.join(projectDir, PROJECT_DELETED_RELPATHS_MANIFEST),
      'utf8',
    );
    expect(JSON.parse(manifest)).toEqual({ version: 1, paths: ['uploads/mark.png'] });
  });

  it('persists tombstones under .od for scratch sync', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-project-'));
    await mkdir(path.join(projectDir, '.od'), { recursive: true });
    await writeFile(path.join(projectDir, '.od', 'deleted-relpaths.json'), '{"version":1,"paths":["a.png"]}');

    const deleted = await readDeletedProjectRelpaths(projectDir);
    expect(deleted).toEqual(new Set(['a.png']));
  });
});

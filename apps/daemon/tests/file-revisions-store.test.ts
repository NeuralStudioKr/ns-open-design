import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readRevisionSnapshot,
  readRevisionSnapshotFromChain,
  sliceRevisionChainFromCheckpoint,
  writeRevisionSnapshot,
} from '../src/file-revisions/store.js';

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-store-test');

afterEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('file-revisions store', () => {
  it('reads a diff chain forward from the nearest full checkpoint', async () => {
    const projectDir = path.join(ROOT, 'project');
    const fileName = 'deck.html';
    const revisions = [
      { id: 'rev-1', sequence: 1, content: '<html><body>v1</body></html>' },
      { id: 'rev-2', sequence: 2, content: '<html><body>v2</body></html>' },
      { id: 'rev-3', sequence: 3, content: '<html><body>v3</body></html>' },
      { id: 'rev-4', sequence: 4, content: '<html><body>v4</body></html>' },
      { id: 'rev-5', sequence: 5, content: '<html><body>v5</body></html>' },
      { id: 'rev-6', sequence: 6, content: '<html><body>v6</body></html>' },
    ];

    let parentContent: string | null = null;
    for (const revision of revisions) {
      await writeRevisionSnapshot(projectDir, fileName, revision.id, revision.content, {
        parentContent,
        sequence: revision.sequence,
      });
      parentContent = revision.content;
    }

    const ancestry = [...revisions].reverse().map((revision) => ({
      id: revision.id,
      sequence: revision.sequence,
    }));
    const chain = sliceRevisionChainFromCheckpoint(ancestry);
    expect(chain.map((revision) => revision.id)).toEqual(['rev-6']);

    const metadata = new Map(revisions.map((revision) => [revision.id, revision]));
    const content = await readRevisionSnapshot(
      projectDir,
      fileName,
      'rev-4',
      (id) => {
        const index = revisions.findIndex((revision) => revision.id === id);
        return index > 0 ? revisions[index - 1]!.id : null;
      },
      (id) => {
        const revision = metadata.get(id);
        if (!revision) return null;
        const index = revisions.findIndex((entry) => entry.id === id);
        return {
          id: revision.id,
          sequence: revision.sequence,
          parentRevisionId: index > 0 ? revisions[index - 1]!.id : null,
        };
      },
    );
    expect(content).toContain('v4');

    const ancestryForRev4 = ancestry.slice(2);
    const sliced = sliceRevisionChainFromCheckpoint(ancestryForRev4);
    expect(sliced.map((revision) => revision.id)).toEqual(['rev-1', 'rev-2', 'rev-3', 'rev-4']);
    const forward = await readRevisionSnapshotFromChain(projectDir, fileName, sliced);
    expect(forward).toContain('v4');
  });

  it('creates checkpoint directories on write', async () => {
    const projectDir = path.join(ROOT, 'nested');
    await mkdir(projectDir, { recursive: true });
    await writeRevisionSnapshot(projectDir, 'a/b.html', 'rev-1', '<html>a</html>', {
      parentContent: null,
      sequence: 1,
    });
    const content = await readRevisionSnapshot(
      projectDir,
      'a/b.html',
      'rev-1',
      () => null,
    );
    expect(content).toBe('<html>a</html>');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { repairArtifactDocumentHead } from '@open-design/contracts';
import { createRevisionStackSnapshot } from '../../src/runtime/revision-stack';
import {
  cursorRevisionFromStack,
  findRevisionMatchingDiskContent,
  revisionCursorMatchesDisk,
} from '../../src/runtime/revision-conflict';
import type { FileRevision } from '@open-design/contracts';

function revision(id: string, sequence: number, snapshot = id): FileRevision {
  const byteSize = new TextEncoder().encode(snapshot).length;
  return {
    id,
    projectId: 'p',
    fileName: 'deck.html',
    parentRevisionId: null,
    sequence,
    createdAt: 0,
    byteSize,
    source: 'manual_edit',
    label: id,
  };
}

describe('revision-conflict', () => {
  it('detects when disk content diverges from the cursor revision snapshot', () => {
    const stack = createRevisionStackSnapshot(
      [revision('rev-1', 1)],
      'rev-1',
      'rev-1',
    );
    expect(revisionCursorMatchesDisk(stack, '<html>disk</html>', '<html>snap</html>')).toBe(false);
    expect(revisionCursorMatchesDisk(stack, '<html>same</html>', '<html>same</html>')).toBe(true);
    expect(cursorRevisionFromStack(stack)?.id).toBe('rev-1');
  });

  it('finds the newest revision whose snapshot matches disk content', async () => {
    const older = '<html>older</html>';
    const newer = '<html>newer</html>';
    const revisions = [revision('rev-1', 1, older), revision('rev-2', 2, newer)];
    const snapshots = new Map([
      ['rev-1', '<html>older</html>'],
      ['rev-2', '<html>newer</html>'],
    ]);
    const match = await findRevisionMatchingDiskContent(
      revisions,
      '<html>older</html>',
      async (revisionId) => snapshots.get(revisionId) ?? null,
    );
    expect(match?.id).toBe('rev-1');
  });

  it('skips revisions in the provided skip set', async () => {
    const older = '<html>older</html>';
    const newer = '<html>newer</html>';
    const revisions = [revision('rev-1', 1, older), revision('rev-2', 2, newer)];
    const snapshots = new Map([
      ['rev-1', older],
      ['rev-2', newer],
    ]);
    const match = await findRevisionMatchingDiskContent(
      revisions,
      older,
      async (revisionId) => snapshots.get(revisionId) ?? null,
      new Set(['rev-1']),
    );
    expect(match).toBeNull();
  });

  it('skips snapshot fetch when byteSize does not match disk content', async () => {
    const disk = '<html>target</html>';
    const revisions = [
      { ...revision('rev-1', 1, '<html>wrong-size</html>'), byteSize: 4 },
      revision('rev-2', 2, disk),
    ];
    const resolveSnapshot = vi.fn(async (revisionId: string) => (
      revisionId === 'rev-2' ? disk : '<html>wrong-size</html>'
    ));
    const match = await findRevisionMatchingDiskContent(
      revisions,
      disk,
      resolveSnapshot,
    );
    expect(match?.id).toBe('rev-2');
    expect(resolveSnapshot).toHaveBeenCalledTimes(1);
    expect(resolveSnapshot).toHaveBeenCalledWith('rev-2');
  });

  it('finds revision when disk matches snapshot after head repair normalization', async () => {
    const corrupt = '<html><head>viewport=width=device-width, initial-scale=1" /><title>Deck</title></head><body>Hi</body></html>';
    const canonical = repairArtifactDocumentHead(corrupt);
    const revisions = [revision('rev-1', 1, canonical)];
    const snapshots = new Map([['rev-1', canonical]]);
    const match = await findRevisionMatchingDiskContent(
      revisions,
      corrupt,
      async (revisionId) => snapshots.get(revisionId) ?? null,
    );
    expect(match?.id).toBe('rev-1');
  });
});

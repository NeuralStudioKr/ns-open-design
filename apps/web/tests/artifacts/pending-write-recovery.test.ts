import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __TEST__,
  clearPendingArtifactWrite,
  clearProjectPendingArtifactWrites,
  listPendingArtifactWrites,
  peekLatestPendingArtifactWrite,
  stashPendingArtifactWrite,
} from '../../src/artifacts/pendingWriteRecovery';

describe('pending artifact write recovery', () => {
  const storage = (() => {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      key(index: number) {
        return Array.from(data.keys())[index] ?? null;
      },
      getItem(key: string) {
        return data.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        data.set(key, value);
      },
      removeItem(key: string) {
        data.delete(key);
      },
      clear() {
        data.clear();
      },
    } as Storage;
  })();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('window', { sessionStorage: storage });
  });

  it('stashes and lists failed HTML writes newest-first by project', () => {
    expect(stashPendingArtifactWrite({
      projectId: 'project-1',
      fileName: 'old.html',
      htmlBody: '<!doctype html><html><body>old</body></html>',
    })).toBe(true);
    expect(stashPendingArtifactWrite({
      projectId: 'project-1',
      fileName: 'new.html',
      htmlBody: '<!doctype html><html><body>new</body></html>',
      artifactManifest: { entry: 'new.html' },
    })).toBe(true);
    expect(stashPendingArtifactWrite({
      projectId: 'project-2',
      fileName: 'other.html',
      htmlBody: '<!doctype html><html><body>other</body></html>',
    })).toBe(true);

    const writes = listPendingArtifactWrites('project-1');
    expect(writes).toHaveLength(2);
    expect(writes[0]?.fileName).toBe('new.html');
    expect(writes[0]?.artifactManifest).toEqual({ entry: 'new.html' });
    expect(peekLatestPendingArtifactWrite('project-1')?.fileName).toBe('new.html');
  });

  it('clears one file or every pending write for a project', () => {
    stashPendingArtifactWrite({
      projectId: 'project-1',
      fileName: 'a.html',
      htmlBody: '<!doctype html><html><body>a</body></html>',
    });
    stashPendingArtifactWrite({
      projectId: 'project-1',
      fileName: 'b.html',
      htmlBody: '<!doctype html><html><body>b</body></html>',
    });

    clearPendingArtifactWrite('project-1', 'a.html');
    expect(listPendingArtifactWrites('project-1').map((entry) => entry.fileName)).toEqual(['b.html']);

    clearProjectPendingArtifactWrites('project-1');
    expect(listPendingArtifactWrites('project-1')).toEqual([]);
  });

  it('rejects payloads above the browser-storage safety cap', () => {
    const tooLarge = 'x'.repeat(__TEST__.PENDING_WRITE_MAX_BYTES + 1);

    expect(stashPendingArtifactWrite({
      projectId: 'project-1',
      fileName: 'huge.html',
      htmlBody: tooLarge,
    })).toBe(false);
    expect(listPendingArtifactWrites('project-1')).toEqual([]);
  });
});

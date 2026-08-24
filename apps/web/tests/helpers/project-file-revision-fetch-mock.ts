import type { ProjectFile } from '../../src/types';

type StoredRevision = { id: string; sequence: number; content: string };

export function createProjectFileRevisionFetchMock(options: {
  projectId: string;
  fileName: string;
  initialSource: string;
  initialRetentionPending?: boolean;
}) {
  const { projectId, fileName, initialSource, initialRetentionPending = false } = options;
  let persistedSource = initialSource;
  let retentionPending = initialRetentionPending;
  const revisions: StoredRevision[] = [];
  let nextSequence = 0;
  let listCallCount = 0;
  let listFailCount = 0;
  let restoreCallCount = 0;
  let restoreDelayMs = 0;
  let restoreShouldFail = false;
  const encodedPath = `/api/projects/${projectId}/files/${fileName.split('/').map(encodeURIComponent).join('/')}/revisions`;

  const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes(`/api/projects/${projectId}/deployments`)) {
      return new Response(JSON.stringify({ deployments: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`${encodedPath}/`) && (!init?.method || init.method === 'GET') && !url.endsWith('/restore')) {
      const revisionId = decodeURIComponent(url.split('/revisions/')[1]?.split('?')[0]?.replace(/\/$/, '') ?? '');
      const revision = revisions.find((entry) => entry.id === revisionId);
      if (!revision) {
        return new Response(JSON.stringify({ error: 'missing revision' }), { status: 404 });
      }
      return new Response(JSON.stringify({
        revision: {
          id: revision.id,
          projectId,
          fileName,
          parentRevisionId: null,
          sequence: revision.sequence,
          createdAt: Date.now(),
          byteSize: revision.content.length,
          source: revision.id === 'rev-baseline' ? 'import' : 'manual_edit',
          label: revision.id,
        },
        content: revision.content,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(encodedPath) && (!init?.method || init.method === 'GET')) {
      listCallCount += 1;
      if (listFailCount > 0) {
        listFailCount -= 1;
        return new Response(JSON.stringify({ error: 'temporary list failure' }), { status: 503 });
      }
      const head = revisions[revisions.length - 1] ?? null;
      return new Response(JSON.stringify({
        revisions: revisions.map((revision) => ({
          id: revision.id,
          projectId,
          fileName,
          parentRevisionId: null,
          sequence: revision.sequence,
          createdAt: Date.now(),
          byteSize: revision.content.length,
          source: revision.id === 'rev-baseline' ? 'import' : 'manual_edit',
          label: revision.id,
        })),
        headRevisionId: head?.id ?? null,
        retentionLimit: 30,
        retentionPending,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(encodedPath) && init?.method === 'POST' && !url.endsWith('/restore')) {
      const payload = JSON.parse(String(init.body)) as { content: string; label: string };
      if (revisions.length === 0) {
        revisions.push({
          id: 'rev-baseline',
          sequence: ++nextSequence,
          content: persistedSource,
        });
      }
      persistedSource = payload.content;
      const revision = {
        id: `rev-${nextSequence + 1}`,
        sequence: ++nextSequence,
        content: payload.content,
      };
      revisions.push(revision);
      return new Response(JSON.stringify({
        revision: {
          id: revision.id,
          projectId,
          fileName,
          parentRevisionId: revisions[revisions.length - 2]?.id ?? null,
          sequence: revision.sequence,
          createdAt: Date.now(),
          byteSize: revision.content.length,
          source: 'manual_edit',
          label: payload.label,
        },
        file: revisionFile(fileName),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`${encodedPath}/`) && init?.method === 'POST' && url.endsWith('/restore')) {
      restoreCallCount += 1;
      if (restoreDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, restoreDelayMs));
      }
      if (restoreShouldFail) {
        return new Response(JSON.stringify({ error: 'restore failed' }), { status: 500 });
      }
      const revisionId = decodeURIComponent(url.split('/revisions/')[1]?.replace(/\/restore$/, '') ?? '');
      const revision = revisions.find((entry) => entry.id === revisionId);
      if (!revision) {
        return new Response(JSON.stringify({ error: 'missing revision' }), { status: 404 });
      }
      persistedSource = revision.content;
      return new Response(JSON.stringify({
        revision: {
          id: revision.id,
          projectId,
          fileName,
          parentRevisionId: null,
          sequence: revision.sequence,
          createdAt: Date.now(),
          byteSize: revision.content.length,
          source: 'restore',
          label: 'restore',
        },
        file: revisionFile(fileName),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`/api/projects/${projectId}/raw/${fileName.split('/').map(encodeURIComponent).join('/')}`)) {
      return new Response(persistedSource, { status: 200 });
    }
    const encodedFilePath = fileName.split('/').map(encodeURIComponent).join('/');
    if (
      url.includes(`/api/projects/${projectId}/files/${encodedFilePath}`)
      && !url.includes('/revisions')
      && !url.includes('/preview')
      && (!init?.method || init.method === 'GET')
    ) {
      return new Response(persistedSource, { status: 200 });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  return {
    fetchMock,
    getPersistedSource: () => persistedSource,
    setPersistedSource: (next: string) => {
      persistedSource = next;
    },
    getRevisions: () => revisions,
    getListCallCount: () => listCallCount,
    setListFailCount: (count: number) => {
      listFailCount = count;
    },
    getRestoreCallCount: () => restoreCallCount,
    setRetentionPending: (next: boolean) => {
      retentionPending = next;
    },
    setRestoreDelayMs: (ms: number) => {
      restoreDelayMs = ms;
    },
    setRestoreShouldFail: (next: boolean) => {
      restoreShouldFail = next;
    },
  };
}

function revisionFile(fileName: string): ProjectFile {
  return {
    name: fileName,
    path: fileName,
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    mime: 'text/html',
    kind: 'html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Preview',
      entry: fileName,
      renderer: 'html',
      exports: ['html'],
    },
  };
}

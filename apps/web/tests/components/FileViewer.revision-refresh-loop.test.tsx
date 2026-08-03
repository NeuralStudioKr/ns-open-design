// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';
import { FileViewer } from '../../src/components/FileViewer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer revision refresh loop', () => {
  it('does not spam GET /revisions when disk lags behind the head revision snapshot', async () => {
    const projectId = 'project-1';
    const fileName = 'deck.html';
    const snapshotContent = deckSource('#snapshot');
    const staleDisk = deckSource('#stale-disk');
    const headRevisionId = 'rev-head';
    let revisionListCalls = 0;

    const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const encodedPath = `/api/projects/${projectId}/files/${encodeURIComponent(fileName)}/revisions`;

      if (url.includes(`/api/projects/${projectId}/deployments`)) {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(encodedPath) && (!init?.method || init.method === 'GET') && !url.includes(`${encodedPath}/`)) {
        revisionListCalls += 1;
        return new Response(JSON.stringify({
          revisions: [{
            id: headRevisionId,
            projectId,
            fileName,
            parentRevisionId: null,
            sequence: 1,
            createdAt: Date.now(),
            byteSize: snapshotContent.length,
            source: 'manual_edit',
            label: 'head',
          }],
          headRevisionId,
          retentionLimit: 30,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(`${encodedPath}/${headRevisionId}`) && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          revision: {
            id: headRevisionId,
            projectId,
            fileName,
            parentRevisionId: null,
            sequence: 1,
            createdAt: Date.now(),
            byteSize: snapshotContent.length,
            source: 'manual_edit',
            label: 'head',
          },
          content: snapshotContent,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(`/api/projects/${projectId}/raw/${encodeURIComponent(fileName)}`)) {
        return new Response(staleDisk, { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock));

    render(
      <FileViewer
        projectId={projectId}
        projectKind="prototype"
        file={deckFile()}
        liveHtml={snapshotContent}
        filesRefreshKey={0}
      />,
    );

    await waitFor(() => expect(revisionListCalls).toBeGreaterThan(0));
    const callsAfterHydration = revisionListCalls;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(revisionListCalls - callsAfterHydration).toBeLessThan(3);
    expect(revisionListCalls).toBeLessThan(6);
  });
});

function deckSource(accent: string) {
  return `<!doctype html><html><body><h1 style="color: ${accent}">Deck</h1></body></html>`;
}

function deckFile(): ProjectFile {
  return {
    name: 'deck.html',
    path: 'deck.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    mime: 'text/html',
    kind: 'html',
    artifactManifest: {
      version: 1,
      kind: 'deck',
      title: 'Deck',
      entry: 'deck.html',
      renderer: 'deck',
      exports: ['html'],
    },
  };
}

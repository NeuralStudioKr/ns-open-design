// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';
import { createProjectFileRevisionFetchMock } from '../helpers/project-file-revision-fetch-mock';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function htmlPreviewFile(): ProjectFile {
  return {
    name: 'deck.html',
    path: 'deck.html',
    type: 'file',
    kind: 'html',
    mime: 'text/html',
    mtime: Date.now(),
    size: 100,
  };
}

function heroSource(): string {
  return '<!doctype html><html><head><style data-od-inspect-overrides></style></head><body><h1>Hero</h1></body></html>';
}

describe('FileViewer revision history', () => {
  it('opens history panel from toolbar toggle', async () => {
    const initialSource = heroSource();
    const { fetchMock } = createProjectFileRevisionFetchMock({
      projectId: 'project-1',
      fileName: 'deck.html',
      initialSource,
    });
    vi.stubGlobal('fetch', vi.fn(fetchMock));

    render(
      <FileViewer
        projectId="project-1"
        projectKind="slide_deck"
        file={htmlPreviewFile()}
        liveHtml={initialSource}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-revision-history-toggle')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('file-revision-history-toggle'));
    expect(screen.getByTestId('file-revision-history-panel')).toBeTruthy();
  });
});

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';
import type { ProjectFile } from '../../src/types';
import { FileViewer } from '../../src/components/FileViewer';
import { createProjectFileRevisionFetchMock } from '../helpers/project-file-revision-fetch-mock';

const panelState = vi.hoisted(() => ({
  props: null as ComponentProps<typeof import('../../src/components/ManualEditPanel').ManualEditPanel> | null,
}));

vi.mock('../../src/components/ManualEditPanel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/ManualEditPanel')>();
  return {
    ...actual,
    ManualEditPanel: (props: ComponentProps<typeof actual.ManualEditPanel>) => {
      panelState.props = props;
      return <div data-testid="mock-manual-edit-panel" />;
    },
  };
});

afterEach(() => {
  cleanup();
  panelState.props = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer revision entry', () => {
  it('does not show a conflict toast on entry when preview matches head but disk bytes are unknown', async () => {
    const initialSource = heroSource();
    const { fetchMock, getPersistedSource, setPersistedSource } = createProjectFileRevisionFetchMock({
      projectId: 'project-1',
      fileName: 'preview.html',
      initialSource,
    });
    vi.stubGlobal('fetch', vi.fn(fetchMock));

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml={initialSource}
        filesRefreshKey={0}
      />,
    );

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await selectManualEditTarget();

    act(() => {
      panelState.props?.onApplyPatch(
        { kind: 'set-style', id: 'hero', styles: { color: '#ef4444' } },
        'Style: Hero',
      );
    });

    await waitFor(() => expect(getPersistedSource()).toContain('rgb(239, 68, 68)'));
    const headPreview = getPersistedSource();
    setPersistedSource('<html><body>stale scratch bytes</body></html>');

    cleanup();

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml={headPreview}
        filesRefreshKey={0}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    const conflictAlert = screen.queryAllByRole('alert').find((node) => (
      node.textContent?.match(/Undo and Redo are unavailable|실행 취소와 다시 실행을 사용할 수 없/)
    ));
    expect(conflictAlert).toBeUndefined();
  });
});

async function selectManualEditTarget(target = heroTarget()) {
  const frame = await waitFor(() => {
    const node = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    if (!node.contentWindow) throw new Error('Preview frame not ready');
    return node;
  });
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'od-edit-select', target },
      source: frame.contentWindow,
    }));
  });
  await waitFor(() => expect(panelState.props).not.toBeNull());
}

function heroSource() {
  return '<!doctype html><html><body><h1 data-od-id="hero" style="color: #111111">Hero</h1></body></html>';
}

function htmlPreviewFile(): ProjectFile {
  return {
    name: 'preview.html',
    path: 'preview.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    mime: 'text/html',
    kind: 'html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Preview',
      entry: 'preview.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function heroTarget(): ManualEditTarget {
  return {
    id: 'hero',
    kind: 'text',
    label: 'Hero',
    tagName: 'h1',
    className: '',
    text: 'Hero',
    rect: { x: 0, y: 0, width: 120, height: 40 },
    fields: { text: 'Hero' },
    attributes: { 'data-od-id': 'hero' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<h1 data-od-id="hero">Hero</h1>',
  };
}

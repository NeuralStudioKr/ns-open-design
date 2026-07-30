// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';
import type { ProjectFile } from '../../src/types';

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

import { FileViewer } from '../../src/components/FileViewer';
import { createProjectFileRevisionFetchMock } from '../helpers/project-file-revision-fetch-mock';

afterEach(() => {
  cleanup();
  panelState.props = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer undo/redo toolbar', () => {
  it('renders undo/redo controls disabled until manual edit history exists', async () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={heroSource()}
      />,
    );

    const undo = screen.getByTestId('file-viewer-undo');
    const redo = screen.getByTestId('file-viewer-redo');
    expect(undo).toBeTruthy();
    expect(redo).toBeTruthy();
    expect(undo.hasAttribute('disabled')).toBe(true);
    expect(redo.hasAttribute('disabled')).toBe(true);
  });

  it('enables undo after a manual edit save and restores via toolbar click', async () => {
    const initialSource = heroSource();
    const { fetchMock, getPersistedSource, getRevisions } = createProjectFileRevisionFetchMock({
      projectId: 'project-1',
      fileName: 'preview.html',
      initialSource,
    });
    vi.stubGlobal('fetch', vi.fn(fetchMock));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={initialSource}
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
    await waitFor(() => expect(getRevisions().length).toBeGreaterThanOrEqual(2));

    const undo = await waitFor(() => {
      const button = screen.getByTestId('file-viewer-undo');
      if (button.hasAttribute('disabled')) throw new Error('undo still disabled');
      return button;
    });

    await act(async () => {
      fireEvent.click(undo);
    });
    await waitFor(() => expect(getPersistedSource()).toContain('#111111'));

    const redo = await waitFor(() => {
      const button = screen.getByTestId('file-viewer-redo');
      if (button.hasAttribute('disabled')) throw new Error('redo still disabled');
      return button;
    });

    await act(async () => {
      fireEvent.click(redo);
    });
    await waitFor(() => expect(getPersistedSource()).toContain('rgb(239, 68, 68)'));
  });

  it('places undo/redo immediately left of the manual edit toggle', () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={heroSource()}
      />,
    );

    const undo = screen.getByTestId('file-viewer-undo');
    const edit = screen.getByTestId('manual-edit-mode-toggle');
    expect(
      undo.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      undo.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBe(0);
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
    outerHtml: '<h1 data-od-id="hero" style="color: #111111">Hero</h1>',
  };
}

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

describe('FileViewer revision conflict', () => {
  it('shows a toast and resets undo when disk diverges from the cursor revision', async () => {
    const initialSource = heroSource();
    const { fetchMock, getPersistedSource, setPersistedSource } = createProjectFileRevisionFetchMock({
      projectId: 'project-1',
      fileName: 'preview.html',
      initialSource,
    });
    vi.stubGlobal('fetch', vi.fn(fetchMock));

    const view = render(
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

    setPersistedSource(initialSource.replace('#111111', '#0000ff'));
    const externalDiskSource = getPersistedSource();

    view.unmount();

    // First reconcile after a fresh mount is silent by policy — a page-entry
    // toast would always read as spurious to the user (they cannot have
    // observed any mid-session mutation). Undo/redo must still be disabled
    // though, which is what the assertion below verifies.
    const remount = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml={externalDiskSource}
        filesRefreshKey={1}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-viewer-undo').hasAttribute('disabled')).toBe(true);
    });
    // Entry-time toast MUST NOT appear even though disk diverged from history.
    expect(screen.queryByRole('alert')).toBeNull();

    // A subsequent reconcile (external files-refresh signal, e.g. a chokidar
    // notify / poll bump) is where the toast surfaces — this is the mid-
    // session external-change path the guard is designed for.
    remount.rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml={externalDiskSource}
        filesRefreshKey={2}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/Undo and Redo are unavailable|실행 취소와 다시 실행을 사용할 수 없/);
    });
    expect(screen.getByTestId('file-viewer-undo').getAttribute('data-tooltip')).toMatch(
      /Undo and Redo are unavailable|실행 취소와 다시 실행을 사용할 수 없/,
    );
    expect(screen.getByTestId('file-viewer-undo').hasAttribute('disabled')).toBe(true);

    const persistedBeforeKeyboardUndo = getPersistedSource();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(getPersistedSource()).toBe(persistedBeforeKeyboardUndo);
  });

  it('keeps the conflict toast dismissed after the user closes it', async () => {
    const initialSource = heroSource();
    const { fetchMock, getPersistedSource, setPersistedSource } = createProjectFileRevisionFetchMock({
      projectId: 'project-1',
      fileName: 'preview.html',
      initialSource,
    });
    vi.stubGlobal('fetch', vi.fn(fetchMock));

    const view = render(
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

    setPersistedSource(initialSource.replace('#111111', '#0000ff'));
    const externalDiskSource = getPersistedSource();

    view.unmount();

    // Fresh mount reconcile is silent (page-entry policy) even with the disk
    // diverged, so we bump filesRefreshKey again to trigger the second
    // reconcile — that is where the toast surfaces and the dismiss guard
    // this test protects can be exercised.
    const remounted = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml={externalDiskSource}
        filesRefreshKey={1}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-viewer-undo').hasAttribute('disabled')).toBe(true);
    });
    expect(screen.queryByRole('alert')).toBeNull();

    remounted.rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml={externalDiskSource}
        filesRefreshKey={2}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/Undo and Redo are unavailable|실행 취소와 다시 실행을 사용할 수 없/);
    });

    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });

    remounted.rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml={externalDiskSource}
        filesRefreshKey={3}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(screen.queryByRole('alert')).toBeNull();
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

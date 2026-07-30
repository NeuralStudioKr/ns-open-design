// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', async () => {
  const actual = await vi.importActual<typeof import('../../src/teamver/designApiBase')>(
    '../../src/teamver/designApiBase',
  );
  return {
    ...actual,
    isTeamverEmbedMode: vi.fn(() => false),
  };
});

import {
  FileViewer,
  cancelManualEditPendingStyleSnapshot,
} from '../../src/components/FileViewer';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';
import type { ProjectFile } from '../../src/types';
import * as designApiBase from '../../src/teamver/designApiBase';
import { createProjectFileRevisionFetchMock } from '../helpers/project-file-revision-fetch-mock';

const MANUAL_EDIT_PROJECT_ID = 'project-1';
const MANUAL_EDIT_FILE_NAME = 'preview.html';

function manualEditRevisionPushUrl(fileName = MANUAL_EDIT_FILE_NAME) {
  return `/api/projects/${MANUAL_EDIT_PROJECT_ID}/files/${fileName.split('/').map(encodeURIComponent).join('/')}/revisions`;
}

function isManualEditRevisionPush(call: unknown[], fileName: string = MANUAL_EDIT_FILE_NAME) {
  const input = call[0];
  const url = typeof input === 'string'
    ? input
    : input instanceof Request
      ? input.url
      : String(input);
  const init = call[1] as RequestInit | undefined;
  return url.includes(manualEditRevisionPushUrl(fileName))
    && init?.method === 'POST'
    && !url.endsWith('/restore');
}

function setupManualEditRevisionFetch(
  initialSource: string,
  options?: {
    onRevisionPush?: (attempt: number) => Response | null | undefined;
  },
) {
  const revisionMock = createProjectFileRevisionFetchMock({
    projectId: MANUAL_EDIT_PROJECT_ID,
    fileName: MANUAL_EDIT_FILE_NAME,
    initialSource,
  });
  let pushAttempts = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes(manualEditRevisionPushUrl()) && init?.method === 'POST' && !url.endsWith('/restore')) {
      pushAttempts += 1;
      const override = options?.onRevisionPush?.(pushAttempts);
      if (override) return override;
    }
    return revisionMock.fetchMock(input, init);
  });
  return {
    fetchMock,
    pushAttempts: () => pushAttempts,
    getPersistedSource: revisionMock.getPersistedSource,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
  vi.unstubAllGlobals();
});

describe('FileViewer manual edit regressions', () => {
  function clickManualTool(testId: string) {
    fireEvent.click(screen.getByTestId(testId));
  }

  async function previewFrame() {
    return waitFor(() => {
      const node = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      if (!node.contentWindow) throw new Error('Preview frame not ready');
      return node;
    });
  }

  async function hoverManualEditTarget(target = heroTarget()) {
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-hover', target },
        source: frame.contentWindow,
      }));
    });
    // Hover only surfaces the affordance; it must not open any panel.
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-hover-open')).toBeTruthy();
    });
  }

  // Clicking the empty canvas is the gesture that opens the compact page card.
  async function clickManualEditBackground() {
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-background' },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => {
      expect(document.querySelector('.manual-edit-right')).not.toBeNull();
    });
  }

  // Hover only surfaces the "edit params" affordance; pinning the inspector to
  // a target now requires an explicit click (mirrors clicking that affordance
  // or a container/image body in the bridge).
  async function selectManualEditTarget(target = heroTarget()) {
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => {
      expect(document.querySelector('.manual-edit-right')).not.toBeNull();
    });
  }

  async function findStyleInput(label: string) {
    return waitFor(() => {
      const input = Array.from(document.querySelectorAll('.cc-row'))
        .find((row) => row.textContent?.includes(label))
        ?.querySelector('input') as HTMLInputElement | null;
      if (!input) throw new Error(`${label} input not found`);
      return input;
    });
  }

  it('removes invalid fields from pending manual edit style saves without dropping unrelated fields', () => {
    expect(cancelManualEditPendingStyleSnapshot({
      id: 'hero',
      label: 'Style: Hero',
      version: 1,
      styles: { fontSize: '4px', color: '#111111' },
    }, 'hero', ['fontSize'])).toEqual({
      id: 'hero',
      label: 'Style: Hero',
      version: 1,
      styles: { color: '#111111' },
    });

    expect(cancelManualEditPendingStyleSnapshot({
      id: 'hero',
      label: 'Style: Hero',
      version: 1,
      styles: { fontSize: '4px' },
    }, 'hero', ['fontSize'])).toBeNull();

    const otherTargetPending = {
      id: 'hero',
      label: 'Style: Hero',
      version: 1,
      styles: { fontSize: '4px' },
    };
    expect(cancelManualEditPendingStyleSnapshot(otherTargetPending, 'cta', ['fontSize'])).toBe(otherTargetPending);
  });

  it('opens edit mode with a clean canvas and no docked panel', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    // No panel auto-pops; the canvas stays clean.
    expect(document.querySelector('.manual-edit-right')).toBeNull();
    expect(screen.queryByText('PAGE')).toBeNull();

    // Hovering surfaces only the click affordance, still no panel.
    await hoverManualEditTarget();
    expect(document.querySelector('.manual-edit-right')).toBeNull();
    expect(screen.queryByText('PAGE')).toBeNull();
    expect(screen.getByTestId('manual-edit-hover-open')).toBeTruthy();
  });

  it('opens the compact page-styles card when the empty canvas is clicked', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await clickManualEditBackground();

    expect(screen.getByText('PAGE')).toBeTruthy();
    expect(document.querySelector('.manual-edit-page-card')).not.toBeNull();
  });

  it('pins the inspector to a target only after clicking the hover affordance', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await hoverManualEditTarget();
    // No panel until the affordance is clicked.
    expect(document.querySelector('.manual-edit-right')).toBeNull();

    fireEvent.click(screen.getByTestId('manual-edit-hover-open'));

    // Selected target inspector exposes the typography "Size" control.
    await findStyleInput('Size');
    expect(screen.queryByText('PAGE')).toBeNull();
    // Affordance hides once its element is the pinned selection.
    expect(screen.queryByTestId('manual-edit-hover-open')).toBeNull();
  });

  it('does not let a pending manual edit style save survive a file switch', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const { fetchMock } = setupManualEditRevisionFetch(source);
    vi.stubGlobal('fetch', fetchMock);
    const first = htmlPreviewFile();
    const second = { ...htmlPreviewFile(), name: 'second.html', path: 'second.html' };
    const { rerender } = render(
      <FileViewer projectId="project-1" projectKind="prototype" file={first}
        liveHtml='<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await selectManualEditTarget();
    const baseSizeInput = await findStyleInput('Size');
    fireEvent.change(baseSizeInput, { target: { value: '18' } });

    rerender(
      <FileViewer projectId="project-1" projectKind="prototype" file={second}
        liveHtml='<!doctype html><html><body><main data-od-id="second">Second</main></body></html>'
      />,
    );

    expect(fetchMock.mock.calls.some((call) => isManualEditRevisionPush(call))).toBe(false);
  });

  it('clears loaded source immediately on file switch without liveHtml before manual edit can save', async () => {
    let secondResolve!: (value: Response) => void;
    const secondFetch = new Promise<Response>((resolve) => {
      secondResolve = resolve;
    });
    const source = '<!doctype html><html><body><main data-od-id="hero">First</main></body></html>';
    const { fetchMock } = setupManualEditRevisionFetch(source);
    const wrappedFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/raw/second.html')) return secondFetch;
      return fetchMock(input, init);
    });
    vi.stubGlobal('fetch', wrappedFetch);
    try {
      const first = htmlPreviewFile();
      const second = { ...htmlPreviewFile(), name: 'second.html', path: 'second.html' };
      const { rerender } = render(<FileViewer projectId="project-1" projectKind="prototype" file={first} />);

      // The raw fetch is cache-busted on every mtime / reload / files-refresh
      // bump so srcDoc-mode previews see fresh HTML after agent edits.
      await waitFor(() => expect(wrappedFetch.mock.calls.some((call) => {
        const url = typeof call[0] === 'string' ? call[0] : String(call[0]);
        return /^\/api\/projects\/project-1\/raw\/preview\.html(\?|$)/.test(url);
      })).toBe(true));
      fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
      await selectManualEditTarget();
      const baseSizeInput = await findStyleInput('Size');
      fireEvent.change(baseSizeInput, { target: { value: '18' } });

      rerender(<FileViewer projectId="project-1" projectKind="prototype" file={second} />);
      fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      });

      expect(wrappedFetch.mock.calls.some((call) => isManualEditRevisionPush(call))).toBe(false);
      secondResolve(new Response('<!doctype html><html><body><main data-od-id="second">Second</main></body></html>', { status: 200 }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears a prior manual edit save error after a later successful save', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const { fetchMock } = setupManualEditRevisionFetch(source, {
      onRevisionPush: (attempt) => {
        if (attempt === 1) {
          return new Response(JSON.stringify({
            error: { code: 'FORBIDDEN', message: 'Request failed (403).' },
          }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        return null;
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();
    const baseSizeInput = await findStyleInput('Size');

    fireEvent.change(baseSizeInput, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByText(/Could not save the edited file/)).toBeTruthy();
    });

    fireEvent.change(baseSizeInput, { target: { value: '19' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.queryByText(/Could not save the edited file/)).toBeNull();
    });
  });

  it('closes the inspector without saving on cancel, staying in edit mode', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const fetchMock = vi.fn(async () =>
      new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();
    const baseSizeInput = await findStyleInput('Size');

    fireEvent.change(baseSizeInput, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(document.querySelector('.manual-edit-right')).toBeNull();
    });
    expect(document.querySelector('.manual-edit-workspace')).not.toBeNull();
    expect(fetchMock.mock.calls.some((call) => isManualEditRevisionPush(call))).toBe(false);
  });

  it('closes the inspector after save succeeds, staying in edit mode', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const { fetchMock } = setupManualEditRevisionFetch(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();
    const baseSizeInput = await findStyleInput('Size');

    fireEvent.change(baseSizeInput, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => isManualEditRevisionPush(call))).toBe(true);
      expect(document.querySelector('.manual-edit-right')).toBeNull();
    });
    expect(document.querySelector('.manual-edit-workspace')).not.toBeNull();
  });

  it('flushes pending styles when selecting a different target instead of cancelling them', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main><button data-od-id="cta">Go</button></body></html>';
    const { fetchMock } = setupManualEditRevisionFetch(source);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget(heroTarget());
    const baseSizeInput = await findStyleInput('Size');
    fireEvent.change(baseSizeInput, { target: { value: '18' } });

    await selectManualEditTarget(ctaTarget());

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => isManualEditRevisionPush(call))).toBe(true);
    });
    const postCall = fetchMock.mock.calls.find((call) => isManualEditRevisionPush(call));
    const body = JSON.parse(String(postCall?.[1]?.body ?? '{}')) as { content?: string };
    expect(body.content).toMatch(/font-size:\s*18px/i);
  });

  it('keeps a failed style draft so a later Save can retry the same tweak', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const { fetchMock, pushAttempts } = setupManualEditRevisionFetch(source, {
      onRevisionPush: (attempt) => {
        if (attempt === 1) {
          return new Response(JSON.stringify({
            error: { code: 'FORBIDDEN', message: 'Request failed (403).' },
          }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        return null;
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={source}
      />,
    );

    clickManualTool('manual-edit-mode-toggle');
    await selectManualEditTarget();
    const baseSizeInput = await findStyleInput('Size');
    fireEvent.change(baseSizeInput, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByText(/Could not save the edited file/)).toBeTruthy();
    });

    // Do not change the input — a failed flush must restore the pending draft
    // so retrying Save alone persists the original tweak.
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(pushAttempts()).toBe(2);
      expect(screen.queryByText(/Could not save the edited file/)).toBeNull();
    });
    const postCalls = fetchMock.mock.calls.filter((call) => isManualEditRevisionPush(call));
    const retryBody = JSON.parse(String(postCalls[1]?.[1]?.body ?? '{}')) as { content?: string };
    expect(retryBody.content).toMatch(/font-size:\s*18px/i);
  });
});

function heroTarget(): ManualEditTarget {
  return {
    id: 'hero',
    kind: 'text',
    label: 'Hero',
    tagName: 'main',
    className: '',
    text: 'Hero',
    rect: { x: 24, y: 24, width: 160, height: 48 },
    fields: { text: 'Hero' },
    attributes: { 'data-od-id': 'hero' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<main data-od-id="hero">Hero</main>',
  };
}

function ctaTarget(): ManualEditTarget {
  return {
    id: 'cta',
    kind: 'text',
    label: 'Go',
    tagName: 'button',
    className: '',
    text: 'Go',
    rect: { x: 24, y: 96, width: 80, height: 32 },
    fields: { text: 'Go' },
    attributes: { 'data-od-id': 'cta' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<button data-od-id="cta">Go</button>',
  };
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

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';

const {
  captureHostIframeSnapshotMock,
  downloadImageDataUrlMock,
  exportProjectImageBlobMock,
  imageDataUrlToBlobMock,
  isTeamverEmbedModeMock,
  prepareImageExportTargetMock,
  requestPreviewSnapshotMock,
  saveImageBlobMock,
} = vi.hoisted(() => ({
  captureHostIframeSnapshotMock: vi.fn(),
  downloadImageDataUrlMock: vi.fn(),
  exportProjectImageBlobMock: vi.fn(),
  imageDataUrlToBlobMock: vi.fn(),
  isTeamverEmbedModeMock: vi.fn(() => false),
  prepareImageExportTargetMock: vi.fn(),
  requestPreviewSnapshotMock: vi.fn(),
  saveImageBlobMock: vi.fn(),
}));

vi.mock('../../src/teamver/designApiBase', async () => {
  const actual = await vi.importActual<typeof import('../../src/teamver/designApiBase')>(
    '../../src/teamver/designApiBase',
  );
  return {
    ...actual,
    // jsdom runs on localhost which isTeamverEmbedMode treats as embed —
    // avoid preview-url fetches that need absolute daemon URLs in Node fetch.
    isTeamverEmbedMode: isTeamverEmbedModeMock,
  };
});

vi.mock('../../src/runtime/exports', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/exports')>(
    '../../src/runtime/exports',
  );
  return {
    ...actual,
    captureHostIframeSnapshot: captureHostIframeSnapshotMock,
    downloadImageDataUrl: downloadImageDataUrlMock,
    exportProjectImageBlob: exportProjectImageBlobMock,
    imageDataUrlToBlob: imageDataUrlToBlobMock,
    prepareImageExportTarget: prepareImageExportTargetMock,
    requestPreviewSnapshot: requestPreviewSnapshotMock,
  };
});

import { FileViewer } from '../../src/components/FileViewer';

function htmlFile(): ProjectFile {
  return {
    name: 'workspace.html',
    path: 'workspace.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Workspace',
      entry: 'workspace.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function renderHtmlPreview() {
  const view = render(
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={htmlFile()}
      liveHtml="<html><body><main>Workspace</main></body></html>"
    />,
  );
  const { container } = view;
  const activeFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  expect(activeFrame.getAttribute('data-od-render-mode')).toBe('url-load');
  const srcDocFrame = container.querySelector<HTMLIFrameElement>('iframe[data-od-render-mode="srcdoc"]');
  expect(srcDocFrame).toBeTruthy();
  fireEvent.load(srcDocFrame as HTMLIFrameElement);
  return { ...view, activeFrame, srcDocFrame: srcDocFrame as HTMLIFrameElement };
}

async function openImageExportDialog() {
  fireEvent.click(screen.getByRole('button', { name: /download|보내기/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /export as image|이미지로 다운로드/i }));
  expect(await screen.findByRole('dialog', { name: /export as image|이미지로 다운로드/i })).toBeTruthy();
}

async function waitForSaveButton() {
  const button = await screen.findByRole('button', { name: /^save$/i });
  await waitFor(() => {
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
  return button;
}

describe('FileViewer image export', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ url: '/api/projects/project-1/preview/workspace.html' }),
      { status: 200 },
    )));
    // Default the daemon-side image export to a "not available" failure so
    // tests that don't explicitly configure it fall through to the in-iframe
    // snapshot bridge (which is what they're exercising). Individual tests
    // override this when they need a successful or specific failure shape.
    exportProjectImageBlobMock.mockResolvedValue({ ok: false, reason: 'mock: daemon export disabled' });
    isTeamverEmbedModeMock.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('portals the image export dialog above fixed chat composer layers', async () => {
    requestPreviewSnapshotMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,ok',
      w: 800,
      h: 600,
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));

    const { container } = renderHtmlPreview();
    await openImageExportDialog();

    const backdrop = document.body.querySelector('.viewer-modal-backdrop');
    expect(backdrop).toBeTruthy();
    expect(backdrop?.classList.contains('image-export-backdrop')).toBe(true);
    expect(backdrop?.parentElement).toBe(document.body);
    expect(container.querySelector('.viewer-modal-backdrop')).toBeNull();
    await waitFor(() => {
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'png');
    });
  });

  it('waits for the download menu to close before capturing host pixels', async () => {
    captureHostIframeSnapshotMock.mockImplementationOnce(async () => {
      expect(screen.queryByRole('menu')).toBeNull();
      return {
        dataUrl: 'data:image/png;base64,host',
        w: 800,
        h: 600,
      };
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));

    renderHtmlPreview();
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /export as image/i }));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(captureHostIframeSnapshotMock).not.toHaveBeenCalled();

    expect(await screen.findByRole('dialog', { name: /export as image/i })).toBeTruthy();
    await waitFor(() => {
      expect(captureHostIframeSnapshotMock).toHaveBeenCalledTimes(1);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,host', 'png');
    });
  });

  it('lets users choose an image format before saving URL-loaded HTML previews', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    const imageBlob = new Blob(['jpeg'], { type: 'image/jpeg' });
    requestPreviewSnapshotMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,ok',
      w: 800,
      h: 600,
    });
    imageDataUrlToBlobMock.mockImplementation(async (_dataUrl: string, format: 'png' | 'jpeg' | 'webp') => {
      if (format === 'jpeg') return imageBlob;
      return pngBlob;
    });
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.jpg',
      method: 'picker',
      save: saveImageBlobMock,
    });

    const { activeFrame } = renderHtmlPreview();
    await openImageExportDialog();
    expect(screen.getByRole('radio', { name: 'PNG' })).toBeTruthy();

    await waitFor(() => {
      expect(requestPreviewSnapshotMock).toHaveBeenCalledWith(activeFrame, 1500);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'png');
    });
    await waitForSaveButton();

    fireEvent.click(screen.getByRole('radio', { name: 'JPEG' }));
    await waitFor(() => {
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'jpeg');
    });

    fireEvent.click(await waitForSaveButton());
    fireEvent.load(activeFrame as HTMLIFrameElement);

    await waitFor(() => {
      expect(prepareImageExportTargetMock).toHaveBeenCalledWith('workspace', 'jpeg', { useNativePicker: false });
    });
    expect(requestPreviewSnapshotMock).toHaveBeenCalledTimes(1);
    expect(saveImageBlobMock).toHaveBeenCalledWith(imageBlob);
    expect(screen.getByText('workspace.jpg')).toBeTruthy();
  });

  it('keeps the Save label stable while a format change prepares the next image', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    let resolveJpegBlob: ((blob: Blob) => void) | undefined;
    requestPreviewSnapshotMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,ok',
      w: 800,
      h: 600,
    });
    imageDataUrlToBlobMock
      .mockResolvedValueOnce(pngBlob)
      .mockImplementationOnce(async () => new Promise<Blob>((resolve) => {
        resolveJpegBlob = resolve;
      }));

    renderHtmlPreview();
    await openImageExportDialog();

    await waitForSaveButton();

    fireEvent.click(screen.getByRole('radio', { name: 'JPEG' }));
    await waitFor(() => {
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'jpeg');
    });

    expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /saving image/i })).toBeNull();
    expect((screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);

    resolveJpegBlob?.(new Blob(['jpeg'], { type: 'image/jpeg' }));
    await waitForSaveButton();
  });

  it('retries the srcDoc snapshot bridge before giving up on URL-loaded previews', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    let srcDocAttempts = 0;
    requestPreviewSnapshotMock.mockImplementation(async (iframe: HTMLIFrameElement) => {
      if (iframe.getAttribute('data-od-render-mode') === 'url-load') return null;
      srcDocAttempts += 1;
      if (srcDocAttempts === 1) return null;
      return {
        dataUrl: 'data:image/png;base64,recovered',
        w: 800,
        h: 600,
      };
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(pngBlob);

    const { srcDocFrame } = renderHtmlPreview();
    await openImageExportDialog();

    await waitFor(() => {
      expect(requestPreviewSnapshotMock).toHaveBeenCalledWith(srcDocFrame, 1500);
      expect(requestPreviewSnapshotMock).toHaveBeenCalledWith(srcDocFrame, 3000);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,recovered', 'png');
    }, { timeout: 4000 });
  });

  it('captures the visible URL-loaded preview before falling back to the hidden srcDoc transport', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    requestPreviewSnapshotMock.mockImplementation(async (iframe: HTMLIFrameElement) => {
      if (iframe.getAttribute('data-od-render-mode') === 'url-load') {
        return {
          dataUrl: 'data:image/png;base64,visible',
          w: 800,
          h: 600,
        };
      }
      return null;
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(pngBlob);

    const { activeFrame, srcDocFrame } = renderHtmlPreview();
    await openImageExportDialog();

    await waitFor(() => {
      expect(requestPreviewSnapshotMock).toHaveBeenCalledWith(activeFrame, 1500);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,visible', 'png');
    });
    expect(requestPreviewSnapshotMock).not.toHaveBeenCalledWith(srcDocFrame, 1500);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses the prepared PNG data URL for fallback downloads', async () => {
    const imageBlob = new Blob(['png'], { type: 'image/png' });
    requestPreviewSnapshotMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,ok',
      w: 800,
      h: 600,
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(imageBlob);
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.png',
      method: 'download',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();
    fireEvent.click(await waitForSaveButton());

    await waitFor(() => {
      expect(prepareImageExportTargetMock).toHaveBeenCalledWith('workspace', 'png', { useNativePicker: false });
      expect(downloadImageDataUrlMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'workspace.png');
    });
    expect(saveImageBlobMock).not.toHaveBeenCalled();
    expect(screen.getByText(/workspace\.png/)).toBeTruthy();
  });

  it('does not create a save target when snapshot capture fails', async () => {
    requestPreviewSnapshotMock.mockResolvedValueOnce(null);
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.png',
      method: 'picker',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();

    await waitFor(() => {
      // The alert leads with the localized failure message and may append
      // the daemon reason on a second line for dev/staging diagnostics.
      expect(screen.getByRole('alert').textContent).toContain(
        "Image capture failed. Please try again or use your browser's screenshot tool.",
      );
    }, { timeout: 4000 });
    expect((screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(prepareImageExportTargetMock).not.toHaveBeenCalled();
    expect(imageDataUrlToBlobMock).not.toHaveBeenCalled();
    expect(saveImageBlobMock).not.toHaveBeenCalled();
  });

  it('does not write the save target when the captured image is empty', async () => {
    requestPreviewSnapshotMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,ok',
      w: 800,
      h: 600,
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(new Blob([]));
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.png',
      method: 'picker',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        "Image capture failed. Please try again or use your browser's screenshot tool.",
      );
    }, { timeout: 4000 });
    expect((screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'png');
    expect(prepareImageExportTargetMock).not.toHaveBeenCalled();
    expect(saveImageBlobMock).not.toHaveBeenCalled();
  });

  it('surfaces the daemon failure reason in the modal alert for dev/staging diagnostics', async () => {
    // The default beforeEach mock returns a failure reason that should be
    // appended to the localized base message so operators can see the real
    // cause (e.g. "headless Chromium unavailable …") without leaving the UI.
    exportProjectImageBlobMock.mockResolvedValueOnce({
      ok: false,
      reason: 'daemon image export 500: headless Chromium unavailable',
    });
    requestPreviewSnapshotMock.mockResolvedValueOnce(null);

    renderHtmlPreview();
    await openImageExportDialog();

    await waitFor(() => {
      const text = screen.getByRole('alert').textContent || '';
      expect(text).toContain(
        "Image capture failed. Please try again or use your browser's screenshot tool.",
      );
      expect(text).toContain('headless Chromium unavailable');
      // Defensive: a stringified envelope object must never leak into the
      // user-facing alert. If exportProjectImageBlob's parser ever regresses
      // this assertion catches the regression in the integration layer too.
      expect(text).not.toContain('[object Object]');
    }, { timeout: 4000 });
  });

  it('uses the prepared blob when daemon export succeeds after snapshot fallback', async () => {
    const fallbackBlob = new Blob(['fallback'], { type: 'image/png' });
    const serverBlob = new Blob(['server-png'], { type: 'image/png' });
    exportProjectImageBlobMock
      .mockResolvedValueOnce({ ok: false, reason: 'mock: daemon export disabled' })
      .mockResolvedValueOnce({ ok: true, blob: serverBlob, filename: 'workspace.jpg' })
      .mockResolvedValueOnce({ ok: true, blob: serverBlob, filename: 'workspace.png' });
    requestPreviewSnapshotMock.mockResolvedValue({
      dataUrl: 'data:image/png;base64,stale',
      w: 800,
      h: 600,
    });
    imageDataUrlToBlobMock.mockResolvedValue(fallbackBlob);
    prepareImageExportTargetMock.mockResolvedValue({
      filename: 'workspace.png',
      method: 'download',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();
    await waitForSaveButton();

    fireEvent.click(screen.getByRole('radio', { name: 'JPEG' }));
    await waitFor(() => {
      expect(exportProjectImageBlobMock).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('radio', { name: 'PNG' }));
    await waitFor(() => {
      expect(exportProjectImageBlobMock).toHaveBeenCalledTimes(3);
    });
    await waitForSaveButton();

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(downloadImageDataUrlMock).not.toHaveBeenCalled();
      expect(saveImageBlobMock).toHaveBeenCalledWith(serverBlob);
    });
  });

  it('hides image export from the download menu in Teamver embed', async () => {
    isTeamverEmbedModeMock.mockReturnValue(true);

    renderHtmlPreview();
    fireEvent.click(screen.getByRole('button', { name: /download|보내기/i }));

    expect(screen.queryByRole('menuitem', { name: /export as image|이미지로 다운로드/i })).toBeNull();
    expect(exportProjectImageBlobMock).not.toHaveBeenCalled();
  });
});

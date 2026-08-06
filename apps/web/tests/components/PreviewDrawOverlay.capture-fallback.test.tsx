// @vitest-environment jsdom

// Issue #4064: the srcDoc foreignObject snapshot bridge legitimately fails on
// real-world artifacts (Chromium often refuses to rasterize <foreignObject>
// HTML loaded via <img>). A failed screenshot must not dead-end an annotation
// that carries its own meaning without pixels (typed note / attached images) —
// the retry warning is a dead end because retrying the same pipeline fails the
// same way. Ink/box-only annotations still block: without the bitmap there is
// nothing to send. When iframe capture fails, marks-only export still sends the ink.

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';
import { requestPreviewSnapshot } from '../../src/runtime/exports';

vi.mock('../../src/runtime/exports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/exports')>();
  return {
    ...actual,
    // The snapshot bridge fails — the shape every foreignObject failure mode
    // (empty-render, snapshot image failed, timeout) collapses into.
    requestPreviewSnapshot: vi.fn(async () => null),
  };
});

let restoreRect: (() => void) | null = null;

beforeEach(() => {
  // jsdom reports 0x0 client rects, which would collapse the drawn selection
  // box into nothing. Give the ink canvas a real-looking rect so pointer
  // events produce a valid normalized box, like in a browser.
  const rectSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 320,
      height: 200,
      right: 320,
      bottom: 200,
      toJSON: () => ({}),
    } as DOMRect);
  const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineCap: 'round',
    lineJoin: 'round',
    lineTo: vi.fn(),
    lineWidth: 1,
    measureText: vi.fn(() => ({ width: 0 })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: '',
    font: '',
    strokeStyle: '',
  }) as unknown as CanvasRenderingContext2D) as unknown as HTMLCanvasElement['getContext']);
  const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
    callback(new Blob(['png'], { type: 'image/png' }));
  });
  restoreRect = () => {
    rectSpy.mockRestore();
    getContextSpy.mockRestore();
    toBlobSpy.mockRestore();
  };
});

afterEach(() => {
  cleanup();
  restoreRect?.();
  restoreRect = null;
  vi.mocked(requestPreviewSnapshot).mockClear();
});

function selectBoxTool(container: HTMLElement) {
  fireEvent.click(
    container.querySelector<HTMLButtonElement>('button[data-tooltip="Box select"]') ??
      container.querySelector<HTMLButtonElement>('button[title="Box select"]')!,
  );
}

function drawSelectionBox(canvas: HTMLCanvasElement) {
  fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 220, clientY: 150, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 220, clientY: 150, pointerId: 1 });
}

describe('PreviewDrawOverlay capture fallback (issue #4064)', () => {
  it('sends a box annotation with a typed note even when the snapshot fails', async () => {
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole, getByText } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );

      selectBoxTool(container);
      const canvas = container.querySelector<HTMLCanvasElement>('canvas');
      expect(canvas).toBeTruthy();
      drawSelectionBox(canvas!);

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');
      expect(input).toBeTruthy();
      fireEvent.change(input!, { target: { value: 'This section is missing its bar chart.' } });

      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({
          action: 'send',
          note: 'This section is missing its bar chart.',
          file: null,
          bounds: expect.objectContaining({
            width: expect.any(Number),
            height: expect.any(Number),
          }),
        }),
      });
      await waitFor(() =>
        expect(
          getByText('Could not capture preview — only your note was sent. Try Comment mode for element-specific edits.'),
        ).toBeTruthy(),
      );
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

  it('prefixes the active slide when screenshot capture fails on a deck', async () => {
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole, getByText } = render(
        <PreviewDrawOverlay active captureViewport slideIndex={2}>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');
      fireEvent.change(input!, { target: { value: 'Shrink this title' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({
          note: 'Slide 3\nShrink this title',
          file: null,
        }),
      });
      await waitFor(() =>
        expect(
          getByText('Your note was sent with the slide number — no preview image attached.'),
        ).toBeTruthy(),
      );
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

  it('sends a box-only mark as a marks-only image when the snapshot fails', async () => {
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const frameRect = {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 320,
        height: 200,
        right: 320,
        bottom: 200,
        toJSON: () => ({}),
      } as DOMRect;
      const { container, getByRole } = render(
        <PreviewDrawOverlay active captureFrameRect={() => frameRect}>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );

      selectBoxTool(container);
      const canvas = container.querySelector<HTMLCanvasElement>('canvas');
      expect(canvas).toBeTruthy();
      drawSelectionBox(canvas!);

      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({
          action: 'send',
          file: expect.any(File),
        }),
      });
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

  it('removes an attached screenshot image from the markup composer', async () => {
    const { container } = render(
      <PreviewDrawOverlay active>
        <iframe title="srcdoc" data-od-render-mode="srcdoc" />
      </PreviewDrawOverlay>,
    );

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeTruthy();
    const file = new File(['pixels'], 'clip.png', { type: 'image/png' });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() =>
      expect(container.querySelectorAll('img[aria-hidden="true"]').length).toBeGreaterThan(0),
    );

    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[title="Remove image"]',
    );
    expect(removeButton).toBeTruthy();
    fireEvent.click(removeButton!);

    await waitFor(() =>
      expect(container.querySelectorAll('img[aria-hidden="true"]').length).toBe(0),
    );
  });

  it('falls back to marks-only quickly for pen-only ink when captureSnapshot is slow', { timeout: 12_000 }, async () => {
    const slowCapture = vi.fn(
      () =>
        new Promise<{ dataUrl: string; w: number; h: number } | null>((resolve) => {
          window.setTimeout(() => resolve({ dataUrl: 'data:image/png;base64,abc', w: 320, h: 200 }), 10_000);
        }),
    );
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const frameRect = {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 320,
        height: 200,
        right: 320,
        bottom: 200,
        toJSON: () => ({}),
      } as DOMRect;
      const { container, getByRole, getByText } = render(
        <PreviewDrawOverlay active captureSnapshot={slowCapture} captureFrameRect={() => frameRect}>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );

      const canvas = container.querySelector<HTMLCanvasElement>('canvas');
      // Pen stroke — fast marks-only fallback is allowed (no box / typed note).
      fireEvent.pointerDown(canvas!, { clientX: 40, clientY: 30, pointerId: 1 });
      fireEvent.pointerMove(canvas!, { clientX: 120, clientY: 90, pointerId: 1 });
      fireEvent.pointerUp(canvas!, { clientX: 120, clientY: 90, pointerId: 1 });

      const started = performance.now();
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1), { timeout: 9_000 });
      expect(performance.now() - started).toBeLessThan(8_500);
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({
          action: 'send',
          file: expect.any(File),
        }),
      });
      await waitFor(() =>
        expect(
          getByText('Preview capture was slow, so only your marks were sent on a blank background.'),
        ).toBeTruthy(),
      );
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

  it('waits for a full slide composite for box marks before marks-only fallback', { timeout: 14_000 }, async () => {
    class ImmediateImage {
      onload: ((ev?: Event) => void) | null = null;
      onerror: ((ev?: Event) => void) | null = null;
      width = 320;
      height = 200;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.(new Event('load')));
      }
    }
    const imageSpy = vi.spyOn(globalThis, 'Image' as any).mockImplementation(function ImageMock() {
      return new ImmediateImage();
    } as any);

    const slowCapture = vi.fn(
      () =>
        new Promise<{ dataUrl: string; w: number; h: number } | null>((resolve) => {
          window.setTimeout(
            () => resolve({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=', w: 320, h: 200 }),
            10_000,
          );
        }),
    );
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const frameRect = {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 320,
        height: 200,
        right: 320,
        bottom: 200,
        toJSON: () => ({}),
      } as DOMRect;
      const { container, getByRole, queryByText } = render(
        <PreviewDrawOverlay active captureSnapshot={slowCapture} captureFrameRect={() => frameRect}>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );

      selectBoxTool(container);
      const canvas = container.querySelector<HTMLCanvasElement>('canvas');
      drawSelectionBox(canvas!);

      const started = performance.now();
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1), { timeout: 12_000 });
      expect(performance.now() - started).toBeGreaterThan(9_500);
      expect(slowCapture).toHaveBeenCalled();
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({
          action: 'send',
          file: expect.any(File),
        }),
      });
      expect(
        queryByText('Preview capture was slow, so only your marks were sent on a blank background.'),
      ).toBeNull();
    } finally {
      imageSpy.mockRestore();
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

  it('sends a box+note without a misleading marks-only PNG when capture never resolves', { timeout: 14_000 }, async () => {
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const neverCapture = vi.fn(
        () => new Promise<{ dataUrl: string; w: number; h: number } | null>(() => {}),
      );
      const frameRect = {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 320,
        height: 200,
        right: 320,
        bottom: 200,
        toJSON: () => ({}),
      } as DOMRect;
      const { container, getByRole, getByText } = render(
        <PreviewDrawOverlay
          active
          captureSnapshot={neverCapture}
          captureFrameRect={() => frameRect}
        >
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );

      selectBoxTool(container);
      const canvas = container.querySelector<HTMLCanvasElement>('canvas');
      drawSelectionBox(canvas!);
      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');
      fireEvent.change(input!, { target: { value: 'Shrink this title' } });

      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1), { timeout: 14_000 });
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({
          action: 'send',
          note: 'Shrink this title',
          file: null,
          bounds: expect.objectContaining({
            width: expect.any(Number),
            height: expect.any(Number),
          }),
        }),
      });
      await waitFor(() =>
        expect(
          getByText('Could not capture preview — only your note was sent. Try Comment mode for element-specific edits.'),
        ).toBeTruthy(),
      );
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

  it('prefers a full slide composite when captureSnapshot resolves within the fast budget', { timeout: 10_000 }, async () => {
    class ImmediateImage {
      onload: ((ev?: Event) => void) | null = null;
      onerror: ((ev?: Event) => void) | null = null;
      width = 320;
      height = 200;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.(new Event('load')));
      }
    }
    const imageSpy = vi.spyOn(globalThis, 'Image' as any).mockImplementation(function ImageMock() {
      return new ImmediateImage();
    } as any);

    const lateButUsableCapture = vi.fn(
      () =>
        new Promise<{ dataUrl: string; w: number; h: number } | null>((resolve) => {
          window.setTimeout(
            () => resolve({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=', w: 320, h: 200 }),
            5_200,
          );
        }),
    );
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const frameRect = {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 320,
        height: 200,
        right: 320,
        bottom: 200,
        toJSON: () => ({}),
      } as DOMRect;
      const { container, getByRole, queryByText } = render(
        <PreviewDrawOverlay
          active
          captureSnapshot={lateButUsableCapture}
          captureFrameRect={() => frameRect}
        >
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );

      selectBoxTool(container);
      const canvas = container.querySelector<HTMLCanvasElement>('canvas');
      drawSelectionBox(canvas!);
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1), { timeout: 8_000 });
      expect(lateButUsableCapture).toHaveBeenCalled();
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({
          action: 'send',
          file: expect.any(File),
        }),
      });
      expect(
        queryByText('Preview capture was slow, so only your marks were sent on a blank background.'),
      ).toBeNull();
    } finally {
      imageSpy.mockRestore();
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });
});

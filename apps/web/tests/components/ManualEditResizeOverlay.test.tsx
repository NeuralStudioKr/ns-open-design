// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ManualEditResizeOverlay } from '../../src/components/ManualEditResizeOverlay';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

afterEach(() => {
  cleanup();
});

function target(over: Partial<ManualEditTarget> = {}): ManualEditTarget {
  return {
    id: 'card',
    kind: 'container',
    label: 'Card',
    tagName: 'div',
    className: 'card',
    text: '',
    rect: { x: 40, y: 60, width: 200, height: 100 },
    fields: {},
    attributes: {},
    styles: { ...emptyManualEditStyles(), width: '200px', height: '100px' },
    isLayoutContainer: true,
    outerHtml: '<div class="card">Card</div>',
    ...over,
  };
}

describe('ManualEditResizeOverlay', () => {
  it('edge body pointerdown resizes instead of moving', () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const onMovePreview = vi.fn();
    const onMoveCommit = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
          rect: { x: 40, y: 60, width: 200, height: 100 },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={onResizeCommit}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={onMoveCommit}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    // jsdom defaults getBoundingClientRect to zeros — pin the host box.
    overlay.getBoundingClientRect = () => ({
      x: 40, y: 60, width: 200, height: 100,
      top: 60, left: 40, right: 240, bottom: 160,
      toJSON: () => ({}),
    }) as DOMRect;
    // SE corner of the overlay body (not the handle button) — must resize.
    fireEvent.pointerDown(overlay, { pointerId: 31, clientX: 238, clientY: 158, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 31, clientX: 278, clientY: 188, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 31, clientX: 278, clientY: 188 });

    expect(onResizePreview).toHaveBeenCalled();
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
    expect(onMovePreview).not.toHaveBeenCalled();
    expect(onMoveCommit).not.toHaveBeenCalled();
  });

  it('body pointerdown moves flow inline SVG via absolute promote', () => {
    const onMovePreview = vi.fn();
    const onMoveCommit = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          kind: 'image',
          tagName: 'svg',
          cssPosition: 'static',
          layoutWidth: 420,
          layoutHeight: 420,
          offsetLeft: 177,
          offsetTop: 44,
          styles: emptyManualEditStyles(),
          rect: { x: 1032, y: 366, width: 420, height: 420 },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={onMoveCommit}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    overlay.getBoundingClientRect = () => ({
      x: 1032, y: 366, width: 420, height: 420,
      top: 366, left: 1032, right: 1452, bottom: 786,
      toJSON: () => ({}),
    }) as DOMRect;
    fireEvent.pointerDown(overlay, { pointerId: 51, clientX: 1200, clientY: 500, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 51, clientX: 1250, clientY: 540, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 51, clientX: 1250, clientY: 540 });

    expect(onMovePreview).toHaveBeenCalled();
    expect(onMoveCommit).toHaveBeenCalledTimes(1);
    const preview = onMovePreview.mock.calls.at(-1)?.[0] as Record<string, string>;
    expect(preview.position).toBe('absolute');
    expect(preview.width).toBe('420px');
    expect(preview.height).toBe('420px');
  });

  it('body pointerdown moves flow raster images via absolute promote', () => {
    const onMovePreview = vi.fn();
    const onMoveCommit = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          kind: 'image',
          tagName: 'img',
          cssPosition: 'static',
          layoutWidth: 64,
          layoutHeight: 64,
          offsetLeft: 24,
          offsetTop: 16,
          styles: emptyManualEditStyles(),
          rect: { x: 100, y: 80, width: 64, height: 64 },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={onMoveCommit}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    overlay.getBoundingClientRect = () => ({
      x: 100, y: 80, width: 64, height: 64,
      top: 80, left: 100, right: 164, bottom: 144,
      toJSON: () => ({}),
    }) as DOMRect;
    fireEvent.pointerDown(overlay, { pointerId: 52, clientX: 120, clientY: 100, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 52, clientX: 160, clientY: 130, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 52, clientX: 160, clientY: 130 });

    expect(onMovePreview).toHaveBeenCalled();
    expect(onMoveCommit).toHaveBeenCalledTimes(1);
    const preview = onMovePreview.mock.calls.at(-1)?.[0] as Record<string, string>;
    expect(preview.position).toBe('absolute');
    expect(preview.width).toBe('64px');
    expect(preview.height).toBe('64px');
  });

  it('edge body pointerdown resizes flow images that cannot move', () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const onMovePreview = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          kind: 'image',
          tagName: 'svg',
          cssPosition: 'static',
          styles: {
            ...emptyManualEditStyles(),
            width: '80px',
            height: '80px',
          },
          rect: { x: 40, y: 60, width: 80, height: 80 },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={onResizeCommit}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={vi.fn()}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    overlay.getBoundingClientRect = () => ({
      x: 40, y: 60, width: 80, height: 80,
      top: 60, left: 40, right: 120, bottom: 140,
      toJSON: () => ({}),
    }) as DOMRect;
    fireEvent.pointerDown(overlay, { pointerId: 42, clientX: 118, clientY: 138, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 42, clientX: 148, clientY: 168, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 42, clientX: 148, clientY: 168 });

    expect(onResizePreview).toHaveBeenCalled();
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
    expect(onMovePreview).not.toHaveBeenCalled();
  });

  it('applies hostOffset so the overlay tracks a non-origin iframe', () => {
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({ rect: { x: 40, y: 60, width: 200, height: 100 } })}
        previewScale={1}
        hostOffset={{ x: 24, y: 16 }}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );
    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.style.left).toBe('64px');
    expect(overlay.style.top).toBe('76px');
  });

  it('prefers live hostPaintRect over composed scale/offset math when idle', () => {
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({ rect: { x: 40, y: 60, width: 200, height: 100 } })}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        hostPaintRect={{ x: 120, y: 80, width: 90, height: 45 }}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );
    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.style.left).toBe('120px');
    expect(overlay.style.top).toBe('80px');
    expect(overlay.style.width).toBe('90px');
    expect(overlay.style.height).toBe('45px');
  });

  it('idle compose uses visual rect, not layoutWidth (deck transform)', () => {
    // layout 400×200 vs visual 100×50 — mixing them oversized the chrome down/right.
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          rect: { x: 40, y: 60, width: 100, height: 50 },
          layoutWidth: 400,
          layoutHeight: 200,
        })}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        hostPaintRect={null}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );
    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.style.left).toBe('40px');
    expect(overlay.style.top).toBe('60px');
    expect(overlay.style.width).toBe('100px');
    expect(overlay.style.height).toBe('50px');
  });

  it('ignores hostPaintRect during resize drafts so the box tracks the pointer', () => {
    const onResizePreview = vi.fn();
    const { getByTestId, rerender } = render(
      <ManualEditResizeOverlay
        target={target({ rect: { x: 40, y: 60, width: 200, height: 100 } })}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        hostPaintRect={{ x: 40, y: 60, width: 200, height: 100 }}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );

    fireEvent.pointerDown(getByTestId('manual-edit-resize-handle-se'), {
      pointerId: 31,
      clientX: 240,
      clientY: 160,
      buttons: 1,
    });
    fireEvent.pointerMove(window, { pointerId: 31, clientX: 300, clientY: 200, buttons: 1 });
    expect(onResizePreview).toHaveBeenCalled();
    const preview = onResizePreview.mock.calls.at(-1)?.[0] as { width?: string; height?: string };
    expect(preview.width).toBe('260px');
    expect(preview.height).toBe('140px');

    rerender(
      <ManualEditResizeOverlay
        target={target({ rect: { x: 40, y: 60, width: 200, height: 100 } })}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        // Stale/reflowed paint mid-drag must not replace composed drafts.
        hostPaintRect={{ x: 10, y: 10, width: 400, height: 300 }}
        draftWidthPx={260}
        draftHeightPx={140}
        onResizePreview={onResizePreview}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    // Still in gesture (dragRef) — layout drafts compose; paint must not win.
    expect(overlay.style.width).toBe('260px');
    expect(overlay.style.height).toBe('140px');
  });

  it('freezes composed host size when previewScale changes mid-drag', () => {
    const onResizePreview = vi.fn();
    const props = {
      target: target(),
      previewScale: 1,
      hostOffset: { x: 10, y: 20 },
      hostPaintRect: { x: 50, y: 80, width: 200, height: 100 } as const,
      draftWidthPx: null as number | null,
      draftHeightPx: null as number | null,
      onResizePreview,
      onResizeCommit: vi.fn(),
      onResizeCancel: vi.fn(),
    };
    const { getByTestId, rerender } = render(<ManualEditResizeOverlay {...props} />);

    fireEvent.pointerDown(getByTestId('manual-edit-resize-handle-se'), {
      pointerId: 1,
      clientX: 240,
      clientY: 160,
      buttons: 1,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 260, clientY: 170, buttons: 1 });
    expect(onResizePreview).toHaveBeenCalled();
    const previewStyles = onResizePreview.mock.calls.at(-1)?.[0] as { width?: string; height?: string };
    expect(previewStyles.width).toBe('220px');
    expect(previewStyles.height).toBe('110px');

    // FileViewer mirrors preview into draft props (content px).
    rerender(
      <ManualEditResizeOverlay
        {...props}
        draftWidthPx={220}
        draftHeightPx={110}
      />,
    );
    const afterDraft = getByTestId('manual-edit-resize-overlay');
    expect(afterDraft.style.width).toBe('220px');
    expect(afterDraft.style.height).toBe('110px');

    // Parent fit-scale / host offset remasure mid-gesture (bug trigger).
    rerender(
      <ManualEditResizeOverlay
        {...props}
        previewScale={0.5}
        hostOffset={{ x: 100, y: 200 }}
        hostPaintRect={{ x: 50, y: 80, width: 110, height: 55 }}
        draftWidthPx={220}
        draftHeightPx={110}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    // Frozen scale=1 / offset=(10,20) — must not shrink to draft×0.5.
    expect(overlay.style.width).toBe('220px');
    expect(overlay.style.height).toBe('110px');
    expect(Number.parseFloat(overlay.style.left)).toBeLessThan(100);
  });

  it('keeps resize pointer delta on the frozen gesture scale after parent scale rerenders', () => {
    const onResizePreview = vi.fn();
    const props = {
      target: target({
        kind: 'text',
        tagName: 'p',
        rect: { x: 40, y: 60, width: 100, height: 50 },
        layoutWidth: 200,
        layoutHeight: 100,
        styles: { ...emptyManualEditStyles(), width: '', height: '' },
      }),
      previewScale: 1,
      hostOffset: { x: 0, y: 0 },
      hostPaintRect: { x: 40, y: 60, width: 100, height: 50 } as const,
      draftWidthPx: null as number | null,
      draftHeightPx: null as number | null,
      onResizePreview,
      onResizeCommit: vi.fn(),
      onResizeCancel: vi.fn(),
    };
    const { getByTestId, rerender } = render(<ManualEditResizeOverlay {...props} />);

    fireEvent.pointerDown(getByTestId('manual-edit-resize-handle-e'), {
      pointerId: 71,
      clientX: 140,
      clientY: 85,
      buttons: 1,
    });
    fireEvent.pointerMove(window, { pointerId: 71, clientX: 150, clientY: 85, buttons: 1 });
    expect((onResizePreview.mock.calls.at(-1)?.[0] as { width?: string }).width).toBe('220px');

    rerender(
      <ManualEditResizeOverlay
        {...props}
        previewScale={0.25}
        hostOffset={{ x: 120, y: 80 }}
        hostPaintRect={{ x: 999, y: 999, width: 25, height: 12.5 }}
        draftWidthPx={220}
        draftHeightPx={100}
      />,
    );
    fireEvent.pointerMove(window, { pointerId: 71, clientX: 160, clientY: 85, buttons: 1 });

    // Frozen gesture scale is paint/layout = 0.5, so host +20 => layout +40.
    // Regression: using the rerendered previewScale=0.25 would jump to 280px.
    expect((onResizePreview.mock.calls.at(-1)?.[0] as { width?: string }).width).toBe('240px');
  });

  it('does not jump to stale hostPaintRect between resize pointerdown and first preview', () => {
    const props = {
      target: target({
        rect: { x: 40, y: 60, width: 100, height: 50 },
        layoutWidth: 200,
        layoutHeight: 100,
      }),
      previewScale: 1,
      hostOffset: { x: 0, y: 0 },
      hostPaintRect: { x: 40, y: 60, width: 100, height: 50 } as const,
      draftWidthPx: null as number | null,
      draftHeightPx: null as number | null,
      onResizePreview: vi.fn(),
      onResizeCommit: vi.fn(),
      onResizeCancel: vi.fn(),
    };
    const { getByTestId, rerender } = render(<ManualEditResizeOverlay {...props} />);
    const handle = getByTestId('manual-edit-resize-handle-se');

    fireEvent.pointerDown(handle, { pointerId: 81, clientX: 140, clientY: 110, buttons: 1 });
    rerender(
      <ManualEditResizeOverlay
        {...props}
        previewScale={0.25}
        hostOffset={{ x: 120, y: 80 }}
        hostPaintRect={{ x: 999, y: 999, width: 25, height: 12.5 }}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.style.left).toBe('40px');
    expect(overlay.style.top).toBe('60px');
    expect(overlay.style.width).toBe('100px');
    expect(overlay.style.height).toBe('50px');
  });

  it('keeps resize handles pointer-hit even when interaction is gated', () => {
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target()}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        disabled
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );
    const handle = getByTestId('manual-edit-resize-handle-se') as HTMLButtonElement;
    // HTML disabled would drop hits through to the movable body (resize→move).
    expect(handle.disabled).toBe(false);
    expect(handle.getAttribute('aria-disabled')).toBe('true');
  });

  it('previews on move and commits once on pointerup', async () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const onResizeCancel = vi.fn();
    const onResizeSessionChange = vi.fn();

    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target()}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={onResizeCommit}
        onResizeCancel={onResizeCancel}
        onResizeSessionChange={onResizeSessionChange}
      />,
    );

    const handle = getByTestId('manual-edit-resize-handle-se');
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 240, clientY: 160, buttons: 1 });
    expect(onResizeSessionChange).toHaveBeenCalledWith(true);

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 260, clientY: 170, buttons: 1 });
    expect(onResizePreview).toHaveBeenCalled();
    const previewStyles = onResizePreview.mock.calls.at(-1)?.[0] as { width?: string; height?: string };
    expect(previewStyles.width).toBe('220px');
    expect(previewStyles.height).toBe('110px');

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 260, clientY: 170 });
    await waitFor(() => expect(onResizeCommit).toHaveBeenCalledTimes(1));
    expect(onResizeCommit.mock.calls[0]?.[0]).toEqual(previewStyles);
    expect(onResizeCommit.mock.calls[0]?.[1]).toEqual({
      width: '200px',
      height: '100px',
      display: '',
      maxWidth: '',
      maxHeight: '',
      left: '',
      top: '',
      right: '',
      bottom: '',
    });
    expect(onResizeCancel).not.toHaveBeenCalled();
    await waitFor(() => expect(onResizeSessionChange).toHaveBeenCalledWith(false));
  });

  it('cancels on Escape without commit', () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const onResizeCancel = vi.fn();

    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target()}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={onResizeCommit}
        onResizeCancel={onResizeCancel}
      />,
    );

    const handle = getByTestId('manual-edit-resize-handle-e');
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 100, clientY: 100, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 140, clientY: 100, buttons: 1 });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onResizeCancel).toHaveBeenCalledTimes(1);
    expect(onResizeCancel.mock.calls[0]?.[0]).toEqual({
      width: '200px',
      height: '100px',
      display: '',
      maxWidth: '',
      maxHeight: '',
      left: '',
      top: '',
      right: '',
      bottom: '',
    });
    expect(onResizeCommit).not.toHaveBeenCalled();
  });

  it('resize stylesBefore preserves authored right/bottom for cancel', () => {
    const onResizeCancel = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
            right: '0px',
            bottom: '0px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={onResizeCancel}
      />,
    );

    const handle = getByTestId('manual-edit-resize-handle-e');
    fireEvent.pointerDown(handle, { pointerId: 6, clientX: 100, clientY: 100, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 6, clientX: 140, clientY: 100, buttons: 1 });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onResizeCancel.mock.calls[0]?.[0]).toMatchObject({
      right: '0px',
      bottom: '0px',
      width: '200px',
      left: '40px',
    });
  });

  it('does not commit or cancel a bare resize-handle click', () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const onResizeCancel = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target()}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={onResizeCommit}
        onResizeCancel={onResizeCancel}
      />,
    );

    const handle = getByTestId('manual-edit-resize-handle-e');
    fireEvent.pointerDown(handle, { pointerId: 4, clientX: 100, clientY: 100, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 100, clientY: 100 });
    expect(onResizePreview).not.toHaveBeenCalled();
    expect(onResizeCommit).not.toHaveBeenCalled();
    expect(onResizeCancel).not.toHaveBeenCalled();
  });

  it('W-resize overlay follows viewport Δ when CB left ≠ rect.x', () => {
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          offsetLeft: 40,
          offsetTop: 60,
          rect: { x: 160, y: 180, width: 200, height: 100 },
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    const handle = getByTestId('manual-edit-resize-handle-w');
    expect(overlay.style.left).toBe('160px');

    // Drag W edge +40 content px → width 160, CB left 80, viewport x 200.
    fireEvent.pointerDown(handle, { pointerId: 5, clientX: 160, clientY: 200, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 5, clientX: 200, clientY: 200, buttons: 1 });
    expect(overlay.style.left).toBe('200px');
    expect(overlay.style.top).toBe('180px');
  });

  it('scales host deltas by previewScale', () => {
    const onResizePreview = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target()}
        previewScale={0.5}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );

    const handle = getByTestId('manual-edit-resize-handle-e');
    // host +20px at scale 0.5 → content +40px
    fireEvent.pointerDown(handle, { pointerId: 3, clientX: 0, clientY: 0, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 20, clientY: 0, buttons: 1 });
    expect(onResizePreview.mock.calls.at(-1)?.[0]).toEqual({
      width: '240px',
      maxWidth: 'none',
      right: '',
    });
  });

  it('absolute body-drag overlay follows viewport delta when CB left ≠ rect.x', () => {
    // Nested absolute: CSS left/top are containing-block relative; rect is viewport.
    // Overlay must track startRect + Δ, not raw CSS left/top (post-promote re-drag).
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          offsetLeft: 40,
          offsetTop: 60,
          rect: { x: 160, y: 180, width: 200, height: 100 },
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={vi.fn()}
        onMoveCommit={vi.fn()}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.style.left).toBe('160px');
    expect(overlay.style.top).toBe('180px');

    fireEvent.pointerDown(overlay, { pointerId: 11, clientX: 100, clientY: 100, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 140, clientY: 120, buttons: 1 });

    // Δ +40,+20 → viewport 200,200. Raw CSS left/top (80,80) must not drive the box.
    expect(overlay.style.left).toBe('200px');
    expect(overlay.style.top).toBe('200px');
  });

  it('keeps move pointer delta on the frozen gesture scale after parent scale rerenders', () => {
    const onMovePreview = vi.fn();
    const props = {
      target: target({
        cssPosition: 'absolute',
        styles: {
          ...emptyManualEditStyles(),
          width: '200px',
          height: '100px',
          left: '40px',
          top: '60px',
        },
        rect: { x: 40, y: 60, width: 100, height: 50 },
        layoutWidth: 200,
        layoutHeight: 100,
      }),
      previewScale: 1,
      hostOffset: { x: 0, y: 0 },
      hostPaintRect: { x: 40, y: 60, width: 100, height: 50 } as const,
      draftWidthPx: null as number | null,
      draftHeightPx: null as number | null,
      onResizePreview: vi.fn(),
      onResizeCommit: vi.fn(),
      onResizeCancel: vi.fn(),
      onMovePreview,
      onMoveCommit: vi.fn(),
      onMoveCancel: vi.fn(),
    };
    const { getByTestId, rerender } = render(<ManualEditResizeOverlay {...props} />);
    const overlay = getByTestId('manual-edit-resize-overlay');
    overlay.getBoundingClientRect = () => ({
      x: 40, y: 60, width: 100, height: 50,
      top: 60, left: 40, right: 140, bottom: 110,
      toJSON: () => ({}),
    }) as DOMRect;

    fireEvent.pointerDown(overlay, { pointerId: 72, clientX: 90, clientY: 85, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 72, clientX: 100, clientY: 90, buttons: 1 });
    expect(onMovePreview.mock.calls.at(-1)?.[0]).toMatchObject({
      left: '60px',
      top: '70px',
    });

    rerender(
      <ManualEditResizeOverlay
        {...props}
        previewScale={0.25}
        hostOffset={{ x: 120, y: 80 }}
        hostPaintRect={{ x: 999, y: 999, width: 25, height: 12.5 }}
        draftLeftPx={60}
        draftTopPx={70}
      />,
    );
    fireEvent.pointerMove(window, { pointerId: 72, clientX: 110, clientY: 95, buttons: 1 });

    // Frozen gesture scale is paint/layout = 0.5, so host +20/+10 => layout +40/+20.
    // Regression: using the rerendered previewScale=0.25 would jump to 80/100.
    expect(onMovePreview.mock.calls.at(-1)?.[0]).toMatchObject({
      left: '80px',
      top: '80px',
    });
  });

  it('does not jump to stale hostPaintRect between move pointerdown and first preview', () => {
    const props = {
      target: target({
        cssPosition: 'absolute',
        styles: {
          ...emptyManualEditStyles(),
          width: '200px',
          height: '100px',
          left: '40px',
          top: '60px',
        },
        rect: { x: 40, y: 60, width: 100, height: 50 },
        layoutWidth: 200,
        layoutHeight: 100,
      }),
      previewScale: 1,
      hostOffset: { x: 0, y: 0 },
      hostPaintRect: { x: 40, y: 60, width: 100, height: 50 } as const,
      draftWidthPx: null as number | null,
      draftHeightPx: null as number | null,
      onResizePreview: vi.fn(),
      onResizeCommit: vi.fn(),
      onResizeCancel: vi.fn(),
      onMovePreview: vi.fn(),
      onMoveCommit: vi.fn(),
      onMoveCancel: vi.fn(),
    };
    const { getByTestId, rerender } = render(<ManualEditResizeOverlay {...props} />);
    const overlay = getByTestId('manual-edit-resize-overlay');

    fireEvent.pointerDown(overlay, { pointerId: 82, clientX: 90, clientY: 85, buttons: 1 });
    rerender(
      <ManualEditResizeOverlay
        {...props}
        previewScale={0.25}
        hostOffset={{ x: 120, y: 80 }}
        hostPaintRect={{ x: 999, y: 999, width: 25, height: 12.5 }}
      />,
    );

    const nextOverlay = getByTestId('manual-edit-resize-overlay');
    expect(nextOverlay.style.left).toBe('40px');
    expect(nextOverlay.style.top).toBe('60px');
    expect(nextOverlay.style.width).toBe('100px');
    expect(nextOverlay.style.height).toBe('50px');
  });

  it('body drag moves absolute target and commits left/top once', async () => {
    const onMovePreview = vi.fn();
    const onMoveCommit = vi.fn();
    const onMoveCancel = vi.fn();
    const onResizeSessionChange = vi.fn();
    const onResizeCommit = vi.fn();

    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={onResizeCommit}
        onResizeCancel={vi.fn()}
        onResizeSessionChange={onResizeSessionChange}
        onMovePreview={onMovePreview}
        onMoveCommit={onMoveCommit}
        onMoveCancel={onMoveCancel}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.getAttribute('data-movable')).toBe('true');

    fireEvent.pointerDown(overlay, { pointerId: 10, clientX: 100, clientY: 100, buttons: 1 });
    expect(onResizeSessionChange).toHaveBeenCalledWith(true);

    fireEvent.pointerMove(window, { pointerId: 10, clientX: 140, clientY: 120, buttons: 1 });
    expect(onMovePreview).toHaveBeenCalled();
    expect(onMovePreview.mock.calls.at(-1)?.[0]).toEqual({
      left: '80px',
      top: '80px',
      right: '',
      bottom: '',
    });

    fireEvent.pointerUp(window, { pointerId: 10, clientX: 140, clientY: 120 });
    await waitFor(() => expect(onMoveCommit).toHaveBeenCalledTimes(1));
    expect(onMoveCommit.mock.calls[0]?.[0]).toEqual({
      left: '80px',
      top: '80px',
      right: '',
      bottom: '',
    });
    // stylesBefore lets FileViewer keyed-rollback iframe/draft if flush fails.
    expect(onMoveCommit.mock.calls[0]?.[1]).toEqual({
      left: '40px',
      top: '60px',
      right: '',
      bottom: '',
    });
    expect(onMoveCancel).not.toHaveBeenCalled();
    expect(onResizeCommit).not.toHaveBeenCalled();
    await waitFor(() => expect(onResizeSessionChange).toHaveBeenCalledWith(false));
  });

  it('passes viewport draft with move preview so parent rerenders do not snap back', () => {
    const onMovePreview = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
          rect: { x: 160, y: 180, width: 200, height: 100 },
          offsetLeft: 40,
          offsetTop: 60,
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={vi.fn()}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    fireEvent.pointerDown(overlay, { pointerId: 73, clientX: 100, clientY: 100, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 73, clientX: 140, clientY: 120, buttons: 1 });

    expect(onMovePreview).toHaveBeenCalled();
    expect(onMovePreview.mock.calls.at(-1)?.[0]).toEqual({
      left: '80px',
      top: '80px',
      right: '',
      bottom: '',
    });
    expect(onMovePreview.mock.calls.at(-1)?.[1]).toEqual({ x: 200, y: 200 });
  });

  it('Shift during body drag locks to the dominant axis', () => {
    const onMovePreview = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={vi.fn()}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    fireEvent.pointerDown(overlay, { pointerId: 21, clientX: 100, clientY: 100, buttons: 1 });
    fireEvent.pointerMove(window, {
      pointerId: 21,
      clientX: 160,
      clientY: 112,
      buttons: 1,
      shiftKey: true,
    });
    expect(onMovePreview.mock.calls.at(-1)?.[0]).toMatchObject({
      left: '100px',
      top: '60px',
    });
  });

  it('body drag Escape cancels move without commit', () => {
    const onMoveCommit = vi.fn();
    const onMoveCancel = vi.fn();

    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={vi.fn()}
        onMoveCommit={onMoveCommit}
        onMoveCancel={onMoveCancel}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    fireEvent.pointerDown(overlay, { pointerId: 11, clientX: 50, clientY: 50, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 90, clientY: 70, buttons: 1 });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onMoveCancel).toHaveBeenCalledTimes(1);
    expect(onMoveCancel.mock.calls[0]?.[0]).toEqual({
      left: '40px',
      top: '60px',
      right: '',
      bottom: '',
    });
    expect(onMoveCommit).not.toHaveBeenCalled();
  });

  it('static target body-drag commits relative offsets without size-locking siblings', () => {
    const onMoveCommit = vi.fn();
    const onMovePreview = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'static',
          offsetLeft: 40,
          offsetTop: 60,
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={onMoveCommit}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.getAttribute('data-movable')).toBe('true');
    fireEvent.pointerDown(overlay, { pointerId: 12, clientX: 50, clientY: 50, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 12, clientX: 90, clientY: 70, buttons: 1 });
    expect(onMovePreview.mock.calls.at(-1)?.[0]).toEqual({
      position: 'relative',
      left: '40px',
      top: '20px',
      right: '',
      bottom: '',
    });
    fireEvent.pointerUp(window, { pointerId: 12, clientX: 90, clientY: 70 });
    expect(onMoveCommit).toHaveBeenCalledTimes(1);
    expect(onMoveCommit.mock.calls[0]?.[0]).toEqual({
      position: 'relative',
      left: '40px',
      top: '20px',
      right: '',
      bottom: '',
    });
    expect(onMoveCommit.mock.calls[0]?.[1]).toMatchObject({
      position: '',
      left: '',
      top: '',
      width: '200px',
      height: '100px',
    });
  });

  it('static promote does not preview or cancel below move threshold', () => {
    const onMovePreview = vi.fn();
    const onMoveCancel = vi.fn();
    const onMoveCommit = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'static',
          offsetLeft: 40,
          offsetTop: 60,
          styles: emptyManualEditStyles(),
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={onMoveCommit}
        onMoveCancel={onMoveCancel}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    fireEvent.pointerDown(overlay, { pointerId: 13, clientX: 50, clientY: 50, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 13, clientX: 51, clientY: 50, buttons: 1 });
    expect(onMovePreview).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onMoveCancel).not.toHaveBeenCalled();
    expect(onMoveCommit).not.toHaveBeenCalled();
  });

  it('absolute sub-threshold body drag does not preview or cancel', () => {
    const onMoveCommit = vi.fn();
    const onMoveCancel = vi.fn();
    const onMovePreview = vi.fn();

    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={onMoveCommit}
        onMoveCancel={onMoveCancel}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    fireEvent.pointerDown(overlay, { pointerId: 16, clientX: 50, clientY: 50, buttons: 1 });
    // 1px < MANUAL_EDIT_MOVE_MIN_DELTA_PX (2)
    fireEvent.pointerMove(window, { pointerId: 16, clientX: 51, clientY: 50, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 16, clientX: 51, clientY: 50 });

    expect(onMovePreview).not.toHaveBeenCalled();
    expect(onMoveCancel).not.toHaveBeenCalled();
    expect(onMoveCommit).not.toHaveBeenCalled();
  });

  it('flow image overlay is interactive for resize handles and body move', () => {
    // Flow images cannot move; overlay body captures edge band so resize works
    // while host-chrome suppresses iframe pointer events on the graphic.
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          kind: 'image',
          tagName: 'img',
          cssPosition: 'static',
          styles: emptyManualEditStyles(),
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.getAttribute('data-movable')).toBe('true');
    expect(overlay.className).toMatch(/interactive/);
    expect(getByTestId('manual-edit-resize-handle-se')).not.toBeNull();
  });

  it('forwards dblclick on movable text to onStartTextEdit', () => {
    const onStartTextEdit = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          kind: 'text',
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            left: '40px',
            top: '60px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onStartTextEdit={onStartTextEdit}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.getAttribute('data-movable')).toBe('true');
    fireEvent.doubleClick(overlay);
    expect(onStartTextEdit).toHaveBeenCalledWith('card');
  });

  it('body click without preview does not cancel (keeps unrelated pending safe)', () => {
    const onMoveCommit = vi.fn();
    const onMoveCancel = vi.fn();
    const onMovePreview = vi.fn();

    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={onMoveCommit}
        onMoveCancel={onMoveCancel}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    fireEvent.pointerDown(overlay, { pointerId: 13, clientX: 50, clientY: 50, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 13, clientX: 50, clientY: 50 });
    expect(onMovePreview).not.toHaveBeenCalled();
    expect(onMoveCommit).not.toHaveBeenCalled();
    expect(onMoveCancel).not.toHaveBeenCalled();
  });

  it('pointercancel after move preview cancels instead of committing', () => {
    const onMoveCommit = vi.fn();
    const onMoveCancel = vi.fn();

    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={vi.fn()}
        onMoveCommit={onMoveCommit}
        onMoveCancel={onMoveCancel}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    fireEvent.pointerDown(overlay, { pointerId: 14, clientX: 50, clientY: 50, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 14, clientX: 100, clientY: 80, buttons: 1 });
    fireEvent.pointerCancel(window, { pointerId: 14, clientX: 100, clientY: 80 });

    expect(onMoveCancel).toHaveBeenCalledTimes(1);
    expect(onMoveCommit).not.toHaveBeenCalled();
  });

  it('resize handle drag does not start a move session', () => {
    const onMovePreview = vi.fn();
    const onMoveCommit = vi.fn();
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();

    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
        })}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={onResizeCommit}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={onMoveCommit}
        onMoveCancel={vi.fn()}
      />,
    );

    const handle = getByTestId('manual-edit-resize-handle-se');
    fireEvent.pointerDown(handle, { pointerId: 15, clientX: 240, clientY: 160, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 15, clientX: 260, clientY: 180, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 15, clientX: 260, clientY: 180 });

    expect(onResizePreview).toHaveBeenCalled();
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
    expect(onMovePreview).not.toHaveBeenCalled();
    expect(onMoveCommit).not.toHaveBeenCalled();
  });

  it('E drag under deck fit-scale grows layout width instead of writing visual rect', () => {
    // Visual gBCR is half of layout (stage transform scale 0.5). Idle overlay
    // uses hostPaintRect (visual). First E preview must write layout+Δ, not
    // collapse width to the transform-shrunk rect (one-char text column).
    const onResizePreview = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          kind: 'text',
          tagName: 'p',
          rect: { x: 40, y: 60, width: 100, height: 50 },
          layoutWidth: 200,
          layoutHeight: 100,
          styles: { ...emptyManualEditStyles(), width: '', height: '' },
        })}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        hostPaintRect={{ x: 40, y: 60, width: 100, height: 50 }}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );

    const handle = getByTestId('manual-edit-resize-handle-e');
    // host +20 at paint/layout scale 0.5 → content/layout +40 → width 240
    fireEvent.pointerDown(handle, { pointerId: 21, clientX: 140, clientY: 85, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 21, clientX: 160, clientY: 85, buttons: 1 });

    expect(onResizePreview).toHaveBeenCalled();
    const preview = onResizePreview.mock.calls.at(-1)?.[0] as { width?: string };
    expect(preview.width).toBe('240px');
    // Regression: writing visual start (100+…) would shrink the 200px layout box.
    expect(Number.parseInt(preview.width!, 10)).toBeGreaterThan(200);
  });

  it('promotes inline text to inline-block during resize so width and height apply', () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          kind: 'text',
          tagName: 'span',
          rect: { x: 40, y: 60, width: 120, height: 28 },
          layoutWidth: 120,
          layoutHeight: 28,
          styles: { ...emptyManualEditStyles(), width: '', height: '', display: '' },
        })}
        previewScale={1}
        hostPaintRect={{ x: 40, y: 60, width: 120, height: 28 }}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={onResizeCommit}
        onResizeCancel={vi.fn()}
      />,
    );

    fireEvent.pointerDown(getByTestId('manual-edit-resize-handle-e'), {
      pointerId: 51,
      clientX: 160,
      clientY: 74,
      buttons: 1,
    });
    fireEvent.pointerMove(window, { pointerId: 51, clientX: 200, clientY: 74, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 51, clientX: 200, clientY: 74 });

    expect(onResizePreview.mock.calls.at(-1)?.[0]).toMatchObject({
      display: 'inline-block',
      width: '160px',
      maxWidth: 'none',
    });
    expect(onResizeCommit.mock.calls.at(-1)?.[0]).toMatchObject({
      display: 'inline-block',
      width: '160px',
      maxWidth: 'none',
    });
  });

  it('uses the latest selected target when deciding inline resize promotion', () => {
    const onResizePreview = vi.fn();
    const props = {
      previewScale: 1,
      hostPaintRect: { x: 40, y: 60, width: 120, height: 28 },
      draftWidthPx: null,
      draftHeightPx: null,
      onResizePreview,
      onResizeCommit: vi.fn(),
      onResizeCancel: vi.fn(),
    };
    const { getByTestId, rerender } = render(
      <ManualEditResizeOverlay
        {...props}
        target={target({
          id: 'old-card',
          kind: 'container',
          tagName: 'div',
          rect: { x: 40, y: 60, width: 120, height: 28 },
          layoutWidth: 120,
          layoutHeight: 28,
        })}
      />,
    );

    rerender(
      <ManualEditResizeOverlay
        {...props}
        target={target({
          id: 'fresh-inline',
          kind: 'text',
          tagName: 'span',
          rect: { x: 40, y: 60, width: 120, height: 28 },
          layoutWidth: 120,
          layoutHeight: 28,
          styles: { ...emptyManualEditStyles(), width: '', height: '', display: '' },
        })}
      />,
    );

    fireEvent.pointerDown(getByTestId('manual-edit-resize-handle-e'), {
      pointerId: 52,
      clientX: 160,
      clientY: 74,
      buttons: 1,
    });
    fireEvent.pointerMove(window, { pointerId: 52, clientX: 200, clientY: 74, buttons: 1 });

    expect(onResizePreview.mock.calls.at(-1)?.[0]).toMatchObject({
      display: 'inline-block',
      width: '160px',
    });
  });

  it('onResolveResizeStart overrides stale visual-only target at pointerdown', () => {
    const onResizePreview = vi.fn();
    const onResolveResizeStart = vi.fn(() => ({
      layoutWidth: 200,
      layoutHeight: 100,
      rect: { x: 40, y: 60, width: 100, height: 50 },
      paint: { x: 40, y: 60, width: 100, height: 50 },
    }));
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          kind: 'text',
          tagName: 'p',
          // Stale props: visual size only — would collapse without live resolve.
          rect: { x: 40, y: 60, width: 100, height: 50 },
          styles: { ...emptyManualEditStyles(), width: '', height: '' },
        })}
        previewScale={1}
        hostPaintRect={{ x: 40, y: 60, width: 100, height: 50 }}
        draftWidthPx={null}
        draftHeightPx={null}
        onResolveResizeStart={onResolveResizeStart}
        onResizePreview={onResizePreview}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );

    fireEvent.pointerDown(getByTestId('manual-edit-resize-handle-e'), {
      pointerId: 22,
      clientX: 140,
      clientY: 85,
      buttons: 1,
    });
    fireEvent.pointerMove(window, { pointerId: 22, clientX: 160, clientY: 85, buttons: 1 });

    expect(onResolveResizeStart).toHaveBeenCalled();
    const preview = onResizePreview.mock.calls.at(-1)?.[0] as { width?: string };
    expect(preview.width).toBe('240px');
  });

  it('idle hybrid move draft does not override hostPaint under deck fit-scale', () => {
    // Parent may still hold hybrid draftLeft/Top after seal clears dragRef.
    // Painting draft×previewScale(~1) jumps past the visual host box.
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '80px',
            top: '80px',
          },
          rect: { x: 60, y: 70, width: 100, height: 50 },
          layoutWidth: 200,
          layoutHeight: 100,
        })}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        hostPaintRect={{ x: 60, y: 70, width: 100, height: 50 }}
        draftWidthPx={null}
        draftHeightPx={null}
        draftLeftPx={80}
        draftTopPx={80}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={vi.fn()}
        onMoveCommit={vi.fn()}
        onMoveCancel={vi.fn()}
      />,
    );
    const box = getByTestId('manual-edit-resize-overlay');
    expect(box.style.left).toBe('60px');
    expect(box.style.top).toBe('70px');
    expect(box.style.width).toBe('100px');
    expect(box.style.height).toBe('50px');
  });

  it('body-move under deck fit-scale keeps host size (does not jump to layout px)', () => {
    // Idle paint is visual 100×50. First move preview must not compose layout
    // 200×100 at freeze scale≈1 (jump). Freeze must be paint/layout = 0.5.
    const onMovePreview = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
          rect: { x: 40, y: 60, width: 100, height: 50 },
          layoutWidth: 200,
          layoutHeight: 100,
        })}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        hostPaintRect={{ x: 40, y: 60, width: 100, height: 50 }}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={vi.fn()}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.style.width).toBe('100px');
    expect(overlay.style.height).toBe('50px');
    overlay.getBoundingClientRect = () => ({
      x: 40, y: 60, width: 100, height: 50,
      top: 60, left: 40, right: 140, bottom: 110,
      toJSON: () => ({}),
    }) as DOMRect;

    // Interior hit → move (not edge resize).
    fireEvent.pointerDown(overlay, { pointerId: 41, clientX: 90, clientY: 85, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 41, clientX: 110, clientY: 95, buttons: 1 });

    expect(onMovePreview).toHaveBeenCalled();
    const moved = getByTestId('manual-edit-resize-overlay');
    expect(moved.style.width).toBe('100px');
    expect(moved.style.height).toBe('50px');
  });

  it('body-move under deck fit-scale keeps host position through pointerup handoff', async () => {
    // Mid-drag host left/top must survive commit: parent seeds visual rect + paint
    // (not hybrid viewport × previewScale=1, which jumped +layoutΔ).
    const onMoveCommit = vi.fn();
    const startTarget = target({
      cssPosition: 'absolute',
      styles: {
        ...emptyManualEditStyles(),
        width: '200px',
        height: '100px',
        left: '40px',
        top: '60px',
      },
      rect: { x: 40, y: 60, width: 100, height: 50 },
      layoutWidth: 200,
      layoutHeight: 100,
    });
    const props = {
      target: startTarget,
      previewScale: 1,
      hostOffset: { x: 0, y: 0 },
      hostPaintRect: { x: 40, y: 60, width: 100, height: 50 } as const,
      draftWidthPx: null as number | null,
      draftHeightPx: null as number | null,
      draftLeftPx: null as number | null,
      draftTopPx: null as number | null,
      onResizePreview: vi.fn(),
      onResizeCommit: vi.fn(),
      onResizeCancel: vi.fn(),
      onMovePreview: vi.fn(),
      onMoveCommit,
      onMoveCancel: vi.fn(),
    };
    const { getByTestId, rerender } = render(<ManualEditResizeOverlay {...props} />);
    const overlay = getByTestId('manual-edit-resize-overlay');
    overlay.getBoundingClientRect = () => ({
      x: 40, y: 60, width: 100, height: 50,
      top: 60, left: 40, right: 140, bottom: 110,
      toJSON: () => ({}),
    }) as DOMRect;

    fireEvent.pointerDown(overlay, { pointerId: 42, clientX: 90, clientY: 85, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 42, clientX: 110, clientY: 95, buttons: 1 });
    // hostScale 0.5 → layout Δ +40,+20; host box moves +20,+10 → left/top 60,70
    expect(getByTestId('manual-edit-resize-overlay').style.left).toBe('60px');
    expect(getByTestId('manual-edit-resize-overlay').style.top).toBe('70px');

    onMoveCommit.mockImplementation((_styles, _before, viewport) => {
      // Parent contract after fix: visual rect + seeded paint (not hybrid 80,80).
      const visual = {
        x: 60,
        y: 70,
        width: 100,
        height: 50,
      };
      expect(viewport).toEqual({ x: 80, y: 80 }); // hybrid still reported to parent
      rerender(
        <ManualEditResizeOverlay
          {...props}
          target={{ ...startTarget, rect: visual, styles: { ...startTarget.styles, left: '80px', top: '80px' } }}
          hostPaintRect={visual}
          draftLeftPx={null}
          draftTopPx={null}
        />,
      );
    });

    fireEvent.pointerUp(window, { pointerId: 42, clientX: 110, clientY: 95 });
    await waitFor(() => expect(onMoveCommit).toHaveBeenCalled());
    const after = getByTestId('manual-edit-resize-overlay');
    expect(after.style.left).toBe('60px');
    expect(after.style.top).toBe('70px');
    expect(after.style.width).toBe('100px');
    expect(after.style.height).toBe('50px');
  });

  it('keeps freeze compose through async move commit before idle paint handoff', async () => {
    // Sticky pin / flush await used to clear liveViewport immediately → hybrid×1 jump
    // while parent work was still in flight. Seal must hold host box until commit settles.
    let releaseCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const onMoveCommit = vi.fn(async () => {
      await commitGate;
    });
    const startTarget = target({
      cssPosition: 'absolute',
      styles: {
        ...emptyManualEditStyles(),
        width: '200px',
        height: '100px',
        left: '40px',
        top: '60px',
      },
      rect: { x: 40, y: 60, width: 100, height: 50 },
      layoutWidth: 200,
      layoutHeight: 100,
    });
    const { getByTestId, rerender } = render(
      <ManualEditResizeOverlay
        target={startTarget}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        hostPaintRect={{ x: 40, y: 60, width: 100, height: 50 }}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={vi.fn()}
        onMoveCommit={onMoveCommit}
        onMoveCancel={vi.fn()}
      />,
    );
    const overlay = getByTestId('manual-edit-resize-overlay');
    overlay.getBoundingClientRect = () => ({
      x: 40, y: 60, width: 100, height: 50,
      top: 60, left: 40, right: 140, bottom: 110,
      toJSON: () => ({}),
    }) as DOMRect;

    fireEvent.pointerDown(overlay, { pointerId: 43, clientX: 90, clientY: 85, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 43, clientX: 110, clientY: 95, buttons: 1 });
    expect(getByTestId('manual-edit-resize-overlay').style.left).toBe('60px');

    fireEvent.pointerUp(window, { pointerId: 43, clientX: 110, clientY: 95 });
    await waitFor(() => expect(onMoveCommit).toHaveBeenCalled());
    // Still sealed on freeze compose — must not snap to hybrid 80 or stale idle paint.
    expect(getByTestId('manual-edit-resize-overlay').style.left).toBe('60px');
    expect(getByTestId('manual-edit-resize-overlay').style.top).toBe('70px');

    await act(async () => {
      rerender(
        <ManualEditResizeOverlay
          target={{
            ...startTarget,
            rect: { x: 60, y: 70, width: 100, height: 50 },
            styles: { ...startTarget.styles, left: '80px', top: '80px' },
          }}
          previewScale={1}
          hostOffset={{ x: 0, y: 0 }}
          hostPaintRect={{ x: 60, y: 70, width: 100, height: 50 }}
          draftWidthPx={null}
          draftHeightPx={null}
          draftLeftPx={null}
          draftTopPx={null}
          onResizePreview={vi.fn()}
          onResizeCommit={vi.fn()}
          onResizeCancel={vi.fn()}
          onMovePreview={vi.fn()}
          onMoveCommit={onMoveCommit}
          onMoveCancel={vi.fn()}
        />,
      );
      releaseCommit();
    });
    await waitFor(() => {
      const box = getByTestId('manual-edit-resize-overlay');
      expect(box.style.left).toBe('60px');
      expect(box.style.top).toBe('70px');
    });
  });

  it('body-move without hostPaintRect still freezes visual/layout scale from target rect', () => {
    const onMovePreview = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          cssPosition: 'absolute',
          styles: {
            ...emptyManualEditStyles(),
            width: '200px',
            height: '100px',
            left: '40px',
            top: '60px',
          },
          rect: { x: 40, y: 60, width: 100, height: 50 },
          layoutWidth: 200,
          layoutHeight: 100,
        })}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        hostPaintRect={null}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={vi.fn()}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    expect(overlay.style.width).toBe('100px');
    expect(overlay.style.height).toBe('50px');
    overlay.getBoundingClientRect = () => ({
      x: 40, y: 60, width: 100, height: 50,
      top: 60, left: 40, right: 140, bottom: 110,
      toJSON: () => ({}),
    }) as DOMRect;

    fireEvent.pointerDown(overlay, { pointerId: 42, clientX: 90, clientY: 85, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 42, clientX: 110, clientY: 95, buttons: 1 });

    expect(onMovePreview).toHaveBeenCalled();
    expect(overlay.style.width).toBe('100px');
    expect(overlay.style.height).toBe('50px');
  });

  it('resize without hostPaintRect still maps host delta through visual/layout scale', () => {
    const onResizePreview = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          kind: 'text',
          tagName: 'p',
          rect: { x: 40, y: 60, width: 100, height: 50 },
          layoutWidth: 200,
          layoutHeight: 100,
          styles: { ...emptyManualEditStyles(), width: '', height: '' },
        })}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        hostPaintRect={null}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );

    fireEvent.pointerDown(getByTestId('manual-edit-resize-handle-e'), {
      pointerId: 43,
      clientX: 140,
      clientY: 85,
      buttons: 1,
    });
    fireEvent.pointerMove(window, { pointerId: 43, clientX: 160, clientY: 85, buttons: 1 });

    expect(onResizePreview).toHaveBeenCalled();
    const preview = onResizePreview.mock.calls.at(-1)?.[0] as { width?: string };
    expect(preview.width).toBe('240px');
  });

  it('promotes flow text on interior drag past the move threshold', () => {
    const onMovePreview = vi.fn();
    const onMoveCommit = vi.fn();
    const onResizePreview = vi.fn();
    const { getByTestId } = render(
      <ManualEditResizeOverlay
        target={target({
          kind: 'text',
          tagName: 'h2',
          cssPosition: 'static',
          rect: { x: 40, y: 60, width: 220, height: 48 },
          layoutWidth: 220,
          layoutHeight: 48,
          offsetLeft: 40,
          offsetTop: 60,
          styles: { ...emptyManualEditStyles(), width: '', height: '', display: '' },
        })}
        previewScale={1}
        hostPaintRect={{ x: 40, y: 60, width: 220, height: 48 }}
        draftWidthPx={null}
        draftHeightPx={null}
        onResizePreview={onResizePreview}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
        onMovePreview={onMovePreview}
        onMoveCommit={onMoveCommit}
        onMoveCancel={vi.fn()}
      />,
    );

    const overlay = getByTestId('manual-edit-resize-overlay');
    overlay.getBoundingClientRect = () => ({
      x: 40, y: 60, width: 220, height: 48,
      top: 60, left: 40, right: 260, bottom: 108,
      toJSON: () => ({}),
    }) as DOMRect;

    expect(overlay.getAttribute('data-movable')).toBe('true');
    // Interior (not edge band) so resize handle hit does not win.
    fireEvent.pointerDown(overlay, { pointerId: 61, clientX: 140, clientY: 84, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 61, clientX: 190, clientY: 104, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 61, clientX: 190, clientY: 104 });

    expect(onResizePreview).not.toHaveBeenCalled();
    expect(onMovePreview).toHaveBeenCalled();
    expect(onMoveCommit).toHaveBeenCalled();
    const commit = onMoveCommit.mock.calls[0]?.[0] as { position?: string; left?: string; top?: string };
    expect(commit.position).toBe('relative');
    expect(commit.left).toMatch(/px$/);
    expect(commit.top).toMatch(/px$/);
  });

  it('ignores stale hostPaintRect after resize commit and uses composed target size', async () => {
    let releaseCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const onResizeCommit = vi.fn(async () => {
      await commitGate;
    });
    const startTarget = target({
      rect: { x: 40, y: 60, width: 200, height: 100 },
      layoutWidth: 400,
      layoutHeight: 200,
      styles: { ...emptyManualEditStyles(), width: '400px', height: '200px' },
    });
    const shrunkVisual = { x: 40, y: 60, width: 120, height: 60 };
    const props = {
      target: startTarget,
      previewScale: 1,
      hostOffset: { x: 0, y: 0 },
      hostPaintRect: { x: 40, y: 60, width: 200, height: 100 } as const,
      draftWidthPx: null as number | null,
      draftHeightPx: null as number | null,
      onResizePreview: vi.fn(),
      onResizeCommit,
      onResizeCancel: vi.fn(),
    };
    const { getByTestId, rerender } = render(<ManualEditResizeOverlay {...props} />);
    const overlay = getByTestId('manual-edit-resize-overlay');
    overlay.getBoundingClientRect = () => ({
      x: 40, y: 60, width: 200, height: 100,
      top: 60, left: 40, right: 240, bottom: 160,
      toJSON: () => ({}),
    }) as DOMRect;

    fireEvent.pointerDown(getByTestId('manual-edit-resize-handle-se'), {
      pointerId: 90,
      clientX: 240,
      clientY: 160,
      buttons: 1,
    });
    fireEvent.pointerMove(window, { pointerId: 90, clientX: 160, clientY: 120, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 90, clientX: 160, clientY: 120 });

    await waitFor(() => expect(onResizeCommit).toHaveBeenCalled());
    // Parent still reports pre-resize paint while commit is in flight.
    rerender(
      <ManualEditResizeOverlay
        {...props}
        target={{ ...startTarget, rect: shrunkVisual, layoutWidth: 240, layoutHeight: 120 }}
        hostPaintRect={{ x: 40, y: 60, width: 200, height: 100 }}
        draftWidthPx={null}
        draftHeightPx={null}
      />,
    );
    const mid = getByTestId('manual-edit-resize-overlay');
    expect(mid.style.width).toBe('120px');
    expect(mid.style.height).toBe('60px');

    releaseCommit();
    await waitFor(() => {
      rerender(
        <ManualEditResizeOverlay
          {...props}
          target={{ ...startTarget, rect: shrunkVisual, layoutWidth: 240, layoutHeight: 120 }}
          hostPaintRect={{ x: 40, y: 60, width: 120, height: 60 }}
          draftWidthPx={null}
          draftHeightPx={null}
        />,
      );
    });
    const after = getByTestId('manual-edit-resize-overlay');
    expect(after.style.width).toBe('120px');
    expect(after.style.height).toBe('60px');
  });

  it('ignores stale hostPaintRect after move commit and uses composed target position', async () => {
    let releaseCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const onMoveCommit = vi.fn(async () => {
      await commitGate;
    });
    const startTarget = target({
      rect: { x: 40, y: 60, width: 200, height: 100 },
      layoutWidth: 400,
      layoutHeight: 200,
      offsetLeft: 40,
      offsetTop: 60,
      styles: { ...emptyManualEditStyles(), width: '400px', height: '200px', display: '' },
    });
    const movedVisual = { x: 140, y: 110, width: 200, height: 100 };
    const props = {
      target: startTarget,
      previewScale: 1,
      hostOffset: { x: 0, y: 0 },
      hostPaintRect: { x: 40, y: 60, width: 200, height: 100 } as const,
      draftWidthPx: null as number | null,
      draftHeightPx: null as number | null,
      onResizePreview: vi.fn(),
      onResizeCommit: vi.fn(),
      onResizeCancel: vi.fn(),
      onMovePreview: vi.fn(),
      onMoveCommit,
      onMoveCancel: vi.fn(),
    };
    const { getByTestId, rerender } = render(<ManualEditResizeOverlay {...props} />);
    const overlay = getByTestId('manual-edit-resize-overlay');
    overlay.getBoundingClientRect = () => ({
      x: 40, y: 60, width: 200, height: 100,
      top: 60, left: 40, right: 240, bottom: 160,
      toJSON: () => ({}),
    }) as DOMRect;

    fireEvent.pointerDown(overlay, { pointerId: 91, clientX: 140, clientY: 110, buttons: 1 });
    fireEvent.pointerMove(window, { pointerId: 91, clientX: 240, clientY: 160, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 91, clientX: 240, clientY: 160 });

    await waitFor(() => expect(onMoveCommit).toHaveBeenCalled());
    rerender(
      <ManualEditResizeOverlay
        {...props}
        target={{ ...startTarget, rect: movedVisual }}
        hostPaintRect={{ x: 40, y: 60, width: 200, height: 100 }}
        draftWidthPx={null}
        draftHeightPx={null}
      />,
    );
    const mid = getByTestId('manual-edit-resize-overlay');
    expect(mid.style.left).toBe('140px');
    expect(mid.style.top).toBe('110px');

    releaseCommit();
    await waitFor(() => {
      rerender(
        <ManualEditResizeOverlay
          {...props}
          target={{ ...startTarget, rect: movedVisual }}
          hostPaintRect={{ x: 140, y: 110, width: 200, height: 100 }}
          draftWidthPx={null}
          draftHeightPx={null}
        />,
      );
    });
    const after = getByTestId('manual-edit-resize-overlay');
    expect(after.style.left).toBe('140px');
    expect(after.style.top).toBe('110px');
  });
});

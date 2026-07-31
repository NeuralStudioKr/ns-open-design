// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
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
  it('previews on move and commits once on pointerup', () => {
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

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 260, clientY: 170, buttons: 1 });
    expect(onResizePreview).toHaveBeenCalled();
    const previewStyles = onResizePreview.mock.calls.at(-1)?.[0] as { width?: string; height?: string };
    expect(previewStyles.width).toBe('220px');
    expect(previewStyles.height).toBe('110px');

    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 260, clientY: 170 });
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
    expect(onResizeCommit.mock.calls[0]?.[0]).toEqual(previewStyles);
    expect(onResizeCancel).not.toHaveBeenCalled();
    expect(onResizeSessionChange).toHaveBeenCalledWith(false);
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
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 140, clientY: 100, buttons: 1 });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onResizeCancel).toHaveBeenCalledTimes(1);
    expect(onResizeCancel.mock.calls[0]?.[0]).toEqual({
      width: '200px',
      height: '100px',
      left: '',
      top: '',
    });
    expect(onResizeCommit).not.toHaveBeenCalled();
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
    fireEvent.pointerMove(handle, { pointerId: 3, clientX: 20, clientY: 0, buttons: 1 });
    expect(onResizePreview.mock.calls.at(-1)?.[0]).toEqual({ width: '240px' });
  });

  it('body drag moves absolute target and commits left/top once', () => {
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
    expect(onMoveCommit).toHaveBeenCalledTimes(1);
    expect(onMoveCommit.mock.calls[0]?.[0]).toEqual({
      left: '80px',
      top: '80px',
      right: '',
      bottom: '',
    });
    expect(onMoveCancel).not.toHaveBeenCalled();
    expect(onResizeCommit).not.toHaveBeenCalled();
    expect(onResizeSessionChange).toHaveBeenCalledWith(false);
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

  it('static target promote-on-drag commits position absolute', () => {
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
    expect(onMovePreview.mock.calls.at(-1)?.[0]).toMatchObject({
      position: 'absolute',
      left: '80px',
      top: '80px',
      width: '200px',
      height: '100px',
    });
    fireEvent.pointerUp(window, { pointerId: 12, clientX: 90, clientY: 70 });
    expect(onMoveCommit).toHaveBeenCalledTimes(1);
    expect(onMoveCommit.mock.calls[0]?.[0]).toMatchObject({
      position: 'absolute',
      left: '80px',
      top: '80px',
    });
  });

  it('sub-threshold body drag after preview cancels without commit', () => {
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
    fireEvent.pointerDown(overlay, { pointerId: 16, clientX: 50, clientY: 50, buttons: 1 });
    // 1px < MANUAL_EDIT_MOVE_MIN_DELTA_PX (2)
    fireEvent.pointerMove(window, { pointerId: 16, clientX: 51, clientY: 50, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 16, clientX: 51, clientY: 50 });

    expect(onMoveCancel).toHaveBeenCalledTimes(1);
    expect(onMoveCommit).not.toHaveBeenCalled();
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
    fireEvent.pointerMove(handle, { pointerId: 15, clientX: 260, clientY: 180, buttons: 1 });
    fireEvent.pointerUp(handle, { pointerId: 15, clientX: 260, clientY: 180 });

    expect(onResizePreview).toHaveBeenCalled();
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
    expect(onMovePreview).not.toHaveBeenCalled();
    expect(onMoveCommit).not.toHaveBeenCalled();
  });
});

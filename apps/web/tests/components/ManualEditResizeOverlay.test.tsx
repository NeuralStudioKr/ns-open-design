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
});

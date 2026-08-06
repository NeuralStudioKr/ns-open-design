// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ManualEditMultiSelectOverlay } from '../../src/components/ManualEditMultiSelectOverlay';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

afterEach(() => {
  cleanup();
});

function target(
  id: string,
  rect: { x: number; y: number; width: number; height: number },
): ManualEditTarget {
  return {
    id,
    kind: 'container',
    label: id,
    tagName: 'div',
    className: '',
    text: id,
    rect,
    fields: {},
    attributes: { 'data-od-id': id },
    styles: emptyManualEditStyles(),
    cssPosition: 'absolute',
    isLayoutContainer: false,
    outerHtml: `<div data-od-id="${id}">${id}</div>`,
  };
}

describe('ManualEditMultiSelectOverlay', () => {
  it('prefers composed draft rects over stale live paint during group move', () => {
    const measureHostRect = vi.fn((id: string) => {
      if (id === 'a') return { x: 100, y: 80, width: 50, height: 40 };
      if (id === 'b') return { x: 200, y: 80, width: 50, height: 40 };
      return null;
    });
    const targets = [
      target('a', { x: 40, y: 30, width: 100, height: 80 }),
      target('b', { x: 160, y: 30, width: 100, height: 80 }),
    ];
    const draftMemberRects = {
      a: { x: 90, y: 30, width: 100, height: 80 },
      b: { x: 210, y: 30, width: 100, height: 80 },
    };

    const { getByTestId } = render(
      <ManualEditMultiSelectOverlay
        targets={targets}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        measureHostRect={measureHostRect}
        draftMemberRects={draftMemberRects}
        movable
      />,
    );

    const overlay = getByTestId('manual-edit-multi-select-overlay');
    expect(overlay.style.left).toBe('90px');
    expect(overlay.style.top).toBe('30px');
    expect(overlay.style.width).toBe('220px');
    expect(overlay.style.height).toBe('80px');
    expect(measureHostRect).not.toHaveBeenCalled();
  });

  it('uses live paint when idle without draft rects', () => {
    const measureHostRect = vi.fn((id: string) => {
      if (id === 'a') return { x: 12, y: 18, width: 60, height: 30 };
      if (id === 'b') return { x: 92, y: 18, width: 60, height: 30 };
      return null;
    });
    const targets = [
      target('a', { x: 40, y: 30, width: 100, height: 80 }),
      target('b', { x: 160, y: 30, width: 100, height: 80 }),
    ];

    const { getByTestId } = render(
      <ManualEditMultiSelectOverlay
        targets={targets}
        previewScale={1}
        hostOffset={{ x: 0, y: 0 }}
        measureHostRect={measureHostRect}
        movable
      />,
    );

    const overlay = getByTestId('manual-edit-multi-select-overlay');
    expect(overlay.style.left).toBe('12px');
    expect(overlay.style.top).toBe('18px');
    expect(overlay.style.width).toBe('140px');
    expect(overlay.style.height).toBe('30px');
    expect(measureHostRect).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';
import { ManualEditResizeOverlay } from '../../src/components/ManualEditResizeOverlay';

describe('ManualEditResizeOverlay', () => {
  it('renders eight resize handles for an eligible target', () => {
    render(
      <ManualEditResizeOverlay
        target={target()}
        previewScale={1}
        draftWidthPx={null}
        draftHeightPx={null}
        onSessionStart={vi.fn()}
        onResizePreview={vi.fn()}
        onResizeCommit={vi.fn()}
        onResizeCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId('manual-edit-resize-overlay')).toBeTruthy();
    expect(screen.getByTestId('manual-edit-resize-handle-se')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(8);
  });
});

function target(): ManualEditTarget {
  return {
    id: 'card',
    kind: 'container',
    label: 'Card',
    tagName: 'div',
    className: 'card',
    text: '',
    rect: { x: 40, y: 60, width: 200, height: 120 },
    fields: {},
    attributes: { 'data-od-id': 'card' },
    styles: { ...emptyManualEditStyles(), width: '200px', height: '120px' },
    isLayoutContainer: true,
    outerHtml: '<div data-od-id="card" class="card"></div>',
  };
}

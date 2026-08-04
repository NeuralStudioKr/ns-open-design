// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VisualCommentAttachmentChip } from '../../src/components/VisualCommentAttachmentChip';

vi.mock('../../src/components/AuthenticatedProjectFileImage', () => ({
  AuthenticatedProjectFileImage: ({ path }: { path: string }) => (
    <img data-testid="auth-project-image" src={`blob:${path}`} alt="" />
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VisualCommentAttachmentChip', () => {
  it('renders screenshot thumbnail for visual marks when the file exists', () => {
    render(
      <VisualCommentAttachmentChip
        attachment={{
          id: 'visual-mark-1',
          order: 1,
          filePath: 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png',
          elementId: 'visual-mark-1',
          selector: '',
          label: 'Visual mark',
          comment: 'draw a heart here',
          currentText: '',
          pagePosition: { x: 0.2, y: 0.3 },
          htmlHint: '',
          selectionKind: 'visual',
          screenshotPath: 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png',
          markKind: 'stroke',
        }}
        projectId="project-1"
        projectFileNames={new Set(['mse7c6na-drawing-2026-08-04T05-12-44-933Z.png'])}
      />,
    );

    expect(screen.getByTestId('auth-project-image')).toBeTruthy();
    expect(screen.getByText('draw a heart here')).toBeTruthy();
  });

  it('uses local preview for pending annotation paths', () => {
    render(
      <VisualCommentAttachmentChip
        attachment={{
          id: 'visual-pending',
          order: 1,
          filePath: 'pending-annotation:abc',
          elementId: 'visual-pending',
          selector: '',
          label: 'Visual mark',
          comment: 'heart',
          currentText: '',
          pagePosition: { x: 0.2, y: 0.3 },
          htmlHint: '',
          selectionKind: 'visual',
          screenshotPath: 'pending-annotation:abc',
          markKind: 'stroke',
        }}
        projectId="project-1"
        localPreviewUrl="blob:pending"
      />,
    );

    expect(screen.queryByTestId('auth-project-image')).toBeNull();
    const img = document.querySelector('.visual-comment-attachment-thumb');
    expect(img?.getAttribute('src')).toBe('blob:pending');
  });
});

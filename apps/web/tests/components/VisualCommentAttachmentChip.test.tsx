// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VisualCommentAttachmentChip } from '../../src/components/VisualCommentAttachmentChip';

vi.mock('../../src/components/AuthenticatedProjectFileImage', () => ({
  AuthenticatedProjectFileImage: ({
    path,
    trustExists,
  }: {
    path: string;
    trustExists?: boolean;
  }) => (
    <img
      data-testid="auth-project-image"
      data-trust-exists={trustExists ? '1' : '0'}
      src={`blob:${path}`}
      alt=""
    />
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

    const img = screen.getByTestId('auth-project-image');
    expect(img).toBeTruthy();
    expect(img.getAttribute('data-trust-exists')).toBe('0');
    expect(screen.getByText('draw a heart here')).toBeTruthy();
    expect(screen.queryByText('Visual mark')).toBeNull();
  });

  it('composer still attempts a remote fetch when the file index lags fresh uploads', () => {
    // Composer uploads can land before `/files` refreshes. History must not
    // use this path — deleted drawings would re-spam /presign-get on every open.
    render(
      <VisualCommentAttachmentChip
        attachment={{
          id: 'visual-mark-stale',
          order: 1,
          filePath: 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png',
          elementId: 'visual-mark-stale',
          selector: '',
          label: 'Visual mark',
          comment: 'heart',
          currentText: '',
          pagePosition: { x: 0.2, y: 0.3 },
          htmlHint: '',
          selectionKind: 'visual',
          screenshotPath: 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png',
          markKind: 'stroke',
        }}
        projectId="project-1"
        projectFileNames={new Set(['deck.html'])}
        variant="composer"
      />,
    );

    expect(screen.getByTestId('auth-project-image')).toBeTruthy();
    expect(screen.getByText('heart')).toBeTruthy();
  });

  it('history does not fetch deleted drawings that are absent from the file index', () => {
    render(
      <VisualCommentAttachmentChip
        attachment={{
          id: 'visual-mark-deleted',
          order: 1,
          filePath: 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png',
          elementId: 'visual-mark-deleted',
          selector: '',
          label: 'Visual mark',
          comment: 'gone',
          currentText: '',
          pagePosition: { x: 0.2, y: 0.3 },
          htmlHint: '',
          selectionKind: 'visual',
          screenshotPath: 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png',
          markKind: 'stroke',
        }}
        projectId="project-1"
        projectFileNames={new Set(['deck.html'])}
        variant="history"
      />,
    );

    expect(screen.queryByTestId('auth-project-image')).toBeNull();
    expect(screen.getByText('gone')).toBeTruthy();
    expect(
      document.querySelector('.visual-comment-attachment-icon'),
    ).toBeTruthy();
  });

  it('history waits for the file index before probing ephemeral drawings', () => {
    render(
      <VisualCommentAttachmentChip
        attachment={{
          id: 'visual-mark-wait',
          order: 1,
          filePath: 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png',
          elementId: 'visual-mark-wait',
          selector: '',
          label: 'Visual mark',
          comment: 'wait',
          currentText: '',
          pagePosition: { x: 0.2, y: 0.3 },
          htmlHint: '',
          selectionKind: 'visual',
          screenshotPath: 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png',
          markKind: 'stroke',
        }}
        projectId="project-1"
        variant="history"
      />,
    );

    expect(screen.queryByTestId('auth-project-image')).toBeNull();
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

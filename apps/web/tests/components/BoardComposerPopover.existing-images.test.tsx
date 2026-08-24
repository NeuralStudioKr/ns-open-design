// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoardComposerPopover } from '../../src/components/BoardComposerPopover';
import type { PreviewCommentSnapshot } from '../../src/comments';

vi.mock('../../src/components/AuthenticatedProjectFileImage', () => ({
  AuthenticatedProjectFileImage: ({
    path,
    trustExists,
    allowBackgroundRetry,
  }: {
    path: string;
    trustExists?: boolean;
    allowBackgroundRetry?: boolean;
  }) => (
    <img
      data-testid="auth-project-image"
      data-path={path}
      data-trust-exists={trustExists ? '1' : '0'}
      data-allow-background-retry={allowBackgroundRetry ? '1' : '0'}
      src={`blob:${path}`}
      alt=""
    />
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function elementTarget(): PreviewCommentSnapshot {
  return {
    filePath: 'index.html',
    elementId: 'hero',
    selector: '[data-od-id="hero"]',
    label: 'Hero',
    text: 'Hero',
    position: { x: 8, y: 12, width: 120, height: 48 },
    htmlHint: '<main data-od-id="hero">Hero</main>',
  };
}

describe('BoardComposerPopover existing memo images', () => {
  it('trusts durable saved uploads so thumbs render after S3 lag', () => {
    render(
      <BoardComposerPopover
        target={elementTarget()}
        existing={null}
        draft=""
        notes={[]}
        onDraft={() => {}}
        onAddDraft={() => {}}
        onRemoveQueuedNote={() => {}}
        onClose={() => {}}
        onSaveComment={() => {}}
        onSendBatch={() => {}}
        onRemoveMember={() => {}}
        sending={false}
        projectId="project-1"
        existingImages={[{ path: 'uploads/ref-a.png', name: 'ref-a.png' }]}
        t={((key: string) => String(key)) as never}
      />,
    );

    const img = screen.getByTestId('auth-project-image');
    expect(img.getAttribute('data-path')).toBe('uploads/ref-a.png');
    expect(img.getAttribute('data-trust-exists')).toBe('1');
    expect(img.getAttribute('data-allow-background-retry')).toBe('1');
    expect(screen.getByTestId('comment-popover-existing-image')).toBeTruthy();
  });

  it('does not trust ephemeral drawing screenshots', () => {
    render(
      <BoardComposerPopover
        target={elementTarget()}
        existing={null}
        draft=""
        notes={[]}
        onDraft={() => {}}
        onAddDraft={() => {}}
        onRemoveQueuedNote={() => {}}
        onClose={() => {}}
        onSaveComment={() => {}}
        onSendBatch={() => {}}
        onRemoveMember={() => {}}
        sending={false}
        projectId="project-1"
        existingImages={[{
          path: 'mse7c6na-drawing-2026-08-04T05-12-44-933Z.png',
          name: 'drawing.png',
        }]}
        t={((key: string) => String(key)) as never}
      />,
    );

    const img = screen.getByTestId('auth-project-image');
    expect(img.getAttribute('data-trust-exists')).toBe('0');
    expect(img.getAttribute('data-allow-background-retry')).toBe('0');
  });
});

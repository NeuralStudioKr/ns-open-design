// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: () => false,
}));

vi.mock('../../src/components/AuthenticatedProjectFileImage', () => ({
  AuthenticatedProjectFileImage: () => <img data-testid="auth-project-image" alt="" />,
}));

import { BoardComposerPopover } from '../../src/components/BoardComposerPopover';
import type { PreviewCommentSnapshot } from '../../src/comments';

afterEach(() => {
  cleanup();
});

const target: PreviewCommentSnapshot = {
  filePath: 'index.html',
  elementId: 'hero-title',
  selector: '#hero-title',
  label: 'Hero title',
  text: '',
  position: { x: 0, y: 0, width: 100, height: 24 },
  htmlHint: '',
  selectionKind: 'element',
};

function renderPopover({
  onSaveComment = () => {},
  onSendBatch = () => {},
  onAddDraft = () => {},
  sending = false,
  selectionKind = 'element',
  targetOverride = {},
  draft = 'Tighten this heading',
  existingImages = [],
  projectId = 'project-1',
  bounds,
}: {
  onSaveComment?: () => void;
  onSendBatch?: () => void;
  onAddDraft?: () => void;
  sending?: boolean;
  selectionKind?: PreviewCommentSnapshot['selectionKind'];
  targetOverride?: Partial<PreviewCommentSnapshot>;
  draft?: string;
  existingImages?: { path: string; name: string }[];
  projectId?: string;
  bounds?: { width: number; height: number; scrollLeft?: number; scrollTop?: number };
} = {}) {
  return render(
    <BoardComposerPopover
      target={{ ...target, ...targetOverride, selectionKind }}
      existing={null}
      draft={draft}
      notes={[]}
      onDraft={() => {}}
      onAddDraft={onAddDraft}
      onRemoveQueuedNote={() => {}}
      onClose={() => {}}
      onSaveComment={onSaveComment}
      onSendBatch={onSendBatch}
      onRemoveMember={() => {}}
      existingImages={existingImages}
      projectId={projectId}
      sending={sending}
      t={((key: string) => String(key)) as never}
      bounds={bounds}
    />,
  );
}

describe('BoardComposerPopover keyboard submit', () => {
  it('queues element memos via add-note before send-to-chat', () => {
    const onAddDraft = vi.fn();
    renderPopover({ onAddDraft });

    fireEvent.click(screen.getByTestId('comment-popover-add-note'));

    expect(onAddDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('comment-popover-add-note')).toBeTruthy();
  });

  it('saves an element comment with Enter and keeps Shift+Enter for multiline text', () => {
    const onSaveComment = vi.fn();
    renderPopover({ onSaveComment });

    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Enter' });

    expect(onSaveComment).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Enter', shiftKey: true });
    expect(onSaveComment).toHaveBeenCalledTimes(1);
  });

  it('sends a pod comment with Enter', () => {
    const onSendBatch = vi.fn();
    renderPopover({ onSendBatch, selectionKind: 'pod' });

    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Enter' });

    expect(onSendBatch).toHaveBeenCalledTimes(1);
  });

  it('allows existing saved images to submit without typed text', () => {
    const onSaveComment = vi.fn();
    const onSendBatch = vi.fn();
    renderPopover({
      draft: '',
      existingImages: [{ path: 'uploads/ref.png', name: 'ref.png' }],
      onSaveComment,
      onSendBatch,
    });

    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Enter' });
    expect(onSaveComment).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('comment-add-send'));
    expect(onSendBatch).toHaveBeenCalledTimes(1);
  });

  it('does not submit while disabled or while IME text is composing', () => {
    const onSaveComment = vi.fn();
    const { rerender } = renderPopover({ onSaveComment, sending: true });
    const input = screen.getByTestId('comment-popover-input');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSaveComment).not.toHaveBeenCalled();

    rerender(
      <BoardComposerPopover
        target={target}
        existing={null}
        draft="Tighten this heading"
        notes={[]}
        onDraft={() => {}}
        onAddDraft={() => {}}
        onRemoveQueuedNote={() => {}}
        onClose={() => {}}
        onSaveComment={onSaveComment}
        onSendBatch={() => {}}
        onRemoveMember={() => {}}
        sending={false}
        t={((key: string) => String(key)) as never}
      />,
    );

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSaveComment).not.toHaveBeenCalled();
  });

  it('keeps the full composer inside the visible preview bounds for low targets', () => {
    renderPopover({
      targetOverride: {
        position: { x: 24, y: 560, width: 120, height: 40 },
      },
      bounds: { width: 800, height: 600 },
    });

    const popover = screen.getByTestId('comment-popover');
    const top = Number.parseInt(popover.style.top, 10);

    expect(top).toBeLessThanOrEqual(266);
    expect(Number.parseInt(popover.style.maxHeight, 10)).toBeGreaterThan(0);
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileRevision } from '@open-design/contracts';
import { FileRevisionHistoryPanel } from '../../src/components/FileRevisionHistoryPanel';

afterEach(() => {
  cleanup();
});

function revision(overrides: Partial<FileRevision> = {}): FileRevision {
  return {
    id: 'rev-1',
    projectId: 'project-1',
    fileName: 'deck.html',
    parentRevisionId: null,
    sequence: 1,
    createdAt: Date.UTC(2026, 6, 30, 12, 0, 0),
    byteSize: 1200,
    source: 'manual_edit',
    label: 'Edit title',
    ...overrides,
  };
}

describe('FileRevisionHistoryPanel', () => {
  it('shows empty state when there are no revisions', () => {
    render(
      <FileRevisionHistoryPanel
        revisions={[]}
        cursorRevisionId={null}
        retentionLimit={30}
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('file-revision-history-empty')).toBeTruthy();
  });

  it('lists revisions and calls restore for non-current items', () => {
    const onRestore = vi.fn();
    const revisions = [
      revision({ id: 'rev-1', sequence: 1, label: 'First edit' }),
      revision({ id: 'rev-2', sequence: 2, label: 'Second edit' }),
    ];

    render(
      <FileRevisionHistoryPanel
        revisions={revisions}
        cursorRevisionId="rev-2"
        retentionLimit={30}
        onRestore={onRestore}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('file-revision-history-item-2')).toBeTruthy();
    expect(screen.getByTestId('file-revision-history-retention-hint')).toBeTruthy();
    fireEvent.click(screen.getByTestId('file-revision-restore-1'));
    expect(onRestore).toHaveBeenCalledWith(revisions[0]);
  });

  it('shows retention pending hint when cleanup is still running', () => {
    render(
      <FileRevisionHistoryPanel
        revisions={[revision({ id: 'rev-1', sequence: 1 })]}
        cursorRevisionId="rev-1"
        retentionLimit={30}
        retentionPending
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('file-revision-history-retention-hint').textContent).toContain('Trimming');
  });
});

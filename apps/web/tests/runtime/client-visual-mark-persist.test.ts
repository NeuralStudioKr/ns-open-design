import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatCommentAttachment } from '@open-design/contracts';

import {
  deriveClientVisualMarkRevisionLabel,
  tryPersistClientVisualMarksOnSend,
} from '../../src/runtime/client-visual-mark-persist';

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFileText: vi.fn(),
  pushProjectFileRevision: vi.fn(),
}));

vi.mock('../../src/runtime/revision-active-sequence', () => ({
  getActiveRevisionSequence: vi.fn(() => 2),
  setActiveRevisionSequence: vi.fn(),
}));

vi.mock('../../src/runtime/revision-content-cache', () => ({
  setRevisionContentCache: vi.fn(),
}));

const { fetchProjectFileText, pushProjectFileRevision } = await import('../../src/providers/registry');

function visualAttachment(overrides: Partial<ChatCommentAttachment> = {}): ChatCommentAttachment {
  return {
    id: 'visual-mark-1',
    order: 1,
    filePath: 'deck.html',
    elementId: 'visual-mark-1',
    selector: '',
    label: 'Marked screenshot region',
    comment: '하트 넣어줘',
    currentText: '',
    pagePosition: { x: 0.4, y: 0.3, width: 0.1, height: 0.1 },
    htmlHint: '',
    selectionKind: 'visual',
    screenshotPath: 'drawing-1.png',
    markKind: 'stroke',
    slideIndex: 0,
    ...overrides,
  };
}

describe('client-visual-mark-persist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('labels heart visual marks for revision history', () => {
    expect(deriveClientVisualMarkRevisionLabel([visualAttachment()])).toBe('Visual mark: heart');
  });

  it('grafts screenshot-only visual marks and pushes a revision', async () => {
    vi.mocked(fetchProjectFileText).mockResolvedValue(
      '<html><body><section class="slide" data-slide-index="0"><h1>Title</h1></section></body></html>',
    );
    vi.mocked(pushProjectFileRevision).mockResolvedValue({
      ok: true,
      revision: {
        id: 'rev-2',
        projectId: 'project-1',
        fileName: 'deck.html',
        parentRevisionId: 'rev-1',
        sequence: 2,
        createdAt: Date.now(),
        byteSize: 120,
        source: 'manual_edit',
        label: 'Visual mark: heart',
      },
      file: { name: 'deck.html', path: 'deck.html', kind: 'html', mtime: Date.now() },
    } as never);

    const result = await tryPersistClientVisualMarksOnSend({
      projectId: 'project-1',
      commentAttachments: [visualAttachment()],
      projectFiles: [{ name: 'deck.html', path: 'deck.html', kind: 'html', mtime: 1 }],
      conversationId: 'conv-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileName).toBe('deck.html');
    expect(pushProjectFileRevision).toHaveBeenCalledWith(
      'project-1',
      'deck.html',
      expect.objectContaining({
        source: 'manual_edit',
        label: 'Visual mark: heart',
        truncateAfterSequence: 2,
      }),
    );
    const pushedContent = vi.mocked(pushProjectFileRevision).mock.calls[0]?.[2]?.content as string;
    expect(pushedContent).toContain('od-visual-mark-target');
    expect(pushedContent).toContain('<svg');
  });

  it('skips element-scoped comment attachments', async () => {
    const result = await tryPersistClientVisualMarksOnSend({
      projectId: 'project-1',
      commentAttachments: [
        visualAttachment({
          elementId: 'title-1',
          selector: '[data-od-id="title-1"]',
        }),
      ],
      projectFiles: [{ name: 'deck.html', path: 'deck.html', kind: 'html', mtime: 1 }],
    });

    expect(result.ok).toBe(false);
    expect(pushProjectFileRevision).not.toHaveBeenCalled();
  });
});

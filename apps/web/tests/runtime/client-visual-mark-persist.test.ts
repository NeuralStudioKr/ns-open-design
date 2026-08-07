import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatCommentAttachment } from '@open-design/contracts';

import {
  deriveClientVisualMarkRevisionLabel,
  tryPersistClientVisualMarksOnSend,
} from '../../src/runtime/client-visual-mark-persist';

const here = dirname(fileURLToPath(import.meta.url));
const persistSource = readFileSync(
  join(here, '../../src/runtime/client-visual-mark-persist.ts'),
  'utf8',
);

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

  it('reuses reconcile sections when grafting visual marks', () => {
    expect(persistSource).toContain('currentSlides: scope.sections');
    expect(persistSource).toContain('graftVisualMarksIntoDeckHtml(currentHtml, withSlideIndex, {');
    expect(persistSource).toContain('artifactDocumentHeadLooksIntact(grafted)');
  });

  it('labels heart visual marks for revision history', () => {
    expect(deriveClientVisualMarkRevisionLabel([visualAttachment()])).toBe('Visual mark: heart');
  });

  it('grafts screenshot-only visual marks and pushes a revision', async () => {
    vi.mocked(fetchProjectFileText).mockResolvedValue(
      '<!doctype html><html><body><section class="slide" data-slide-index="0"><h1>Title</h1></section></body></html>',
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

  it('scrubs sibling script/on* before pushing client visual-mark grafts', async () => {
    vi.mocked(fetchProjectFileText).mockResolvedValue(
      [
        '<!doctype html><html><body>',
        '<section class="slide" data-slide-index="0">',
        '<h1>Title</h1>',
        '<img src="x" onerror="alert(1)">',
        '<script>alert(2)</script>',
        '</section></body></html>',
      ].join(''),
    );
    vi.mocked(pushProjectFileRevision).mockResolvedValue({
      ok: true,
      revision: {
        id: 'rev-3',
        projectId: 'project-1',
        fileName: 'deck.html',
        parentRevisionId: 'rev-2',
        sequence: 3,
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
    });

    expect(result.ok).toBe(true);
    const pushedContent = vi.mocked(pushProjectFileRevision).mock.calls[0]?.[2]?.content as string;
    expect(pushedContent).toContain('od-visual-mark-target');
    expect(pushedContent).not.toMatch(/onerror/i);
    expect(pushedContent).not.toMatch(/<script\b/i);
  });

  it('grafts drawn visual marks even when the reconciler bound them to a DOM element', async () => {
    // A drawn mark's intent is to ADD a shape at the drawn position, so even
    // when the bounds happen to overlap an existing element and the
    // reconciler assigns a real elementId, we still graft on the client side
    // instead of routing to the model as an element-patch.
    vi.mocked(fetchProjectFileText).mockResolvedValue(
      '<html><body><section class="slide" data-slide-index="0"><h1 data-od-id="title-1">Title</h1></section></body></html>',
    );
    vi.mocked(pushProjectFileRevision).mockResolvedValue({
      ok: true,
      revision: {
        id: 'rev-3',
        projectId: 'project-1',
        fileName: 'deck.html',
        parentRevisionId: 'rev-2',
        sequence: 3,
        createdAt: Date.now(),
        byteSize: 200,
        source: 'manual_edit',
        label: 'Visual mark: heart',
      },
      file: { name: 'deck.html', path: 'deck.html', kind: 'html', mtime: Date.now() },
    } as never);

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

    expect(result.ok).toBe(true);
    expect(pushProjectFileRevision).toHaveBeenCalled();
  });

  it('skips comment attachments with no drawn mark and no screenshot', async () => {
    const result = await tryPersistClientVisualMarksOnSend({
      projectId: 'project-1',
      commentAttachments: [
        visualAttachment({
          markKind: undefined,
          screenshotPath: '',
          selectionKind: 'element',
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

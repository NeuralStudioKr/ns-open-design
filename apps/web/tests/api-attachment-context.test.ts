import { afterEach, describe, expect, it, vi } from 'vitest';

import { historyWithApiAttachmentContext } from '../src/api-attachment-context';
import {
  fetchProjectFilePreview,
  fetchProjectFileText,
} from '../src/providers/registry';
import type { ChatMessage, ProjectFile } from '../src/types';

vi.mock('../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../src/providers/registry')>(
    '../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFilePreview: vi.fn().mockResolvedValue(null),
    fetchProjectFileText: vi.fn().mockResolvedValue(null),
  };
});

const mockedFetchProjectFilePreview = vi.mocked(fetchProjectFilePreview);
const mockedFetchProjectFileText = vi.mocked(fetchProjectFileText);

describe('historyWithApiAttachmentContext', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('adds extracted document previews to the target user message', async () => {
    mockedFetchProjectFilePreview.mockResolvedValue({
      kind: 'document',
      title: 'brief.docx',
      sections: [{ title: 'Document', lines: ['Hello world', 'Second line'] }],
    });

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Summarize this', [{ path: 'brief.docx', name: 'brief.docx', kind: 'file' }])],
      'msg-1',
      'project-1',
      [projectFile('brief.docx', 'document')],
    );

    expect(mockedFetchProjectFilePreview).toHaveBeenCalledWith('project-1', 'brief.docx');
    expect(history[0]?.content).toContain('<attached-project-files>');
    expect(history[0]?.content).toContain('user-visible order');
    expect(history[0]?.content).toContain('### Attachment 1: brief.docx');
    expect(history[0]?.content).toContain('Hello world');
    expect(history[0]?.content).toContain('Second line');
  });

  it('preserves uploaded attachment order with numbered headings', async () => {
    const history = await historyWithApiAttachmentContext(
      [
        userMessage('msg-1', 'Compare the first and second image', [
          { path: 'uploads/first.png', name: 'image.png', kind: 'image' },
          { path: 'uploads/second.png', name: 'image.png', kind: 'image' },
        ]),
      ],
      'msg-1',
      'project-1',
      [projectFile('uploads/first.png', 'image'), projectFile('uploads/second.png', 'image')],
    );

    const content = history[0]?.content ?? '';
    expect(content.indexOf('### Attachment 1:')).toBeLessThan(content.indexOf('### Attachment 2:'));
    expect(content).toContain('path: uploads/first.png');
    expect(content).toContain('path: uploads/second.png');
  });

  it('uses the explicit user-visible order before numbering attachments', async () => {
    const history = await historyWithApiAttachmentContext(
      [
        userMessage('msg-1', 'Compare the first and second image', [
          { path: 'uploads/second.png', name: 'second.png', kind: 'image', order: 1 },
          { path: 'uploads/first.png', name: 'first.png', kind: 'image', order: 0 },
        ]),
      ],
      'msg-1',
      'project-1',
      [projectFile('uploads/first.png', 'image'), projectFile('uploads/second.png', 'image')],
    );

    const content = history[0]?.content ?? '';
    expect(content.indexOf('### Attachment 1: first.png')).toBeLessThan(
      content.indexOf('### Attachment 2: second.png'),
    );
  });

  it('reads raw text attachments with a cache buster from file metadata', async () => {
    mockedFetchProjectFileText.mockResolvedValue('const answer = 42;');

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Use this code', [{ path: 'src/demo.ts', name: 'demo.ts', kind: 'file' }])],
      'msg-1',
      'project-1',
      [projectFile('src/demo.ts', 'code')],
    );

    expect(mockedFetchProjectFileText).toHaveBeenCalledWith(
      'project-1',
      'src/demo.ts',
      { cache: 'no-store', cacheBustKey: 123 },
    );
    expect(history[0]?.content).toContain('```ts');
    expect(history[0]?.content).toContain('const answer = 42;');
  });

  it('does not fetch raw text for sketch image attachments', async () => {
    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Use this sketch', [{ path: 'sketch-board.png', name: 'sketch-board.png', kind: 'image' }])],
      'msg-1',
      'project-1',
      [projectFile('sketch-board.png', 'sketch')],
    );

    expect(mockedFetchProjectFileText).not.toHaveBeenCalled();
    expect(mockedFetchProjectFilePreview).not.toHaveBeenCalled();
    expect(history[0]?.content).toContain('kind: sketch');
    expect(history[0]?.content).toContain('Content preview unavailable');
  });

  it('keeps path-only metadata for native image blocks so decks can embed them', async () => {
    for (const path of ['hero.png', 'hero.jpg', 'hero.jpeg', 'hero.gif', 'hero.webp']) {
      const history = await historyWithApiAttachmentContext(
        [
          userMessage('msg-1', 'Describe this image', [
            { path, name: path, kind: 'image' },
          ]),
        ],
        'msg-1',
        'project-1',
        [projectFile(path, 'image')],
        { omitNativeImageAttachments: true },
      );

      expect(history[0]?.content).toContain('<attached-project-files>');
      expect(history[0]?.content).toContain(`path: ${path}`);
      expect(history[0]?.content).toContain(`<img src="${path}"`);
      expect(history[0]?.content).not.toContain('Content preview unavailable');
    }
    expect(mockedFetchProjectFileText).not.toHaveBeenCalled();
    expect(mockedFetchProjectFilePreview).not.toHaveBeenCalled();
  });

  it('keeps path-only metadata for sketch-prefixed rasters when native image blocks carry them', async () => {
    const history = await historyWithApiAttachmentContext(
      [
        userMessage('msg-1', 'Describe this image', [
          { path: 'sketch-hero.png', name: 'sketch-hero.png', kind: 'image' },
        ]),
      ],
      'msg-1',
      'project-1',
      [projectFile('sketch-hero.png', 'sketch')],
      { omitNativeImageAttachments: true },
    );

    expect(history[0]?.content).toContain('path: sketch-hero.png');
    expect(history[0]?.content).toContain('<img src="sketch-hero.png"');
    expect(mockedFetchProjectFileText).not.toHaveBeenCalled();
    expect(mockedFetchProjectFilePreview).not.toHaveBeenCalled();
  });

  it('advertises the on-disk path (not a friendlier display name) for native image embeds', async () => {
    const path = 'msh9y0i9-놀란-고양이-_1_.jpeg';
    const history = await historyWithApiAttachmentContext(
      [
        userMessage('msg-1', 'Put this in a slide', [
          { path, name: '놀란 고양이 (1).jpeg', kind: 'image' },
        ]),
      ],
      'msg-1',
      'project-1',
      [projectFile(path, 'image')],
      { omitNativeImageAttachments: true },
    );

    expect(history[0]?.content).toContain(`path: ${path}`);
    expect(history[0]?.content).toContain(`<img src="${path}" alt="">`);
    expect(history[0]?.content).toContain(`### Attachment 1: ${path}`);
    expect(history[0]?.content).not.toContain('alt="놀란 고양이 (1).jpeg"');
    expect(history[0]?.content).not.toContain('### Attachment 1: 놀란 고양이 (1).jpeg');
  });

  it('keeps unsupported image metadata when native image blocks cannot carry them', async () => {
    for (const path of ['hero.avif', 'hero.bmp']) {
      const history = await historyWithApiAttachmentContext(
        [
          userMessage('msg-1', 'Describe this image', [
            { path, name: path, kind: 'image' },
          ]),
        ],
        'msg-1',
        'project-1',
        [projectFile(path, 'image')],
        { omitNativeImageAttachments: true },
      );

      expect(history[0]?.content).toContain('<attached-project-files>');
      expect(history[0]?.content).toContain(`path: ${path}`);
      expect(history[0]?.content).toContain('Content preview unavailable');
    }
  });

  it('uses filename inference when the project file list has not refreshed yet', async () => {
    mockedFetchProjectFilePreview.mockResolvedValue({
      kind: 'pdf',
      title: 'report.pdf',
      sections: [{ title: 'PDF', lines: ['Quarterly results'] }],
    });

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Read this', [{ path: 'report.pdf', name: 'report.pdf', kind: 'file' }])],
      'msg-1',
      'project-1',
      [],
    );

    expect(mockedFetchProjectFilePreview).toHaveBeenCalledWith('project-1', 'report.pdf');
    expect(history[0]?.content).toContain('Quarterly results');
  });
});

describe('clipAttachmentText', () => {
  it('keeps body/slides when truncating large HTML instead of mid-CSS head only', async () => {
    const { clipAttachmentText } = await import('../src/api-attachment-context');
    const style = `<style>${'x'.repeat(30_000)}</style>`;
    const html = [
      '<!doctype html><html><head>',
      style,
      '</head><body>',
      '<section class="slide" data-slide-index="0"><h1>Cover Expo</h1></section>',
      '<section class="slide" data-slide-index="1"><h2>API</h2><p>takeaway</p></section>',
      '</body></html>',
    ].join('');
    const clipped = clipAttachmentText(html, 8_000, { preferHtmlBody: true });
    expect(clipped.length).toBeLessThanOrEqual(8_500);
    expect(clipped).toMatch(/Cover Expo/);
    expect(clipped).toMatch(/omitted mid kit CSS|body\/slides/i);
    expect(clipped).not.toContain('Open Design');
    // Must not be a pure head prefix that never reaches slides.
    expect(clipped).toMatch(/<section\b[^>]*\bslide\b/i);
  });

  it('does not start a no-body clip at slide-counter chrome', async () => {
    const { clipAttachmentText } = await import('../src/api-attachment-context');
    const html = [
      '<div class="slide-counter">5 / 10</div>',
      `<style>${'x'.repeat(30_000)}</style>`,
      '<section class="slide" data-slide-index="0"><h1>Cover Expo</h1></section>',
    ].join('');
    const clipped = clipAttachmentText(html, 8_000, { preferHtmlBody: true });
    expect(clipped).toMatch(/Cover Expo/);
    expect(clipped).toMatch(/<section\b[^>]*class="slide"/i);
  });
});

function userMessage(
  id: string,
  content: string,
  attachments: NonNullable<ChatMessage['attachments']>,
): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    createdAt: 1,
    attachments,
  };
}

function projectFile(path: string, kind: ProjectFile['kind']): ProjectFile {
  return {
    name: path.split('/').pop() ?? path,
    path,
    type: 'file',
    size: 100,
    mtime: 123,
    kind,
    mime: 'application/octet-stream',
  };
}

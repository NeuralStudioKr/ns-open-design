import { describe, expect, it } from 'vitest';

import {
  chatAttachmentVisibleInProjectFiles,
  excludeAttachmentsBackedByVisualScreenshots,
  isEphemeralDrawingScreenshotPath,
  isLikelyDurableUploadedImagePath,
  isRenderableImagePath,
  normalizeProjectFilePath,
  projectFilePathExists,
  projectFilePathsReferToSameFile,
  projectFileResolvedPath,
} from '../../src/utils/projectFilePaths';

describe('projectFilePathExists', () => {
  const names = new Set([
    'deck.html',
    'ms7a7838-drawing-2026-07-30T08-58-31-598Z.png',
    'browser/browser-capture-example.png',
  ]);

  it('matches exact project-relative paths', () => {
    expect(projectFilePathExists(names, 'deck.html')).toBe(true);
    expect(projectFilePathExists(names, 'browser/browser-capture-example.png')).toBe(true);
  });

  it('matches bare basenames for nested or historical paths', () => {
    expect(projectFilePathExists(names, 'browser-capture-example.png')).toBe(true);
    expect(projectFilePathExists(names, 'ms7a7838-drawing-2026-07-30T08-58-31-598Z.png')).toBe(true);
  });

  it('returns false for deleted or unknown files', () => {
    expect(projectFilePathExists(names, 'missing.png')).toBe(false);
    expect(projectFilePathExists(names, '')).toBe(false);
  });

  it('does not treat a different directory with the same basename as a hit', () => {
    const nested = new Set(['assets/a.png', 'deck.html']);
    expect(projectFilePathExists(nested, 'uploads/a.png')).toBe(false);
    expect(projectFilePathExists(nested, 'assets/a.png')).toBe(true);
    expect(projectFilePathExists(nested, 'a.png')).toBe(true);
  });

  it('defaults to false for ephemeral drawing screenshots when the file index is unavailable', () => {
    expect(projectFilePathExists(undefined, 'ms8hq9qu-drawing-2026-07-31T05-17-03-125Z.png')).toBe(false);
    expect(projectFilePathExists(undefined, 'references/logo.png')).toBe(true);
  });
});

describe('project file path identity', () => {
  it('treats nested and bare paths with the same basename as the same file', () => {
    expect(projectFilePathsReferToSameFile('uploads/foo.png', 'foo.png')).toBe(true);
    expect(projectFilePathsReferToSameFile('uploads/foo.png', 'assets/foo.png')).toBe(true);
    expect(projectFilePathsReferToSameFile('uploads/foo.png', 'bar.png')).toBe(false);
  });

  it('treats NFC and NFD Hangul filenames as the same project file', () => {
    const nfc = 'msh9rso1-서빙하는-금붕어.webp';
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    expect(normalizeProjectFilePath(nfd)).toBe(nfc);
    expect(projectFilePathsReferToSameFile(nfc, nfd)).toBe(true);
    expect(projectFilePathsReferToSameFile(`refs/drive/${nfc}`, nfd)).toBe(true);
  });

  it('excludes attachments backed by visual comment screenshots', () => {
    const attachments = excludeAttachmentsBackedByVisualScreenshots(
      [{ path: 'uploads/mark.png', name: 'mark.png', kind: 'image' }],
      [{ screenshotPath: 'mark.png' }],
    );
    expect(attachments).toEqual([]);
  });

  it('resolves project file path from path or name', () => {
    expect(projectFileResolvedPath({ name: 'foo.png', path: 'uploads/foo.png' })).toBe('uploads/foo.png');
    expect(projectFileResolvedPath({ name: 'foo.png' })).toBe('foo.png');
  });

  it('detects raster image paths by extension', () => {
    expect(isRenderableImagePath('uploads/ms7-drawing-2026.png')).toBe(true);
    expect(isRenderableImagePath('notes.txt')).toBe(false);
  });

  it('treats visual-mark uploads as ephemeral annotation screenshots', () => {
    expect(isEphemeralDrawingScreenshotPath('uploads/visual-mark-1.png')).toBe(true);
    expect(isEphemeralDrawingScreenshotPath('visual-mark_foo.png')).toBe(true);
    expect(isEphemeralDrawingScreenshotPath('references/logo.png')).toBe(false);
  });
});

describe('chatAttachmentVisibleInProjectFiles', () => {
  it('keeps durable Drive/local upload chips visible when /files is stale', () => {
    const stale = new Set(['deck.html']);
    expect(chatAttachmentVisibleInProjectFiles(stale, 'refs/drive/msh5lhfh-hero.png')).toBe(true);
    expect(chatAttachmentVisibleInProjectFiles(stale, 'msh9y0i9-local.jpeg')).toBe(true);
    expect(chatAttachmentVisibleInProjectFiles(stale, 'msh9rso1-서빙하는-금붕어.webp')).toBe(true);
    expect(chatAttachmentVisibleInProjectFiles(stale, 'uploads/ref-memo.png')).toBe(true);
    expect(isLikelyDurableUploadedImagePath('refs/drive/msh5lhfh-hero.png')).toBe(true);
  });

  it('still hides ephemeral drawing screenshots missing from the index', () => {
    const stale = new Set(['deck.html']);
    expect(
      chatAttachmentVisibleInProjectFiles(stale, 'ms8hq9qu-drawing-2026-07-31T05-17-03-125Z.png'),
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { stageReadableUploadedAttachments } from '../../src/utils/uploadedImagesReadable';
import type { ChatAttachment } from '@open-design/contracts';

function img(path: string): ChatAttachment {
  return { path, name: path.split('/').pop() || path, kind: 'image' };
}

function file(path: string): ChatAttachment {
  return { path, name: path.split('/').pop() || path, kind: 'file' };
}

describe('stageReadableUploadedAttachments', () => {
  it('stages cold images optimistically so send-time retry has a chance', () => {
    const uploaded = [img('a.png'), img('b.png'), file('notes.txt')];
    const ready = [file('notes.txt')];
    const result = stageReadableUploadedAttachments(uploaded, ready);
    // Chips appear immediately; user gets an info banner about sync lag.
    expect(result.staged).toEqual([
      file('notes.txt'),
      img('a.png'),
      img('b.png'),
    ]);
    expect(result.coldImageCount).toBe(2);
    expect(result.readyImageCount).toBe(0);
  });

  it('stages ready + cold on partial readiness without duplicating', () => {
    const uploaded = [img('a.png'), img('b.png')];
    const ready = [img('a.png')];
    const result = stageReadableUploadedAttachments(uploaded, ready);
    expect(result.staged).toEqual([img('a.png'), img('b.png')]);
    expect(result.coldImageCount).toBe(1);
    expect(result.readyImageCount).toBe(1);
  });

  it('preserves fully-ready pass-through', () => {
    const uploaded = [img('a.png'), img('b.png')];
    const ready = [img('a.png'), img('b.png')];
    const result = stageReadableUploadedAttachments(uploaded, ready);
    expect(result.staged).toEqual([img('a.png'), img('b.png')]);
    expect(result.coldImageCount).toBe(0);
    expect(result.readyImageCount).toBe(2);
  });
});

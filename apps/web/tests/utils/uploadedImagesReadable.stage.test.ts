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
  it('never falls back to cold images when none are readable', () => {
    const uploaded = [img('a.png'), img('b.png'), file('notes.txt')];
    const ready = [file('notes.txt')];
    const result = stageReadableUploadedAttachments(uploaded, ready);
    expect(result.staged).toEqual([file('notes.txt')]);
    expect(result.coldImageCount).toBe(2);
    expect(result.readyImageCount).toBe(0);
  });

  it('stages only readable images on partial readiness', () => {
    const uploaded = [img('a.png'), img('b.png')];
    const ready = [img('a.png')];
    const result = stageReadableUploadedAttachments(uploaded, ready);
    expect(result.staged).toEqual([img('a.png')]);
    expect(result.coldImageCount).toBe(1);
    expect(result.readyImageCount).toBe(1);
  });
});

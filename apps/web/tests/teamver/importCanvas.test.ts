import { describe, expect, it } from 'vitest';
import { canvasImportedToChatAttachments } from '../../src/teamver/importCanvas';

describe('canvasImportedToChatAttachments', () => {
  it('uses the on-disk path basename and image kind from mime', () => {
    const attachments = canvasImportedToChatAttachments([
      {
        assetId: 'canvas-1',
        path: 'refs/canvas/msh5lhfh-hero.png',
        name: 'hero.png',
        sizeBytes: 20,
        mimeType: 'image/png',
      },
      {
        assetId: 'canvas-2',
        path: 'refs/canvas/export.html',
        name: 'My Canvas.html',
        sizeBytes: 40,
        mimeType: 'text/html',
      },
    ]);
    expect(attachments).toEqual([
      {
        path: 'refs/canvas/msh5lhfh-hero.png',
        name: 'msh5lhfh-hero.png',
        kind: 'image',
        size: 20,
      },
      {
        path: 'refs/canvas/export.html',
        name: 'export.html',
        kind: 'file',
        size: 40,
      },
    ]);
  });
});

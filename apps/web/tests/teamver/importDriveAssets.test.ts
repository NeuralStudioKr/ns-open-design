import { describe, expect, it } from 'vitest';
import { driveImportedToChatAttachments } from '../../src/teamver/importDriveAssets';

describe('driveImportedToChatAttachments', () => {
  it('uses the on-disk path basename as ChatAttachment.name', () => {
    const attachments = driveImportedToChatAttachments([
      {
        assetId: 'asset-1',
        path: 'refs/drive/msh5lhfh-놀란고양이-_1_.jpeg',
        name: '놀란고양이.jpeg',
        sizeBytes: 12,
        mimeType: 'image/jpeg',
      },
    ]);
    expect(attachments).toEqual([
      {
        path: 'refs/drive/msh5lhfh-놀란고양이-_1_.jpeg',
        name: 'msh5lhfh-놀란고양이-_1_.jpeg',
        kind: 'image',
        size: 12,
        source: { type: 'teamver-drive', assetId: 'asset-1' },
      },
    ]);
  });
});

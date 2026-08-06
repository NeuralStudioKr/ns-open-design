import { beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadProjectFiles } from '../../src/providers/registry';
import {
  flushPendingAnnotationUploads,
  isPendingAnnotationPath,
  pendingAnnotationPathForFile,
} from '../../src/utils/annotationPendingUpload';

vi.mock('../../src/providers/registry', () => ({
  uploadProjectFiles: vi.fn(),
}));

describe('annotationPendingUpload', () => {
  beforeEach(() => {
    vi.mocked(uploadProjectFiles).mockReset();
  });

  it('marks deferred annotation paths', () => {
    const file = new File(['png'], 'drawing-2026-08-04T05-14-00-000Z.png', { type: 'image/png' });
    const path = pendingAnnotationPathForFile(file);
    expect(isPendingAnnotationPath(path)).toBe(true);
  });

  it('uploads deferred files and remaps paths', async () => {
    const file = new File(['png'], 'drawing-2026-08-04T05-14-00-000Z.png', { type: 'image/png' });
    const pendingPath = pendingAnnotationPathForFile(file);
    const pendingFiles = new Map([[pendingPath, file]]);
    vi.mocked(uploadProjectFiles).mockResolvedValue({
      uploaded: [
        {
          path: 'mse2lcw6-drawing-2026-08-04T05-14-00-000Z.png',
          name: 'mse2lcw6-drawing-2026-08-04T05-14-00-000Z.png',
          kind: 'image' as const,
        },
      ],
      failed: [],
    });
    const readable = vi.fn().mockResolvedValue([
      {
        path: 'mse2lcw6-drawing-2026-08-04T05-14-00-000Z.png',
        name: 'mse2lcw6-drawing-2026-08-04T05-14-00-000Z.png',
        kind: 'image' as const,
      },
    ]);

    const { attachments, pathReplacements } = await flushPendingAnnotationUploads(
      'project-1',
      [{ path: pendingPath, name: file.name, kind: 'image', order: 0 }],
      pendingFiles,
      readable,
    );

    expect(uploadProjectFiles).toHaveBeenCalledWith('project-1', [file]);
    expect(attachments[0]?.path).toBe('mse2lcw6-drawing-2026-08-04T05-14-00-000Z.png');
    expect(pathReplacements.get(pendingPath)?.path).toBe(
      'mse2lcw6-drawing-2026-08-04T05-14-00-000Z.png',
    );
  });
});

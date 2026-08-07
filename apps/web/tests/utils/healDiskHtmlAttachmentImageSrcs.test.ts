import { describe, expect, it } from 'vitest';
import { healDiskHtmlAttachmentImageSrcs } from '../../src/utils/healDiskHtmlAttachmentImageSrcs';

describe('healDiskHtmlAttachmentImageSrcs', () => {
  it('rewrites basename image srcs using preferred attachment paths', async () => {
    const html = '<section class="slide"><img src="photo.jpeg" alt="photo"></section>';
    const result = await healDiskHtmlAttachmentImageSrcs({
      html,
      projectFilePaths: ['index.html'],
      preferredAttachmentPaths: ['msh9y0i9-photo.jpeg'],
    });
    expect(result.changed).toBe(true);
    expect(result.html).toContain('src="msh9y0i9-photo.jpeg"');
  });

  it('reports unchanged when paths already match', async () => {
    const html = '<img src="msh9y0i9-photo.jpeg" alt="">';
    const result = await healDiskHtmlAttachmentImageSrcs({
      html,
      projectFilePaths: ['msh9y0i9-photo.jpeg'],
      preferredAttachmentPaths: ['msh9y0i9-photo.jpeg'],
    });
    expect(result.changed).toBe(false);
    expect(result.html).toBe(html);
  });
});

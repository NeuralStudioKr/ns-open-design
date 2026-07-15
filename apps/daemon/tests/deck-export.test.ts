import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { buildScreenshotPptx } from '../src/deck-export.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lVYV8QAAAABJRU5ErkJggg==',
  'base64',
);

describe('buildScreenshotPptx', () => {
  it('packages one slide per rendered image', async () => {
    const pptx = await buildScreenshotPptx(
      [
        { buffer: ONE_PIXEL_PNG, jpeg: false },
        { buffer: ONE_PIXEL_PNG, jpeg: false },
      ],
      { title: 'Teamver Deck', aspect: 16 / 9 },
    );

    const zip = await JSZip.loadAsync(pptx);
    expect(zip.file('ppt/presentation.xml')).toBeTruthy();
    expect(zip.file('ppt/slides/slide1.xml')).toBeTruthy();
    expect(zip.file('ppt/slides/slide2.xml')).toBeTruthy();
    expect(zip.file('ppt/media/image1.png')).toBeTruthy();
    expect(zip.file('ppt/media/image2.png')).toBeTruthy();

    const presentation = await zip.file('ppt/presentation.xml')!.async('string');
    expect(presentation).toContain('r:id="rId1"');
    expect(presentation).toContain('r:id="rId2"');
    expect(presentation).toContain('type="screen16x9"');
  });

  it('rejects empty decks', async () => {
    await expect(buildScreenshotPptx([])).rejects.toThrow('no slides to export');
  });
});

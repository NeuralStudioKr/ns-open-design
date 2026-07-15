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
    expect(zip.file('ppt/slideMasters/slideMaster1.xml')).toBeTruthy();
    expect(zip.file('ppt/slideLayouts/slideLayout1.xml')).toBeTruthy();
    expect(zip.file('ppt/theme/theme1.xml')).toBeTruthy();
    expect(zip.file('ppt/presProps.xml')).toBeTruthy();
    expect(zip.file('ppt/viewProps.xml')).toBeTruthy();
    expect(zip.file('ppt/tableStyles.xml')).toBeTruthy();

    const presentation = await zip.file('ppt/presentation.xml')!.async('string');
    expect(presentation).toContain('r:id="rId1"');
    expect(presentation).toContain('r:id="rId2"');
    expect(presentation).toContain('<p:sldMasterIdLst>');
    expect(presentation).toContain('type="screen16x9"');

    const presentationRels = await zip.file('ppt/_rels/presentation.xml.rels')!.async('string');
    expect(presentationRels).toContain('/relationships/slideMaster');
    expect(presentationRels).toContain('/relationships/presProps');
    expect(presentationRels).toContain('/relationships/viewProps');
    expect(presentationRels).toContain('/relationships/tableStyles');

    const slideRels = await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string');
    expect(slideRels).toContain('/relationships/image');
    expect(slideRels).toContain('/relationships/slideLayout');
  });

  it('rejects empty decks', async () => {
    await expect(buildScreenshotPptx([])).rejects.toThrow('no slides to export');
  });
});

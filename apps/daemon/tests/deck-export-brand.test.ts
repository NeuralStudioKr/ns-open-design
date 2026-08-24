import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { buildScreenshotPptx, DECK_PPTX_PRODUCT_NAME } from '../src/deck-export.js';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('PPTX product metadata', () => {
  it('uses teamver Slide and never Teamver Design', async () => {
    expect(DECK_PPTX_PRODUCT_NAME).toBe('teamver Slide');
    const buffer = await buildScreenshotPptx([{ buffer: PNG_1X1, jpeg: false }], {
      title: 'Demo deck',
    });
    const zip = await JSZip.loadAsync(buffer);
    const app = await zip.file('docProps/app.xml')?.async('string');
    const core = await zip.file('docProps/core.xml')?.async('string');
    const theme = await zip.file('ppt/theme/theme1.xml')?.async('string');
    expect(app).toContain(`<Application>${DECK_PPTX_PRODUCT_NAME}</Application>`);
    expect(core).toContain(`<dc:creator>${DECK_PPTX_PRODUCT_NAME}</dc:creator>`);
    expect(core).toContain(`<cp:lastModifiedBy>${DECK_PPTX_PRODUCT_NAME}</cp:lastModifiedBy>`);
    expect(theme).toContain(`name="${DECK_PPTX_PRODUCT_NAME}"`);
    for (const xml of [app, core, theme]) {
      expect(xml).not.toContain('Teamver Design');
      expect(xml).not.toContain('Open Design');
    }
  });
});

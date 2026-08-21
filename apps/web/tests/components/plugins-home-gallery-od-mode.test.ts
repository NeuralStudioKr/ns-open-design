import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { resolveGalleryOdMode } from '../../src/components/plugins-home/galleryOdMode';

function record(
  partial: Partial<InstalledPluginRecord> & {
    id: string;
    manifest?: InstalledPluginRecord['manifest'];
  },
): Pick<InstalledPluginRecord, 'id' | 'manifest'> {
  return {
    id: partial.id,
    manifest: partial.manifest,
  };
}

describe('resolveGalleryOdMode', () => {
  it('normalizes explicit od.mode casing', () => {
    expect(
      resolveGalleryOdMode(
        record({
          id: 'weekly-update',
          manifest: { od: { mode: 'Deck' } } as InstalledPluginRecord['manifest'],
        }),
        'Deck',
      ),
    ).toBe('deck');
  });

  it('prefers deck framing for html-ppt identity even when mode is html', () => {
    expect(
      resolveGalleryOdMode(
        record({
          id: 'community-html-ppt-studio',
          manifest: { od: { mode: 'html' }, tags: ['html-ppt'] } as InstalledPluginRecord['manifest'],
        }),
        'html',
      ),
    ).toBe('deck');
  });

  it('reads manifest.od.mode when the explicit arg is missing', () => {
    expect(
      resolveGalleryOdMode(
        record({
          id: 'daisy-days',
          manifest: { od: { mode: 'deck' } } as InstalledPluginRecord['manifest'],
        }),
      ),
    ).toBe('deck');
  });

  it('infers deck from html-ppt / canvas-slide identity when mode is omitted', () => {
    expect(
      resolveGalleryOdMode(
        record({
          id: 'example-html-ppt-zhangzara-studio',
          manifest: { tags: ['html-ppt'] } as InstalledPluginRecord['manifest'],
        }),
      ),
    ).toBe('deck');
    expect(
      resolveGalleryOdMode(
        record({
          id: 'canvas-slide-neutral',
          manifest: {} as InstalledPluginRecord['manifest'],
        }),
      ),
    ).toBe('deck');
  });

  it('does not invent a mode for unrelated plugins', () => {
    expect(
      resolveGalleryOdMode(
        record({
          id: 'image-template-poster',
          manifest: { tags: ['image'] } as InstalledPluginRecord['manifest'],
        }),
      ),
    ).toBeUndefined();
  });
});

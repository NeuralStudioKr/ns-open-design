import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('plugins home gallery deck framing', () => {
  it('passes resolved od mode through as a gallery card data attribute', () => {
    const source = readRepoFile('src/components/plugins-home/PluginCard.tsx');

    expect(source).toContain("const odMode = (record.manifest?.od as { mode?: unknown } | undefined)?.mode");
    expect(source).toContain('const galleryOdMode = resolveGalleryOdMode(record, odMode)');
    expect(source).toContain("'data-od-mode': galleryOdMode");
  });

  it('scales the isolated 1920×1080 cover by card width', () => {
    const css = readRepoFile('src/styles/home/plugins-home.css');

    expect(css).toContain('.plugins-home__card--gallery[data-od-mode="deck"] .plugins-home__gallery-frame');
    expect(css).toContain('aspect-ratio: 16 / 9;');
    expect(css).toContain('container-type: inline-size;');
    expect(css).toContain('.plugins-home__card--gallery[data-od-mode="deck"]:hover .plugins-home__html-iframe');
    expect(css).toContain('width: 1920px;');
    expect(css).toContain('height: 1080px;');
    expect(css).toContain('transform: scale(calc(100cqw / 1920px));');
    expect(css).toContain('transition: none;');
    expect(css).not.toContain('width: 360%;');
    expect(css).not.toContain('transform: scale(0.2777778);');
    expect(css).toContain('.plugins-home__grid--deck .plugins-home__card--gallery');
    expect(css).toContain('content-visibility: visible;');
    expect(css).toContain('contain-intrinsic-size: auto 400px 262px;');
  });

  it('marks slide-only community grids as deck-framed', () => {
    const source = readRepoFile('src/components/PluginsHomeSection.tsx');
    expect(source).toContain('plugins-home__grid--deck');
    expect(source).toContain('hidePrimaryCategoryFacets');
  });

  it('scales isolated plugin-detail heroes to the 1920 cover', () => {
    const source = readRepoFile('src/components/plugin-details/PluginPreviewHero.tsx');
    const css = readRepoFile('src/styles/viewer/templates-plugins.css');
    expect(source).toContain('srcDocHasIsolatedDeckCover');
    expect(source).toContain("'data-od-cover': 'deck'");
    expect(css).toContain('.plugin-details-modal__hero[data-od-cover="deck"] .plugin-details-modal__hero-iframe');
    expect(css).toContain('transform: scale(calc(100cqw / 1920px));');
  });

  it('scales canvas-slide template picker cards on the same 1920 canvas', () => {
    const css = readRepoFile('src/styles/viewer/tools.css');
    expect(css).toContain('.teamver-canvas-slide-launch-template-card-frame');
    expect(css).toContain('aspect-ratio: 16 / 9;');
    expect(css).toContain('container-type: inline-size;');
    expect(css).toContain('width: 1920px;');
    expect(css).toContain('height: 1080px;');
    expect(css).toContain('transform: scale(calc(100cqw / 1920px));');
  });

  it('keeps composer plugin deck previews on the same 1920 canvas scale', () => {
    const source = readRepoFile('src/components/ComposerPluginPreview.tsx');
    const css = readRepoFile('src/styles/home/plus-menu.css');

    expect(source).toContain("const odMode = (record.manifest?.od as { mode?: unknown } | undefined)?.mode");
    expect(source).toContain('const galleryOdMode = resolveGalleryOdMode(record, odMode)');
    expect(source).toContain("'data-od-mode': galleryOdMode");
    expect(css).toContain('container-type: inline-size;');
    expect(css).toContain('.plus-menu__preview-hero[data-od-mode="deck"] .plugins-home__preview');
    expect(css).toContain('aspect-ratio: 16 / 9;');
    expect(css).toContain('.plus-menu__preview-hero[data-od-mode="deck"] .plugins-home__html-iframe');
    expect(css).toContain('width: 1920px;');
    expect(css).toContain('height: 1080px;');
    expect(css).toContain('transform: scale(calc(100cqw / 1920px));');
  });
});

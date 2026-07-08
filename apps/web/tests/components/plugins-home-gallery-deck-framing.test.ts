import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('plugins home gallery deck framing', () => {
  it('passes od mode through as a gallery card data attribute', () => {
    const source = readRepoFile('src/components/plugins-home/PluginCard.tsx');

    expect(source).toContain("const odMode = (record.manifest?.od as { mode?: unknown } | undefined)?.mode");
    expect(source).toContain("'data-od-mode': odMode");
  });

  it('uses a 16:9 non-panning iframe frame for deck gallery cards', () => {
    const css = readRepoFile('src/styles/home/plugins-home.css');

    expect(css).toContain('.plugins-home__card--gallery[data-od-mode="deck"] .plugins-home__gallery-frame');
    expect(css).toContain('aspect-ratio: 16 / 9;');
    expect(css).toContain('.plugins-home__card--gallery[data-od-mode="deck"]:hover .plugins-home__html-iframe');
    expect(css).toContain('transform: none;');
    expect(css).toContain('transition: none;');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entryLayoutCss = readFileSync(
  new URL('../../src/styles/home/entry-layout.css', import.meta.url),
  'utf8',
);

describe('Teamver embed topbar layout', () => {
  it('keeps the embed session bar visible on compact entry layouts', () => {
    expect(entryLayoutCss).toContain(
      '.entry-main__topbar-chips:not(.entry-main__topbar-chips--teamver-embed)',
    );
    expect(entryLayoutCss).not.toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.entry-main__topbar-chips \{\s*display: none;/,
    );
  });
});

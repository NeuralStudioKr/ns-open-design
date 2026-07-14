import { describe, expect, it } from 'vitest';

import { HOME_HERO_CHIPS, pluginIdsBoundToHomeHeroChips } from '../../src/components/home-hero/chips';
import { homeHeroChipsForGroup } from '../../src/teamver/branding/slideOnlyMvpPolicy';

describe('pluginIdsBoundToHomeHeroChips', () => {
  it('includes bundled scenario ids for visible create chips', () => {
    const chips = homeHeroChipsForGroup('create', { slideOnlyMvp: false });
    expect(pluginIdsBoundToHomeHeroChips(chips)).toContain('example-simple-deck');
    expect(pluginIdsBoundToHomeHeroChips(chips)).toContain('example-web-prototype');
  });

  it('keeps only the deck plugin in slide-only embed', () => {
    const chips = homeHeroChipsForGroup('create', { slideOnlyMvp: true });
    expect(chips.map((chip) => chip.id)).toEqual(['deck']);
    expect(pluginIdsBoundToHomeHeroChips(chips)).toEqual(['example-simple-deck']);
  });

  it('collects migrate shortcuts such as figma migration', () => {
    const migrateIds = pluginIdsBoundToHomeHeroChips(
      HOME_HERO_CHIPS.filter((chip) => chip.group === 'migrate'),
    );
    expect(migrateIds).toContain('od-figma-migration');
  });
});

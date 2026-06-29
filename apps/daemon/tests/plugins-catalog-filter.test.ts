import { describe, expect, it } from 'vitest';

import {
  filterInstalledPluginsByCatalogMode,
  isPluginCatalogModeMatch,
  parsePluginCatalogModeFilter,
  readDefaultPluginCatalogModeFromEnv,
} from '../src/plugins/catalog-filter.js';

describe('plugin catalog mode filter', () => {
  const deck = {
    id: 'example-deck',
    manifest: { od: { mode: 'deck' } },
  };
  const video = {
    id: 'example-video',
    manifest: { od: { mode: 'video' } },
  };

  it('parses mode query values', () => {
    expect(parsePluginCatalogModeFilter('deck')).toBe('deck');
    expect(parsePluginCatalogModeFilter(['deck'])).toBe('deck');
    expect(parsePluginCatalogModeFilter(undefined)).toBeNull();
  });

  it('reads default mode from env', () => {
    expect(
      readDefaultPluginCatalogModeFromEnv({ OD_PLUGIN_CATALOG_DEFAULT_MODE: 'deck' }),
    ).toBe('deck');
  });

  it('filters installed plugins to deck mode only', () => {
    const filtered = filterInstalledPluginsByCatalogMode([deck, video] as never[], 'deck');
    expect(filtered.map((row) => row.id)).toEqual(['example-deck']);
    expect(isPluginCatalogModeMatch(deck as never, 'deck')).toBe(true);
    expect(isPluginCatalogModeMatch(video as never, 'deck')).toBe(false);
  });
});

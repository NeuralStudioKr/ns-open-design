import { afterEach, describe, expect, it } from 'vitest';

import {
  filterDesignTemplatesExcludingChinesePrimary,
  filterPluginsExcludingChinesePrimaryDeck,
  readExcludeChineseDeckTemplatesFromEnv,
} from '../src/design-templates-chinese-catalog.js';

describe('design-templates-chinese-catalog', () => {
  const prev = process.env.OD_DESIGN_TEMPLATES_EXCLUDE_ZH_CN;

  afterEach(() => {
    if (prev === undefined) delete process.env.OD_DESIGN_TEMPLATES_EXCLUDE_ZH_CN;
    else process.env.OD_DESIGN_TEMPLATES_EXCLUDE_ZH_CN = prev;
  });

  it('reads OD_DESIGN_TEMPLATES_EXCLUDE_ZH_CN from env', () => {
    expect(readExcludeChineseDeckTemplatesFromEnv({})).toBe(false);
    expect(readExcludeChineseDeckTemplatesFromEnv({ OD_DESIGN_TEMPLATES_EXCLUDE_ZH_CN: '1' })).toBe(
      true,
    );
  });

  it('filters design templates and deck plugins when enabled', () => {
    const templates = [
      { id: 'simple-deck', contentLocale: null },
      { id: 'html-ppt-tech-sharing', contentLocale: 'zh-CN' },
    ];
    const plugins = [{ id: 'example-simple-deck' }, { id: 'example-guizang-ppt' }, { id: 'example-deck-guizang-editorial' }];
    expect(filterDesignTemplatesExcludingChinesePrimary(templates, true).map((t) => t.id)).toEqual([
      'simple-deck',
    ]);
    expect(filterPluginsExcludingChinesePrimaryDeck(plugins, true).map((p) => p.id)).toEqual([
      'example-simple-deck',
    ]);
  });

  it('excludes plugins with od.content_locale zh-CN on manifest', () => {
    const plugins = [
      { id: 'example-future-deck', manifest: { od: { content_locale: 'zh-CN', mode: 'deck' } } },
      { id: 'example-simple-deck', manifest: { od: { mode: 'deck' } } },
    ];
    expect(filterPluginsExcludingChinesePrimaryDeck(plugins, true).map((p) => p.id)).toEqual([
      'example-simple-deck',
    ]);
  });
});

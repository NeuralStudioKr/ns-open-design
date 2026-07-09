import { describe, expect, it } from 'vitest';

import {
  filterCatalogExcludingChinesePrimaryDeckTemplates,
  isChinesePrimaryDeckTemplate,
  resolveChineseDeckTemplateId,
} from '../src/embed-chinese-deck-policy.js';

describe('embed-chinese-deck-policy', () => {
  it('resolves example plugin ids', () => {
    expect(resolveChineseDeckTemplateId('example-guizang-ppt')).toBe('magazine-web-ppt');
    expect(resolveChineseDeckTemplateId('open-design/example-html-ppt-tech-sharing')).toBe(
      'html-ppt-tech-sharing',
    );
  });

  it('flags denylisted templates and zh-CN contentLocale', () => {
    expect(
      isChinesePrimaryDeckTemplate({ id: 'html-ppt-xhs-white-editorial', contentLocale: 'zh-CN' }),
    ).toBe(true);
    expect(isChinesePrimaryDeckTemplate({ id: 'simple-deck', contentLocale: 'en' })).toBe(false);
  });

  it('filters catalog entries when enabled', () => {
    const entries = [
      { id: 'simple-deck', contentLocale: 'en' },
      { id: 'html-ppt-tech-sharing', contentLocale: 'zh-CN' },
    ];
    expect(filterCatalogExcludingChinesePrimaryDeckTemplates(entries, false)).toEqual(entries);
    expect(filterCatalogExcludingChinesePrimaryDeckTemplates(entries, true).map((e) => e.id)).toEqual([
      'simple-deck',
    ]);
  });
});

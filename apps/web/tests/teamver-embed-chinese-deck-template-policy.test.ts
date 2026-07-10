import { describe, expect, it } from 'vitest';

import {
  EMBED_HIDDEN_CHINESE_PRIMARY_DECK_TEMPLATE_IDS,
  isEmbedHiddenChinesePrimaryDeckTemplate,
  resolveChineseDeckTemplateId,
} from '../src/teamver/branding/embedChineseDeckTemplatePolicy';
import {
  isDesignTemplateEnabled,
  isDesignTemplateVisibleInSettings,
} from '../src/teamver/branding/designTemplateVisibility';
import { pluginsForSlideOnlyMvp } from '../src/teamver/branding/slideOnlyMvpPolicy';

describe('embedChineseDeckTemplatePolicy', () => {
  it('resolves bundled example plugin ids to canonical template ids', () => {
    expect(resolveChineseDeckTemplateId('example-guizang-ppt')).toBe('magazine-web-ppt');
    expect(resolveChineseDeckTemplateId('example-deck-guizang-editorial')).toBe(
      'deck-guizang-editorial',
    );
    expect(resolveChineseDeckTemplateId('example-html-ppt-presenter-mode-reveal')).toBe(
      'html-ppt-presenter-mode',
    );
    expect(resolveChineseDeckTemplateId('open-design/example-html-ppt-tech-sharing')).toBe(
      'html-ppt-tech-sharing',
    );
  });

  it('hides denylisted deck templates only in slide-only embed', () => {
    for (const id of EMBED_HIDDEN_CHINESE_PRIMARY_DECK_TEMPLATE_IDS) {
      expect(
        isEmbedHiddenChinesePrimaryDeckTemplate({ id, mode: 'deck' } as never, {
          slideOnlyMvp: true,
        }),
      ).toBe(true);
      expect(
        isEmbedHiddenChinesePrimaryDeckTemplate({ id, mode: 'deck' } as never, {
          slideOnlyMvp: false,
        }),
      ).toBe(false);
    }
  });

  it('hides templates tagged with contentLocale zh-CN in slide-only embed', () => {
    expect(
      isEmbedHiddenChinesePrimaryDeckTemplate(
        { id: 'future-chinese-deck', contentLocale: 'zh-CN' },
        { slideOnlyMvp: true },
      ),
    ).toBe(true);
    expect(
      isEmbedHiddenChinesePrimaryDeckTemplate(
        { id: 'future-chinese-deck', contentLocale: 'zh-CN' },
        { slideOnlyMvp: false },
      ),
    ).toBe(false);
  });
});

describe('designTemplateVisibility chinese deck gate', () => {
  const chineseDeck = {
    id: 'html-ppt-xhs-white-editorial',
    mode: 'deck' as const,
    contentLocale: 'zh-CN',
  };
  const englishDeck = {
    id: 'simple-deck',
    mode: 'deck' as const,
    contentLocale: 'en' as const,
  };

  it('disables chinese-primary decks in embed slide-only MVP', () => {
    expect(isDesignTemplateEnabled(chineseDeck, [], { slideOnlyMvp: true })).toBe(false);
    expect(isDesignTemplateVisibleInSettings(chineseDeck, { slideOnlyMvp: true })).toBe(false);
    expect(isDesignTemplateEnabled(englishDeck, [], { slideOnlyMvp: true })).toBe(true);
    expect(isDesignTemplateVisibleInSettings(englishDeck, { slideOnlyMvp: true })).toBe(true);
  });

  it('keeps chinese-primary decks visible outside embed slide-only MVP', () => {
    expect(isDesignTemplateEnabled(chineseDeck, [], { slideOnlyMvp: false })).toBe(true);
    expect(isDesignTemplateVisibleInSettings(chineseDeck, { slideOnlyMvp: false })).toBe(true);
  });
});

describe('pluginsForSlideOnlyMvp chinese deck gate', () => {
  it('drops hidden chinese deck plugins from community listing', () => {
    const plugins = [
      {
        id: 'example-guizang-ppt',
        manifest: { name: 'example-guizang-ppt', version: '1.0.0', od: { mode: 'deck' } },
      },
      {
        id: 'example-deck-guizang-editorial',
        manifest: {
          name: 'example-deck-guizang-editorial',
          version: '1.0.0',
          od: { mode: 'deck' },
        },
      },
      {
        id: 'example-simple-deck',
        manifest: { name: 'example-simple-deck', version: '1.0.0', od: { mode: 'deck' } },
      },
      {
        id: 'example-video-shortform',
        manifest: { name: 'example-video-shortform', version: '1.0.0', od: { mode: 'video' } },
      },
    ];
    expect(
      pluginsForSlideOnlyMvp(plugins as never[], { slideOnlyMvp: true }).map((p) => p.id),
    ).toEqual(['example-simple-deck']);
  });

  it('drops plugins with zh-CN od.content_locale on manifest', () => {
    const plugins = [
      {
        id: 'example-future-chinese-deck',
        manifest: {
          name: 'example-future-chinese-deck',
          version: '1.0.0',
          od: { mode: 'deck', content_locale: 'zh-CN' },
        },
      },
      {
        id: 'example-simple-deck',
        manifest: { name: 'example-simple-deck', version: '1.0.0', od: { mode: 'deck' } },
      },
    ];
    expect(
      pluginsForSlideOnlyMvp(plugins as never[], { slideOnlyMvp: true }).map((p) => p.id),
    ).toEqual(['example-simple-deck']);
  });
});

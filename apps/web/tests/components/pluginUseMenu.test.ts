import { describe, expect, it, vi } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import {
  buildPluginUseMenu,
  pluginUsePrimaryAction,
} from '../../src/components/plugin-details/pluginUseMenu';

function deckTemplateFixture(): InstalledPluginRecord {
  return {
    id: 'example-html-ppt-product-launch',
    title: 'Html Ppt Product Launch',
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: [],
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'example-html-ppt-product-launch',
      title: 'Html Ppt Product Launch',
      version: '0.1.0',
      od: {
        mode: 'deck',
        useCase: {
          query: { en: 'Make a deck about {{topic}}.' },
        },
      },
    },
  };
}

describe('pluginUsePrimaryAction', () => {
  const t = (key: string) => key;

  it('defaults to structure-only use even when the plugin ships a useCase.query', () => {
    expect(pluginUsePrimaryAction(deckTemplateFixture(), t)).toEqual({
      label: 'preview.usePlugin',
      action: 'use',
    });
  });
});

describe('buildPluginUseMenu', () => {
  const t = (key: string) => key;

  it('lists template bind before optional example-text import', () => {
    const onUse = vi.fn();
    const menu = buildPluginUseMenu(deckTemplateFixture(), onUse, t);
    expect(menu?.map((item) => item.testId)).toEqual([
      'plugin-details-use-option-example-html-ppt-product-launch',
      'plugin-details-use-with-query-example-html-ppt-product-launch',
    ]);
  });

  it('hides the composer-seed menu when slideOnly has no HomeHero', () => {
    const onUse = vi.fn();
    expect(
      buildPluginUseMenu(deckTemplateFixture(), onUse, t, { hideComposerSeed: true }),
    ).toBeUndefined();
  });
});

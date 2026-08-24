// Shared builder for the plugin detail modal's "Use plugin" split-button
// menu. Mirrors the home plugin-card use-menu (`plugins-home/PluginCard`):
// when a plugin ships an `od.useCase.query`, the primary CTA attaches the
// plugin chip only (action 'use'); the caret menu offers an optional
//   • "Use plugin" / structure-only  → bind template context (action 'use')
//   • "Use with query" / replicate    → load example prompt into composer
// Plugins without a usable query keep the plain single-action button, so the
// menu is `undefined` in that case.

import type { InstalledPluginRecord } from '@open-design/contracts';
import type { PluginUseAction } from '../plugins-home/useActions';
import type { PreviewPrimaryActionMenuItem } from '../PreviewModal';

type TranslateUseMenu = (
  key:
    | 'preview.usePlugin'
    | 'preview.usePluginOnly'
    | 'preview.usePluginOnlyDesc'
    | 'preview.replicateContent'
    | 'preview.replicateContentDesc',
) => string;

// Primary CTA for the detail modal's Use split button. Template/deck picks
// should bind plugin context without seeding the composer; example text is
// opt-in via the caret → "Use with query".
export function pluginUsePrimaryAction(
  record: InstalledPluginRecord,
  t: TranslateUseMenu,
): { label: string; action: PluginUseAction } {
  return { label: t('preview.usePlugin'), action: 'use' };
}

export function buildPluginUseMenu(
  record: InstalledPluginRecord,
  onUse: (record: InstalledPluginRecord, action: PluginUseAction) => void,
  t: TranslateUseMenu,
  options?: { hideComposerSeed?: boolean },
): PreviewPrimaryActionMenuItem[] | undefined {
  // slideOnly Home has no composer — "load example prompt into chat" is a
  // leftover freeform path that now just duplicates 「템플릿 사용」.
  if (options?.hideComposerSeed) return undefined;
  const hasQuery = Boolean(record.manifest?.od?.useCase?.query);
  if (!hasQuery) return undefined;
  return [
    {
      label: t('preview.usePluginOnly'),
      description: t('preview.usePluginOnlyDesc'),
      onClick: () => onUse(record, 'use'),
      testId: `plugin-details-use-option-${record.id}`,
    },
    {
      label: t('preview.replicateContent'),
      description: t('preview.replicateContentDesc'),
      onClick: () => onUse(record, 'use-with-query'),
      testId: `plugin-details-use-with-query-${record.id}`,
    },
  ];
}

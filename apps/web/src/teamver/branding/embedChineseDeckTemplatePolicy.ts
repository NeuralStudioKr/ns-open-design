import type { TeamverBrandingConfig } from './config';
import {
  EMBED_HIDDEN_CHINESE_PRIMARY_DECK_TEMPLATE_IDS,
  isChinesePrimaryDeckTemplate,
  resolveChineseDeckTemplateId,
} from '@open-design/contracts';

export {
  EMBED_HIDDEN_CHINESE_PRIMARY_DECK_TEMPLATE_IDS,
  resolveChineseDeckTemplateId,
};

/** Embed slide-only MVP — hide Chinese-primary deck templates from pickers. */
export function isEmbedHiddenChinesePrimaryDeckTemplate(
  ref: { id: string; contentLocale?: string | null },
  branding: Pick<TeamverBrandingConfig, 'slideOnlyMvp'>,
): boolean {
  if (!branding.slideOnlyMvp) return false;
  return isChinesePrimaryDeckTemplate(ref);
}

import type { SkillSummary } from '@open-design/contracts';

import type { TeamverBrandingConfig } from './config';

/** Modes that belong in the design-templates catalogue (not functional skills). */
export const DESIGN_TEMPLATE_MODES = new Set<SkillSummary['mode']>([
  'prototype',
  'deck',
  'template',
  'image',
  'video',
  'audio',
]);

export function isRenderableDesignTemplate(
  skill: Pick<SkillSummary, 'mode'>,
): boolean {
  return DESIGN_TEMPLATE_MODES.has(skill.mode);
}

export function isSlideRelatedDesignTemplate(
  skill: Pick<SkillSummary, 'mode'>,
): boolean {
  return skill.mode === 'deck';
}

/** Whether a design template is enabled for pickers / galleries. */
export function isDesignTemplateEnabled(
  template: Pick<SkillSummary, 'id' | 'mode'>,
  disabledSkills: string[] | undefined,
  branding: Pick<TeamverBrandingConfig, 'slideOnlyMvp'>,
): boolean {
  if (branding.slideOnlyMvp && isSlideRelatedDesignTemplate(template)) {
    return true;
  }
  return !(disabledSkills ?? []).includes(template.id);
}

/** Settings toggle — deck templates stay on (non-toggleable) in embed slide MVP. */
export function canToggleDesignTemplateInSettings(
  template: Pick<SkillSummary, 'mode'>,
  branding: Pick<TeamverBrandingConfig, 'slideOnlyMvp'>,
): boolean {
  if (branding.slideOnlyMvp && isSlideRelatedDesignTemplate(template)) {
    return false;
  }
  return true;
}

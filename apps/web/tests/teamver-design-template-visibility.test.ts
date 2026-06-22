import { describe, expect, it } from 'vitest';

import type { SkillSummary } from '@open-design/contracts';

import {
  canToggleDesignTemplateInSettings,
  isDesignTemplateEnabled,
  isRenderableDesignTemplate,
  isSlideRelatedDesignTemplate,
} from '../src/teamver/branding/designTemplateVisibility';

const deckTemplate: Pick<SkillSummary, 'id' | 'mode'> = {
  id: 'html-ppt',
  mode: 'deck',
};

const prototypeTemplate: Pick<SkillSummary, 'id' | 'mode'> = {
  id: 'saas-landing',
  mode: 'prototype',
};

describe('designTemplateVisibility', () => {
  it('classifies renderable design templates by mode', () => {
    expect(isRenderableDesignTemplate({ mode: 'deck' })).toBe(true);
    expect(isRenderableDesignTemplate({ mode: 'prototype' })).toBe(true);
    expect(isRenderableDesignTemplate({ mode: 'design-system' })).toBe(false);
    expect(isSlideRelatedDesignTemplate(deckTemplate)).toBe(true);
    expect(isSlideRelatedDesignTemplate(prototypeTemplate)).toBe(false);
  });

  it('keeps deck templates enabled in embed slide MVP even when disabledSkills lists them', () => {
    expect(
      isDesignTemplateEnabled(deckTemplate, ['html-ppt'], { slideOnlyMvp: true }),
    ).toBe(true);
    expect(
      isDesignTemplateEnabled(prototypeTemplate, ['saas-landing'], {
        slideOnlyMvp: true,
      }),
    ).toBe(false);
  });

  it('respects disabledSkills outside embed slide MVP', () => {
    expect(
      isDesignTemplateEnabled(deckTemplate, ['html-ppt'], { slideOnlyMvp: false }),
    ).toBe(false);
    expect(
      isDesignTemplateEnabled(deckTemplate, [], { slideOnlyMvp: false }),
    ).toBe(true);
  });

  it('locks deck template toggles in embed slide MVP settings', () => {
    expect(canToggleDesignTemplateInSettings(deckTemplate, { slideOnlyMvp: true })).toBe(
      false,
    );
    expect(
      canToggleDesignTemplateInSettings(prototypeTemplate, { slideOnlyMvp: true }),
    ).toBe(false);
  });
});

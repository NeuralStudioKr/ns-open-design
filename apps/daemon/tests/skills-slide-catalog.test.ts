import { describe, expect, it } from 'vitest';

import {
  filterSkillsForSlideOnlyCatalog,
  isSlideRelatedSkillEntry,
  parseSkillsCatalogSlideOnlyQuery,
  readDefaultSkillsSlideOnlyCatalogFromEnv,
} from '../src/skills-slide-catalog.js';

describe('skills slide-only catalog filter', () => {
  const deck = { mode: 'deck' as const, category: null };
  const image = { mode: 'image' as const, category: 'image-generation' };
  const video = { mode: 'video' as const, category: 'video-generation' };
  const orbit = { mode: 'design-system' as const, category: 'orbit' };

  it('parses catalog=slide query', () => {
    expect(parseSkillsCatalogSlideOnlyQuery('slide')).toBe(true);
    expect(parseSkillsCatalogSlideOnlyQuery('deck')).toBe(false);
  });

  it('reads default from env', () => {
    expect(readDefaultSkillsSlideOnlyCatalogFromEnv({ OD_SKILLS_CATALOG_SLIDE_ONLY: '1' })).toBe(
      true,
    );
  });

  it('keeps deck-related functional skills and drops media modes', () => {
    expect(isSlideRelatedSkillEntry(deck)).toBe(true);
    expect(isSlideRelatedSkillEntry(orbit)).toBe(true);
    expect(isSlideRelatedSkillEntry(image)).toBe(false);
    expect(isSlideRelatedSkillEntry(video)).toBe(false);
    expect(filterSkillsForSlideOnlyCatalog([deck, image, video, orbit], true).map((s) => s.mode)).toEqual(
      ['deck', 'design-system'],
    );
  });
});

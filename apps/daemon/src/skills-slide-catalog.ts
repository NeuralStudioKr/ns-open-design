import type { SkillInfo } from './skills.js';

const SLIDE_ONLY_HIDDEN_CATEGORIES = new Set([
  'image-generation',
  'video-generation',
  'animation-motion',
]);

const DESIGN_TEMPLATE_MODES = new Set<SkillInfo['mode']>([
  'prototype',
  'deck',
  'template',
  'image',
  'video',
  'audio',
]);

/** `GET /api/skills?catalog=slide` — embed slide MVP functional-skill filter. */
export function parseSkillsCatalogSlideOnlyQuery(raw: unknown): boolean {
  if (raw == null) return false;
  const values = Array.isArray(raw) ? raw : [raw];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'slide' || normalized === 'slide-only') return true;
  }
  return false;
}

export function readDefaultSkillsSlideOnlyCatalogFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env.OD_SKILLS_CATALOG_SLIDE_ONLY ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function isRenderableDesignTemplateMode(mode: SkillInfo['mode']): boolean {
  return DESIGN_TEMPLATE_MODES.has(mode);
}

/** Mirrors web `isSlideRelatedSkill` (functional skills only — templates use /api/design-templates). */
export function isSlideRelatedSkillEntry(
  skill: Pick<SkillInfo, 'mode' | 'category'>,
): boolean {
  const category = (skill.category ?? '').trim();
  if (SLIDE_ONLY_HIDDEN_CATEGORIES.has(category)) return false;
  const { mode } = skill;
  if (mode === 'image' || mode === 'video' || mode === 'audio') return false;
  if (mode === 'prototype' || mode === 'template') return false;
  if (isRenderableDesignTemplateMode(mode) && mode !== 'deck') return false;
  return true;
}

export function filterSkillsForSlideOnlyCatalog<T extends Pick<SkillInfo, 'mode' | 'category'>>(
  skills: readonly T[],
  enabled: boolean,
): T[] {
  if (!enabled) return [...skills];
  return skills.filter(isSlideRelatedSkillEntry);
}

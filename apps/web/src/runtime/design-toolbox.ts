// Design-toolbox action catalogue + pure helpers shared between the composer
// (which owns the apply/staging engine) and the assistant "next step" card
// (which surfaces a curated couple of these actions as primary follow-up rows).
// Keep this module free of React and composer-internal state so both surfaces
// can import the same source of truth.
import type { Dict } from '../i18n/types';
import type { IconName } from '../components/Icon';
import type { SkillSummary } from '../types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export type DesignToolboxActionId =
  | 'auto-match'
  | 'motion'
  | 'motion-polish'
  | 'anti-ai-polish'
  | 'visual-polish'
  | 'image-gen'
  | 'video-gen';

export interface DesignToolboxAction {
  id: DesignToolboxActionId;
  icon: IconName;
  preferredSkillIds: string[];
  categoryHints: string[];
  searchTerms: string[];
}

export const DESIGN_TOOLBOX_ACTIONS: DesignToolboxAction[] = [
  {
    id: 'auto-match',
    icon: 'sparkles',
    preferredSkillIds: ['creative-director', 'frontend-design', 'design-taste-frontend'],
    categoryHints: ['creative-direction', 'web-artifacts'],
    searchTerms: ['match', 'recommend', 'next step', 'workflow', 'skills', 'mcp', 'plugins', 'connector', 'files', '匹配', '下一步', '推荐', '流程', '审美'],
  },
  {
    id: 'motion',
    icon: 'play',
    preferredSkillIds: ['emilkowalski-motion', 'gsap-react', 'gsap-scrolltrigger', 'gsap-timeline', 'gsap-core'],
    categoryHints: ['animation-motion'],
    searchTerms: ['animation', 'motion', 'gsap', 'micro interaction', 'scrolltrigger', '动效', '动画', '微交互'],
  },
  {
    id: 'motion-polish',
    icon: 'sliders',
    preferredSkillIds: ['gsap-performance', 'emilkowalski-motion', 'gsap-timeline', 'gsap-core'],
    categoryHints: ['animation-motion'],
    searchTerms: ['motion polish', 'easing', 'performance', 'reduced motion', 'timeline', '动效润色', '缓动', '性能'],
  },
  {
    id: 'anti-ai-polish',
    icon: 'paint-bucket',
    preferredSkillIds: ['design-taste-frontend', 'gpt-taste', 'frontend-design', 'impeccable-design-polish'],
    categoryHints: ['creative-direction', 'web-artifacts'],
    searchTerms: ['anti ai', 'anti slop', 'taste', 'generic', 'beautify', '反 ai', '去 ai 味', '美化', '润色'],
  },
  {
    id: 'visual-polish',
    icon: 'palette',
    preferredSkillIds: ['impeccable-design-polish', 'frontend-design', 'creative-director', 'design-taste-frontend'],
    categoryHints: ['creative-direction', 'web-artifacts'],
    searchTerms: ['polish', 'critique', 'audit', 'harden', 'responsive', 'accessibility', '润色', '审稿', '交付'],
  },
  {
    id: 'image-gen',
    icon: 'image',
    preferredSkillIds: ['imagegen-frontend-web', 'fal-generate', 'imagen', 'venice-image-generate', 'image-enhancer'],
    categoryHints: ['image-generation'],
    searchTerms: ['image', 'generate image', 'visual reference', 'moodboard', 'section image', '生图', '配图', '视觉参考'],
  },
  {
    id: 'video-gen',
    icon: 'play',
    preferredSkillIds: ['video-hyperframes', 'sora', 'fal-video-edit', 'venice-video', 'replicate'],
    categoryHints: ['video-generation'],
    searchTerms: ['video', 'sora', 'remotion', 'hyperframes', 'storyboard', '生视频', '视频', '分镜'],
  },
];

// The actions surfaced as primary next-step rows on the assistant card (the
// rest live behind "More"). Curated for the two most common iteration paths:
// auto-match (let the agent pick the workflow / skills) and visual-polish
// (harden the current design into something deliverable).
export const FEATURED_DESIGN_TOOLBOX_ACTION_IDS: DesignToolboxActionId[] = [
  'auto-match',
  'visual-polish',
];

export function getDesignToolboxAction(id: DesignToolboxActionId): DesignToolboxAction | null {
  return DESIGN_TOOLBOX_ACTIONS.find((action) => action.id === id) ?? null;
}

export function designToolboxActionTitle(action: DesignToolboxAction, t: TranslateFn): string {
  return t(`chat.designToolbox.action.${action.id}.title` as keyof Dict);
}

export function designToolboxActionBadge(action: DesignToolboxAction, t: TranslateFn): string {
  return t(`chat.designToolbox.action.${action.id}.badge` as keyof Dict);
}

export function designToolboxActionDescription(action: DesignToolboxAction, t: TranslateFn): string {
  return t(`chat.designToolbox.action.${action.id}.description` as keyof Dict);
}

// Shared matcher for the Design toolbox action rows, used by both the composer
// panel and the next-step card so the two surfaces filter identically. `skill`
// is the action's matched skill (see findDesignToolboxSkill); threading it in
// means searching by a preferred skill's id/name/description/category keeps the
// action row visible alongside its resource row, instead of the two disagreeing.
export function designToolboxActionMatchesQuery(
  action: DesignToolboxAction,
  query: string,
  skill: SkillSummary | null,
  t: TranslateFn,
  extra: string[] = [],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    designToolboxActionTitle(action, t),
    designToolboxActionBadge(action, t),
    designToolboxActionDescription(action, t),
    ...action.searchTerms,
    skill?.id ?? '',
    skill?.name ?? '',
    skill?.description ?? '',
    skill?.category ?? '',
    ...extra,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

// `extra` carries any locale-resolved text (localized name / description) the
// caller wants indexed alongside the raw skill fields, so a localized query
// matches the same way the composer's localized resource index does. design-
// toolbox stays free of i18n/content — the caller resolves the strings.
export function skillMatchesQuery(
  skill: SkillSummary,
  query: string,
  extra: string[] = [],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [skill.id, skill.name, skill.description, skill.mode, skill.surface ?? '', ...skill.triggers, ...extra]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/** Model-only suffix. Chat/composer show the short action title above this. */
export const DESIGN_TOOLBOX_INSTRUCTION_MARKER = '[Design toolbox instruction]';

const LEADING_MENTION_LINE_RE = /^(?:@[^\n]+\n)+/;

export function looksLikeDesignToolboxExpandedDraft(text: string | null | undefined): boolean {
  const raw = String(text ?? '');
  if (!raw.trim()) return false;
  if (raw.includes(DESIGN_TOOLBOX_INSTRUCTION_MARKER)) return true;
  return /resource index|리소스 인덱스|资源索引|リソース/i.test(raw)
    && /workflow rule|워크플로 규칙|流程规则|フロー規則/i.test(raw);
}

export function stripLeadingMentionLines(text: string): string {
  return String(text ?? '').replace(LEADING_MENTION_LINE_RE, '').trim();
}

/**
 * Visible composer body for a toolbox action. Long resource-index / workflow
 * copy stays off the input and rides as {@link DESIGN_TOOLBOX_INSTRUCTION_MARKER}.
 * User notes that are not a previous dump are kept.
 */
export function resolveDesignToolboxVisibleBody(input: {
  actionTitle: string;
  activeDraft?: string | null;
  actionTitles?: readonly string[];
}): string {
  const title = String(input.actionTitle ?? '').trim();
  const existing = stripLeadingMentionLines(String(input.activeDraft ?? ''));
  if (!existing) return title;
  if (looksLikeDesignToolboxExpandedDraft(existing)) return title;
  if ((input.actionTitles ?? []).some((candidate) => candidate.trim() === existing)) {
    return title;
  }
  return existing;
}

export function splitDesignToolboxInstruction(text: string | null | undefined): {
  visible: string;
  instruction: string | null;
} {
  const raw = String(text ?? '');
  const match = /\n*\[Design toolbox instruction\]\s*/i.exec(raw);
  if (!match || match.index == null) return { visible: raw, instruction: null };
  const visible = raw.slice(0, match.index).trim();
  const instruction = raw.slice(match.index + match[0].length).trim();
  return { visible, instruction: instruction || null };
}

export function withDesignToolboxInstruction(
  visible: string,
  instruction: string | null | undefined,
): string {
  const trimmedVisible = String(visible ?? '').trim();
  const trimmedInstruction = String(instruction ?? '').trim();
  if (!trimmedInstruction) return trimmedVisible;
  if (trimmedVisible.includes(DESIGN_TOOLBOX_INSTRUCTION_MARKER)) return trimmedVisible;
  if (!trimmedVisible) return `${DESIGN_TOOLBOX_INSTRUCTION_MARKER}\n${trimmedInstruction}`;
  return `${trimmedVisible}\n\n${DESIGN_TOOLBOX_INSTRUCTION_MARKER}\n${trimmedInstruction}`;
}

export function attachPendingDesignToolboxInstruction(input: {
  prompt: string;
  instruction?: string | null;
  actionTitle?: string | null;
}): string {
  const prompt = String(input.prompt ?? '');
  const instruction = String(input.instruction ?? '').trim();
  if (!instruction) return prompt.trim();
  if (prompt.includes(DESIGN_TOOLBOX_INSTRUCTION_MARKER)) return prompt.trim();
  const title = String(input.actionTitle ?? '').trim();
  const stillBound =
    !title
    || prompt.includes(title)
    || looksLikeDesignToolboxExpandedDraft(prompt);
  if (!stillBound) return prompt.trim();
  return withDesignToolboxInstruction(prompt, instruction);
}

export { isOpenDesignBrandedToolboxResource } from '../teamver/branding/toolboxCatalogDisplay';

export function findDesignToolboxSkill(
  action: DesignToolboxAction,
  skills: SkillSummary[],
): SkillSummary | null {
  for (const id of action.preferredSkillIds) {
    const exact = skills.find((skill) => skill.id === id || skill.name === id);
    if (exact) return exact;
  }
  const categoryHintSet = new Set(action.categoryHints);
  const categoryMatch = skills.find((skill) =>
    skill.category ? categoryHintSet.has(skill.category) : false,
  );
  if (categoryMatch) return categoryMatch;
  return (
    skills.find((skill) =>
      action.searchTerms.some((term) => skillMatchesQuery(skill, term)),
    ) ?? null
  );
}

import { looksLikeInstructionCopy } from '@open-design/contracts';
import type { Project } from '../types';
import {
  isSlideCreateBoilerplateLine,
} from '../teamver/slideCreateBoilerplate';

export { isSlideCreateBoilerplateLine } from '../teamver/slideCreateBoilerplate';

const MAX_CJK_TITLE_LENGTH = 18;
const MAX_LATIN_WORDS = 6;

const CJK_PATTERN = /[\u3400-\u9fff]/;
const HANGUL_PATTERN = /[\uac00-\ud7a3]/;

const LEADING_CJK_FILLER = [
  /^先?(帮我|帮忙|麻烦|请|可以|能不能|能否|给我|我想要|我要)/,
  /^(先)?(实现|做|做一下|创建|生成|设计|开发|新增|添加|优化|修复|改|更改|调整)(一下|一个|一版|下)?/,
  /^(一个|一份|这个|那个)/,
];

const LEADING_LATIN_FILLER =
  /^(please\s+)?(can\s+you\s+|could\s+you\s+|help\s+me\s+|i\s+want\s+to\s+|i\s+need\s+to\s+)?(create|build|make|design|implement|add|fix|update|improve|optimize|generate|write)\s+(a|an|the|this|that)?\s*/i;

const LATIN_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'in',
  'of',
  'on',
  'please',
  'the',
  'to',
  'with',
]);

const GENERIC_PLUGIN_TITLES = new Set([
  'untitled',
  'design',
  'new-project',
  'new project',
  '기본 슬라이드 템플릿',
  'default slide template',
]);

/** Plugin / template marketing titles must never become the project name. */
export function isDeckTemplateMarketingTitle(title: string): boolean {
  const normalized = title.trim();
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  if (GENERIC_PLUGIN_TITLES.has(lower) || GENERIC_PLUGIN_TITLES.has(normalized)) return true;
  // Community deck titles: "Html Ppt …", Daisy / Zhangzara / Hermes / Simple Deck, etc.
  if (/^html\s*ppt\b/i.test(normalized)) return true;
  if (/\b(daisy\s*days|zhangzara|hermes|simple\s*deck|cyber\s*terminal)\b/i.test(normalized)) {
    return true;
  }
  if (/^example[-_]/i.test(normalized)) return true;
  return false;
}

function isGenericPluginTitle(title: string): boolean {
  const normalized = title.trim();
  if (!normalized) return true;
  if (GENERIC_PLUGIN_TITLES.has(normalized.toLowerCase())) return true;
  if (GENERIC_PLUGIN_TITLES.has(normalized)) return true;
  if (isDeckTemplateMarketingTitle(normalized)) return true;
  return isMachineSlugLikeProjectName(normalized);
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

/** Daemon / artifact slugs and other non-human default names. */
export function isMachineSlugLikeProjectName(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  if (lower === 'design' || lower === 'untitled' || lower === 'new-project') return true;
  if (isUuidLike(normalized)) return true;
  return /^[a-z0-9]+(?:[-_][a-z0-9]+){1,}$/.test(normalized);
}

export function isPlaceholderProjectName(project: Pick<Project, 'id' | 'name'>): boolean {
  const name = project.name?.trim();
  if (!name) return true;
  if (name === project.id) return true;
  if (isGenericPluginTitle(name)) return true;
  return isMachineSlugLikeProjectName(name);
}

/**
 * Registry RDS title — block id/uuid/plugin defaults only.
 * User hyphenated renames (e.g. annual-report-2026) must sync to design-api.
 */
export function isRegistryPlaceholderTitle(project: Pick<Project, 'id' | 'name'>): boolean {
  const name = project.name?.trim();
  if (!name) return true;
  if (name === project.id) return true;
  if (isUuidLike(name)) return true;
  const lower = name.toLowerCase();
  if (GENERIC_PLUGIN_TITLES.has(lower) || GENERIC_PLUGIN_TITLES.has(name)) return true;
  if (isDeckTemplateMarketingTitle(name)) return true;
  return false;
}

function cleanPrompt(prompt: string): string {
  return prompt
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#][\w.-]+/g, ' ')
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimCjkTitle(input: string): string {
  let title = input.trim();
  for (const pattern of LEADING_CJK_FILLER) {
    title = title.replace(pattern, '').trim();
  }
  if (/项目名称/.test(title) && /自动/.test(title) && /(更改|修改|命名)/.test(title)) {
    return '自动项目命名';
  }
  title = title
    .replace(/^根据项目中的?第一个\s*prompt\s*/i, '')
    .replace(/项目名称.*自动.*(更改|修改|命名)/, '自动项目命名')
    .replace(/自动.*(更改|修改).*项目名称/, '自动项目命名')
    .replace(/总结项目名称/, '项目命名')
    .replace(/[，。！？；：,.!?;:].*$/, '')
    .replace(/\s+/g, '');
  if (!title) return '';
  return title.slice(0, MAX_CJK_TITLE_LENGTH);
}

/** Korean free-form asks → short topic (never leave "만들어줘" in the title). */
function trimHangulTitle(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  const aboutTopic = raw.match(
    /^(.+?)\s*(?:에\s*대해(?:서)?|에\s*관한)\s*(?:설명하는\s*)?(?:발표\s*자료|피피티|PPT|슬라이드|덱|프레젠테이션)?/i,
  )?.[1]?.trim();
  let title = aboutTopic || raw
    .replace(
      /\s*(?:에\s*대해(?:서)?|에\s*관한)?\s*(?:설명하는\s*)?(?:발표\s*자료|피피티|PPT|슬라이드|덱|프레젠테이션)?\s*(?:을|를)?\s*(?:만들어|작성|생성|설명해?).*$/i,
      '',
    )
    .replace(/\s*(?:만들어|작성|생성)\s*(?:줘|주세요)\.?$/i, '')
    .replace(/[.,!?;:…]+\s*$/u, '')
    .trim();
  if (!title || isSlideCreateBoilerplateLine(title)) return '';
  return title.slice(0, MAX_CJK_TITLE_LENGTH);
}

function toTitleCase(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function trimLatinTitle(input: string): string {
  const words = input
    .replace(LEADING_LATIN_FILLER, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !LATIN_STOP_WORDS.has(word.toLowerCase()))
    .slice(0, MAX_LATIN_WORDS);
  return words.map(toTitleCase).join(' ');
}

export function summarizeProjectNameFromPrompt(prompt: string): string {
  const cleaned = cleanPrompt(prompt);
  if (!cleaned) return '';
  const firstClause = cleaned.split(/[\n\r。！？!?]/)[0]?.trim() ?? cleaned;
  if (CJK_PATTERN.test(firstClause)) return trimCjkTitle(firstClause);
  if (HANGUL_PATTERN.test(firstClause)) return trimHangulTitle(firstClause);
  return trimLatinTitle(firstClause);
}

/**
 * Prefer the real user topic over Canvas/Home create-slides scaffolding.
 * Order: [User instruction] → bare "User instruction:" → lead line before deliverable.
 */
export function extractUserPromptForNaming(fullPrompt: string): string {
  const full = fullPrompt.trim();
  if (!full) return '';

  const bracketUser =
    /\[User instruction\]\s*\n([\s\S]*?)(?=\n\n\[|\n\[Selected slide template priority\]|$)/i
      .exec(full)?.[1]
      ?.trim();
  if (bracketUser && !isSlideCreateBoilerplateLine(bracketUser.split(/\n/)[0] ?? '')) {
    return bracketUser;
  }

  const briefUser =
    /(?:^|\n)User instruction\s*[:：]\s*\n?([\s\S]*?)(?=\n\n(?:Attachments:|\[)|$)/i
      .exec(full)?.[1]
      ?.trim();
  if (briefUser && !isSlideCreateBoilerplateLine(briefUser.split(/\n/)[0] ?? '')) {
    return briefUser;
  }

  let text = full;
  const deliverableIdx = text.indexOf('\n\n[Deliverable instruction]');
  if (deliverableIdx > 0) {
    text = text.slice(0, deliverableIdx).trim();
  }
  const sourceBriefIdx = text.indexOf('\n\n[Source brief]');
  if (sourceBriefIdx > 0) {
    text = text.slice(0, sourceBriefIdx).trim();
  }
  const quickIdx = text.indexOf('\n\n[Quick settings]');
  if (quickIdx > 0) {
    text = text.slice(0, quickIdx).trim();
  }
  return text;
}

/** First-turn / create naming — ignores Canvas create-slides boilerplate lines. */
export function summarizeProjectNameFromUserTurn(fullPrompt: string): string {
  const extracted = extractUserPromptForNaming(fullPrompt);
  const userLine = extracted.split('\n')[0]?.trim() ?? '';
  if (isSlideCreateBoilerplateLine(userLine)) return '';
  return summarizeProjectNameFromPrompt(extracted);
}

/**
 * Full user request text for Clone/fill — never returns create-slides lead boilerplate.
 * Empty string means the user did not type a real request (empty prompt OK).
 */
export function extractUserFacingCreateRequest(fullPrompt: string | null | undefined): string {
  const extracted = extractUserPromptForNaming(fullPrompt ?? '').trim();
  if (!extracted) return '';
  const firstLine = extracted.split('\n')[0]?.trim() ?? '';
  if (isSlideCreateBoilerplateLine(firstLine)) return '';
  if (isDeckTemplateMarketingTitle(firstLine)) return '';
  return extracted;
}

/**
 * Conversation dropdown title — never falls back to 「첨부한 자료」 / raw protocol dump.
 */
export function conversationTitleFromUserTurn(fullPrompt: string): string {
  const named = summarizeProjectNameFromUserTurn(fullPrompt);
  if (named) return named;
  const request = extractUserFacingCreateRequest(fullPrompt);
  if (!request) return '';
  return request.split('\n')[0]!.trim().slice(0, 60);
}

/** True when a project display name is safe to reuse as a Clone cover title. */
export function isUsableDeckCoverTitle(name: string | null | undefined): boolean {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return false;
  if (trimmed.toLowerCase() === 'untitled') return false;
  if (isSlideCreateBoilerplateLine(trimmed)) return false;
  if (isDeckTemplateMarketingTitle(trimmed)) return false;
  if (looksLikeInstructionCopy(trimmed)) return false;
  return true;
}

function titleFromAttachmentLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed || isUuidLike(trimmed)) return '';
  const base = trimmed.replace(/\.[^.]+$/, '').trim();
  if (!base || isUuidLike(base)) return '';
  return summarizeProjectNameFromPrompt(base) || base.slice(0, MAX_CJK_TITLE_LENGTH);
}

function titleFromTopicHint(topic: string): string {
  const trimmed = topic.trim();
  if (!trimmed || isUuidLike(trimmed)) return '';
  if (isSlideCreateBoilerplateLine(trimmed)) return '';
  if (isDeckTemplateMarketingTitle(trimmed)) return '';
  return summarizeProjectNameFromPrompt(trimmed) || trimmed.slice(0, MAX_CJK_TITLE_LENGTH);
}

/**
 * Name for POST /api/projects — prefer user prompt / canvas topic.
 * Never use deck-template marketing titles (Daisy / Html Ppt / …) as the project name.
 */
export function deriveProjectNameForCreate(input: {
  prompt?: string;
  topicHint?: string | null;
  attachmentLabel?: string | null;
  pluginTitle?: string | null;
}): string {
  const fromPrompt = summarizeProjectNameFromUserTurn(input.prompt ?? '');
  if (fromPrompt) return fromPrompt;

  const fromTopic = input.topicHint ? titleFromTopicHint(input.topicHint) : '';
  if (fromTopic) return fromTopic;

  const fromAttachment = input.attachmentLabel
    ? titleFromAttachmentLabel(input.attachmentLabel)
    : '';
  if (fromAttachment) return fromAttachment;

  // Last resort: do NOT fall back to plugin/template titles — those are system
  // labels, not the user's request. Prefer Untitled over "Html Ppt Daisy Days".
  void input.pluginTitle;
  return 'Untitled';
}

export function canAutoRenameProjectFromPrompt(
  project: Pick<Project, 'id' | 'name' | 'metadata'>,
): boolean {
  if (project.metadata?.nameSource === 'user') return false;
  if (project.metadata?.nameSource === 'generated') return true;
  if (project.metadata?.nameSource === 'prompt') {
    return isPlaceholderProjectName(project);
  }
  return isPlaceholderProjectName(project);
}

import type { Project } from '../types';

const MAX_CJK_TITLE_LENGTH = 18;
const MAX_LATIN_WORDS = 6;

const CJK_PATTERN = /[\u3400-\u9fff]/;

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
]);

const CANVAS_CREATE_SLIDES_USER_LINE = '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.';

function isBoilerplateUserPromptLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) return true;
  if (normalized === CANVAS_CREATE_SLIDES_USER_LINE) return true;
  if (/^첨부(?:한)?\s*.+\s*바탕으로\s*슬라이드\s*덱을?\s*만들어\s*줘\.?$/u.test(normalized)) {
    return true;
  }
  return false;
}

function isGenericPluginTitle(title: string): boolean {
  const normalized = title.trim();
  if (!normalized) return true;
  if (GENERIC_PLUGIN_TITLES.has(normalized.toLowerCase())) return true;
  if (GENERIC_PLUGIN_TITLES.has(normalized)) return true;
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
  return trimLatinTitle(firstClause);
}

/** Strip auto-send boilerplate (Canvas create-slides, deliverable blocks) before naming. */
export function extractUserPromptForNaming(fullPrompt: string): string {
  let text = fullPrompt.trim();
  const deliverableIdx = text.indexOf('\n\n[Deliverable instruction]');
  if (deliverableIdx > 0) {
    text = text.slice(0, deliverableIdx).trim();
  }
  const sourceBriefIdx = text.indexOf('\n\n[Source brief]');
  if (sourceBriefIdx > 0) {
    text = text.slice(0, sourceBriefIdx).trim();
  }
  return text;
}

/** First-turn / create naming — ignores Canvas create-slides boilerplate lines. */
export function summarizeProjectNameFromUserTurn(fullPrompt: string): string {
  const extracted = extractUserPromptForNaming(fullPrompt);
  const userLine = extracted.split('\n')[0]?.trim() ?? '';
  if (isBoilerplateUserPromptLine(userLine)) return '';
  return summarizeProjectNameFromPrompt(extracted);
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
  return summarizeProjectNameFromPrompt(trimmed) || trimmed.slice(0, MAX_CJK_TITLE_LENGTH);
}

/** Name for POST /api/projects — prefer user prompt / canvas topic over plugin template labels. */
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

  const head = (input.prompt ?? '').trim().split(/\s+/).slice(0, 8).join(' ');
  if (head.length > 0) {
    const fromHead = summarizeProjectNameFromPrompt(head);
    if (fromHead) return fromHead;
    return head.slice(0, 60);
  }

  const plugin = input.pluginTitle?.trim();
  if (plugin && !isGenericPluginTitle(plugin)) return plugin;

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

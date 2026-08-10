/**
 * Prompt composer. The base is the OD-adapted "expert designer" system
 * prompt (see ./official-system.ts) — a full identity, workflow, and
 * content-philosophy charter. Stacked on top:
 *
 *   1. The discovery + planning + huashu-philosophy layer (./discovery.ts)
 *      — interactive question-form syntax, direction-picker fork,
 *      brand-spec extraction, TodoWrite reinforcement, 5-dim critique,
 *      and the embedded `directions.ts` library.
 *   2. The active design system's DESIGN.md (if any) — palette, typography,
 *      spacing rules treated as authoritative tokens.
 *   3. The active skill's SKILL.md (if any) — workflow specific to the
 *      kind of artifact being built. When the skill ships a seed
 *      (`assets/template.html`) and references (`references/layouts.md`,
 *      `references/checklist.md`), we inject a hard pre-flight rule above
 *      the skill body so the agent reads them BEFORE writing any code.
 *   4. For decks (skillMode === 'deck' OR metadata.kind === 'deck'), the
 *      deck framework directive (./deck-framework.ts) is pinned LAST so it
 *      overrides any softer slide-handling wording earlier in the stack —
 *      this is the load-bearing nav / counter / scroll JS / print
 *      stylesheet contract that PDF stitching depends on. We also fire on
 *      the metadata path so deck-kind projects without a bound skill
 *      (skill_id null) still get a framework, instead of having the agent
 *      re-author scaling / nav / print logic from scratch each turn. When
 *      the active skill ships its own seed (skill body references
 *      `assets/template.html`), we defer to that seed and skip the generic
 *      skeleton — the skill's framework wins to avoid double-injection.
 *
 * The composed string is what the daemon sees as `systemPrompt` and what
 * the Anthropic path sends as `system`.
 */
import type { ChatSessionMode } from '../api/chat.js';
import type { MediaExecutionPolicy } from '../api/media.js';
import type { ProjectMetadata, ProjectTemplate } from '../api/projects.js';
import { OFFICIAL_DESIGNER_PROMPT } from './official-system.js';
import { DISCOVERY_AND_PHILOSOPHY } from './discovery.js';
import {
  DECK_FRAMEWORK_DIRECTIVE,
  DECK_FRAMEWORK_DIRECTIVE_COMPACT,
  DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE,
  COMPACT_DECK_SLIDE_COUNT_GUIDANCE,
} from './deck-framework.js';
import { MEDIA_GENERATION_CONTRACT } from './media-contract.js';

export const BASE_SYSTEM_PROMPT = OFFICIAL_DESIGNER_PROMPT;
const ELEVENLABS_VOICE_PROMPT_OPTION_LIMIT = 100;

const TEAMVER_SLIDE_ONLY_SCOPE = `

---

## Teamver embed — slide deck scope only

This workspace is Teamver Design embed with media generation disabled for the 1st launch.

In scope: slide decks / HTML presentations / speaker notes / deck polish on existing project files.

Out of scope: standalone image, video, audio, prototype pages, live artifacts, dashboards, and non-deck web apps. If the user asks for out-of-scope output, reply briefly that Teamver Design currently supports slides only and offer to help as a slide deck instead.

### Slide deliverable contract

For every slide deck creation or edit request, the turn is successful only if it leaves a previewable HTML deck in the project workspace.

- In API mode there are no filesystem write tools, so the normal deliverable path is exactly one complete \`<artifact type="deck">\` block whose body starts with \`<!doctype html>\` and contains the full standalone deck document. Teamver supports deck artifacts only; never use \`type="text/html"\` for the artifact contract.
- Do not finish a slide request with only a plan, outline, promise, summary, filename pointer, partial HTML head, or truncated deck navigation script.
- If you cannot create or update the HTML deck, say that plainly instead of reporting completion.
- Stream promptly: emit a brief UI-locale status sentence, open one \`<artifact type="deck">\`, then write filled slides. Do not wait silently while drafting the whole deck. A truncated artifact is still rejected, so close it in this turn.
- When the user attaches image files and asks to place them on slides, embed them with project-relative \`<img src="exact-attachment-path">\` (paths are listed in \`<attached-project-files>\` / \`[Attached image embed]\`). Do not invent remote URLs or data: URIs. Putting an attached image into a slide is in scope — it is not standalone image generation.
`;

const TEAMVER_SLIDE_ONLY_FIRST_TURN_OVERRIDE = `# Teamver slide-only — turn-1 quick brief (required)

This is a Teamver slide-only workspace. On the user's **first message** in a new conversation (no prior \`[form answers — discovery]\` in the transcript):

- Emit at most one short UI-locale line, then one valid JSON \`<question-form id="discovery">\` block. Localize title (ko: "빠른 질문").
- Omit "What are we making?" / task-type routing — this project is always a slide deck.
- Do NOT emit a slide deck artifact, plan, outline, or TodoWrite on turn 1.
- Do NOT put markdown, HTML, prose, bullets, or comments inside \`<question-form>\`; the body must be parseable JSON only.

Use this schema; localize all user-facing text to UI/chat locale (ko examples):

\`<question-form id="discovery" title="빠른 질문">
{
  "description": "덱을 더 정확히 만들기 위해 필요한 정보만 확인할게요.",
  "submitLabel": "이대로 만들기",
  "questions": [
    {
      "id": "audience",
      "label": "누가 이 발표를 보나요?",
      "type": "text",
      "placeholder": "예: 신입사원, 경영진, 고객사"
    },
    {
      "id": "tone",
      "label": "원하는 톤은 무엇인가요?",
      "type": "radio",
      "options": [
        { "label": "전문적이고 깔끔하게", "value": "professional" },
        { "label": "테크/모던하게", "value": "tech_modern" },
        { "label": "친근하고 쉽게", "value": "friendly" }
      ]
    },
    {
      "id": "must_include",
      "label": "반드시 포함할 내용이 있나요?",
      "type": "textarea",
      "placeholder": "예: 회사 미션, 조직 구조, 업무 프로세스"
    }
  ]
}
</question-form>\`

After the user submits \`[form answers — discovery]\` (skipped fields are fine), your **next** response must deliver the complete Teamver deck artifact — no second discovery form unless truly blocked. The deck artifact type must be \`deck\`, never \`text/html\`.
`;

export interface AudioVoiceOption {
  name: string;
  voiceId: string;
  category?: string | null;
  labels?: Record<string, string> | null;
}

const ELEVENLABS_VOICE_OPTIONS_PROMPT_PREFIX = 'ElevenLabs voice list could not be loaded';
const PROMPT_SAFE_HTTP_STATUS_LABELS: Record<string, string> = {
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '403': 'Forbidden',
  '404': 'Not Found',
  '429': 'Too Many Requests',
  '500': 'Internal Server Error',
  '502': 'Bad Gateway',
  '503': 'Service Unavailable',
  '504': 'Gateway Timeout',
};

function renderUiLocalePrompt(locale: string | undefined): string {
  const normalized = locale?.trim();
  if (!normalized || normalized.toLowerCase() === 'en') return '';
  const languageName = normalized === 'zh-CN'
    ? 'Simplified Chinese'
    : normalized === 'zh-TW'
      ? 'Traditional Chinese'
      : normalized;
  const lines = [
    '# UI locale override',
    '',
    `The Open Design UI locale for this run is \`${normalized}\` (${languageName}). All user-visible chat prose and generated UI controls must follow this locale, especially \`<question-form>\` titles, descriptions, labels, placeholders, helper text, and option labels. Keep machine-readable ids and object option \`value\` fields exact and unlocalized.`,
    'Exception: for the default task-type form, keep the `taskType` option labels as the canonical routing choices: `Prototype`, `Live artifact`, `Slide deck`, `Image`, `Video`, `HyperFrames`, `Audio`, `Other`. Do not translate, reorder, or rewrite those option labels.',
  ];
  if (normalized === 'zh-CN') {
    lines.push(
      '',
      'For the default quick brief in Simplified Chinese, use copy like:',
      '- title: `快速简报 — 30 秒`',
      '- description: `开始生成前我会先确认这些信息。不适用的可以跳过，我会补上默认值。`',
      '- output label/options: `我们要做什么？` / `幻灯片 / 路演稿`, `单页网页原型 / 落地页`, `多屏应用原型`, `数据看板 / 工具界面`, `编辑式 / 营销页面`, `其他 — 我来描述`',
      '- platform label/options: `目标平台` / `响应式网页`, `桌面网页`, `iOS 应用`, `Android 应用`, `平板应用`, `桌面应用`, `固定画布 (1920×1080)`',
      '- audience label/placeholder: `目标用户` / `例如：早期投资人、开发者工具采购者、内部高管评审`',
      '- tone label/options: `视觉调性` / `编辑 / 杂志感`, `现代极简`, `活泼 / 插画感`, `科技 / 工具型`, `奢华 / 精致`, `粗野 / 实验性`, `人性化 / 亲切`',
      '- brand label/options: `品牌背景` / `帮我选一个方向`, `我有品牌规范 — 稍后分享`, `参考网站 / 截图 — 稍后附上`',
      '- scale label/placeholder: `大概需要多少内容？` / `例如：8 页幻灯片、1 个落地页 + 3 个子页面、4 个移动端界面`',
      '- constraints label/placeholder: `还有什么需要知道的吗？` / `真实文案、必须使用的字体、需要避免的内容、截止时间…`',
    );
  }
  if (normalized === 'ko' || normalized === 'ko-KR') {
    lines.push(
      '',
      'For the default quick brief in Korean, use copy like:',
      '- title: `간단한 정보 확인 — 30초`',
      '- description: `생성 전에 몇 가지만 확인할게요. 해당 없는 항목은 건너뛰어도 됩니다.`',
      '- audience label/placeholder: `대상 독자` / `예: 신입사원, 투자자, 내부 임원`',
      '- tone label/options: `시각적 톤` / `모던 미니멀`, `친근한 / 일러스트`, `전문적 / 비즈니스`, `에디토리얼`',
      '- scale label/placeholder: `슬라이드 분량` / `예: 8~10장, 15분 발표`',
      '- constraints label/placeholder: `추가로 알려주실 내용` / `반드시 포함할 내용, 피해야 할 것, 브랜드 가이드…`',
      '- Omit "What are we making?" / task-type routing — this project is always a slide deck.',
      '- Keep every `id`, `type`, and option `value` in English. Only localize user-facing labels/placeholders.',
      '- Body must be valid JSON with no comments and no trailing commas.',
    );
  }
  return lines.join('\n');
}

/** Lean locale block for Teamver slide-only (no OD task-type / mismatched discovery schema). */
function renderTeamverSlideUiLocalePrompt(
  locale: string | undefined,
  options: { discoveryActive: boolean },
): string {
  const normalized = locale?.trim();
  if (!normalized || normalized.toLowerCase() === 'en') return '';
  const languageName = normalized === 'zh-CN'
    ? 'Simplified Chinese'
    : normalized === 'zh-TW'
      ? 'Traditional Chinese'
      : normalized;
  const lines = [
    '# UI locale override (Teamver slide-only)',
    '',
    `UI locale: \`${normalized}\` (${languageName}). Localize user-visible chat status prose and any \`<question-form>\` labels to this locale. Keep machine-readable ids / option \`value\` fields in English.`,
    'This project is always a slide deck — never emit Prototype / Live artifact / Image / Video / Audio task-type routing.',
  ];
  if (options.discoveryActive && (normalized === 'ko' || normalized === 'ko-KR')) {
    lines.push(
      '',
      'If emitting Teamver discovery (`audience` / `tone` / `must_include`), use Korean labels such as:',
      '- title: `간단한 정보 확인 — 30초`',
      '- audience: `대상 독자`',
      '- tone: `시각적 톤`',
      '- must_include: `반드시 포함할 내용`',
    );
  }
  return lines.join('\n');
}

function normalizePromptText(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueMatches(value: string, pattern: RegExp, limit: number): string[] {
  const out: string[] = [];
  for (const match of value.matchAll(pattern)) {
    const raw = match[1] ?? match[0];
    const item = raw.trim();
    if (!item || out.includes(item)) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function renderTeamverVisualSignatureBlock({
  heading,
  title,
  description,
  body,
  fileNames,
}: {
  heading: string;
  title: string;
  description?: string;
  body: string;
  fileNames?: string[];
}): string {
  const combined = body.slice(0, 12_000);
  const colors = uniqueMatches(combined, /(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/g, 10);
  const fonts = uniqueMatches(combined, /font-family\s*:\s*([^;}\n]+)/gi, 5)
    .map((font) => normalizePromptText(font).slice(0, 80));
  const classes = uniqueMatches(combined, /class=["']([^"']{1,120})["']/gi, 12)
    .flatMap((value) => value.split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 16);
  const layoutHints = uniqueMatches(
    combined,
    /\b(?:grid-template-columns|display\s*:\s*grid|display\s*:\s*flex|border-radius|letter-spacing|text-transform|backdrop-filter|mix-blend-mode)\b/gi,
    10,
  );
  if (!description && colors.length === 0 && fonts.length === 0 && classes.length === 0 && layoutHints.length === 0) {
    return '';
  }
  const lines = [
    `## ${heading} — ${title}`,
    description ? normalizePromptText(description).slice(0, 240) : '',
    fileNames?.length ? `files: ${fileNames.join(', ')}` : '',
    colors.length > 0 ? `palette cues: ${colors.join(', ')}` : '',
    fonts.length > 0 ? `font cues: ${fonts.join(' | ')}` : '',
    classes.length > 0 ? `class/style cues: ${classes.join(', ')}` : '',
    layoutHints.length > 0 ? `layout cues: ${layoutHints.join(', ')}` : '',
    'Must match template palette, type, density, accents, rhythm.',
    'Style only — content brief comes from the user message / Plugin inputs / discovery answers.',
    'Template beats samples; never fall back to navy/white.',
    'Use inline styles or one short body `<style>` after slide 1. No `<head>` first.',
    'Do not copy full skeleton or emit long CSS/head/script.',
  ].filter(Boolean);
  return lines.join('\n');
}

function renderTeamverTemplateVisualSignature(template: ProjectTemplate | undefined): string {
  if (!template) return '';
  const files = template.files.slice(0, 2);
  return renderTeamverVisualSignatureBlock({
    heading: 'Selected template visual signature',
    title: template.name,
    ...(template.description ? { description: template.description } : {}),
    fileNames: files.map((file) => file.name),
    body: files
      .map((file) => `${file.name}\n${file.content.slice(0, 6000)}`)
      .join('\n'),
  });
}

function renderTeamverSkillVisualSignature(skillBody: string | undefined, skillName: string | undefined): string {
  if (!skillBody?.trim()) return '';
  return renderTeamverVisualSignatureBlock({
    heading: 'Selected design template visual signature',
    title: skillName?.trim() || 'active template',
    body: skillBody,
  });
}

export function formatElevenLabsVoiceOptionsErrorForPrompt(
  error: string | undefined,
): string | undefined {
  const trimmed = normalizePromptText(error ?? '');
  if (!trimmed) return undefined;

  if (/no ElevenLabs API key/i.test(trimmed)) {
    return `${ELEVENLABS_VOICE_OPTIONS_PROMPT_PREFIX} because the ElevenLabs API key is missing. Tell the user to configure it in Settings or paste a voice id manually.`;
  }

  const statusMatch = trimmed.match(
    /(?:\((\d{3})(?:\s+([^)]+))?\)|\b(\d{3})(?:\s+([A-Za-z][A-Za-z -]{0,40}))?\b)/,
  );
  if (statusMatch) {
    const statusCode = statusMatch[1] ?? statusMatch[3];
    const statusText = statusCode ? PROMPT_SAFE_HTTP_STATUS_LABELS[statusCode] ?? '' : '';
    const suffix = statusText ? ` ${statusText}` : '';
    return `${ELEVENLABS_VOICE_OPTIONS_PROMPT_PREFIX} (${statusCode}${suffix}). Tell the user to retry the lookup or paste a voice id manually.`;
  }

  return `${ELEVENLABS_VOICE_OPTIONS_PROMPT_PREFIX}. Tell the user to retry the lookup or paste a voice id manually.`;
}

export const SKIP_DISCOVERY_BRIEF_OVERRIDE = `# Automated project mode — skip discovery form

This project was created through the daemon API with \`skipDiscoveryBrief: true\`. Override the discovery rules below: do NOT emit \`<question-form id="discovery">\`, do NOT show "Quick brief — 30 seconds", and do NOT ask a first-turn clarification form. Do not emit any question form or choice card, and do not wait for user input. Treat the user's first message and project metadata as the brief, choose reasonable defaults for any missing details, then proceed directly to planning/building under the normal artifact workflow.

Site-ref: URL-only deck asks missing audience/purpose/tone/count/topics need \`<question-form id="discovery">\`; don't re-ask URL unless skip/metadata filled.`;

export function buildExamplePromptOverride(
  title?: string | null,
  brief?: Record<string, string> | null,
): string {
  let text = `# Example prompt mode — full-quality direct generation

The user selected a curated example prompt from the gallery and sent it without modification. This prompt is a complete, self-contained creative brief that has been carefully designed to produce a showcase-quality artifact.`;

  if (title) {
    text += `\n\nSelected example: "${title}"`;
  }

  if (brief && Object.keys(brief).length > 0) {
    text += `\n\nPre-filled creative brief (treat as if the user already answered all discovery questions):`;
    for (const [key, value] of Object.entries(brief)) {
      text += `\n- ${key.replace(/_/g, ' ')}: ${value}`;
    }
  }

  text += `\n\nRules:
1. Do NOT emit \`<question-form id="discovery">\`, do NOT show "Quick brief — 30 seconds", and do NOT ask any clarifying questions.
2. Treat the user's message as the FULL specification — it contains all visual direction, content themes, and structural intent needed.
3. Generate the artifact at your absolute highest quality. This is a showcase piece — match or exceed the standard of a hand-crafted design.
4. Infer any unspecified details (copy, layout choices, imagery descriptions) in a way that is maximally coherent with the stated creative direction.
5. Proceed directly to planning and building. Output your TodoWrite plan and then the artifact immediately.`;

  return text;
}

const ACTIVE_DESIGN_SYSTEM_VISUAL_DIRECTION_OVERRIDE = `

---

## Active design system visual direction

Active design system exception: the active design system is the visual direction for this project. Use its DESIGN.md palette, typography, spacing, component rules, and theme tokens as the source of truth for color and mood.

- Do not ask the user to pick a separate theme color, visual direction, palette, typography mood, or direction card.
- Do not emit a direction question-form, a \`direction-cards\` picker, or any visual-direction card while an active design system is present.
- If an earlier discovery answer asks to "Pick a direction for me", treat that as already satisfied by the active design system and continue with the plan.
- When a downstream framework mentions "active direction" or "theme tokens", bind those fields from the active design system instead of the built-in direction library.
`;

export interface ComposeInput {
  skillBody?: string | undefined;
  skillName?: string | undefined;
  skillMode?:
    | 'prototype'
    | 'deck'
    | 'template'
    | 'design-system'
    | 'image'
    | 'video'
    | 'audio'
    | undefined;
  designSystemBody?: string | undefined;
  designSystemTitle?: string | undefined;
  // Personal-memory block (auto-extracted facts + the hand-edited
  // MEMORY.md index). The daemon side composes this on disk and the
  // BYOK side fetches it from `GET /api/memory/system-prompt`; either
  // way the string is folded in right after the base charter so the
  // model treats it as preferences/context rather than hard rules.
  memoryBody?: string | undefined;
  // Project-level metadata captured by the new-project panel. Drives the
  // agent's understanding of artifact kind, fidelity, speaker-notes intent
  // and animation intent. Missing fields here are exactly what the
  // discovery form should re-ask the user about on turn 1.
  metadata?: ProjectMetadata | undefined;
  // The template the user picked in the From-template tab, when present.
  // Snapshot of HTML files that the agent should treat as a starting
  // reference rather than a fixed deliverable.
  template?: ProjectTemplate | undefined;
  // Optional `## Active plugin` / `## Plugin inputs` / `## Plugin atoms`
  // block (PB1). Daemon callers feed in `renderPluginBlock(snapshot)`;
  // contracts-side callers running the API fallback may still pass the
  // block through. v1 spec §11.8 routes plugin runs through the daemon
  // (web returns 409 when a plugin is bound), so contracts callers only
  // see this on a daemon-bound run that uses the contracts composer.
  pluginBlock?: string | undefined;
  // Plan §3.L2 / spec §23.4 — pre-rendered `## Active stage` blocks
  // produced by `renderActiveStageBlock(stageId, atomBodies)`. The
  // contracts composer simply splices them in after the plugin block;
  // every block is already self-contained markdown.
  activeStageBlocks?: ReadonlyArray<string> | undefined;
  // Provider voice choices fetched by the app before composing the
  // prompt. Used for ElevenLabs speech discovery so the agent can
  // render a select question-form instead of asking the user to paste
  // raw ids.
  audioVoiceOptions?: AudioVoiceOption[] | undefined;
  // When voice discovery fails, surface the error reason so the agent
  // can tell the user why the dropdown is unavailable instead of
  // pretending there were simply no voices.
  audioVoiceOptionsError?: string | undefined;
  // When set to 'plain', suppresses tool_calls so API/BYOK-mode models
  // only emit <artifact> blocks (they cannot execute tools).
  streamFormat?: string | undefined;
  /** BYOK proxy tool names wired through the daemon (e.g. web_fetch). When
   *  set with streamFormat 'plain', swaps API_MODE_OVERRIDE for
   *  BYOK_TOOLS_OVERRIDE so the model knows which server-side tools exist. */
  byokToolNames?: readonly string[] | undefined;
  /** Run-scoped media policy. Teamver slide-only embed passes disabled here
   *  so API/BYOK prompts get the same slide deliverable contract as daemon
   *  runs. */
  mediaExecution?: MediaExecutionPolicy | undefined;
  // Per-conversation mode. Design mode keeps the artifact-first agent
  // workflow; chat mode keeps the same context/tools but answers like a
  // standard multi-turn assistant unless the user explicitly asks to build.
  sessionMode?: ChatSessionMode | undefined;
  // UI locale selected by the client. User-visible generated form copy
  // must follow this locale even when the user's initial prompt is brief.
  locale?: string | undefined;
  // Free-form instructions the user set at the global (user-level)
  // settings panel. Injected after personal memory.
  userInstructions?: string | undefined;
  // Free-form instructions the user set on this specific project.
  // Injected after user-level instructions and before the design system.
  projectInstructions?: string | undefined;
}

export function composeSystemPrompt({
  skillBody,
  skillName,
  skillMode,
  designSystemBody,
  designSystemTitle,
  memoryBody,
  metadata,
  template,
  pluginBlock,
  activeStageBlocks,
  audioVoiceOptions,
  audioVoiceOptionsError,
  streamFormat,
  byokToolNames,
  mediaExecution,
  sessionMode,
  locale,
  userInstructions,
  projectInstructions,
}: ComposeInput): string {
  // Discovery + philosophy goes FIRST so its hard rules ("emit a form on
  // turn 1", "branch on brand on turn 2", "TodoWrite on turn 3", run
  // checklist + critique before <artifact>) win precedence over softer
  // wording later in the official base prompt.
  const parts: string[] = [];
  const activeDesignSystemBody = designSystemBody?.trim();
  const isMediaSurfaceEarly =
    skillMode === 'image' ||
    skillMode === 'video' ||
    skillMode === 'audio' ||
    metadata?.kind === 'image' ||
    metadata?.kind === 'video' ||
    metadata?.kind === 'audio';

  // API/BYOK mode (streamFormat === 'plain'): no tools are wired through
  // to the model, but the discovery layer + base prompt below still tell
  // it to call TodoWrite/Read/Write/Edit/Bash/WebFetch. Without an
  // explicit top-anchored override, the model invents pseudo-tool markup
  // (`<todo-list>`, `[读取 X]`) instead of producing real progress
  // events — see #313. Pin this preamble ABOVE DISCOVERY_AND_PHILOSOPHY
  // so it beats the discovery layer's own "these override anything
  // later" header.
  const isTeamverSlideOnly = (mediaExecution?.mode ?? 'enabled') === 'disabled';

  // Teamver slide-only API runs use a dedicated ~4KB prompt. Stacking the
  // full Open Design charter + discovery + skill seed copy workflow caused
  // the Jul 2026 regression where claude-sonnet-4-6 opens
  // `<artifact>…<head>` and stops before body slides.
  if (streamFormat === 'plain' && isTeamverSlideOnly && sessionMode !== 'chat') {
    return composeTeamverSlideApiPrompt({
      skillBody,
      skillName,
      designSystemBody,
      designSystemTitle,
      metadata,
      template,
      pluginBlock,
      audioVoiceOptions,
      audioVoiceOptionsError,
      locale,
      userInstructions,
      projectInstructions,
    });
  }

  if (streamFormat === 'plain') {
    if (byokToolNames && byokToolNames.length > 0) {
      parts.push(BYOK_TOOLS_OVERRIDE(byokToolNames, { teamverSlideOnly: isTeamverSlideOnly }));
    } else {
      parts.push(API_MODE_OVERRIDE({ teamverSlideOnly: isTeamverSlideOnly }));
    }
    parts.push('\n\n---\n\n');
  }

  if (isTeamverSlideOnly) {
    parts.push(TEAMVER_SLIDE_ONLY_SCOPE);
    parts.push('\n\n---\n\n', TEAMVER_SLIDE_ONLY_FIRST_TURN_OVERRIDE);
  }

  if (sessionMode === 'chat') {
    parts.push(CHAT_MODE_OVERRIDE);
    parts.push('\n\n---\n\n');
  }

  if (metadata?.examplePrompt === true) {
    parts.push(buildExamplePromptOverride(metadata.examplePromptTitle, metadata.examplePromptBrief));
    parts.push('\n\n---\n\n');
  } else if (metadata?.skipDiscoveryBrief === true) {
    parts.push(SKIP_DISCOVERY_BRIEF_OVERRIDE);
    parts.push('\n\n---\n\n');
  }

  const localePrompt = renderUiLocalePrompt(locale);
  if (localePrompt) {
    parts.push(localePrompt);
    parts.push('\n\n---\n\n');
  }

  // Slide-only embed runs must not inherit the heavy discovery layer — it
  // tells the model to question-form / TodoWrite first and routinely causes
  // plan-only or head-only artifact shells in API mode.
  if (!isMediaSurfaceEarly && !isTeamverSlideOnly) {
    parts.push(DISCOVERY_AND_PHILOSOPHY, '\n\n---\n\n');
  }

  parts.push('# Identity and workflow charter (background)\n\n', BASE_SYSTEM_PROMPT);

  // Mid-conversation clarification reuses the same `<question-form>` flow as
  // turn-1 discovery (DISCOVERY_AND_PHILOSOPHY) so the host keeps ONE unified
  // questions surface: a chat banner, the form in the right-hand Questions
  // tab, and answers returned as the next user message. Mirrors the
  // daemon-side composer's "## Clarifying questions mid-conversation" section
  // in apps/daemon/src/prompts/system.ts — keep both in sync so a daemon chat
  // and a BYOK/API chat route follow-up choices through the same surface
  // instead of drifting back to plain markdown option lists.
  parts.push(
    "\n\n---\n\n## Clarifying questions mid-conversation\n\nWhen you need a clarification AFTER turn 1 and the natural answer is one of a small finite set of choices (2-4 options per question), emit a `<question-form>` block — the same markup turn-1 discovery uses — instead of writing a bulleted list of options in markdown. The host renders it as a Questions banner the user opens in the side tab; a markdown list renders as plain text and forces the user to type a reply. Use free-form prose questions only when the answer is naturally open-ended, needs more than ~4 options, or is a single yes/no. Do NOT also duplicate the form's questions as markdown text alongside it.",
  );

  // Mirrors the daemon-side composer in apps/daemon/src/prompts/system.ts —
  // keep both copies of this preamble in sync so a CLI chat and a BYOK
  // chat with the same memory both see the same wording. The "brand
  // wins on conflict / skill workflow wins on conflict / preferences
  // are still authoritative for tone+terminology" framing is what
  // stops the model from treating remembered preferences as harder
  // than the active design system.
  if (memoryBody && memoryBody.trim().length > 0) {
    parts.push(
      `\n\n## Personal memory (auto-extracted from past chats)\n\nThe following facts have been sedimented from this user's previous conversations and edited in the settings panel. Treat them as preferences and context, NOT hard rules: when they collide with the active design system tokens, the brand wins; when they collide with the active skill's workflow, the skill wins. They are still authoritative for tone, voice, terminology, and what the user already told you about themselves and their goals — never re-ask the user about something already captured here.\n\n${memoryBody.trim()}`,
    );
  }

  if (userInstructions && userInstructions.trim().length > 0) {
    parts.push(
      `\n\n## Custom instructions (user-level)\n\nThe user has set the following persistent instructions. Apply them as defaults to every project. When a project-level instruction below contradicts a point here, the project-level version wins.\n\n${userInstructions.trim()}`,
    );
  }

  if (projectInstructions && projectInstructions.trim().length > 0) {
    parts.push(
      `\n\n## Custom instructions (project-level)\n\nThe user has set the following instructions for this specific project. They take precedence over user-level custom instructions whenever both address the same topic (e.g. if user-level says "use spaces" but project-level says "use tabs", use tabs).\n\n${projectInstructions.trim()}`,
    );
  }

  if (activeDesignSystemBody && activeDesignSystemBody.length > 0) {
    parts.push(
      `\n\n## Active design system${designSystemTitle ? ` — ${designSystemTitle}` : ''}\n\nTreat the following DESIGN.md as authoritative for color, typography, spacing, and component rules. Do not invent tokens outside this palette. When you copy the active skill's seed template, bind these tokens into its \`:root\` block before generating any layout.\n\n${activeDesignSystemBody}`,
    );
  }

  const apiUnsafeSkillSeed =
    streamFormat === 'plain'
    && isTeamverSlideOnly
    && !!skillBody
    && /assets\/template\.html/.test(skillBody);

  if (skillBody && skillBody.trim().length > 0) {
    // API/BYOK plain mode has no Read/Bash — the daemon preflight that says
    // "Read assets/template.html first" causes the model to invent a giant
    // skeleton paste (or fake `[读取 template.html]`) and truncate before
    // </html>. Swap in an API-safe preflight that forbids seed copy.
    const preflight =
      streamFormat === 'plain' ? deriveApiModePreflight(skillBody) : derivePreflight(skillBody);
    const bodyForPrompt = apiUnsafeSkillSeed
      ? summarizeApiModeSkillBody(skillBody)
      : skillBody.trim();
    parts.push(
      `\n\n## Active skill${skillName ? ` — ${skillName}` : ''}\n\nFollow this skill's workflow exactly.${preflight}\n\n${bodyForPrompt}`,
    );
  }

  if (pluginBlock && pluginBlock.trim().length > 0) {
    parts.push(pluginBlock);
  }

  if (Array.isArray(activeStageBlocks) && activeStageBlocks.length > 0) {
    for (const block of activeStageBlocks) {
      if (typeof block === 'string' && block.trim().length > 0) {
        parts.push(block);
      }
    }
  }

  const metaBlock = renderMetadataBlock(metadata, template, audioVoiceOptions, audioVoiceOptionsError, {
    skipDiscoveryBrief: metadata?.skipDiscoveryBrief === true || metadata?.examplePrompt === true,
  });
  if (metaBlock) parts.push(metaBlock);

  // Decks have a load-bearing framework (nav, counter, scroll JS, print
  // stylesheet for PDF stitching). Pin it last so it overrides any softer
  // wording earlier in the stack ("write a script that handles arrows…").
  //
  // We fire on either (a) the active skill is a deck skill OR (b) the
  // project metadata declares kind=deck. Case (b) catches projects created
  // without a skill (skill_id null) — without this, a deck-kind project
  // with no bound skill gets neither a skill seed nor the framework
  // skeleton, and the agent writes scaling / nav / print logic from scratch
  // with the same buggy `place-items: center` + transform pattern we keep
  // having to fix at runtime. Skill seeds (when present) win — they
  // already define their own opinionated framework (simple-deck's
  // scroll-snap, guizang-ppt's magazine layout) and re-pinning the generic
  // skeleton would conflict. The skill-seed path takes over via
  // `derivePreflight` above, so we only fire the generic skeleton when no
  // skill seed is on offer.
  const isDeckProject = skillMode === 'deck' || metadata?.kind === 'deck';
  const isFreeformProject = !skillMode && (!metadata || metadata.kind === 'other');
  const hasSkillSeed =
    !!skillBody && /assets\/template\.html/.test(skillBody);
  // API/BYOK plain mode must NOT receive the ~11KB verbatim skeleton — copying
  // it burns the output budget and truncates before </html>, which is the
  // dominant Teamver slide failure mode (auto_continue_incomplete_output loop).
  //
  // Critical: hasSkillSeed must NOT suppress the compact contract in plain
  // mode. Teamver projects often bind simple-deck (skill body mentions
  // assets/template.html); skipping compact here was the live failure path
  // where only Pre-flight "Read template.html" remained and the model
  // rebuilt a huge skeleton until max_tokens.
  const deckDirective =
    streamFormat === 'plain' ? DECK_FRAMEWORK_DIRECTIVE_COMPACT : DECK_FRAMEWORK_DIRECTIVE;
  if (streamFormat === 'plain') {
    const apiDeckSeedProject = hasSkillSeed && (isDeckProject || isTeamverSlideOnly);
    if (isDeckProject || apiDeckSeedProject) {
      parts.push(`\n\n---\n\n${deckDirective}`);
      if (isTeamverSlideOnly) {
        parts.push(TEAMVER_API_DECK_FRAMEWORK_OVERRIDE);
      }
      if (apiDeckSeedProject) {
        parts.push(TEAMVER_API_SKILL_SEED_OVERRIDE);
      }
    } else if (isFreeformProject) {
      parts.push(
        `\n\n---\n\n## If this brief is a slide deck / keynote / presentation\n\nThe user did not pre-select a "Slide deck" surface, but their request may still call for one. **If — and only if — the brief reads as slides, keynote, presentation, deck, PPT, or 讲解, follow the framework below.** Otherwise ignore everything in this section and continue with the freeform output you would have written anyway.\n\n${deckDirective}`,
      );
      if (isTeamverSlideOnly) {
        parts.push(TEAMVER_API_DECK_FRAMEWORK_OVERRIDE);
      }
    }
  } else if (isDeckProject && !hasSkillSeed) {
    parts.push(`\n\n---\n\n${deckDirective}`);
  } else if (isFreeformProject && !hasSkillSeed) {
    // Freeform / kind=other projects skip the kind picker entirely and
    // land here. If the user's brief is a deck/keynote/slides ("讲解",
    // "presentation", "make a deck"), the agent used to invent its own
    // scale-to-fit + slide visibility + nav script from scratch and
    // shipped subtle CSS specificity bugs (per-slide layout classes
    // overriding `.slide { display:none }`). Inject the same framework
    // here, prefixed with a one-line conditional so the agent only
    // adopts it when the brief actually is a deck — otherwise the
    // directive is read as background reference and ignored.
    parts.push(
      `\n\n---\n\n## If this brief is a slide deck / keynote / presentation\n\nThe user did not pre-select a "Slide deck" surface, but their request may still call for one. **If — and only if — the brief reads as slides, keynote, presentation, deck, PPT, or 讲解, follow the framework below.** Otherwise ignore everything in this section and continue with the freeform output you would have written anyway.\n\n${deckDirective}`,
    );
  }

  if (isMediaSurfaceEarly) {
    parts.push(MEDIA_GENERATION_CONTRACT);
  }

  if (activeDesignSystemBody && activeDesignSystemBody.length > 0) {
    parts.push(ACTIVE_DESIGN_SYSTEM_VISUAL_DIRECTION_OVERRIDE);
  }

  return parts.join('');
}

/**
 * Top-anchored override for API/BYOK mode (streamFormat === 'plain').
 *
 * Why it sits ABOVE DISCOVERY_AND_PHILOSOPHY: that layer starts with
 * "these override anything later in this prompt" and then mandates
 * TodoWrite / Bash / Read / WebFetch on turns 2–3. In daemon mode those
 * tools exist; in API mode they don't, so the agent narrates pseudo-tool
 * markup (`<todo-list>...`, `[读取 X]`) instead of producing structured
 * `tool_use` events the UI can render — bug #313. Pinning the override
 * at the absolute top is the cleanest way to beat the discovery layer's
 * precedence without restructuring its rules.
 *
 * The override does NOT block `<artifact>` blocks — those are how the
 * web UI receives finished HTML in API mode.
 */
const TEAMVER_SLIDE_ONLY_API_DELIVERABLE_OVERRIDE = `

## Teamver slide-only API deliverable rule

When the user asks for a slide deck, presentation, PPT, pitch deck, or slide edit, do not treat a plan/outline/progress note as a valid final answer.

If the request contains enough information to proceed, your same response MUST include exactly one complete \`<artifact type="deck" identifier="deck">...</artifact>\` block. The artifact type must be \`deck\` (never \`text/html\`); the identifier MUST be \`deck\` so the file persists as \`deck.html\`. Never copy or save an attached Canvas/Drive source HTML from \`refs/...\` into the project root. The artifact body must start with \`<!doctype html>\` and end with \`</html>\`; it must be a self-contained slide deck that can be previewed immediately.

Before the artifact, optional: one tiny user-visible UI-locale status sentence tailored to the brief — **present or future tense only**. For a **new** deck: e.g. "작성 중", "making your deck". For a **follow-up edit** of an existing deck: e.g. "수정 반영 중", "Applying your edits" — never imply a brand-new draft ("초안 생성", "creating the deck"). Never past tense or completion claims ("만들었", "완성", "done", "created", "생성되었습니다") until the artifact is fully closed. Then start the artifact immediately. Artifact-only is OK for speed/tokens. Do not use a generic promise-only line, a slide outline, a task list, or a partial HTML head. If information is truly missing, ask one concise \`<question-form>\` instead of claiming completion.

### Anti-patterns that keep breaking Teamver slide runs (do NOT do these)

- ❌ Emitting the framework skeleton with the \`<!-- SLOT: slide N content -->\` HTML comments left in place. The \`<section class="slide">\` blocks MUST contain real headings, paragraphs, lists, or images — not the commented placeholders. A skeleton with unfilled comment slots is a **broken deliverable**, not a starting point the host will fill in later.
- ❌ Closing the artifact after only \`<!doctype html><html lang="en"><head>…</head></html>\` with an empty \`<body>\` (or no body at all). The body MUST include at least two \`<section class="slide">\` blocks with visible copy.
- ❌ Emitting a second \`<artifact type="deck">\` block **after** a full deck. The web UI persists the last artifact of the turn; an empty follow-up shell silently overwrites the real deck. Ship exactly one artifact per turn.
- ❌ Announcing the deck as done (\"완료\", \"완성했습니다\", \"here it is\", etc.) in the prose while the artifact body is empty or shell-only. If you cannot finish the deck this turn, say so plainly instead — a partial artifact + confident prose is the worst outcome for the user.

**Minimum body contract:** each \`<section class="slide">\` MUST contain at least one real text node whose \`textContent.trim()\` is non-empty and is NOT the SLOT comment. If your response ends without meeting this bar, retry inside the same turn instead of emitting.

### Existing-deck edits (overrides the "complete deck" pressure above)

When the user message includes \`[Existing deck edit]\` and/or \`[Attached image embed]\` (or attaches the current \`deck.html\`):

- The preferred final answer is a non-empty \`<artifact type="deck-patch">\` or \`<artifact type="element-patch">\` that changes only the requested slide/element.
- Emitting a full \`<artifact type="deck">\` that drops slides from the attached on-disk deck (e.g. rewriting an 8-slide deck as 2 slides) is a **critical failure**.
- Do NOT treat the compact 2-slide wireframe example as a literal template for edit turns — preserve the attached deck's slide count and content.
`;

const TEAMVER_API_DECK_FRAMEWORK_OVERRIDE = `

## Teamver API — deck framework emission override (overrides daemon workflow above)

The deck framework workflow above assumes TodoWrite and filesystem copies. **In this API run, override it:**

- Stream promptly: optional tiny status sentence, then open \`<artifact type="deck">\` early and write filled slides. Do **not** wait until a private full draft is finished before opening the artifact.
- Still close \`</html></artifact>\` in this same turn — truncated head-only shells are always rejected.
- Do NOT paste the long canonical skeleton / scale-to-fit JS / print CSS. Prefer visible \`<body><section class="slide">...\` content first. A short body \`<style>\` / font \`@import\` is OK when a Selected deck template kit requires fonts/tokens.
- Your response should contain exactly ONE \`<artifact type="deck" identifier="deck">...</artifact>\` block with every \`<section class="slide">\` filled with real copy (never \`<!-- SLOT: ... -->\` placeholders).
- Never start a Teamver deck with \`<artifact type="text/html"\`.
`;

/** Teamver slide-only skip-discovery: no site-ref exception (that fights DIRECT_STREAMING). */
const SKIP_DISCOVERY_BRIEF_OVERRIDE_TEAMVER_SLIDE = `# Automated project mode — skip discovery form

This project was created with \`skipDiscoveryBrief: true\` (Canvas → Slide / Drive → Slide / automated brief). Override discovery rules: do NOT emit \`<question-form id="discovery">\`, do NOT show "Quick brief — 30 seconds", and do NOT ask a first-turn clarification form. Do not emit any question form or choice card, and do not wait for user input. Treat the user's first message, Plugin inputs (including slideCount / audience / tone), Quick settings, and project metadata as the brief; choose reasonable defaults for any remaining gaps; then emit the deck artifact in this same turn.`;

const TEAMVER_API_SKILL_SEED_OVERRIDE = `

## Teamver API — skill seed override (read last — beats Active skill Pre-flight)

The active skill mentions \`assets/template.html\`. **In this API run that file is not readable** (no Read/Bash tools). Ignore every instruction to copy, Read, or paste the seed template verbatim.

Instead: take only the skill's visual intent (palette, type scale, layout names) from the skill body text, then emit the compact filled HTML deck from the API compact contract above. ${COMPACT_DECK_SLIDE_COUNT_GUIDANCE} Never leave \`<!-- SLOT -->\` placeholders. Do not start by writing a \`<head>\` block; start the visible \`<body><section class="slide">\` content immediately.
`;

const API_MODE_OVERRIDE = (options: { teamverSlideOnly?: boolean } = {}) => `# API mode — no tools available (read first — overrides every rule below)

You are running through a plain Messages API. **No tools are wired through to you.** \`TodoWrite\`, \`Read\`, \`Write\`, \`Edit\`, \`Bash\`, and \`WebFetch\` are unavailable — calls to them will not execute and will not render in the UI.

Every later instruction in this prompt that tells you to "call TodoWrite", "run Bash", "read via Read", or otherwise invoke a tool is describing the daemon-mode workflow. In this API run those instructions are **overridden** — do not attempt them and do not pretend you did.

**Forbidden output:**
- Pseudo-tool markup such as \`<todo-list>...</todo-list>\`, \`<tool-call>\`, or invented XML wrappers around a plan.
- Fake-protocol prose such as \`[读取 template.html ...]\`, \`[读取 layouts.md ...]\`, \`[正在调用 TodoWrite ...]\`, or any \`[doing X]\` placeholder narrating a tool you cannot run.
- Statements like "I'll call TodoWrite to track this" or "let me read the skill file first" — there is no TodoWrite and no Read in this run.

**Allowed output:**
- Plain chat prose to the user (in their language). State your plan as prose — a short numbered list in markdown is fine; it just must not be wrapped in \`<todo-list>\` or claim to be a tool call.
- A final \`<artifact type="deck">...</artifact>\` block containing a complete \`<!doctype html>\` document when the brief is ready to deliver.
- \`<question-form>\` blocks for discovery (turn 1) and for mid-conversation clarification, exactly as the rules below describe — question-form is markup the UI parses, not a tool call.
- \`<web-fetch-context>\` is fetched URL text; use it, don't say URL inaccessible.

For slide deck / presentation / PPT requests in API mode, the plan is not the deliverable. Do not stop after an outline, promise, or "I'll make it" message. If enough information is present to proceed, include the complete HTML deck artifact in this same response.

If the rules below tell you to plan with TodoWrite, write the plan as prose instead. If they tell you to read skill side files before writing, describe in one sentence which patterns/conventions you're going to apply and proceed. If they tell you to run brand-spec extraction via Bash + Read + WebFetch, ask the user the missing brand questions in the discovery form instead.${options.teamverSlideOnly ? TEAMVER_SLIDE_ONLY_API_DELIVERABLE_OVERRIDE : ''}`;

const BYOK_TOOLS_OVERRIDE = (
  toolNames: readonly string[],
  options: { teamverSlideOnly?: boolean } = {},
): string => {
  const formatted = toolNames.map((n) => `\`${n}\``).join(', ');
  return `# API mode — BYOK tools available (read first — overrides every rule below)

You are running through the Open Design BYOK proxy. The following tools ARE wired through to you: ${formatted}. Call them like any other tool — the daemon routes the call, runs the executor, and feeds the result back as a \`tool\` role message.

\`TodoWrite\`, \`Read\`, \`Write\`, \`Edit\`, \`Bash\`, and \`WebFetch\` are NOT available in this run — those are CLI-agent tools. If a later instruction tells you to call them, do not attempt it; use the BYOK tools listed above instead. Specifically: to read a URL the user gave you, call \`web_fetch\` with the absolute URL — do not claim you fetched it, do not narrate the fetch in prose, and do not produce pseudo-tool markup.

**Forbidden output:**
- Pseudo-tool markup such as \`<todo-list>...</todo-list>\`, \`<tool-call>\`, or invented XML wrappers around a plan.
- Fake-protocol prose such as \`[读取 template.html ...]\`, \`[读取 layouts.md ...]\`, \`[正在调用 TodoWrite ...]\`, or any \`[doing X]\` placeholder narrating a tool you cannot run.
- Statements like "I can't read URLs" or "I cannot access the web" — the \`web_fetch\` tool above CAN, when the user gives you a public http(s) URL.

**Allowed output:**
- Plain chat prose to the user (in their language). State your plan as prose — a short numbered list in markdown is fine; it just must not be wrapped in \`<todo-list>\` or claim to be a tool call.
- Real tool calls to the functions listed above (e.g. \`web_fetch\`, \`generate_image\`).
- A final \`<artifact type="deck">...</artifact>\` block containing a complete \`<!doctype html>\` document when the brief is ready to deliver.
- \`<question-form>\` blocks for discovery (turn 1) and for mid-conversation clarification, exactly as the rules below describe — question-form is markup the UI parses, not a tool call.
- \`<web-fetch-context>\` is fetched URL text; use it, don't say URL inaccessible.

For slide deck / presentation / PPT requests in API mode, the plan is not the deliverable. Do not stop after an outline, promise, or "I'll make it" message. If enough information is present to proceed, include the complete HTML deck artifact in this same response.${options.teamverSlideOnly ? TEAMVER_SLIDE_ONLY_API_DELIVERABLE_OVERRIDE : ''}`;
};

const CHAT_MODE_OVERRIDE = `# Chat mode — standard conversation (read first — overrides every rule below)

This conversation is in Open Design Chat mode. Open Design is the open-source Claude Design alternative and a native Figma counterpart. Official links: GitHub https://github.com/nexu-io/open-design, website https://open-design.ai/, Discord https://discord.com/invite/9ptkbbqRu.

Use the same available context, files, attachments, connectors, MCP servers, project memory, and model capabilities as Design mode. The difference is behavior: answer like a fast, direct, multi-turn desktop chat assistant. Prefer concise prose, explanations, comparisons, debugging help, and follow-up questions only when needed.

Override artifact-first discovery rules below: do not emit a default discovery \`<question-form>\`, do not call TodoWrite just to plan a chat answer, and do not create or edit project files, HTML, PPT, slide decks, images, video, or audio unless the user explicitly asks you to generate/build/design/export/modify something. When the user does ask for a design artifact or file change, you may use the normal Open Design agent workflow and the same tools/capabilities available in Design mode.`;

function renderMetadataBlock(
  metadata: ProjectMetadata | undefined,
  template: ProjectTemplate | undefined,
  audioVoiceOptions: AudioVoiceOption[] | undefined,
  audioVoiceOptionsError: string | undefined,
  options: { skipDiscoveryBrief?: boolean } = {},
): string {
  if (!metadata) return '';
  const lines: string[] = [];
  const skipDiscoveryBrief = options.skipDiscoveryBrief === true;
  lines.push('\n\n## Project metadata');
  if (skipDiscoveryBrief) {
    lines.push(
      'These are the structured choices the user made (or skipped) when creating this project. Treat known fields as authoritative; for unknown fields, choose reasonable defaults and proceed without asking a discovery form.',
    );
  } else {
    lines.push(
      'These are the structured choices the user made (or skipped) when creating this project. Treat known fields as authoritative; for any field marked "(unknown — ask)" you MUST include a matching question in your turn-1 discovery form.',
    );
  }
  lines.push('');
  lines.push(`- **kind**: ${metadata.kind}`);
  if (metadata.platform) {
    lines.push(`- **platform**: ${metadata.platform}`);
  } else if (metadata.kind === 'prototype' || metadata.kind === 'template' || metadata.kind === 'other') {
    lines.push('- **platform**: (unknown — ask: responsive web, desktop web, iOS app, Android app, tablet app, or desktop app?)');
  }
  if (metadata.platformTargets && metadata.platformTargets.length > 0) {
    lines.push(`- **platformTargets**: ${metadata.platformTargets.join(', ')}`);
  }
  if (metadata.platform === 'responsive' || metadata.platformTargets?.includes('responsive')) {
    lines.push(
      '- **responsive web contract**: `responsive` means one web product experience that adapts across modern browser/device ranges, not only legacy desktop/tablet/mobile buckets. It is not an iOS app, Android app, or native tablet app target. Show responsive behavior through real product layout changes; do not render viewport labels as user-facing product content. Cover 2025–2026 breakpoints: mobile compact 360px, mobile standard 390–430px, foldable/small tablet 600–744px, tablet portrait 768–834px, tablet landscape/large tablet 1024–1180px, laptop 1280–1366px, desktop 1440–1536px, and wide 1920px. Use fluid `clamp()` scales, container queries where useful, and explicit layout changes at semantic thresholds. Verify no horizontal scroll at 360px, 390px, 430px, 768px, 820px, 1024px, 1366px, 1440px, and 1920px unless the brief explicitly asks for a pan/board canvas.',
    );
  }
  if ((metadata.platformTargets?.length ?? 0) > 1) {
    lines.push(
      '- **cross-platform deliverable rule**: each selected target keeps the same product goal but MUST be delivered as its own product screen/file when more than one concrete target is selected. Use clear files such as `landing.html` (if enabled), `mobile-ios.html`, `mobile-android.html`, `tablet.html`, `desktop.html`, plus shared `css/` and `js/` when useful. `index.html` may be a launcher/overview that links to these files, but it must not be the only place where mobile/tablet/desktop designs live. Do not collapse cross-platform work into a single tabbed demo, selector UI, comparison board, platform map, or labelled documentation section inside one mock product page.',
    );
  }
  if (metadata.kind === 'prototype' || metadata.kind === 'template' || metadata.kind === 'other') {
    lines.push(
      '- **screen-file-first rule**: each distinct user-facing screen or surface MUST be delivered as its own HTML file unless the user explicitly asks for a single-page scroll or single-file artifact. Do not combine landing pages, product app screens, dashboards, history, pricing, settings, mobile app, tablet app, desktop app, or OS widget surfaces into one long page. Use `index.html` as a launcher/overview that links to screen files when more than one screen exists; it may summarize the product and show screen cards, but it must not contain the full design for every screen.',
    );
    lines.push(
      '- **product-realism rule**: final artifacts must look like real end-user product UI. Do not render project metadata, screen counts, target counts, state counts, "demo only" labels, "settings" panels for choosing platforms, "full design target" badges, viewport/device selector controls, theme/style knobs, platform output maps, behavior-spec sections, or design-process cards inside the product unless the user explicitly asks for a design spec/dashboard. Any navigation/tabs inside the artifact must be real product navigation, not designer controls for switching generated mockups.',
    );
    lines.push(
      '- **visual-system rule**: when the user does not specify colors, layout, or visual direction, you must still make an intentional product-appropriate visual system. Infer a palette from the product category and audience with at least: neutral surface tokens, a primary action color, a secondary/domain accent, and status colors. Avoid plain monochrome/unstyled greyscale outputs. Use tasteful gradients, illustrations, iconography, device/product mockups, and colored state moments where they clarify the product, while still avoiding generic beige/peach/pink/brown AI washes.',
    );
    lines.push(
      '- **app-specific modules rule**: include domain-specific in-app modules/components by default (cards, panels, controls, charts, lists, quick actions, status modules, mini players, checkout/cart summaries, etc. as appropriate). These are product UI modules, not OS home-screen widgets. Give each major module a clear purpose, states, and responsive behavior instead of generic card grids.',
    );
    lines.push(
      '- **CJX-ready UX rule**: the artifact must be implementation-ready, not a static screenshot. Structure CSS tokens/components/responsive sections clearly; include real JavaScript behavior for meaningful UX such as tabs, dialogs, drawers, filters, generation/copy actions, validation, playback controls, or state transitions. If keeping a self-contained `index.html`, put the CSS/JS in clearly labelled blocks; for complex UX, generate `css/` and `js/` files when useful.',
    );
    lines.push(
      '- **interaction-fidelity rule**: when the requested screen includes user input, generation, copying, validation, login, checkout, filtering, or any action verb, build real interactive controls for that screen. Do not substitute static text rows, prefilled-only mockups, screenshot-like device frames, or decorative state cards for editable inputs and working actions.',
    );
  }
  if (metadata.includeLandingPage) {
    lines.push(
      '- **includeLandingPage**: true — create `landing.html` as a separate responsive marketing companion surface in addition to the selected product/app screens. Do not implement the landing page only as a section inside `index.html`, even for responsive-web-only projects. If there is a working product/app screen, create it as a separate file such as `app.html`, `dashboard.html`, or a domain-specific screen name. `index.html` should be a lightweight launcher/overview when multiple files exist. Include hero, value props, product screenshots/device mockups, proof/features, and an appropriate CTA such as waitlist, download, or contact sales.',
    );
  }
  if (metadata.includeOsWidgets) {
    lines.push(
      '- **includeOsWidgets**: true — add platform-native OS home-screen / lock-screen / quick-access widget surfaces where relevant. These are outside-the-app widgets (for example iOS WidgetKit, Android home screen widget, Live Activity/lock screen, tablet glance panel), not in-app cards. Include realistic widget sizes and direct quick actions for the domain.',
    );
  }
  if (metadata.intent === 'live-artifact') {
    lines.push(
      '- **intent**: live-artifact — the user chose New live artifact. The first output should be a live artifact/dashboard/report, not a one-off static mockup. Prefer the `live-artifact` skill workflow when available, keep source data compact, and register through the daemon live-artifact tool path once that wrapper/tooling is available.',
    );
    lines.push(
      '- **connector-source rule**: if the user names a connector/source (for example Notion) and daemon connector tools are available, list connectors before asking where the data comes from. When the named connector is `connected`, use its read-only tools and ask follow-up questions only for missing topic/page/database details, multiple equally plausible matches, or an unconnected/missing connector.',
    );
  }

  if (metadata.kind === 'prototype') {
    lines.push(
      `- **fidelity**: ${metadata.fidelity ?? '(unknown — ask: wireframe vs high-fidelity)'}`,
    );
  }
  if (metadata.kind === 'deck') {
    lines.push(
      `- **slideCount**: ${metadata.slideCount ?? (skipDiscoveryBrief ? '(unknown — use 6-8 slides only if no Plugin inputs / user brief specifies a count)' : '(unknown — ask only if the Active plugin / Plugin inputs block does not already include slideCount)')}`,
    );
    lines.push(
      `- **speakerNotes**: ${typeof metadata.speakerNotes === 'boolean' ? metadata.speakerNotes : (skipDiscoveryBrief ? '(unknown — omit unless requested)' : '(unknown — ask: include speaker notes?)')}`,
    );
  }
  if (metadata.kind === 'template') {
    lines.push(
      `- **animations**: ${typeof metadata.animations === 'boolean' ? metadata.animations : '(unknown — ask: include motion/animations?)'}`,
    );
    if (metadata.templateLabel) {
      lines.push(`- **template**: ${metadata.templateLabel}`);
    }
  }
  if (metadata.kind === 'image') {
    lines.push(
      `- **imageModel**: ${metadata.imageModel ?? '(unknown - ask: which image model to use)'}`,
    );
    lines.push(
      `- **aspectRatio**: ${metadata.imageAspect ?? '(unknown - ask: 1:1, 16:9, 9:16, 4:3, 3:4)'}`,
    );
    if (metadata.imageStyle) {
      lines.push(`- **styleNotes**: ${metadata.imageStyle}`);
    }
    if (metadata.promptTemplate && metadata.promptTemplate.prompt.trim().length > 0) {
      lines.push(`- **referenceTemplate**: ${metadata.promptTemplate.title}`);
    }
    lines.push('');
    lines.push(
      'This is an **image** project. Plan the prompt carefully, then dispatch via the **media generation contract** using `"$OD_NODE_BIN" "$OD_BIN" media generate --surface image --model <imageModel>`. Do NOT emit `<artifact>` HTML for media surfaces.',
    );
  }
  if (metadata.kind === 'video') {
    lines.push(
      `- **videoModel**: ${metadata.videoModel ?? '(unknown - ask: which video model to use)'}`,
    );
    lines.push(
      `- **lengthSeconds**: ${typeof metadata.videoLength === 'number' ? metadata.videoLength : '(unknown - ask: 3s / 5s / 10s)'}`,
    );
    lines.push(
      `- **aspectRatio**: ${metadata.videoAspect ?? '(unknown - ask: 16:9, 9:16, 1:1)'}`,
    );
    if (metadata.promptTemplate && metadata.promptTemplate.prompt.trim().length > 0) {
      lines.push(`- **referenceTemplate**: ${metadata.promptTemplate.title}`);
    }
    lines.push('');
    lines.push(
      'This is a **video** project. Plan the shotlist and motion, then dispatch via the **media generation contract** using `"$OD_NODE_BIN" "$OD_BIN" media generate --surface video --model <videoModel> --length <seconds> --aspect <ratio>`. Do NOT emit `<artifact>` HTML.',
    );
    if (metadata.videoModel === 'hyperframes-html') {
      lines.push(
        'Special case: `hyperframes-html` is a local HTML-to-MP4 renderer, not a photoreal text-to-video model. Treat it like a motion design renderer, ask at most one clarifying question, then dispatch immediately.',
      );
    }
  }
  if (metadata.kind === 'audio') {
    lines.push(
      `- **audioKind**: ${metadata.audioKind ?? '(unknown - ask: music / speech / sfx)'}`,
    );
    lines.push(
      `- **audioModel**: ${metadata.audioModel ?? '(unknown - ask: which audio model to use)'}`,
    );
    lines.push(
      `- **durationSeconds**: ${typeof metadata.audioDuration === 'number' ? metadata.audioDuration : '(unknown - ask: target duration)'}`,
    );
    if (metadata.voice) {
      lines.push(`- **voice**: ${metadata.voice}`);
    } else if (metadata.audioKind === 'speech') {
      lines.push('- **voice**: (unknown - ask: voice id / accent / pacing)');
    }
    const voiceOptions = shouldRenderElevenLabsVoiceOptions(metadata, audioVoiceOptions)
      ? audioVoiceOptions ?? []
      : [];
    if (voiceOptions.length > 0) {
      lines.push(
        '- **ElevenLabs voice options**: Ask the user to choose from a dropdown select. The visible labels are voice descriptions; the selected value must be the exact `voice_id` passed to `--voice`. Do not ask the user to type an id.',
      );
      if (voiceOptions.length > ELEVENLABS_VOICE_PROMPT_OPTION_LIMIT) {
        lines.push(`- **ElevenLabs voice options**: showing the first ${ELEVENLABS_VOICE_PROMPT_OPTION_LIMIT} of ${voiceOptions.length} available voices.`);
      }
      lines.push('');
      lines.push('<question-form id="elevenlabs-voice" title="Choose an ElevenLabs voice">');
      lines.push(JSON.stringify(renderElevenLabsVoiceQuestionForm(voiceOptions), null, 2));
      lines.push('</question-form>');
    } else {
      const audioVoiceOptionsPromptError = formatElevenLabsVoiceOptionsErrorForPrompt(audioVoiceOptionsError);
      if (audioVoiceOptionsPromptError) {
        lines.push(
          `- **ElevenLabs voice options**: ${audioVoiceOptionsPromptError}`,
        );
      }
    }
    if (metadata.audioKind === 'sfx') {
      lines.push(
        '- **SFX discovery**: Ask about the sound source/action, materials, intensity, acoustic space, timing/tail, loop/non-loop, and "avoid" constraints. Do not ask for language or voice for SFX.',
      );
    }
    lines.push('');
    lines.push(
      'This is an **audio** project. Lock the content intent first, then dispatch via the **media generation contract** using `"$OD_NODE_BIN" "$OD_BIN" media generate --surface audio --audio-kind <kind> --model <audioModel> --duration <seconds>` and add `--voice <voice-id>` for speech when you have a provider-specific voice id. Do NOT emit `<artifact>` HTML.',
    );
  }

  if (metadata.inspirationDesignSystemIds && metadata.inspirationDesignSystemIds.length > 0) {
    lines.push(
      `- **inspirationDesignSystemIds**: ${metadata.inspirationDesignSystemIds.join(', ')} — the user picked these systems as *additional* inspiration alongside the primary one. Borrow palette accents, typographic personality, or component patterns from them; don't replace the primary system's tokens.`,
    );
  }

  if (Array.isArray(metadata.contextPlugins) && metadata.contextPlugins.length > 0) {
    lines.push('');
    lines.push('### @ plugin context');
    lines.push(
      'The user selected these plugins as additive context via @ mentions. Treat them as requested references to combine with the brief; only the explicit active plugin block, if present, is the executable/pinned plugin snapshot.',
    );
    for (const plugin of metadata.contextPlugins) {
      const id = typeof plugin.id === 'string' ? plugin.id : '';
      const title = typeof plugin.title === 'string' && plugin.title.trim().length > 0
        ? plugin.title.trim()
        : id;
      if (!id && !title) continue;
      const description = typeof plugin.description === 'string' && plugin.description.trim().length > 0
        ? ` — ${plugin.description.trim()}`
        : '';
      lines.push(`- ${title}${id ? ` (\`${id}\`)` : ''}${description}`);
    }
  }

  // Curated prompt template reference for image/video projects. Inlined
  // verbatim (with light truncation) so the agent can borrow structure,
  // mood and phrasing without a separate fetch. The user may have edited
  // the body before clicking Create — those edits land here and are now
  // authoritative for the brief.
  if (
    (metadata.kind === 'image' || metadata.kind === 'video') &&
    metadata.promptTemplate &&
    metadata.promptTemplate.prompt.trim().length > 0
  ) {
    const tpl = metadata.promptTemplate;
    lines.push('');
    lines.push(`### Reference prompt template — "${tpl.title}"`);
    const meta: string[] = [];
    if (tpl.category) meta.push(`category: ${tpl.category}`);
    if (tpl.model) meta.push(`suggested model: ${tpl.model}`);
    if (tpl.aspect) meta.push(`aspect: ${tpl.aspect}`);
    if (tpl.tags && tpl.tags.length > 0) {
      meta.push(`tags: ${tpl.tags.join(', ')}`);
    }
    if (meta.length > 0) lines.push(meta.join(' · '));
    if (tpl.summary) {
      lines.push('');
      lines.push(tpl.summary);
    }
    lines.push('');
    lines.push(
      'The user picked this template as inspiration. Treat it as a structural and stylistic reference: borrow composition, palette cues, lighting language, lens/motion direction, and the level of detail. Adapt the wording to the user\'s actual subject and brief — do NOT generate the template subject verbatim. If a field above is unknown the user wants you to follow the template\'s defaults.',
    );
    // Escape triple-backticks so a user who pastes ``` into the editable
    // template body can't break out of the markdown fence below and inject
    // free-form instructions into the agent's system prompt. Zero-width
    // joiner between the backticks keeps the prompt human-readable while
    // preventing the closing fence from matching prematurely.
    const safe = tpl.prompt.replace(/```/g, '`\u200b`\u200b`');
    const truncated =
      safe.length > 4000
        ? `${safe.slice(0, 4000)}\n… (truncated ${safe.length - 4000} chars)`
        : safe;
    lines.push('');
    lines.push('```text');
    lines.push(truncated);
    lines.push('```');
    if (tpl.source) {
      const author = tpl.source.author ? ` by ${tpl.source.author}` : '';
      lines.push('');
      lines.push(
        `Source: ${tpl.source.repo}${author} — license ${tpl.source.license}. Preserve attribution if you echo the template language directly.`,
      );
    }
  }

  if (metadata.kind === 'template' && template && template.files.length > 0) {
    lines.push('');
    lines.push(
      `### Template reference — "${template.name}"${template.description ? ` (${template.description})` : ''}`,
    );
    lines.push(
      'These HTML snapshots are what the user wants to start FROM. Read them as a stylistic + structural reference. You may copy structure, palette, typography, and component patterns; you may adapt them to the new brief; do NOT ship them verbatim. The agent should still produce its own artifact, just one that visibly inherits this template\'s design language.',
    );
    for (const f of template.files) {
      // Cap each file at ~12k chars so a giant template doesn't blow out
      // the system prompt budget. The agent gets enough to read structure.
      const truncated =
        f.content.length > 12000
          ? `${f.content.slice(0, 12000)}\n<!-- … truncated (${f.content.length - 12000} chars omitted) -->`
          : f.content;
      lines.push('');
      lines.push(`#### \`${f.name}\``);
      lines.push('```html');
      lines.push(truncated);
      lines.push('```');
    }
  }

  return lines.join('\n');
}

function shouldRenderElevenLabsVoiceOptions(
  metadata: ProjectMetadata,
  audioVoiceOptions: AudioVoiceOption[] | undefined,
): boolean {
  return metadata.kind === 'audio'
    && metadata.audioKind === 'speech'
    && metadata.audioModel === 'elevenlabs-v3'
    && !metadata.voice
    && Array.isArray(audioVoiceOptions)
    && audioVoiceOptions.length > 0;
}

function renderElevenLabsVoiceQuestionForm(voiceOptions: AudioVoiceOption[]): {
  description: string;
  questions: Array<{
    id: string;
    label: string;
    type: 'select';
    required: boolean;
    placeholder: string;
    help: string;
    options: Array<{ label: string; value: string }>;
  }>;
  submitLabel: string;
} {
  const options = voiceOptions.slice(0, ELEVENLABS_VOICE_PROMPT_OPTION_LIMIT).map((option) => ({
    label: formatElevenLabsVoiceLabel(option),
    value: option.voiceId,
  }));
  return {
    description:
      'Pick a voice by description. The selected answer will be the exact voice_id passed to the renderer.',
    questions: [
      {
        id: 'voice',
        label: 'Voice',
        type: 'select',
        required: true,
        placeholder: 'Choose a voice',
        help: 'Select a voice description; the answer submits the matching Voice ID.',
        options,
      },
    ],
    submitLabel: 'Use voice',
  };
}

function formatElevenLabsVoiceLabel(option: AudioVoiceOption): string {
  const labels = option.labels && typeof option.labels === 'object'
    ? Object.values(option.labels)
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    : [];
  const bits = [...labels];
  if (bits.length > 0) return `${option.name} — ${bits.join(' · ')}`;
  const category = typeof option.category === 'string' ? option.category.trim() : '';
  return category ? `${option.name} — ${category}` : option.name;
}

/**
 * Detect the seed/references pattern shipped by the upgraded
 * web-prototype / mobile-app / simple-deck / guizang-ppt skills, and
 * inject a hard pre-flight rule that lists which side files to Read
 * before doing anything else. The skill body's own workflow already says
 * this — but skills get truncated under context pressure and the agent
 * sometimes skips Step 0. A short up-front directive helps.
 *
 * Returns an empty string when the skill ships no side files (legacy
 * SKILL.md-only skills) so we don't add noise.
 */
function derivePreflight(skillBody: string): string {
  const refs: string[] = [];
  if (/assets\/template\.html/.test(skillBody)) refs.push('`assets/template.html`');
  if (/references\/layouts\.md/.test(skillBody)) refs.push('`references/layouts.md`');
  if (/references\/themes\.md/.test(skillBody)) refs.push('`references/themes.md`');
  if (/references\/components\.md/.test(skillBody)) refs.push('`references/components.md`');
  if (/references\/checklist\.md/.test(skillBody)) refs.push('`references/checklist.md`');
  if (/references\/artifact-schema\.md/.test(skillBody)) refs.push('`references/artifact-schema.md`');
  if (/references\/connector-policy\.md|connector-policy\.md/.test(skillBody)) {
    refs.push('`references/connector-policy.md`');
  }
  if (/references\/refresh-contract\.md|refresh-contract\.md/.test(skillBody)) {
    refs.push('`references/refresh-contract.md`');
  }
  if (/references\/html-in-canvas\.md|html-in-canvas\.md/.test(skillBody)) {
    refs.push('`references/html-in-canvas.md`');
  }
  if (refs.length === 0) return '';
  return ` **Pre-flight (do this before any other tool):** Read ${refs.join(', ')} via the path written in the skill-root preamble. If the skill asks for daemon wrapper commands, use the runtime tool environment documented below; it provides the daemon URL and whether a run-scoped tool token is available without exposing token internals. The seed template defines the class system you'll paste into; the layouts file is the only acceptable source of section/screen/slide skeletons; the checklist and live-artifact references are your validation gate before emitting \`<artifact>\` or registering a live artifact. Skipping this step is the #1 reason output regresses to generic AI-slop.`;
}

/**
 * API/BYOK counterpart to {@link derivePreflight}. Never tells the model to
 * Read seed files — those tools are unavailable and the instruction alone
 * triggers skeleton-paste truncation.
 */
function deriveApiModePreflight(skillBody: string): string {
  if (!/assets\/template\.html|references\/layouts\.md/.test(skillBody)) return '';
  return (
    ' **API-mode pre-flight (overrides the skill\'s Read/copy workflow):** '
    + 'Do NOT Read or paste `assets/template.html` / `references/layouts.md` — '
    + 'no filesystem tools are available in this run. Infer layout intent from '
    + 'the skill body text only, then emit ONE compact filled HTML deck artifact '
    + 'in this same response (' + COMPACT_DECK_SLIDE_COUNT_GUIDANCE.toLowerCase() + ', real copy in every '
    + '`<section class="slide">`, no SLOT comments, no verbatim skeleton paste, '
    + 'no `<head>`/`<style>`-first output).'
  );
}

/**
 * Teamver API slide runs cannot read skill seed files. Passing the raw skill
 * body still leaves "copy assets/template.html" / SLOT workflow instructions
 * in the prompt, which pulls Claude into writing a large head/style skeleton
 * and truncating before body slides. Keep only a tiny visual-intent summary.
 */
function summarizeApiModeSkillBody(skillBody: string): string {
  const workflowLine =
    /assets\/template\.html|references\/layouts\.md|SLOT|(?:^|\s)(?:copy|paste|read)\b|复制|粘贴|读取/i;
  const lines = skillBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !workflowLine.test(line));
  const layoutPriority = (line: string) =>
    /layout|theme rhythm|light|dark|hero|cover|stat|pipeline|quote|closing|typography|type|font|palette|color|accent|density|spacing|grid|editorial|terminal|cyber|paper|serif|mono|eyebrow/i.test(
      line,
    );
  const prioritized = [
    ...lines.filter(layoutPriority),
    ...lines.filter((line) => !layoutPriority(line)),
  ].slice(0, 18);
  const summary = prioritized.join('\n');
  const layoutHint = /references\/layouts\.md|layout vocabulary|slide layouts/i.test(skillBody)
    ? 'The skill ships layout patterns in references/layouts.md — you cannot Read that file in API mode. Use the compact inline layout vocabulary from the deck contract instead (cover, body, big-stat, split thesis, timeline, quote, three-column, closing).'
    : '';
  return [
    'API-safe skill summary only. Ignore the seed/template copy workflow.',
    layoutHint,
    summary || 'Use the active deck skill only as broad visual inspiration.',
    'Template is the visual contract; compact samples are only structure.',
    'Alternate light/dark; never repeat one background/composition 3+ slides.',
    'Preserve the selected template palette, type mood, density, accents, and rhythm visibly (design system is secondary brand context only).',
    'Implement with inline styles or one short body `<style>` after slide 1; never start with `<head>` or long CSS.',
    'Build a slide arc: cover, 4–6 varied evidence/story slides, closing; avoid generic title-plus-bullets.',
    'Output compact no-head deck HTML with varied inline layouts and visible content first.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Final authority for Teamver slide-only API runs. Resolves the historical
 * conflict between "artifact last" (daemon charter), "start artifact ASAP"
 * (compact deck), and "never open until complete" (deliverable override).
 */
const TEAMVER_SLIDE_API_UNIFIED_STREAMING_RULE = `# Teamver slide-only API — unified streaming rule (READ LAST — beats every rule above)

**Turn 1 (first user message, no prior form answers):** emit a UI-locale quick-brief \`<question-form id="discovery">\` JSON block only. No HTML artifact on turn 1.

**Turn 2+ (after \`[form answers — discovery]\` or a follow-up edit request):** your successful response is optional tiny UI-locale status sentence + **exactly one** streaming artifact. Artifact-only is OK for speed/tokens.

- **First deck after discovery:** \`<artifact type="deck" identifier="deck">…</artifact>\` with status like "작성 중" / "making your deck".
- **Follow-up edit of an existing deck** (user asks to change slides that already exist, with or without preview comments): prefer \`element-patch\` / \`deck-patch\` when scope is clear; if you must emit full \`type="deck"\`, status must be edit-toned ("수정 반영 중" / "Applying your edits") — never "초안이 생성", "creating the deck", or "draft is ready".

\`<artifact type="deck" identifier="deck"><!doctype html><html lang="ko"><body>…6+ filled <section class="slide"> blocks…</body></html></artifact>\`

**How to stream the deck (non-negotiable on turn 2+):**
1. Emit the status sentence first, then open the artifact early. Never \`type="text/html"\`.
2. First bytes inside a full deck artifact: \`<!doctype html><html><body>\` then either a short kit \`<style>\`/\`@import\` (Selected template fonts only) or \`<section class="slide">\` with real copy — never an empty shell or long \`<head>\` chrome.
3. ${COMPACT_DECK_SLIDE_COUNT_GUIDANCE} Write one filled \`<section class="slide">\` per requested slide. If a Selected deck template is active, match its visual kit (palette/fonts/density) with inline styles or one short body \`<style>\` after slide 1 — design system is brand context only and must not override the template look; do not merely describe the template.
4. Close with \`</body></html></artifact>\` (or the matching patch close) in this same turn.

**Forbidden on deck turns:** outlines, plans, TodoWrite, \`[读取 template.html]\`, SLOT comments, a second artifact, stopping after \`<head>\`, announcing a brand-new draft on an edit turn, or announcing completion without the requested slide count (minimum 6 when unspecified).

If you already started \`<head>\` by mistake, **abandon that output** and restart the artifact with \`<body><section class="slide">\` content immediately.`;

const TEAMVER_SLIDE_API_DISCOVERY_BINDING_RULE = `# Teamver slide-only API — bind quick-brief answers (turn 2+)

When the user's message starts with \`[form answers — discovery]\`, treat every answered field as **hard constraints** for the deck you emit in that same turn:

- **audience** — vocabulary, depth, and examples must match that audience (e.g. 신입사원 vs 경영진).
- **tone** — visual and copy style: \`professional\` = restrained palette and formal copy; \`tech_modern\` = high contrast, crisp sans, product-demo feel; \`friendly\` = warm accents and plain language.
- **scale** / **slideCount** — emit exactly the requested number of slides (parse ranges like "8~10장" or "10-15 pages" to the upper bound when a single target is needed).
- **must_include** — each requested topic gets at least one dedicated slide or clearly labeled section; do not omit user-named items.

If a field was skipped, choose a sensible default and proceed — do not emit another discovery form. Preserve the Selected deck template look (design system is secondary brand context only), and vary slide layouts per the compact inline vocabulary (split, stat, timeline, quote, column); do not output 6 identical white boxes.`;

const TEAMVER_SLIDE_API_EXISTING_DECK_IMAGE_EDIT_RULE = `# Teamver slide-only API — existing-deck image embed (READ LAST)

If the turn carries \`[Attached image embed]\` and/or \`[Existing deck edit]\` (or an attached \`deck.html\`):

**Preferred deliverable — surgical insert, NOT a full rewrite:**

\`\`\`
<artifact type="deck-patch" identifier="deck">
  <section class="slide" data-slide-index="{N}">…COPY the FULL current slide outer HTML from the attached deck, then INSERT <img src="{exact-path-from-embed-block}" alt="" style="max-width:100%;height:auto;object-fit:contain">…</section>
</artifact>
\`\`\`

Hard rules:
- **NEVER reduce** the number of \`<section class="slide">\` blocks vs the attached on-disk deck (do not turn an 8-slide deck into 2 slides).
- **NEVER** emit a greenfield 2-slide wireframe as a replacement for an existing multi-slide deck.
- Prefer \`deck-patch\` that copies the target slide HTML and inserts the image. Use \`set-image\` only when replacing an existing \`<img>\` element.
- Full \`<artifact type="deck">\` is allowed ONLY if the user explicitly asks for a redesign/new deck — and even then you MUST keep at least the same slide count as the attached deck and include every attached image with its exact \`src\` path.
- Copy \`src\` paths from \`[Attached image embed]\` character-for-character (including \`refs/drive/\` and timestamp prefixes). Never invent friendlier filenames.
- Status sentence: "수정 반영 중" / "Applying your edits" — never "초안 생성" / "creating the deck".
`;

const TEAMVER_SLIDE_API_COMMENT_EDIT_PATCH_RULE = `# Teamver slide-only API — comment-edit patch (READ LAST)

If the turn carries \`<attached-preview-comments>\`, prefer a structured element patch over a full deck rewrite:

\`<artifact type="element-patch" identifier="deck"><patch target-id="{elementId}" slide-index="{N}" kind="set-style">{"fontWeight":"700"}</patch></artifact>\`

- \`target-id\` = the comment's pinned \`elementId\` (or selector id).
- \`slide-index="{N}"\` = the comment's \`slideIndex:\` (0-based).
- \`kind\`: \`set-text\`, \`set-style\` (JSON), \`set-outer-html\`, \`set-link\`, \`set-image\`, \`set-attributes\`, \`remove-element\`.
- Interpret ANY natural-language request on the pinned element — do not ask users to rephrase or provide internal ids.
- Size / visibility / emphasis requests ("크게", "키워", "눈에 띄게", "bigger", "bold") WITHOUT changing the words: use \`kind="set-style"\` with \`fontSize\` / \`fontWeight\` / \`color\`. Keep \`currentText\` verbatim — never \`set-text\`, \`remove-element\`, or empty the element.
- Text replacement ("'새 문구'로 수정", "멘트를 …로", "change copy to …"): use \`kind="set-text"\` with the new text only.

**Non-empty element-patch is required.** If you open \`<artifact type="element-patch">\`, you MUST emit at least one \`<patch target-id="…" slide-index="…" kind="…">…body…</patch>\` block before closing \`</artifact>\`. An empty artifact wrapper is a critical failure — the client cannot recover it, and the user loses the requested edit. If you cannot express the requested change as any of the allowed \`kind\`s, switch to \`<artifact type="deck-patch">\` with a full \`<section class="slide" data-slide-index="{N}">\` replacement in this same turn.

Fallback for multi-element / slide-structure changes:

\`<artifact type="deck-patch" identifier="deck"><section class="slide" data-slide-index="{N}">…full replacement outer HTML…</section></artifact>\`

- Emit ONE artifact: element-patch OR deck-patch OR full deck, never both.
- Use full \`<artifact type="deck">\` for deck-wide/unclear scope. Never ask users for internal \`slideIndex\`.
- Status sentence on comment-edit turns: "수정 반영 중" / "Applying your edits" (present tense). Never "슬라이드 초안이 생성", "creating the deck", or "draft is ready".`;

const TEAMVER_SLIDE_API_DIRECT_STREAMING_RULE = `# Teamver slide-only API — direct deck generation rule (READ LAST — beats every rule above)

This project has \`skipDiscoveryBrief: true\` or an already-complete brief. Do NOT emit \`<question-form>\`, do NOT show "Quick brief — 30 seconds", and do NOT wait for another user message.

Your successful response is optional tiny UI-locale status sentence + **exactly one** streaming artifact in this same turn. Artifact-only is OK for speed/tokens:

\`<artifact type="deck" identifier="deck"><!doctype html><html lang="ko"><body>…6+ filled <section class="slide"> blocks…</body></html></artifact>\`

**How to stream the deck (non-negotiable):**
1. Emit the status sentence first, then open \`<artifact type="deck">\` early. Never \`type="text/html"\`.
2. First bytes inside artifact: \`<!doctype html><html><body>\` then either a short kit \`<style>\`/\`@import\` (Selected template fonts only) or \`<section class="slide">\` with real copy — never an empty shell or long \`<head>\` chrome.
3. ${COMPACT_DECK_SLIDE_COUNT_GUIDANCE} Write one filled \`<section class="slide">\` per requested slide. Prefer fixed Teamver canvas sizing on each slide: \`width:1920px;height:1080px;box-sizing:border-box;overflow:hidden\` (not viewport-only \`min-height:100vh\` typography). If a Selected deck template is active, match its visual kit (palette/fonts/density) with inline styles or one short body \`<style>\` — design system is brand context only and must not override the template look; do not merely describe the template.
4. Close with \`</body></html></artifact>\` in this same turn.

**Forbidden:** "바로 만들어 드리겠습니다" / "I'll make it" promise-only replies, question-form, outlines, plans, TodoWrite, \`[读取 template.html]\`, SLOT comments, a second artifact, stopping after \`<head>\`, announcing completion without the requested slide count (minimum 6 when unspecified), or repeating the same layout/background/composition on every slide. Preserve the Selected deck template look (design system is secondary brand context only) and vary layouts per the compact inline layout vocabulary.`;

/**
 * Final visual authority when Canvas → Slide (or equivalent) pinned a template.
 * Placed after compact + streaming rules so kit tokens beat Neutral samples.
 */
const TEAMVER_SELECTED_TEMPLATE_VISUAL_READ_LAST_WITH_KIT = `# Selected deck template visual — READ LAST (highest visual priority)

A Selected deck template is active and a **Template visual kit (from example.html)** is present. That kit is the **only** allowed palette, typography, border, shadow, and motif language.

Hard requirements for every slide:
- Bind kit hex colors, font-family names, border widths/radii, and offset shadows from the kit (inline styles or one short body \`<style>\` + optional font \`@import\`).
- Keep decorative density the kit shows (chunky cards, daisies/stars, pastel badges, etc.). Sparse title-only slides that ignore the kit are a failure.
- **Forbidden:** Neutral Modern / Starter look — slate covers \`#0f172a\` / \`#1e293b\` / \`#111827\`, Inter-only or system-ui-only typography, empty gradient corporate title slides, "no ornament" subtractive layouts from any design-system prose.

If any earlier compact wireframe sample conflicts with the kit, **ignore the sample colors** and follow the kit.`;

const TEAMVER_SELECTED_TEMPLATE_VISUAL_READ_LAST_WITHOUT_KIT = `# Selected deck template visual — READ LAST (highest visual priority)

A Selected deck template is active, but a concrete Template visual kit may be incomplete this turn.

Hard requirements for every slide:
- Match the Selected deck template **Visual summary / title / prose cues** (palette names, fonts, motif) as closely as possible.
- If any hex codes or font names appear in the Selected section, bind them with inline styles or one short body \`<style>\`.
- Do **not** invent a sparse Neutral Modern slate cover (\`#0f172a\` / Inter-only) when the template name or summary implies pastel, cream, playful, coral, terminal, editorial, etc.
- Prefer recognizable template mood over a generic corporate title slide.`;

/**
 * Lean system prompt for Teamver embed slide-only + anthropic-api / BYOK proxy.
 * Avoids discovery, BASE_SYSTEM_PROMPT artifact-handoff, and raw skill seed
 * copy workflows that cannot run without daemon tools.
 */
export function composeTeamverSlideApiPrompt({
  skillBody,
  skillName,
  designSystemBody,
  designSystemTitle,
  metadata,
  template,
  pluginBlock,
  audioVoiceOptions,
  audioVoiceOptionsError,
  locale,
  userInstructions,
  projectInstructions,
}: Pick<
  ComposeInput,
  | 'skillBody'
  | 'skillName'
  | 'designSystemBody'
  | 'designSystemTitle'
  | 'metadata'
  | 'template'
  | 'pluginBlock'
  | 'audioVoiceOptions'
  | 'audioVoiceOptionsError'
  | 'locale'
  | 'userInstructions'
  | 'projectInstructions'
>): string {
  const parts: string[] = [];
  const activeDesignSystemBody = designSystemBody?.trim();
  const directDeckGeneration =
    metadata?.skipDiscoveryBrief === true || metadata?.examplePrompt === true;

  parts.push(API_MODE_OVERRIDE({ teamverSlideOnly: true }));
  parts.push(TEAMVER_SLIDE_ONLY_SCOPE.trim());
  if (directDeckGeneration) {
    // Teamver-specific: omit Site-ref discovery exception (fights DIRECT_STREAMING).
    parts.push(SKIP_DISCOVERY_BRIEF_OVERRIDE_TEAMVER_SLIDE);
  } else {
    parts.push(TEAMVER_SLIDE_ONLY_FIRST_TURN_OVERRIDE.trim());
  }

  const localePrompt = renderTeamverSlideUiLocalePrompt(locale, {
    discoveryActive: !directDeckGeneration,
  });
  if (localePrompt) parts.push(localePrompt);

  if (userInstructions?.trim()) {
    parts.push(
      `## Custom instructions (user-level)\n\n${userInstructions.trim()}`,
    );
  }
  if (projectInstructions?.trim()) {
    parts.push(
      `## Custom instructions (project-level)\n\n${projectInstructions.trim()}`,
    );
  }
  // Selected deck template wins over Active design system for look.
  // Embed often auto-binds Neutral Modern | Starter. Even when labeled
  // SECONDARY, shipping the full DESIGN.md ("No ornament", Inter, slate)
  // still steers the model — omit the body entirely when a template is set.
  const hasTemplateVisualKit =
    /## Template visual kit \(from example\.html\)/i.test(skillBody ?? '');
  const hasTemplateVisualSummary =
    /## Visual summary \(from template frontmatter\)/i.test(skillBody ?? '');
  const hasSelectedTemplate =
    (typeof metadata?.selectedDeckTemplateId === 'string'
      && metadata.selectedDeckTemplateId.trim().length > 0)
    || hasTemplateVisualSummary
    || hasTemplateVisualKit;

  if (activeDesignSystemBody) {
    if (hasSelectedTemplate) {
      parts.push(
        `## Active design system${designSystemTitle ? ` — ${designSystemTitle}` : ''} (SECONDARY — brand context only)\n\n`
          + 'A selected deck template is the PRIMARY visual contract for this run. '
          + 'Use the design system only for optional brand names / logos / product wording. '
          + 'Do NOT replace the template palette, fonts, density, borders, decorative motif, '
          + 'or light/dark scheme with design-system tokens. '
          + 'Never turn a cheerful pastel / cream template into a dark Neutral Modern gradient.\n\n'
          + (hasTemplateVisualKit
            ? '*(Full DESIGN.md omitted on purpose — template visual kit owns colors/fonts/density.)*'
            : '*(Full DESIGN.md omitted on purpose — follow the Selected deck template Visual summary / title cues for look.)*'),
      );
    } else {
      parts.push(
        `## Active design system${designSystemTitle ? ` — ${designSystemTitle}` : ''}\n\n`
          + '**Mandatory:** bind these tokens into every slide\'s inline styles (background, text, accent, borders). Do not fall back to generic #fff/#111 when tokens exist.\n\n'
          + activeDesignSystemBody,
      );
    }
  }

  const metaBlock = renderMetadataBlock(
    metadata,
    template,
    audioVoiceOptions,
    audioVoiceOptionsError,
    { skipDiscoveryBrief: directDeckGeneration },
  );
  if (metaBlock) parts.push(metaBlock);

  if (pluginBlock?.trim()) {
    parts.push(pluginBlock.trim());
  }

  const templateVisualSignature = renderTeamverTemplateVisualSignature(template);
  if (templateVisualSignature) {
    parts.push(templateVisualSignature);
  }

  // Skip cue-extraction signature only when example.html kit is already in
  // the Selected body. On kit-miss / title-stub turns the signature is the
  // remaining palette/font cue extractor — keep it.
  if (!(hasSelectedTemplate && hasTemplateVisualKit)) {
    const skillVisualSignature = renderTeamverSkillVisualSignature(skillBody, skillName);
    if (skillVisualSignature) {
      parts.push(skillVisualSignature);
    }
  }

  if (skillBody?.trim()) {
    // Canvas → Slide with an explicitly picked template writes
    // `selectedDeckTemplateId` into metadata and the composer wraps that
    // template's SKILL.md body (with a prepended `## Visual summary` block
    // sourced from the SKILL.md frontmatter description) as the skillBody.
    // For those runs the wrap is the ONLY concrete visual contract the
    // model gets — running `summarizeApiModeSkillBody` here strips the
    // wrap header, re-orders lines by regex, and truncates to 18 lines,
    // which routinely drops the palette + typography spec. Result: the
    // deck comes back looking generic ("템플릿 적용 안 됨").
    //
    // When a selected deck template is present, emit the wrapped body
    // verbatim under a `## Selected deck template` header so the visual
    // contract survives. For runs without a picked template (default
    // scenario body only), keep the summarized path — those bodies
    // contain skeleton copy workflows that ARE noise for API mode.
    //
    // Also treat the body itself as authoritative when it already carries
    // the frontmatter visual summary / example.html visual kit: Canvas/Drive
    // confirm can `patchProject` then send on the same tick while React
    // `project.metadata` is still stale.
    if (hasSelectedTemplate) {
      const hardRequirements = hasTemplateVisualKit
        ? (
          'Hard requirements:\n'
          + '- Match the Template visual kit tokens (palette hex, fonts, borders, shadows) exactly.\n'
          + '- Keep decorative density from the template (daisies/stars/chunky cards when present) — not a sparse title slide.\n'
          + '- Active design system is secondary brand context only; template look wins.\n'
          + '- Prefer rich multi-region layouts from the template vocabulary over empty gradient covers.\n\n'
        )
        : (
          'Hard requirements:\n'
          + '- Match the Selected deck template Visual summary / title / prose cues (palette names, fonts, motif).\n'
          + '- A Template visual kit may be missing this turn — still do NOT fall back to Neutral Modern slate `#0f172a` / Inter-only covers when the template implies pastel, cream, playful, coral, terminal, etc.\n'
          + '- Active design system is secondary brand context only; template look wins.\n'
          + '- Prefer rich multi-region layouts over empty gradient covers.\n\n'
        );
      parts.push(
        `## Selected deck template${skillName ? ` — ${skillName}` : ''} — MUST MATCH THIS VISUAL SPEC\n\n`
          + hardRequirements
          + skillBody.trim(),
      );
    } else {
      parts.push(
        `## Visual style reference${skillName ? ` — ${skillName}` : ''}\n\n`
          + summarizeApiModeSkillBody(skillBody),
      );
    }
  }

  // When a visual template is selected, do NOT append the Neutral-colored
  // compact wireframe (`#0f172a` / Inter). Models overweight the last concrete
  // HTML samples and rewrite Daisy Days / Zhangzara kits into sparse corporate.
  parts.push(
    hasSelectedTemplate
      ? DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_SELECTED_TEMPLATE
      : DECK_FRAMEWORK_DIRECTIVE_COMPACT,
  );
  parts.push(TEAMVER_API_DECK_FRAMEWORK_OVERRIDE.trim());
  if (!directDeckGeneration) {
    parts.push(TEAMVER_SLIDE_API_DISCOVERY_BINDING_RULE);
  }
  parts.push(
    directDeckGeneration
      ? TEAMVER_SLIDE_API_DIRECT_STREAMING_RULE
      : TEAMVER_SLIDE_API_UNIFIED_STREAMING_RULE,
  );
  // Always append the comment-edit patch contract — it is a no-op when the
  // turn has no `<attached-preview-comments>` block, but on edit turns it
  // gives the model a fast partial-deck path that saves 60–120s of output
  // tokens versus regenerating the whole deck.
  parts.push(TEAMVER_SLIDE_API_COMMENT_EDIT_PATCH_RULE);
  // Same pattern for image-on-existing-deck turns: without this, the model
  // obeys the greenfield "MUST emit complete deck" + 2-slide wireframe and
  // collapses 8-slide decks to 2 while dropping the attached image.
  parts.push(TEAMVER_SLIDE_API_EXISTING_DECK_IMAGE_EDIT_RULE);
  if (hasSelectedTemplate) {
    parts.push(
      hasTemplateVisualKit
        ? TEAMVER_SELECTED_TEMPLATE_VISUAL_READ_LAST_WITH_KIT
        : TEAMVER_SELECTED_TEMPLATE_VISUAL_READ_LAST_WITHOUT_KIT,
    );
  }

  return parts.join('\n\n---\n\n');
}

/**
 * After daemon template Clone seeds LOOK into deck.html, queue one AI turn that
 * fills REAL content while preserving the template visual kit.
 *
 * Clone alone must never leave the user's "만들어줘" instruction as slide copy.
 *
 * Critical: do NOT attach or rewrite the full cloned example.html —
 * that burns max_tokens in `<head>` CSS and hangs for minutes with no deck.
 */

import type { ChatAttachment } from '../types';
import {
  SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION,
} from '@open-design/contracts';
import {
  briefLooksLikeAttachedSource,
  CANVAS_CREATE_SLIDES_PROMPT,
  HOME_CREATE_SLIDES_PROMPT,
  HOME_EMPTY_CREATE_SLIDES_PROMPT,
  HOME_FILL_SLIDES_PROMPT,
  HOME_FILL_SLIDES_PROMPT_LEGACY,
  isSlideCreateBoilerplateLine,
} from './slideCreateBoilerplate';
import { isSlideCountRangeHint, parseSlideCountTarget } from './slideCountTopUp';
import { readTeamverViteEnv } from './teamverViteEnv';

/** Keep local — contracts barrel can be undefined during web test init. */
const FIRST_FILL_SLIDE_COUNT_THIS_TURN = 6;
const FIRST_FILL_HONOR_MAX = 10;
const FIRST_FILL_TOP_UP_FROM = 11;
const FIRST_FILL_SLIDE_COUNT_GUIDANCE =
  `Slide count THIS TURN: honor an explicit user count of 1–${FIRST_FILL_HONOR_MAX} (5-6/5~6 → close ≥5 this turn; 8-10 → close this turn). If the user asked for ${FIRST_FILL_TOP_UP_FROM} or more, close ${FIRST_FILL_SLIDE_COUNT_THIS_TURN} complete body-first slides this turn and hidden top-up appends the rest. If unspecified, close ${FIRST_FILL_SLIDE_COUNT_THIS_TURN} this turn. Never close after a single cover or after 3 slides when the target is 5+ — no 3+3+3 split.`;

/** Keep local — importing canvasSlideLaunch here caused circular init of expansion consts. */
const SLIDE_DECK_QUALITY_BAR_INSTRUCTION =
  'Quality bar: each non-divider slide needs a headline, takeaway, and concrete support (specific bullets, metrics, examples, risks, actions, timeline, comparison, or decision criteria). '
  + 'Reject title-only slides, raw user-prompt copy, template demo captions, and generic placeholders. '
  + 'Vary slide roles/layouts and use the 1920×1080 canvas intentionally; keep content dense enough without bloating the HTML.';

export const TEMPLATE_CLONE_CONTENT_FILL_MARKER = '[Template clone content fill]';

/** Appended model-only contract after Clone seed (not an existing-deck edit). */
export const TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER = '[Template clone content fill turn]';

/** Prompt-mode HTML fill (not JSON slot-fill). Model-only — strip from chat UI. */
export const TEMPLATE_CLONE_PROMPT_FILL_MARKER = '[Template clone prompt fill]';

/** One-shot JSON repair after invalid outline (0901-N02 B5). */
export const TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER = '[Template clone slot-fill JSON repair]';

/** handleSend entryFrom for the one-shot JSON repair auto-send (루프368). */
export const CLONE_SLOT_FILL_REPAIR_ENTRY_FROM = 'clone_slot_fill_json_repair';

export type TemplateCloneFillMode = 'prompt' | 'deterministic';

export function normalizeTemplateCloneFillMode(value: unknown): TemplateCloneFillMode {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'deterministic' || raw === 'content-fill' || raw === 'server') {
    return 'deterministic';
  }
  return 'prompt';
}

export function getTemplateCloneFillMode(): TemplateCloneFillMode {
  const fromEnv = readTeamverViteEnv('VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE');
  if (fromEnv) return normalizeTemplateCloneFillMode(fromEnv);
  if (typeof window !== 'undefined') {
    try {
      return normalizeTemplateCloneFillMode(
        window.localStorage.getItem('od:template-clone-fill-mode'),
      );
    } catch {
      return 'prompt';
    }
  }
  return 'prompt';
}

export function shouldUseDeterministicTemplateCloneFill(): boolean {
  return getTemplateCloneFillMode() === 'deterministic';
}

export function templateCloneContentFillFlagKey(projectId: string): string {
  return `od:template-clone-content-fill:${projectId}`;
}

export function autoSendSeedStorageKey(projectId: string): string {
  return `od:auto-send-seed:${projectId}`;
}

export function isTemplateCloneContentFillPrompt(text: string | null | undefined): boolean {
  const value = String(text ?? '');
  return (
    value.includes(TEMPLATE_CLONE_CONTENT_FILL_MARKER)
    || value.includes(TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER)
    || value.includes(TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER)
  );
}

export function isTemplateCloneSlotFillRepairPrompt(text: string | null | undefined): boolean {
  return String(text ?? '').includes(TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER);
}

/** True when any user turn already requested the one-shot JSON repair. */
export function historyHasTemplateCloneSlotFillRepair(
  messages: readonly { role?: string; content?: string | null }[],
): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user' && isTemplateCloneSlotFillRepairPrompt(message.content)) {
      return true;
    }
  }
  return false;
}

/**
 * Repair already attempted on this fill lineage — includes the in-flight user
 * turn (messagesRef may lag behind the local `userMsg` during finalize).
 */
export function cloneFillJsonRepairAlreadyAttempted(
  messages: readonly { role?: string; content?: string | null }[],
  currentUserContent?: string | null,
): boolean {
  if (isTemplateCloneSlotFillRepairPrompt(currentUserContent)) return true;
  return historyHasTemplateCloneSlotFillRepair(messages);
}

/** True when a one-shot JSON repair auto-send should run before LOOK seed warning. */
export function shouldQueueCloneSlotFillJsonRepair(
  messages: readonly { role?: string; content?: string | null }[],
  currentUserContent?: string | null,
): boolean {
  return !cloneFillJsonRepairAlreadyAttempted(messages, currentUserContent);
}

/** Short repair user turn — not the long incomplete-output auto-continue essay. */
export function buildTemplateCloneSlotFillRepairPrompt(options?: {
  userBrief?: string | null;
}): string {
  const parts = [
    TEMPLATE_CLONE_CONTENT_FILL_MARKER,
    TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER,
    TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER,
    'Previous reply was not a valid JSON outline (HTML dump or schema fail).',
    'Emit ONE JSON outline only this turn — plain or ```json fenced.',
    'Shape: {"title":"...","slides":[{"title":"...","body":"line\\nline","roleHint":"cover|list|cards|timeline|stat|quote|team|process|closing|body"}]}',
    'FORBIDDEN: <!doctype, <html, <head, <style, <section class="slide">, Motif <svg>.',
    'Host slot-fills the LOOK seed. Do not regenerate deck HTML.',
  ];
  const brief = String(options?.userBrief ?? '').trim();
  if (brief && !looksLikeInstructionNotSlideCopy(brief)) {
    parts.push(`Original brief (fill REAL topical copy): ${brief.slice(0, 400)}`);
  }
  return parts.join('\n');
}

/** True when the most recent user turn is still a Clone content-fill. */
export function historyHasTemplateCloneContentFill(
  messages: readonly { role?: string; content?: string | null }[],
): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user') {
      return isTemplateCloneContentFillPrompt(message.content);
    }
  }
  return false;
}

/**
 * Auto-continue prompts drop fill markers — re-stamp CREATE fill contract so
 * handleSend keeps stripping deck.html and never flips to existing-deck edit.
 * No-op when the prompt already carries a fill marker (first seed or prior stamp).
 */
const TEMPLATE_CLONE_FILL_JSON_REPAIR =
  'ABANDON any HTML deck dump. Restart with ONE JSON outline only: {"title":"...","slides":[{"title":"...","body":"...","roleHint":"cover"}]}. No <!doctype / <section class="slide">.';

export function ensureTemplateCloneContentFillContinuePrompt(prompt: string): string {
  const trimmed = String(prompt ?? '').trim();
  if (!trimmed) return trimmed;
  if (isTemplateCloneContentFillPrompt(trimmed)) {
    if (
      trimmed.includes('ABANDON any Motif')
      || trimmed.includes('ABANDON any large Motif')
      || trimmed.includes('ABANDON any HTML deck dump')
      || trimmed.includes('kit Motif vocabulary')
      || trimmed.includes('kit motif vocabulary')
      || trimmed.includes('JSON outline only')
    ) return trimmed;
    return `${trimmed}\n\n${TEMPLATE_CLONE_FILL_JSON_REPAIR}`;
  }
  return [
    TEMPLATE_CLONE_CONTENT_FILL_MARKER,
    TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER,
    'This is an auto-continue of a template-clone CONTENT FILL (CREATE), not a surgical edit of the Clone LOOK seed.',
    ...templateCloneContentFillHardRules(),
    TEMPLATE_CLONE_FILL_JSON_REPAIR,
    '',
    trimmed,
  ].join('\n');
}

/** Canvas/Home boilerplate only — user topic lines may still contain "만들어줘". */
export function looksLikeCanvasCreateBoilerplate(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (isSlideCreateBoilerplateLine(t)) return true;
  if (t === CANVAS_CREATE_SLIDES_PROMPT) return true;
  if (t === HOME_CREATE_SLIDES_PROMPT) return true;
  if (t === HOME_EMPTY_CREATE_SLIDES_PROMPT) return true;
  if (t === HOME_FILL_SLIDES_PROMPT) return true;
  if (t === HOME_FILL_SLIDES_PROMPT_LEGACY) return true;
  if (/^(?:User instruction|Deliverable instruction|Source brief|Quick settings)\s*[:：]/i.test(t)) {
    return true;
  }
  return false;
}

export function looksLikeInstructionNotSlideCopy(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (looksLikeCanvasCreateBoilerplate(t)) return true;
  if (/(?:만들어|작성|생성)\s*(?:줘|주세요)|설명해?\s*(?:줘|주세요)/i.test(t)) return true;
  if (/^(?:please\s+)?(?:make|create|build|write|generate)\s+/i.test(t)) return true;
  if (/피피티|PPT|슬라이드\s*덱/i.test(t) && /(?:만들어|작성|생성|설명)/i.test(t)) return true;
  return false;
}

/**
 * Short cover-topic label from a "만들어줘" request.
 * "expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨." → "expo"
 */
export function deriveTemplateCloneTopicLabel(request: string): string {
  const t = request.trim();
  if (!t) return '';
  const aboutKo = t.match(
    /^(.+?)\s*(?:에\s*대해(?:서)?|에\s*관한)\s*(?:설명하는\s*)?(?:발표\s*자료|피피티|PPT|슬라이드|덱|프레젠테이션)/i,
  )?.[1]?.trim();
  if (aboutKo && aboutKo.length >= 2 && !looksLikeCanvasCreateBoilerplate(aboutKo)) {
    return aboutKo.slice(0, 60);
  }
  const aboutEn = t.match(
    /(?:about|on)\s+(.+?)(?:\s+(?:slides?|deck|presentation|ppt)\b|[.?!]|$)/i,
  )?.[1]?.trim();
  if (aboutEn && aboutEn.length >= 2 && !looksLikeInstructionNotSlideCopy(aboutEn)) {
    return aboutEn.slice(0, 60);
  }
  return '';
}

/**
 * Keep facts the model needs (headings, preview, user topic, quick settings).
 * Drop Home/Canvas create scaffolding that used to be dumped as [Source brief]
 * and drowned the actual topic.
 */
export function compactTemplateCloneFillSourceBrief(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';

  const parts: string[] = [];
  const push = (label: string, value: string | null | undefined, max = 600) => {
    const v = String(value ?? '').trim();
    if (!v) return;
    parts.push(`${label}: ${v.slice(0, max)}`);
  };

  push('Canvas title', /Canvas title\s*[:：]\s*(.+)$/im.exec(text)?.[1]);
  push('Drive source file', /Drive source file\s*[:：]\s*(.+)$/im.exec(text)?.[1]);
  push('Drive source MIME', /Drive source MIME\s*[:：]\s*(.+)$/im.exec(text)?.[1]);
  push(
    'Visible headings',
    /(?:Visible headings|Canvas headings|Source headings)\s*[:：]\s*(.+)$/im.exec(text)?.[1],
  );
  push(
    'Source preview',
    /Source preview\s*[:：]\s*([\s\S]*?)(?=\n(?:Canvas |Drive |Visible |User |Selected |\[)|$)/i
      .exec(text)?.[1],
    600,
  );
  const userInstr = /\[?User instruction\]?\s*[:：]?\s*\n?([\s\S]*?)(?=\n(?:Source |Canvas |Drive |Visible |Selected |\[)|$)/i
    .exec(text)?.[1]?.trim();
  if (userInstr && !looksLikeCanvasCreateBoilerplate(userInstr)) {
    push('User instruction', userInstr, 400);
  }
  const quick = /\[Quick settings\]\s*\n?([\s\S]*?)(?=\n\[|$)/i.exec(text)?.[1]?.trim();
  if (quick) parts.push(`Quick settings:\n${quick}`);

  if (parts.length > 0) return parts.join('\n').slice(0, 1400);
  if (/\[Deliverable instruction\]|\[Selected slide template/i.test(text)) return '';
  if (looksLikeCanvasCreateBoilerplate(text) || looksLikeInstructionNotSlideCopy(text)) {
    return '';
  }
  return text.slice(0, 1400);
}

/**
 * Prefer the real topic line over Canvas boilerplate / full run prompts.
 * Kept user-facing (may still say "만들어줘") for chat display.
 */
export function extractTemplateCloneUserFacingRequest(input: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
}): string {
  const candidates: string[] = [];
  const push = (raw: string | null | undefined) => {
    const text = String(raw ?? '').trim();
    if (!text) return;
    const bracketUser = /\[User instruction\]\s*\n([\s\S]*?)(?=\n\n\[|$)/i.exec(text)?.[1]?.trim();
    if (bracketUser) candidates.push(bracketUser);
    const userInstr = /\[?User instruction\]?\s*[:：]\s*\n?([\s\S]*?)(?=\n(?:Source |Canvas |Drive |Visible |Selected |\[)|$)/i
      .exec(text)?.[1]?.trim();
    if (userInstr) candidates.push(userInstr);
    // Prefer the lead line before deliverable / Clone host-contract blocks.
    const beforeDeliverable = text.split(/\n\n\[Deliverable instruction\]/i)[0]?.trim() ?? text;
    const beforeHostContract = beforeDeliverable.split(/\n\[Template clone /i)[0]?.trim() ?? beforeDeliverable;
    for (const line of beforeHostContract.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^\[/.test(trimmed)) continue;
      if (/^(?:Deliverable instruction|Source brief|Quick settings|Selected slide template)/i.test(trimmed)) {
        continue;
      }
      candidates.push(trimmed.replace(/^User instruction\s*[:：]\s*/i, '').trim());
    }
  };
  push(input.userInstruction);
  push(input.sourceBrief);
  push(input.pendingPrompt);

  for (const candidate of candidates) {
    if (!candidate || looksLikeCanvasCreateBoilerplate(candidate)) continue;
    if (candidate.length > 500) continue;
    return candidate;
  }
  // Never claim "첨부한 자료" when the user may not have attached anything.
  return HOME_FILL_SLIDES_PROMPT;
}

/** Shared hard rules for Clone → first AI content fill (JSON slot-fill, 0901-N02). */
export function templateCloneContentFillHardRules(): string[] {
  return [
    'Hard rules (READ — JSON slot-fill):',
    '- This is CREATE of real topical content, not a surgical edit. Status tone: "슬라이드 초안 작성 중" — NEVER "수정 반영 중" / "Applying your edits".',
    '- Emit ONE JSON outline only (plain or ```json fenced). The host slot-fills the LOOK seed — do NOT regenerate deck HTML.',
    '- Forbidden output: <!doctype, <html, <head, <style, <section class="slide">, Motif <svg>, full example.html rewrite.',
    `- ${SLIDE_DECK_QUALITY_BAR_INSTRUCTION}`,
    `- ${SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION}`,
    '- Expand THIS turn\'s brief only. Do not copy host-contract examples or the user instruction onto slides.',
    '- JSON shape: {"title":"...","slides":[{"title":"...","body":"line\\nline","roleHint":"cover|list|cards|timeline|stat|quote|team|process|closing|body"}]}',
    `- ${FIRST_FILL_SLIDE_COUNT_GUIDANCE} Outline length = deliverable count this turn (max 20). Hidden top-up only when the user asked for ${FIRST_FILL_TOP_UP_FROM}+.`,
    '- Treat the daemon Clone seed as the visual baseline the host will keep. You only supply titles/bodies/roleHint.',
    `- If the brief is only a topic, use a default ${FIRST_FILL_SLIDE_COUNT_THIS_TURN}-slide outline (cover, why it matters, key concepts, evidence, next steps, close). Adapt labels to the topic and audience.`,
    '- Do not invent empty pillar/column-number cards to pad a 3-column look. Card count = content count.',
    `- Fill REAL topical titles/body (no "…", no "만들어줘", no create-slides boilerplate). Brief/Quick settings are the eventual target — honor an explicit 1–${FIRST_FILL_HONOR_MAX} this turn; unspecified still closes ${FIRST_FILL_SLIDE_COUNT_THIS_TURN}. Never copy the template demo page lineup.`,
    '- REPLACE every example.html proper noun, table, and metric in your outline text. Hartfield / NorthPeak / Project Atlas / WACC / EBITDA / "Demo-data notice" are forbidden unless the user brief names them.',
    '- Prefer a closed valid JSON outline this turn over Motif/HTML fidelity experiments.',
    '- Honor stated audience/level (e.g. 시니어 개발자 = architecture/internals/trade-offs, not a beginner intro).',
    '- Each body slide needs a real title plus 2–4 concrete bullet lines or a real paragraph in `body`. No "핵심 메시지를 정리합니다" filler.',
  ];
}

const FIRST_FILL_SLIDE_COUNT_STABILITY_CAP =
  `${FIRST_FILL_SLIDE_COUNT_THIS_TURN} (stability cap for first template fill)`;

/** Short Home/Canvas preset — a complete compact job, not a first-fill cap. */
const FIRST_FILL_SHORT_RANGE_CLOSE_HINT = '5-6 (close at least 5 this turn)';
const FIRST_FILL_SHORT_RANGE_RE = /^5\s*[-~–—]\s*6$/;
/** Home/Canvas "auto" 6-8 is the unspecified default — still close 6 this turn. */
const FIRST_FILL_AUTO_DEFAULT_RANGE_RE = /^6\s*[-~–—]\s*8$/;
const FIRST_FILL_HONOR_RANGE_CLOSE_RE = /^\d{1,2}-\d{1,2} \(close this turn\)$/;

function isFirstFillShortRangeHint(text: string | number | null | undefined): boolean {
  const raw = String(text ?? '').trim();
  return FIRST_FILL_SHORT_RANGE_RE.test(raw) || raw === FIRST_FILL_SHORT_RANGE_CLOSE_HINT;
}

export function normalizeTemplateCloneFillSlideCountHint(input: string | number | null | undefined): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const explicit = raw.match(/(?:\bexactly\b|정확히)\s*(\d{1,2})/i)
    ?? raw.match(/(\d{1,2})\s*(?:장|slides?|pages?)\s*(?:요청|requested|명시|explicit)/i);
  if (explicit?.[1]) {
    const n = Number(explicit[1]);
    if (Number.isFinite(n) && n >= 1 && n <= FIRST_FILL_HONOR_MAX) return String(n);
    if (Number.isFinite(n) && n >= FIRST_FILL_TOP_UP_FROM) {
      return FIRST_FILL_SLIDE_COUNT_STABILITY_CAP;
    }
  }
  // 5-6 / 5~6 is a complete short job. Do not rewrite it to the first-fill
  // stability cap — that text plans a later append and splits the work.
  if (isFirstFillShortRangeHint(raw)) {
    return FIRST_FILL_SHORT_RANGE_CLOSE_HINT;
  }
  if (FIRST_FILL_HONOR_RANGE_CLOSE_RE.test(raw)) return raw;
  if (FIRST_FILL_AUTO_DEFAULT_RANGE_RE.test(raw)) {
    return FIRST_FILL_SLIDE_COUNT_STABILITY_CAP;
  }
  const range = raw.match(/^(\d{1,2})\s*[-~–—]\s*(\d{1,2})$/);
  if (range?.[1] && range[2]) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo >= 1 && hi >= lo) {
      if (hi <= FIRST_FILL_HONOR_MAX) return `${lo}-${hi} (close this turn)`;
      return FIRST_FILL_SLIDE_COUNT_STABILITY_CAP;
    }
  }
  const single = raw.match(/^(\d{1,2})$/)?.[1];
  if (single) {
    const n = Number(single);
    if (n >= 1 && n <= FIRST_FILL_HONOR_MAX) return String(n);
    return FIRST_FILL_SLIDE_COUNT_STABILITY_CAP;
  }
  return raw;
}

/** Cap Plugin-input slideCount for Clone fill so Quick settings cannot fight the seed hint. */
export function withTemplateCloneFillPluginInputs(
  pluginInputs: Record<string, unknown> | null | undefined,
  slideCountHint?: string | number | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(pluginInputs ?? {}) };
  const capped =
    normalizeTemplateCloneFillSlideCountHint(slideCountHint)
    ?? normalizeTemplateCloneFillSlideCountHint(
      typeof next.slideCount === 'string' || typeof next.slideCount === 'number'
        ? next.slideCount
        : null,
    );
  if (capped) next.slideCount = capped;
  return next;
}

/**
 * Appended after the rendered plugin block on fill turns so snapshot Plugin
 * inputs (often still 8-10 / 12-15) cannot override the stability-capped hint.
 */
export function templateCloneFillSlideCountOverrideNotice(
  slideCountHint?: string | number | null,
): string | null {
  const capped = normalizeTemplateCloneFillSlideCountHint(slideCountHint);
  if (!capped) return null;
  if (capped === FIRST_FILL_SHORT_RANGE_CLOSE_HINT || isFirstFillShortRangeHint(slideCountHint)) {
    return [
      '# Template clone fill slideCount override',
      `For THIS first content-fill turn only, treat Plugin input slideCount as "${capped}".`,
      'Close at least 5 slides this turn. Do not stop after 3 slides or leave remaining slides for a later turn.',
    ].join('\n');
  }
  if (FIRST_FILL_HONOR_RANGE_CLOSE_RE.test(capped)) {
    return [
      '# Template clone fill slideCount override',
      `For THIS first content-fill turn only, treat Plugin input slideCount as "${capped}".`,
      'Close the requested range this turn. Do not leave remaining slides for a later turn.',
    ].join('\n');
  }
  if (capped === FIRST_FILL_SLIDE_COUNT_STABILITY_CAP) {
    return [
      '# Template clone fill slideCount override',
      `For THIS first content-fill turn only, treat Plugin input slideCount as "${capped}".`,
      'Ignore any larger slideCount in the plugin block above (first-fill stability cap).',
      'Finish a closed compact deck this turn. A later turn may append remaining slides if the user requested more.',
    ].join('\n');
  }
  return [
    '# Template clone fill slideCount override',
    `For THIS first content-fill turn only, treat Plugin input slideCount as "${capped}".`,
    'Finish a closed compact deck this turn.',
  ].join('\n');
}

/** Persist the uncapped user request so top-up can ignore the first-fill cap. */
export function formatUserRequestedSlideCountLine(
  slideCountHint?: string | number | null,
): string | null {
  const raw = String(slideCountHint ?? '').trim();
  if (!raw || /stability cap/i.test(raw)) return null;
  return `User requested slide count: ${raw}.`;
}

export function extractTemplateCloneFillSlideCountHintFromPrompt(
  prompt: string | null | undefined,
): string | null {
  const match = /Slide count hint:\s*([^\n.]+)/i.exec(String(prompt ?? ''));
  return normalizeTemplateCloneFillSlideCountHint(match?.[1]?.trim() ?? null);
}

export function buildTemplateCloneContentFillSeed(options: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
  templateTitle?: string | null;
  hasSourceMaterial?: boolean;
  slideCountHint?: string | number | null;
}): string {
  const visible = extractTemplateCloneUserFacingRequest(options);
  const topic = deriveTemplateCloneTopicLabel(visible);
  const templateTitle = options.templateTitle?.trim() || '';
  const rawBrief = String(options.sourceBrief ?? '').trim();
  const brief = compactTemplateCloneFillSourceBrief(
    [options.sourceBrief, options.pendingPrompt, options.userInstruction]
      .filter(Boolean)
      .join('\n\n'),
  );
  const hasAttachedSource =
    options.hasSourceMaterial
    ?? (briefLooksLikeAttachedSource(rawBrief) || briefLooksLikeAttachedSource(brief));
  const parts = [
    visible,
    '',
    TEMPLATE_CLONE_CONTENT_FILL_MARKER,
    'Daemon Clone already seeded a LOOK preview into `deck.html`. This turn emits a JSON outline only — the host slot-fills that seed. Do NOT rewrite deck HTML.',
    hasAttachedSource
      ? 'Fill REAL presentation CONTENT for this request and any attached source materials (Canvas/Drive/files) — not the cloned demo copy.'
      : 'Fill REAL presentation CONTENT for this create (user prompt may be empty; invent clear topical copy — do not paste boilerplate leads into titles).',
    'The visible request above is a BRIEF/TOPIC. Expand it into a real presentation with domain knowledge. Do NOT paste the request onto the cover or body slides.',
    topic ? `Cover topic (use as the title — not the instruction): ${topic}.` : '',
    ...templateCloneContentFillHardRules(),
  ].filter((line) => line !== '');
  if (templateTitle) {
    parts.push(`Selected template: ${templateTitle}.`);
  }
  const visibleSlideCount = parseSlideCountTarget(visible);
  const pluginOrUiHint = options.slideCountHint;
  // Typed `5페이지` beats Home/Canvas quick-length ranges (`6-8` auto, `5-6` short).
  const slideCountHintSource =
    visibleSlideCount != null && isSlideCountRangeHint(pluginOrUiHint)
      ? visibleSlideCount
      : (pluginOrUiHint ?? visibleSlideCount);
  const requestedLine = formatUserRequestedSlideCountLine(slideCountHintSource);
  if (requestedLine) {
    parts.push(requestedLine);
  }
  const slideCountHint = normalizeTemplateCloneFillSlideCountHint(slideCountHintSource);
  if (slideCountHint) {
    parts.push(`Slide count hint: ${slideCountHint}.`);
  } else {
    parts.push(
      `Slide count hint: ${FIRST_FILL_SLIDE_COUNT_THIS_TURN} (default for first template fill; close ${FIRST_FILL_SLIDE_COUNT_THIS_TURN} complete slides this turn.)`,
    );
  }
  if (brief) {
    parts.push('', '[Source brief]', brief);
  }
  return parts.join('\n');
}

/** Legacy rollback path: model emits the final deck HTML; no JSON slot-fill marker. */
export function buildTemplateClonePromptFillSeed(options: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
  templateTitle?: string | null;
  hasSourceMaterial?: boolean;
  slideCountHint?: string | number | null;
}): string {
  const visible = extractTemplateCloneUserFacingRequest(options);
  const topic = deriveTemplateCloneTopicLabel(visible);
  const templateTitle = options.templateTitle?.trim() || '';
  const rawBrief = String(options.sourceBrief ?? '').trim();
  const brief = compactTemplateCloneFillSourceBrief(
    [options.sourceBrief, options.pendingPrompt, options.userInstruction]
      .filter(Boolean)
      .join('\n\n'),
  );
  const hasAttachedSource =
    options.hasSourceMaterial
    ?? (briefLooksLikeAttachedSource(rawBrief) || briefLooksLikeAttachedSource(brief));
  const visibleSlideCount = parseSlideCountTarget(visible);
  const slideCountHintSource =
    visibleSlideCount != null && isSlideCountRangeHint(options.slideCountHint)
      ? visibleSlideCount
      : (options.slideCountHint ?? visibleSlideCount);
  const slideCountHint = normalizeTemplateCloneFillSlideCountHint(slideCountHintSource);
  const parts = [
    visible,
    '',
    TEMPLATE_CLONE_PROMPT_FILL_MARKER,
    'A visual deck template was selected. Create ONE complete final deck artifact now.',
    'Emit `<artifact type="deck" identifier="deck">` with a complete HTML document and filled slides. Do not emit JSON outline.',
    'Use the selected template kit in the system prompt as visual authority: palette, typography, motif, layout rhythm, and slide chrome.',
    'Use the cloned `deck.html` only as a look reference. Do not treat it as an existing-deck edit, copy demo placeholders, or paste this host contract onto slides.',
    hasAttachedSource
      ? 'Fill REAL presentation CONTENT for this request and any attached source materials (Canvas/Drive/files).'
      : 'Fill REAL presentation CONTENT for this create; expand THIS brief with concrete domain knowledge.',
    'The visible request above is THIS turn\'s brief/topic. Do NOT paste the user instruction, this host contract, or any system-prompt worked example onto the cover or body slides.',
    topic ? `Cover topic (use as the title, not the instruction): ${topic}.` : '',
    SLIDE_DECK_QUALITY_BAR_INSTRUCTION,
    `Slide count: ${slideCountHint || FIRST_FILL_SLIDE_COUNT_GUIDANCE}.`,
    'Every slide must be 1920x1080, fixed-size, overflow hidden, and navigable as a deck, not a scrolling article.',
    'Do not stop after a status sentence, outline, or partial `<head>`; close `</html></artifact>`.',
  ].filter((line) => line !== '');
  if (templateTitle) {
    parts.push(`Selected template: ${templateTitle}.`);
  }
  if (brief) {
    parts.push('', '[Source brief]', brief);
  }
  return parts.join('\n');
}

/**
 * Auto-send seed after daemon Clone.
 *
 * ProjectView used to prefer the in-memory `pendingPrompt` from createProject
 * (the full `canvasCreateSlidesRunPrompt` dump) over the queued fill seed.
 * That sent a surgical existing-deck-edit turn WITHOUT the fill marker, so
 * the model left Clone's prompt-stuffed headings intact and stalled on `<head>`.
 *
 * When a fill is queued, the fill seed ALWAYS wins — even if pendingPrompt
 * is still the raw create prompt.
 */
export function resolveTemplateCloneAutoSendSeed(input: {
  queuedFillSeed?: string | null;
  pendingPrompt?: string | null;
  fillQueued: boolean;
}): string {
  const queued = String(input.queuedFillSeed ?? '').trim();
  const pending = String(input.pendingPrompt ?? '').trim();
  if (input.fillQueued) {
    if (isTemplateCloneContentFillPrompt(queued)) return queued;
    if (isTemplateCloneContentFillPrompt(pending)) return pending;
    if (queued) return queued;
    return buildTemplateCloneContentFillSeed({ pendingPrompt: pending });
  }
  if (isTemplateCloneContentFillPrompt(queued)) return queued;
  return queued || pending;
}

/** Cloned `deck.html` must never ride along on a content-fill turn. */
export function isCanonicalDeckAttachment(attachment: {
  path?: string | null;
  name?: string | null;
}): boolean {
  const path = String(attachment.path || attachment.name || '').trim();
  const base = path.split('/').pop() ?? path;
  return /^deck(?:[-_.].*)?\.html?$/i.test(base);
}

export function withoutCanonicalDeckAttachments<T extends {
  path?: string | null;
  name?: string | null;
}>(attachments: readonly T[] | null | undefined): T[] {
  return (attachments ?? []).filter((attachment) => !isCanonicalDeckAttachment(attachment));
}

export function queueTemplateCloneContentFill(options: {
  projectId: string;
  seed: string;
  attachments?: ChatAttachment[];
}): void {
  const projectId = options.projectId.trim();
  if (!projectId || !options.seed.trim()) return;
  try {
    // Do NOT set od:auto-send-first here — App/create owns that flag so
    // suppressAutoSendForFailedDriveImport (and similar) cannot be bypassed.
    window.sessionStorage.setItem(autoSendSeedStorageKey(projectId), options.seed);
    window.sessionStorage.setItem(templateCloneContentFillFlagKey(projectId), '1');
    const attachments = withoutCanonicalDeckAttachments(options.attachments);
    if (attachments.length > 0) {
      window.sessionStorage.setItem(
        `od:auto-send-attachments:${projectId}`,
        JSON.stringify(attachments),
      );
    } else {
      window.sessionStorage.removeItem(`od:auto-send-attachments:${projectId}`);
    }
  } catch {
    /* sessionStorage may be unavailable */
  }
}

/** Store a Clone follow-up seed without arming the JSON slot-fill recovery path. */
export function queueTemplateClonePromptFill(options: {
  projectId: string;
  seed: string;
  attachments?: ChatAttachment[];
}): void {
  const projectId = options.projectId.trim();
  if (!projectId || !options.seed.trim()) return;
  try {
    window.sessionStorage.setItem(autoSendSeedStorageKey(projectId), options.seed);
    window.sessionStorage.removeItem(templateCloneContentFillFlagKey(projectId));
    const attachments = withoutCanonicalDeckAttachments(options.attachments);
    if (attachments.length > 0) {
      window.sessionStorage.setItem(
        `od:auto-send-attachments:${projectId}`,
        JSON.stringify(attachments),
      );
    } else {
      window.sessionStorage.removeItem(`od:auto-send-attachments:${projectId}`);
    }
  } catch {
    /* sessionStorage may be unavailable */
  }
}

export function readQueuedAutoSendSeed(projectId: string): string {
  try {
    return window.sessionStorage.getItem(autoSendSeedStorageKey(projectId))?.trim() || '';
  } catch {
    return '';
  }
}

export function isTemplateCloneContentFillQueued(projectId: string): boolean {
  try {
    return window.sessionStorage.getItem(templateCloneContentFillFlagKey(projectId)) === '1';
  } catch {
    return false;
  }
}

export function clearTemplateCloneContentFillQueue(projectId: string): void {
  try {
    window.sessionStorage.removeItem(templateCloneContentFillFlagKey(projectId));
    window.sessionStorage.removeItem(autoSendSeedStorageKey(projectId));
    window.sessionStorage.removeItem(`od:auto-send-attachments:${projectId}`);
  } catch {
    /* ignore */
  }
}

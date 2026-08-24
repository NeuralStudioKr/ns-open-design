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
  SLIDE_DECK_CONTENT_EXPANSION_EXAMPLE,
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

/** Keep local — importing canvasSlideLaunch here caused circular init of expansion consts. */
const SLIDE_DECK_QUALITY_BAR_INSTRUCTION =
  'Quality bar: each non-divider slide needs a headline, takeaway, and concrete support (specific bullets, metrics, examples, risks, actions, timeline, comparison, or decision criteria). '
  + 'Reject title-only slides, raw user-prompt copy, template demo captions, and generic placeholders. '
  + 'Vary slide roles/layouts and use the 1920×1080 canvas intentionally; keep content dense enough without bloating the HTML.';

export const TEMPLATE_CLONE_CONTENT_FILL_MARKER = '[Template clone content fill]';

/** Appended model-only contract after Clone seed (not an existing-deck edit). */
export const TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER = '[Template clone content fill turn]';

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
  );
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
const TEMPLATE_CLONE_FILL_SVG_ABANDON =
  'ABANDON any large Motif `<svg>` started BEFORE the cover title. Restart body-first with `<h1>` then lead `<p>`. Do not dump full SVG/style sprites, but DO reuse the kit motif vocabulary after title copy: compact existing CSS classes, small complete inline motifs, or template deco snippets from the visual kit. Keep ~56–80px slide padding. Never invent generic CSS circles / tiny corner flowers.';

export function ensureTemplateCloneContentFillContinuePrompt(prompt: string): string {
  const trimmed = String(prompt ?? '').trim();
  if (!trimmed) return trimmed;
  if (isTemplateCloneContentFillPrompt(trimmed)) {
    if (
      trimmed.includes('ABANDON any Motif')
      || trimmed.includes('ABANDON any large Motif')
      || trimmed.includes('kit Motif vocabulary')
      || trimmed.includes('kit motif vocabulary')
    ) return trimmed;
    return `${trimmed}\n\n${TEMPLATE_CLONE_FILL_SVG_ABANDON}`;
  }
  return [
    TEMPLATE_CLONE_CONTENT_FILL_MARKER,
    TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER,
    'This is an auto-continue of a template-clone CONTENT FILL (CREATE), not a surgical edit of the Clone LOOK seed.',
    ...templateCloneContentFillHardRules(),
    TEMPLATE_CLONE_FILL_SVG_ABANDON,
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
    // Prefer the lead line before deliverable protocol blocks.
    const beforeDeliverable = text.split(/\n\n\[Deliverable instruction\]/i)[0]?.trim() ?? text;
    for (const line of beforeDeliverable.split(/\r?\n/)) {
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

/** Shared hard rules for Clone → first AI content fill (seed + turn marker). */
export function templateCloneContentFillHardRules(): string[] {
  return [
    'Hard rules (READ — truncation/quality):',
    '- This is CREATE of real topical content, not a surgical edit. Status tone: "슬라이드 초안 작성 중" — NEVER "수정 반영 중" / "Applying your edits".',
    '- Do NOT rewrite or reproduce the full cloned example.html / attached deck.html CSS+SVG head (that burns max_tokens and hangs with only `<head>`).',
    '- Use the Template visual kit + scaffold map from the system prompt for LOOK (palette hex, fonts, layout roles). Neutral Modern / OD skeleton terracotta is a failed deliverable.',
    `- ${SLIDE_DECK_QUALITY_BAR_INSTRUCTION}`,
    `- ${SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION}`,
    `- ${SLIDE_DECK_CONTENT_EXPANSION_EXAMPLE}`,
    '- Strict body-first contract: start the artifact body exactly like `<!doctype html><html lang="ko"><body><section class="slide" ...>`.',
    '- `<head>` is FORBIDDEN on this fill turn. Do not emit `<head>`, `<title>`, meta tags, or a style prelude before slide 1.',
    '- The first 800 characters after `<artifact` MUST include `<body` and one complete `<section class="slide">` with real topical copy (cover title + lead).',
    '- Slide count THIS TURN: honor an explicit small count (1–2) if the user asked for it. Otherwise close exactly 3 complete body-first slides and `</html></artifact>`. Hidden top-up appends the rest of the user request (5–6 / 8 / 12…). Never spend this turn on `<head>` or full Motif sprite dumps. Do not stop after a single cover.',
    '- Official look/Motif CSS/SVG is merged after save. Do not stream `<head>`, a full example.html stylesheet, or large SVG sprites this turn. Still include 1–2 compact template-identifying motif/deco cues per slide when the visual kit provides them.',
    '- If the brief is only a topic, use this default 3-slide outline: cover, why it matters / key concepts, next steps. Adapt labels to the topic and audience.',
    '- Motif vocabulary OVERRIDE: Title-first always. Use the selected kit motif family after cover `<h1>`/`<h2>` + lead: compact existing classes, small complete inline snippets, or deco HTML from the kit. Keep slide padding (~56–80px) and put titles in normal flow (not under absolute Motif corners). FORBIDDEN this turn: Motif `<svg>` before title copy, multi-KB sprite dumps, inventing generic CSS circles / tiny corner dots / fake 12–48px flower SVGs / emoji daisies, Capsule coral pills when the kit Motif is petals/flowers/blobs/pins/pixel/scanlines, empty `.deco` shells. If you already started an SVG-before-title dump, abandon it and restart with `<h1>`.',
    '- Named motif cue: do not invent a different motif family and do not omit recognizable kit identity entirely. Finish 3 titled slides first, but each slide should carry at least one lightweight kit-specific motif/deco cue when the visual kit exposes one.',
    '- Layout OVERRIDE: reuse capped Layout CSS + scaffold roles when present. FORBIDDEN: flattening every slide into one centered flex title column when the kit ships grids/splits/cards.',
    '- Full-bleed surface: bind kit Slide surface hex on `html`/`body` AND every `<section class="slide" style="…background:<kit surface>…">` edge-to-edge for the full 1920×1080 canvas. Prefer the kit identity surface (e.g. `--hc-bg` / cream / paper) — never substitute Neutral white/`#0f172a` when the kit names a surface. FORBIDDEN: white/default outer slide with an inner cream "paper" panel that leaves white bands at top/bottom. White title cards ON cream paper are OK.',
    '- Keep `<style>` very short (kit tokens + fonts only, ideally under ~1KB) and place it after slide 1 or omit it in favor of inline styles. Never dump the whole template stylesheet.',
    '- Fill REAL topical titles/body (no "…", no "만들어줘", no create-slides boilerplate). Brief/Quick settings are the eventual target — this turn still closes 3. Hidden top-up appends the rest. Never copy the template demo page lineup.',
    '- Prefer finishing a closed 3-slide `</artifact>` this turn over any Motif fidelity. A complete compact 3-slide deck beats a truncated SVG/CSS shell.',
    '- Honor stated audience/level (e.g. 시니어 개발자 = architecture/internals/trade-offs, not a beginner intro).',
    '- Each body slide needs a real title plus 2–4 concrete bullets or a real paragraph. No "핵심 메시지를 정리합니다" filler.',
  ];
}

const FIRST_FILL_SLIDE_COUNT_STABILITY_CAP =
  '3 (stability cap for first template fill)';

export function normalizeTemplateCloneFillSlideCountHint(input: string | number | null | undefined): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const explicit = raw.match(/(?:\bexactly\b|정확히)\s*(\d{1,2})/i)
    ?? raw.match(/(\d{1,2})\s*(?:장|slides?|pages?)\s*(?:요청|requested|명시|explicit)/i);
  if (explicit?.[1]) {
    const n = Number(explicit[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 12) return String(n);
  }
  if (
    /^5\s*-\s*6$/.test(raw) || /^5\s*~\s*6$/.test(raw)
    || /^6\s*-\s*8$/.test(raw) || /^6\s*~\s*8$/.test(raw)
    || /^8\s*-\s*10$/.test(raw) || /^8\s*~\s*10$/.test(raw)
    || /^12\s*-\s*15$/.test(raw) || /^12\s*~\s*15$/.test(raw)
  ) {
    return FIRST_FILL_SLIDE_COUNT_STABILITY_CAP;
  }
  const single = raw.match(/^(\d{1,2})$/)?.[1];
  if (single) {
    const n = Number(single);
    if (n <= 3) return String(n);
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
  return [
    '# Template clone fill slideCount override',
    `For THIS first content-fill turn only, treat Plugin input slideCount as "${capped}".`,
    'Ignore any larger slideCount in the plugin block above (first-fill stability cap).',
    'Finish a closed compact deck this turn. A later turn may append remaining slides if the user requested more.',
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
    'Daemon Clone already seeded a LOOK preview into `deck.html`. This turn REPLACES it with a compact, content-complete deck. Do NOT copy or rewrite that document from `<head>`.',
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
    parts.push('Slide count hint: 3 (default for first template fill; close 3 complete slides this turn. Hidden top-up appends more.)');
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
    window.sessionStorage.setItem(`od:auto-send-first:${projectId}`, '1');
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
  } catch {
    /* ignore */
  }
}

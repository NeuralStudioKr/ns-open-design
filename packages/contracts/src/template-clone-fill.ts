/**
 * Pure HTML transform for Teamver daemon template Clone.
 *
 * The daemon reads plugin `example.html` from disk and content-swaps Source
 * text into real template shells. Do not dump full HTML into the BYOK system
 * prompt, and do not copy the template original into user-visible project refs/.
 *
 * Policy: reuse each shell's layout/role/motif — do NOT mirror the template's
 * demo page count, order, or section lineup.
 */

import { attrsLookLikeDeckOrTemplateSlideHost } from './html/deck-slide-class.js';
import {
  resolveTemplateCloneSlotMap,
  type TemplateCloneSlotMap,
} from './template-clone-slot-maps.js';

export type { TemplateCloneSlotMap } from './template-clone-slot-maps.js';
export {
  DAISY_DAYS_SLOT_MAP,
  BLOCK_FRAME_SLOT_MAP,
  PRODUCT_LAUNCH_SLOT_MAP,
  BLUE_PROFESSIONAL_SLOT_MAP,
  CAPSULE_SLOT_MAP,
  BOLD_POSTER_SLOT_MAP,
  PITCH_DECK_SLOT_MAP,
  PLAYFUL_SLOT_MAP,
  EIGHT_BIT_ORBIT_SLOT_MAP,
  MAT_SLOT_MAP,
  TEMPLATE_CLONE_SLOT_MAPS,
  resolveTemplateCloneSlotMap,
} from './template-clone-slot-maps.js';

export type TemplateCloneSlideContent = {
  title: string;
  body?: string;
  /** Optional layout hint from JSON outline (0901-N02). Invalid values ignored. */
  roleHint?: TemplateCloneShellRole;
};

export type TemplateCloneDeckOutline = {
  title: string;
  slides: TemplateCloneSlideContent[];
};

export const TEMPLATE_CLONE_OUTLINE_MAX_SLIDES = 20;

type SlideShell = {
  tag: 'section' | 'div';
  attrs: string;
  body: string;
  full: string;
};

const TEAMVER_SLIDE_SIZE_CSS = [
  'html,body{margin:0;padding:0;overflow:auto}',
  '.slides-container{width:auto;height:auto;overflow:visible;scroll-snap-type:none}',
  '.slide{width:1920px;height:1080px;min-height:1080px;max-height:1080px;box-sizing:border-box;scroll-snap-align:none}',
  '.nav-dots,.slide-counter,.nav-dot{display:none!important}',
].join('');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripScriptsAndNav(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<div\b[^>]*\b(?:nav-dots|slide-counter)\b[^>]*>[\s\S]*?<\/div>/gi, '');
}

function isSlideAttrs(attrs: string): boolean {
  return attrsLookLikeDeckOrTemplateSlideHost(attrs);
}

/** Collect slide shells from `<section class="slide|s-*">` or `<div class="slide">`. */
export function listTemplateCloneSlideShells(html: string): SlideShell[] {
  const sections = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)]
    .map((match) => ({
      tag: 'section' as const,
      attrs: match[1] ?? '',
      body: match[2] ?? '',
      full: match[0] ?? '',
    }))
    .filter((shell) => isSlideAttrs(shell.attrs));
  if (sections.length > 0) return sections;

  const opens = [...html.matchAll(/<div\b([^>]*)>/gi)]
    .filter((match) => attrsLookLikeDeckOrTemplateSlideHost(match[1] ?? ''));
  const out: SlideShell[] = [];
  for (let i = 0; i < opens.length; i += 1) {
    const open = opens[i]!;
    const start = (open.index ?? 0) + open[0].length;
    const end = i + 1 < opens.length ? (opens[i + 1]!.index ?? html.length) : html.length;
    let body = html.slice(start, end);
    const close = body.lastIndexOf('</div>');
    if (close >= 0) body = body.slice(0, close);
    out.push({
      tag: 'div',
      attrs: open[1] ?? '',
      body,
      full: `${open[0]}${body}</div>`,
    });
  }
  return out;
}

/**
 * Template Clone policy (Teamver):
 * - Do NOT copy the template's page count, order, or section lineup.
 * - Read each shell's layout/role/motif, then reuse the right shell for each
 *   content slide (cover vs list vs cards vs quote…).
 */
export type TemplateCloneShellRole =
  | 'cover'
  | 'list'
  | 'cards'
  | 'timeline'
  | 'stat'
  | 'quote'
  | 'team'
  | 'process'
  | 'closing'
  | 'body';

const TEMPLATE_CLONE_SHELL_ROLES: readonly TemplateCloneShellRole[] = [
  'cover',
  'list',
  'cards',
  'timeline',
  'stat',
  'quote',
  'team',
  'process',
  'closing',
  'body',
];

export function isTemplateCloneShellRole(value: unknown): value is TemplateCloneShellRole {
  return typeof value === 'string' && (TEMPLATE_CLONE_SHELL_ROLES as readonly string[]).includes(value);
}

/** True when model text looks like a full deck HTML dump instead of JSON outline. */
export function outlineLooksLikeHtmlDump(text: string): boolean {
  const sample = String(text ?? '').slice(0, 8000);
  if (/<!doctype\b/i.test(sample) || /<html\b/i.test(sample)) return true;
  if (/<section\b[^>]*\b(?:slide|s-[\w-]+)\b/i.test(sample)) return true;
  if (/<div\b[^>]*\b(?:slide|s-[\w-]+)\b/i.test(sample)) return true;
  if (/<style\b/i.test(sample) && /<\/style>/i.test(sample)) return true;
  return false;
}

function extractJsonObjectText(raw: string): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  let text = trimmed;
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  if (outlineLooksLikeHtmlDump(text)) return null;
  if (text.startsWith('{') && text.endsWith('}')) return text;
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse AI JSON outline for Clone slot-fill (0901-N02).
 * Returns null on HTML dumps, invalid shape, or empty slides after sanitize.
 */
export function parseTemplateCloneDeckOutline(
  raw: unknown,
): TemplateCloneDeckOutline | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (outlineLooksLikeHtmlDump(raw)) return null;
    const jsonText = extractJsonObjectText(raw);
    if (!jsonText) return null;
    try {
      value = JSON.parse(jsonText) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.slides)) return null;

  const slides: TemplateCloneSlideContent[] = [];
  for (const entry of record.slides) {
    if (slides.length >= TEMPLATE_CLONE_OUTLINE_MAX_SLIDES) break;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const slide = entry as Record<string, unknown>;
    const title = sanitizeTemplateCloneDeckTitle(
      typeof slide.title === 'string' ? slide.title : '',
    );
    if (!title) continue;
    const body =
      typeof slide.body === 'string'
        ? slide.body.replace(/\r\n/g, '\n').trimEnd()
        : undefined;
    const roleHint = isTemplateCloneShellRole(slide.roleHint)
      ? slide.roleHint
      : undefined;
    const next: TemplateCloneSlideContent = { title };
    if (body !== undefined && body.length > 0) next.body = body;
    if (roleHint) next.roleHint = roleHint;
    slides.push(next);
  }
  if (slides.length === 0) return null;

  const title =
    sanitizeTemplateCloneDeckTitle(
      typeof record.title === 'string' ? record.title : '',
    ) ??
    slides[0]!.title;

  return { title, slides };
}

/**
 * LOOK seed + AI JSON outline → filled deck HTML (0901-N02 B4).
 * Returns null when outline parse fails or seed has no slide shells.
 */
export function applyTemplateCloneSlotFill(
  seedHtml: string,
  rawOutline: unknown,
  options: { templateId?: string | null } = {},
): { html: string; title: string } | null {
  const outline = parseTemplateCloneDeckOutline(rawOutline);
  if (!outline) return null;
  const html = buildTemplateClonedDeckHtml(seedHtml, outline.slides, {
    title: outline.title,
    ...(options.templateId != null ? { templateId: options.templateId } : {}),
  });
  if (!html?.trim()) return null;
  return { html, title: outline.title };
}

export type TemplateCloneSlotFillTerminalDecision =
  | { kind: 'slot-fill'; html: string; title: string }
  | { kind: 'queue-repair' }
  | { kind: 'seed-fallback'; html: string; title: string }
  | { kind: 'abort' };

function titleForSeedFallback(rawFinalText: string, seedHtml: string): string {
  const raw = String(rawFinalText ?? '');
  const titleMatch = /"title"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(raw);
  if (titleMatch?.[1]) {
    try {
      const unescaped = JSON.parse(`"${titleMatch[1]}"`) as string;
      const cleaned = sanitizeTemplateCloneDeckTitle(unescaped);
      if (cleaned) return cleaned;
    } catch {
      const cleaned = sanitizeTemplateCloneDeckTitle(titleMatch[1]);
      if (cleaned) return cleaned;
    }
  }
  const seedTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(seedHtml)?.[1] ?? '';
  const fromSeed = sanitizeTemplateCloneDeckTitle(seedTitle.replace(/<[^>]+>/g, ' '));
  return fromSeed || '슬라이드';
}

/**
 * Terminal decision for Clone first-fill (0901-N02 B5 + D + 루프364).
 * Prefer LOOK seed slot-fill. On any non-fill outcome with a LOOK seed
 * (HTML dump OR soft-invalid JSON), return seed-fallback immediately —
 * never queue-repair. A one-shot repair AC painted durable incomplete_output
 * on the first turn (`reason=template-clone-slot-fill-json-repair`) and left
 * users there even when AC later started (루프359–362 residual). N02-D
 * forbids model HTML; LOOK seed is the only safe fallback.
 *
 * `repairAlreadyAttempted` is retained for call-site / test compat; with a
 * seed present it no longer gates a repair turn.
 */
export function decideTemplateCloneSlotFillTerminal(input: {
  rawFinalText: string;
  seedHtml: string | null | undefined;
  repairAlreadyAttempted: boolean;
  templateId?: string | null;
}): TemplateCloneSlotFillTerminalDecision {
  const seed = String(input.seedHtml ?? '').trim();
  const raw = String(input.rawFinalText ?? '');
  if (seed) {
    const filled = applyTemplateCloneSlotFill(seed, raw, {
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
    });
    if (filled) return { kind: 'slot-fill', html: filled.html, title: filled.title };
    // Soft-invalid JSON or HTML dump — keep LOOK seed (no repair AC churn).
    return {
      kind: 'seed-fallback',
      html: seed,
      title: titleForSeedFallback(raw, seed),
    };
  }
  // No LOOK seed — cannot slot-fill or fall back. Repair without a seed cannot
  // produce a deck either, so abort immediately (do not queue-repair).
  void input.repairAlreadyAttempted;
  return { kind: 'abort' };
}

/**
 * Clone first-fill persist skip reasons that mean "model output was too thin
 * to persist" (title-only, template leftover, empty bodies, catalog scaffold).
 *
 * When the terminal Clone content-fill turn hits one of these reasons and the
 * LOOK seed already lives on disk, the caller should recover to that seed
 * instead of leaving `incomplete_output`. The seed is a safe fallback because
 * `seedTemplateClonedDeck` persisted it before this turn started, and Clone
 * contract (N02-D) forbids persisting model HTML on the fill path.
 *
 * Non-Clone runs must keep the strict guard — this helper is only intended for
 * the Clone content-fill flow (guard the call site with the fill ref).
 */
export const CLONE_CONTENT_FILL_LOW_SUBSTANCE_PERSIST_REASONS: readonly string[] = [
  'low-substance deck artifact',
  'unfilled-catalog-example',
  'incomplete-html-document-shell',
];

/** Persist skip reason forced when Clone slot-fill armed a JSON repair AC. */
export const TEMPLATE_CLONE_SLOT_FILL_JSON_REPAIR_REASON =
  'template-clone-slot-fill-json-repair';

export function isCloneContentFillLowSubstancePersistReason(
  reason: unknown,
): boolean {
  if (typeof reason !== 'string') return false;
  const normalized = reason.trim().toLowerCase();
  if (!normalized) return false;
  return CLONE_CONTENT_FILL_LOW_SUBSTANCE_PERSIST_REASONS.some(
    (candidate) => candidate.toLowerCase() === normalized,
  );
}

/** True when persist was forced for the (now-retired) slot-fill JSON repair AC. */
export function isCloneContentFillJsonRepairPersistReason(
  reason: unknown,
): boolean {
  if (typeof reason !== 'string') return false;
  return reason.trim().toLowerCase() === TEMPLATE_CLONE_SLOT_FILL_JSON_REPAIR_REASON;
}

/**
 * Clone first-fill persist skip reasons that should recover to the on-disk
 * LOOK seed instead of leaving `incomplete_output` (low-substance + legacy
 * json-repair AC path).
 */
export function isCloneContentFillLookSeedRecoverablePersistReason(
  reason: unknown,
): boolean {
  return (
    isCloneContentFillLowSubstancePersistReason(reason)
    || isCloneContentFillJsonRepairPersistReason(reason)
  );
}

export function classifyTemplateCloneShellRole(shell: {
  attrs: string;
  body: string;
}): TemplateCloneShellRole {
  const hay = `${shell.attrs}\n${shell.body.slice(0, 800)}`;
  if (/\bslide-title\b|\bcover\b|\bhero\b|\btitle-box\b/i.test(hay)) return 'cover';
  if (/\bslide-quote\b|\bquote-text\b|\bquote-mark\b/i.test(hay)) return 'quote';
  if (/\bslide-timeline\b|\btimeline\b/i.test(hay)) return 'timeline';
  if (/\bslide-donut\b|\bslide-chart|\bdonut\b|\bchart-bar\b|\bkpi\b/i.test(hay)) return 'stat';
  if (/\bslide-team\b|\bteam-member\b|\bteam-avatar\b/i.test(hay)) return 'team';
  if (/\bslide-process\b|\bprocess-|\bstep-circle\b/i.test(hay)) return 'process';
  if (/\bslide-cards\b|\bslide-weekly\b|\bcards-grid\b|\binfo-card\b|\bweekly-grid\b/i.test(hay)) {
    return 'cards';
  }
  if (/\bslide-welcome\b|\bwelcome-list\b|<[uo]l\b/i.test(hay)) return 'list';
  if (/\bslide-closing\b|\bthanks\b|\bend\b|\bclosing\b/i.test(hay)) return 'closing';
  return 'body';
}

export function inferTemplateCloneContentRole(
  slide: TemplateCloneSlideContent,
  index: number,
  total: number,
): TemplateCloneShellRole {
  // 0901-N02 — explicit JSON roleHint wins when valid.
  if (slide.roleHint && isTemplateCloneShellRole(slide.roleHint)) {
    return slide.roleHint;
  }
  if (index === 0) return 'cover';
  const title = slide.title.trim();
  const body = slide.body?.trim() ?? '';
  const blob = `${title}\n${body}`;
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (index === total - 1 && total >= 3 && /다음|정리|요약|thanks|closing|wrap.?up|결론/i.test(title)) {
    return 'closing';
  }
  // Body shape wins over title keywords — a "KPI" slide with bullet lines
  // still needs a list shell so content-swap can land the bullets.
  if (lines.length >= 2 || /^[-*•·]/.test(body) || /^\d+[.)]/.test(body)) return 'list';
  if (/\bKPI\b|\d+\s*%|통계|지표|차트|수치/i.test(blob)) return 'stat';
  if (/타임라인|로드맵|일정|milestone|timeline|roadmap/i.test(blob)) return 'timeline';
  if (/팀|멤버|조직|people|team\b/i.test(title)) return 'team';
  if (/프로세스|절차|단계|process|steps?/i.test(title)) return 'process';
  if (body.length >= 100 && lines.length <= 1) return 'quote';
  if (lines.length === 1 && body.length < 100) return 'cards';
  return 'body';
}

function leastUsedShell(pool: SlideShell[], usage: Map<SlideShell, number>): SlideShell | null {
  if (pool.length === 0) return null;
  let best = pool[0]!;
  let bestUses = usage.get(best) ?? 0;
  for (const shell of pool) {
    const uses = usage.get(shell) ?? 0;
    if (uses < bestUses) {
      best = shell;
      bestUses = uses;
    }
  }
  return best;
}

/** Prefer info-card / cards-grid shells over weekly day-card chrome (0901-N02-C). */
function cardsShellFillScore(shell: SlideShell): number {
  // Do not truncate body — Daisy cards shells open with large SVG deco before
  // `.info-card`, so a short haystack falsely scores them below weekly.
  const attrs = shell.attrs;
  const body = shell.body;
  if (
    /\bslide-cards\b/i.test(attrs)
    || /\binfo-card\b/i.test(body)
    || /\bcards-grid\b/i.test(body)
  ) {
    return 3;
  }
  if (/\b(?:stat-card|feature-card|metric-card)\b/i.test(body)) return 2;
  if (/\bslide-weekly\b/i.test(attrs) || /\bweekly-grid\b/i.test(body) || /\bday-card\b/i.test(body)) {
    return 0;
  }
  if (shellBodyLooksLikeCardGrid(body)) return 1;
  return 0;
}

function leastUsedCardsShell(pool: SlideShell[], usage: Map<SlideShell, number>): SlideShell | null {
  if (pool.length === 0) return null;
  let best = pool[0]!;
  let bestUses = usage.get(best) ?? 0;
  let bestScore = cardsShellFillScore(best);
  for (const shell of pool) {
    const uses = usage.get(shell) ?? 0;
    const score = cardsShellFillScore(shell);
    if (score > bestScore || (score === bestScore && uses < bestUses)) {
      best = shell;
      bestUses = uses;
      bestScore = score;
    }
  }
  return best;
}

function pickShellByRole(
  role: TemplateCloneShellRole,
  byRole: Map<TemplateCloneShellRole, SlideShell[]>,
  cover: SlideShell,
  bodyPool: SlideShell[],
  usage: Map<SlideShell, number>,
): SlideShell {
  const fallbacks: TemplateCloneShellRole[] = (() => {
    switch (role) {
      case 'cover':
        return ['cover'];
      case 'list':
        return ['list', 'body', 'cards', 'process'];
      case 'cards':
        return ['cards', 'list', 'body'];
      case 'timeline':
        return ['timeline', 'process', 'list', 'body'];
      case 'stat':
        return ['stat', 'cards', 'body'];
      case 'quote':
        return ['quote', 'body'];
      case 'team':
        return ['team', 'cards', 'body'];
      case 'process':
        return ['process', 'timeline', 'list', 'body'];
      case 'closing':
        return ['closing', 'quote', 'body'];
      default:
        return ['body', 'list', 'cards', 'quote'];
    }
  })();

  if (role === 'cover') return cover;

  for (const candidateRole of fallbacks) {
    // Never reuse the cover shell for body roles — title layouts lack list/card slots.
    const pool = (byRole.get(candidateRole) ?? []).filter((shell) => shell !== cover);
    const best = role === 'cards' && candidateRole === 'cards'
      ? leastUsedCardsShell(pool, usage)
      : leastUsedShell(pool, usage);
    if (best) return best;
  }

  return leastUsedShell(bodyPool, usage) ?? cover;
}

/** Pick layout shells by content role — never mirror template page order/count. */
export function pickTemplateShellsForContent(
  shells: SlideShell[],
  slides: TemplateCloneSlideContent[],
): SlideShell[] {
  if (shells.length === 0) return [];
  if (slides.length === 0) return [shells[0]!];

  const byRole = new Map<TemplateCloneShellRole, SlideShell[]>();
  for (const shell of shells) {
    const role = classifyTemplateCloneShellRole(shell);
    const list = byRole.get(role) ?? [];
    list.push(shell);
    byRole.set(role, list);
  }
  const cover = byRole.get('cover')?.[0] ?? shells[0]!;
  const bodyPool = shells.filter((shell) => shell !== cover);
  const usage = new Map<SlideShell, number>();
  const picked: SlideShell[] = [];

  for (let i = 0; i < slides.length; i += 1) {
    const role = inferTemplateCloneContentRole(slides[i]!, i, slides.length);
    const shell = pickShellByRole(role, byRole, cover, bodyPool, usage);
    picked.push(shell);
    usage.set(shell, (usage.get(shell) ?? 0) + 1);
  }
  return picked;
}

/** Replace the first text node after a tag close; never rewrite tag innards. */
function replaceFirstTextRun(inner: string, text: string): string {
  const escaped = escapeHtml(text);
  if (!/<[a-zA-Z]/.test(inner)) return escaped;
  // Single wrapper element: recurse into its children (span/em/strong…).
  const wrapped = /^\s*(<([a-zA-Z][\w:-]*)\b[^>]*>)([\s\S]*?)(<\/\2>)\s*$/i.exec(inner);
  if (wrapped?.[1] && wrapped[3] != null && wrapped[4]) {
    return `${wrapped[1]}${replaceFirstTextRun(wrapped[3], text)}${wrapped[4]}`;
  }
  // Otherwise replace the first text run that sits between tags: `>text<`.
  let done = false;
  const next = inner.replace(/(>)([^<]+)(<)/g, (full, gt: string, chunk: string, lt: string) => {
    if (done || !chunk.trim()) return full;
    done = true;
    return `${gt}${escaped}${lt}`;
  });
  return done ? next : escaped;
}

function replaceFirstTagText(html: string, tag: string, text: string): string {
  const re = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(<\\/${tag}>)`, 'i');
  if (!re.test(html)) return html;
  return html.replace(re, (_match, open: string, inner: string, close: string) => (
    `${open}${replaceFirstTextRun(inner, text)}${close}`
  ));
}

function isPlaceholderCloneBody(body?: string): boolean {
  const text = String(body ?? '').trim();
  if (!text) return true;
  return text.split(/\r?\n/).every((line) => /^(?:…|\.{3}|⋯|\s)*$/u.test(line.trim()));
}

function headingLooksLikeDemoSentence(inner: string): boolean {
  const plain = String(inner ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length >= 24 || /\bthat\b|[.。]\s*$/i.test(plain)) return true;
  // Cover-style `Project <em>Atlas</em>` — first-run swap would leave English.
  return /<(?:em|i)\b/i.test(inner) && /[A-Za-z]{3,}/.test(plain);
}

/** Full heading swap when the shell is a demo sentence (`A DCF that …`). */
function replaceHeadingText(html: string, tag: string, text: string): string {
  const re = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(<\\/${tag}>)`, 'i');
  if (!re.test(html)) return html;
  return html.replace(re, (_match, open: string, inner: string, close: string) => {
    if (headingLooksLikeDemoSentence(inner)) {
      return `${open}${escapeHtml(text)}${close}`;
    }
    return `${open}${replaceFirstTextRun(inner, text)}${close}`;
  });
}

function stripClassBlocks(html: string, className: string): string {
  const openTagRe = new RegExp(
    `<(div|span|p|header|footer|small|strong|em|i|blockquote|figure|figcaption|aside)\\b([^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*)>`,
    'gi',
  );
  let out = html;
  let guard = 500;
  while (guard > 0) {
    guard -= 1;
    const match = openTagRe.exec(out);
    if (!match) break;
    const tag = (match[1] ?? '').toLowerCase();
    const openStart = match.index;
    const openEnd = openStart + match[0].length;
    // Depth-count same-tag nesting so `<div class="alt">…<div>…</div>…</div>`
    // strips the whole outer block. The previous non-greedy regex used to
    // close on the very first `</div>` and leave dangling tag soup behind
    // (that soup then defeated `<div class="stage">` hoist heuristics
    // downstream — see 0826-N01-2 §F1-a note).
    const nested = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    nested.lastIndex = openEnd;
    let depth = 1;
    let closeEnd = -1;
    let inner: RegExpExecArray | null;
    while ((inner = nested.exec(out)) !== null) {
      if (inner[0]!.startsWith('</')) {
        depth -= 1;
        if (depth === 0) {
          closeEnd = inner.index + inner[0]!.length;
          break;
        }
      } else if (!inner[0]!.endsWith('/>')) {
        depth += 1;
      }
    }
    if (closeEnd < 0) break;
    out = out.slice(0, openStart) + out.slice(closeEnd);
    openTagRe.lastIndex = openStart;
  }
  return out;
}

function emptyClassInners(html: string, className: string): string {
  const re = new RegExp(
    `(<(div|span|p)\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>)[\\s\\S]*?(<\\/\\2>)`,
    'gi',
  );
  return html.replace(re, '$1$3');
}

/** Deck chrome outside slide shells — demo disclaimer, pitch-agent stamp. */
export function stripDeckLevelDemoChrome(html: string): string {
  return String(html ?? '').replace(
    /<(div|aside|p|header|section)\b([^>]*\bclass\s*=\s*["'][^"']*\b(?:demo-banner|agent-stamp|demo-pill)\b[^"']*["'][^>]*)>[\s\S]*?<\/\1>/gi,
    '',
  );
}

const HOST_TOP_UP_SENTINEL_RE = /\[od:slide_count_top_up\]|<!--\s*od:slide_count_top_up\s*-->/gi;
const HOST_TOP_UP_INSTRUCTION_LINE_RE =
  /(?:The current deck is a CLOSED \d+-slide deliverable|This is an explicit slide-count expansion|APPEND only new slides|Do NOT rewrite the saved deck|Emit ONLY the new)[^\n<]*/gi;
const EMPTY_NESTED_ARTIFACT_RE = /<artifact\b[^>]*>\s*<\/artifact>/gi;
const LEFTOVER_MOTIF_COPY_RE =
  /Hartfield|NorthPeak Industries|Filebase|Project Atlas|WACC\s*\(/i;

/** Hidden top-up / artifact protocol the model copies into deck.html. */
export function stripHostProtocolLeakFromDeckHtml(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  out = out.replace(HOST_TOP_UP_SENTINEL_RE, '');
  out = out.replace(HOST_TOP_UP_INSTRUCTION_LINE_RE, '');
  out = out.replace(EMPTY_NESTED_ARTIFACT_RE, '');
  return out;
}

/**
 * Motif bind can re-inject IB stamp copy (`Hartfield & Co.`) after the
 * leftover persist gate. Empty the text; keep the deco shell.
 */
export function stripLeftoverMotifDemoCopy(html: string): string {
  return String(html ?? '').replace(
    /<(div|span|p|b)\b([^>]*\bclass\s*=\s*["'][^"']*\b(?:who|det|lab)\b[^"']*["'][^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs: string, inner: string) => (
      LEFTOVER_MOTIF_COPY_RE.test(inner) || LEFTOVER_MOTIF_COPY_RE.test(full)
        ? `<${tag}${attrs}></${tag}>`
        : full
    ),
  );
}

/** Persist/preview: protocol leaks + leftover motif demo copy. */
export function sanitizePersistedDeckHostLeaks(html: string): string {
  return stripEmptyOfficialMotifInstances(
    salvageMalformedMiniMaxSlideMarkup(
      stripLeftoverMotifDemoCopy(stripHostProtocolLeakFromDeckHtml(html)),
    ),
  );
}

const BROKEN_EMPTY_ATTR_OPEN_RE = /<([a-zA-Z][\w-]*)=""(?=[\s>])/g;
const BROKEN_EMPTY_ATTR_CLOSE_RE = /<\/([a-zA-Z][\w-]*)="">/g;
const LEAKED_LABEL_AFTER_TITLE_RE =
  /(<div\b[^>]*>)([^<]*·\s*([^<]{1,48}))<\/div>\s*·\s*\3\s*<\/div>/gi;
const LEAKED_LABEL_AFTER_CLOSE_RE =
  /<\/(div|p|span)>\s*·\s*[^<>]{1,48}<\/\1>/gi;
const PREMATURE_AUTO_AUTO_1FR_CARD_RE =
  /(<div\b[^>]*grid-template-rows:\s*auto\s+auto\s+1fr[^>]*>)([\s\S]*?<\/div>\s*<div\b[^>]*>[\s\S]*?<\/div>)\s*<\/div>\s*(<div\b[^>]*>[\s\S]*?<\/div>)\s*<\/div>/gi;
const EARLY_NUMBERED_OL_CLOSE_RE =
  /<\/ol>(\s*<\/div>)((?:\s*<li\b[^>]*grid-template-columns:\s*64px[\s\S]*?<\/li>)+)/gi;
const LOOK_NEUTRALIZE_TAIL_RE = /\n?\/\*\s*stacked preview\/export:[\s\S]*$/i;
const POSTER_SLIDE_KIND_RE =
  /\bs-(?:cover|chapter|data|manifesto|programme|quote|cal|colophon)\b/i;

function officialLookCssBodiesFromDeck(html: string): string {
  return [...String(html ?? '').matchAll(
    /<style\b[^>]*\bdata-od-official-look-css\b[^>]*>([\s\S]*?)<\/style>/gi,
  )].map((match) => match[1] ?? '').join('\n');
}

function lookCssWithoutNeutralize(html: string): string {
  return officialLookCssBodiesFromDeck(html).replace(LOOK_NEUTRALIZE_TAIL_RE, '');
}

function officialLookIsIbMagazine(html: string): boolean {
  const css = lookCssWithoutNeutralize(html);
  if (!css.trim()) return false;
  if (/h1\.display\s*\{/i.test(css)) return true;
  return (
    /\.cover\s+\.ribbon/i.test(css)
    && /\.cover-meta/i.test(css)
    && /\.mast\s*\{/i.test(css)
  );
}

function destHasPosterSlideKinds(html: string): boolean {
  return POSTER_SLIDE_KIND_RE.test(html);
}

function officialLookIsBiennaleYellow(html: string): boolean {
  const css = lookCssWithoutNeutralize(html);
  if (/\.sunglow\b/i.test(css) && /\.s-cover\b/i.test(css)) return true;
  // MiniMax / reduced look sheets keep the sun token before `.sunglow` lands.
  return /--sun\s*:\s*#F1EE2E/i.test(css) && /--paper\s*:/i.test(css);
}

/** Instruction leftovers MiniMax parks on cover titles (`연습 팁에 대한`). */
export function polishInstructionCoverTitle(raw: string): string {
  return String(raw ?? '')
    .replace(/[,，]?\s*예시에?\s*대한$/u, '')
    .replace(/[,，]\s*예시에?$/u, '')
    .replace(/\s*에\s*대한$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBalancedFrom(html: string, start: number): string | null {
  const openMatch = /^<([a-zA-Z][\w-]*)\b[^>]*>/.exec(html.slice(start));
  if (!openMatch) return null;
  const tag = openMatch[1] ?? 'div';
  if (/\/\s*>$/.test(openMatch[0])) return openMatch[0];
  const end = findMatchingClose(html, start + openMatch[0].length, tag);
  return end > start ? html.slice(start, end) : null;
}

function countDirectChildOpens(inner: string): number {
  const source = String(inner ?? '');
  const openRe = /<([a-zA-Z][\w-]*)\b[^>]*>/g;
  let count = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while (i < source.length) {
    openRe.lastIndex = i;
    match = openRe.exec(source);
    if (!match) break;
    const tag = match[1] ?? '';
    if (/^(?:br|img|hr|meta|input|source|path|use)$/i.test(tag)) {
      i = match.index + match[0].length;
      continue;
    }
    const block = extractBalancedFrom(source, match.index);
    if (!block) break;
    count += 1;
    i = match.index + block.length;
  }
  return count;
}

function repairBareHeadingCloses(html: string): string {
  return String(html ?? '').replace(/<\/h\s*>/gi, (_full, offset: number) => {
    const before = html.slice(0, offset);
    const opens = [...before.matchAll(/<h([1-3])\b/gi)];
    const last = opens[opens.length - 1];
    return last?.[1] ? `</h${last[1]}>` : '';
  });
}

function collapseHeadingBreaks(inner: string): string {
  return String(inner ?? '').replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br>');
}

function unwrapBlocksFromHeadings(html: string): string {
  return String(html ?? '').replace(
    /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_full, level: string, attrs: string, inner: string) => {
      const block = /<(div|ul|ol|section|article|aside|table|header|footer)\b/i.exec(inner);
      if (!block || block.index == null) {
        return `<h${level}${attrs}>${collapseHeadingBreaks(inner)}</h${level}>`;
      }
      const head = collapseHeadingBreaks(inner.slice(0, block.index)).trim();
      const rest = inner.slice(block.index);
      return `<h${level}${attrs}>${head}</h${level}>${rest}`;
    },
  );
}

function collapseSparseRepeatGrids(html: string): string {
  let out = String(html ?? '');
  const openRe = /<div\b[^>]*grid-template-columns:\s*repeat\(\s*(\d+)\s*,[^)]*\)[^>]*>/gi;
  const starts: Array<{ start: number; count: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    starts.push({ start: match.index, count: Number(match[1] ?? 0) });
  }
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const { start, count } = starts[i]!;
    if (!(count >= 2)) continue;
    const block = extractBalancedFrom(out, start);
    if (!block) continue;
    const open = /^<div\b[^>]*>/i.exec(block)?.[0] ?? '';
    const inner = block.slice(open.length).replace(/<\/div\s*>$/i, '');
    const children = countDirectChildOpens(inner);
    if (children < 1 || children >= count) continue;
    const nextOpen = open.replace(
      /grid-template-columns:\s*repeat\(\s*\d+\s*,/i,
      `grid-template-columns:repeat(${children},`,
    );
    out = `${out.slice(0, start)}${nextOpen}${block.slice(open.length)}${out.slice(start + block.length)}`;
  }
  return out;
}

function rewriteStyleAttr(open: string, rewrite: (style: string) => string): string {
  if (/\bstyle\s*=/i.test(open)) {
    return open.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, style: string) => `style=${q}${rewrite(String(style))}${q}`,
    );
  }
  const next = rewrite('');
  return open.replace(/>$/, ` style="${next}">`);
}

function pinDecorativeGradientOverlays(html: string): string {
  return String(html ?? '').replace(
    /<div\b([^>]*\bradial-gradient\b[^>]*)>/gi,
    (open) => {
      if (!/pointer-events\s*:\s*none/i.test(open)) return open;
      if (!/width\s*:\s*(?:[3-9]\d{2}|[1-9]\d{3})px/i.test(open)) return open;
      if (/position\s*:\s*absolute/i.test(open)) return open;
      return rewriteStyleAttr(open, (style) => (
        `${style.replace(/(?:^|;)\s*position\s*:[^;]*/i, '').replace(/^;|;$/g, '')}`
        + `${style && !style.endsWith(';') ? ';' : ''}position:absolute;top:0;right:0`
      ));
    },
  );
}

function healOrphanRadialCircles(html: string): string {
  let out = String(html ?? '').replace(
    /<div\b([^>]*border-radius\s*:\s*50%[^>]*)>/gi,
    (open) => {
      if (!/radial-gradient/i.test(open)) return open;
      if (/width\s*:/i.test(open)) return open;
      return rewriteStyleAttr(open, (style) => (
        `${style}${style && !style.endsWith(';') ? ';' : ''}width:100%;height:100%`
      ));
    },
  );
  return out.replace(
    /<div\b([^>]*translate\(\s*-50%\s*,\s*-50%[^>]*)>/gi,
    (open) => {
      if (/position\s*:\s*absolute/i.test(open)) return open;
      return rewriteStyleAttr(open, (style) => (
        `${style.replace(/(?:^|;)\s*position\s*:[^;]*/i, '').replace(/^;|;$/g, '')}`
        + `${style && !style.endsWith(';') ? ';' : ''}position:absolute;top:50%;left:50%`
      ));
    },
  );
}

function slideBodyLooksEmpty(body: string): boolean {
  const content = String(body ?? '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' SVG ');
  const text = content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  if (text.length >= 2) return false;
  if (/<(?:img|video|canvas|iframe|table|svg)\b/i.test(body)) return false;
  return true;
}

export function dropEmptyDeckSlides(html: string): string {
  const dest = String(html ?? '');
  const spans = listHealSlideHostSpans(dest);
  if (spans.length < 2) return dest;
  let out = dest;
  for (let i = spans.length - 1; i >= 1; i -= 1) {
    const span = spans[i]!;
    const body = out.slice(span.bodyStart, span.bodyEnd);
    if (!slideBodyLooksEmpty(body)) continue;
    const close = out.slice(span.bodyEnd).match(new RegExp(`^</${span.tag}\\s*>`, 'i'));
    const end = span.bodyEnd + (close?.[0].length ?? 0);
    out = `${out.slice(0, span.start)}${out.slice(end)}`;
  }
  return out;
}

function attachHangulParticles(text: string): string {
  return String(text ?? '').replace(
    /([\uac00-\ud7af])\s+(를|을|이|가|은|는|에|의|와|과|도|로|으로|께|께서|한테|에서|부터|까지|만|보다|처럼|같이|마다|뿐|씩|이나|나|든지|라도|이든|든|밖에)(?=[\s<.,!?'")\]}]|$)/g,
    '$1$2',
  );
}

function formatBiennaleCoverTitle(title: string): string {
  const parts = attachHangulParticles(title).split(/\s+/).filter(Boolean);
  if (parts.length >= 4) {
    return `${escapeHtml(parts.slice(0, -2).join(' '))}<br><em>${escapeHtml(parts.slice(-2).join(' '))}</em>`;
  }
  if (parts.length >= 2) {
    return `${escapeHtml(parts.slice(0, -1).join(' '))}<br><em>${escapeHtml(parts[parts.length - 1]!)}</em>`;
  }
  return escapeHtml(title);
}

function coverHasIbDisplayHeading(body: string): boolean {
  return /<h1\b[^>]*\bdisplay\b/i.test(body);
}

function coverHasIbMagazineChrome(attrs: string, body: string): boolean {
  if (/\b(?:mast|ribbon|cover-meta)\b/i.test(body)) return true;
  return /\bcover\b/i.test(attrs) && /\b(?:foot|subhead)\b/i.test(body);
}

function coverAlreadyBiennalePoster(attrs: string, body: string): boolean {
  return /\bs-cover\b/i.test(attrs) && /\b(?:titlewrap|sunglow)\b/i.test(body);
}

/**
 * Persist stamps IB magazine chrome onto Biennale/poster kits before look
 * CSS lands. Restyle that cover with the official poster slots only.
 * MiniMax often copies ribbon/`h1.display`/cover-meta without `.mast`.
 */
export function restyleForeignIbMagazineCover(html: string): string {
  const dest = String(html ?? '');
  if (!dest.trim() || officialLookIsIbMagazine(dest)) return dest;
  const biennale = officialLookIsBiennaleYellow(dest);
  if (!biennale && !destHasPosterSlideKinds(dest)) return dest;
  const spans = listHealSlideHostSpans(dest);
  if (spans.length === 0) return dest;
  const first = spans[0]!;
  const body = dest.slice(first.bodyStart, first.bodyEnd);
  if (coverAlreadyBiennalePoster(first.attrs, body)) return dest;
  if (!coverHasIbDisplayHeading(body) || !coverHasIbMagazineChrome(first.attrs, body)) {
    return dest;
  }
  // No-mast leftover chrome is Biennale-only. Poster-kind alone is too
  // broad for Daisy/Studio decks that also happen to have s-chapter.
  if (!/\bmast\b/i.test(body) && !biennale) return dest;
  const title = polishInstructionCoverTitle(
    (body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (title.length < 2) return dest;
  const subhead = polishInstructionCoverTitle(
    (body.match(/<(?:p|div)\b[^>]*\bsubhead\b[^>]*>([\s\S]*?)<\/(?:p|div)>/i)?.[1] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  const subline = attachHangulParticles(subhead);
  const inner = biennale
    ? `<div class="blocks" aria-hidden="true"><div class="b1"></div><div class="b2"></div><div class="b3"></div><div class="b4"></div></div>`
      + `<div class="sunglow" aria-hidden="true"></div><div class="titlewrap"><h1 class="title">${formatBiennaleCoverTitle(title)}</h1>${
        subline ? `<div class="subline">${escapeHtml(subline)}</div>` : ''
      }</div>`
    : `<h1 class="title">${escapeHtml(attachHangulParticles(title))}</h1>${
      subline ? `<p class="subhead">${escapeHtml(subline)}</p>` : ''
    }`;
  const close = dest.slice(first.bodyEnd).match(new RegExp(`^</${first.tag}\\s*>`, 'i'));
  const end = first.bodyEnd + (close?.[0].length ?? 0);
  return (
    `${dest.slice(0, first.start)}<${first.tag} class="slide s-cover" ` +
    `style="width:1920px;height:1080px;box-sizing:border-box;overflow:visible;` +
    `position:relative;background:var(--paper);color:var(--ink)">${inner}` +
    `</${first.tag}>${dest.slice(end)}`
  );
}

function isOverlayOrbOpen(open: string): boolean {
  const style = /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i.exec(open)?.[2] ?? '';
  if (/translate\(\s*-50%\s*,\s*-50%\s*\)/i.test(style)) return true;
  if (/\bborder-radius\s*:\s*50%/i.test(style) && /radial-gradient/i.test(style)) {
    return true;
  }
  const width = style.match(/\bwidth\s*:\s*(\d+)px/i);
  const height = style.match(/\bheight\s*:\s*(\d+)px/i);
  return Boolean(
    width && height && width[1] === height[1] && Number(width[1]) >= 400,
  );
}

function listTopLevelBlocks(inner: string): string[] {
  const source = String(inner ?? '');
  const blocks: string[] = [];
  let i = 0;
  while (i < source.length) {
    const rel = source.slice(i).search(/<[a-zA-Z]/);
    if (rel < 0) break;
    if (rel > 0 && source.slice(i, i + rel).trim()) {
      blocks.push(source.slice(i, i + rel));
    }
    const abs = i + rel;
    const block = extractBalancedFrom(source, abs);
    if (!block) break;
    blocks.push(block);
    i = abs + block.length;
  }
  return blocks;
}

function splitOverlayAndContent(body: string): { overlays: string[]; content: string[] } {
  const overlays: string[] = [];
  const content: string[] = [];
  for (const part of listTopLevelBlocks(body)) {
    const open = /^<[a-zA-Z][\w-]*\b[^>]*>/.exec(part)?.[0] ?? '';
    if (open && isOverlayOrbOpen(open)) overlays.push(part);
    else if (part.trim()) content.push(part);
  }
  return { overlays, content };
}

function parseHeadingBlock(block: string): { level: string; inner: string } | null {
  const open = /^<h([1-3])\b[^>]*>/i.exec(block);
  if (!open) return null;
  return {
    level: open[1] ?? '2',
    inner: block.replace(/^<h[1-3]\b[^>]*>/i, '').replace(/<\/h[1-3]\s*>$/i, ''),
  };
}

function unwrapFlowShell(block: string): string {
  const trimmed = String(block ?? '').trim();
  const match = /^<(div|p)\b[^>]*>([\s\S]*)<\/\1\s*>$/i.exec(trimmed);
  return match ? String(match[2] ?? '').trim() : trimmed;
}

function flattenSparseCardHosts(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const open = /^<div\b[^>]*>/i.exec(part)?.[0] ?? '';
    if (open && /grid-template-columns/i.test(open)) {
      const inner = part.replace(/^<div\b[^>]*>/i, '').replace(/<\/div\s*>$/i, '');
      const kids = listTopLevelBlocks(inner).filter((item) => item.trim());
      if (kids.length >= 1 && kids.length <= 4) {
        out.push(...kids);
        continue;
      }
    }
    out.push(part);
  }
  return out;
}

function looksLikeChartOrMedia(part: string): boolean {
  return /<(?:svg|table|video|canvas|iframe)\b/i.test(part)
    || /<(?:div|section)\b[^>]*\b(?:chart|ledger)\b/i.test(part);
}

function restyleBiennaleStatCard(card: string): string {
  const inner = unwrapFlowShell(card);
  const kids = listTopLevelBlocks(inner).filter((part) => part.trim());
  if (kids.length >= 2) {
    const label = attachHangulParticles(unwrapFlowShell(kids[0]!));
    const value = attachHangulParticles(unwrapFlowShell(kids[1]!));
    const extra = kids.slice(2).map((kid) => (
      `<div class="desc">${attachHangulParticles(unwrapFlowShell(kid))}</div>`
    )).join('');
    return `<div class="stat"><div class="caption lab2">${label}</div><div class="v">${value}</div>${extra}</div>`;
  }
  const html = attachHangulParticles(inner);
  const text = officialMotifVisibleText(html);
  if (text.length <= 32) return `<div class="stat"><div class="v">${html}</div></div>`;
  return `<div class="stat"><div class="desc">${html}</div></div>`;
}

/**
 * Sparse MiniMax s-chapter bodies stay default-sized on the 16:9 canvas.
 * Bind the existing heading + lede to official `.stack` / `.ttl` / `.lede`
 * so look CSS can scale them. Do not invent chapter numbers or vrail copy.
 */
export function restyleBiennaleSparseChapterBodies(html: string): string {
  const dest = String(html ?? '');
  if (!dest.trim() || !officialLookIsBiennaleYellow(dest)) return dest;
  const spans = listHealSlideHostSpans(dest);
  let out = dest;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]!;
    if (!/\bs-chapter\b/i.test(span.attrs)) continue;
    const body = out.slice(span.bodyStart, span.bodyEnd);
    if (/\b(?:stack|ttl|vrail)\b/i.test(body)) continue;
    const { overlays, content } = splitOverlayAndContent(body);
    if (content.length === 0 || content.length > 2) continue;
    if (content.some((part) => /grid-template-columns/i.test(part))) continue;
    const heading = content.find((part) => /^<h[1-3]\b/i.test(part));
    if (!heading) continue;
    const parsed = parseHeadingBlock(heading);
    if (!parsed) continue;
    const lede = content.find((part) => part !== heading);
    let ledeInner = '';
    if (lede) {
      if (!/^<(?:p|div)\b/i.test(lede)) continue;
      ledeInner = unwrapFlowShell(lede);
    }
    const stack = (
      `<div class="glow" aria-hidden="true"></div>`
      + `<div class="stack">`
      + `<h${parsed.level} class="ttl">${attachHangulParticles(parsed.inner)}</h${parsed.level}>`
      + (ledeInner ? `<div class="lede">${attachHangulParticles(ledeInner)}</div>` : '')
      + `</div>`
      + overlays.join('')
    );
    out = `${out.slice(0, span.bodyStart)}${stack}${out.slice(span.bodyEnd)}`;
  }
  return out;
}

/**
 * After a 4-col ritual grid collapses to one card, s-data still sits in the
 * corner of the 16:9. Bind the existing heading + cards to official
 * `.frame` / `.head` / `.stat` slots. Do not invent a chart column or extra cards.
 */
export function restyleBiennaleSparseDataBodies(html: string): string {
  const dest = String(html ?? '');
  if (!dest.trim() || !officialLookIsBiennaleYellow(dest)) return dest;
  const spans = listHealSlideHostSpans(dest);
  let out = dest;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]!;
    if (!/\bs-data\b/i.test(span.attrs)) continue;
    const body = out.slice(span.bodyStart, span.bodyEnd);
    if (/\b(?:frame|stat|chart)\b/i.test(body)) continue;
    const { overlays, content } = splitOverlayAndContent(body);
    if (content.length === 0) continue;
    const heading = content.find((part) => /^<h[1-3]\b/i.test(part));
    if (!heading) continue;
    const parsed = parseHeadingBlock(heading);
    if (!parsed) continue;
    const cards = flattenSparseCardHosts(content.filter((part) => part !== heading));
    if (cards.length > 4) continue;
    if (cards.some((part) => looksLikeChartOrMedia(part))) continue;
    if (cards.some((part) => !/^<(?:p|div)\b/i.test(part))) continue;
    const stats = cards.map((card) => restyleBiennaleStatCard(card)).join('');
    const frame = (
      `<div class="glow" aria-hidden="true"></div>`
      + `<div class="frame">`
      + `<div class="head"><div class="h">${attachHangulParticles(parsed.inner)}</div></div>`
      + (stats ? `<div class="col-a">${stats}</div>` : '')
      + `</div>`
      + overlays.join('')
    );
    out = `${out.slice(0, span.bodyStart)}${frame}${out.slice(span.bodyEnd)}`;
  }
  return out;
}

/**
 * Sparse quote / manifesto slides keep default paragraph size. Bind existing
 * copy to official `.qwrap` / `.quote` slots. Do not invent kickers or marks
 * beyond the empty yellow `yblock` / `haze` paint.
 */
export function restyleBiennaleSparseQuoteBodies(html: string): string {
  const dest = String(html ?? '');
  if (!dest.trim() || !officialLookIsBiennaleYellow(dest)) return dest;
  const spans = listHealSlideHostSpans(dest);
  let out = dest;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]!;
    const quoteSlide = /\bs-quote\b/i.test(span.attrs);
    const manifesto = /\bs-manifesto\b/i.test(span.attrs);
    if (!quoteSlide && !manifesto) continue;
    const body = out.slice(span.bodyStart, span.bodyEnd);
    if (quoteSlide && /\b(?:qwrap|qbody)\b/i.test(body)) continue;
    if (manifesto && /<(?:p|div)\b[^>]*\bquote\b/i.test(body)) continue;
    const { overlays, content } = splitOverlayAndContent(body);
    if (content.length === 0 || content.length > 3) continue;
    if (content.some((part) => /grid-template-columns/i.test(part))) continue;
    const heading = content.find((part) => /^<h[1-3]\b/i.test(part));
    const rest = content.filter((part) => part !== heading);
    if (rest.length === 0) continue;
    const quote = rest[0]!;
    if (!/^<(?:p|div)\b/i.test(quote)) continue;
    const quoteInner = attachHangulParticles(unwrapFlowShell(quote));
    if (officialMotifVisibleText(quoteInner).length < 8) continue;
    const attr = rest[1];
    if (attr && !/^<(?:p|div)\b/i.test(attr)) continue;
    const attrInner = attr ? attachHangulParticles(unwrapFlowShell(attr)) : '';
    const kicker = heading ? attachHangulParticles(parseHeadingBlock(heading)?.inner ?? '') : '';
    const next = quoteSlide
      ? (
        `<div class="yblock" aria-hidden="true"></div>`
        + `<div class="glow" aria-hidden="true"></div>`
        + `<div class="qwrap">`
        + (kicker ? `<div class="caption qkicker">${kicker}</div>` : '')
        + `<p class="qbody">${quoteInner}</p>`
        + (attrInner ? `<div class="qattr"><div class="caption role">${attrInner}</div></div>` : '')
        + `</div>`
        + `<div class="y-mark" aria-hidden="true">¨</div>`
        + overlays.join('')
      )
      : (
        `<div class="haze" aria-hidden="true"></div>`
        + `<p class="quote">${quoteInner}</p>`
        + (attrInner ? `<div class="attr">${attrInner}</div>` : '')
        + overlays.join('')
      );
    out = `${out.slice(0, span.bodyStart)}${next}${out.slice(span.bodyEnd)}`;
  }
  return out;
}

const BIENNALE_SPARSE_FILL_MARK = 'data-od-biennale-sparse-fill';
const BIENNALE_SPARSE_FILL_CSS = [
  '.s-cover:not(:has(.footer-row)) .titlewrap{bottom:clamp(48px,6vh,96px)}',
  '.s-chapter .stack:not(:has(.nm)){left:clamp(40px,4vw,76px)}',
  '.s-chapter .stack:not(:has(.nm)) .ttl{font-size:clamp(64px,min(8vw,14vh),160px);max-width:92%}',
  '.s-data .frame:not(:has(.chart)){grid-template-columns:1fr}',
  '.s-data .frame:not(:has(.chart)) .head,.s-data .frame:not(:has(.chart)) .col-a{grid-column:1/-1}',
].join('');

/**
 * Official look CSS sizes chapter `.ttl` and cover `.titlewrap` around
 * optional chrome (`.nm`, `.footer-row`, `.chart`). MiniMax often omits
 * those slots — shift existing copy to fill the 16:9. No invented text.
 */
export function injectBiennaleSparseFillCss(html: string): string {
  const dest = String(html ?? '');
  if (!dest.trim() || !officialLookIsBiennaleYellow(dest)) return dest;
  if (dest.includes(BIENNALE_SPARSE_FILL_MARK)) return dest;
  const tag = `<style ${BIENNALE_SPARSE_FILL_MARK}>${BIENNALE_SPARSE_FILL_CSS}</style>`;
  if (/<\/head>/i.test(dest)) return dest.replace(/<\/head>/i, `${tag}</head>`);
  if (/<\/body>/i.test(dest)) return dest.replace(/<\/body>/i, `${tag}</body>`);
  return `${dest}${tag}`;
}

/**
 * MiniMax often emits `<p="">`, leaked `· Label` twins, a card `</div>`
 * before the body, or `</ol>` after step 01. Restore those tags only —
 * do not rewrite copy or reparent catalog TOC lists.
 */
export function salvageMalformedMiniMaxSlideMarkup(html: string): string {
  let next = String(html ?? '');
  if (!next) return next;
  next = next.replace(BROKEN_EMPTY_ATTR_OPEN_RE, '<$1');
  next = next.replace(BROKEN_EMPTY_ATTR_CLOSE_RE, '</$1>');
  next = next.replace(LEAKED_LABEL_AFTER_TITLE_RE, '$1$2</div>');
  next = next.replace(LEAKED_LABEL_AFTER_CLOSE_RE, '</$1>');
  next = next.replace(PREMATURE_AUTO_AUTO_1FR_CARD_RE, '$1$2$3</div>');
  next = next.replace(EARLY_NUMBERED_OL_CLOSE_RE, '$2</ol>$1');
  next = repairBareHeadingCloses(next);
  next = unwrapBlocksFromHeadings(next);
  next = collapseSparseRepeatGrids(next);
  next = pinDecorativeGradientOverlays(next);
  next = healOrphanRadialCircles(next);
  next = dropEmptyDeckSlides(next);
  next = restyleForeignIbMagazineCover(next);
  next = restyleBiennaleSparseChapterBodies(next);
  next = restyleBiennaleSparseDataBodies(next);
  next = restyleBiennaleSparseQuoteBodies(next);
  next = injectBiennaleSparseFillCss(next);
  next = salvageOrphan2x2GridCards(next);
  return next;
}

function gridLooksLikeOfficial2x2(attrs: string): boolean {
  return (
    /grid-template-columns\s*:\s*(?:1fr\s+1fr(?!\s+1fr)|repeat\(\s*2\s*,\s*1fr\s*\))/i.test(attrs)
    && /grid-template-rows\s*:\s*(?:1fr\s+1fr(?!\s+1fr)|repeat\(\s*2\s*,\s*1fr\s*\))/i.test(attrs)
  );
}

function visibleCardText(html: string): string {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSlideChromeFooterCard(html: string): boolean {
  const open = /^<[^>]+>/.exec(html)?.[0] ?? '';
  if (/\b(?:page|pagenum|footer|footer-row|date-rail|slide-meta)\b/i.test(open)) return true;
  return /^(?:PAGE|P\.?)\s*\d+/i.test(visibleCardText(html));
}

function listDirectChildRanges(html: string, innerStart: number, innerEnd: number): HtmlSpan[] {
  const ranges: HtmlSpan[] = [];
  let i = innerStart;
  while (i < innerEnd) {
    const rel = html.slice(i, innerEnd).search(/<[a-zA-Z]/);
    if (rel < 0) break;
    const start = i + rel;
    const open = /^<([a-zA-Z][\w:-]*)\b[^>]*>/.exec(html.slice(start, innerEnd));
    if (!open) break;
    const tag = open[1]!;
    if (/\/\s*>$/.test(open[0])) {
      ranges.push({ start, end: start + open[0].length });
      i = start + open[0].length;
      continue;
    }
    const closeEnd = findMatchingClose(html, start + open[0].length, tag);
    if (closeEnd < 0 || closeEnd > innerEnd) break;
    ranges.push({ start, end: closeEnd });
    i = closeEnd;
  }
  return ranges;
}

/**
 * MiniMax sometimes opens a 2×2 `.grid` for four method cards, writes only
 * the first card inside it, then dumps the other three as slide-level
 * siblings (`V VOCAB` / `G GRAMMAR` / `S SPEAKING` after `L LISTENING`).
 * Reparent those siblings so the official 2×2 look can actually hold them.
 * Do not swallow PAGE / footer chrome.
 */
function salvageOrphan2x2GridCards(html: string): string {
  return String(html ?? '').replace(
    /<section\b([^>]*)>([\s\S]*?)<\/section>/gi,
    (block, attrs: string, inner: string) => {
      if (!/\bslide\b/i.test(attrs) && !/\bs3\b/i.test(attrs)) return block;
      const gridOpenRe = /<div\b([^>]*\bclass\s*=\s*(?:"[^"]*\bgrid\b[^"]*"|'[^']*\bgrid\b[^']*')[^>]*)>/gi;
      let match: RegExpExecArray | null;
      while ((match = gridOpenRe.exec(inner)) !== null) {
        const gridAttrs = match[1] ?? '';
        const wants2x2 = gridLooksLikeOfficial2x2(gridAttrs) || /\bs3\b/i.test(attrs);
        if (!wants2x2) continue;
        const gridStart = match.index;
        const openEnd = gridStart + match[0].length;
        const gridCloseEnd = findMatchingClose(inner, openEnd, 'div');
        if (gridCloseEnd < 0) continue;
        const closeTag = /<\/div\s*>$/i.exec(inner.slice(0, gridCloseEnd))?.[0] ?? '</div>';
        const gridInnerEnd = gridCloseEnd - closeTag.length;
        const children = listDirectChildRanges(inner, openEnd, gridInnerEnd);
        if (children.length >= 4) continue;
        const need = 4 - children.length;
        const orphans: string[] = [];
        let cursor = gridCloseEnd;
        let rest = inner.slice(cursor);
        while (orphans.length < need) {
          const trimmed = rest.replace(/^\s+/, '');
          const skipped = rest.length - trimmed.length;
          if (!trimmed.startsWith('<div')) break;
          const open = /^<div\b[^>]*>/i.exec(trimmed);
          if (!open) break;
          const closeEnd = findMatchingClose(trimmed, open[0].length, 'div');
          if (closeEnd < 0) break;
          const card = trimmed.slice(0, closeEnd);
          if (isSlideChromeFooterCard(card)) break;
          if (visibleCardText(card).length < 8) break;
          orphans.push(card);
          cursor += skipped + closeEnd;
          rest = inner.slice(cursor);
        }
        if (orphans.length !== need) continue;
        const before = inner.slice(0, gridInnerEnd);
        const after = inner.slice(cursor);
        return `<section${attrs}>${before}${orphans.join('')}${closeTag}${after}</section>`;
      }
      return block;
    },
  );
}

function officialMotifVisibleText(block: string): string {
  return String(block ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' SVG ')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Empty Motif ribbon/stamp shells still paint (accent bar / card) after
 * leftover wipe. Drop nodes that have no visible text or SVG.
 */
function openHasExactClass(open: string, name: string): boolean {
  const raw = /\bclass\s*=\s*(['"])([\s\S]*?)\1/i.exec(open)?.[2] ?? '';
  return raw.trim().split(/\s+/).some((token) => token.toLowerCase() === name.toLowerCase());
}

/** Display titles used instead of h1–h3 on official magazine / poster decks. */
const TITLE_SLOT_CLASSES = [
  'title',
  'title-main',
  'hero-title',
  'display',
  'font-display',
  'headline',
  'toc-title',
  'summary-header',
  'fin-header',
] as const;

function firstTitleSlotClass(html: string): string | null {
  for (const name of TITLE_SLOT_CLASSES) {
    if (firstExactClassRange(html, name)) return name;
  }
  return null;
}

function firstExactClassRange(html: string, className: string): HtmlSpan | null {
  const openRe = /<(div|span|p)\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    if (!openHasExactClass(match[0] ?? '', className)) continue;
    const tag = (match[1] ?? 'div').toLowerCase();
    const start = match.index;
    const closeEnd = findMatchingClose(html, start + match[0]!.length, tag);
    if (closeEnd < 0) return { start, end: start + match[0]!.length };
    return { start, end: closeEnd };
  }
  return null;
}

function replaceFirstExactClassText(html: string, className: string, text: string): string {
  const span = firstExactClassRange(html, className);
  if (!span) return html;
  const block = html.slice(span.start, span.end);
  const open = /^<[^>]+>/.exec(block)?.[0];
  if (!open) return html;
  const inner = block.slice(open.length).replace(new RegExp(`</(?:div|span|p)\\s*>$`, 'i'), '');
  const close = /<\/(?:div|span|p)\s*>$/i.exec(block)?.[0] ?? '';
  return `${html.slice(0, span.start)}${open}${replaceFirstTextRun(inner, text)}${close}${html.slice(span.end)}`;
}

export function stripEmptyOfficialMotifInstances(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (
    !/\bdata-od-official-motif-html\b/i.test(out)
    && !/\bclass\s*=\s*["'][^"']*\b(?:ribbon|stamp)\b/i.test(out)
  ) {
    return out;
  }
  const openRe = /<(div|span)\b[^>]*>/gi;
  const spans: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const open = match[0] ?? '';
    const isMotif = /\bdata-od-official-motif-html\b/i.test(open);
    const isTextChrome = openHasExactClass(open, 'ribbon') || openHasExactClass(open, 'stamp');
    if (!isMotif && !isTextChrome) continue;
    const start = match.index;
    const tag = match[1] ?? 'div';
    const rest = out.slice(start);
    const selfClose = /^<[^>]*\/\s*>/.test(rest);
    if (selfClose) {
      const end = start + (rest.match(/^<[^>]*>/)?.[0].length ?? match[0].length);
      spans.push({ start, end });
      continue;
    }
    let depth = 1;
    const tokenRe = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
    tokenRe.lastIndex = match[0].length;
    let token: RegExpExecArray | null;
    let end = -1;
    while ((token = tokenRe.exec(rest)) !== null) {
      if (token[0].startsWith('</')) depth -= 1;
      else if (!/\/\s*>$/.test(token[0])) depth += 1;
      if (depth === 0) {
        end = start + token.index + token[0].length;
        break;
      }
    }
    if (end > start) spans.push({ start, end });
  }
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]!;
    const block = out.slice(span.start, span.end);
    if (officialMotifVisibleText(block).length >= 2) continue;
    if (/<svg\b/i.test(block) && block.length > 80) continue;
    out = `${out.slice(0, span.start)}${out.slice(span.end)}`;
  }
  return out;
}

type HtmlSpan = { start: number; end: number };

function findMatchingClose(html: string, openEnd: number, tag: string): number {
  const nested = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  nested.lastIndex = openEnd;
  let depth = 1;
  let inner: RegExpExecArray | null;
  while ((inner = nested.exec(html)) !== null) {
    if (inner[0]!.startsWith('</')) {
      depth -= 1;
      if (depth === 0) return inner.index + inner[0]!.length;
    } else if (!inner[0]!.endsWith('/>')) {
      depth += 1;
    }
  }
  return -1;
}

function collectTaggedRanges(html: string, tags: string): HtmlSpan[] {
  const openRe = new RegExp(`<(${tags})\\b[^>]*>`, 'gi');
  const ranges: HtmlSpan[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    const tag = (match[1] ?? '').toLowerCase();
    const start = match.index;
    if (/\/>\s*$/.test(match[0]!)) {
      ranges.push({ start, end: start + match[0]!.length });
      continue;
    }
    const closeEnd = findMatchingClose(html, start + match[0]!.length, tag);
    if (closeEnd < 0) continue;
    ranges.push({ start, end: closeEnd });
  }
  return ranges;
}

function spanRelation(outer: HtmlSpan, inner: HtmlSpan): 'same' | 'ancestor' | 'descendant' | 'disjoint' {
  if (outer.start === inner.start && outer.end === inner.end) return 'same';
  if (outer.start <= inner.start && outer.end >= inner.end) return 'ancestor';
  if (outer.start >= inner.start && outer.end <= inner.end) return 'descendant';
  return 'disjoint';
}

/**
 * Placeholder Clone slots that `fillSlideShell` actually writes into.
 * Everything else is leftover template chrome (cards / charts / stamps)
 * and can be dropped without another growing class list (0826-N01 F4).
 */
function wrapperVisibleProse(html: string): string {
  return String(html ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapperLooksLikeLeftoverContent(html: string): boolean {
  if (wrapperVisibleProse(html).length >= 2) return true;
  if (/<table\b/i.test(html)) return true;
  const kids = html.match(/<(div|section|article|aside|p|ul|ol|li|header|footer)\b/gi) ?? [];
  // Outer open + 2 inner blocks → card/grid chrome, even when empty.
  return kids.length >= 3;
}

function collectProtectedSlots(html: string): HtmlSpan[] {
  const slots: HtmlSpan[] = [];
  const heading = /<h([1-3])\b[^>]*>[\s\S]*?<\/h\1>/i.exec(html);
  if (heading && heading.index != null) {
    slots.push({ start: heading.index, end: heading.index + heading[0].length });
  }
  const listRe = /<(ul|ol)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let list: RegExpExecArray | null;
  while ((list = listRe.exec(html)) !== null) {
    // Card lists sit under a later h3/h4 (IB Option A/B). Only the first
    // outline list after the heading is a Clone fill slot — a second
    // column list is leftover demo copy (retro-windows agenda).
    const between = heading
      ? html.slice(heading.index + heading[0].length, list.index)
      : html.slice(0, list.index);
    if (/<h[3-6]\b/i.test(between)) continue;
    slots.push({ start: list.index, end: list.index + list[0].length });
    break;
  }
  const subtitle = /<p\b[^>]*\bclass\s*=\s*["'][^"']*\bsubtitle\b[^"']*["'][^>]*>[\s\S]*?<\/p>/i.exec(html);
  if (subtitle && subtitle.index != null) {
    slots.push({ start: subtitle.index, end: subtitle.index + subtitle[0].length });
  }
  if (!heading) {
    const titleName = firstTitleSlotClass(html);
    const titleClass = titleName ? firstExactClassRange(html, titleName) : null;
    if (titleClass) slots.push(titleClass);
    const fallback = /<(div|span|p)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:quote-text|number|caption)\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/i.exec(html);
    if (fallback && fallback.index != null) {
      slots.push({ start: fallback.index, end: fallback.index + fallback[0].length });
    }
  }
  return slots;
}

const NON_SLOT_WRAPPER_TAGS =
  'div|span|p|header|footer|small|blockquote|figure|figcaption|aside|table|section|article|dl|dt|dd|ul|ol|pre|code';

/**
 * Drop block wrappers that do not own a fill slot. Slots and their
 * ancestors stay so `.slide-inner` / `.body` layout around a title
 * survives; sibling demo cards (`alts-grid`, unknown `.weird-grid`, …)
 * do not.
 */
export function stripNonSlotWrappers(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  const slots = collectProtectedSlots(source);
  const wrappers = collectTaggedRanges(source, NON_SLOT_WRAPPER_TAGS);
  const drop: HtmlSpan[] = [];
  for (const wrap of wrappers) {
    const keep = slots.some((slot) => {
      const rel = spanRelation(wrap, slot);
      return rel === 'same' || rel === 'ancestor' || rel === 'descendant';
    });
    if (!keep && wrapperLooksLikeLeftoverContent(source.slice(wrap.start, wrap.end))) {
      drop.push(wrap);
    }
  }
  // Strip only outermost disjoint wrappers so nested drop ranges do not
  // invalidate later slice indices.
  const outermost = drop.filter((span) => (
    !drop.some((other) => other !== span && other.start <= span.start && other.end >= span.end)
  ));
  outermost.sort((a, b) => b.start - a.start);
  let out = source;
  for (const span of outermost) {
    out = out.slice(0, span.start) + out.slice(span.end);
  }
  return out;
}

function stripLeftoverTemplateDemoCopy(html: string): string {
  // F4: structural slot-vs-wrapper strip replaces the growing IB class list.
  // Tables that somehow sit on a slot ancestor are still removed — they are
  // never a Clone fill target.
  let next = stripNonSlotWrappers(html);
  next = next.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, '');
  return next;
}

function replaceListItems(html: string, lines: string[]): string {
  if (lines.length === 0) return html;
  const listMatch = /<ul\b[^>]*>[\s\S]*?<\/ul>/i.exec(html)
    ?? /<ol\b[^>]*>[\s\S]*?<\/ol>/i.exec(html);
  if (!listMatch || listMatch.index == null) return html;
  const listHtml = listMatch[0];
  const open = /^<[uo]l\b[^>]*>/i.exec(listHtml)?.[0] ?? '<ul>';
  const close = /<\/[uo]l>$/i.exec(listHtml)?.[0] ?? '</ul>';
  const existingItems = [...listHtml.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)];
  const items = lines.map((line, index) => {
    const attrs = existingItems[index]?.[1] ?? existingItems[0]?.[1] ?? '';
    const priorInner = existingItems[index]?.[2] ?? '';
    if (priorInner && /<[a-zA-Z]/.test(priorInner)) {
      if (!String(line).trim()) {
        return `<li${attrs}></li>`;
      }
      return `<li${attrs}>${replaceFirstTextRun(priorInner, line)}</li>`;
    }
    return `<li${attrs}>${escapeHtml(line)}</li>`;
  }).join('');
  const nextList = `${open}${items}${close}`;
  return (
    html.slice(0, listMatch.index)
    + nextList
    + html.slice(listMatch.index + listHtml.length)
  );
}

function classTokensFromAttrs(attrs: string): string[] {
  const match = /\bclass\s*=\s*(["'])([^"']*)\1/i.exec(attrs);
  if (!match?.[2]) return [];
  return match[2].split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

function hostClassSet(slotMap: TemplateCloneSlotMap | null | undefined): Set<string> {
  const set = new Set<string>([
    'cards-grid',
    'weekly-grid',
    'card-grid',
    'grid-cards',
    'cards',
    'stats-grid',
    'team-grid',
    'feature-grid',
    'metrics-row',
    'cards-row',
    'pricing-grid',
    'timeline-wrap',
  ]);
  for (const token of slotMap?.hostClasses ?? []) {
    const t = String(token ?? '').trim().toLowerCase();
    if (t) set.add(t);
  }
  return set;
}

function peerClassSet(slotMap: TemplateCloneSlotMap | null | undefined): Set<string> {
  const set = new Set<string>([
    'info-card',
    'stat-card',
    'feature-card',
    'metric-card',
    'card',
    'team-card',
    'price-card',
    'pricing-card',
    'pillar-card',
    'kpi-card',
    'step-card',
    'process-card',
    'member-card',
    'team-member',
    'pillar',
    'day-card',
    'timeline-card',
    // 0901-N02-C5: bare `.step` (creative-mode / soft-editorial).
    'step',
  ]);
  for (const token of slotMap?.peerClasses ?? []) {
    const t = String(token ?? '').trim().toLowerCase();
    if (t) set.add(t);
  }
  return set;
}

/** Section chrome like `4-step` / `five-step` — not trim peers. */
function isCountedStepSectionToken(token: string): boolean {
  return /^(?:\d+|two|three|four|five|six|seven|eight|nine)-step$/.test(token);
}

/**
 * 0901-N02-C4/C5: prefixed hosts (`hc-grid-3`, `xp-grid-2`, `oc-steps`) without
 * per-template maps. Exact allowlist still wins; do not invent leftover peers.
 */
function tokenLooksLikeCardHost(
  token: string,
  hosts: Set<string>,
): boolean {
  const t = String(token ?? '').trim().toLowerCase();
  if (!t) return false;
  if (hosts.has(t)) return true;
  // foo-grid / foo-grid-3 — not nav-arrow, not bare "grid" (too broad alone).
  if (/^[a-z0-9][a-z0-9_-]*-grid(?:-\d+)?$/.test(t)) return true;
  if (/^grid-\d+$/.test(t)) return true;
  // oc-steps / xw-steps host rows (C5).
  if (/^[a-z][a-z0-9_-]*-steps$/.test(t)) return true;
  return false;
}

/**
 * 0901-N02-C4/C5: prefixed peers (`xp-card`, `kb-step`, `timeline-step`).
 * `*-card` never matches `card-icon` / `card-title`.
 * `*-step` requires a letter start and rejects `4-step` / `five-step` section chrome.
 */
function tokenLooksLikeCardPeer(
  token: string,
  peers: Set<string>,
): boolean {
  const t = String(token ?? '').trim().toLowerCase();
  if (!t) return false;
  if (peers.has(t)) return true;
  if (/^[a-z0-9][a-z0-9_-]*-card$/.test(t)) return true;
  if (isCountedStepSectionToken(t)) return false;
  // Letter-led `*-step` only — excludes digit `4-step` and inner `step-title`.
  if (/^[a-z][a-z0-9_-]*-step$/.test(t)) return true;
  return false;
}

function attrsLookLikeCardHost(
  attrs: string,
  slotMap?: TemplateCloneSlotMap | null,
): boolean {
  const hosts = hostClassSet(slotMap);
  return classTokensFromAttrs(attrs).some((token) => tokenLooksLikeCardHost(token, hosts));
}

function attrsLookLikeCardPeer(
  attrs: string,
  slotMap?: TemplateCloneSlotMap | null,
): boolean {
  const peers = peerClassSet(slotMap);
  return classTokensFromAttrs(attrs).some((token) => tokenLooksLikeCardPeer(token, peers));
}

function shellBodyLooksLikeCardGrid(
  html: string,
  slotMap?: TemplateCloneSlotMap | null,
): boolean {
  const hosts = [...hostClassSet(slotMap)].map(escapeRegExp).join('|');
  const peers = [...peerClassSet(slotMap)].map(escapeRegExp).join('|');
  // (?!-) blocks prefix hits inside `kb-grid-bg` / `my-card-icon` / `kb-step-title`.
  const hostRe = new RegExp(
    `<(?:div|ul|ol|section)\\b[^>]*\\bclass\\s*=\\s*["'][^"']*(?:\\b(?:${hosts})\\b|\\b[a-z0-9][\\w-]*-grid(?:-\\d+)?\\b(?!-)|\\bgrid-\\d+\\b|\\b[a-z][\\w-]*-steps\\b(?!-))[^"']*["']`,
    'i',
  );
  const peerRe = new RegExp(
    `<(?:div|article|aside|li|section)\\b[^>]*\\bclass\\s*=\\s*["'][^"']*(?:\\b(?:${peers})\\b|\\b[a-z0-9][\\w-]*-card\\b(?!-)|\\b[a-z][\\w-]*-step\\b(?!-))[^"']*["']`,
    'i',
  );
  return hostRe.test(html) || peerRe.test(html);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rebuildHostWithPeers(
  source: string,
  openStart: number,
  openEnd: number,
  closeEnd: number,
  closeTag: string,
  openTag: string,
  children: HtmlSpan[],
  peers: HtmlSpan[],
  lines: string[],
): string {
  const keepCount = Math.min(Math.max(0, lines.length), peers.length);
  const keepPeerStarts = new Set(peers.slice(0, keepCount).map((span) => span.start));
  const rebuilt: string[] = [];
  for (const child of children) {
    if (!peers.some((peer) => peer.start === child.start)) {
      rebuilt.push(source.slice(child.start, child.end));
      continue;
    }
    if (!keepPeerStarts.has(child.start)) continue;
    const peerIndex = peers.findIndex((peer) => peer.start === child.start);
    const line = lines[peerIndex] ?? '';
    rebuilt.push(fillOneCardPeer(source.slice(child.start, child.end), line));
  }
  const nextHost = `${openTag}${rebuilt.join('')}${closeTag}`;
  return source.slice(0, openStart) + nextHost + source.slice(closeEnd);
}

function collectPeersAmongChildren(
  source: string,
  children: HtmlSpan[],
  slotMap?: TemplateCloneSlotMap | null,
): HtmlSpan[] {
  return children.filter((span) => {
    const open = /^<([a-zA-Z][\w:-]*)\b([^>]*)>/.exec(source.slice(span.start, span.end));
    return Boolean(open && attrsLookLikeCardPeer(open[2] ?? '', slotMap));
  });
}

/**
 * Fill card peers from outline lines and drop unfilled siblings.
 * 0901-N02-C/C2/C3/C4/C5: 카드 수 = 내용 수. Never invent leftover column labels.
 *
 * Host discovery order:
 * 1) known host class tokens (+ C4 `*-grid` / `grid-N` · C5 `*-steps`)
 * 2) peer-driven: any container with ≥2 direct peer children (`*-card`/`*-step`)
 * 3) top-level peer siblings (no wrapper)
 */
export function fillAndTrimCardPeers(
  html: string,
  lines: string[],
  slotMap?: TemplateCloneSlotMap | null,
): string {
  const source = String(html ?? '');
  if (!source) return source;

  const tryTrimAt = (
    openStart: number,
    openEnd: number,
    closeEnd: number,
    openTag: string,
    closeTag: string,
    requireHostClass: boolean,
    attrs: string,
  ): string | null => {
    if (requireHostClass && !attrsLookLikeCardHost(attrs, slotMap)) return null;
    const innerEnd = closeEnd - closeTag.length;
    const children = listDirectChildRanges(source, openEnd, innerEnd);
    const peers = collectPeersAmongChildren(source, children, slotMap);
    if (requireHostClass) {
      if (peers.length === 0) return null;
    } else if (peers.length < 2) {
      return null;
    }
    return rebuildHostWithPeers(
      source,
      openStart,
      openEnd,
      closeEnd,
      closeTag,
      openTag,
      children,
      peers,
      lines,
    );
  };

  // 1) Class-named hosts
  const hostOpenRe = /<(div|ul|ol|section)\b([^>]*)>/gi;
  let hostMatch: RegExpExecArray | null;
  while ((hostMatch = hostOpenRe.exec(source)) !== null) {
    const tag = (hostMatch[1] ?? 'div').toLowerCase();
    const attrs = hostMatch[2] ?? '';
    const openStart = hostMatch.index;
    const openEnd = openStart + hostMatch[0].length;
    const closeEnd = findMatchingClose(source, openEnd, tag);
    if (closeEnd < 0) continue;
    const closeTag = new RegExp(`</${tag}\\s*>$`, 'i').exec(source.slice(0, closeEnd))?.[0]
      ?? `</${tag}>`;
    const trimmed = tryTrimAt(
      openStart,
      openEnd,
      closeEnd,
      hostMatch[0],
      closeTag,
      true,
      attrs,
    );
    if (trimmed) return trimmed;
  }

  // 2) Peer-driven hosts (e.g. product-launch `.grid.g3` without cards-grid)
  hostOpenRe.lastIndex = 0;
  while ((hostMatch = hostOpenRe.exec(source)) !== null) {
    const tag = (hostMatch[1] ?? 'div').toLowerCase();
    const attrs = hostMatch[2] ?? '';
    if (attrsLookLikeCardHost(attrs, slotMap)) continue; // already tried
    const openStart = hostMatch.index;
    const openEnd = openStart + hostMatch[0].length;
    const closeEnd = findMatchingClose(source, openEnd, tag);
    if (closeEnd < 0) continue;
    const closeTag = new RegExp(`</${tag}\\s*>$`, 'i').exec(source.slice(0, closeEnd))?.[0]
      ?? `</${tag}>`;
    const trimmed = tryTrimAt(
      openStart,
      openEnd,
      closeEnd,
      hostMatch[0],
      closeTag,
      false,
      attrs,
    );
    if (trimmed) return trimmed;
  }

  // 3) Top-level peer siblings (bold-poster `.pillar` row without wrapper)
  const topChildren = listDirectChildRanges(source, 0, source.length);
  const topPeers = collectPeersAmongChildren(source, topChildren, slotMap);
  if (topPeers.length >= 2) {
    const keepCount = Math.min(Math.max(0, lines.length), topPeers.length);
    const keepPeerStarts = new Set(topPeers.slice(0, keepCount).map((span) => span.start));
    const rebuilt: string[] = [];
    for (const child of topChildren) {
      if (!topPeers.some((peer) => peer.start === child.start)) {
        rebuilt.push(source.slice(child.start, child.end));
        continue;
      }
      if (!keepPeerStarts.has(child.start)) continue;
      const peerIndex = topPeers.findIndex((peer) => peer.start === child.start);
      rebuilt.push(fillOneCardPeer(source.slice(child.start, child.end), lines[peerIndex] ?? ''));
    }
    return rebuilt.join('');
  }

  return source;
}

function fillOneCardPeer(cardHtml: string, line: string): string {
  const text = String(line ?? '').trim();
  let next = cardHtml;
  // Daisy weekly: `.day-header` is the title slot (0901-N02-C2).
  if (/\bday-header\b/i.test(next)) {
    next = next.replace(
      /(<[^>]*\bday-header\b[^>]*>)([\s\S]*?)(<\/)/i,
      (_m, open: string, _inner: string, close: string) => `${open}${escapeHtml(text)}${close}`,
    );
    // Wipe demo list items under the day — do not invent Reading/Writing leftovers.
    next = next.replace(/<li\b[^>]*>[\s\S]*?<\/li>/gi, '');
    return next;
  }
  // Coral / column-card: `.card-title` (+ clear `.card-text` demo).
  if (/\bcard-title\b/i.test(next)) {
    next = next.replace(
      /(<[^>]*\bcard-title\b[^>]*>)([\s\S]*?)(<\/)/i,
      (_m, open: string, _inner: string, close: string) => `${open}${escapeHtml(text)}${close}`,
    );
    next = next.replace(
      /(<[^>]*\bcard-text\b[^>]*>)([\s\S]*?)(<\/)/gi,
      (_m, open: string, _inner: string, close: string) => `${open}${close}`,
    );
    return next;
  }
  // team-member: `.member-name` title slot (0901-N02-C4).
  if (/\bmember-name\b/i.test(next)) {
    next = next.replace(
      /(<[^>]*\bmember-name\b[^>]*>)([\s\S]*?)(<\/)/i,
      (_m, open: string, _inner: string, close: string) => `${open}${escapeHtml(text)}${close}`,
    );
    next = next.replace(
      /(<[^>]*\bmember-role\b[^>]*>)([\s\S]*?)(<\/)/gi,
      (_m, open: string, _inner: string, close: string) => `${open}${close}`,
    );
    return next;
  }
  // 0901-N02-C5 step title slots (kb / process / timeline / cycle / flow).
  if (/\b(?:kb-step-title|step-title|cycle-title|flow-title)\b/i.test(next)) {
    next = next.replace(
      /(<[^>]*\b(?:kb-step-title|step-title|cycle-title|flow-title)\b[^>]*>)([\s\S]*?)(<\/)/i,
      (_m, open: string, _inner: string, close: string) => `${open}${escapeHtml(text)}${close}`,
    );
    next = next.replace(
      /(<[^>]*\b(?:kb-step-body|step-desc|cycle-desc|flow-desc)\b[^>]*>)([\s\S]*?)(<\/)/gi,
      (_m, open: string, _inner: string, close: string) => `${open}${close}`,
    );
    return next;
  }
  // xhs-white-editorial: `.xw-txt` body line on xw-step.
  if (/\bxw-txt\b/i.test(next)) {
    next = next.replace(
      /(<[^>]*\bxw-txt\b[^>]*>)([\s\S]*?)(<\/)/i,
      (_m, open: string, _inner: string, close: string) => `${open}${escapeHtml(text)}${close}`,
    );
    return next;
  }
  // creative-mode: `.t` title + `.d` demo body inside bare `.step`.
  if (/<[^>]*\bclass\s*=\s*["'][^"']*\bt\b[^"']*["'][^>]*>/i.test(next)) {
    next = next.replace(
      /(<[^>]*\bclass\s*=\s*["'][^"']*\bt\b[^"']*["'][^>]*>)([\s\S]*?)(<\/)/i,
      (_m, open: string, _inner: string, close: string) => `${open}${escapeHtml(text)}${close}`,
    );
    next = next.replace(
      /(<[^>]*\bclass\s*=\s*["'][^"']*\bd\b[^"']*["'][^>]*>)([\s\S]*?)(<\/)/gi,
      (_m, open: string, _inner: string, close: string) => `${open}${close}`,
    );
    return next;
  }
  if (/<h([3-5])\b/i.test(next)) {
    next = next.replace(
      /(<h([3-5])\b[^>]*>)([\s\S]*?)(<\/h\2>)/i,
      (_m, open: string, _level: string, _inner: string, close: string) => (
        `${open}${escapeHtml(text)}${close}`
      ),
    );
    // Drop template demo body under the card title — do not invent a second line.
    next = next.replace(/(<p\b[^>]*>)([\s\S]*?)(<\/p>)/gi, '$1$3');
    return next;
  }
  if (/<p\b/i.test(next)) {
    let replaced = false;
    return next.replace(/(<p\b[^>]*>)([\s\S]*?)(<\/p>)/gi, (_match, open: string, _inner: string, close: string) => {
      if (!replaced) {
        replaced = true;
        return `${open}${escapeHtml(text)}${close}`;
      }
      return `${open}${close}`;
    });
  }
  if (!text) return next;
  return next.replace(
    /^(<[a-zA-Z][\w:-]*\b[^>]*>)([\s\S]*)$/i,
    (_m, open: string, rest: string) => `${open}${escapeHtml(text)}${rest}`,
  );
}

function fillSlideShell(
  shell: SlideShell,
  content: TemplateCloneSlideContent,
  index: number,
  slotMap?: TemplateCloneSlotMap | null,
): string {
  let body = shell.body;
  const title = content.title.trim() || `Slide ${index + 1}`;
  const bodyText = content.body?.trim() ?? '';
  const bodyLines = bodyText
    ? bodyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];

  if (/<h1\b/i.test(body)) {
    body = replaceHeadingText(body, 'h1', title);
  } else if (/<h2\b/i.test(body)) {
    body = replaceHeadingText(body, 'h2', title);
  } else if (/<h3\b/i.test(body)) {
    body = replaceHeadingText(body, 'h3', title);
  } else {
    const titleName = firstTitleSlotClass(body);
    if (titleName) {
      body = replaceFirstExactClassText(body, titleName, title);
    }
  }

  const placeholderBody = isPlaceholderCloneBody(bodyText);

  // Always clear template marketing subtitle when we own this shell's title.
  if (/<p\b[^>]*class\s*=\s*["'][^"']*subtitle/i.test(body)) {
    const subtitle = placeholderBody ? '' : (bodyLines[0] || bodyText || '');
    body = body.replace(
      /(<p\b[^>]*class\s*=\s*["'][^"']*subtitle[^"']*["'][^>]*>)([\s\S]*?)(<\/p>)/i,
      `$1${escapeHtml(subtitle)}$3`,
    );
  }

  const role = classifyTemplateCloneShellRole(shell);
  const cardsGridBody = shellBodyLooksLikeCardGrid(body, slotMap)
    || role === 'cards'
    || (role === 'timeline' && Boolean(slotMap?.peerClasses.some((c) => /timeline-card/i.test(c))));

  if (placeholderBody) {
    // Ellipsis placeholders must not land in the first N list items and
    // leave the rest of the template TOC / finance copy intact.
    if (cardsGridBody && shellBodyLooksLikeCardGrid(body, slotMap)) {
      // 0901-N02-C: empty outline → drop demo card peers (카드 수 = 0).
      body = fillAndTrimCardPeers(body, [], slotMap);
    } else if (/<[uo]l\b/i.test(body)) {
      const existingCount = [...body.matchAll(/<li\b/gi)].length;
      if (existingCount > 0) {
        body = replaceListItems(body, Array.from({ length: existingCount }, () => ''));
      }
    } else if (/<p\b/i.test(body)) {
      body = replaceFirstTagText(body, 'p', '');
    }
    body = stripLeftoverTemplateDemoCopy(body);
    body = emptyClassInners(body, 'number');
    body = emptyClassInners(body, 'caption');
    body = emptyClassInners(body, 'quote-text');
    body = emptyClassInners(body, 'quote-author');
    if (!/<h[1-3]\b/i.test(shell.body)) {
      body = body.replace(
        /(<[^>]*\bclass\s*=\s*["'][^"']*\b(?:quote-text|number|caption)\b[^"']*["'][^>]*>)(<\/)/i,
        `$1${escapeHtml(title)}$2`,
      );
    }
  } else if (cardsGridBody && shellBodyLooksLikeCardGrid(body, slotMap)) {
    // Prefer card-peer fill over first-<p> so unused columns are removed.
    const before = body;
    body = fillAndTrimCardPeers(body, bodyLines, slotMap);
    // weekly-grid hosts without mapped peers are a no-op — fall through
    // to list/`p` fill so day-card demo copy is not left untouched when map missing.
    if (body === before && bodyLines.length > 0 && /<[uo]l\b/i.test(body)) {
      body = replaceListItems(body, bodyLines);
    } else if (body === before && (bodyLines[0] || bodyText)) {
      const paragraph = bodyLines[0] || bodyText;
      if (!/<p\b[^>]*class\s*=\s*["'][^"']*subtitle/i.test(shell.body) && /<p\b/i.test(body)) {
        body = replaceFirstTagText(body, 'p', paragraph);
      }
    }
  } else if (bodyLines.length > 0 && /<[uo]l\b/i.test(body)) {
    body = replaceListItems(body, bodyLines);
  } else if (bodyLines[0] || bodyText) {
    const paragraph = bodyLines[0] || bodyText;
    if (!/<p\b[^>]*class\s*=\s*["'][^"']*subtitle/i.test(shell.body) && /<p\b/i.test(body)) {
      body = replaceFirstTagText(body, 'p', paragraph);
    }
  } else if (/<[uo]l\b/i.test(body)) {
    // Title-only pad shells: wipe leftover template English list copy.
    const existingCount = [...body.matchAll(/<li\b/gi)].length;
    if (existingCount > 0) {
      body = replaceListItems(body, Array.from({ length: existingCount }, () => ''));
    }
  } else if (/<p\b/i.test(body)) {
    // Title-only: wipe leftover template marketing paragraphs ("Daisy Days", …).
    body = replaceFirstTagText(body, 'p', '');
  }

  // Partial heading swaps must not keep IB/finance demo chrome/tables.
  if (/Hartfield|NorthPeak|WACC\s*\(\s*base\s*\)|Implied EV|Demo-data notice/i.test(body)) {
    body = stripLeftoverTemplateDemoCopy(body);
  }

  // Force Teamver fixed canvas size even when template used vw/vh or had
  // a pre-existing inline style that would otherwise win over CSS overrides.
  let attrs = shell.attrs;
  if (/\bstyle\s*=/i.test(attrs)) {
    attrs = attrs.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i, (_m, q: string, style: string) => {
      let next = String(style);
      next = /\bwidth\s*:/i.test(next)
        ? next.replace(/\bwidth\s*:[^;]*/i, 'width:1920px')
        : `${next};width:1920px`;
      next = /\bheight\s*:/i.test(next)
        ? next.replace(/\bheight\s*:[^;]*/i, 'height:1080px')
        : `${next};height:1080px`;
      if (!/\bbox-sizing\s*:/i.test(next)) next = `${next};box-sizing:border-box`;
      return `style=${q}${next}${q}`;
    });
  } else {
    attrs = `${attrs} style="width:1920px;height:1080px;box-sizing:border-box"`;
  }
  // Remap ids so duplicated shells stay unique.
  attrs = attrs.replace(/\bid\s*=\s*(["'])([^"']*)\1/i, (_m, q: string) => `id=${q}slide-${index + 1}${q}`);
  return `<${shell.tag}${attrs}>${body}</${shell.tag}>`;
}

/**
 * Templates authored for fullscreen `100vw` / `clamp(..., Nvw, ...)` preview
 * drift when Teamver locks `.slide` to a fixed 1920×1080 canvas inside the
 * editor chrome. Rewrite vw/vh as px assuming that canvas IS the viewport.
 */
export function normalizeTemplateCssForFixedCanvas(html: string): string {
  return String(html ?? '')
    .replace(/(\d+(?:\.\d+)?)vw\b/gi, (_m, raw: string) => {
      const px = Math.round(parseFloat(raw) * 19.2 * 100) / 100;
      return Number.isFinite(px) ? `${px}px` : _m;
    })
    .replace(/(\d+(?:\.\d+)?)vh\b/gi, (_m, raw: string) => {
      const px = Math.round(parseFloat(raw) * 10.8 * 100) / 100;
      return Number.isFinite(px) ? `${px}px` : _m;
    });
}

function injectTeamverSizeStyle(html: string): string {
  if (/data-teamver-template-clone-size/i.test(html)) return html;
  const style = `<style data-teamver-template-clone-size>${TEAMVER_SLIDE_SIZE_CSS}</style>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${style}</head>`);
  }
  if (/<body\b/i.test(html)) {
    return html.replace(/<body\b[^>]*>/i, (open) => `${open}\n${style}`);
  }
  return `${style}\n${html}`;
}

function replaceDocumentTitle(html: string, title: string): string {
  if (!/<title\b/i.test(html)) return html;
  return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function replaceSlideBlocks(html: string, shells: SlideShell[], filledSlides: string[]): string | null {
  if (shells.length === 0 || filledSlides.length === 0) return null;
  const first = shells[0]!;
  const last = shells[shells.length - 1]!;
  const firstIdx = html.indexOf(first.full);
  const lastIdx = html.indexOf(last.full);
  if (firstIdx < 0 || lastIdx < 0) return null;
  const end = lastIdx + last.full.length;
  return `${html.slice(0, firstIdx)}${filledSlides.join('\n\n')}${html.slice(end)}`;
}

/**
 * Clone a template `example.html` and content-swap Source slide titles/bodies
 * into the real CSS/SVG/layout shells. Returns null when no slide shells exist.
 */
export function buildTemplateClonedDeckHtml(
  exampleHtml: string,
  slides: TemplateCloneSlideContent[],
  options: { title?: string; maxSlides?: number; templateId?: string | null } = {},
): string | null {
  const source = stripScriptsAndNav(String(exampleHtml ?? '').trim());
  if (!source) return null;
  const shells = listTemplateCloneSlideShells(source);
  if (shells.length === 0) return null;

  const slotMap = resolveTemplateCloneSlotMap({
    ...(options.templateId !== undefined ? { templateId: options.templateId } : {}),
    html: source,
  });

  const cleanedSlides: TemplateCloneSlideContent[] = [];
  for (const slide of slides) {
    const title = sanitizeTemplateCloneDeckTitle(slide.title);
    if (!title) continue;
    const body = slide.body?.trim();
    const next: TemplateCloneSlideContent = body ? { title, body } : { title };
    // 0901-N02: roleHint must survive seed fill (was dropped and broke cards pick).
    if (slide.roleHint && isTemplateCloneShellRole(slide.roleHint)) {
      next.roleHint = slide.roleHint;
    }
    cleanedSlides.push(next);
  }
  // Slide-count policy (NOT template fidelity):
  // - Content outline / synthesized brief wins.
  // - Explicit user maxSlides hint may expand (never shrink below outline).
  // - Never default to the template's natural page count/order.
  const hint = options.maxSlides != null
    ? Math.min(20, Math.max(1, options.maxSlides))
    : null;
  const deckTitle =
    sanitizeTemplateCloneDeckTitle(options.title)
    || cleanedSlides[0]?.title
    || '슬라이드';

  let workingSlides: TemplateCloneSlideContent[];
  if (cleanedSlides.length > 0) {
    workingSlides = cleanedSlides.slice(0, 20);
    if (
      hint != null
      && hint > workingSlides.length
      && !workingSlides.every((slide) => isPlaceholderCloneBody(slide.body))
    ) {
      while (workingSlides.length < hint) {
        const n = workingSlides.length + 1;
        workingSlides.push({
          title: n === 1 ? deckTitle : `${deckTitle} · ${n}`,
          body: '',
        });
      }
    }
  } else {
    // Empty brief: short starter deck with role-diverse shells — not all
    // template demo pages in demo order.
    const starterCount = hint ?? 3;
    workingSlides = Array.from({ length: Math.min(20, starterCount) }, (_, index) => ({
      title: index === 0 ? deckTitle : `${deckTitle} · ${index + 1}`,
      body: '',
    }));
  }

  const picked = pickTemplateShellsForContent(shells, workingSlides);
  const filled = picked.map((shell, index) => {
    const content = workingSlides[index] ?? {
      title: index === 0 ? deckTitle : `${deckTitle} · ${index + 1}`,
    };
    return fillSlideShell(shell, content, index, slotMap);
  });

  let out = replaceSlideBlocks(source, shells, filled);
  if (!out) {
    // Fallback: synthesize a minimal document keeping extracted styles.
    const styles = [...source.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)]
      .map((match) => match[0] ?? '')
      .join('\n');
    const fontLinks = [...source.matchAll(/<link\b[^>]*fonts\.googleapis\.com[^>]*>/gi)]
      .map((match) => match[0] ?? '')
      .join('\n');
    out = [
      '<!doctype html>',
      '<html lang="ko">',
      '<head>',
      '<meta charset="utf-8" />',
      `<title>${escapeHtml(deckTitle)}</title>`,
      fontLinks,
      styles,
      '</head>',
      '<body>',
      '<div class="slides-container">',
      ...filled,
      '</div>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  out = replaceDocumentTitle(out, deckTitle);
  out = stripDeckLevelDemoChrome(out);
  out = syncClonedDeckChromeCount(out, filled.length);
  out = normalizeTemplateCssForFixedCanvas(out);
  // After native scripts are stripped a `<div class="stage" style="display:flex;
  // transition:transform">` wrapper is dead weight: the host bridge sees no
  // known horizontal-swipe fingerprint, falls through to compact-stacked
  // detection, and (because the wrapper sits between `.deck` and `.slide`)
  // stacked navigation can end up translating the flex track instead of
  // toggling `display` on the real slide. Hoisting the slides up so they are
  // direct children of `<body>` restores the shape
  // `looksLikeCompactApiStackedDeck` expects (see 0826-N01-2 §F1-b).
  out = hoistCloneSlidesOutOfFlexTrack(out);
  out = injectTeamverSizeStyle(out);
  return out.trim() || null;
}

/**
 * Unwrap flex-row / presenter shell wrappers so `<section class="slide">`
 * blocks become direct children of `<body>`:
 *   1. `<div class="stage" style="display:flex; transition:transform">` — the
 *      horizontal-swipe flex track (and its aliases `.deck-stage`,
 *      `.slides-container`, `.deck-track`). Native scripts are already gone;
 *      leaving the wrapper in confuses host-bridge deck detection and can
 *      trap nav as a small `translateX` "nudge".
 *   2. `<div class="deck" id="deck">` — the letterbox shell. After the flex
 *      track is hoisted, this shell contains only slides + inert prev/next
 *      chrome (buttons are dead links after `stripScriptsAndNav`). The
 *      `id="deck"` alone makes classifiers treat the output as an "official
 *      presenter" and refuses the compact-stacked path.
 *
 * Safety: only hoist when the wrapper's only element children are
 * `<section class="slide">` blocks (after stripping inert prev/next chrome).
 * Otherwise the wrapper may carry authored chrome we must not lose.
 */
export function hoistCloneSlidesOutOfFlexTrack(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const tags = ['div', 'section', 'main'] as const;
  const trackClassOrId =
    '(?:\\bclass\\s*=\\s*(["\'])[^"\'<>]*\\b(?:stage|deck-stage|slides-container|deck-track)\\b[^"\'<>]*\\1|\\bid\\s*=\\s*(["\'])(?:stage|slides-container|deck-track)\\2)';
  const deckClassOrId =
    '(?:\\bclass\\s*=\\s*(["\'])[^"\'<>]*\\bdeck\\b[^"\'<>]*\\1|\\bid\\s*=\\s*(["\'])deck\\2)';
  for (const tag of tags) {
    out = unwrapSlideOnlyContainer(
      out,
      new RegExp(`<${tag}\\b[^>]*${trackClassOrId}[^>]*>`, 'i'),
      tag,
    );
    out = unwrapSlideOnlyContainer(
      out,
      new RegExp(`<${tag}\\b[^>]*${deckClassOrId}[^>]*>`, 'i'),
      tag,
    );
  }
  return out;
}

function unwrapSlideOnlyContainer(source: string, wrapperOpenRe: RegExp, tag: string): string {
  const openMatch = wrapperOpenRe.exec(source);
  if (!openMatch || openMatch.index == null) return source;

  const openStart = openMatch.index;
  const openEnd = openStart + openMatch[0].length;

  const tagRe = new RegExp(`</?${tag}\\b[^>]*>`, 'gi');
  tagRe.lastIndex = openEnd;
  let depth = 1;
  let closeStart = -1;
  let closeEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(source)) !== null) {
    if (m[0]!.startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        closeStart = m.index;
        closeEnd = m.index + m[0]!.length;
        break;
      }
    } else if (!m[0]!.endsWith('/>')) {
      depth += 1;
    }
  }
  if (closeStart < 0) return source;

  const inner = source.slice(openEnd, closeStart);
  const fullSlideRe =
    /<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b[^"']*["'][^>]*>[\s\S]*?<\/section\s*>/gi;
  const slideBlocks = inner.match(fullSlideRe) ?? [];
  if (slideBlocks.length < 2) return source;

  // Ignore native prev/next/counter chrome wrappers when deciding whether
  // the container is "slide-only" — those are dead links after
  // `stripScriptsAndNav`. Depth-strip them so we don't leak the raw counter
  // text or the button HTML into `<body>` after unwrap.
  const chromeStripped = stripSlideNavChromeBlocks(inner);
  const residue = chromeStripped
    .replace(fullSlideRe, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  if (/<[a-zA-Z]/.test(residue)) return source;

  return `${source.slice(0, openStart)}${chromeStripped}${source.slice(closeEnd)}`;
}

function stripSlideNavChromeBlocks(html: string): string {
  let out = String(html ?? '');
  for (const className of ['chrome', 'deck-nav', 'slide-counter', 'nav-dots']) {
    out = stripClassBlocks(out, className);
  }
  return out;
}

function syncClonedDeckChromeCount(html: string, count: number): string {
  const padded = String(Math.max(1, count)).padStart(2, '0');
  return String(html ?? '')
    .replace(/(<[^>]*\bid\s*=\s*["']total["'][^>]*>)[\s\S]*?(<\/)/i, `$1${padded}$2`)
    .replace(/(<[^>]*\bid\s*=\s*["']deck-total["'][^>]*>)[\s\S]*?(<\/)/i, `$1${padded}$2`);
}

/** Parse a slide-count hint like "6-8" / "10" into a concrete target. */
export function resolveTemplateCloneSlideCountHint(
  hint: string | number | null | undefined,
): number | null {
  if (typeof hint === 'number' && Number.isFinite(hint)) {
    const n = Math.round(hint);
    return n >= 1 && n <= 20 ? n : null;
  }
  const raw = String(hint ?? '').trim();
  if (!raw) return null;
  const range = raw.match(/^(\d{1,2})\s*[-~–—]\s*(\d{1,2})$/);
  if (range?.[1] && range[2]) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a >= 1 && b >= a && b <= 20) {
      return Math.round((a + b) / 2);
    }
  }
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 20) return Math.round(n);
  return null;
}

const VISIBLE_HEADINGS_RE =
  /(?:Visible headings|Canvas headings|Source headings)\s*[:：]\s*/i;
const HEADINGS_STOP_RE =
  /\s+(?:Source preview|Canvas title|Canvas sections|Drive source(?: file| MIME)?|Drive asset id|User instruction)\s*[:：]/i;
const NUMBERED_SLIDE_RE =
  /^\s*(?:(?:\d+)[\.\)]\s*|(?:0?\d{1,2})\s+|슬라이드\s*\d+\s*[:\.\-]\s*|#{1,3}\s+)(.+)$/i;
const USER_INSTRUCTION_RE =
  /(?:\[User instruction\]|User instruction)\s*[:：]?\s*\n?([\s\S]*?)(?=\n\n\[|\n(?:Source |Canvas |Drive |Visible |Selected |Attachments?:)|$)/i;

function cleanCloneTitle(title: string): string {
  return title.replace(/^["'`]|["'`]$/g, '').replace(/\s+/g, ' ').trim();
}

/** Dense template sample lexicon that must not lock a LOOK seed over a clean re-clone. */
export function looksLikeLeftoverTemplateDemoDeck(html: string): boolean {
  const text = String(html ?? '');
  if (!text.trim()) return false;
  return /Hartfield|NorthPeak Industries|WACC\s*\(|Revenue CAGR|Filebase|Northwind Studios|Daisy Days|The bandwidth bill is the bug|Project Atlas|pitch-agent|Margaret Eun|Maison Nocturne|Synthetic Open Design demo dataset|Continue as standalone public company|ib-check-deck\s*\(\s*pass\s*\)|Apex Group|Lorem ipsum|Mina Kovac|OPERATION HALCYON|Quartz\. Confluence|hermes-agent|Team Structure\s*(?:&|&amp;)?\s*Resource Allocation|open-source alternative to Anthropic's Claude Design|A local-first design studio for the agent you already trust|Open-source design studio|52\.5200°\s*N|Composed in kami|Apache-2\.0[\s\S]{0,800}Local-first[\s\S]{0,800}BYOK|\[\[Author Name\]\]|this is the broadside style/i.test(
    text,
  );
}

const CATALOG_SWIPE_STAGE_RE =
  /<(?:div|section)\b[^>]*(?:\bid\s*=\s*["']stage["']|\bclass\s*=\s*["'][^"']*\bstage\b)/i;
const CATALOG_SWIPE_CHROME_RE =
  /id\s*=\s*["']now["'][\s\S]{0,800}id\s*=\s*["']total["']|id\s*=\s*["']total["'][\s\S]{0,800}id\s*=\s*["']now["']/i;
const CATALOG_SWIPE_VW_SCRIPT_RE =
  /translateX\s*\(\s*[`'"]-\$\{[^}]*100\s*vw|translateX\(`-\$\{i\*100\}vw`\)/i;
const GENERIC_CLONE_HEADING_RE = /개요|핵심 포인트|다음 단계|Overview|Key points|Next steps/i;

/**
 * IB pitch-book / catalog swipe chassis after demo copy was wiped.
 * Hartfield fingerprints are gone, but #stage + 100vw script + chrome remain.
 */
export function looksLikeCatalogSwipeShell(html: string): boolean {
  const dest = String(html ?? '');
  if (!dest || dest.length < 4_000) return false;
  if (!CATALOG_SWIPE_STAGE_RE.test(dest)) return false;
  const hasVw =
    /min-width\s*:\s*100vw/i.test(dest)
    || /data-od-deck-fixed-canvas-pin/i.test(dest)
    || CATALOG_SWIPE_VW_SCRIPT_RE.test(dest);
  if (!hasVw) return false;
  if (!CATALOG_SWIPE_CHROME_RE.test(dest) && !CATALOG_SWIPE_VW_SCRIPT_RE.test(dest)) {
    return false;
  }
  const slides = dest.match(/<(?:section|div)\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi);
  return (slides?.length ?? 0) >= 6;
}

/**
 * Scrubbed leftover catalog: IB chassis plus placeholder clone copy.
 * Must not lock the next topical fill behind artifact_regression.
 */
export function looksLikeScrubbedCatalogExampleShell(
  html: string,
  brief?: string | null,
): boolean {
  const dest = String(html ?? '');
  if (!looksLikeCatalogSwipeShell(dest)) return false;
  if (looksLikeLeftoverTemplateDemoDeck(dest)) return true;
  const prompt = String(brief ?? '');
  const promptNamesCatalog = /Hartfield|NorthPeak|WACC|Filebase|Daisy Days|피치북|pitch book/i.test(prompt);
  if (promptNamesCatalog && !hasHangulTopic(prompt)) return false;
  const ellipsis = (dest.match(/[…]|\.{3}/g) ?? []).length;
  return ellipsis >= 3 && GENERIC_CLONE_HEADING_RE.test(dest);
}

function hasHangulTopic(text: string): boolean {
  return ((String(text ?? '').match(/[가-힣]/g) ?? []).length >= 4);
}

export type CatalogExampleScrubOptions = {
  /**
   * Project preview/persist: leftover demo copy is never a deliverable, even
   * when the last user message has not loaded yet. Gallery callers omit this
   * so `example.html` stays intact.
   */
  allowEmptyBrief?: boolean;
};

export function catalogExampleShouldBeScrubbed(
  html: string,
  brief?: string | null,
  options?: CatalogExampleScrubOptions,
): boolean {
  const dest = String(html ?? '');
  if (!looksLikeLeftoverTemplateDemoDeck(dest)) return false;
  const prompt = String(brief ?? '');
  // Template chip names ("ib pitch book") are not a request to keep Hartfield.
  const promptNamesCatalog = /Hartfield|NorthPeak|WACC|Filebase|Daisy Days/i.test(prompt);
  const promptHasHangul = hasHangulTopic(prompt);
  if (promptNamesCatalog && !promptHasHangul) return false;
  if (promptHasHangul || hasHangulTopic(dest)) return true;
  if (prompt && !promptNamesCatalog) return true;
  return options?.allowEmptyBrief === true;
}

/**
 * Rebuild a leftover catalog example (Hartfield/DCF/Filebase) as a topic
 * clone so preview/persist never keep finance demo copy on a different brief.
 */
export function scrubLeftoverCatalogExampleHtml(
  html: string,
  brief?: string | null,
  options?: CatalogExampleScrubOptions,
): string {
  const dest = String(html ?? '');
  if (!catalogExampleShouldBeScrubbed(dest, brief, options)) return dest;
  const fromBrief = resolveTemplateCloneSlidesFromBrief({
    userInstruction: brief ?? '',
  });
  const hangul = dest.match(/[가-힣][가-힣\s,]{3,80}/)?.[0]?.trim();
  const title = fromBrief[0]?.title || hangul || '슬라이드';
  const slides = fromBrief.length > 0
    ? fromBrief
    : [
      { title, body: '…' },
      { title: '개요', body: '…' },
      { title: '핵심 포인트', body: '…\n…\n…' },
      { title: '다음 단계', body: '…' },
    ];
  return buildTemplateClonedDeckHtml(dest, slides, {
    title,
    maxSlides: slides.length,
  }) || dest;
}

export function looksLikeTemplateMarketingTitle(title: string): boolean {
  const trimmed = title.trim();
  return /html\s*ppt|daisy days|simple deck|zhangzara|cheerful presentation|template for|hartfield|northpeak|filebase|project atlas|northwind studios/i.test(
    trimmed,
  ) || /^(?:presentation(?:\s+template)?|slide)$/i.test(trimmed);
}

function extractUserFacingBrief(text: string): string {
  const fromMarker = USER_INSTRUCTION_RE.exec(text)?.[1]?.trim();
  if (fromMarker) return fromMarker;
  // Drop protocol blocks from full create-slides run prompts.
  let cleaned = text
    .replace(/\n\n\[Deliverable instruction\][\s\S]*$/i, '')
    .replace(/\n\n\[Quick settings\][\s\S]*$/i, '')
    .replace(/\n\n\[Selected slide template(?: priority)?\][\s\S]*$/i, '')
    .replace(/\n\n\[Source brief\][\s\S]*$/i, '');
  cleaned = cleaned
    .replace(
      /^(?:Canvas title|Source preview|Drive source(?: file| MIME)?|Drive asset id|Visible headings|Canvas headings|Source headings)\s*[:：].*$/gim,
      '',
    )
    .trim();
  // Skip attachment/home boilerplate lead lines.
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstUseful = lines.find(
    (line) =>
      !/^첨부(?:한)?\s*.+\s*바탕으로\s*슬라이드/i.test(line)
      && !/^요청한\s*내용으로\s*슬라이드/i.test(line)
      && !/^슬라이드\s*(?:덱|내용)을?\s*(?:만들어|채워)\s*줘\.?$/u.test(line),
  );
  return firstUseful
    ? [firstUseful, ...lines.slice(lines.indexOf(firstUseful) + 1)].join('\n')
    : '';
}

function deriveTitleFromBrief(brief: string, deckTitle?: string | null): string {
  const preferred = deckTitle?.trim() ?? '';
  if (preferred && !looksLikeTemplateMarketingTitle(preferred) && !looksLikeInstructionCopy(preferred)) {
    return cleanCloneTitle(preferred).slice(0, 80);
  }
  const first = brief.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || brief;
  // "expo에 대해서 설명하는 피피티 만들어줘" → topic before 설명/피피티/만들어
  const aboutTopic = first.match(
    /^(.+?)\s*(?:에\s*대해(?:서)?|에\s*대한|에\s*관한)\s*(?:설명하는\s*)?(?:발표\s*자료|피피티|PPT|슬라이드|덱|프레젠테이션)/i,
  )?.[1]?.trim();
  let title = aboutTopic || first
    .replace(/^(?:please\s+)?(?:make|create|build|write)\s+(?:me\s+)?(?:a|an|the)?\s*/i, '')
    .replace(/\s+(?:slides?|deck|presentation)\s*\.?$/i, '')
    .replace(
      /\s*(?:에\s*대해(?:서)?|에\s*대한|에\s*관한)?\s*(?:설명하는\s*)?(?:발표\s*자료|피피티|PPT|슬라이드|덱|프레젠테이션)?\s*(?:을|를)?\s*(?:만들어|작성|생성|설명해?).*$/i,
      '',
    )
    .replace(/^(?:슬라이드|발표자료|덱)\s*/i, '')
    .trim();
  if (
    !title
    || title.length < 2
    || looksLikeInstructionCopy(title)
    || looksLikeTemplateMarketingTitle(title)
  ) {
    title = aboutTopic && !looksLikeTemplateMarketingTitle(aboutTopic)
      ? aboutTopic
      : '슬라이드';
  }
  return polishInstructionCoverTitle(cleanCloneTitle(title).slice(0, 60)) || '슬라이드';
}

/**
 * Model-parroted host/API-mode instructions. The host persists
 * `<artifact type="deck">` automatically — this prose must never become a
 * cover title or stay visible in chat.
 */
const LEAKED_API_MODE_FILESYSTEM_FINGERPRINT_RE =
  /(?:API\s+mode\s+without\s+filesystem\s+write\s+tools|without\s+filesystem\s+write\s+tools|save\s+this\s+as\s+deck\.html|here\s+is\s+the\s+complete\s+deck\s+HTML|this\s+workspace\s+is\s+in\s+API\s+mode|API\s*모드[^.!?\n]{0,80}파일\s*시스템|deck\.html(?:로|에)\s*저장)/i;

export function looksLikeLeakedApiModeFilesystemProse(text: string): boolean {
  return LEAKED_API_MODE_FILESYSTEM_FINGERPRINT_RE.test(String(text ?? '').trim());
}

/** Drop leaked "save this as deck.html" / API-mode filesystem sentences from prose. */
export function stripLeakedApiModeFilesystemProse(text: string): string {
  if (!text || !LEAKED_API_MODE_FILESYSTEM_FINGERPRINT_RE.test(text)) return text;
  const lines = text.split('\n').map((line) => {
    if (!LEAKED_API_MODE_FILESYSTEM_FINGERPRINT_RE.test(line)) return line;
    const kept = line
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !LEAKED_API_MODE_FILESYSTEM_FINGERPRINT_RE.test(sentence));
    return kept.join(' ').trim();
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function looksLikeInstructionCopy(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (looksLikeLeakedApiModeFilesystemProse(t)) return true;
  if (/\[(?:Deliverable instruction|Selected slide template|Source brief|Quick settings|User instruction)\]/i.test(t)) {
    return true;
  }
  if (/첨부(?:한)?\s*.+\s*바탕으로\s*슬라이드/i.test(t)) return true;
  if (/요청한\s*내용으로\s*슬라이드/i.test(t)) return true;
  if (/^슬라이드\s*(?:덱|내용)을?\s*(?:만들어|채워)\s*줘\.?$/u.test(t)) return true;
  if (/(?:만들어|작성|생성)\s*(?:줘|주세요)|설명해?\s*(?:줘|주세요)/i.test(t)) return true;
  if (/^(?:please\s+)?(?:make|create|build|write|generate)\s+/i.test(t)) return true;
  if (/피피티|PPT|슬라이드\s*덱/i.test(t) && /(?:만들어|작성|생성|설명)/i.test(t)) return true;
  return false;
}

/**
 * Cover / document title for daemon Clone. Returns null when the candidate is
 * template marketing or a user "만들어줘" instruction — callers must not stuff
 * those into slide headings (AI content-fill writes real titles next).
 */
export function sanitizeTemplateCloneDeckTitle(
  raw: string | null | undefined,
): string | null {
  const title = cleanCloneTitle(String(raw ?? ''));
  if (!title) return null;
  if (looksLikeTemplateMarketingTitle(title) || looksLikeInstructionCopy(title)) {
    return null;
  }
  return title.slice(0, 80);
}

/**
 * Cover title from a Home / wizard / Clone fill prompt. Strips protocol
 * blocks and "만들어줘" wrappers so persist can salvage a head-only CSS
 * shell without parroting Daisy marketing or the raw instruction.
 */
export function deriveDeckCoverTitleFromBrief(
  prompt: string,
  deckTitle?: string | null,
): string {
  const brief = extractUserFacingBrief(prompt);
  return deriveTitleFromBrief(brief, deckTitle);
}

/** Parser / emergency defaults that must not land in the persist manifest. */
export function isGenericDeckArtifactTitle(title: string | null | undefined): boolean {
  return /^(?:response|deck|untitled|artifact|slide|slides?|presentation|발표\s*자료|슬라이드)$/i.test(
    String(title ?? '').trim(),
  );
}

function visibleHeadingText(inner: string): string {
  return inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function headingLooksLikeFailedGenerate(visible: string): boolean {
  return looksLikeInstructionCopy(visible)
    || looksLikeTemplateMarketingTitle(visible)
    || isGenericDeckArtifactTitle(visible);
}

const GENERIC_HEAL_TITLE_RE =
  /^(?:발표\s*개요|overview|agenda|목차|구성|intro|title\s*slide|cover|표지|contents|table\s*of\s*contents)$/i;

function usableHealTitle(
  visible: string,
  options?: { allowGenericRole?: boolean },
): string | null {
  const title = cleanCloneTitle(visible);
  if (title.length < 2 || title.length > 48) return null;
  if (headingLooksLikeFailedGenerate(title)) return null;
  if (!options?.allowGenericRole && GENERIC_HEAL_TITLE_RE.test(title)) return null;
  return title;
}

function screenLabelRoleTitle(attrs: string): string | null {
  const raw = /\bdata-screen-label\s*=\s*(['"])([^'"]*)\1/i.exec(attrs)?.[2]?.trim() ?? '';
  const role = raw.replace(/^\d{2}\s+/, '').trim();
  return role ? usableHealTitle(role, { allowGenericRole: true }) : null;
}

function firstParagraphTitle(body: string): string | null {
  const inner = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(body)?.[1];
  if (!inner) return null;
  const visible = visibleHeadingText(inner);
  const sentence = visible.split(/(?<=[.!?。])\s+/)[0]?.trim() ?? visible;
  if (sentence.length > 48) return null;
  return usableHealTitle(sentence);
}

function roleFallbackTitle(
  attrs: string,
  body: string,
  coverTitle: string,
  index: number,
): string {
  const role = classifyTemplateCloneShellRole({ attrs, body });
  if (role === 'cover' || index === 0) return coverTitle;
  if (role === 'stat') return '핵심 수치';
  if (role === 'quote') return '인용';
  if (role === 'team') return '팀';
  if (role === 'process' || role === 'timeline') return '진행';
  if (role === 'closing') return '다음 단계';
  if (role === 'cards') return '핵심 포인트';
  if (index === 1) return '개요';
  if (index === 2) return '핵심 포인트';
  return '다음 단계';
}

function replaceFailedHeadings(fragment: string, title: string): string {
  const headingRe = /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  return fragment.replace(headingRe, (full, level, attrs, inner) => {
    const visible = visibleHeadingText(String(inner ?? ''));
    if (!headingLooksLikeFailedGenerate(visible)) return full;
    return `<h${level}${attrs ?? ''}>${escapeHtml(title)}</h${level}>`;
  });
}

type HealHostSpan = {
  tag: string;
  start: number;
  attrs: string;
  bodyStart: number;
  bodyEnd: number;
};

/** Section *and* div hosts in document order — clone shells are section-XOR-div. */
function listHealSlideHostSpans(html: string): HealHostSpan[] {
  const openRe = /<(section|div|main|article)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const opens: { tag: string; attrs: string; start: number; openEnd: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    if (!attrsLookLikeDeckOrTemplateSlideHost(match[2] ?? '')) continue;
    opens.push({
      tag: (match[1] ?? 'section').toLowerCase(),
      attrs: match[2] ?? '',
      start: match.index,
      openEnd: match.index + match[0].length,
    });
  }
  return opens.map((open, i) => {
    const limit = i + 1 < opens.length ? opens[i + 1]!.start : html.length;
    const chunk = html.slice(open.openEnd, limit);
    const close = new RegExp(`</${open.tag}\\s*>`, 'i').exec(chunk);
    return {
      tag: open.tag,
      start: open.start,
      attrs: open.attrs,
      bodyStart: open.openEnd,
      bodyEnd: close ? open.openEnd + close.index : limit,
    };
  });
}

/**
 * Persist heal: every host heading that still parrots "만들어줘" / template
 * marketing is rewritten so the majority-heading gate does not skip a
 * complete deck. Walks section *and* div hosts (clone shell list is XOR).
 */
export function healInstructionCopyCoverHeading(
  html: string,
  brief: string,
  deckTitle?: string | null,
): string {
  const dest = String(html ?? '');
  const coverTitle = polishInstructionCoverTitle(
    sanitizeTemplateCloneDeckTitle(
      deriveDeckCoverTitleFromBrief(brief, deckTitle),
    ) ?? '',
  );
  if (!coverTitle || !dest.trim()) return dest;

  const spans = listHealSlideHostSpans(dest);
  if (spans.length === 0) {
    return replaceFailedHeadings(dest, coverTitle);
  }

  let next = dest;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]!;
    const body = next.slice(span.bodyStart, span.bodyEnd);
    const title = i === 0
      ? coverTitle
      : screenLabelRoleTitle(span.attrs)
        || firstParagraphTitle(body)
        || roleFallbackTitle(span.attrs, body, coverTitle, i);
    const rewritten = polishTrailingInstructionHeadings(replaceFailedHeadings(body, title));
    if (rewritten === body) continue;
    next = next.slice(0, span.bodyStart) + rewritten + next.slice(span.bodyEnd);
  }
  return healSparseDeckCoverLayout(stripDeckLevelDemoChrome(next), brief, deckTitle);
}

function polishTrailingInstructionHeadings(fragment: string): string {
  return String(fragment ?? '').replace(
    /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (full, level: string, attrs: string, inner: string) => {
      if (/<(?:div|ul|ol)\b/i.test(inner)) return full;
      const text = visibleHeadingText(inner);
      const polished = polishInstructionCoverTitle(text);
      if (!polished || polished === text) return full;
      return `<h${level}${attrs}>${escapeHtml(polished)}</h${level}>`;
    },
  );
}

function stripTagsToText(html: string): string {
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function bodyWithoutMotif(body: string): string {
  return String(body ?? '')
    .replace(/<(div|span)\b[^>]*\bdata-od-official-motif-html\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
}

function looksLikeStubCoverSlide(attrs: string, body: string): boolean {
  if (/<h1[^>]*\bdisplay\b/i.test(body)) return false;
  if (/\b(?:cover-meta|subhead|slide-inner|mast)\b/i.test(body)) return false;
  if (/\bcover\b/i.test(attrs) && /\bdisplay\b/i.test(body)) return false;
  const content = bodyWithoutMotif(body);
  if (/<(?:p|ul|ol|table|aside)\b/i.test(content)) return false;
  const text = stripTagsToText(content);
  const headings = content.match(/<h[1-3]\b/gi) ?? [];
  if (!(text.length > 0 && text.length < 80 && headings.length <= 1)) return false;
  const centered = /justify-content:\s*center/i.test(attrs) || /\bslide-title\b/i.test(attrs);
  const emptyMotif = /<(?:div|span)\b[^>]*\bdata-od-official-motif-html\b[^>]*>\s*<\/(?:div|span)>/i.test(body);
  const h1 = firstMatchText(content, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const truncatedBrief = h1.length >= 2
    && (
      /에\s*대한$|예시에?$|만들어줘$/u.test(h1)
      || headingLooksLikeFailedGenerate(h1)
    );
  // A real one-line cover title ("Expo SDK 개요") must stay. Rebuild only
  // host salvage chrome or a brief-truncated heading.
  return centered || emptyMotif || truncatedBrief;
}

function firstMatchText(html: string, re: RegExp): string {
  const match = re.exec(html);
  return match ? stripTagsToText(match[1] ?? '') : '';
}

function collectCoverMetaRows(bodies: string[]): Array<{ k: string; v: string }> {
  const rows: Array<{ k: string; v: string }> = [];
  for (const body of bodies) {
    const eyebrow = firstMatchText(
      body,
      /<(?:div|p|span)\b[^>]*(?:class=["'][^"']*\beyebrow\b[^"']*["']|letter-spacing:\s*0\.[12]em[^>]*text-transform:\s*uppercase)[^>]*>([\s\S]*?)<\/(?:div|p|span)>/i,
    );
    const heading = firstMatchText(body, /<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (eyebrow && heading) {
      rows.push({ k: eyebrow.slice(0, 40), v: heading.slice(0, 72) });
    }
    if (rows.length >= 3) break;
  }
  return rows;
}

function formatCoverDisplayTitle(title: string): string {
  const escaped = escapeHtml(title);
  const parts = title.split(/,\s+/);
  if (parts.length === 2 && parts[0]!.length >= 6 && parts[1]!.length >= 4) {
    return `${escapeHtml(parts[0]!)}<br>${escapeHtml(parts[1]!)}`;
  }
  return escaped;
}

/**
 * Host salvage / compact-sample covers are a single centered `<h1>` plus an
 * empty Motif ribbon. Rebuild an IB-density cover from the brief and later
 * slide headings so page 1 is not a cream void.
 */
export function healSparseDeckCoverLayout(
  html: string,
  brief: string,
  deckTitle?: string | null,
): string {
  const dest = String(html ?? '');
  const coverTitle = polishInstructionCoverTitle(
    sanitizeTemplateCloneDeckTitle(
      deriveDeckCoverTitleFromBrief(brief, deckTitle),
    ) ?? '',
  );
  if (!coverTitle || isGenericDeckArtifactTitle(coverTitle) || !dest.trim()) return dest;
  if (destHasPosterSlideKinds(dest) && !officialLookIsIbMagazine(dest)) return dest;
  if (lookCssWithoutNeutralize(dest).trim() && !officialLookIsIbMagazine(dest)) return dest;

  const spans = listHealSlideHostSpans(dest);
  if (spans.length === 0) return dest;
  const first = spans[0]!;
  const firstBody = dest.slice(first.bodyStart, first.bodyEnd);
  if (!looksLikeStubCoverSlide(first.attrs, firstBody)) return dest;

  const laterBodies = spans.slice(1).map((span) => dest.slice(span.bodyStart, span.bodyEnd));
  const subhead = laterBodies
    .map((body) => firstMatchText(body, /<h2\b[^>]*>([\s\S]*?)<\/h2>/i))
    .find((text) => text.length >= 4)
    ?? '';
  const ribbon = laterBodies
    .map((body) => firstMatchText(
      body,
      /<(?:header|div)\b[^>]*letter-spacing:\s*0\.2[12]em[^>]*>([\s\S]*?)<\/(?:header|div)>/i,
    ))
    .find((text) => text.length >= 2)
    ?? (/[가-힣]/.test(coverTitle) ? '학습 노트' : 'Notes');
  const meta = collectCoverMetaRows(laterBodies);
  const metaHtml = meta.length > 0
    ? meta.map((row) => (
      `<div class="row"><div class="k">${escapeHtml(row.k)}</div>`
      + `<div class="v">${escapeHtml(row.v)}</div></div>`
    )).join('')
    : '';

  const cover = [
    '<section class="slide cover" style="width:1920px;height:1080px;box-sizing:border-box;',
    'overflow:visible;position:relative;background:var(--paper);color:var(--ink);',
    'padding:56px 72px 48px;border-top:6px solid var(--ink);',
    'display:grid;grid-template-rows:auto 1fr auto">',
    '<header class="mast" style="display:flex;justify-content:space-between;align-items:baseline;',
    'padding-bottom:14px;border-bottom:1px solid var(--rule)">',
    `<span class="brand">${escapeHtml(ribbon)}</span>`,
    '</header>',
    '<div class="body" style="display:grid;grid-template-columns:1.3fr 1fr;gap:48px;',
    'align-items:end;padding:24px 0 16px">',
    '<div>',
    `<span class="ribbon">${escapeHtml(ribbon)}</span>`,
    `<h1 class="display">${formatCoverDisplayTitle(coverTitle)}</h1>`,
    subhead
      ? `<p class="subhead">${escapeHtml(subhead)}</p>`
      : '',
    '</div>',
    metaHtml ? `<aside class="cover-meta">${metaHtml}</aside>` : '',
    '</div>',
    '<footer class="foot" style="display:flex;justify-content:space-between;align-items:center;',
    'padding-top:14px;border-top:1px solid var(--rule)">',
    `<span class="conf">${escapeHtml(coverTitle)}</span>`,
    '</footer>',
    '</section>',
  ].join('');

  const close = dest.slice(first.bodyEnd).match(new RegExp(`^</${first.tag}\\s*>`, 'i'));
  const end = first.bodyEnd + (close?.[0].length ?? 0);
  return `${dest.slice(0, first.start)}${cover}${dest.slice(end)}`;
}

/**
 * Free-form Home/wizard prompts have no Visible-headings outline. Still
 * synthesize content-bearing slides so Clone does not leave template marketing
 * copy intact. Length follows the brief — never the template's demo page count.
 */
export function synthesizeTemplateCloneSlidesFromFreeFormBrief(options: {
  brief: string;
  deckTitle?: string | null;
}): TemplateCloneSlideContent[] {
  const brief = extractUserFacingBrief(options.brief);
  if (!brief || brief.length < 2) return [];

  const title = deriveTitleFromBrief(brief, options.deckTitle);
  const lines = brief.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter(
    (line) => /^[-*•·]\s+/.test(line) || /^\d+[.)]\s+/.test(line),
  );
  if (bulletLines.length >= 2) {
    const out: TemplateCloneSlideContent[] = [{ title, body: '' }];
    for (const line of bulletLines) {
      const item = sanitizeTemplateCloneDeckTitle(
        line.replace(/^[-*•·]\s+/, '').replace(/^\d+[.)]\s+/, ''),
      );
      if (item) out.push({ title: item });
    }
    return out.slice(0, 20);
  }

  const paragraphs = brief
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (paragraphs.length >= 2) {
    const out: TemplateCloneSlideContent[] = [
      { title, body: paragraphs[0]!.slice(0, 200) },
    ];
    for (let i = 1; i < paragraphs.length; i += 1) {
      const para = paragraphs[i]!;
      const firstLine = para.split('\n')[0]!.trim();
      const slideTitle = firstLine.length <= 60
        ? (sanitizeTemplateCloneDeckTitle(firstLine) ?? `${title} ${i + 1}`)
        : `${title} ${i + 1}`;
      const body = firstLine.length <= 60
        ? para.split('\n').slice(1).join('\n').trim() || para
        : para;
      out.push({ title: slideTitle || `${title} ${i + 1}`, body: body.slice(0, 1200) });
    }
    return out.slice(0, 20);
  }

  // Short free-form ask: placeholder shells only. AI content-fill turn writes
  // real copy next — never dump "만들어줘" instructions into titles/subtitles.
  return [
    { title, body: '…' },
    { title: '개요', body: '…' },
    { title: '핵심 포인트', body: '…\n…\n…' },
    { title: '다음 단계', body: '…' },
  ];
}

/**
 * Resolve slide titles from a Canvas/Drive source brief (and optional user
 * instruction) for server-side template clone. Kept in contracts so daemon and
 * FE share one parser — no web-only emergency-deck dependency.
 */
export function resolveTemplateCloneSlidesFromBrief(options: {
  sourceBrief?: string | null;
  userInstruction?: string | null;
  deckTitle?: string | null;
}): TemplateCloneSlideContent[] {
  const text = [options.sourceBrief ?? '', options.userInstruction ?? '']
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const out: TemplateCloneSlideContent[] = [];
  const seen = new Set<string>();

  const push = (rawTitle: string) => {
    const title = sanitizeTemplateCloneDeckTitle(rawTitle);
    if (!title) return;
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ title });
  };

  if (text) {
    const marker = VISIBLE_HEADINGS_RE.exec(text);
    if (marker && marker.index != null) {
      const payload = text
        .slice(marker.index + marker[0].length)
        .replace(HEADINGS_STOP_RE, '\n')
        .split('\n')[0]
        ?.trim() ?? '';
      for (const part of payload.split(/\s+\/\s+/)) push(part);
    }
    if (out.length < 2) {
      for (const line of text.split(/\r?\n/)) {
        const numbered = line.match(NUMBERED_SLIDE_RE);
        if (numbered?.[1]) push(numbered[1]);
      }
    }
  }

  if (out.length > 0) return out.slice(0, 20);

  // Free-form prompt (Home wizard / gallery): synthesize content-bearing
  // slides so template marketing copy is replaced. Empty brief still returns
  // [] — build then uses a short role-diverse starter, not the template's
  // full demo page lineup.
  if (!text) return [];
  return synthesizeTemplateCloneSlidesFromFreeFormBrief({
    brief: text,
    ...(options.deckTitle !== undefined ? { deckTitle: options.deckTitle } : {}),
  });
}

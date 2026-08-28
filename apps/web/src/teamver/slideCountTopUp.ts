import type { ChatMessage } from "../types";
import { isAutoContinueIncompleteOutputPrompt } from "../runtime/resume";

/** Home / prompt / top-up share this ceiling. One-turn 40-slide fills truncate. */
export const SLIDE_COUNT_REQUEST_MAX = 15;

/**
 * Hidden user-turn prefix so ChatPane can hide slide-count top-up loops
 * (same pattern as auto-continue incomplete-output).
 *
 * Use a non-HTML token — persist prose sanitize strips `<!-- … -->` comments
 * and then the bubble reappears on reload as leftover English/HTML debris.
 */
export const SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL = "[od:slide_count_top_up]";
export const SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL_LEGACY = "<!--od:slide_count_top_up-->";
const SLIDE_COUNT_TOP_UP_PROMPT_FINGERPRINT_RE =
  /\[od:slide_count_top_up\]|<!--od:slide_count_top_up-->|this is an explicit slide-count expansion|append only new slides|closed\s+\d+-slide\s+deliverable|do not rewrite the saved deck|emit only the new|keep slides 1[–-]/i;

/** Analytics `entry_from` for the append loop — not incomplete-output recovery. */
export const SLIDE_COUNT_TOP_UP_ENTRY_FROM = "slide_count_top_up";

/** One remaining-all batch finishes a default-6 miss; two batches cover 15. */
export const SLIDE_COUNT_TOP_UP_MAX_PER_CONVERSATION = 2;
export const SLIDE_COUNT_TOP_UP_BATCH = 6;

const USER_REQUESTED_SLIDE_COUNT_RE = /User requested slide count:\s*([^\n]+)/i;
const SLIDE_COUNT_PLUGIN_INPUT_RE =
  /\b(?:slideCount|slides|pageCount)\s*:\s*["']?([^"'\n]+)["']?/i;
const SLIDE_COUNT_FORM_LABEL_RE =
  /^\s*-\s*(?:슬라이드\s*분량|slide\s*count|Slide count|scale|slides?|pageCount)\s*:\s*(.+)$/i;

export function isSlideCountTopUpPrompt(content: string | null | undefined): boolean {
  const text = (content ?? "").trimStart();
  if (!text) return false;
  if (
    text.startsWith(SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL)
    || text.startsWith(SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL_LEGACY)
  ) {
    return true;
  }
  // Persist sanitize can drop the HTML-comment sentinel and most tags, leaving
  // "This is an explicit slide-count expansion" / "APPEND only new slides".
  return SLIDE_COUNT_TOP_UP_PROMPT_FINGERPRINT_RE.test(text);
}

/** User follow-up that wants more pages — not a title/color surgical edit. */
export function looksLikeSlideCountExpansionRequest(
  text: string | null | undefined,
): boolean {
  const raw = String(text ?? "").trim();
  if (!raw || isSlideCountTopUpPrompt(raw)) return false;
  if (
    /(?:제목|텍스트|색|폰트|위치|크기)\s*(?:만\s*)?(?:바|고|수)|change\s+the\s+title|recolor/i.test(raw)
    && !/(?:다음|나머지|추가).*(?:장|페이지|슬라이드)/i.test(raw)
  ) {
    return false;
  }
  return /(?:다음|나머지|추가)\s*(?:페이지|장|슬라이드)|더\s*(?:만들|채워|추가)|장(?:수를?)?\s*(?:늘려|추가)|add\s+(?:more\s+)?(?:slides?|pages?)|continue\s+(?:the\s+)?(?:deck|slides?)|next\s+(?:pages?|slides?)/i.test(
    raw,
  );
}

export function countSlideCountTopUpAttemptsInConversation(
  messages: readonly ChatMessage[],
): number {
  return messages.filter(
    (message) => message.role === "user" && isSlideCountTopUpPrompt(message.content),
  ).length;
}

export function syncSlideCountTopUpCountFromMessages(
  counts: Map<string, number>,
  conversationId: string,
  messages: readonly ChatMessage[],
): number {
  const next = countSlideCountTopUpAttemptsInConversation(messages);
  counts.set(conversationId, next);
  return next;
}

export function rollbackSlideCountTopUpCount(
  counts: Map<string, number>,
  conversationId: string,
): number {
  const next = Math.max(0, (counts.get(conversationId) ?? 1) - 1);
  counts.set(conversationId, next);
  return next;
}

export type SlideCountSpec = { min: number; max: number };

function normalizeSlideCountText(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.。．]+$/u, "")
    .trim();
}

function isValidSlideCount(n: number): boolean {
  return Number.isFinite(n) && n >= 1 && n <= SLIDE_COUNT_REQUEST_MAX;
}

/** Quick-length presets like `5-6` / `6-8` — not an exact typed count. */
export function isSlideCountRangeHint(text: string | number | null | undefined): boolean {
  const normalized = normalizeSlideCountText(String(text ?? ""));
  if (!normalized || /stability cap/i.test(normalized)) return false;
  return /^\d{1,2}\s*[~\-–—]\s*\d{1,2}$/.test(normalized);
}

/**
 * Range keeps both ends (`5-6` → min 5). Exact `5장` / `5페이지` is min=max.
 * Ignores first-fill "stability cap" phrases so a capped hint cannot become
 * the user's target.
 */
export function parseSlideCountSpec(
  text: string | null | undefined,
  options?: { allowBareNumber?: boolean },
): SlideCountSpec | null {
  const normalized = normalizeSlideCountText(text);
  if (!normalized || /stability cap/i.test(normalized)) return null;

  const range = normalized.match(/(\d{1,2})\s*[~\-–—]\s*(\d{1,2})/);
  if (range?.[1] && range[2]) {
    const lower = Number(range[1]);
    const upper = Number(range[2]);
    if (isValidSlideCount(lower) && isValidSlideCount(upper) && upper >= lower) {
      return { min: lower, max: upper };
    }
  }

  const withUnit = normalized.match(
    /(?:정확히|exact(?:ly)?)\s*(\d{1,2})|(\d{1,2})\s*(?:장|slides?|pages?|페이지)/i,
  );
  const unitCount = Number(withUnit?.[1] || withUnit?.[2] || NaN);
  if (isValidSlideCount(unitCount)) return { min: unitCount, max: unitCount };

  if (options?.allowBareNumber) {
    const bare = normalized.match(/^(\d{1,2})$/);
    const n = Number(bare?.[1] || NaN);
    if (isValidSlideCount(n)) return { min: n, max: n };
  }

  return null;
}

/** Range → upper bound (8-10 → 10). Prefer `parseSlideCountSpec` for completion. */
export function parseSlideCountTarget(
  text: string | null | undefined,
  options?: { allowBareNumber?: boolean },
): number | null {
  return parseSlideCountSpec(text, options)?.max ?? null;
}

function visibleUserSlideCountSource(content: string): string {
  return (content.split(/\n\n\[Deliverable instruction\]/i)[0] ?? content)
    .split("[Template clone content fill]")[0]
    ?? content;
}

/**
 * User-facing requested count — not the first-fill stability cap.
 * An exact `5페이지` in the visible brief beats a quick-length range
 * (`6-8` auto / `5-6` short) written into the fill seed.
 */
export function extractRequestedSlideCountSpecFromMessages(
  messages: readonly ChatMessage[],
): SlideCountSpec | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "user") continue;
    const content = message.content ?? "";
    if (isAutoContinueIncompleteOutputPrompt(content)) continue;
    if (isSlideCountTopUpPrompt(content)) continue;

    const visible = visibleUserSlideCountSource(content);
    const fromVisible = parseSlideCountSpec(visible);
    const visibleIsExact = fromVisible != null && fromVisible.min === fromVisible.max;

    const requestedLine = content.match(USER_REQUESTED_SLIDE_COUNT_RE);
    const fromLine = requestedLine?.[1]
      ? parseSlideCountSpec(requestedLine[1], { allowBareNumber: true })
      : null;
    const lineIsRange = fromLine != null && fromLine.min !== fromLine.max;
    if (visibleIsExact && (lineIsRange || fromLine == null)) return fromVisible;
    if (fromLine != null) return fromLine;
    if (fromVisible != null) return fromVisible;

    const pluginMatch = content.match(SLIDE_COUNT_PLUGIN_INPUT_RE);
    if (pluginMatch?.[1] && !/stability cap/i.test(pluginMatch[1])) {
      const fromPlugin = parseSlideCountSpec(pluginMatch[1], { allowBareNumber: true });
      if (fromPlugin != null) return fromPlugin;
    }

    for (const line of content.split(/\r?\n/)) {
      const formMatch = line.match(SLIDE_COUNT_FORM_LABEL_RE);
      if (formMatch?.[1]) {
        const fromForm = parseSlideCountSpec(formMatch[1], { allowBareNumber: true });
        if (fromForm != null) return fromForm;
      }
    }
  }
  return null;
}

export function extractRequestedSlideCountTargetFromMessages(
  messages: readonly ChatMessage[],
): number | null {
  return extractRequestedSlideCountSpecFromMessages(messages)?.max ?? null;
}

export function shouldQueueSlideCountTopUp(input: {
  produced: number;
  requested: number | null;
  /** Range floor (`5-6` → 5). Exact counts omit this (min = requested). */
  requestedMin?: number | null;
  topUpCount: number;
  commentAttachmentCount?: number;
  hasIncompleteAssistant?: boolean;
  /** First fill / short draft: allow 1–2 slides and default to 6. */
  defaultRequested?: number;
}): boolean {
  if (input.hasIncompleteAssistant) return false;
  if ((input.commentAttachmentCount ?? 0) > 0) return false;
  const targetMax = input.requested ?? input.defaultRequested ?? null;
  const targetMin = input.requestedMin ?? input.requested ?? input.defaultRequested ?? null;
  if (targetMax == null || targetMin == null) return false;
  const minProduced = input.defaultRequested != null ? 1 : 3;
  if (!Number.isFinite(input.produced) || input.produced < minProduced) return false;
  if (input.topUpCount >= SLIDE_COUNT_TOP_UP_MAX_PER_CONVERSATION) return false;
  // Implicit default 6 is only for short first fills. A closed 5-page deck
  // already matches "short" / typed 5 — do not start a hidden follow-up.
  if (input.requested == null && input.produced >= 5) return false;
  return input.produced < targetMin;
}

export function slideCountTopUpAppendUntil(produced: number, requested: number): number {
  return Math.min(produced + SLIDE_COUNT_TOP_UP_BATCH, requested);
}

/**
 * Hidden top-up turns after a persistable first-fill, if each append honors
 * remaining-all (up to {@link SLIDE_COUNT_TOP_UP_BATCH}). Default 6 from a
 * 1–4 slide miss is one turn — a 3+3 split is a failed honor, not the plan.
 */
export function countHonoredSlideCountTopUpTurns(input: {
  produced: number;
  requested: number | null;
  requestedMin?: number | null;
  defaultRequested?: number;
}): number {
  let produced = input.produced;
  let topUpCount = 0;
  while (
    shouldQueueSlideCountTopUp({
      produced,
      requested: input.requested,
      requestedMin: input.requestedMin,
      defaultRequested: input.defaultRequested,
      topUpCount,
    })
  ) {
    const target = input.requested ?? input.defaultRequested;
    if (target == null) break;
    produced = slideCountTopUpAppendUntil(produced, target);
    topUpCount += 1;
  }
  return topUpCount;
}

export function buildSlideCountTopUpPrompt(input: {
  produced: number;
  requested: number;
}): string {
  const appendUntil = slideCountTopUpAppendUntil(input.produced, input.requested);
  const remaining = appendUntil - input.produced;
  return [
    SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL,
    `The current deck is a CLOSED ${input.produced}-slide deliverable.`,
    `The user requested ${input.requested} slides.`,
    `Keep slides 1–${input.produced} exactly as they are. Do not rewrite, restyle, delete, or collapse them.`,
    `APPEND only new slides ${input.produced + 1} through ${appendUntil} (inclusive).`,
    remaining > 3
      ? `Emit all ${remaining} remaining slides this turn — not a 3-slide batch. Stopping after 3 new slides is a failure.`
      : `Emit all ${remaining} remaining slides this turn.`,
    "This is an explicit slide-count expansion — not a redesign and not an incomplete-output retry.",
    "Do NOT rewrite the saved deck. Do NOT emit `<head>`, Motif `<svg>`, or copy existing slides.",
    "Emit ONLY the new `<section class=\"slide\">` blocks (body-first). Persist appends them after the saved slides.",
    "Each new slide MUST be a complete closed `<section class=\"slide\" …>…</section>` with real title + body. Unclosed fragments are discarded.",
    "Each new slide: fixed 1920×1080 canvas, box-sizing:border-box, overflow:visible, Motif-safe padding (~56px 72px).",
    "One idea per slide. Closing/checklist slides: title + at most 3 next steps. Never a 5-row numbered grid plus a side card. No overlapping position:absolute labels or sibling overlay badges such as \"05 / CHECKLIST\".",
    "Reuse the saved deck's kit card/list/timeline classes — do not invent 1–2px navy/blue outlined rectangles.",
    "Do not dump full Motif SVG/style sprites. Reuse the existing deck's lightweight motif/deco vocabulary after title/body copy when the saved deck exposes it; do not invent tiny corner flowers or off-template Capsule pills.",
    "Do not use element-patch. Do not start over from a short new deck.",
    "Increasing the slide count is required. Never reduce it.",
    "Reuse the existing deck's palette/fonts via inline styles on the new sections only.",
    "Each new slide needs a real title plus 2–4 concrete bullets or a real paragraph. No placeholders, no SLOT comments.",
    "Status tone: \"슬라이드 추가 중\" — NEVER \"수정 반영 중\" / \"Applying your edits\".",
    "Finish a closed `</artifact>` this turn.",
  ].join("\n");
}

import type { ChatMessage } from "../types";
import { isAutoContinueIncompleteOutputPrompt } from "../runtime/resume";

/** Home / prompt / top-up share this ceiling. One-turn 40-slide fills truncate. */
export const SLIDE_COUNT_REQUEST_MAX = 15;

/**
 * Hidden user-turn prefix so ChatPane can hide slide-count top-up loops
 * (same pattern as auto-continue incomplete-output).
 */
export const SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL = "<!--od:slide_count_top_up-->";

/** Analytics `entry_from` for the append loop — not incomplete-output recovery. */
export const SLIDE_COUNT_TOP_UP_ENTRY_FROM = "slide_count_top_up";

/** First fill stays short; two batches of 3 reach a 6–9 slide default. */
export const SLIDE_COUNT_TOP_UP_MAX_PER_CONVERSATION = 2;
export const SLIDE_COUNT_TOP_UP_BATCH = 3;

const USER_REQUESTED_SLIDE_COUNT_RE = /User requested slide count:\s*([^\n]+)/i;
const SLIDE_COUNT_PLUGIN_INPUT_RE =
  /\b(?:slideCount|slides|pageCount)\s*:\s*["']?([^"'\n]+)["']?/i;
const SLIDE_COUNT_FORM_LABEL_RE =
  /^\s*-\s*(?:슬라이드\s*분량|slide\s*count|Slide count|scale|slides?|pageCount)\s*:\s*(.+)$/i;

export function isSlideCountTopUpPrompt(content: string | null | undefined): boolean {
  const text = (content ?? "").trimStart();
  return text.startsWith(SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL);
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

/**
 * Range → upper bound (8-10 → 10). Ignores first-fill "stability cap" phrases
 * so a capped hint cannot become the user's target.
 */
export function parseSlideCountTarget(
  text: string | null | undefined,
  options?: { allowBareNumber?: boolean },
): number | null {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.。．]+$/u, "")
    .trim();
  if (!normalized || /stability cap/i.test(normalized)) return null;

  const range = normalized.match(/(\d{1,2})\s*[~\-–—]\s*(\d{1,2})/);
  if (range?.[1] && range[2]) {
    const lower = Number(range[1]);
    const upper = Number(range[2]);
    if (
      Number.isFinite(lower)
      && Number.isFinite(upper)
      && lower >= 1
      && upper >= lower
      && upper <= SLIDE_COUNT_REQUEST_MAX
    ) {
      return upper;
    }
  }

  const withUnit = normalized.match(
    /(?:정확히|exact(?:ly)?)\s*(\d{1,2})|(\d{1,2})\s*(?:장|slides?|pages?|페이지)/i,
  );
  const unitCount = Number(withUnit?.[1] || withUnit?.[2] || NaN);
  if (Number.isFinite(unitCount) && unitCount >= 1 && unitCount <= SLIDE_COUNT_REQUEST_MAX) {
    return unitCount;
  }

  if (options?.allowBareNumber) {
    const bare = normalized.match(/^(\d{1,2})$/);
    const n = Number(bare?.[1] || NaN);
    if (Number.isFinite(n) && n >= 1 && n <= SLIDE_COUNT_REQUEST_MAX) return n;
  }

  return null;
}

/**
 * User-facing requested count — not the first-fill stability cap.
 * Prefers the explicit `User requested slide count:` line written into Clone fill seeds.
 */
export function extractRequestedSlideCountTargetFromMessages(
  messages: readonly ChatMessage[],
): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "user") continue;
    const content = message.content ?? "";
    if (isAutoContinueIncompleteOutputPrompt(content)) continue;
    if (isSlideCountTopUpPrompt(content)) continue;

    const requestedLine = content.match(USER_REQUESTED_SLIDE_COUNT_RE);
    if (requestedLine?.[1]) {
      const fromLine = parseSlideCountTarget(requestedLine[1], { allowBareNumber: true });
      if (fromLine != null) return fromLine;
    }

    const pluginMatch = content.match(SLIDE_COUNT_PLUGIN_INPUT_RE);
    if (pluginMatch?.[1] && !/stability cap/i.test(pluginMatch[1])) {
      const fromPlugin = parseSlideCountTarget(pluginMatch[1], { allowBareNumber: true });
      if (fromPlugin != null) return fromPlugin;
    }

    for (const line of content.split(/\r?\n/)) {
      const formMatch = line.match(SLIDE_COUNT_FORM_LABEL_RE);
      if (formMatch?.[1]) {
        const fromForm = parseSlideCountTarget(formMatch[1], { allowBareNumber: true });
        if (fromForm != null) return fromForm;
      }
    }

    const visible = (content.split(/\n\n\[Deliverable instruction\]/i)[0] ?? content)
      .split("[Template clone content fill]")[0]
      ?? content;
    const fromVisible = parseSlideCountTarget(visible);
    if (fromVisible != null) return fromVisible;
  }
  return null;
}

export function shouldQueueSlideCountTopUp(input: {
  produced: number;
  requested: number | null;
  topUpCount: number;
  commentAttachmentCount?: number;
  hasIncompleteAssistant?: boolean;
  /** First fill / short draft: allow 1–2 slides and default to 6. */
  defaultRequested?: number;
}): boolean {
  if (input.hasIncompleteAssistant) return false;
  if ((input.commentAttachmentCount ?? 0) > 0) return false;
  const target = input.requested ?? input.defaultRequested ?? null;
  if (target == null) return false;
  const minProduced = input.defaultRequested != null ? 1 : 3;
  if (!Number.isFinite(input.produced) || input.produced < minProduced) return false;
  if (input.topUpCount >= SLIDE_COUNT_TOP_UP_MAX_PER_CONVERSATION) return false;
  return target > input.produced;
}

export function buildSlideCountTopUpPrompt(input: {
  produced: number;
  requested: number;
}): string {
  const appendUntil = Math.min(
    input.produced + SLIDE_COUNT_TOP_UP_BATCH,
    input.requested,
  );
  return [
    SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL,
    `The current deck is a CLOSED ${input.produced}-slide deliverable.`,
    `The user requested ${input.requested} slides.`,
    `Keep slides 1–${input.produced} exactly as they are. Do not rewrite, restyle, delete, or collapse them.`,
    `APPEND only new slides ${input.produced + 1} through ${appendUntil} (inclusive).`,
    "This is an explicit slide-count expansion — not a redesign and not an incomplete-output retry.",
    "Do NOT rewrite the saved deck. Do NOT emit `<head>`, Motif `<svg>`, or copy existing slides.",
    "Emit ONLY the new `<section class=\"slide\">` blocks (body-first). Persist appends them after the saved slides.",
    "Each new slide: fixed 1920×1080 canvas, box-sizing:border-box, overflow:hidden, Motif-safe padding (~56px 72px).",
    "Motif SVG is NOT required — official Motif is merged after save. Do not invent tiny corner flowers or Capsule pills.",
    "Do not use element-patch. Do not start over from a short new deck.",
    "Increasing the slide count is required. Never reduce it.",
    "Reuse the existing deck's palette/fonts via inline styles on the new sections only.",
    "Each new slide needs a real title plus 2–4 concrete bullets or a real paragraph. No placeholders, no SLOT comments.",
    "Status tone: \"슬라이드 추가 중\" — NEVER \"수정 반영 중\" / \"Applying your edits\".",
    "Finish a closed `</artifact>` this turn.",
  ].join("\n");
}

import { trimDeckHtmlToMaxSlides } from "@open-design/contracts";
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

/**
 * 루프468 — Thin LOOK seed / title-only scaffold must not use APPEND top-up.
 * Hidden rewrite turn replaces shells with a filled deck (prompt-fill lineage).
 */
export const THIN_PRIOR_FULL_REWRITE_PROMPT_SENTINEL = "[od:thin_prior_full_rewrite]";
export const THIN_PRIOR_FULL_REWRITE_ENTRY_FROM = "thin_prior_full_rewrite";
export const THIN_PRIOR_FULL_REWRITE_MAX_PER_CONVERSATION = 1;

/** One remaining-all batch finishes a default-6 miss; two batches cover 15. */
export const SLIDE_COUNT_TOP_UP_MAX_PER_CONVERSATION = 2;
export const SLIDE_COUNT_TOP_UP_BATCH = 6;
/** Live-stream busy retries before giving up on a scheduled top-up (loop408). */
export const SLIDE_COUNT_TOP_UP_BUSY_RETRY_MAX = 3;
export const SLIDE_COUNT_TOP_UP_BUSY_RETRY_MS = 900;

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

export function isThinPriorFullRewritePrompt(content: string | null | undefined): boolean {
  const text = (content ?? "").trimStart();
  if (!text) return false;
  return (
    text.startsWith(THIN_PRIOR_FULL_REWRITE_PROMPT_SENTINEL)
    || /\[od:thin_prior_full_rewrite\]|replace the thin look seed|rewrite the entire deck with real content/i.test(
      text,
    )
  );
}

export function countThinPriorFullRewriteAttemptsInConversation(
  messages: readonly ChatMessage[],
): number {
  return messages.filter(
    (message) => message.role === "user" && isThinPriorFullRewritePrompt(message.content),
  ).length;
}

/**
 * Hollow LOOK seed / title+empty scaffold: replace, do not APPEND top-up.
 * Host count ≥3 empty shells (or thin prior with ≥3 hosts).
 */
export function shouldQueueThinPriorFullRewrite(input: {
  hostCount: number;
  thinPrior: boolean;
  rewriteCount: number;
  commentAttachmentCount?: number;
}): boolean {
  if ((input.commentAttachmentCount ?? 0) > 0) return false;
  if (!input.thinPrior) return false;
  if (!Number.isFinite(input.hostCount) || input.hostCount < 3) return false;
  if (input.rewriteCount >= THIN_PRIOR_FULL_REWRITE_MAX_PER_CONVERSATION) return false;
  return true;
}

export function buildThinPriorFullRewritePrompt(input: {
  hostCount: number;
  requested?: number | null;
}): string {
  const target = input.requested && input.requested > 0
    ? input.requested
    : Math.min(Math.max(input.hostCount, 6), SLIDE_COUNT_REQUEST_MAX);
  return [
    THIN_PRIOR_FULL_REWRITE_PROMPT_SENTINEL,
    "The saved deck is a THIN LOOK seed / title-only scaffold — empty shells, not a closed deliverable.",
    "Do NOT append-only. Do NOT emit a slide-count expansion.",
    `REWRITE the entire deck with real presentation content (${target} slides).`,
    "Emit `<artifact type=\"deck\" identifier=\"deck\">` with a complete HTML document.",
    "Keep the selected template kit (palette, motif, neo/Block Frame chrome). Replace placeholder shells with filled slides.",
    "Every content slide needs a real title plus 2–4 concrete bullets/cards/paragraphs. No empty hosts.",
    "Cover title must be a product/topic name, not a raw URL crumb.",
    "Finish a closed `</html></artifact>` this turn.",
  ].join("\n");
}

/**
 * 루프480 — Slides that rendered but stopped short: a heading we had to
 * renumber down («4가지» with 3 cards) or a card whose body never arrived
 * («Enterprise / SSO»). The deck is a real deliverable, so this is a content
 * repair turn, not a thin-prior rewrite and not a slide-count expansion.
 */
export const SPARSE_CONTENT_TOP_UP_PROMPT_SENTINEL = "[od:sparse_content_top_up]";
export const SPARSE_CONTENT_TOP_UP_ENTRY_FROM = "sparse_content_top_up";
export const SPARSE_CONTENT_TOP_UP_MAX_PER_CONVERSATION = 1;
/** Below this the deck is thin everywhere — thin-prior rewrite owns it. */
export const SPARSE_CONTENT_TOP_UP_MAX_SLIDES = 4;

export function isSparseContentTopUpPrompt(content: string | null | undefined): boolean {
  const text = (content ?? "").trimStart();
  if (!text) return false;
  return (
    text.startsWith(SPARSE_CONTENT_TOP_UP_PROMPT_SENTINEL)
    || /\[od:sparse_content_top_up\]|slides below are missing items or card bodies/i.test(text)
  );
}

export function countSparseContentTopUpAttemptsInConversation(
  messages: readonly ChatMessage[],
): number {
  return messages.filter(
    (message) => message.role === "user" && isSparseContentTopUpPrompt(message.content),
  ).length;
}

export function shouldQueueSparseContentTopUp(input: {
  evidenceCount: number;
  slideCount: number;
  topUpCount: number;
  thinPrior: boolean;
  commentAttachmentCount?: number;
}): boolean {
  if ((input.commentAttachmentCount ?? 0) > 0) return false;
  // A hollow scaffold is not "almost done" — leave it to the full rewrite.
  if (input.thinPrior) return false;
  if (input.evidenceCount <= 0) return false;
  if (input.evidenceCount > SPARSE_CONTENT_TOP_UP_MAX_SLIDES) return false;
  if (!Number.isFinite(input.slideCount) || input.slideCount < 3) return false;
  if (input.topUpCount >= SPARSE_CONTENT_TOP_UP_MAX_PER_CONVERSATION) return false;
  return true;
}

/**
 * 루프481 — Ask for a `deck-patch` of the affected slides only.
 *
 * The first cut asked for a full deck re-emit, which is the exact operation
 * that stalls at ~3분 on a 7-slide kit deck: the model re-streams tens of KB
 * it already wrote, and any silence lands as a run failure on top of a deck
 * that was already saved fine. A patch carries only the slides with holes, so
 * the turn is seconds instead of minutes, and the client merges it into the
 * on-disk deck by `data-slide-index`.
 */
export function buildSparseContentTopUpPrompt(
  evidence: ReadonlyArray<{ slideIndex: number; reason: string; detail: string }>,
): string {
  const lines = evidence.map((item) => {
    const where = `data-slide-index="${item.slideIndex}"`;
    return item.reason === "heading_count_shortfall"
      ? `- ${where} (slide ${item.slideIndex + 1}): the heading promised more items than were emitted — ${item.detail}. Write the missing item(s) with the same card markup as its peers.`
      : `- ${where} (slide ${item.slideIndex + 1}): a card carries a title with no body — ${item.detail}. Write its 1–2 sentence body.`;
  });
  const indexes = evidence.map((item) => item.slideIndex).join(", ");
  return [
    SPARSE_CONTENT_TOP_UP_PROMPT_SENTINEL,
    "The saved deck is complete except that the slides below are missing items or card bodies.",
    ...lines,
    "Emit ONE patch artifact carrying ONLY those slides — never a full deck:",
    "`<artifact type=\"deck-patch\" identifier=\"deck\">`",
    `Inside it, one \`<section class="slide" data-slide-index="{N}">\` per listed slide (N = ${indexes}). Copy that slide's FULL outer HTML from the deck you just wrote — same classes, same inline styles, same kit palette — and fill only the missing item(s) or card body.`,
    "Close with `</artifact>` this turn. Do NOT emit `<artifact type=\"deck\">`, do NOT touch other slides, do NOT restyle or reword what is already fine.",
  ].join("\n");
}

/**
 * 루프481 — Hidden turns that only try to *improve* an already-saved deck.
 *
 * When one of these fails, the deliverable on disk is untouched and complete
 * enough to present. Painting the run-failure card (red banner + Retry dock)
 * tells the user their deck broke, which is false and is what the 2026-09-08
 * `AGENT_EXECUTION_FAILED` report looked like from the outside. Auto-continue
 * and the thin-prior rewrite are deliberately NOT in this set: there the saved
 * deck is incomplete or a hollow scaffold, so the failure is real news.
 */
export const SOFT_IMPROVEMENT_TURN_STATUS_CODE = "soft_improvement_turn_failed";

export function isSoftImprovementAutomationEntryFrom(
  entryFrom: string | null | undefined,
): boolean {
  const value = String(entryFrom ?? "").trim();
  return value === SLIDE_COUNT_TOP_UP_ENTRY_FROM
    || value === SPARSE_CONTENT_TOP_UP_ENTRY_FROM;
}

export function isSoftImprovementAutomationPrompt(
  content: string | null | undefined,
): boolean {
  return isSlideCountTopUpPrompt(content) || isSparseContentTopUpPrompt(content);
}

/** User-facing notice when an improvement turn failed but the deck survived. */
export function formatSoftImprovementTurnFailureNotice(): string {
  return "슬라이드 보완을 마치지 못했지만, 저장된 슬라이드는 그대로 유지됩니다. 더 채우고 싶으면 다시 요청해 주세요.";
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
    .split(/\[Template clone (?:content fill|prompt fill)\]/i)[0]
    // Seed/meta line is handled separately via USER_REQUESTED_SLIDE_COUNT_RE.
    .replace(/^User requested slide count:.*$/gmi, "");
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

    // 루프395 — brief-only persist drops "User requested slide count"; honor
    // the fill/Quick-settings hint stored on runContext.
    const fromRunContext = message.runContext?.slideCountHint
      ? parseSlideCountSpec(String(message.runContext.slideCountHint), { allowBareNumber: true })
      : null;

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
    if (fromRunContext != null) return fromRunContext;

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

/**
 * Hard persist/prompt ceiling for explicit 1–10 honors.
 * 8–10 → 10. 12–15 stays uncapped here (11+ first-fill + top-up).
 */
export function honorSlideCountCeiling(
  spec: SlideCountSpec | null | undefined,
): number | null {
  if (!spec) return null;
  if (spec.max >= 11) return null;
  if (spec.max >= 1 && spec.max <= 10) return spec.max;
  return null;
}

export function honorSlideCountCeilingFromMessages(
  messages: readonly ChatMessage[],
): number | null {
  return honorSlideCountCeiling(extractRequestedSlideCountSpecFromMessages(messages));
}

/**
 * Persist-time hard cap. Honor 1–10 trims overshoot (8–10 → 10).
 * 11+ stays uncapped. Clone first-fill with no spec cannot land 15.
 * Top-up turns never use the unspecified-6 cap (they append toward the request).
 */
export function applyHonorSlideCeilingToHtml(
  html: string,
  messages: readonly ChatMessage[],
  options?: { firstFill?: boolean },
): string {
  const spec = extractRequestedSlideCountSpecFromMessages(messages);
  const honor = honorSlideCountCeiling(spec);
  if (honor != null) return trimDeckHtmlToMaxSlides(html, honor);
  if (spec && spec.max >= 11) return html;
  const isTopUp = messages.some(
    (message) => message.role === "user" && isSlideCountTopUpPrompt(message.content),
  );
  if (isTopUp) return html;
  if (options?.firstFill) return trimDeckHtmlToMaxSlides(html, 6);
  return html;
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

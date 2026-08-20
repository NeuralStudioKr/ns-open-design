/**
 * Shared Canvas / Home create-slides user-visible lead lines.
 * Keep these in one place so naming, fill seeds, and run prompts cannot drift.
 *
 * Prompt may be empty — never imply the user typed a request or attached files
 * unless that is actually true.
 */

/** User-visible first message when Canvas / Drive / files are attached. */
export const CANVAS_CREATE_SLIDES_PROMPT =
  '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.';

/**
 * Home freeform with a typed request but no attachments.
 * Prefer the raw user text as the lead when present; this is a fallback only.
 */
export const HOME_CREATE_SLIDES_PROMPT =
  '요청한 내용으로 슬라이드 덱을 만들어줘.';

/**
 * No user text and no attachments (template / quick-settings only).
 * Must not say 「요청한 내용」 or 「첨부한 자료」.
 */
export const HOME_EMPTY_CREATE_SLIDES_PROMPT =
  '슬라이드 덱을 만들어줘.';

/** Fallback visible line for template-clone content-fill when topic is missing. */
export const HOME_FILL_SLIDES_PROMPT =
  '슬라이드 내용을 채워줘.';

/** @deprecated kept for boilerplate detection of older seeds */
export const HOME_FILL_SLIDES_PROMPT_LEGACY =
  '요청한 내용으로 슬라이드 내용을 채워줘.';

/** True when a brief line implies real attached Canvas/Drive/files (not User instruction echo). */
export function briefLooksLikeAttachedSource(brief: string | null | undefined): boolean {
  const text = String(brief ?? '').trim();
  if (!text) return false;
  return (
    /\b(?:Canvas title|Drive source|Attachments?|Source preview|Visible headings|Canvas sections)\b/i.test(text)
    || /\b(?:file:|drive:|refs\/)/i.test(text)
  );
}

/**
 * Resolve the user-visible lead line for create-slides.
 * - attachments → 첨부한 자료…
 * - typed user text → that text
 * - neither → 슬라이드 덱을 만들어줘. (never 「요청한 내용」)
 */
export function resolveCreateSlidesLead(options: {
  hasSourceMaterial: boolean;
  userInstruction?: string | null;
}): string {
  if (options.hasSourceMaterial) return CANVAS_CREATE_SLIDES_PROMPT;
  const user = String(options.userInstruction ?? '').trim();
  if (user) return user;
  return HOME_EMPTY_CREATE_SLIDES_PROMPT;
}

/** Canvas/Home create-slides scaffolding — never use as project/conversation/slide title. */
export function isSlideCreateBoilerplateLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) return true;
  if (normalized === CANVAS_CREATE_SLIDES_PROMPT) return true;
  if (normalized === HOME_CREATE_SLIDES_PROMPT) return true;
  if (normalized === HOME_EMPTY_CREATE_SLIDES_PROMPT) return true;
  if (normalized === HOME_FILL_SLIDES_PROMPT) return true;
  if (normalized === HOME_FILL_SLIDES_PROMPT_LEGACY) return true;
  if (/^첨부(?:한)?\s*.+\s*바탕으로\s*슬라이드\s*(?:덱|내용)을?\s*(?:만들어|채워)\s*줘\.?$/u.test(normalized)) {
    return true;
  }
  if (/^요청한\s*내용으로\s*슬라이드\s*(?:덱|내용)을?\s*(?:만들어|채워)\s*줘\.?$/u.test(normalized)) {
    return true;
  }
  if (/^슬라이드\s*(?:덱|내용)을?\s*(?:만들어|채워)\s*줘\.?$/u.test(normalized)) {
    return true;
  }
  if (/^new slide deck$/i.test(normalized)) return true;
  if (/^the (?:attached source document|user brief)$/i.test(normalized)) return true;
  if (/^presentation$/i.test(normalized)) return true;
  return false;
}

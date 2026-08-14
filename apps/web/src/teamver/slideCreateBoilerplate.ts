/**
 * Shared Canvas / Home create-slides user-visible lead lines.
 * Keep these in one place so naming, fill seeds, and run prompts cannot drift.
 */

/** User-visible first message when Canvas / Drive / files are attached. */
export const CANVAS_CREATE_SLIDES_PROMPT =
  '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.';

/** User-visible first message for Home freeform create with no attachments. */
export const HOME_CREATE_SLIDES_PROMPT =
  '요청한 내용으로 슬라이드 덱을 만들어줘.';

/** Fallback visible line for template-clone content-fill when topic is missing. */
export const HOME_FILL_SLIDES_PROMPT =
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

/** Canvas/Home create-slides scaffolding — never use as project/conversation/slide title. */
export function isSlideCreateBoilerplateLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) return true;
  if (normalized === CANVAS_CREATE_SLIDES_PROMPT) return true;
  if (normalized === HOME_CREATE_SLIDES_PROMPT) return true;
  if (normalized === HOME_FILL_SLIDES_PROMPT) return true;
  if (/^첨부(?:한)?\s*.+\s*바탕으로\s*슬라이드\s*(?:덱|내용)을?\s*(?:만들어|채워)\s*줘\.?$/u.test(normalized)) {
    return true;
  }
  if (/^요청한\s*내용으로\s*슬라이드\s*(?:덱|내용)을?\s*(?:만들어|채워)\s*줘\.?$/u.test(normalized)) {
    return true;
  }
  if (/^new slide deck$/i.test(normalized)) return true;
  if (/^the (?:attached source document|user brief)$/i.test(normalized)) return true;
  if (/^presentation$/i.test(normalized)) return true;
  return false;
}

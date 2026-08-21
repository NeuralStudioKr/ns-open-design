import {
  deckHtmlHasMotifOutsideCanvasHang,
  firstOfficialDeckTemplateId,
  looksLikeDeckSlideHostAttrs,
  OFFICIAL_DECK_LOOK_STYLE_ATTR,
} from '@open-design/contracts';
import { fetchTeamverDaemon } from './teamverDaemonHeaders';
import { mergeOfficialLookCssForTemplate } from './fetchPluginLocalSkill';

/**
 * True when preview HTML still has pre-§0.62 / pre-v34 Daisy Motif stamps
 * that only remmerge (official example pack) can restamp — stacking neutralize
 * alone is not enough. Also catches cross-template Motif hang CSS (§0.75–§0.83).
 */
export function deckHtmlNeedsOfficialMotifRemerge(html: string): boolean {
  const dest = String(html ?? '');
  // Daisy overscale / hang (pre-§0.62 / pre-v34 stamps).
  if (/deco-daisy/i.test(dest)) {
    if (/deco-daisy[^>]*width\s*:\s*(?:1[5-9]|[2-9]\d+)\s*%/i.test(dest)) return true;
    if (/deco-daisy[^>]*width\s*:\s*(?:2[5-9]\d|[3-9]\d{2}|\d{4,})\s*px/i.test(dest)) return true;
    if (/deco-daisy[^>]*(?:top|left|right|bottom)\s*:\s*-\d/i.test(dest)) return true;
  }
  // Shared Motif hang SSOT with persist sanitize (§0.83).
  return deckHtmlHasMotifOutsideCanvasHang(dest);
}

const OFFICIAL_LOOK_STYLE_RE = new RegExp(
  `<style\\b[^>]*\\b${OFFICIAL_DECK_LOOK_STYLE_ATTR}\\b`,
  'i',
);

/**
 * Compact fills stream without official look CSS (persist merges after save).
 * Preview used to stay Neutral until disk write — heal display-only when the
 * look sheet is missing, or when Motif still needs remmerge.
 */
function htmlLooksLikeOfficialLookPreviewHost(html: string): boolean {
  if (/<deck-stage\b/i.test(html)) return true;
  for (const match of html.matchAll(/<(?:section|div|main|article)\b([^>]*)>/gi)) {
    if (looksLikeDeckSlideHostAttrs(match[1] ?? '')) return true;
  }
  return false;
}

export function deckHtmlNeedsOfficialLookPreviewHeal(html: string): boolean {
  const dest = String(html ?? '');
  if (deckHtmlNeedsOfficialMotifRemerge(dest)) return true;
  // Compact fills copy Creative Mode / editorial hosts as
  // `class="s1" data-screen-label="01 Title"` without `class="slide"`.
  // Those still need the persist look sheet on live preview.
  if (!htmlLooksLikeOfficialLookPreviewHost(dest)) return false;
  return !OFFICIAL_LOOK_STYLE_RE.test(dest);
}

/**
 * Preview-only official look / Motif remmerge (same template resolve as
 * HTML export fallback). Does not write disk — callers keep the healed
 * string in display state.
 */
export async function healOfficialLookForDeckPreview(
  html: string,
  projectId: string,
): Promise<string> {
  const dest = String(html ?? '');
  const id = String(projectId ?? '').trim();
  if (!dest.trim() || !id || !deckHtmlNeedsOfficialLookPreviewHeal(dest)) return dest;
  try {
    const resp = await fetchTeamverDaemon(`/api/projects/${encodeURIComponent(id)}`);
    if (!resp.ok) return dest;
    const json = (await resp.json()) as {
      metadata?: {
        selectedDeckTemplateId?: string;
        skillIds?: unknown;
        context?: { skillIds?: unknown };
      };
    };
    const templateId = firstOfficialDeckTemplateId(
      json.metadata?.selectedDeckTemplateId,
      json.metadata?.skillIds,
      json.metadata?.context?.skillIds,
    );
    if (!templateId) return dest;
    return mergeOfficialLookCssForTemplate(dest, templateId);
  } catch {
    return dest;
  }
}

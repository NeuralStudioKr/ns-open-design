import {
  firstOfficialDeckTemplateId,
  OFFICIAL_DECK_LOOK_STYLE_ATTR,
} from '@open-design/contracts';
import { fetchTeamverDaemon } from './teamverDaemonHeaders';
import { mergeOfficialLookCssForTemplate } from './fetchPluginLocalSkill';

/**
 * True when preview HTML still has pre-§0.62 / pre-v34 Daisy Motif stamps
 * that only remmerge (official example pack) can restamp — stacking neutralize
 * alone is not enough. Also catches Graphify/XHS Motif hang CSS (§0.75).
 */
export function deckHtmlNeedsOfficialMotifRemerge(html: string): boolean {
  const dest = String(html ?? '');
  // Daisy overscale / hang (pre-§0.62 / pre-v34 stamps).
  if (/deco-daisy/i.test(dest)) {
    if (/deco-daisy[^>]*width\s*:\s*(?:1[5-9]|[2-9]\d+)\s*%/i.test(dest)) return true;
    if (/deco-daisy[^>]*width\s*:\s*(?:2[5-9]\d|[3-9]\d{2}|\d{4,})\s*px/i.test(dest)) return true;
    if (/deco-daisy[^>]*(?:top|left|right|bottom)\s*:\s*-\d/i.test(dest)) return true;
  }
  // Broader Motif hang CSS / inline (Graphify orbs, XHS blobs, geo, etc.).
  if (
    /\.(?:deco-daisy|deco-star|sunglow|cover-blob|cover-decoration|geo-decoration|xp-blob|gd-orb|post-it|petal|pin-|doodle-|zigzag-deco)[^{]*\{[^}]*(?:top|left|right|bottom)\s*:\s*-\d/i.test(dest)
  ) {
    return true;
  }
  if (
    /<(?:div|span)[^>]*\bclass\s*=\s*["'][^"']*(?:deco-daisy|deco-star|sunglow|cover-blob|geo-decoration|xp-blob|gd-orb|post-it|petal|pin-|doodle-)[^"']*["'][^>]*(?:top|left|right|bottom)\s*:\s*-\d/i.test(dest)
  ) {
    return true;
  }
  return false;
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
export function deckHtmlNeedsOfficialLookPreviewHeal(html: string): boolean {
  const dest = String(html ?? '');
  if (deckHtmlNeedsOfficialMotifRemerge(dest)) return true;
  if (!/\bclass\s*=\s*['"][^'"]*\bslide\b|<deck-stage\b/i.test(dest)) return false;
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

/** Same display-only merge — keep the Motif-era name for export callers. */
export const healOfficialMotifForDeckPreview = healOfficialLookForDeckPreview;

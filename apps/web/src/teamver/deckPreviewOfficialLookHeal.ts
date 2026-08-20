import { firstOfficialDeckTemplateId } from '@open-design/contracts';
import { fetchTeamverDaemon } from './teamverDaemonHeaders';
import { mergeOfficialLookCssForTemplate } from './fetchPluginLocalSkill';

/**
 * True when preview HTML still has pre-§0.62 / pre-v34 Daisy Motif stamps
 * that only remmerge (official example pack) can restamp — stacking neutralize
 * alone is not enough.
 */
export function deckHtmlNeedsOfficialMotifRemerge(html: string): boolean {
  const dest = String(html ?? '');
  if (!/deco-daisy/i.test(dest)) return false;
  // Percent overscale (15%+) — official band is ~9.5–14%.
  if (/deco-daisy[^>]*width\s*:\s*(?:1[5-9]|[2-9]\d+)\s*%/i.test(dest)) return true;
  // Pixel overscale (>240px) — official paint is ~100–240px.
  if (/deco-daisy[^>]*width\s*:\s*(?:2[5-9]\d|[3-9]\d{2}|\d{4,})\s*px/i.test(dest)) return true;
  // Outside-canvas hangs clip under letterbox overflow:hidden (§0.71).
  if (/deco-daisy[^>]*(?:top|left|right|bottom)\s*:\s*-\d/i.test(dest)) return true;
  return false;
}

/**
 * Preview-only Motif remmerge (same template resolve as HTML export fallback).
 * Does not write disk — callers keep the healed string in display state.
 */
export async function healOfficialMotifForDeckPreview(
  html: string,
  projectId: string,
): Promise<string> {
  const dest = String(html ?? '');
  const id = String(projectId ?? '').trim();
  if (!dest.trim() || !id || !deckHtmlNeedsOfficialMotifRemerge(dest)) return dest;
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

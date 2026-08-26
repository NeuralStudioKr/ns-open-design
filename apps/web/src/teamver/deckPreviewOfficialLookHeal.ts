import {
  deckHtmlHasMotifOutsideCanvasHang,
  firstOfficialDeckTemplateId,
  healOfficialMagazineLayoutDensity,
  isArtifactHtmlStableForPreview,
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

/** Debounce streaming look heals so token-stable snapshots do not thrash srcDoc. */
export const OFFICIAL_LOOK_STREAMING_HEAL_DEBOUNCE_MS = 400;

/**
 * Streaming look heal may run before `</body></html>` once at least one
 * titled slide host is closed. Mid-heading truncations stay Neutral.
 */
function htmlHasClosedTitledSlideHost(html: string): boolean {
  const dest = String(html ?? '');
  const re = /<(section|div|main|article)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(dest)) !== null) {
    const attrs = match[2] ?? '';
    if (
      !looksLikeDeckSlideHostAttrs(attrs)
      && !/\bdata-screen-label\s*=/.test(attrs)
    ) {
      continue;
    }
    if (/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/i.test(match[3] ?? '')) return true;
  }
  return false;
}

function streamingSnapshotReadyForOfficialLookHeal(html: string): boolean {
  if (isArtifactHtmlStableForPreview(html)) return true;
  if (!htmlHasClosedTitledSlideHost(html)) return false;
  const styleOpens = (html.match(/<style\b/gi) ?? []).length;
  const styleCloses = (html.match(/<\/style>/gi) ?? []).length;
  if (styleOpens > styleCloses) return false;
  const scriptOpens = (html.match(/<script\b/gi) ?? []).length;
  const scriptCloses = (html.match(/<\/script>/gi) ?? []).length;
  return scriptOpens <= scriptCloses;
}

/**
 * Gate for FileViewer live preview look heal (§1.21).
 * §0.76 skipped all streaming heals; generation then looked Neutral until
 * persist. Allow heal once a titled slide host is closed — do not wait for
 * the full `</body></html>` if look CSS / Motif remmerge is still missing.
 */
export function shouldApplyOfficialLookPreviewHeal(
  html: string,
  options?: { streaming?: boolean },
): boolean {
  const dest = String(html ?? '');
  if (!dest.trim() || !deckHtmlNeedsOfficialLookPreviewHeal(dest)) return false;
  if (options?.streaming && !streamingSnapshotReadyForOfficialLookHeal(dest)) return false;
  return true;
}

/** Prefer healed HTML only when it was produced for this exact live source. */
export function pickOfficialLookHealedPreviewSource(options: {
  livePreviewSource: string | null | undefined;
  healedPreview: string | null | undefined;
  healedForSource: string | null | undefined;
}): string | null {
  const live = options.livePreviewSource ?? null;
  if (!live) return null;
  const healed = options.healedPreview ?? null;
  if (healed && options.healedForSource === live) return healed;
  return live;
}

const projectTemplateIdCache = new Map<string, string | null>();

/** Test helper — clear project→templateId memo between cases. */
export function clearOfficialLookPreviewTemplateIdCache(): void {
  projectTemplateIdCache.clear();
}

async function resolveProjectDeckTemplateId(projectId: string): Promise<string | null> {
  const id = String(projectId ?? '').trim();
  if (!id) return null;
  if (projectTemplateIdCache.has(id)) return projectTemplateIdCache.get(id) ?? null;
  try {
    const resp = await fetchTeamverDaemon(`/api/projects/${encodeURIComponent(id)}`);
    if (!resp.ok) {
      projectTemplateIdCache.set(id, null);
      return null;
    }
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
    projectTemplateIdCache.set(id, templateId);
    return templateId;
  } catch {
    return null;
  }
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
    const templateId = await resolveProjectDeckTemplateId(id);
    if (!templateId) return dest;
    const withLook = await mergeOfficialLookCssForTemplate(dest, templateId);
    try {
      return healOfficialMagazineLayoutDensity(withLook);
    } catch {
      return withLook;
    }
  } catch {
    return dest;
  }
}

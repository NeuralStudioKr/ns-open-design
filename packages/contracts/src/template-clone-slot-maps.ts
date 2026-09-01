/**
 * Per-template Clone slot maps (0901-N02-C2).
 *
 * Common fillAndTrimCardPeers defaults still apply; maps only *add*
 * host/peer class tokens and optional fingerprints when templateId is known
 * or the LOOK seed HTML matches.
 */

export type TemplateCloneSlotMap = {
  /** Stable plugin / template ids (exact, suffix, or path segment). */
  ids: readonly string[];
  /** Optional HTML fingerprint when metadata templateId is missing. */
  fingerprint?: RegExp;
  /** Extra card-grid host class tokens (e.g. timeline-wrap). */
  hostClasses: readonly string[];
  /** Extra card peer class tokens (e.g. day-card, timeline-card). */
  peerClasses: readonly string[];
};

/** Daisy Days — pastel deck with info / weekly / timeline card peers. */
export const DAISY_DAYS_SLOT_MAP: TemplateCloneSlotMap = {
  ids: [
    'example-html-ppt-zhangzara-daisy-days',
    'html-ppt-zhangzara-daisy-days',
  ],
  fingerprint: /\b(?:slide-cards|slide-weekly|weekly-grid|deco-daisy)\b[\s\S]{0,8000}?\b(?:info-card|day-card)\b/i,
  hostClasses: ['cards-grid', 'weekly-grid', 'timeline-wrap'],
  // timeline-row wraps timeline-card in Daisy markup — treat the row as peer.
  peerClasses: ['info-card', 'day-card', 'timeline-card', 'timeline-row'],
};

export const TEMPLATE_CLONE_SLOT_MAPS: readonly TemplateCloneSlotMap[] = [
  DAISY_DAYS_SLOT_MAP,
];

function normalizeTemplateId(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
}

function idMatchesMap(normalizedId: string, mapId: string): boolean {
  const target = normalizeTemplateId(mapId);
  if (!normalizedId || !target) return false;
  if (normalizedId === target) return true;
  if (normalizedId.endsWith(`/${target}`)) return true;
  const bare = normalizedId.split('/').filter(Boolean).pop() ?? normalizedId;
  return bare === target;
}

/**
 * Resolve a template slot map by plugin id, then HTML fingerprint.
 * Returns null when only common C defaults should apply.
 */
export function resolveTemplateCloneSlotMap(input: {
  templateId?: string | null;
  html?: string | null;
}): TemplateCloneSlotMap | null {
  const id = normalizeTemplateId(input.templateId);
  if (id) {
    for (const map of TEMPLATE_CLONE_SLOT_MAPS) {
      if (map.ids.some((mapId) => idMatchesMap(id, mapId))) return map;
    }
  }
  const html = String(input.html ?? '');
  if (!html.trim()) return null;
  for (const map of TEMPLATE_CLONE_SLOT_MAPS) {
    if (map.fingerprint?.test(html)) return map;
  }
  return null;
}

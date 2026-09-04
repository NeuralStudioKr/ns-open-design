/**
 * Per-template Clone slot maps (0901-N02-C2/C3).
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

function mapOf(
  ids: readonly string[],
  hostClasses: readonly string[],
  peerClasses: readonly string[],
  fingerprint?: RegExp,
): TemplateCloneSlotMap {
  return fingerprint
    ? { ids, hostClasses, peerClasses, fingerprint }
    : { ids, hostClasses, peerClasses };
}

/** Daisy Days — pastel deck with info / weekly / timeline card peers. */
export const DAISY_DAYS_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-zhangzara-daisy-days', 'html-ppt-zhangzara-daisy-days'],
  ['cards-grid', 'weekly-grid', 'timeline-wrap'],
  ['info-card', 'day-card', 'timeline-card', 'timeline-row'],
  /\b(?:slide-cards|slide-weekly|weekly-grid|deco-daisy)\b[\s\S]{0,8000}?\b(?:info-card|day-card)\b/i,
);

export const BLOCK_FRAME_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-zhangzara-block-frame', 'html-ppt-zhangzara-block-frame'],
  ['stats-grid', 'team-grid', 'cards-row', 'feature-grid'],
  ['stat-card', 'feature-card', 'team-card', 'intro-card'],
  /\b(?:stats-grid|team-grid|cards-row)\b[\s\S]{0,4000}?\b(?:stat-card|team-card|feature-card|intro-card)\b/i,
);

export const PRODUCT_LAUNCH_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-product-launch', 'html-ppt-product-launch'],
  ['grid', 'g3', 'pricing-grid', 'feature-grid'],
  ['feature-card', 'price-card', 'pricing-card', 'card'],
  /\btpl-product-launch\b[\s\S]{0,8000}?\b(?:price-card|feature-card)\b/i,
);

export const BLUE_PROFESSIONAL_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-zhangzara-blue-professional', 'html-ppt-zhangzara-blue-professional'],
  ['metrics-row', 'stats-grid'],
  ['metric-card', 'stat-card'],
  /\bmetrics-row\b[\s\S]{0,4000}?\bmetric-card\b/i,
);

export const CAPSULE_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-zhangzara-capsule', 'html-ppt-zhangzara-capsule'],
  ['cards-grid'],
  ['pillar-card', 'card'],
  /\bpillar-card\b/i,
);

export const BOLD_POSTER_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-zhangzara-bold-poster', 'html-ppt-zhangzara-bold-poster'],
  ['slide-pillars'],
  ['pillar'],
  /\bslide-pillars\b|\bpillar\b[\s\S]{0,200}?\bpillar\b/i,
);

export const PITCH_DECK_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-pitch-deck', 'html-ppt-pitch-deck'],
  ['grid', 'g3'],
  ['team-card', 'card'],
  /\btpl-pitch-deck\b[\s\S]{0,8000}?\b(?:team-card|class=["']card)\b/i,
);

export const PLAYFUL_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-zhangzara-playful', 'html-ppt-zhangzara-playful'],
  ['team-grid'],
  ['team-card'],
  /\bteam-grid\b[\s\S]{0,4000}?\bteam-card\b/i,
);

export const EIGHT_BIT_ORBIT_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-zhangzara-8-bit-orbit', 'html-ppt-zhangzara-8-bit-orbit'],
  ['feature-grid'],
  ['feature-card'],
  /\bfeature-grid\b[\s\S]{0,4000}?\bfeature-card\b/i,
);

export const MAT_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-zhangzara-mat', 'html-ppt-zhangzara-mat'],
  ['cards-grid', 'cover-bottom'],
  ['info-card'],
  /\binfo-card\b/i,
);

/**
 * 루프459 — Cobalt Grid ("Field Office Quarterly") — index/table row peers.
 * The template uses `.list .row` and `.ledger .row` as its card / table
 * hosts. Without this map, only the first row gets filled; the rest keep
 * `Slow software / Domestic interfaces / Hand-set print / …` demo copy.
 */
export const COBALT_GRID_SLOT_MAP: TemplateCloneSlotMap = mapOf(
  ['example-html-ppt-zhangzara-cobalt-grid', 'html-ppt-zhangzara-cobalt-grid'],
  ['list', 'ledger'],
  ['row'],
  /\b(?:s-index|s-table)\b[\s\S]{0,4000}?\brow\b/i,
);

export const TEMPLATE_CLONE_SLOT_MAPS: readonly TemplateCloneSlotMap[] = [
  DAISY_DAYS_SLOT_MAP,
  BLOCK_FRAME_SLOT_MAP,
  PRODUCT_LAUNCH_SLOT_MAP,
  BLUE_PROFESSIONAL_SLOT_MAP,
  CAPSULE_SLOT_MAP,
  BOLD_POSTER_SLOT_MAP,
  PITCH_DECK_SLOT_MAP,
  PLAYFUL_SLOT_MAP,
  EIGHT_BIT_ORBIT_SLOT_MAP,
  MAT_SLOT_MAP,
  COBALT_GRID_SLOT_MAP,
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

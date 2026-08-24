import type { InstalledPluginRecord } from '@open-design/contracts';

const DECK_ID_RE = /html-ppt|canvas-slide|deck-template|\bppt-/i;

function readOdTags(od: { tags?: unknown } | undefined): string[] {
  return Array.isArray(od?.tags) ? od.tags.map((tag) => String(tag).toLowerCase()) : [];
}

function normalizeOdMode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const mode = value.trim().toLowerCase();
  return mode || undefined;
}

export function looksLikeDeckGalleryIdentity(
  record: Pick<InstalledPluginRecord, 'id' | 'manifest'>,
): boolean {
  const od = record.manifest?.od as { tags?: unknown } | undefined;
  const tags = [
    ...(record.manifest?.tags ?? []).map((tag) => tag.toLowerCase()),
    ...readOdTags(od),
  ];
  const id = `${record.id ?? ''} ${record.manifest?.id ?? ''}`;
  return (
    tags.includes('html-ppt')
    || tags.includes('deck')
    || tags.includes('canvas-slide')
    || DECK_ID_RE.test(id)
  );
}

/**
 * 16:9 thumbs (Community deck grid, plus-menu, Canvas picker) must not
 * prefer the 1.31 baked hover-pan clip — that clip letterboxes inside
 * the 1920 isolation frame. HomeHero tiles stay on `preferBaked: true`
 * because those presets are still 1.31.
 */
export function shouldPreferBakedGalleryClip(
  record: Pick<InstalledPluginRecord, 'id' | 'manifest'>,
): boolean {
  return !looksLikeDeckGalleryIdentity(record);
}

/**
 * Gallery / plus-menu thumbs key 16:9 isolation framing off `data-od-mode="deck"`.
 * Official catalog skills set `manifest.od.mode`, but community html-ppt rows
 * sometimes omit it or ship `mode: html`. Without the deck attribute they fall
 * through to the tall 1440×2200 hover-pan recipe and look cropped.
 */
export function resolveGalleryOdMode(
  record: Pick<InstalledPluginRecord, 'id' | 'manifest'>,
  explicitMode?: unknown,
): string | undefined {
  if (looksLikeDeckGalleryIdentity(record)) return 'deck';
  return normalizeOdMode(explicitMode)
    ?? normalizeOdMode((record.manifest?.od as { mode?: unknown } | undefined)?.mode);
}
